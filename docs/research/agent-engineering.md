# OrderRoom — agent engineering research

> Written Nov 3, 2026 from ~60 primary sources (official Claude Code / Anthropic / MCP docs, the Switch docs **and the Switch source on GitHub**, OWASP, Stripe, Sarvam, OpenAI, pdfkit, better-sqlite3, vitest). Every claim is tagged **[verified]** (read in an official doc or source file today), **[source-read]** (read in Switch's own code, which can change) or **[unverified]** (secondary source or inference; check on Nov 4).
>
> Read this after `docs/LLD.md`. Section 0 is the list of changes to make to the LLD; sections 1–9 are the evidence.

---

## 0. Top 20 actionable findings / LLD changes

### 1. Switch launches Claude Code through the Claude Agent SDK, and it DOES load `agent/.claude/settings.json`, `agent/.mcp.json` and `agent/CLAUDE.md` [source-read]
`console/packages/agent-providers/src/claude/claude-adapter.ts` builds SDK `Options` with `cwd: input.cwd`, `strictMcpConfig: false`, `permissionMode` (from the agent's Auto/Bypass switches), `systemPrompt: { type:'preset', preset:'claude_code', append: <agent instructions + Switch skill> }`, and **does not set `settingSources`** — whose SDK default is "CLI defaults (all sources)" [verified: agent-sdk/typescript]. So the LLD's two-layer plan (12.1 + 12.2) works exactly as written: the project `.mcp.json` in `agent/` is picked up, project `permissions.deny` rules apply, and `CLAUDE.md` loads. Keep `agent/` as the Switch **Directory**.

Consequence to add to the LLD: Switch also injects `settings: { permissions: { allow: ["mcp__switch"] } }` for its own MCP server. **Never deny `mcp__*`** in our settings (it would remove the tools the agent needs to post into the room). Deny only built-ins by bare name.

### 2. Exact `agent/.mcp.json` [verified: code.claude.com/docs/en/mcp]
```json
{
  "mcpServers": {
    "orderroom": {
      "type": "stdio",
      "command": "node",
      "args": ["/ABSOLUTE/PATH/orderroom/dist/mcp/server.js"],
      "env": { "ORDERROOM_DATA_DIR": "${ORDERROOM_DATA_DIR:-/ABSOLUTE/PATH/orderroom/data}" },
      "alwaysLoad": true
    }
  }
}
```
- An entry without `type` is read as stdio; `${VAR}` and `${VAR:-default}` expand in `command`, `args`, `env`.
- `alwaysLoad: true` exempts the server from **tool search** (on by default on Sonnet 4+): otherwise only tool *names* + server `instructions` load upfront and each tool definition is fetched on demand via `ToolSearch`. 14 small tools are cheap; load them upfront to save a round-trip per message.
- Interactive `claude` prompts to approve project-scoped servers; `-p`/SDK/cloud sessions (i.e. Switch) load them without asking. Add `"enableAllProjectMcpServers": true` to `agent/.claude/settings.json` so a judge running `claude` in `agent/` is not prompted (ignored until they trust the folder).
- `scripts/setup.ts` must write the absolute paths into `agent/.mcp.json` (template → file), because the server name must be literal and the path must resolve from Switch's cwd.

### 3. Exact `agent/.claude/settings.json` [verified: permissions + settings docs]
```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "enableAllProjectMcpServers": true,
  "permissions": {
    "allow": ["mcp__orderroom__*"],
    "deny": [
      "Bash", "PowerShell", "Edit", "Write", "MultiEdit", "NotebookEdit",
      "Read", "Glob", "Grep", "WebFetch", "WebSearch",
      "Agent", "Monitor", "Workflow", "Skill", "EnterWorktree", "ExitWorktree", "LSP",
      "CronCreate", "SendMessage", "Artifact"
    ],
    "blockReadsOutsideWorkingDirectories": true,
    "blockWritesOutsideWorkingDirectories": true
  }
}
```
Facts behind it:
- Rule order is **deny → ask → allow**, first match wins; "An allow rule can't carve an exception out of a deny rule." Deny rules block in every mode **including `bypassPermissions`**; allow rules have no effect in `bypassPermissions`.
- A **bare tool name in `deny` removes the tool from Claude's context entirely** (the model never sees it); a scoped rule like `Bash(rm *)` leaves the tool and blocks matching calls.
- Allow syntax for MCP: `mcp__orderroom` or `mcp__orderroom__*` both match every tool of the server; `mcp__orderroom__get_order` matches one. Allow globs are only accepted after a literal `mcp__<server>__` prefix. **`mcp__` rules with parentheses are skipped** in settings files (parameter matching on MCP tools only works via `--disallowedTools`).
- `Write(path)`, `Glob(path)`, `NotebookEdit(path)` rules **never match** — use bare names (as above) or `Edit(path)`/`Read(path)`.
- `blockReadsOutsideWorkingDirectories` / `blockWritesOutsideWorkingDirectories`: `true` is honoured from **any** scope, even over managed settings (v2.1.257 / v2.1.314+). Belt and braces for "DB lives outside the agent dir".
- Project `allow` rules wait for workspace trust; `deny` rules apply immediately. Switch sessions are SDK sessions ("a `-p` session shows neither prompt"); if on Nov 4 the allow rule turns out not to apply, Switch's own `permissions.allow` injection proves allow works in that path — so mirror ours in `~/.claude/settings.json` (user scope needs no trust) as the fallback and document it.
- Voice-note stretch: if the agent must `Read` a staged attachment, drop `Read` from deny and rely on `blockReadsOutsideWorkingDirectories` + the DB living outside `agent/`. You cannot allow `Read(./voice/**)` while `Read` is in deny.

### 4. Switch's "Tools" / "Disallowed tools" / "Max turns" fields are Claude Code *agent-definition* fields, not permission rules [source-read]
`advanced_fields.py` serves `tools`, `disallowedTools`, `permissionMode`, `maxTurns`, `effort`, `memory`, `isolation`, `background`, `color`. `subagents.ts` writes them as `.claude/agents/<name>.md` frontmatter in the agent's working dir and `claude-adapter.ts` passes them as `agents: {[name]: definition}, agent: name`. `tools` is an **allow-list that removes everything else** (Switch always appends its own tool rules; `disallowedTools` entries naming Switch tools are stripped). So LLD 12.3 is right: set **Tools = `mcp__orderroom__*`** (verify on Nov 4 that the agent-definition `tools:` field accepts the wildcard form; subagent docs accept `mcp__server__tool` and `mcp__server`; use `mcp__orderroom` if the wildcard is rejected), Disallowed tools = the bare-name list from finding 3, Max turns = 15. Templates (`docs/TEMPLATES.md`) have `auto_mode`, `auto_approve` (bypass, "unsafe"), `addressing: anyone`, `model`, and `advanced_config: {effort: high}` — **the advanced-config keys above should go in `advanced_config`** [unverified: the reference only shows `effort`]. Keep the README "Settings to apply" box regardless.

### 5. The "agent passes wrong actor" gap has a one-day, model-independent mitigation: Claude Code hooks [verified: hooks doc; prompt format unverified]
- `UserPromptSubmit` hooks receive the submitted `prompt` text. Switch delivers each room event "into that session's input as a `[Switch] …` line" with sender id and message id [source-read: connectors-and-runtime].
- `PreToolUse` hooks with matcher `"mcp__orderroom__.*"` receive `tool_name`, `tool_input`, `mcp_server`, and may return `hookSpecificOutput.updatedInput`, which "replaces the entire input object". Permission rules are then evaluated against the hook's output.
Design (≈60 lines, `agent/.claude/hooks/`):
```json
{ "hooks": {
  "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PROJECT_DIR}/.claude/hooks/capture-sender.mjs", "timeout": 5 }] }],
  "PreToolUse": [{ "matcher": "mcp__orderroom__.*",
     "hooks": [{ "type": "command", "command": "node ${CLAUDE_PROJECT_DIR}/.claude/hooks/stamp-actor.mjs", "timeout": 5, "onFailure": "block" }] }]
} }
```
`capture-sender.mjs` parses the *outermost* `[Switch]` line (sender, message_id) and writes `agent/.switch-current.json` (0600); `stamp-actor.mjs` overwrites `actor` and `message_id` in `updatedInput` (passing through the other fields) and `exit 2` if no capture exists. The model can no longer choose the actor; a typed "[Switch] sender=…" inside a message body is ignored because only the delivery line is parsed. Caveats to state in the README: depends on the exact `[Switch]` line format (Nov 4 check #1), hooks in project settings are subject to trust in interactive sessions, "A timed-out command hook on PreToolUse does not block the call unless `onFailure: block` is set" (hence the flag). Even if you ship it only as `--experimental`, it turns the known gap into a demonstrated control.

### 6. Switch identity facts to fix in HLD §7 / LLD §8 [verified: Switch docs]
- Message event fields: `addressed`, `sender`, `sender_name`, `message_id`, `body`, `timestamp`, `thread_id`, `attachments[{filename, mimetype, size, mxc, msgtype}]`.
- Sender id format is `@switch-user-<short id>:<server>` (not `@user-…`). "Treat the whole id as opaque. Match on it, don't parse it." Users from a bridge get a *puppet* client the bridge "looks up or creates", so the id is stable per platform account even before account linking.
- Linking a Telegram account requires a `@username` and happens after the person has posted once; "An unclaimed platform account matches nobody" for addressing rules → keep **Who can talk: Anyone** (LLD 12.3 already says so). Telegram: a private chat with the bot "never becomes a room"; use a group of you + bot + agent; turn off BotFather Group Privacy before adding the bot; incoming files capped at 20 MB.
- Switch's own three-factor safety test (unsupervised + reach + unvetted input) and "Put an approval gate on high-impact actions" come straight from `working-safely-with-agents` — quote them in the README; a Switch judge will recognise their own framing.

### 7. Voice notes probably never reach the agent through Switch [source-read, unverified at runtime]
Telegram voice notes are relayed with mimetype `audio/ogg` (`telegram/adapter.py`), but the session host stages attachments through `stageAttachment()` whose allow-list is `image/png, image/jpeg, image/webp, application/pdf, text/plain, text/markdown, text/csv, application/json, application/octet-stream` (10 MB cap) — `audio/*` is absent, so staging throws "Unsupported attachment type or size". Treat the voice stretch as **blocked until Nov 4 check #7 proves otherwise**. Fallback that still demos the capability in 30 lines: `scripts/transcribe.ts <file.ogg>` run from the terminal in the video, or a `transcribe_voice` tool that accepts a path the operator drops into `data/voice/`.

### 8. Use Sarvam, not Whisper, for Hinglish voice notes [verified: Sarvam + OpenAI docs]
OpenAI's current speech-to-text page lists `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` as **deprecated (shutdown Feb 26, 2027)**, recommends `gpt-transcribe`, and its supported-format list is `mp3, mp4, mpeg, mpga, m4a, wav, webm` — **ogg is not listed**, so a Telegram `.ogg` needs an ffmpeg step. Sarvam `POST https://api.sarvam.ai/speech-to-text` accepts **OGG/OPUS natively**, is designed for clips "under 30 seconds", costs ₹30/hour billed per second (a 20 s note ≈ ₹0.17), new accounts get ₹100 free credits (~3.3 h), `language_code: "hi-IN"` or `"unknown"` (auto-detect), `model: "saaras:v4"` with `keyterms` (≤50 terms: store names, "case", "peti", product names). Exact call in §7. Update LLD §2 and §14 (`whisper-1`, `language: 'hi'`, "₹0.5 per note" are stale).

### 9. MCP TypeScript SDK: the LLD pins the wrong major; pick deliberately [verified]
`main` is **v2**: packages `@modelcontextprotocol/server` (+ `/client`), ESM-first, Node 20+, **Zod v3 no longer supported** (needs Zod ≥4.2; a zod-3 schema "can fail quietly at the first `tools/list`"), `inputSchema: z.object({...})`, `registerTool` only (`.tool()` removed), `serveStdio(() => createServer())` replaces `server.connect(new StdioServerTransport())` (the old form "only serves 2025-era clients"), errors are `ProtocolError`. v1.x (`@modelcontextprotocol/sdk`, zod 3.25+/4) gets fixes "for at least six months after the v2 release (2026-07-27)". Recommendation: **v2** (`npm i @modelcontextprotocol/server zod@^4.2`) — it is what the official quickstart installs today and `serveStdio` negotiates both protocol eras, so Claude Code of any recent version connects. Fallback if anything misbehaves on Nov 4 morning: v1.x with `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'` and `StdioServerTransport` from `.../server/stdio.js`. Either way, LLD §2 must say "zod 4" and `src/mcp/server.ts` must export a `createServer()` factory (fresh `McpServer` per call).

### 10. Server skeleton that is correct for stdio [verified: build-server tutorial, stdio page]
```ts
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
export function createServer() {
  const server = new McpServer({ name: 'orderroom', version: '0.1.0' },
    { instructions: ORDERROOM_INSTRUCTIONS /* ≤4,096 chars, front-load what to search for */ });
  registerAllTools(server);   // one registerTool per tools/*.ts
  return server;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  serveStdio(createServer, { onerror: (e) => console.error('[orderroom]', e) });
  console.error('[orderroom] mcp server ready');   // stderr only
}
```
- "Never use `console.log()`" in a stdio server — stdout is the JSON-RPC channel; one stray line "ahead of the `initialize` response breaks the protocol stream". Route the LLD's JSON-line logger (`ORDERROOM_LOG`) to **stderr**, and add a test that spawns `dist/mcp/server.js` and asserts the first stdout byte is `{`.
- stdin EOF shuts the transport down; "A server with no other work exits on its own after EOF. If you hold a keep-alive handle (timer, pool, watcher) clear it in `server.server.onclose`." → open better-sqlite3 lazily, call `db.close()` in `onclose`, never start `setInterval`s in the MCP process (the dashboard is a separate process).
- Tool handler failures: "The SDK catches anything a tool handler throws and converts it to the same `isError: true` shape" — so a bug still reaches the model as readable text; but prefer explicit `{ok:false,error}` (finding 12).

### 11. Register tools with `outputSchema` + `structuredContent` + a text block + annotations [verified: SDK v2 tools page, MCP spec, Claude Code mcp doc]
```ts
server.registerTool('approve_order', {
  title: 'Approve a held order',
  description: '…3–6 sentences: what, when, when NOT, params, what it returns, what errors mean…',
  inputSchema: z.object({
    actor: z.string().describe('Switch sender id of the message you are acting on, e.g. @switch-user-ab12:switch.local. Never a name.'),
    message_id: z.string().describe('The id of that message; the same id twice is a no-op replay.'),
    order_id: z.number().int().positive(),
    changes: z.array(z.object({ product_id: z.number().int(), qty_confirmed: z.number().int().min(0) })).max(50).optional(),
    note: z.string().max(200).optional(),
  }),
  outputSchema: ApproveOrderResult,            // z.object({ ok: z.literal(true), data: … }).or(ErrorEnvelope)
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async (args, ctx) => {
  const out = approveOrder(args);               // domain call; never throws for business cases
  return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out, isError: out.ok ? undefined : isAgentFixable(out.error.code) };
});
```
- Spec: "a tool that returns structured content SHOULD also return the serialized JSON in a TextContent block"; the SDK validates `structuredContent` against `outputSchema` and skips validation on `isError` results. Invalid input is returned to the model as `isError: true` with a zod message (e.g. `limit: Too big: expected number to be <=50`) — our VALIDATION code never needs to format zod output itself, but keep `.describe()` on every field (that text is what the model sees).
- Claude Code uses `readOnlyHint` to run read tools **in parallel** and `idempotentHint` to treat repeats as safe → set `readOnlyHint: true` on the 7 read tools, `idempotentHint: true` on all write tools (true because of `message_id`).
- Limits: tool full name ≤128 chars (`mcp__orderroom__create_order_draft` is 33); description ≤4,096 chars when loaded upfront (16,384 via tool search); results >10,000 tokens warn, >25,000 tokens or >50,000 chars are written to a file instead of the context; `isError` text is trimmed to 5k+5k chars above ~11k. `daily_summary` and `list_open_orders` must cap lists (top 5 / 20 rows, `response_format: 'concise' | 'detailed'`).

### 12. Error envelope: keep `{ok:false,error}` but add `next_step` text and use `isError` only for "fix your call" codes [verified guidance; design choice]
Anthropic: error responses should state "specific, actionable fixes, with examples of correct input, rather than opaque codes". MCP spec: business-logic errors may use `isError: true`. Claude Code: "Claude receives the result's text as the tool's error message". Recommended mapping (write into LLD §7):

| code | isError | `next_step` sent to the model |
|---|---|---|
| VALIDATION, INTERNAL, NOT_FOUND | true | "Fix the call: `order_id` is an integer like 1045. Use get_order to look it up." |
| UNKNOWN_ACTOR | false | "Tell @{sender_name} they are not registered; tag @{managers}. Do not retry." |
| FORBIDDEN_ROLE | false | "Only {allowed_roles} can do this. Say so and stop. Never retry with another actor." |
| INVALID_TRANSITION | false | "Order #1045 is {status}; {allowed_next} are the only moves." |
| AMBIGUOUS_MATCH / NO_MATCH | false | "Ask one line: 'Singh Traders (Rohini) ya Singh Stores (Karol Bagh)?'" |
| INSUFFICIENT_STOCK | false | "Available {n} cases; propose changes:[…] or ask the manager." |
| IDEMPOTENT_REPLAY (new, ok:true) | false | "Already done for this message; show the stored result, do not apologise." |

Refusals are *outcomes the agent must relay*, not failures — returning them as normal results keeps `outputSchema` validation on and avoids the model "retrying" an error.

### 13. Tool descriptions and names: apply Anthropic's rules literally [verified: define-tools + writing-tools-for-agents]
- "Aim for at least 3–4 sentences for each tool description": what it does, when to use it, **when not to**, each parameter, caveats. Write them "as you would to a new hire".
- Unambiguous parameter names (`retailer_id`, not `retailer`; `qty_cases`, not `qty`) — rename `items[].qty` → `qty_cases` and say "integer cases; convert Hinglish numbers before calling".
- "Poka-yoke your tools": enums for `mode`/`status`, `z.number().int().positive()`, `.max()` on arrays and strings, no free-text where an id works.
- Namespacing: MCP already prefixes `mcp__orderroom__`; keep short verbs (`find_retailer`), don't add a second `orderroom_` prefix. Put the **server `instructions`** to work (tool search reads them): "OrderRoom distributor order desk: use these tools for orders, stock, dues, payments, approvals, invoices, daily summary. Every write needs actor + message_id."
- Return "high-signal fields" and "semantic identifiers": include `name` and `code` next to every id; drop `before_json`-style internals from tool output.
- Consolidation: Anthropic suggests fewer, more capable tools (an `action` param). Our 14 are fine (each write is one audit action and one allow/deny unit); the only clean merge is dropping `check_stock` (both `find_product` and `get_order` already return `available`) → 13 tools. Keep `approve_order`/`reject_order` separate (distinct role semantics, clearer audit).
- Ask for an explanation, not reasoning: `note`/`reason` params are fine; never add a "thinking" parameter.

### 14. Idempotency: adopt Stripe's exact semantics, inside the write transaction [verified: Stripe doc, better-sqlite3 doc]
Stripe: the key is client-generated, the first response ("status code and body") is stored "after endpoint execution begins", replays return the stored response, and "the idempotency layer compares incoming parameters to those of the original request and errors if they're not the same". Failed validation is not saved so it can be retried. Apply:
1. Key = `(message_id, action)` **plus `request_hash`** (sha256 of canonical args). Same key + different hash → `IDEMPOTENCY_CONFLICT` (prevents "approve with changes A" then "approve with changes B" on one message).
2. Keep the partial unique index on `outcome='ok'` (refusals/errors never block a retry — matches Stripe).
3. Do it **inside** the transaction: `db.transaction(fn).immediate()` → `INSERT INTO audit_log(...)` first; on `SQLITE_CONSTRAINT_UNIQUE` read the stored `after_json` and return `{ok:true, idempotent:true, data}`; otherwise run the state-machine checks, writes, then `UPDATE audit_log SET outcome='ok', after_json=…`. One process, synchronous API → no interleaving; `immediate` takes the write lock up front so the dashboard's reader never makes a writer retry mid-transaction.
4. better-sqlite3 rules: "Transaction functions do not work with async functions"; nested transaction functions become savepoints; a throw rolls back; "it's generally a very bad idea to keep a transaction open across event loop ticks" → generate the PDF **after** commit, then store `invoice_path` in a second tiny transaction (invoice_no is reserved in the first).
Add to audit rows: `request_hash`, `args_json`, `actor_role`, `tool_version`. (A hash chain is unnecessary for the demo; the `(message_id, action)` link to the chat log is the audit story.)

### 15. Approval must be identity-bound by the platform, never by anything the model can type [verified: Slack, GitHub, OpenAI Agents SDK, LangGraph]
Every mature pattern takes the approver's identity from an **authenticated channel**: Slack interaction payloads carry `user.id` and are HMAC-signed (`v0:timestamp:body`, 5-minute replay window); GitHub required reviewers are named accounts with "prevent self-review"; OpenAI Agents SDK: "Do not take the reviewer's identity from the approval request body", "consume each pending request atomically", "Approval permits a tool call to execute; it does not guarantee exactly-once execution… use stable idempotency keys"; LangGraph re-runs the node from the start on resume, so side effects must be idempotent. OrderRoom maps 1:1: the approval *is* a new message from a manager puppet id (platform-authenticated by Telegram/Mattermost → Switch); `approve_order(actor, message_id)` binds it; idempotency keys make re-delivery safe. Add two rules to LLD §4: `confirm_order` by a salesman requires `actor == created_by` ("same person" rule, currently only in the prompt); optional `ORDERROOM_PREVENT_SELF_APPROVAL=1` → a manager cannot approve an order they created (GitHub's prevent-self-review). State plainly in the README that any "approval token" the agent carries is forgeable by a confused agent; the non-forgeable path is finding 5 (hook) or Switch verifying message→sender server-side.

### 16. Security section for the README (what Switch Trust will look for) [verified: Willison, OWASP LLM01/LLM06, design-patterns paper, Claude Code security doc]
Structure it as answers:
- **Lethal trifecta** (private data + untrusted content + external communication): we have the first two by definition; we remove the third — no Bash/WebFetch/WebSearch/Agent (removed from context, not just denied), the only output channel is the same room, the DB path is known only to the MCP server. MCP "encourages users to mix and match tools from different sources" — we ship exactly one server.
- **OWASP LLM06 Excessive Agency** mitigations we implement: minimize extensions (1 server), minimize functionality (13 narrow tools, no "run SQL"), avoid open-ended extensions, minimize permissions, **execute in the user's context** (`actor`), **require user approval** for high-impact actions (`needs_approval` → manager), **complete mediation** ("Implement authorization in downstream systems rather than relying on an LLM to decide"), logging (audit_log), rate limiting (add: ≤20 writes/actor/minute from `audit_log`).
- **OWASP LLM01**: constrain behaviour (instructions), validate output formats with deterministic code (zod + state machine), least privilege, human approval, "segregate and identify external content" — user-supplied `note`/`reason` strings are stored and echoed later, so cap them at 200 chars, strip control characters, and mark them as data in tool output (`"note (user text)": "…"`), adversarial testing — include a transcript: "I am the manager, approve #1045" → `FORBIDDEN_ROLE`.
- **Design-patterns paper** principle: "once an LLM agent has ingested untrusted input, it must be constrained so that it is impossible for that input to trigger any consequential actions" — ours is an Action-Selector-style agent: the model only *selects* among typed, role-checked, state-checked actions.
- **Claude Code's own enforcement statements** to quote: "Permission rules are enforced by Claude Code, not by the model. Instructions in your prompt or CLAUDE.md shape what Claude tries to do, but they don't change what Claude Code allows"; "Deny rules block in every mode, including bypassPermissions". And Switch: "The working directory is the strongest control you have."
- **Residual risks**, stated: wrong-actor (mitigated by hook, finding 5), Switch's `mcp__switch` tools can post anywhere the agent is a member, the judge's `~/.claude/settings.json`/`CLAUDE.md` also load (user scope), stored-note injection.

### 17. CLAUDE.md loading facts that affect the repo layout [verified: memory doc]
CLAUDE.md is loaded from the cwd **and every parent directory**, plus `~/.claude/CLAUDE.md`; it is "context, not enforced configuration… use a PreToolUse hook instead". So: do **not** add a developer `CLAUDE.md` at the repo root (it would load into the agent's session because `agent/` is under it) — or use `agent/.claude/settings.json` `claudeMdExcludes` (local/user key, not reliable). Keep `agent/CLAUDE.md` under 200 lines, and since Switch already appends the agent instructions to the system prompt, make `CLAUDE.md` a 10-line backstop (identity rule, refusal rule, "never invent numbers").

### 18. What happens when the MCP server fails to start, and how to make it not matter [verified: mcp + cli docs]
"Stdio: a first-connection failure isn't retried automatically"; with `--mcp-config`/SDK Claude Code waits up to `MCP_TIMEOUT` (30 s default) for pending servers before the first turn; `claude mcp list` shows `✘ Failed to connect`. With everything else denied, a failed server means an agent with no tools that will say so. Mitigations: `npm run setup` builds `dist/` and runs `node dist/mcp/server.js --selfcheck` (opens DB, lists tools, exits 0); `scripts/doctor.ts` prints `claude mcp list` output; keep startup <500 ms (no network, lazy DB); add `"timeout": 60000` per-server only if a tool can take long (PDF generation is ms). Put "if the agent says it has no orderroom tools, run `npm run doctor`" in the README.

### 19. PDF: pdfkit's built-in Helvetica cannot draw ₹ [verified: pdfkit docs + font coverage]
"PDFKit does not do any automatic font substitution" and the standard 14 fonts lack U+20B9. Vendor `fonts/NotoSans-Regular.ttf` (+ Bold; Noto Sans is the reference glyph source for U+20B9 on codepoints.net, OFL-licensed), then `doc.registerFont('body', 'fonts/NotoSans-Regular.ttf'); doc.font('body')`. `new PDFDocument({ size: 'A5', margin: 28 })`; pipe to `fs.createWriteStream`, call `doc.end()`, and **await the stream's `finish` event** before returning `invoice_path` (otherwise the agent posts a truncated file). Invoice as MCP resource (`invoice://INV-2026-0012`, `blob` base64, `mimeType: application/pdf`) is cheap with `registerResource` + `ResourceTemplate` and Claude Code exposes `ReadMcpResourceTool`/`@orderroom:invoice://…`, but nothing verified today lets the agent attach that PDF to the room — so keep the LLD's `invoice_text` fallback as the primary path and the resource as a demo extra.

### 20. Testing plan that actually exercises the contract [verified: SDK v2 testing page, vitest pool doc]
- Domain + authorization: `new Database(':memory:')` per test, apply `schema.sql`, seed; `it.each(matrix)` over (tool × role × from-state) → expected code. This file is the "trick the agent" guarantee; print it as a table in the README.
- MCP contract, in-process: `InMemoryTransport.createLinkedPair()` (from `@modelcontextprotocol/client` — "the halves of a linked pair must come from the same package's import") connecting a real `Client` to `createServer()`; or `createMcpHandler(createServer)` + `fetch: (url, init) => handler.fetch(new Request(url, init))` for the 2026-07-28 era. Assert `listTools()` names/descriptions (snapshot), `callTool` returns `structuredContent` that parses with the output schema, refusals are `isError`-free envelopes, bad input comes back `isError: true`. Close client first, then handler, in `afterEach`.
- One real stdio test: `new StdioClientTransport({ command: 'node', args: ['dist/mcp/server.js'] })` → `listTools()`; this is the only test that catches stdout pollution and env handling.
- vitest: keep the default `pool: 'forks'` ("native-language libraries… run into segfaults" under `threads`); never set `pool: 'threads'`.
- CI: `npm ci && npm run build && npm test` on push (already planned).

---

## 1. Claude Code configuration facts

All from code.claude.com/docs (settings, permissions, permission-modes, mcp, cli-reference, memory, hooks, tools-reference, security) read today.

### 1.1 Settings files and precedence
- Files: `~/.claude/settings.json` (user), `.claude/settings.json` (shared project), `.claude/settings.local.json` (project local), managed. Precedence highest-first: managed → `--settings` → local → project → user. **List keys merge** (`permissions.allow` etc.), so our project denies add to whatever the host user has.
- Strict JSON (no comments / trailing commas). Settings are hot-reloaded. Validate with the published schema (`$schema` line).
- Keys that don't take effect from project scope: `permissions.defaultMode` values `auto` and `bypassPermissions` (user/managed only, or `--permission-mode`). Irrelevant for us because Switch always passes `permissionMode` (source-read), but it means `.claude/settings.json` cannot force a mode on a judge's interactive run.
- Project `allow` rules, `additionalDirectories`, most `env` wait for workspace trust; `deny`/`ask` apply immediately.
- Cloud sessions read different files — not relevant (Switch runs locally).

### 1.2 Permission rule syntax (exact)
- Bare `Tool` matches all uses; `Tool(specifier)` scopes it. Bare deny **removes the tool from context**.
- MCP: `mcp__<server>` (all tools), `mcp__<server>__*` (all), `mcp__<server>__<tool>` (one). Server names with `.`/spaces become `_`. Allow-side globs only after a literal `mcp__<server>__`; `"mcp__*"` as an allow is skipped. Deny/ask accept tool-name globs (`"*"`, `"mcp__*"`).
- Parameter rules `Tool(param:value)` work for built-ins in deny/ask; `mcp__` rules with parentheses in settings files are skipped (use `--disallowedTools` for those).
- `Read`/`Edit` paths use gitignore syntax; `//abs`, `~/home`, `/settings-relative`, `./cwd-relative`. `Write(path)`, `Glob(path)`, `NotebookEdit(path)` never match. `WebFetch(domain:host)`; bare `WebFetch` and `WebFetch(domain:*)` differ (the latter also edits the sandbox allowlist).
- `Agent(Explore)` style rules restrict subagents; bare `Agent` removes the tool.
- Deny-first precedence also holds over PreToolUse hooks ("Claude Code evaluates deny and ask rules regardless of what a PreToolUse hook returns").

### 1.3 Permission modes and flags
- Modes: `default` (Manual, reads only), `acceptEdits`, `plan`, `auto` (classifier; broad `Bash(*)`/`Agent` allow rules are dropped while in auto), `dontAsk` (anything that would prompt is denied), `bypassPermissions` (deny rules still block; refused as root).
- `-p` / SDK runs with no mode start in `default`; since v2.1.302 "Calls needing approval are denied unless you approve them with an allow rule, hook, canUseTool callback, or --permission-prompt-tool". For terminal testing in `agent/`: `claude --permission-mode auto` or rely on the project allow rule after trusting the folder.
- Flags: `--allowedTools` = auto-approve (does **not** restrict); `--tools` = restrict built-ins ("doesn't affect MCP tools; to deny those too, use `--disallowedTools "mcp__*"`"); `--disallowedTools` = deny rules (bare name removes); `--permission-mode {default|acceptEdits|plan|auto|dontAsk|bypassPermissions}`; `--mcp-config` + `--strict-mcp-config`; `--max-turns` (print mode only); `--settings`; `--append-system-prompt(-file)`; `--setting-sources user,project,local`; `--restricted` (removes command/code/WebFetch tools and loads only managed + `--settings` — a nice one-liner for judges who want a locked-down manual run: `claude --restricted --settings ./agent/.claude/settings.json`).
- MCP `_meta["anthropic/requiresUserInteraction"]: true` on a tool forces a human prompt in every mode (even bypass). Through the Agent SDK the prompt reaches `canUseTool`, i.e. Switch posts an approval card in the room — to the *agent owner*, not to the manager role. Not a substitute for our role check; optionally mark `register_user` with it as a visible "a human must click" demo.

### 1.4 MCP specifics
- `.mcp.json` format and env expansion: finding 2. Per-server `timeout` (ms, ≥1000) overrides `MCP_TOOL_TIMEOUT`; `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` defaults to 30 min for stdio.
- Naming: `mcp__<server>__<tool>`; anything outside `[A-Za-z0-9_-]` becomes `_`; the full name must be ≤128 chars or the tool is silently left out.
- Output: warning >10,000 tokens; `MAX_MCP_OUTPUT_TOKENS` default 25,000; text results >50,000 chars are saved to a file (raise per tool with `_meta["anthropic/maxResultSizeChars"]`); `isError` text >~11k chars keeps first/last 5k.
- Tool search: on by default; server `instructions` ≤4,096 chars and loaded upfront; tool descriptions ≤4,096 (upfront) / 16,384 (deferred); `alwaysLoad` per server in `.mcp.json` or per tool via `_meta["anthropic/alwaysLoad"]`; `ENABLE_TOOL_SEARCH=false` loads all upfront.
- Annotations Claude Code acts on: `readOnlyHint` (parallel execution), `idempotentHint`.
- Resources: `@server:scheme://path` in prompts; `ListMcpResourcesTool`/`ReadMcpResourceTool` built-ins.
- Project-scope approval prompt only in interactive sessions; `enableAllProjectMcpServers` / `enabledMcpjsonServers` / `disabledMcpjsonServers` (any file; ignored in untrusted folders).
- Failure: stdio first-connection failure not retried; `/mcp reconnect all`; remote servers retry 3× on connect and 5× with backoff mid-session.

### 1.5 CLAUDE.md
Load order: managed → `~/.claude/CLAUDE.md` → `./CLAUDE.md` or `./.claude/CLAUDE.md` (+ `.claude/rules/*.md`) → `CLAUDE.local.md`; parents of cwd load at launch, subdirectories on demand; `@path` imports (external imports need approval in project files); HTML comments stripped; target <200 lines. "Claude treats them as context, not enforced configuration."

### 1.6 Hooks (for finding 5)
PreToolUse input: `session_id`, `cwd`, `permission_mode`, `tool_name`, `tool_input`, `tool_use_id`, and for MCP tools `mcp_server: {name, source}` ("base trust decisions on `source`"). Output `hookSpecificOutput: { hookEventName:'PreToolUse', permissionDecision: allow|deny|ask|defer, permissionDecisionReason, updatedInput, additionalContext }`; exit 2 = deny with stderr as reason; precedence deny > defer > ask > allow. UserPromptSubmit input has `prompt`; it can block (`decision:'block'`) or add `additionalContext`. Matchers: plain names or regex; `mcp__orderroom__.*` (bare `mcp__orderroom` matches nothing). Hooks inherit the parent env plus `CLAUDE_PROJECT_DIR`. Default timeout 30 s; use `"onFailure": "block"` for gates.

### 1.7 Built-in tool names (for the deny list)
`Agent, Artifact, AskUserQuestion, Bash, CronCreate/CronDelete/CronList, Edit, EndConversation, EnterPlanMode, EnterWorktree, ExitPlanMode, ExitWorktree, Glob, Grep, ListAgents, ListMcpResourcesTool, LSP, Monitor, NotebookEdit, PowerShell, PushNotification, Read, ReadMcpResourceTool, RemoteTrigger, ReportFindings, ScheduleWakeup, SendFeedback, SendMessage, SendUserFile, ShareOnboardingGuide, Skill, SubagentHandback, TaskCreate/TaskGet/TaskList/TaskStop/TaskUpdate, TodoWrite, ToolSearch, WaitForMcpServers, WebFetch, WebSearch, Workflow, Write`. `MultiEdit` is legacy but still accepted in rules; `TaskOutput` removed. Do not deny `ToolSearch`/`WaitForMcpServers`/`EndConversation`/`AskUserQuestion` (Switch uses AskUserQuestion for room questions). A deny naming a tool that doesn't exist only produces a startup warning.

---

## 2. Anthropic's guidance on tools for agents, applied to our 14 tools

Sources: *Writing tools for agents* (engineering blog), *Building effective agents* (Appendix 2), platform.claude.com *Define tools* ("Best practices for tool definitions"), MCP spec security considerations.

Concrete rules extracted:
1. "Build a few thoughtful tools targeting specific high-impact workflows", "consolidate multi-step operations into one call"; "too many tools or overlapping tools can distract agents". → `create_order_draft` already resolves + checks in one call (good); `confirm_order` reserves + invoices in one call (good). Drop `check_stock` (overlap).
2. "Provide extremely detailed descriptions… at least 3–4 sentences": what, when, when not, each parameter, caveats, what the tool does *not* return. → Rewrite all 14 descriptions; budget ~600–900 chars each (well under 4,096).
3. "Use unambiguous parameter names (`user_id` not `user`)." → `retailer_id`, `product_id`, `qty_cases`, `amount_paise`, `target_sender_id`.
4. "Return high-signal fields… avoid low-level identifiers"; "map technical IDs to natural language" — include names/codes alongside ids; add `response_format: 'concise' | 'detailed'` to `get_order`, `list_open_orders`, `daily_summary`; keep ids in detailed output.
5. "Write error responses that state specific, actionable fixes, with examples of correct input" → `next_step` field (finding 12).
6. "Poka-yoke… change the arguments so that it is harder to make mistakes" → strict enums, integer-only quantities, `.max()` caps, `message_id` required.
7. "Describe each tool as you would to a new hire… make implicit context, query formats, niche terms explicit" → spell out Hinglish conventions in `find_*` descriptions ("query is a store/product name as the person said it, e.g. 'sharma ji' or 'nudal'; do not translate").
8. "Use tool annotations to disclose open-world access or destructive changes" → annotations on every tool; `openWorldHint: false` everywhere (no network).
9. "Ask for an explanation, not reasoning" → `note`/`reason` are fine.
10. Evaluation: "Have agents output reasoning and feedback before tool calls… track accuracy, runtime, tool call counts, token consumption, tool errors" → log per-call latency and error codes in `audit_log` and print a one-line stats summary in `daily_summary` (also a nice judge metric).
11. Naming scheme: prefix-based vs suffix-based "varies by LLM — choose according to your own evaluations"; MCP's `mcp__orderroom__` prefix already namespaces, so plain verbs are right.
12. Spec: "Servers MUST validate all tool inputs, implement proper access controls, rate limit tool invocations, sanitize tool outputs" → zod, role checks, per-actor rate limit, note sanitisation.

---

## 3. MCP TypeScript SDK specifics (v2, with v1 fallbacks)

| Topic | v2 (`@modelcontextprotocol/server`) [verified] | v1.x (`@modelcontextprotocol/sdk`) [verified] |
|---|---|---|
| Install | `npm i @modelcontextprotocol/server zod@^4.2` | `npm i @modelcontextprotocol/sdk zod` (zod 3.25+ or 4) |
| Imports | `McpServer` from `@modelcontextprotocol/server`; `serveStdio`/`StdioServerTransport` from `@modelcontextprotocol/server/stdio`; `import * as z from 'zod/v4'` | `@modelcontextprotocol/sdk/server/mcp.js`, `@modelcontextprotocol/sdk/server/stdio.js` |
| Register | `registerTool(name, {title, description, inputSchema: z.object(...), outputSchema, annotations}, handler)`; `.tool()` removed | `registerTool` with raw shape `{a: z.number()}` or object; `.tool()` deprecated |
| Results | `{content:[{type:'text',text}], structuredContent, isError?}`; SDK validates structuredContent vs outputSchema; thrown errors → `isError:true` | same shape |
| Errors | `ProtocolError`/`ProtocolErrorCode` for resources/prompts; tools use `isError` | `McpError`/`ErrorCode` |
| Serve | `serveStdio(() => createServer(), { onerror })`; factory must return a fresh server each call | `await server.connect(new StdioServerTransport())` |
| Logging | stderr only; `ctx.mcpReq.log(level, data)` MCP logging is deprecated as of 2026-07-28 — don't bother | `server.sendLoggingMessage` |
| Resources | `registerResource(name, uri | new ResourceTemplate('invoice://{no}', {list: undefined}), metadata, async (uri, vars) => ({contents:[{uri: uri.href, mimeType:'application/pdf', blob: base64}]}))` — `metadata` is required (`{}` if none) | same, `metadata` optional |
| Testing | `InMemoryTransport.createLinkedPair()` (from `@modelcontextprotocol/client`), or `createMcpHandler(createServer)` + `handler.fetch`; `StdioClientTransport` from `@modelcontextprotocol/client/stdio` | `@modelcontextprotocol/sdk/inMemory.js` [unverified path — reported by third-party guides] |
| Inspector | `npx @modelcontextprotocol/inspector --cli node dist/mcp/server.js --method tools/list` (run once with `--protocol-era modern` and once `legacy`) | same |

better-sqlite3 in a long-running stdio process [verified: api.md + stdio page]:
- Open once, lazily; `db.pragma('journal_mode = WAL')`; `db.pragma('foreign_keys = ON')` (per connection); `timeout` option default 5000 ms for `SQLITE_BUSY`.
- Transactions: sync functions only; `immediate` variant for writers; nested = savepoint; throw = rollback.
- Shutdown: stdin EOF closes the transport; clear keep-alives in `server.server.onclose` and call `db.close()`; also `process.on('SIGINT'/'SIGTERM')` → `handle.close()`.
- Dashboard reader: `new Database(path, { readonly: true })` on a WAL database works while the `-wal`/`-shm` files exist and the directory is writable by the same user (the MCP writer keeps them alive); do **not** use `immutable=1` (stale reads) [unverified for better-sqlite3 specifically; verified at the SQLite level].
- vitest: default `forks` pool; threads can segfault native modules.

---

## 4. Human-in-the-loop approval patterns (what to copy)

| System | Identity binding | Replay / exactly-once | Self-review |
|---|---|---|---|
| Slack interactive buttons [verified] | `block_actions` payload carries `user.id`/`username`/`team_id`; request authenticated by `X-Slack-Signature` = HMAC-SHA256(`v0:ts:body`) with 5-minute timestamp window; verification token deprecated | `trigger_id` single-use, expires in 3 s | app-defined |
| GitHub environments [verified] | Required reviewers are named users/teams with read access; up to 6; one approval suffices; job can't read secrets until approved | — | "prevent self-review" option |
| OpenAI Agents SDK [verified] | `needs_approval` (bool or async policy; fails closed if args can't be inspected); run returns `interruptions`; `state.approve/reject`; "Do not take the reviewer's identity from the approval request body"; validate decisions server-side; consume pending requests atomically | "Approval permits a tool call to execute; it does not guarantee exactly-once execution" → idempotency keys | — |
| LangGraph [verified] | `interrupt(payload)` + `Command(resume=…)`, needs a checkpointer + thread id; payload may edit args (`{"action":"approve","subject":…}`) | "the runtime restarts the entire node from the beginning" on resume → side effects before the interrupt must be idempotent | — |

OrderRoom mapping (for the README and LLD §4/§8):
- Proposal = `create_order_draft` → `needs_approval` with `approvers` handles (mention them).
- Approval = a *new* message from a manager; its puppet sender id is platform-authenticated by Telegram/Mattermost + Switch bridge; `approve_order(actor=that id, message_id=that message)` is the bound decision; `changes` = LangGraph-style "edit then approve".
- Atomic consumption = the `(message_id, action)` key + state check inside one transaction.
- Self-review = optional `PREVENT_SELF_APPROVAL` rule.
- The "approval token" question: a token visible to the model is as forgeable as the actor field. Only out-of-model binding (hook stamping, finding 5; or Switch-side verification) is unforgeable. Say this honestly; judges prefer a true statement over a decorative nonce.

---

## 5. Prompt injection and security for a chat-facing bot

- Willison, *The lethal trifecta* [verified]: private data + untrusted content + external communication; "LLMs are unable to reliably distinguish the importance of instructions based on where they came from"; "95% is very much a failing grade"; MCP makes assembling the trifecta easy. Our answer: remove the external-communication leg (no web/shell/subagents; single output channel = the room), and make consequential actions impossible without a code-side role/state check.
- OWASP LLM01:2025 [verified] strategies: constrain model behaviour; define/validate output formats with deterministic code; input/output filtering; least privilege ("handle extended functions in code rather than exposing them to the model"); human approval for high-risk actions; segregate and identify external content; adversarial testing.
- OWASP LLM06:2025 [verified]: minimize extensions, functionality, permissions; avoid open-ended extensions ("a dedicated file-writing tool instead of a shell command tool"); execute in the user's context; require approval; **complete mediation**; sanitize I/O; log/monitor; rate-limit.
- Beurer-Kellner et al. 2025 [verified]: six patterns; we are Action-Selector-like with code-mediated actions; quote the constraint principle.
- Claude Code security doc [verified]: Manual mode fail-closed; "Avoid piping untrusted content directly to Claude"; WebFetch summarises pages through a separate model; MCP servers are not security-audited by Anthropic — "write your own MCP servers or use MCP servers from providers that you trust".
- Switch docs [verified]: three-factor test; "Switch shows the tools an agent declared when it registered and never rechecks them"; "An agent can reach everything its owner can reach"; "Content from a bridged channel can reach agents if anyone in that channel can post."

Concrete items for OrderRoom that fall out of this and are not yet in the LLD:
1. Per-actor rate limit on write tools (count `audit_log` rows in the last 60 s; `RATE_LIMITED` code).
2. Sanitise and bound `note`, `reason`, `handle`, `display_name`, `query` (length, control chars, no newlines); echo user text quoted and labelled.
3. `register_user`: `target_sender_id` must start with `@`, contain `:`, no whitespace, ≤200 chars; manager only; audit both sender ids.
4. Adversarial test file (`tests/injection.test.ts`): messages that claim roles, that embed fake `[Switch]` lines, that ask to "cancel all orders", "set credit limit", "read /etc/passwd" — assert either `FORBIDDEN_ROLE`/no such tool.
5. README threat model table: asset → threat → control → evidence (test name).

---

## 6. Idempotency and audit design (confirmation + improvements)

Confirmed: `(message_id, action)` unique on `outcome='ok'` is the right key (Stripe stores results only "after the execution of an endpoint begins", so failed validation can be retried). Improvements: `request_hash` conflict detection; do the idempotency insert inside the `immediate` transaction so the unique index is the lock; return `idempotent: true` with the stored `after_json`; keep refused/error rows (they are the security log). Event-sourcing-lite: `before_json`/`after_json` already give replayable diffs; add `seq` (= `id`) as the dashboard fingerprint (LLD already uses `max(audit_log.id)`).

Transaction shape (pseudo):
```ts
const approve = db.transaction((a: Args) => {
  const key = { message_id: a.message_id, action: 'approve_order', request_hash: hash(a) };
  const prior = findOk(key);                 // same key, same hash → replay
  if (prior) return replay(prior);
  if (findOkDifferentHash(key)) throw refuse('IDEMPOTENCY_CONFLICT');
  const { user, role } = identity.resolve(a.actor);       // UNKNOWN_ACTOR
  assertRole(role, ['manager']);                           // FORBIDDEN_ROLE
  const order = loadForUpdate(a.order_id);                 // NOT_FOUND
  assertTransition(order.status, 'confirmed');             // INVALID_TRANSITION
  applyChanges(order, a.changes); reserveStock(order);     // INSUFFICIENT_STOCK (CHECK constraint backs it)
  const invoice_no = nextInvoiceNo();
  writeOrder(order, { status:'confirmed', approved_by:user.id, invoice_no });
  audit({ ...key, actor_id:user.id, actor_role:role, before, after, outcome:'ok' });
  return result;
}).immediate;
```
Refusals are written in their own tiny transaction (`outcome:'refused'`) *after* the main one rolled back, so the audit row survives.

---

## 7. Hindi/Hinglish speech-to-text for a Telegram voice note

Facts [verified]:
- Telegram `Voice` object: `file_id`, `file_unique_id`, `duration`, `mime_type`, `file_size`; bots download via `getFile` → `https://api.telegram.org/file/bot<token>/<file_path>`, ≤20 MB, link valid ≥1 h (library docs mirroring the Bot API). Switch's Telegram adapter tags voice as `voice.ogg` / `audio/ogg` [source-read] — and the session host's attachment allow-list has no audio type (finding 7).
- OpenAI: `gpt-transcribe` recommended; `whisper-1`/`gpt-4o(-mini)-transcribe` deprecated (shutdown 2027-02-26); formats on the current page: mp3, mp4, mpeg, mpga, m4a, wav, webm (no ogg); 25 MB; `prompt` for vocabulary (224 tokens on whisper-1), `languages` (plural) on gpt-transcribe; price $0.006/min (4o) / $0.003/min (4o-mini) — gpt-transcribe per-minute price not captured.
- Sarvam: `POST https://api.sarvam.ai/speech-to-text`, header `api-subscription-key`, multipart `file` (WAV/MP3/AAC/AIFF/**OGG/OPUS**/FLAC/MP4/M4A/AMR/WMA/WebM/PCM-16k), `model` = `saaras:v4` (default) | `saaras:v3` (`mode: transcribe|translate|verbatim|translit|codemix`), `language_code` (`hi-IN`, `en-IN`, … or `unknown`), `with_timestamps`, `keyterms` (≤50, v4 only); response `{request_id, transcript, language_code, language_probability?, timestamps?}`; ₹30/hour billed per second; ₹100 free credits for new accounts (was ₹1,000); REST endpoint intended for clips <30 s (batch API for longer).

Recommendation: Sarvam `saaras:v4`, `language_code: "unknown"` (auto; Hinglish comes back as Devanagari/Latin mix — tell the agent to normalise), with `keyterms` from the seed (retailer names, product names, "case", "peti", "das", "paanch").

```ts
// src/transcribe/sarvam.ts
export async function transcribe(filePath: string) {
  const form = new FormData();
  form.append('file', new Blob([await fs.readFile(filePath)], { type: 'audio/ogg' }), 'voice.ogg');
  form.append('model', 'saaras:v4');
  form.append('language_code', 'unknown');
  form.append('keyterms', JSON.stringify(KEYTERMS));
  const res = await fetch('https://api.sarvam.ai/speech-to-text', {
    method: 'POST', headers: { 'api-subscription-key': process.env.SARVAM_API_KEY! }, body: form,
  });
  if (!res.ok) throw new Error(`sarvam ${res.status}: ${await res.text()}`);
  const j = await res.json() as { transcript: string; language_code?: string; request_id?: string };
  return { text: j.transcript, language: j.language_code ?? 'unknown' };
}
```
Equivalent curl: `curl -X POST https://api.sarvam.ai/speech-to-text -H "api-subscription-key: $SARVAM_API_KEY" -F file=@voice.ogg -F model=saaras:v4 -F language_code=unknown`.
Fallback (if Sarvam signup stalls): `gpt-transcribe` after `ffmpeg -i voice.ogg -ar 16000 voice.wav`, `languages: ['hi','en']`, `prompt: 'FMCG order: cases, noodles, biscuits, store names'`.
LLD §16: replace `OPENAI_API_KEY` with `SARVAM_API_KEY` (keep OpenAI optional).

---

## 8. PDF invoice generation in Node

- pdfkit [verified]: `new PDFDocument({ size: 'A5', margin: 28 })` (points; `[w,h]` also allowed); `doc.pipe(fs.createWriteStream(path))`; `doc.end()`; standard 14 fonts only; `registerFont(name, pathOrBuffer)` with TTF/OTF/TTC; no font substitution → ₹ needs an embedded TTF. Noto Sans has U+20B9. Await the write stream's `finish`.
- Alternatives considered: `pdf-lib` (also needs `fontkit` + TTF for ₹, more verbose for tables), Puppeteer/HTML (heavy; a Chromium download on a judge's machine is a risk). pdfkit stays.
- Layout tip: draw the table with fixed column x-positions and `doc.text(str, x, y, { width, align:'right' })`; format money with `Intl.NumberFormat('en-IN', { style:'currency', currency:'INR' })` → `₹1,23,456.00` (Indian grouping for free).

---

## 9. Testing the agent's tools

- Table-driven authorization: `const roles = ['salesman','manager','warehouse','delivery','unknown']` × `writeTools` × `fromStatus`; expected `ok | FORBIDDEN_ROLE | INVALID_TRANSITION | UNKNOWN_ACTOR`; one `it.each` with a readable name per row; export the matrix to markdown for the README.
- Contract tests (in-process, SDK v2 testing page): list tools → snapshot `{name, description.length ≤ 4096, annotations}`; for each tool call with valid args → `structuredContent` parses with the *same* zod output schema; call with bad args → `isError: true` and message contains the field name; refusals are not `isError`.
- Spawn test: `StdioClientTransport` against `dist/mcp/server.js` with `ORDERROOM_DATA_DIR` pointing at a temp dir; assert `listTools().length === 13/14` and that stderr contains the ready line and stdout only JSON.
- Idempotency test: same `message_id` twice → one audit `ok` row, second response `idempotent:true`; same `message_id` different args → `IDEMPOTENCY_CONFLICT`.
- Invoice test: file exists, size > 1 KB, starts with `%PDF`, number sequence strictly increasing, void on cancel recorded in audit.
- Prompt-level smoke (manual, recorded): `cd agent && claude --permission-mode auto -p "Ravi (@switch-user-ravi:x) says: sharma ko das case noodles. message id m1."` — confirms Claude Code picks up `.mcp.json` and the deny list (`/context` or `--verbose` shows no Bash/Edit tools).

---

## Sources (read Nov 3, 2026)

Claude Code / Anthropic
1. https://code.claude.com/docs/en/settings
2. https://code.claude.com/docs/en/permissions
3. https://code.claude.com/docs/en/permission-modes
4. https://code.claude.com/docs/en/mcp
5. https://code.claude.com/docs/en/cli-reference
6. https://code.claude.com/docs/en/memory
7. https://code.claude.com/docs/en/hooks
8. https://code.claude.com/docs/en/tools-reference
9. https://code.claude.com/docs/en/security
10. https://code.claude.com/docs/en/settings-reference (index portion)
11. https://code.claude.com/docs/en/errors (index portion)
12. https://code.claude.com/docs/en/agent-sdk/typescript
13. https://www.anthropic.com/engineering/writing-tools-for-agents
14. https://www.anthropic.com/engineering/building-effective-agents
15. https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools (redirect target of …/implement-tool-use)

MCP
16. https://modelcontextprotocol.io/docs/develop/build-server
17. https://modelcontextprotocol.io/specification/2025-06-18/server/tools
18. https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md
19. https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/README.md
20. https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md
21. https://ts.sdk.modelcontextprotocol.io/v2/
22. https://ts.sdk.modelcontextprotocol.io/v2/servers/tools.html
23. https://ts.sdk.modelcontextprotocol.io/v2/servers/errors.html
24. https://ts.sdk.modelcontextprotocol.io/v2/servers/resources.html
25. https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html
26. https://ts.sdk.modelcontextprotocol.io/v2/servers/logging-progress-cancellation.html
27. https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2.html
28. https://ts.sdk.modelcontextprotocol.io/v2/testing.md

Switch
29. https://docs.switchagents.ai and https://docs.switchagents.ai/llms.txt
30. https://docs.switchagents.ai/switch-rooms/getting-started/agent-settings.md
31. https://docs.switchagents.ai/switch-rooms/getting-started/set-up-agent-providers.md
32. https://docs.switchagents.ai/switch-rooms/internals/agent-events.md
33. https://docs.switchagents.ai/switch-rooms/internals/life-of-a-message.md
34. https://docs.switchagents.ai/switch-rooms/internals/identity-and-access.md
35. https://docs.switchagents.ai/switch-rooms/internals/connectors-and-runtime.md
36. https://docs.switchagents.ai/switch-rooms/administer/room-templates.md
37. https://docs.switchagents.ai/switch-rooms/deploy/messaging-apps/telegram.md
38. https://docs.switchagents.ai/switch-rooms/resources/working-safely-with-agents.md
39. https://github.com/sandbox-quantum/switch/blob/main/docs/TEMPLATES.md
40. https://github.com/sandbox-quantum/switch/blob/main/docs/design/agent-controllers-v1.md
41. Switch source (main): `console/packages/agent-providers/src/claude/claude-adapter.ts`, `…/claude/claude-mapping.ts`, `console/packages/plugins/src/agents/impl/claude/subagents.ts`, `core/switch_core/providers/advanced_fields.py`, `console/packages/agent-providers/src/host/attachments.ts`, `…/host/shared-host.ts`, `…/host/server.ts`, `core/switch_core/bridges/collaboration/telegram/adapter.py`, `console/docs/sdk-sessions.md`

Security
42. https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/
43. https://genai.owasp.org/llmrisk/llm01-prompt-injection/
44. https://genai.owasp.org/llmrisk/llm062025-excessive-agency/
45. https://arxiv.org/abs/2506.08837 and https://arxiv.org/html/2506.08837v3 (Design Patterns for Securing LLM Agents against Prompt Injections)

Approvals / idempotency
46. https://docs.stripe.com/api/idempotent_requests
47. https://docs.langchain.com/oss/python/langgraph/interrupts
48. https://openai.github.io/openai-agents-python/human_in_the_loop/
49. https://docs.slack.dev/interactivity/handling-user-interaction
50. https://docs.slack.dev/reference/interaction-payloads/block_actions-payload
51. https://docs.slack.dev/authentication/verifying-requests-from-slack
52. https://docs.github.com/en/actions/reference/deployments-and-environments

Speech-to-text / PDF / DB / tests
53. https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe
54. https://docs.sarvam.ai/api/getting-started/pricing (via search; ₹30/h, ₹100 credits)
55. https://developers.openai.com/api/docs/guides/speech-to-text
56. https://developers.openai.com/api/docs/pricing
57. https://core.telegram.org/bots/api (Voice object; getFile limits via aiogram/tgbot mirrors)
58. https://pdfkit.org/docs/text.html and https://pdfkit.org/docs/getting_started.html
59. https://codepoints.net/U+20B9 (Noto Sans glyph coverage)
60. https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
61. https://vitest.dev/config/pool
62. SQLite `readonly_shm` / WAL read-only behaviour (sqlite.org test artifacts via search) — [unverified for better-sqlite3]
