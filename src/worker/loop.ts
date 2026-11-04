// Ядро Outbox-воркера: claim → attempt → результат (механика по образцу V1,
// упрощена до плана A4). Используется и циклом main.ts, и integration-тестами.
import { getDb } from "../server/db/client";
import { dispatch, type ClaimedJob } from "./handlers";

export const MAX_ATTEMPTS = 5;
export const STUCK_TIMEOUT_MINUTES = 10;
export const HEARTBEAT_ID = "worker";
export const HEARTBEAT_ALIVE_MS = 60_000;

const BASE_RETRY_DELAY_MS = 60_000; // 1 мин → 2 → 4 → 8 → 16

type JobRow = { id: string; type: string; attempts: number; messageId: string };

// Атомарный claim: SKIP LOCKED не даёт нескольким воркерам взять одно задание
export async function claimNextJob(): Promise<ClaimedJob | null> {
  const rows = await getDb().$queryRaw<JobRow[]>`
    UPDATE "OutboxJob" SET status = 'PROCESSING', "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM "OutboxJob"
      WHERE status = 'PENDING' AND "nextAttemptAt" <= now()
      ORDER BY "nextAttemptAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, attempts, "messageId"`;
  return rows[0] ?? null;
}

// Обрабатывает одно due-задание; false — due-заданий нет
export async function processNextDueJob(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;
  await runClaimedJob(job);
  return true;
}

export async function runClaimedJob(job: ClaimedJob): Promise<void> {
  const db = getDb();
  const attemptNumber = job.attempts + 1;
  try {
    const outcome = await dispatch(job);
    const finalStatus = outcome.result === "SENT" ? "SENT" : "UNKNOWN";
    // UNKNOWN (сеть оборвалась во время отправки): фиксируем статус и оставляем
    // задание в PROCESSING — им займётся reconcileUnknownJobs (заготовка, B/C).
    await db.$transaction([
      db.outboxJob.update({
        where: { id: job.id },
        data: outcome.result === "SENT" ? { status: "SENT", lastError: null } : { lastError: outcome.detail ?? null },
      }),
      db.message.update({ where: { id: job.messageId }, data: { status: finalStatus } }),
      db.sendAttempt.create({
        data: { outboxJobId: job.id, result: outcome.result, detail: outcome.detail },
      }),
    ]);
  } catch (error) {
    const detail = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const exhausted = attemptNumber >= MAX_ATTEMPTS;
    const delayMs = BASE_RETRY_DELAY_MS * 2 ** (attemptNumber - 1);
    await db.$transaction([
      db.sendAttempt.create({ data: { outboxJobId: job.id, result: "FAILED", detail } }),
      db.outboxJob.update({
        where: { id: job.id },
        data: exhausted
          ? { status: "FAILED", attempts: attemptNumber, lastError: detail }
          : {
              status: "PENDING",
              attempts: attemptNumber,
              lastError: detail,
              nextAttemptAt: new Date(Date.now() + delayMs),
            },
      }),
      ...(exhausted
        ? [db.message.update({ where: { id: job.messageId }, data: { status: "FAILED" } })]
        : []),
    ]);
  }
}

// Задания, застрявшие в PROCESSING (воркер упал в середине), возвращаются в очередь.
// TODO (фазы B/C): для заданий с исходом UNKNOWN нужна сверка фактической доставки
// до повторной отправки, иначе возможен дубль.
export async function recoverStuckJobs(): Promise<number> {
  return getDb().$executeRaw`
    UPDATE "OutboxJob" SET status = 'PENDING', "updatedAt" = now()
    WHERE status = 'PROCESSING'
      AND "updatedAt" < now() - make_interval(mins => ${STUCK_TIMEOUT_MINUTES})`;
}

// Reconcile-заготовка: задания с UNKNOWN-исходом остаются в PROCESSING — здесь
// фазы B/C будут сверять фактическую доставку по каналу.
export async function reconcileUnknownJobs(): Promise<void> {
  const stuck = await getDb().outboxJob.findMany({
    where: { status: "PROCESSING" },
    select: { id: true },
    take: 5,
  });
  if (stuck.length > 0) {
    console.log(`worker: ${stuck.length} заданий ожидают reconcile (UNKNOWN) — обработка в фазах B/C`);
  }
}

export async function writeHeartbeat(): Promise<void> {
  const now = new Date();
  await getDb().workerHeartbeat.upsert({
    where: { id: HEARTBEAT_ID },
    update: { updatedAt: now },
    create: { id: HEARTBEAT_ID, updatedAt: now },
  });
}
