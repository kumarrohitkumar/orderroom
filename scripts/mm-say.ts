// Dev helper: post to a Mattermost channel as one of the made-up demo users (logins in data/demo-accounts.txt).
// npm run mm-say -- <username> <channel> <message...>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "../src/db/client.js";

const [user, channel, ...words] = process.argv.slice(2);
const base = process.env.MM_URL ?? "http://127.0.0.1:62997";
if (!user || !channel || words.length === 0) {
  console.error("usage: npm run mm-say -- <username> <channel> <message>");
  process.exit(1);
}
const line = readFileSync(join(dataDir(), "demo-accounts.txt"), "utf8")
  .split("\n")
  .find((l) => l.startsWith(`${user} `));
const password = line?.split(/\s+/)[1];
if (!password) throw new Error(`no demo login for ${user}`);

const login = await fetch(`${base}/api/v4/users/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ login_id: user, password }),
});
const token = login.headers.get("token");
if (!login.ok || !token) throw new Error(`login failed: ${login.status}`);
const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const team = (await (
  await fetch(`${base}/api/v4/teams/name/switch`, { headers: auth })
).json()) as { id: string };
const ch = (await (
  await fetch(`${base}/api/v4/teams/${team.id}/channels/name/${channel}`, { headers: auth })
).json()) as { id: string };
const post = await fetch(`${base}/api/v4/posts`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ channel_id: ch.id, message: words.join(" ") }),
});
console.log(
  post.ok ? `posted as ${user} in ${channel}` : `post failed: ${post.status} ${await post.text()}`,
);
