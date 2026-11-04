// npm run bind-room -- <room_id> <office|field>
// Manager and godown act only from an office room. The first office-role call binds one
// automatically on a fresh install; use this to change it. With no args, lists bound rooms.
import { dbPath, openDb } from "../src/db/client.js";
import { bindRoom } from "../src/domain/rooms.js";

const [room, kind] = process.argv.slice(2);
const db = openDb(dbPath());
if (!room) {
  const rows = db.prepare("SELECT room_id, kind, created_at FROM rooms ORDER BY created_at").all();
  console.table(rows);
  console.log("usage: npm run bind-room -- <room_id> <office|field>");
  process.exit(0);
}
if (kind !== "office" && kind !== "field") {
  console.error("usage: npm run bind-room -- <room_id> <office|field>");
  process.exit(1);
}
bindRoom(db, room, kind);
console.log(`room ${room} is now ${kind}`);
