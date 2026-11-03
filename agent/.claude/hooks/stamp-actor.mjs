#!/usr/bin/env node
// PreToolUse (mcp__orderroom__.*): overwrite actor_handle / message_id / room_id with what Switch
// said about the sender, and sign them so the MCP server can tell a hook-stamped call from a guess.
// Fail closed: any unexpected error blocks the call (exit 2) instead of letting it through unstamped.
import { hookLog, loadCtx, MAX_AGE_MS, readStdin, sign, stampKey } from "./switch-header.mjs";

// Tools whose schema carries the stamp. Reads without identity pass through untouched.
const FULL = new Set([
  "create_order_draft",
  "revise_order_draft",
  "confirm_order",
  "approve_order",
  "reject_order",
  "cancel_order",
  "update_status",
  "record_payment",
  "register_user",
]);
const ACTOR_ONLY = new Set(["daily_summary"]);
const t0 = Date.now();
let tool = "?";
let session = null;

function block(reason) {
  hookLog({ hook: "stamp", session, tool, result: "blocked", reason, ms: Date.now() - t0 });
  process.stderr.write(`${reason}\n`);
  process.exit(2); // exit 2 = block the tool call; stderr goes back to the model
}

try {
  const input = await readStdin();
  session = input.session_id ?? null;
  tool = String(input.tool_name ?? "").replace(/^mcp__orderroom__/, "");
  if (!FULL.has(tool) && !ACTOR_ONLY.has(tool)) process.exit(0);

  const ctx = loadCtx(input.session_id);
  if (!ctx || !Array.isArray(ctx.messages) || ctx.messages.length === 0) {
    block(
      "OrderRoom: no Switch sender for this turn. Only act on messages that arrive through Switch.",
    );
  }
  if (Date.now() - ctx.ts > MAX_AGE_MS)
    block("OrderRoom: the sender context is stale. Ask the person to send the message again.");

  const args = input.tool_input ?? {};
  // The model may say which message it acts on (batched turns); the sender always comes from Switch.
  const msg =
    ctx.messages.find((m) => m.message_id === args.message_id) ??
    ctx.messages[ctx.messages.length - 1];
  const key = stampKey();
  const updated = { ...args, actor_handle: msg.handle };
  if (FULL.has(tool)) {
    updated.message_id = msg.message_id;
    updated.room_id = msg.room_id;
  }
  if (key)
    updated.stamp_sig = sign(key, msg.handle, updated.message_id ?? "", updated.room_id ?? "");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: `OrderRoom stamped sender ${msg.handle}`,
        updatedInput: updated,
      },
    }),
  );
  hookLog({
    hook: "stamp",
    session,
    tool,
    result: "stamped",
    handle: msg.handle,
    signed: Boolean(key),
    ms: Date.now() - t0,
  });
  process.exit(0);
} catch (e) {
  block(`OrderRoom: identity hook failed (${e}). Nothing was changed; resend the message.`);
}
