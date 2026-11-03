import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export type DB = Database.Database;

const here = dirname(fileURLToPath(import.meta.url));
/** Repo root, whether running from src/ (tsx) or dist/ (node). */
export const REPO_ROOT = resolve(here, "..", "..");

export function dataDir(): string {
  return resolve(process.env.ORDERROOM_DATA_DIR ?? join(REPO_ROOT, "data"));
}

export function dbPath(dir: string = dataDir()): string {
  return join(dir, "orderroom.db");
}

/** Opens (and creates the folder for) a database. ":memory:" is allowed for tests. */
export function openDb(path: string = dbPath()): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 3000");
  return db;
}

let shared: DB | undefined;

/** Lazily opened process-wide connection (MCP server startup stays fast). */
export function getDb(): DB {
  shared ??= openDb();
  return shared;
}

/** Test hook: replace the shared connection. */
export function setDb(db: DB | undefined): void {
  shared = db;
}
