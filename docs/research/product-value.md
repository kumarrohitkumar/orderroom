# OrderRoom — Product value research

> Question: how do we make OrderRoom the most *valuable* order-desk agent, not just a working one?
> Written Nov 3, 2026 from 36 pages read in full plus ~15 read via search summaries (list at the end). Vendor figures are flagged as vendor claims; nothing here is independently audited.

---

## Top 15 actionable recommendations

1. **Lead with "no new app" — that is the whole adoption story.** Retailers abandon separate ordering apps "within two weeks"; WhatsApp-first ordering gets 3–4× the adoption of app-only in tier-2/3; 60–70% of orders already arrive as chat/voice (RichAutomate, SpireStock, HublerX — all vendor claims but unanimous). OrderRoom's value is that the chat *is* the order book and the rules live inside it. Say this in the first 10 seconds of the video and the first line of the README.

2. **Make credit enforcement the hero, not a feature.** Credit-limit overrides run at 40–60% of orders at some FMCG companies; one case study claims overrides 55% → 8%, DSO 34 → 16 days, bad debt ₹18L → ₹2.5L after "block, don't flag" with senior-only overrides and a full who/when/why audit trail (SpireStock). That is exactly the `needs_approval` → manager → `audit_log` design. Frame it as "a credit controller who never gets talked into it".

3. **Keep approvals as one-word text, not emoji reactions.** Switch's own room guide: when an agent asks permission "reply with a bare yes or no"; a reply *with* a reason is treated as an ordinary message and the request stays open; Switch records who approved. The agent-events page lists only `message`, `command`, `room_join` — no reaction events reach the agent. So ✅-reactions are a trap for Nov 4. Design `approve 1045` / `reject 1045 <reason>` and make sure reasons are parsed from the same message (our tool can, Switch's native prompt can't).

4. **Draft = implicit confirmation; confirm = explicit confirmation; both in one message.** Google's conversation-design rules: implicitly confirm *parameters* by restating them (the draft), explicitly confirm *actions* only when hard to undo (confirming an order that reserves stock and issues an invoice). Allow a **one-step correction** ("nahi, biscuit 3") without restarting — the single most-cited UX rule across Google and Rasa.

5. **Never leave the salesman stuck: every refusal names the person who can unblock.** Switch's own convention ("replies name the blocker and the person who needs to resolve it"), NN/g (chatbots collapse when users leave the script), SINTEF (interpretation failures are the top frustration). Rule: at most **one** clarifying question, then post the best guess as a draft and @-mention the manager. Never a dead end.

6. **Fuzzy SKU matching with a one-line candidate list.** Product names are "invented strings"; typo tolerance is the biggest lever on zero-result searches on mobile keyboards (Doofinder); Rasa forum pattern: show candidates and let the user confirm. HublerX keeps an alias library per customer ("the retailer calls it 'chhota parle'"). Build `find_product` as fuzzy + aliases, return ≤3 candidates, and when there's one strong match just restate it in the draft (implicit confirmation).

7. **Mirror the user's Hinglish; keep SKU names and numbers in Latin digits.** CSCW 2020 (Microsoft Research, n=91): multilingual users strongly prefer bots that code-mix; the "nudge" policy (mix only once the user mixes) was acceptable to everyone. So: Hinglish verbs and glue ("bhej diya", "approval chahiye"), English product names, ₹ figures, no Devanagari unless the user writes it.

8. **Phone formatting rules, enforced in the agent instructions.** Telegram renders tables as raw text and splits messages at 4096 chars (Switch Telegram doc); Telegram's guidelines say bots must react "much faster than normal" and shouldn't rely on typed commands with parameters. Rules: ≤8 lines per message, one item per line, bold only the order number and the problem, one emoji per status (✅ ⚠️ ❌), no tables anywhere, no "working on it" text (Switch already marks the message 👀 and posts an elapsed-time status).

