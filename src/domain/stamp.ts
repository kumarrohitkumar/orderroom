// Defence in depth for the identity hooks. The PreToolUse hook signs (tool, handle, message_id,
// room_id) with a local key the agent cannot read (Read/Bash are denied, attachments are limited to
// bills). Unsigned or mis-signed calls are refused, so a hook that silently stops firing fails
// loudly instead of letting the model pick the sender. ORDERROOM_REQUIRE_STAMP=0 turns this off (tests).
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

export function sign(
  key: string,
  tool: string,
  handle: string,
  messageId: string,
  roomId: string,
): string {
  return createHmac("sha256", key)
    .update(`${tool}\n${handle}\n${messageId}\n${roomId}`)
    .digest("hex");
}

/** Throws UNSTAMPED when the signature is missing or wrong, or no key is installed. */
export function verifyStamp(
  tool: string,
  a: {
    actor_handle: string;
    message_id?: string;
    room_id?: string;
    stamp_sig?: string;
  },
): void {
  if (process.env.ORDERROOM_REQUIRE_STAMP === "0") return;
  const key = loadKey();
  if (!key) throw unstamped("no stamp key installed; run npm run setup");
  const want = Buffer.from(
    sign(key, tool, a.actor_handle, a.message_id ?? "", a.room_id ?? ""),
    "hex",
  );
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
