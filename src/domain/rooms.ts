// Chat handles are chosen by their owners: a salesman can rename his Telegram account to
// "amit_manager". So office roles only count in an office room, which a Telegram group never is.
import type { DB } from "../db/client.js";
import { DomainError } from "./errors.js";
import type { Actor, Role } from "./identity.js";
import { log } from "./log.js";

export type RoomKind = "office" | "field";
export const OFFICE_ROLES: readonly Role[] = ["manager", "godown"];

export function bindRoom(db: DB, roomId: string, kind: RoomKind): void {
  db.prepare(
    "INSERT INTO rooms (room_id, kind) VALUES (?, ?) ON CONFLICT(room_id) DO UPDATE SET kind = excluded.kind",
  ).run(roomId, kind);
}

/**
 * Manager and godown may act only from an office room. If no office room is bound yet (fresh
 * install: the template kickoff runs in the office room), the first office-role call binds it.
 */
export function checkRoom(db: DB, actor: Actor, roomId: string | undefined): void {
  if (!OFFICE_ROLES.includes(actor.role)) return;
  const room = (roomId ?? "").trim();
  const row = room
    ? (db.prepare("SELECT kind FROM rooms WHERE room_id = ?").get(room) as
        | { kind: RoomKind }
        | undefined)
    : undefined;
  if (row?.kind === "office") return;
  if (room && !row && !db.prepare("SELECT 1 FROM rooms WHERE kind = 'office'").get()) {
    bindRoom(db, room, "office");
    log("info", "office_room_bound", { room_id: room, by: actor.handle });
    return;
  }
  throw new DomainError(
    "ROOM_NOT_ALLOWED",
    `${actor.handle} (${actor.role}) acted from a non-office room`,
    `${actor.role} ke kaam sirf office room se hote hain. Office room mein likho.`,
    { actor_role: actor.role, room_id: room || null },
  );
}
