import { NextResponse } from "next/server";
import { getDb } from "../../../server/db/client";
import { HEARTBEAT_ALIVE_MS, HEARTBEAT_ID } from "../../../worker/loop";

export async function GET() {
  let worker = { alive: false as boolean, lastHeartbeatAt: null as string | null };
  try {
    const heartbeat = await getDb().workerHeartbeat.findUnique({ where: { id: HEARTBEAT_ID } });
    if (heartbeat) {
      worker = {
        alive: Date.now() - heartbeat.updatedAt.getTime() < HEARTBEAT_ALIVE_MS,
        lastHeartbeatAt: heartbeat.updatedAt.toISOString(),
      };
    }
  } catch {
    // БД недоступна — worker: alive=false, статус самой веб-части не меняется
  }
  return NextResponse.json({ status: "ok", worker });
}
