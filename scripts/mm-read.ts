// Dev helper: print the last N posts of a channel, read as a demo user. npm run mm-read -- <username> <channel> [n]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "../src/db/client.js";

const [user, channel, n = "6"] = process.argv.slice(2);
const base = process.env.MM_URL ?? "http://127.0.0.1:62997";
const password = readFileSync(join(dataDir(), "demo-accounts.txt"), "utf8")
  .split("\n")
  .find((l) => l.startsWith(`${user} `))
  ?.split(/\s+/)[1];
if (!user || !channel || !password)
  throw new Error("usage: npm run mm-read -- <demo user> <channel> [n]");
const login = await fetch(`${base}/api/v4/users/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ login_id: user, password }),
});
const auth = { authorization: `Bearer ${login.headers.get("token")}` };
const get = async (p: string) => (await fetch(`${base}/api/v4${p}`, { headers: auth })).json();
const team = await get("/teams/name/switch");
const ch = await get(`/teams/${team.id}/channels/name/${channel}`);
const res = await get(`/channels/${ch.id}/posts?per_page=${n}`);
const names = new Map<string, string>();
for (const id of res.order.slice().reverse()) {
  const p = res.posts[id];
  if (!names.has(p.user_id)) names.set(p.user_id, (await get(`/users/${p.user_id}`)).username);
  const t = new Date(p.create_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
  const files = p.file_ids?.length ? ` [${p.file_ids.length} file]` : "";
  console.log(`— ${names.get(p.user_id)} ${t}${files}\n${p.message}\n`);
}
