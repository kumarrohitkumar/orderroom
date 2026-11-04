#!/usr/bin/env node
// PreToolUse (mcp__orderroom__.*): overwrite actor_handle / message_id / room_id with what Switch
// said about the sender, and sign them (with the tool name) so the MCP server can tell a
// hook-stamped call from a guess. Every OrderRoom tool is stamped, reads included.
// Fail closed: any unexpected error blocks the call (exit 2) instead of letting it through unstamped.
import { hookLog, loadCtx, MAX_AGE_MS, readStdin, sign, stampKey } from "./switch-header.mjs";

// When one turn batches messages from several people, the model would choose whose identity a
// call carries. These tools then refuse outright; others need the exact message_id.
const ONE_SENDER_ONLY = new Set([
  "approve_order",
  "reject_order",
  "register_user",
  "verify_payment",
  "record_payment",
  "cancel_order",
]);
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

  const ctx = loadCtx(input.session_id);
  if (!ctx || !Array.isArray(ctx.messages) || ctx.messages.length === 0) {
    block(
      "OrderRoom: no Switch sender for this turn. Only act on messages that arrive through Switch.",
    );
  }
  if (Date.now() - ctx.ts > MAX_AGE_MS)
    block("OrderRoom: the sender context is stale. Ask the person to send the message again.");

  const args = input.tool_input ?? {};
  const senders = new Set(ctx.messages.map((m) => m.handle.toLowerCase()));
  let msg;
  if (senders.size === 1) {
    msg =
      ctx.messages.find((m) => m.message_id === args.message_id) ??
      ctx.messages[ctx.messages.length - 1];
  } else {
    if (ONE_SENDER_ONLY.has(tool))
      block(
        `OrderRoom: ${senders.size} people wrote in this turn, so ${tool} is not allowed now. Ask the person to send that request again on its own.`,
      );
    msg = ctx.messages.find((m) => m.message_id === args.message_id);
    if (!msg)
      block(
        "OrderRoom: several people wrote in this turn. Pass the exact message_id of the message you are acting on.",
      );
  }
  const key = stampKey();
  const updated = {
    ...args,
    actor_handle: msg.handle,
    message_id: msg.message_id,
    room_id: msg.room_id,
  };
  if (key) updated.stamp_sig = sign(key, tool, msg.handle, msg.message_id, msg.room_id);

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
