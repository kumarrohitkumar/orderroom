// Defence in depth for the identity hooks. The PreToolUse hook signs (handle, message_id, room_id)
// with a local key the agent cannot read (Read/Bash are denied). If the key exists, unsigned or
// mis-signed writes are refused, so a hook that silently stops firing fails loudly instead of
// letting the model pick the sender.
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../db/client.js";
import { DomainError } from "./errors.js";

export function keyPath(): string {
  return (
    process.env.ORDERROOM_STAMP_KEY_FILE ?? join(REPO_ROOT, "agent", ".switch-ctx", "stamp.key")
  );
}

function loadKey(): string | null {
  const p = keyPath();
  return existsSync(p) ? readFileSync(p, "utf8").trim() : null;
}

export function sign(key: string, handle: string, messageId: string, roomId: string): string {
  return createHmac("sha256", key).update(`${handle}\n${messageId}\n${roomId}`).digest("hex");
}

/** Throws UNSTAMPED when a key is configured and the signature is missing or wrong. */
export function verifyStamp(a: {
  actor_handle: string;
  message_id?: string;
  room_id?: string;
  stamp_sig?: string;
}): void {
  if (process.env.ORDERROOM_REQUIRE_STAMP === "0") return;
  const key = loadKey();
  if (!key) {
    if (process.env.ORDERROOM_REQUIRE_STAMP === "1") throw unstamped("no stamp key installed");
    return;
  }
  const want = Buffer.from(sign(key, a.actor_handle, a.message_id ?? "", a.room_id ?? ""), "hex");
  const got = Buffer.from(String(a.stamp_sig ?? ""), "hex");
  if (got.length !== want.length || !timingSafeEqual(got, want))
    throw unstamped("signature missing or wrong");
}

function unstamped(why: string): DomainError {
  return new DomainError(
    "UNSTAMPED",
    `Sender identity was not stamped by the OrderRoom hook (${why})`,
    "Sender pehchana nahi gaya, isliye kuch change nahi kiya. Message dobara bhejo; problem rahe to admin `npm run doctor` chalaye.",
  );
}
