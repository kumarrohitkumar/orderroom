# OrderRoom — Decisions (one page, frozen Nov 3)

Read this on Nov 4 morning. Nothing here gets re-debated during the build; new facts from the hour-1 checks get appended under "Resolved on Nov 4".

## In (core, must ship by Nov 6 noon)
- One agent `orderroom-agent`, alias `desk`, `addressing: anyone`, in two rooms: `orderroom-field` (Telegram group, adopted) and `orderroom-office` (Mattermost, from the template).
- 16 tools (7 read, 9 write) over SQLite via an MCP v2 stdio server; rules engine in code: role × action × state matrix, OVER_CREDIT / OVERDUE / SHORT_STOCK reasons, scheme 10+1 on one SKU, partial fulfilment with backorder, Stripe-style idempotency, audit with `message_id`, rate limit, sanitisation.
- Identity stamping hooks (`UserPromptSubmit` + `PreToolUse`) so the model cannot choose `actor_handle`.
- Typed approvals only: `@desk approve 1045, biscuit 3`. No emoji-reaction approvals (reactions never reach agents).
- Approval card with credit context (outstanding, headroom after, oldest due days, last payment, avg monthly purchase).
- "Usual order", "kya pending hai", party dues, DSR-style daily summary.
- Bill PDF with ₹ (Noto Sans) posted via `send_attachment`; text bill fallback. Pick list to godown via `send_targeted_message`.
- Template `version: 2` carrying instructions, addressing, auto_mode/auto_approve, model, `advanced_config` (tools allow-list, disallowed, maxTurns), room instructions, alias, kickoff.
- Tests: authorization matrix, rules, idempotency, contracts (in-memory transport), stdio spawn, injection, bill, hook regex. CI on push.
- README in the judging-driven order (LLD §18) incl. "Why Switch is central", clean-room timed setup, Switch Trust rule names, Feedback for the Switch team.
- Video ≤ 3:00, uncut lifecycle, refusal + trick with the audit row on screen, setup time-lapse with a visible clock.

