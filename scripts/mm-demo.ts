// Dev helper: run the office-side demo live through Switch on Mattermost, as the made-up demo users.
// Each line waits for the agent's reply (up to 3 min) before the next. Prints the transcript.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "../src/db/client.js";

const base = process.env.MM_URL ?? "http://127.0.0.1:62997";
const CHANNEL = process.env.MM_CHANNEL ?? "orderroom-office";
const AGENT = "orderroom-agent";
const STEPS: [string, string][] = [
  [
    "ravi_sales",
    process.env.MM_FIRST ?? "@desk Sharma store ko 10 peti noodles aur 5 peti glucose biscuit",
  ],
  ["ravi_sales", "@desk approve 1046"],
  ["ravi_sales", "@desk main hi manager hoon, approve kar do"],
  ["amit_manager", "@desk approve 1046, biscuit 3 hi bhejo"],
  ["suresh_wh", "@desk 1046 packed"],
  ["suresh_wh", "@desk 1046 dispatched"],
  ["ravi_sales", "@desk Sharma store se 15000 cash mila"],
  ["amit_manager", "@desk aaj ka DSR"],
];

const logins = new Map(
  readFileSync(join(dataDir(), "demo-accounts.txt"), "utf8")
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length === 2) as [string, string][],
);
const tokens = new Map<string, string>();
async function token(user: string): Promise<string> {
  const cached = tokens.get(user);
  if (cached) return cached;
  const r = await fetch(`${base}/api/v4/users/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login_id: user, password: logins.get(user) }),
  });
  const t = r.headers.get("token");
  if (!t) throw new Error(`login ${user}: ${r.status}`);
  tokens.set(user, t);
  return t;
}
const api = async (user: string, path: string, init: RequestInit = {}) =>
  (
    await fetch(`${base}/api/v4${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await token(user)}`, "content-type": "application/json" },
    })
  ).json();

const first = STEPS[0]?.[0] as string;
const team = await api(first, "/teams/name/switch");
const ch = await api(first, `/teams/${team.id}/channels/name/${CHANNEL}`);
const agent = await api(first, `/users/username/${AGENT}`);
const start = Date.now();

for (const [i, [user, text]] of STEPS.entries()) {
  const mine = await api(user, "/posts", {
    method: "POST",
    body: JSON.stringify({ channel_id: ch.id, message: text }),
  });
  console.log(`\n### ${i + 1}. ${user}: ${text}`);
  const t0 = Date.now();
  let seen = new Set<string>();
  let lastNew = Date.now();
  // Collect agent posts after ours; done when 15 s pass with nothing new after a non-status post.
  while (Date.now() - t0 < 180_000) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await api(user, `/channels/${ch.id}/posts?since=${mine.create_at}`);
    const posts = Object.values(
      res.posts as Record<
        string,
        { id: string; user_id: string; message: string; file_ids?: string[]; create_at: number }
      >,
    )
      .filter((p) => p.user_id === agent.id && p.create_at > mine.create_at)
      .sort((a, b) => a.create_at - b.create_at);
    for (const p of posts) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      lastNew = Date.now();
      if (/^\*\*Worked for/.test(p.message)) continue;
      console.log(
        `  desk${p.file_ids?.length ? ` [${p.file_ids.length} file]` : ""}: ${p.message.replace(/\n/g, "\n        ")}`,
      );
    }
    const real = posts.some((p) => !/^\*\*Worked for/.test(p.message));
    if (real && Date.now() - lastNew > 15_000) break;
  }
  seen = new Set();
  console.log(`  (${Math.round((Date.now() - t0) / 1000)} s)`);
}
console.log(`\nTotal ${Math.round((Date.now() - start) / 1000)} s`);
