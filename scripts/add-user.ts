// npm run add-user -- <handle> <role>
// Register a teammate exactly as Switch prints them (the agent's "<name> is not registered" reply shows it).
// The same person can appear differently per app (e.g. Mattermost "user", Console chat "Admin").
import { dbPath, openDb } from "../src/db/client.js";
import { normalizeHandle } from "../src/domain/sanitize.js";

const ROLES = ["salesman", "manager", "godown", "delivery"];
const [handle, role] = process.argv.slice(2);
if (!handle || !role || !ROLES.includes(role)) {
  console.error(`usage: npm run add-user -- <handle> <${ROLES.join("|")}>`);
  process.exit(1);
}
const db = openDb(dbPath());
const h = normalizeHandle(handle);
db.prepare(
  "INSERT INTO users (handle, display_name, role) VALUES (?, ?, ?) ON CONFLICT(handle) DO UPDATE SET role = excluded.role, active = 1",
).run(h, h, role);
console.log(`${h} is now ${role}`);
