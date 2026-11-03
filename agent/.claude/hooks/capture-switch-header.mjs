#!/usr/bin/env node
// UserPromptSubmit: remember who sent this turn's message(s), as Switch printed it.
// Never blocks the prompt: an unparsable header just means write tools will refuse later.
import { parseHeaders, readStdin, saveCtx } from "./switch-header.mjs";

try {
  const input = await readStdin();
  const headers = parseHeaders(input.prompt);
  if (headers.length > 0) saveCtx(input.session_id, headers);
  process.stderr.write(`[orderroom] captured ${headers.length} Switch header(s)\n`);
} catch (e) {
  process.stderr.write(`[orderroom] capture failed: ${e}\n`);
}
process.exit(0);
