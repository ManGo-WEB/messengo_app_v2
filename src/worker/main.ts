// Фоновый воркер Messengo: отдельный процесс под Bun.
// Запуск: bun run dev:worker (dev) · bun dist/worker/main.js (prod, см. build:worker).
import { getDb } from "../server/db/client";
import { registerChannelSendJobs } from "./channel-jobs";
import {
  processNextDueJob,
  reconcileUnknownJobs,
  recoverStuckJobs,
  writeHeartbeat,
} from "./loop";

registerChannelSendJobs();

const POLL_INTERVAL_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

let stopping = false;
let busy: Promise<void> | null = null;

async function tick(): Promise<void> {
  if (stopping || busy) return;
  busy = (async () => {
    await recoverStuckJobs();
    await reconcileUnknownJobs();
    while (!stopping && (await processNextDueJob())) {
      /* обрабатываем due-задания, пока не иссякнут */
    }
  })()
    .catch((error) => console.error("worker: цикл обработки завершился ошибкой:", error))
    .finally(() => {
      busy = null;
    });
}

const pollTimer = setInterval(() => void tick(), POLL_INTERVAL_MS);
const heartbeatTimer = setInterval(() => {
  writeHeartbeat().catch((error) => console.error("worker: не записан heartbeat:", error));
}, HEARTBEAT_INTERVAL_MS);

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

void tick();
void writeHeartbeat().catch(() => {});
console.log(`worker: запущен (опрос ${POLL_INTERVAL_MS / 1000}с, heartbeat ${HEARTBEAT_INTERVAL_MS / 1000}с)`);

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  clearInterval(pollTimer);
  clearInterval(heartbeatTimer);
  await busy;
  await getDb().$disconnect();
  console.log("worker: остановлен");
  process.exit(0);
}
