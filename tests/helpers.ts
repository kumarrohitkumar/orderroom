import { type DB, openDb } from "../src/db/client.js";
import { seed } from "../src/db/seed.js";

/** Demo clock: Nov 5 2026, 11:00 IST. */
export const DEMO_NOW = "2026-11-05T05:30:00Z";

export function freshDb(): DB {
  process.env.ORDERROOM_NOW = DEMO_NOW;
  const db = openDb(":memory:");
  seed(db);
  return db;
}
