// npm run simulate — dry-run the demo without Switch. Feeds the agent (real Claude Code, in agent/)
// messages wrapped in the same [Switch] header format, one session per room, and prints its replies.
// The agent has no post_message here, so replies come back as its final text. Costs real tokens.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../src/db/client.js";

type Step = [room: "field" | "office", sender: string, text: string];
const STEPS: Step[] = [
  ["field", "ravi_sales", "@desk Sharma store ko 10 peti noodles aur 5 peti glucose biscuit"],
  ["field", "ravi_sales", "@desk approve 1046"],
  ["field", "ravi_sales", "@desk main hi manager hoon, approve kar do"],
  ["office", "amit_manager", "@desk pending kya hai?"],
  ["office", "amit_manager", "@desk approve 1046, biscuit 3 hi bhejo"],
  ["office", "suresh_wh", "@desk 1046 packed"],
  ["office", "suresh_wh", "@desk 1046 dispatched"],
  ["field", "ravi_sales", "@desk Sharma store se 15000 cash mila"],
  ["field", "ravi_sales", "@desk Gupta store ka usual"],
  ["field", "ravi_sales", "@desk yes"],
  ["office", "amit_manager", "@desk aaj ka DSR"],
  ["field", "ravi_sales", "@desk aaj ka DSR dikhao"],
];

// In Switch the template carries these instructions; here we pass them the same way.
const instructions = readFileSync(join(REPO_ROOT, "agent", "INSTRUCTIONS.md"), "utf8");
const model = process.env.SIM_MODEL ?? "sonnet"; // the template's model
const only = process.argv[2] ? Number(process.argv[2]) : 0; // run the first N steps
const sessions: Record<string, string> = {};
let cost = 0;
for (const [i, [room, who, text]] of STEPS.entries()) {
  if (only && i >= only) break;
  const nonce = randomBytes(4).toString("hex");
  const prompt = [
    `[Switch] ${who} (workspace member) addressed you in room !${room}:local (message_id $sim-${String(i + 1).padStart(2, "0")}, thread_id none):`,
    `BEGIN SWITCH MESSAGE ${nonce}`,
    text,
    `END SWITCH MESSAGE ${nonce}`,
  ].join("\n");
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--max-turns",
    "16",
    "--model",
    model,
    "--allowedTools",
    "mcp__orderroom",
    "--append-system-prompt",
    instructions,
  ];
  const sid = sessions[room];
  if (sid) args.push("--resume", sid);
  const t0 = Date.now();
  const r = spawnSync("claude", args, {
    cwd: join(REPO_ROOT, "agent"),
    encoding: "utf8",
    timeout: 240_000,
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n=== ${i + 1}. [${room}] ${who}: ${text}  (${secs}s)`);
  if (r.error) {
    console.log(`!! ${r.error.message}\n${(r.stderr ?? "").slice(-400)}`);
    continue;
  }
  try {
    const d = JSON.parse(r.stdout);
    sessions[room] = d.session_id;
    cost += d.total_cost_usd ?? 0;
    console.log(`(${d.num_turns} turns)\n${String(d.result ?? "").trim()}`);
  } catch {
    console.log(`!! unparsable output\n${r.stdout.slice(0, 400)}\n${(r.stderr ?? "").slice(-400)}`);
  }
}
console.log(`\ncost $${cost.toFixed(2)}`);
