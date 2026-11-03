// LLD §8.6: onboarding. Only a manager can add or re-role a teammate.
import type { WriteCtx, WriteResult } from "./audit.js";
import { DomainError } from "./errors.js";
import type { Role } from "./identity.js";
import { cleanText, normalizeHandle } from "./sanitize.js";

export function registerUser(
  ctx: WriteCtx,
  a: { target_handle: string; display_name: string; role: Role },
): WriteResult<{ user_id: number; handle: string; role: Role; reply_text: string }> {
  const { db } = ctx;
  const handle = normalizeHandle(a.target_handle);
  const name = cleanText(a.display_name, "display_name", 64) ?? handle;
  const existing = db
    .prepare("SELECT id, role, active FROM users WHERE handle = ? COLLATE NOCASE")
    .get(handle) as { id: number; role: Role; active: number } | undefined;
  if (existing?.active && existing.role === a.role) {
    throw new DomainError(
      "ALREADY_REGISTERED",
      `${handle} is already a ${a.role}`,
      `${handle} pehle se ${a.role} registered hai.`,
    );
  }
  let id: number;
  if (existing) {
    db.prepare("UPDATE users SET role = ?, display_name = ?, active = 1 WHERE id = ?").run(
      a.role,
      name,
      existing.id,
    );
    id = existing.id;
  } else {
    id = Number(
      db
        .prepare("INSERT INTO users (handle, display_name, role) VALUES (?, ?, ?)")
        .run(handle, name, a.role).lastInsertRowid,
    );
  }
  return {
    data: {
      user_id: id,
      handle,
      role: a.role,
      reply_text: `👤 ${handle} ab ${a.role} hai. Ab woh @desk ko message kar sakta hai.`,
    },
    entityId: id,
    before: existing ?? null,
  };
}
