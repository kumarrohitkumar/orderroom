// npm run setup: (build already ran) → agent/.mcp.json with absolute paths → stamp key → seed → selfcheck.
// Idempotent: reseeds from scratch unless --keep.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir, dbPath, openDb, REPO_ROOT } from "../src/db/client.js";
import { ensureSchema } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";

const t0 = Date.now();
const agentDir = join(REPO_ROOT, "agent");
const data = dataDir();
const server = join(REPO_ROOT, "dist", "mcp", "server.js");
if (!existsSync(server)) {
  console.error("dist/mcp/server.js missing — run `npm run build` (npm run setup does this).");
  process.exit(1);
}

// 1. MCP config for the agent's Claude Code session (absolute paths: Switch launches it from agent/).
const keyFile = join(agentDir, ".switch-ctx", "stamp.key");
const mcp = {
  mcpServers: {
    orderroom: {
      type: "stdio",
      command: process.execPath,
      args: [server],
      env: { ORDERROOM_DATA_DIR: data, ORDERROOM_STAMP_KEY_FILE: keyFile, ORDERROOM_LOG: "info" },
      alwaysLoad: true,
    },
  },
};
writeFileSync(join(agentDir, ".mcp.json"), `${JSON.stringify(mcp, null, 2)}\n`);
console.log(`[setup] wrote agent/.mcp.json → ${server}`);

// 2. Stamp key shared by the hook and the MCP server (never committed; the agent cannot read files).
mkdirSync(join(agentDir, ".switch-ctx"), { recursive: true });
if (!existsSync(keyFile)) {
  writeFileSync(keyFile, randomBytes(32).toString("hex"), { mode: 0o600 });
  console.log("[setup] created stamp key");
}

// 3. Database.
const db = openDb(dbPath(data));
if (process.argv.includes("--keep")) {
  ensureSchema(db);
  console.log(`[setup] kept existing data in ${dbPath(data)}`);
} else {
  const c = seed(db);
  console.log(
    `[setup] seeded ${dbPath(data)}: ${Object.entries(c)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")}`,
  );
}
db.close();

// 4. Self-check the built server against that database.
const sc = spawnSync(process.execPath, [server, "--selfcheck"], {
  env: { ...process.env, ORDERROOM_DATA_DIR: data },
  encoding: "utf8",
});
process.stdout.write(sc.stderr);
if (sc.status !== 0) process.exit(sc.status ?? 1);

console.log(`\n[setup] done in ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
console.log(
  "Next: Switch Console → Templates → Import template → switch/orderroom.template.yaml → Use",
);
console.log(`      directory = ${agentDir}`);
