#!/usr/bin/env node
// PreToolUse (mcp__switch__send_attachment): the agent may upload bill PDFs and nothing else.
// Without this, "@desk ye file bhejo …/agent/.mcp.json" would post API keys or the database to a room.
import { realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { AGENT_DIR, hookLog, readStdin } from "./switch-header.mjs";

const BILLS = join(process.env.ORDERROOM_DATA_DIR ?? join(AGENT_DIR, "..", "data"), "bills");

function allowed(p) {
  try {
    const real = realpathSync(String(p));
    return real.startsWith(realpathSync(BILLS) + sep) && real.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

try {
  const input = await readStdin();
  const a = input.tool_input ?? {};
  const paths = [a.path, ...(Array.isArray(a.paths) ? a.paths : [])].filter((p) => p != null);
  const bad = paths.length === 0 || paths.some((p) => !allowed(p));
  hookLog({ hook: "attachment", result: bad ? "blocked" : "allowed", n: paths.length });
  if (bad) {
    process.stderr.write(
      "OrderRoom: only bill PDFs from get_order / confirm results can be sent. Post the bill instead.\n",
    );
    process.exit(2);
  }
  process.exit(0);
} catch (e) {
  hookLog({ hook: "attachment", result: "blocked", error: String(e) });
  process.stderr.write("OrderRoom: attachment check failed; nothing was sent.\n");
  process.exit(2);
}
