import { type DB, openDb } from "../src/db/client.js";
import { seed } from "../src/db/seed.js";

/** Demo clock: Nov 5 2026, 11:00 IST. */
export const DEMO_NOW = "2026-11-05T05:30:00Z";

export function freshDb(): DB {
  process.env.ORDERROOM_NOW = DEMO_NOW;
  // Domain tests call tools directly (no hook); tests/hooks.test.ts covers signed stamps.
  process.env.ORDERROOM_REQUIRE_STAMP ??= "0";
  const db = openDb(":memory:");
  seed(db);
  return db;
}

let n = 0;
/** A fresh delivery envelope, as the PreToolUse hook would stamp it. */
export function as(handle: string, room = "room-office") {
  n += 1;
  return { actor_handle: handle, message_id: `msg-${n}`, room_id: room };
}

export const SHARMA = 1;
export const GUPTA = 2;
export const VERMA = 3;
export const NOODLES_70 = 1;
export const GLUCOSE = 3;
export const TEA = 5;
