import type { DB } from "./client.js";
import { SCHEMA_SQL, SCHEMA_VERSION, TABLES } from "./schema.js";

/** Drops every OrderRoom table and recreates the schema. */
export function resetSchema(db: DB): void {
  db.pragma("foreign_keys = OFF");
  db.transaction(() => {
    for (const t of TABLES) db.exec(`DROP TABLE IF EXISTS ${t}`);
    db.exec(SCHEMA_SQL);
  })();
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
  db.pragma("foreign_keys = ON");
}

/** Creates the schema only if the database is empty. */
export function ensureSchema(db: DB): void {
  const v = db.pragma("user_version", { simple: true }) as number;
  if (v === 0) resetSchema(db);
  else if (v !== SCHEMA_VERSION) {
    throw new Error(`orderroom.db schema v${v}, expected v${SCHEMA_VERSION}. Run: npm run setup`);
  }
}
