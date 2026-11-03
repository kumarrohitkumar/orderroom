// npm run bind -- <seed_handle> <real_handle>
// After the first real message shows how Switch prints someone (e.g. Telegram "@ravi_k92"), map the
// seeded demo user to that handle. Audit history keeps the old handle text; the user id is the same.
import { dbPath, openDb } from "../src/db/client.js";
import { normalizeHandle } from "../src/domain/sanitize.js";

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error("usage: npm run bind -- <seed_handle> <real_handle>");
  process.exit(1);
}
const db = openDb(dbPath());
const target = normalizeHandle(to);
const u = db.prepare("SELECT id, role FROM users WHERE handle = ? COLLATE NOCASE").get(from) as
  | { id: number; role: string }
  | undefined;
if (!u) {
  console.error(`no user ${from}`);
  process.exit(1);
}
db.prepare("UPDATE users SET handle = ? WHERE id = ?").run(target, u.id);
console.log(`bound ${from} (${u.role}) → ${target}`);
