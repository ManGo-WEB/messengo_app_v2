import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GET as health } from "../../src/app/api/health/route";
import { getDb } from "../../src/server/db/client";
import { registerOutboxHandler } from "../../src/worker/handlers";
import { HEARTBEAT_ID, MAX_ATTEMPTS, processNextDueJob, writeHeartbeat } from "../../src/worker/loop";
import { db, resetDb } from "./helpers";

const db0 = getDb();

async function seedOutboxJob(type: string) {
  const organization = await db.organization.create({ data: { name: "Тест-организация" } });
  const connection = await db.channelConnection.create({
    data: { organizationId: organization.id, type: "TESTING", externalId: "test-conn" },
  });
  const contact = await db.contact.create({
    data: { organizationId: organization.id, connectionId: connection.id, externalId: "contact-1" },
  });
  const conversation = await db.conversation.create({
    data: { organizationId: organization.id, connectionId: connection.id, contactId: contact.id },
  });
  const message = await db.message.create({
    data: { organizationId: organization.id, conversationId: conversation.id, direction: "OUT", text: "Проверка" },
  });
  const job = await db.outboxJob.create({
    data: { organizationId: organization.id, messageId: message.id, type },
  });
  return { job, message };
}

beforeAll(resetDb);
afterAll(async () => {
  await db.$disconnect();
});

describe("Outbox: успешная отправка", () => {
  test("echo-задание: job SENT, message SENT, SendAttempt создан", async () => {
    const { job, message } = await seedOutboxJob("echo");
    expect(await processNextDueJob()).toBe(true);
    const done = await db.outboxJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done.status).toBe("SENT");
    expect(await db.message.findUniqueOrThrow({ where: { id: message.id } }).then((m) => m.status)).toBe("SENT");
    const attempts = await db.sendAttempt.findMany({ where: { outboxJobId: job.id } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].result).toBe("SENT");
    // due-заданий больше нет
    expect(await processNextDueJob()).toBe(false);
  });
});

describe("Outbox: ошибки и ретраи", () => {
  test("падающий обработчик: экспоненциальные ретраи, 5 попыток → FAILED", async () => {
    registerOutboxHandler("failing-test", async () => {
      throw new Error("канал недоступен (тест)");
    });
    const { job, message } = await seedOutboxJob("failing-test");

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      expect(await processNextDueJob()).toBe(true);
      const current = await db.outboxJob.findUniqueOrThrow({ where: { id: job.id } });
      if (attempt < MAX_ATTEMPTS) {
        expect(current.status).toBe("PENDING");
        expect(current.attempts).toBe(attempt);
        expect(current.lastError).toContain("канал недоступен");
        // проматываем время: due-задание снова доступно
        await db.outboxJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      } else {
        expect(current.status).toBe("FAILED");
        expect(current.attempts).toBe(MAX_ATTEMPTS);
      }
    }

    expect(await db.message.findUniqueOrThrow({ where: { id: message.id } }).then((m) => m.status)).toBe("FAILED");
    const attempts = await db.sendAttempt.findMany({ where: { outboxJobId: job.id }, orderBy: { createdAt: "asc" } });
    expect(attempts).toHaveLength(MAX_ATTEMPTS);
    expect(attempts.every((a) => a.result === "FAILED")).toBe(true);
  });

  test("задержки ретраев растут экспоненциально (1→2→4→8 мин)", async () => {
    const { job } = await seedOutboxJob("failing-test");
    const before = Date.now();
    for (let attempt = 1; attempt <= 4; attempt++) {
      await processNextDueJob();
      const current = await db.outboxJob.findUniqueOrThrow({ where: { id: job.id } });
      const expectedDelay = 60_000 * 2 ** (attempt - 1);
      const actualDelay = current.nextAttemptAt!.getTime() - before;
      // допускаем перекос в пару секунд на выполнение теста
      expect(Math.abs(actualDelay - expectedDelay)).toBeLessThan(5_000);
      await db.outboxJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    }
    await db.outboxJob.delete({ where: { id: job.id } });
  });

  test("неизвестный тип задания — ошибка попытки", async () => {
    const { job } = await seedOutboxJob("нет-такого-типа");
    await processNextDueJob();
    const current = await db.outboxJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(current.status).toBe("PENDING");
    expect(current.lastError).toContain("Нет обработчика");
    await db.outboxJob.delete({ where: { id: job.id } });
  });
});

describe("Outbox: исход UNKNOWN", () => {
  test("message и SendAttempt UNKNOWN, задание остаётся в PROCESSING (reconcile в B/C)", async () => {
    registerOutboxHandler("unknown-test", async () => ({ result: "UNKNOWN" as const, detail: "сеть оборвалась" }));
    const { job, message } = await seedOutboxJob("unknown-test");
    await processNextDueJob();
    expect((await db.outboxJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("PROCESSING");
    expect(await db.message.findUniqueOrThrow({ where: { id: message.id } }).then((m) => m.status)).toBe("UNKNOWN");
    const attempts = await db.sendAttempt.findMany({ where: { outboxJobId: job.id } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].result).toBe("UNKNOWN");
    expect(attempts[0].detail).toBe("сеть оборвалась");
  });
});

describe("heartbeat и /api/health", () => {
  test("свежий heartbeat → worker.alive=true; протухший → false", async () => {
    await writeHeartbeat();
    const fresh = await health();
    expect(fresh.status).toBe(200);
    const freshBody = await fresh.json();
    expect(freshBody.status).toBe("ok");
    expect(freshBody.worker.alive).toBe(true);
    expect(freshBody.worker.lastHeartbeatAt).toBeDefined();

    await db0.workerHeartbeat.update({
      where: { id: HEARTBEAT_ID },
      data: { updatedAt: new Date(Date.now() - 120_000) },
    });
    const stale = await health();
    expect((await stale.json()).worker.alive).toBe(false);
  });
});