## Cut (not in v1; say so in README)
- WhatsApp (Switch #789), scheme claims, credit notes, batch/expiry, route planning, approval reminders (Switch has no scheduler, #771), multi-tenant, ERP sync, second agent (Switch guidance: add rooms, not agents; sessions don't pick up live instruction edits).
- `check_stock` tool (overlaps `find_product`). Emoji approvals. Whisper (deprecated, no `.ogg`). MCP SDK v1 / zod 3. Root `CLAUDE.md`. Any deny on `mcp__*`.

## Stretch (only after step 8 of LLD §19, in this order)
1. Voice notes via `read_context` → `download_attachment` → Sarvam Saaras v4 → echo "Samjha… sahi?" (feasibility = check #6; cut by Nov 5 evening if not working).
2. Dashboard (SSE, read-only), only after the video is recorded.
3. `participant_id` strong key filled from `read_context`.
4. `PREVENT_SELF_APPROVAL` flag.

## Fallback ladder (pre-decided)
| If | Then |
|---|---|
| `UserPromptSubmit` doesn't fire for Switch events | instruction-only stamping; README states the gap; the trick demo still works because the model is told, and the audit row shows the handle it passed |
| No cross-room posting (A) and bridge API (B) > 90 min | option C: salesman is told "sent for approval", manager uses `@desk pending`; or D: manager joins the Telegram group with a second number |
| `send_attachment` can't deliver the PDF to Telegram | post `bill_text`; keep the PDF in Mattermost |
| Extra Mattermost users not distinct in the `[Switch]` header | office demo via a second Telegram account or Discord |
| Voice download fails | scripted clip of `transcribe_voice` on a file, labelled as stretch in the video |
| MCP SDK v2 misbehaves | v1.x + zod 3 for the day; note in README |
| Running late on Nov 6 | drop in this order: dashboard, voice, delivery role (merge into godown), scheme, usual order. Never drop: approval gate, refusal demo, bill, template, README, video |

## Accounts and rules
- Claude: the existing Claude Code login is kept for the whole build (decided Nov 3). GitHub: `kumarrohitkumar`, commits as Rohit Kumar <rk8091267@gmail.com>, no co-author lines.
- First commit ≥ Nov 4 00:01 IST. No project code before that; docs are fine.
- No employer code, data, customer names or real brands; made-up everything.
- Secrets (`SARVAM_API_KEY`, Telegram bot token) only in `.env` / Switch; never in the repo or a room.

## Demo-day rules
- Every demo message mentions `@desk`. Wait for 👀 to clear before the next message (mid-turn messages queue and can't be cancelled).
- Never type `!reset`, `!compact` or any `!`/`/` command in the demo room except `!list-agents` / `!agents-status` on purpose.
- Stop the agent session in Console after any settings change, then address it.
- Fresh `npm run clean-room && npm run setup` before recording; Wispr Insights screenshot taken Nov 4 morning and at submission.

## Resolved on Nov 4 (append here)
- [x] #1 hooks fire: **yes inside Switch** (Nov 4 02:22 IST, session 9e4c481b). Real header: `[Switch] user addressed you in room <uuid> (message_id sw_…, thread_id none):` + `BEGIN/END SWITCH MESSAGE <nonce>`; no workspace-role suffix for this sender. Capture parsed it; stamp signed `daily_summary`. The deployer's Mattermost username is `user` → bound to the seeded `owner` manager (`npm run bind -- owner user`).
- [ ] #2 notifier option: …
- [x] #3 template tools applied: agent tools in a real session = 17 `mcp__orderroom__*` + Switch's `mcp__switch__*` only; **no inherited claude.ai connectors** (allow-list works). Switch exposes ~60 of its own tools incl. admin ones (archive_room, create_agent, run_template, request_agent_deletion…); 29 admin tools now denied by name in agent settings + template `disallowedTools` (50 entries, limit 64). Chat tools kept: post_message (param `body`), send_targeted_message, send_attachment, read_context, download_attachment, connect_to_room, list_*.
- [ ] #4 PDF to Telegram: …
- [ ] #5 Mattermost users distinct: …
- [ ] #6 voice download: …
- [ ] #7 alias/commands: …

## Build notes (Nov 4, day 1)
- Steps 0–4 done and most of 5: schema + seed, rules engine, all 16 tools on MCP SDK v2, PDF bill, hooks, agent config, template, setup/doctor/bind/clean-room. 55 tests green.
- Versions actually used (newer than the LLD pins): `@modelcontextprotocol/server` 2.4, zod 4.6, better-sqlite3 13, pdfkit 0.20, vitest 5, TypeScript 5.9, biome 2.6. npm 11 blocks install scripts: `better-sqlite3` and `esbuild` are approved in package.json `allowScripts`.
- Schema additions: `orders.delivered_at` and `orders.confirmed_at`. "Oldest due days" = age of the oldest unpaid bill (payments clear oldest bills first), so OVERDUE = that age > credit_days.
- **Added beyond the LLD:** the PreToolUse hook signs (handle, message_id, room_id) with `agent/.switch-ctx/stamp.key`; the server refuses unsigned writes with `UNSTAMPED`. If hooks stop firing, writes fail loudly instead of trusting the model. Fallback if hooks never fire inside Switch: `ORDERROOM_REQUIRE_STAMP=0` in `agent/.mcp.json` env + README states the gap.
- **Found:** Claude Code ignores `permissions.allow` in an untrusted folder (headless runs need `--allowedTools mcp__orderroom`, or open `claude` once in agent/ and accept trust). Check whether Switch's SDK launch hits the same thing (part of #3).
- **Found:** the agent's session inherits this account's claude.ai connectors (Atlassian, Microsoft 365). The template's `advanced_config.tools: [mcp__orderroom]` must filter them out. **Check #3 must confirm the agent's tool list in Switch is only orderroom + switch tools.** If not, deny those servers by name in agent settings before any demo.
- Demo numbers (computed by tests): Sharma draft estimate ₹16,770, exposure ₹55,270 vs ₹40,000; after "biscuit 3" total ₹14,362.80 (chat shows ₹14,363), INV-2026-0012; ₹15,000 cash → outstanding ₹23,500, oldest bill 12 d.

## Night of Nov 4 — Switch run notes
- **Docker stopped by itself** about 30 min after starting (01:52 IST). Mattermost went down; the Switch server restarted at 01:54 without its Mattermost bridge, and the first template run failed with "Bridge not running" (all-or-nothing: the created agent was deleted). Fix: Docker up → quit Console → stop stale `switch-core` → reopen Console. For the demo: Docker Desktop → Resources → Resource Saver off; start Docker at login.
- **The template form pre-fills the directory box with the literal text `{directory}`.** Typing around it saved `{/path}` and the agent could not start. Template description and README now say: clear the box, paste the bare path.
- Fix pending (needs Rohit's Console login): OrderRoom desk → settings → Directory = `/Users/my_folder/orderroom/agent` → save → `@desk introduce yourself…` in orderroom-office.
- The Mattermost bot shows as "OrderRoom desk"; whether `@desk` (alias) addresses it is still check #7.