9. **Add "usual order" recall (`Sharma store ka usual`).** The first thing RichAutomate tells distributors to build is "one-tap reorder of last cycle's SKUs"; vendor data claims repeat orders per outlet 2.1 → 4.4/month. It is one SQL query (last confirmed order for the retailer) and a one-line demo moment. Rank #1 new feature.

10. **Add "kya pending hai" / "Sharma store ka kya chal raha hai" status queries.** Badho.AI (800k retailers) was built almost entirely for order/payment-status questions because people were asking them in informal WhatsApp chats. One read-only tool, zero risk, and it demonstrates the agent is useful *between* orders.

11. **Put overdue retailers in the daily summary and in the draft.** The draft already shows exposure vs limit; add "₹18,400 overdue 12 din" on the retailer line and an "Overdue" block in `aaj ka summary`. This is the collections lever (DSO) without a second agent. SpireStock's tiered alerts (80/100/110/120% utilisation, 30+ days overdue) are a good rule set to copy.

12. **One agent, not two, for v1.** Switch's own multi-agent example moves agent-to-agent back-and-forth into a side room so the main channel "reads as decisions, not edits"; its org guide says "the fix for a room doing two jobs is a second room", not a second agent; issue #1095 reports 50 messages piling up with no conversational damping and roles that silently swallow messages. In a 3-minute demo a second agent is noise. If you want a "warehouse" moment, have the *same* agent post a pick list and @-mention `suresh_wh`.

