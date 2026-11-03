#!/usr/bin/env node
// UserPromptSubmit: remember who sent this turn's message(s), as Switch printed it.
// Never blocks the prompt: an unparsable header just means write tools will refuse later.
import { hookLog, parseHeaders, readStdin, saveCtx } from "./switch-header.mjs";

const t0 = Date.now();
try {
  const input = await readStdin();
  const headers = parseHeaders(input.prompt);
  if (headers.length > 0) saveCtx(input.session_id, headers);
  hookLog({
    hook: "capture",
    session: input.session_id,
    senders: headers.map((h) => h.handle),
    ms: Date.now() - t0,
  });
} catch (e) {
  hookLog({ hook: "capture", error: String(e), ms: Date.now() - t0 });
}
process.exit(0);
