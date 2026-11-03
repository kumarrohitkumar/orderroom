#!/usr/bin/env node
// OrderRoom MCP server over stdio. stdout is the protocol; logs go to stderr.
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { dbPath, getDb } from "../db/client.js";
import { ensureSchema } from "../db/migrate.js";
import { log } from "../domain/log.js";
import { createServer, VERSION } from "./create.js";
import { TOOL_COUNT } from "./tools.js";

if (process.argv.includes("--selfcheck")) {
  const db = getDb();
  ensureSchema(db);
  const n = (db.prepare("SELECT COUNT(*) AS n FROM retailers").get() as { n: number }).n;
  createServer();
  process.stderr.write(
    `orderroom selfcheck ok: ${TOOL_COUNT} tools, ${n} parties, db ${dbPath()}\n`,
  );
  process.exit(n > 0 ? 0 : 1);
}

serveStdio(createServer, { onerror: (e) => log("error", "transport", { error: String(e) }) });
log("info", "orderroom mcp started", { version: VERSION, db: dbPath() });
