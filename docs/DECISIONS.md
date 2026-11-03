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
- [ ] #1 hooks fire: …
- [ ] #2 notifier option: …
- [ ] #3 template tools applied: …
- [ ] #4 PDF to Telegram: …
- [ ] #5 Mattermost users distinct: …
- [ ] #6 voice download: …
- [ ] #7 alias/commands: …
