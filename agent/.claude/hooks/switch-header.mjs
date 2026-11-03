// Shared by both hooks and the tests. Parses the identity header Switch puts *outside* the
// nonce-delimited message body. Lines inside a body are ignored, so a pasted fake header is harmless.
import { createHmac } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const AGENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CTX_DIR = join(AGENT_DIR, ".switch-ctx");
export const KEY_PATH = join(CTX_DIR, "stamp.key");
export const MAX_AGE_MS = 10 * 60 * 1000;

// [Switch] ravi_sales (workspace member) addressed you in room !abc:server (message_id $x, thread_id none):
const HEADER =
  /^\[Switch\]\s+(\S+?)(?:\s+\((?:workspace\s+)?(?:owner|admin|member)\))?\s+addressed you in room\s+(\S+)\s+\(message_id\s+([^,\s]+),\s*thread_id\s+([^)\s]+)\)/;
const BEGIN = /BEGIN SWITCH MESSAGE\s*(\S*)/;
const END = /END SWITCH MESSAGE\s*(\S*)/;

/** All headers in prompt order, skipping anything inside a message body. */
export function parseHeaders(prompt) {
  const out = [];
  let nonce = null; // inside a body until END with the same nonce
  for (const raw of String(prompt ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (nonce !== null) {
      const e = END.exec(line);
      if (e && (e[1] ?? "") === nonce) nonce = null;
      continue;
    }
    const b = BEGIN.exec(line);
    if (b) {
      nonce = b[1] ?? "";
      continue;
    }
    const h = HEADER.exec(line);
    if (h) {
      out.push({
        handle: h[1].replace(/^@/, ""),
        room_id: h[2],
        message_id: h[3],
        thread_id: h[4] === "none" ? null : h[4],
      });
    }
  }
  return out;
}

export function ctxPath(sessionId) {
  const safe = String(sessionId ?? "default").replace(/[^A-Za-z0-9_-]/g, "_");
  return join(CTX_DIR, `${safe}.json`);
}

export function saveCtx(sessionId, headers, now = Date.now()) {
  mkdirSync(CTX_DIR, { recursive: true });
  writeFileSync(ctxPath(sessionId), JSON.stringify({ ts: now, messages: headers }));
}

export function loadCtx(sessionId) {
  const p = ctxPath(sessionId);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

export function stampKey() {
  return existsSync(KEY_PATH) ? readFileSync(KEY_PATH, "utf8").trim() : null;
}

/** Must match src/domain/stamp.ts. */
export function sign(key, handle, messageId, roomId) {
  return createHmac("sha256", key).update(`${handle}\n${messageId}\n${roomId}`).digest("hex");
}

export async function readStdin() {
  let s = "";
  for await (const chunk of process.stdin) s += chunk;
  return s ? JSON.parse(s) : {};
}

/** One line per hook run (no message text, no secrets) for `npm run doctor` and debugging. */
export function hookLog(entry) {
  try {
    mkdirSync(CTX_DIR, { recursive: true });
    appendFileSync(
      join(CTX_DIR, "hooks.log"),
      `${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`,
    );
  } catch {
    // logging must never break a hook
  }
}