13. **Show three numbers from the seed run, in the README and the video.**
    - **"Hinglish order → checked draft in N s"** (read N from Switch's own elapsed-time status; target ≤10 s). Context: 14 min per outlet by phone/paper, 12–24 h order-to-dispatch (vendor figures).
    - **"0 of N risky orders confirmed without a manager; 100% of overrides carry who/when/why."** Context: 40–60% override rates in the wild.
    - **"0 orders rejected after confirmation: every stock, credit and SKU issue surfaced at draft time."** Context: the FMCG KPI "order rejection rate" benchmark is <3%; data validation *after* commitment is its leading cause.

14. **Silent by default, loud when it matters.** Discord/Slack practitioners: "the best bots are invisible most of the time"; bots that answer everything get switched off. Switch already delivers only addressed messages; keep follow-ups on for 5 minutes (Switch default) and do not have the agent chime in on unaddressed chatter. Scheduled messages: Switch's advice "tell the agent what to do when there's nothing new" → daily summary says "no pending approvals" rather than nothing.

15. **Name is fine; don't rebrand.** No "OrderRoom" trademark or notable product surfaced on Justia/Gleanmark/Markinton results or general search; nearest neighbours are RoomOrders (hotel room service), PAX ROOM, ORDERUP!, ORDERSTREAM — different markets. Keep "OrderRoom", add "(hackathon project)" in the README. No alternatives needed.

### Ranked feature list — (value to a real distributor × demo impact) ÷ build effort

| # | Feature | Value | Demo | Effort | Rationale and evidence |
|---|---|---|---|---|---|
| 1 | **"Usual order" recall per retailer** | High | High | Low | One-tap reorder is the first build recommended for WhatsApp B2B (RichAutomate); last-order query is trivial. |
| 2 | **Order edit before confirm (one-step correction)** | High | High | Low | Google: "allow one-step corrections… don't force restart". `approve_order(changes)` already exists; extend to salesman on `awaiting_confirmation`. |
| 3 | **"Kya pending hai" status query** | High | Med | Low | Badho.AI exists mainly for status questions; read-only, no risk. |
| 4 | **End-of-day summary with overdue block** | High | Med | Low | RetailPOS problem #10 "no real-time visibility"; already planned; add overdue + pending approvals. |
| 5 | **Overdue nudge in the draft line** | High | Med | Low | Credit case study: DSO 34→16 when exposure is visible at order time. One extra field in `find_retailer`. |
| 6 | **Pick list for warehouse (text, @-mention)** | Med | Med | Low | Picking errors are a top stock-mismatch cause (RetailPOS); it is a formatted list from a confirmed order. |
| 7 | **Partial fulfilment + backorder** | High | Med | Med | Fill rate failures = stockouts + credit (massist); "biscuit 3 hi" already does partial; backorder adds a state and a nag. Do partial now, backorder stretch. |
| 8 | **Voice notes (echo transcript, then draft)** | High | Very high | High/risky | Shopap and HublerX both lead with voice; Switch Telegram doc does not mention voice (attachments carry mimetype so audio may arrive). Keep as stretch; echo + "sahi?" is mandatory. |
| 9 | **Scheme auto-apply** | High | Low | High | Scheme leakage ₹50k–5L/quarter (RetailPOS) but it is a declared non-goal and invisible in 3 minutes. Skip; mention in Future work. |
| 10 | **Reaction-based approval (✅)** | Med | High | High/blocked | Switch delivers no reaction events to agents; Switch's own approval UX is bare "yes/no" text. Use `approve 1045`. |

---

## 1. Existing chat-based B2B ordering products

### India / emerging markets

**Bizom WhatsApp Ordering Bot** (bizom.com). Brand-facing: retailers message the brand, browse SKUs, see active schemes, order 24/7; integrated with Bizom SFA/DMS. Marketing cites "76% drop in returns / 55% sales growth" for Bizom overall, not the bot. What it does well: schemes shown next to products; ordering between salesman visits. What users say (Gartner 216 ratings, G2, Capterra): app is "slow whenever it communicates with backend server specially at EOD", "sometimes slow to respond", support "force user to give good rating". Lesson: **speed at end-of-day sync is what field staff notice.**

**Shopap** (shopap.tech). The closest analogue to OrderRoom: "WhatsApp order desk for distributors and wholesalers". Text or voice in Hindi/English/Hinglish → match to catalogue → retailer-specific price → live stock check → itemised confirmation "in seconds, not hours" → Tally export; separate collections "specialist" that sends payment reminders. Pain points it names: orders lost in busy group chats, voice-note backlogs, retailer-specific pricing errors, manual Tally entry after the rush. No credit check mentioned — **OrderRoom's enforced credit/approval is a real gap vs Shopap.**

**HublerX** (hublerx.ai). Orders arrive as text, voice notes, photos of handwritten pads, forwarded invoices, PDFs. Alias library maps "customer-specific nicknames" to ERP codes across mixed languages; credit limits enforced; off-list discounts routed for approval. Vendor claims: order error rate 12–18% → <2%; order-entry staff 12–15 → 3–4 "exception handlers" for 400 orders/day. Lesson: **the alias library and exception-only human work are the product.**

**Badho.AI** (Auriga IT case study). B2B platform with 800k retailers; bot answers order/payment/reward status over WhatsApp with controlled writes behind SQL functions that enforce business rules. Lesson: **status queries are most of the traffic, and validation sits between the LLM and the DB** — same architecture as our MCP rules engine.

**RichAutomate 2026 playbook** (vendor). Distributor margins 2–4%; reps cover 62 outlets/week at 14 min per outlet; scheme uptake 18%; retailers abandon separate apps within two weeks. Features that matter, in order: one-tap reorder of last cycle, personalised scheme cards, morning stock snapshot, outstanding statements + UPI links, DMS sync, regional language. Six anti-patterns include "forcing retailers onto a separate app" and "standalone ordering with no DMS integration (parallel order books)".

**SpireStock** (vendor, two posts). Handwritten/phone orders are 85–90% accurate and take 12–24 h to reach dispatch; salesmen spend ~60% of time taking orders; WhatsApp-first distributors reach 45–55% retailer activation in 6 months vs 15–20% app-only. Credit post: overrides 40–60% of orders; "block, don't flag"; only senior roles override; every override audited; tiered alerts at 80/100/110/120% utilisation; real-time outstanding = unpaid invoices + dispatched + confirmed − payments. Case: overrides 55% → 8%, DSO 34 → 16 days, outstanding ₹4.2 cr → ₹1.8 cr.

**RetailPOS "ten problems"** (vendor). Relevant: scheme leakage (₹50k–5L/quarter), uncontrolled retailer credit ("salespeople extend credit to drive volume… hard per-retailer limits enforced at invoicing", receivables −20–35%), warehouse mismatches from picking, no real-time visibility until month-end.

**Udaan / Bikayi / DotPe / Khatabook.** Udaan complaints (Voxya, ComplaintHub) are about refunds, failed payments, rejected returns — i.e. **money-handling trust, not UI**. Bikayi did not shut down; it pivoted to BIK.ai marketing automation, which says SMB storefront tooling was less sticky than messaging automation. No independent churn data found.

### Global chat-ordering / procurement bots

Slack and Teams examples are almost all engineering agents (below), not ordering. Procurement bots in Teams (CopilotKit, Copilot Studio) converge on the same primitive: **a card or message that suspends the run until a named human approves.** Nothing found that does Hinglish order capture in a team room; the India vendors are all WhatsApp-to-ERP, single-channel, retailer-facing. OrderRoom's differentiation: **team room (salesman + manager + warehouse in one place), role-enforced approvals, two apps bridged.**

## 2. "AI agent in team chat" products, 2025–2026

- **Switch (README, docs).** Framing: "AI teammates, not just bots"; each channel is a room; agents get "a role, instructions and tools"; "Getting humans and agents to work as one team is the part nobody has solved yet." Room guide patterns: @-mention decides who acts, not who reads; follow-ups reach the last agent for 5 min; permission requests answered with bare yes/no and Switch records who answered; attach file + mention in the same message; "keep a running log of decisions… who owns the next step"; address a *role* (`@reviewer`) to reach whoever holds it. Shared-context page recommends room instructions cover "one thread per request, narrating progress, reporting problems plainly". Telegram: agent name prefixed to messages; 👀 on the asking message while working; elapsed-time status message updated in place; tables unsupported; 4096-char split.
- **Switch multi-agent use case (product launch).** Three agents owned by three teams; detailed review moved to a side room so the main channel "reads as decisions, not edits"; "Nothing goes live until a person says so" — and the page is explicit that **Switch does not enforce that gate; tools' permissions and instructions do.** This is precisely our "rules in code" pitch; quote it in the README.
- **Switch issue #1095 (open, no maintainer reply).** Multi-agent friction: roles with no holder swallow messages silently; room-instruction edits don't reach live sessions; no pause/round state; "about fifty messages piled up while a decision waited on the human"; document ownership can't be transferred.
- **claude-threads (Claude Code in Slack/Mattermost).** Thread = session; approvals via 👍/✅/👎 reactions *because the bot itself owns the Slack app*; sticky task list; agent edits its own posts. Praised: live progress, teammates steering in-thread.
- **Claude Code in Slack (Tessl coverage).** Thread is the task context; progress posts back to the thread; PR link at the end. Praise: less context switching. Criticism: "a stray comment can derail the output" — argues for our rule that *only* structured tool calls change state.
- **Devin in Slack (docs).** @-mention starts a session, replies in-thread, `mute`/`(aside)` keywords, "Devin may make mistakes — double-check", dedicated `#devin-runs` channel. Pattern worth copying: an **aside marker** so humans can chat in the room without triggering the agent (Switch's addressed-only delivery already gives us this).
- **Slack developing-agents docs.** Set status immediately; plan blocks updated via `chat.update`; thread state keyed on `thread_ts`; feedback buttons/reactions on every answer; keep a structured state object instead of re-running lookups; ≤3 source links.
- **Microsoft Copilot Studio (roadmap, GA Sept 2026).** Per-tool human approval: run pauses, request "describes what the agent intends to do", approve / approve-for-session / deny, inline in Teams; "guardrail that works regardless of the agent's instructions". Same philosophy as our MCP role checks.
- **Discord practitioners (Hamlett, 50k members).** "The best bots are invisible most of the time and helpful when you need them"; start confidence thresholds high and lower them; uncertain cases to human review; fall back to keywords when the model is slow; moderators switch off bots that make their job harder.

**Patterns people praise:** thread-as-task; visible progress with an end state; approvals as a named-human decision recorded by the platform; the agent restating what it will do before doing it; humans able to talk around the agent without waking it; "decisions, not edits" in the main channel.

## 3. Chat UX for bots on phones

- **Confirmation (Google).** Implicit confirmation of parameters most of the time ("don't belabor it"); implicit confirmation of completed actions ("say where the details went"); explicit confirmation only before hard-to-undo actions; allow one-step corrections; let the user change any parameter without restarting.
- **Errors (Google).** No-match: brief apology + condensed re-ask; second time offer options and a best guess; never more than 2–3 retries, then "suggest other ways to complete the task"; system errors: say why, suggest next step, no vague "try later".
- **Rasa two-stage fallback.** Low confidence → ask the user to pick from top candidates → else hand off to a human.
- **Telegram guidelines.** Bots "must react much faster than what may be considered normal on other platforms"; avoid commands with parameters ("unintuitive for non-geek users"); inline keyboards for message-bound actions (Switch does not expose keyboards to the agent, so our equivalent is a copy-pasteable one-liner: `approve 1045`).
- **Formatting.** Telegram: bold/italic/code/links only, tables are raw text, 4096 split (Switch doc). Mattermost supports tables on desktop; mobile wide tables are a known pain (Kilo PR converts them to a tap-to-open chip). Rule: no tables anywhere; one line per item; totals on their own line.
- **Hinglish tone.** Mirror the user (CSCW 2020 nudge policy); keep SKU names in the catalogue's spelling so the salesman learns the canonical name; numbers as digits; short Hinglish verbs for state ("bhej diya ✅", "approval chahiye ⚠️", "nahi ho sakta ❌").
- **Draft order shape (fits 6–8 lines on a phone):**
  ```
  Draft #1045 — Sharma General Store, Karol Bagh
  • Crunchy Masala Noodles — 10 cs ✅
  • Gold Glucose Biscuits — 5 cs ⚠️ 3 in stock
  Total ₹12,300 · Exposure ₹52,300 / limit ₹40,000 ⚠️
  @amit_manager approval needed → reply: approve 1045 [changes]
  ```
- **Disambiguation shape:** `"biscuit" se 2 match: 1) Gold Glucose 2) Marie Light — number bhejo (ya "usual")`. Max one such question per order.
- **Refusal shape:** what was refused, why in six words, who can act, how: `❌ #1045 approve nahi — role: salesman. @amit_manager → "approve 1045"`.

## 4. Trust and adoption → design rules

Evidence: Gkinko & Elbanna (workplace chatbot case study) — trust is emotional + cognitive + **organisational**, formed through direct experience and sustained over time; NN/g (8-user study) — smooth on-script, breaks on deviation; SINTEF (200+ users) — interpretation failures and "strange and rude responses" dominate negative episodes; Slack Workforce Index — only 7% of desk workers find AI answers "completely trustworthy"; SpireStock — "uneven enforcement erodes trust among distributors who pay on time"; Botree review — "stock in hand is not live, so several salesmen see the same quantity".

Design rules:
1. **Speed is trust.** Draft within ~10 s; Switch's elapsed-time status makes slowness visible, so slow = embarrassing.
2. **Forgive typos, never guess silently.** Fuzzy match → restate in draft (implicit) → one question only if ambiguous.
3. **Remember the usual.** "Usual order" + alias memory make the second week faster than the first (the two-week abandonment window).
4. **Always a human exit.** Every refusal names the person and the exact reply that unblocks.
5. **Same rules for everyone, visibly.** Organisational trust comes from the manager *also* being refused when they try a warehouse-only transition. Show it once in the demo.
6. **Say what changed and where it went.** "Confirmed ✅ INV-2026-0012 attached, stock reserved, @suresh_wh pack karo."
7. **Live numbers, not yesterday's.** Stock and exposure are computed per call from SQLite — say "live" in the README; it answers the Botree complaint.

## 5. Metrics a distributor owner cares about

From the FMCG KPI lists (massist, BeatRoute, SpireStock): fill rate (>95% in 48 h), **order rejection rate (<3%; >5% damages retailer trust; leading cause is "data validation after order commitment")**, lines per productive call (4–6), scheme compliance (>90%), days of stock (12–18), DSO (vendor: 22→9 or 34→16 days with enforcement), order error rate (12–18% manual → <2%), order-to-dispatch (12–24 h → 2–4 h), minutes per order (14 → 4).

Three to show from the seed/demo run (all computable from `audit_log` + timestamps):
1. **Time to checked draft** — median seconds from salesman message to draft post across the demo orders (Switch's status line shows the number on screen).
2. **Risky orders confirmed without a manager: 0 / N; overrides with who-when-why: N / N** — one SQL over `audit_log`.
3. **Post-confirmation rejections: 0** — every stock/credit/SKU issue surfaced at draft; alternatively "SKU mentions resolved correctly: X/Y with ≤1 clarifying question".
Optional fourth: **approval latency** (draft → manager decision) — the number an owner would ask for next.

## 6. Multi-agent: recommendation

**Do not add a second agent for the hackathon.** Evidence: Switch's own three-agent example pushes inter-agent work into a side room so the main channel stays "decisions, not edits"; its org guide adds rooms, not agents, when "a room is doing two jobs"; issue #1095 documents message pile-ups, silent role addressing and instruction drift with several agents; practitioners warn bots that talk too much get switched off. A collections or warehouse agent would add a second identity, a second tool allow-list and a second failure mode for a 3-minute video whose point is *one* trustworthy teammate.

Get the same value without the cost:
- **Collections:** overdue block in `daily_summary` and the overdue figure on the draft's retailer line; optional scheduled "subah ka collections list" from the same agent ("tell the agent what to do when there's nothing new").
- **Warehouse:** the same agent posts a pick list and @-mentions `suresh_wh` on confirmation; the warehouse replies `1045 packed`.
- **If Switch's judges reward multi-agent:** describe in the README how a second agent would hold the `@collections` *role* in a linked `collections` room — using Switch's roles/linked-rooms vocabulary — as Future work.

## 7. Differentiators

See the ranked table at the top. Two additions worth a line in the README even if unbuilt: **alias memory** ("Sharma store 'chhota parle' = Gold Glucose 100g" — HublerX's core feature) and **approval SLA nudge** (draft older than 15 min re-mentions the manager — the "approval latency" metric).

## 8. Naming

"OrderRoom": no trademark hit on Justia/Gleanmark/Markinton result pages for the exact string; no product by that name in general search. Nearby marks are hotel room-service products (RoomOrders, ORDERUP!, ROOMRUSH) and ORDERSTREAM/ORDERRIGHT (restaurant/OMS). No real conflict for a hackathon project; keep the name. Domain availability was not checked.

---

## Sources (read in full via fetch unless marked *search summary*)

Switch
1. https://github.com/sandbox-quantum/switch
2. https://docs.switchagents.ai
3. https://docs.switchagents.ai/llms.txt
4. https://docs.switchagents.ai/switch-rooms/using/work-in-a-room.md
5. https://docs.switchagents.ai/switch-rooms/using/shared-context.md
6. https://docs.switchagents.ai/switch-rooms/using/agent-not-answering.md
7. https://docs.switchagents.ai/switch-rooms/internals/agent-events.md
8. https://docs.switchagents.ai/switch-rooms/internals/life-of-a-message.md
9. https://docs.switchagents.ai/switch-rooms/getting-started/agent-settings.md
10. https://docs.switchagents.ai/switch-rooms/use-cases/product-launch.md
11. https://docs.switchagents.ai/switch-rooms/building/grow-into-an-organization.md
12. https://docs.switchagents.ai/switch-rooms/deploy/messaging-apps/telegram.md
13. https://github.com/sandbox-quantum/switch/issues/1095

India B2B chat ordering
14. https://bizom.com/whatsapp-ordering-bot/
15. https://bizom.com/blog/dont-make-retailers-wait-in-this-whatsapp-age/
16. https://shopap.tech/solutions/distribution/
17. https://richautomate.in/blog/whatsapp-b2b-fmcg-distribution-india-2026
18. https://aurigait.com/case-study/ai-whatsapp-chatbot-for-fmcg-distribution/
19. https://spirestock.com/blog/retailer-order-app-fmcg-distribution-india
20. https://spirestock.com/blog/distributor-credit-limit-management-fmcg-india
21. https://www.hublerx.ai/whatsapp-order-management-food-fmcg-manufacturers
22. https://retailpos.co.in/fmcg-distributor-operational-problems-scale-india-solution-2026/
23. https://blog.massistcrm.com/10-kpis-every-fmcg-sales-manager-must-track-with-benchmarks
24. https://www.shopaccino.com/blog/how-digital-order-history-helps-b2b-buyers-place-orders-faster-more-confidently
25. https://www.gartner.com/reviews/product/bizom-725602012 *(search summary)*
26. https://www.capterra.com/p/146321/Bizom/reviews/ *(search summary)*
27. https://g2.com/products/botree-retailer-app/reviews *(search summary)*
28. https://complainthub.org/udaan-help/ and https://voxya.com/consumer-complaints/udaan-udaan-fraud-return-accepted/122987 *(search summary)*
29. https://www.maritimegateway.com/bikayi-partners-with-whatsapp-to-revolutionize-e-commerce/ *(search summary)*

Agents in team chat
30. https://docs.slack.dev/ai/developing-agents
31. https://claude.com/docs/connectors/slack
32. https://claude-threads.run/
33. https://tessl.io/blog/claude-code-comes-to-slack-as-team-chat-and-coding-converge
34. https://docs.devin.ai/integrations/slack.md
35. https://mc.merill.net/message/RM570434 (Copilot Studio human approval)
36. https://docs.copilotkit.ai/teams *(search summary)*
37. https://dev.to/nathanhamlett/building-ai-discord-bots-that-actually-work-lessons-from-managing-50000-members-34p2
38. https://github.com/factomind-technologies/codex-slack *(search summary)*

Conversation design / formatting
39. https://developers.google.com/assistant/conversation-design/confirmations
40. https://developers.google.com/assistant/conversation-design/errors
41. https://core.telegram.org/bots/guidelines
42. https://rasa.com/docs/rasa/next/fallback-handoff *(search summary)*
43. https://docs.mattermost.com/collaborate/format-messages.html *(search summary)*
44. https://github.com/Kilo-Org/cloud/pull/4379 *(search summary; tables on mobile)*
45. https://doofinder.com/en/blog/fuzzy-search *(search summary)*
46. https://forum.rasa.com/t/best-method-for-detecting-product-names-entities/37375 *(search summary)*

Trust, language, adoption
47. https://www.microsoft.com/en-us/research/publication/do-multilingual-users-prefer-chat-bots-that-code-mix-lets-nudge-and-find-out/ (Bawa et al., CSCW 2020)
48. https://pure.royalholloway.ac.uk/en/publications/designing-trust-the-formation-of-employees-trust-in-conversationa/ (Gkinko & Elbanna)
49. https://sintef.brage.unit.no/sintef-xmlui/handle/11250/3084415 *(search summary; host unreachable)*
50. https://blog.experientia.com/?p=20115 (NN/g chatbot study) *(search summary; 530 on fetch)*
51. https://entrepreneur.com/business-news/most-employees-havent-used-ai-dont-trust-the-tech-report/475731 *(search summary; Slack Workforce Index)*

Naming
52. https://trademarks.justia.com/owners/jqk-solutions-inc-3830717 and https://gleanmark.com/trademark/uspto-97044422 *(search summary)*
53. https://hoteltechreport.com/news/roomorders-deep-dive *(search summary)*
