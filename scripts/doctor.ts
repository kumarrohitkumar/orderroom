// npm run doctor: everything a judge or teammate needs to check when the agent says it has no tools.
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dbPath, openDb, REPO_ROOT } from "../src/db/client.js";

let bad = 0;
const check = (ok: boolean, label: string, fix = "") => {
  console.log(`${ok ? "✅" : "❌"} ${label}${ok || !fix ? "" : `\n   → ${fix}`}`);
  if (!ok) bad++;
};

const agent = join(REPO_ROOT, "agent");
const major = Number(process.versions.node.split(".")[0]);
check(major >= 20, `Node ${process.versions.node} (need ≥ 20)`, "install Node 20 LTS or newer");
check(
  existsSync(join(REPO_ROOT, "dist", "mcp", "server.js")),
  "built server dist/mcp/server.js",
  "npm run setup",
);
const mcpPath = join(agent, ".mcp.json");
check(existsSync(mcpPath), "agent/.mcp.json", "npm run setup");
if (existsSync(mcpPath)) {
  const m = JSON.parse(readFileSync(mcpPath, "utf8"));
  const arg = m.mcpServers?.orderroom?.args?.[0] ?? "";
  check(
    existsSync(arg),
    `.mcp.json points at an existing server (${arg})`,
    "npm run setup (paths are absolute; rerun after moving the repo)",
  );
}
check(existsSync(join(agent, ".switch-ctx", "stamp.key")), "stamp key", "npm run setup");
for (const h of ["capture-switch-header.mjs", "stamp-actor.mjs", "switch-header.mjs"]) {
  const p = join(agent, ".claude", "hooks", h);
  let ok = existsSync(p);
  try {
    accessSync(p, constants.R_OK);
  } catch {
    ok = false;
  }
  check(ok, `hook ${h}`, "git checkout agent/.claude/hooks");
}
for (const f of ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf"])
  check(existsSync(join(REPO_ROOT, "fonts", f)), `font ${f}`);
check(
  !existsSync(join(REPO_ROOT, "CLAUDE.md")),
  "no CLAUDE.md at the repo root (it would leak into the agent)",
);
if (existsSync(dbPath())) {
  const db = openDb();
  const n = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  check(n > 0, `database ${dbPath()} (${n} users)`);
  db.close();
} else check(false, "database", "npm run setup");
const sc = spawnSync(
  process.execPath,
  [join(REPO_ROOT, "dist", "mcp", "server.js"), "--selfcheck"],
  { encoding: "utf8" },
);
check(sc.status === 0, `MCP selfcheck: ${(sc.stderr || "").trim().split("\n").pop()}`);
const claude = spawnSync("claude", ["mcp", "list"], {
  cwd: agent,
  encoding: "utf8",
  timeout: 30_000,
});
if (claude.error) console.log("ℹ️  claude CLI not found; skipped `claude mcp list`");
else {
  const line =
    claude.stdout.split("\n").find((l) => l.startsWith("orderroom")) ?? "orderroom not listed";
  const ok = /connected|✓|✔/i.test(line);
  check(
    ok || /pending approval/i.test(line),
    `claude mcp list: ${line.replace(/^.*? - /, "")}`,
    "run `claude` once inside agent/ and accept the trust dialog",
  );
}
console.log(bad ? `\n${bad} problem(s).` : "\nAll good.");
process.exit(bad ? 1 : 0);
