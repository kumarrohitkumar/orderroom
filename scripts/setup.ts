// npm run setup: (build already ran) → agent/.mcp.json with absolute paths → stamp key → seed → selfcheck.
// Idempotent: keeps existing data; reseeds on --reset or when the schema version changed.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir, dbPath, openDb, REPO_ROOT } from "../src/db/client.js";
import { ensureSchema } from "../src/db/migrate.js";
import { SCHEMA_VERSION } from "../src/db/schema.js";
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
// Optional secrets from .env (never committed): only SARVAM_API_KEY is passed to the server.
const envFile = join(REPO_ROOT, ".env");
const dotenv: Record<string, string> = {};
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m?.[1] && m[2]) dotenv[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const sarvam = process.env.SARVAM_API_KEY ?? dotenv.SARVAM_API_KEY;
const mcp = {
  mcpServers: {
    orderroom: {
      type: "stdio",
      command: process.execPath,
      args: [server],
      env: {
        ORDERROOM_DATA_DIR: data,
        ORDERROOM_STAMP_KEY_FILE: keyFile,
        ORDERROOM_LOG: "info",
        ...(sarvam ? { SARVAM_API_KEY: sarvam } : {}),
      },
      alwaysLoad: true,
    },
  },
};
writeFileSync(join(agentDir, ".mcp.json"), `${JSON.stringify(mcp, null, 2)}\n`);
console.log(
  `[setup] wrote agent/.mcp.json → ${server}${sarvam ? " (voice notes on)" : " (voice notes off: no SARVAM_API_KEY)"}`,
);

// 2. Stamp key shared by the hook and the MCP server (never committed; the agent cannot read files).
mkdirSync(join(agentDir, ".switch-ctx"), { recursive: true });
if (!existsSync(keyFile)) {
  writeFileSync(keyFile, randomBytes(32).toString("hex"), { mode: 0o600 });
  console.log("[setup] created stamp key");
}

// 3. Database. Re-running setup keeps real orders; --reset (or a schema change) reseeds the demo.
const db = openDb(dbPath(data));
const version = db.pragma("user_version", { simple: true }) as number;
if (version === SCHEMA_VERSION && !process.argv.includes("--reset")) {
  ensureSchema(db);
  console.log(`[setup] kept existing data in ${dbPath(data)} (npm run setup -- --reset to reseed)`);
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
