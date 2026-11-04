# What wins hackathons like Flip the Switch — research for OrderRoom

> Compiled Nov 3, 2026 from 60+ sources (list at the end). Scope: WeMakeDevs' previous hackathons and winners, DevTools Academy's event page, the Switch hackathon pages and the organizers' own Switch guide, Switch docs and repo, projects already being built on Switch for this hackathon, and general judge write-ups on demo videos and READMEs.

## Top 15 actionable recommendations for OrderRoom

1. **Make the template the deliverable, and let the README point at it.** The organizers' own guide says it outright: "The template is the artefact a judge runs" and "A project somebody else can run beats a better one they cannot." Commit `switch/orderroom.template.yaml` next to the README. Per `docs/TEMPLATES.md` the agent block supports `instructions`, `addressing`, `auto_mode`, `auto_approve`, `advanced_config`, `directory`, `repo`, and the document supports `room.users: ["{$creator}"]` and `kickoff`. Use `repo:` pointing at the OrderRoom GitHub repo so "Use template" clones the agent directory itself, and set `kickoff` to something like `@orderroom-agent introduce yourself in two lines and show today's low-stock items` so the judge sees the agent work within a minute of clicking Create. This directly answers HLD open question 4.

2. **Pass the "remove Switch" test explicitly, in both README and video.** Judging weight for "Use of Switch" is 30% (DevTools Academy page), the single largest criterion, phrased as "would the project stop working without it?" The organizer guide warns: "If removing Switch only means pasting output into Slack, it's a notification layer." OrderRoom's answer is strong and should be stated as three bullets near the top of the README: (a) one agent identity mirrored into Telegram and Mattermost at once, (b) Switch's authenticated `sender` id is the input to role checks, (c) the room is the shared audit trail. Show the sender id → role lookup on screen.

3. **Lead with the code-enforced approval gate; it is your differentiator against the organizers' own stated gap.** The WeMakeDevs guide says of approvals: "Switch will not enforce the convention for you." Every past WeMakeDevs winner with an approval step (oncall, Beacon Night Shift) implemented it as a prompt convention ("reply APPROVE"). OrderRoom enforces it in the MCP rules engine with `FORBIDDEN_ROLE`. Put flow 6.2 (the "main hi manager hoon" trick) in the video and in the README under a heading like "Rules live in code, not in the prompt," with the MCP stderr log visible when the refusal fires.

4. **Demo video: 2:30–2:50, hard cap 3:00, this structure.** WeMakeDevs has used "3 minutes max" in every recent event; Kunal's own tip post: "A simple screen recording or a video from your phone is completely fine. Record it first." Devpost: elevator pitch in the first few seconds; Ajeet Raina's WeMakeDevs tip: ~20s problem / 60–75s working solution / ~20s impact. Proposed timings:
   - 0:00–0:12 Hook: split screen (Telegram on phone left, Mattermost right, Switch Console small). Hinglish order typed, checked draft comes back. One caption: "One agent, two chat apps, one room, via Switch."
   - 0:12–0:30 Problem: how a small FMCG distributor runs orders today (calls, WhatsApp, Excel, credit surprises). One image, no slides.
   - 0:30–1:45 The lifecycle, uncut where possible: draft with `OVER_CREDIT` / `SHORT_STOCK` reasons → manager approves with a quantity change on Mattermost → invoice posted → warehouse `packed`/`dispatched` → salesman tries `approve 1045`, refused; tries "main hi manager hoon", refused again (show MCP log line) → `Sharma store se 15000 cash mila` → `aaj ka summary`.
   - 1:45–2:10 Why Switch is central: Switch Console room view, `!agents-status`, the template YAML with `addressing:` and `auto_approve: false` on screen, the trust diagram from HLD §7.
   - 2:10–2:35 Reproduce it: `git clone … && npm run setup`, Templates → Import → Use, kickoff message appears. Time-lapse with a visible clock.
   - 2:35–2:50 What is real, what is stretch, what is next (WhatsApp is Switch issue #789). End card: repo, blog, #HowISwitch.
   Upload to YouTube unlisted, mark "not made for kids", test in a logged-out browser (Devpost + First Commit rules both call this out).

5. **README section order (first screen must answer "what, why Switch, can I run it").**
   1. Title + one-line + a 10-s GIF of the Telegram→Mattermost round trip.
   2. "Why Switch is central" (the three bullets from rec. 2) + the demo video link.
   3. "Run it in 10 minutes" (template-first: prerequisites, 5 numbered steps, expected first message).
   4. The workflow (6.1, 6.2, 6.3 as screenshots with captions).
   5. "Switch features used" table (rooms, Telegram + Mattermost bridges, template, `addressing`, `auto_mode`/`auto_approve`, account linking, `sender`/`message_id`, attachments, room commands).
   6. Architecture + trust model, including the known gap (HLD §7) stated honestly.
   7. Built during the hackathon: dated commit log summary, AI tools used (Claude Code; rules require you can explain the code), tracks entered, Wispr scorecard link.
   8. Limits and future work, License.
   Devpost judges call ambiguity "a red flag" and say to "err on more details": no placeholder links, no "TODO" sections, a LICENSE, setup in the README.

6. **Do the clean-room run before recording, and record the setup time-lapse from it.** Organizer guide: "Delete your room and agents, then run the template from scratch as a stranger would. Ideally, have a teammate do it while you watch." Judging criterion 2 (25%) is literally "could someone clone the repo and reproduce it." Keep a `docs/SETUP-LOG.md` with the stopwatch time of your clean run and paste the number into the README.

7. **Scope: ship the five-state core, cut the rest early.** First Commit criteria: "One feature that runs beats five that almost do"; "A small problem solved well beats a big one solved vaguely"; "If the video does not show it, it does not count." Keep: draft → approval/rejection → confirmed → packed/dispatched → delivered → payment → summary, with role checks and audit. Cut by Nov 5 evening if not working: voice notes (Telegram docs do not mention voice; attachments arrive as `mxc` pointers you must fetch), delivery as a separate actor (merge into warehouse), PDF (text invoice is fine, but try the attachment once because a PDF landing in Telegram is a strong visual). Dashboard: build only on Nov 6 if everything else is recorded; Devpost judges do flag "extremely back-end heavy" projects, but here the chat is the UI.

8. **Resolve HLD open questions 1–3 from the docs, then verify on Nov 4 hour 1.**
   - Q1 (sender): the Switch `message` event carries `sender` (`@<localpart>:<server>`, opaque), `sender_name`, `message_id`, `body`, `thread_id`, `attachments[]` (`filename`, `mimetype`, `size`, `mxc`, `msgtype`). Identity docs: "An unclaimed platform account matches nobody," so an unlinked Telegram user naturally has no role — demo that as a feature. Telegram linking needs the person to post once, have a @username, then "This is me" in Switch Console; Group Privacy must be off before the bot is added.
   - Q2 (PDF): media upload/download are plain HTTP routes used by the local runtime; Telegram relays files as documents, 20 MB cap. Unknown for a Claude Code session; test once, fall back to text.
   - Q3 (tools): Agent settings expose "Tools" (allow-list: "limits the agent to the tools you list") and "Disallowed tools"; templates carry them via `advanced_config` keyed as the Console's Advanced configuration lists them (check with `get_advanced_config`). Keep the `.claude/settings.json` denies as the second layer regardless.
   - New risk: the quickstart says "Only you can access a local server. To work with colleagues, you connect the server to Slack, Discord, or Telegram." Confirm on Nov 4 that extra local Mattermost accounts (manager, warehouse) are creatable and get distinct sender ids; fallback is a second Telegram account for the manager, or Discord.

9. **Set `addressing: anyone` (or custom rules) and show it.** New agents answer only their owner; a salesman on Telegram would be refused with a visible message. The organizer guide says to "set addressing deliberately" and to show `auto_approve: false` to "demonstrate blast-radius thinking." Keep `auto_mode: true` so the Claude Code session does not block on permission prompts during the demo, and explain in the README that the MCP server, not Claude's permission prompt, is the gate.

10. **Use room commands on camera, carefully.** `!agents-status`, `!list-agents`, `!room-url` prove Switch is live and give the judge a mental model. Never paste `!reset` or `!compact` in the demo room: Switch reads the first character, backticks do not make a command inert. Every message in the demo must @mention the agent (agents silently ignore unaddressed messages).

11. **Write the project description like Kunal asked.** His submission-day post: "Short one-liners make it hard for us to see what you built… cover what the idea behind it was, what problem you or someone else faced that made you build it, and what the project actually does"; "Be clear about [the sponsor]: which services you used, how you used them, and what feedback you have on them. This matters a lot for judging." Include a "Feedback for the Switch team" subsection (e.g., sender identity exposure to Claude Code sessions, Telegram voice notes, file posting from agents, a `tools` key in templates). Finalists are judged by the Switch team; honest product feedback reads as depth.

12. **Lean into what nobody else is building.** Most public entries seen so far are developer-ops workflows on a single chat app. OrderRoom is a non-engineering team, two platforms at once, Hinglish, and code-enforced roles. Switch's own use-case pages (vendor review for finance, meeting prep for sales, customer onboarding) show the Switch team wants non-engineering workflows. Say "built for a team that does not write code" in the first paragraph.

13. **Make it "a real team's problem", with a named persona and numbers.** Criterion 3 (25%): "a fresh idea that solves a problem a real team has." First Commit recap praised Suraksha for being "built for somebody who is not the user" and Beacon Night Shift (a solo entry that won 2nd) for proposing "one allowlisted fix, dry-runs it, and waits for your approval." Seed data should look like a real distributor (retailer names, SKUs in cases, credit limits in rupees), and the README should state the day-in-the-life: N orders/day, where credit mistakes cost money, why the manager cannot be in the field.

14. **Best Blog (AirPods): write a 2,000–2,500-word field report with a "what broke" section, screenshots, and exact commands.** Criteria: "clarity, accuracy, and how much it helps a first-time Switch user." The First Commit winning blog analysed here ("The Timetable Nobody Has") is ~2,500 words, first person, candid, has before/after tables, three captioned diagrams, numbered day-by-day pivots, and ends with "three things I would tell myself on day one" plus repo and demo links. Screenshots, exact commands and an honest failures section are what most posts skip. Headline with a specific promise (Ankur Tyagi: specific promise, strong verb, a number), e.g. "One agent in Telegram and Mattermost at once: building an order desk on Switch in 4 days." Publish on dev.to/Hashnode/Medium (SigNoz rules: "a LinkedIn post doesn't count"). Sections: the team and the problem → what Switch gives you (identity, rooms, template) → setup commands with screenshots → the rules engine and why the gate is in code → what broke (Telegram linking, addressing refusals, attachments) → what I would tell a first-time Switch user → links.

15. **Side prizes are cheap if planned from day 1.** Wispr ($500): dictate your Claude Code prompts, README, agent instructions, and commit messages with Wispr Flow; screenshot the Insights "Your Usage" tab (WPM, total words, fixes, heatmap; desktop only; lifetime counts) on Nov 4 morning and again at submission so the delta is visible, and include a 15-s clip of you dictating a prompt. The Wispr challenge rubric weights "how you used Wispr" at 30%, so show it, don't just attach the card. #HowISwitch (top 5 → Logitech keyboards, top 20 → swag): previous WeMakeDevs guidance for social posts was "a clip of your agent working, something that surprised you, or a bug that took an hour"; Kunal's own announcement is a vertical 1080×1920 video. Post three short vertical clips: the refusal ("main hi manager hoon"), the invoice landing in Telegram, and the one-click template creating the room. Tag @WeMakeDevs and @switch_ai_. Star the repo (Keychron draw).

Bonus: commit nothing but docs before Nov 4 00:01 IST. First Commit rules disqualify when "history must match the event dates", and the Switch FAQ says "the Switch setup and the workflow your agents run need to be built during the hackathon." Design docs beforehand are explicitly fine ("Planning and diagrams can be prepared beforehand" — Agent Harness rules).

---

## 1. The Switch hackathon itself

**Pages read:** wemakedevs.org/hackathons/switch (+ /resources, /schedule, /rules), devtoolsacademy.com/hackathons/flip-the-switch, luma.com/switchai, the Oct 29 WeMakeDevs guide blog, X posts by WeMakeDevs and Kunal Kushwaha.

**Judging criteria and weights** (DevTools Academy page shows weights; WeMakeDevs page shows "0%" placeholders):
- Use of Switch 30%: "Is Switch central, and would the project stop working without it?"
- Technical execution 25%: "Does it run, and could someone clone the repo and reproduce it?"
- Creativity and impact 25%: "a fresh idea that solves a problem a real team has"
- Presentation and documentation 20%: "Do the demo video and README make clear what was built and how Switch is used?"

**Process:** every submission reviewed by WeMakeDevs → shortlist → finalists judged by Switch, DevTools Academy, WeMakeDevs. WeMakeDevs' recent events had 1,180 submissions (First Commit) and 1,200+ (Cognee), with 3,000+ registered for this one; expect the shortlist pass to be fast and video/README-driven, and the final pass to be done by people who know Switch's internals.

**Submission requirements:** public repo; "a short demo video of the workflow running"; README "explaining which agents were connected, how the channel is set up, and how to run it"; optional blog. No video length is stated on the Switch pages; WeMakeDevs' standard is 3 minutes max (First Commit, Agent Harness).

**Rules that matter:** existing agents/libraries/templates allowed, but "the Switch setup and the workflow your agents run need to be built during the hackathon"; AI tools allowed, "you should understand what you submit and be able to explain how it works"; multiple tracks per project; 18+; identity verification before prizes.

**The example the organizers highlight:** `triage-pair.template.yaml` (triager → reproducer). The Switch repo's `examples/agent-templates/` also contains `support-desk` (two linked rooms, greeter + engineer) and `jq-expert`; `examples/room-templates/` has `red-blue-workroom`. These are the baseline judges will compare templates against; Devpost judges reject "a barely modified template," so OrderRoom's template must visibly go beyond these (a single agent with a tool allow-list, a seeded business, a kickoff that does work).

**Resources tab emphasis:** quickstart first, "Build a payments room" as the full worked example, Telegram/Mattermost connection docs, agent protocol, `claude mcp add switch-docs --transport http https://docs.switchagents.ai/mcp`.

**Kickoff livestream (Nov 2, 3:30 PM UK):** no recording URL was discoverable via search or the YouTube channel pages (YouTube listing pages return no content to fetchers). Check youtube.com/@WeMakeDevs/streams and youtube.com/@FlintAI-SandboxAQ manually; the schedule says it covered "Switch, the tracks, the rules and setup."

**Switch's own hackathon-labelled issues (Track 03)** reveal what the Switch team wants: ~60 open issues, almost all connectors (Zendesk, Stripe, HubSpot, Salesforce, Grafana…), new messaging platforms (WhatsApp #789, Signal, Google Chat, SMS/Twilio), new agent providers, and UX items like "Show tool input and output in the channel, safely" (#803) and "Room invites should respect who can talk to an agent" (#805). Cite #789 in OrderRoom's future-work line about WhatsApp; it shows you read the repo.

## 2. The organizers' own Switch guide (strongest single source)

"How to Build a Switch Workflow That Finishes a Real Task" (WeMakeDevs, Oct 29, 2026; example "Upgrade Desk": `watch` + `bump` agents + a human approver). Key statements, near-verbatim:
- "If your workflow collapses into one agent answering questions, you have built a chat bot."
- "Use separate agents only when the jobs must run in different places." (OrderRoom's single agent is fine; the two *platforms* and the *rules engine* are the substance.)
- "Put shared conventions in room instructions, not individual prompts."
- "Pick a task with an end." Finish with an artifact (PR link, filed issue, decision). OrderRoom's artifacts: a confirmed order, an invoice, a recorded payment, a daily summary.
- "Leave `auto_approve` off for any agent that touches a repository." Show the `auto_approve: false` line in the video.
- "Switch will not enforce the convention for you" (about approval). This is OrderRoom's opening.
- "Being a member means nothing is running." Check `!agents-status` before recording.
- "A project somebody else can run beats a better one they cannot."
- "The template is the artefact a judge runs." Commit it next to the README.
- Clean-room run, then record. Show the Switch room beside the chat window; `!room-url`.
- Backticks do not neutralise `!` commands.
- Common mistakes listed: chat-bot-only agent; wrong machine/directory (cannot change later without re-registering); conventions in agent prompts; bypass on; unreproducible room.

## 3. Previous WeMakeDevs hackathons: what won and what organizers praised

**Agent Harness (Sept 2026, TrueFoundry):** winners were oncall (incident-response agent that "handles remediation with human approval"), CapyGuard (tests untrusted MCP servers by observing behaviour), AgentRadar (dependency repair + verification). Rubric had six equal criteria incl. "Control and safety: Does the agent run code somewhere safe and stop for a human before anything irreversible?" and "Presentation: Does the demo explain the problem, show the agent working, and show where the harness fits?" Kick-off guide: the core test is "whether your agent does work rather than just generating an answer, and whether someone else could understand, review, and continue your code"; mistakes: "building a chat wrapper", "adding a sandbox just for show", "relying on screenshots as proof."

**First Commit (Sept 2026, AWS, 13,667 participants, 1,180 submissions):** 1st Suraksha (companion for an aging parent; praised as "the only one… built for somebody who is not the user"); 2nd Beacon Night Shift (solo; on-call agent that "proposes one allowlisted fix, dry-runs it, and waits for your approval," then learns per fault type); 3rd CampusEvac (two-player drill game, "Neither can finish alone"). Recap lessons: pick a real problem you see around you; live, usable links stood out; "write up what you chose, what broke, and what you would change." Criteria text: "A small problem solved well beats a big one solved vaguely"; "Clean and obvious beats clever and confusing"; "One feature that runs beats five that almost do"; "We judge what you built, not what you spent." Rules: video on YouTube < 3 min, public/unlisted, "If the video does not show it, it does not count"; repo history must match event dates.

**Hangover / Cognee (Aug 2026, 8,500+ regs, 1,200+ submissions):** Lethe (on-call memory that can *forget* removed systems) and Classroom Memory (reasons over prerequisites). Praised for a twist that shows depth, not breadth.

**FutureStack25:** VoiceGraph, Sure AI, SRE Sentinel; all single-named (solo-looking) winners of sponsor tracks, all with the sponsor tech in the critical path. Sure AI's own write-up: README = description, demo video embed, tech stack, features; credits "production-ready framing."

**Blog winners (First Commit, 5 × Logitech keyboards):** long-form builder postmortems on builder.aws.com. The one analysed in full ("The Timetable Nobody Has") is ~2,500 words, candid, day-numbered pivots, tables, three diagrams, Cedar/JSON/TS snippets, "three things I would tell myself on day one," footer with live demo and repo.

**Kunal's submission-day tips (X, Sept 20, 2026):** detailed descriptions not one-liners; 3-minute video, phone recording fine, record first, YouTube unlisted; live demo without sign-up; "Be clear about AWS… which services, how you used them, and what feedback you have on them. This matters a lot for judging"; say who did what.

**Pattern across winners:** an operational job someone would "actually hand over"; a human gate before the irreversible step; one sharp twist (allowlist, dry-run, forgetting, built-for-someone-else); sponsor tool in the critical path; solo entries win regularly.

## 4. DevTools Academy

The DevTools Academy event page is the only place the weights (30/25/25/20) are printed, and it states the README must explain "which agents were connected, how the channel is set up, and how to run it." DevTools Academy's blog has no hackathon or judging write-ups; it is a devtools marketing/content agency (Ankur Tyagi, founder). Ankur's writing guide (dev.to) emphasises: identify the audience first, headlines that make "a specific promise" with "strong verbs" and "numbers", real stories ("People learn more from real stories than from being told"), diagrams, brevity, review/revise. Expect the DTA judge to weight the README/blog as content: clear structure, accurate, screenshots, no fluff.

## 5. What else is being built on Switch

Other public Switch entries seen on Nov 3 were developer-ops workflows (PR review, issue triage, incident rooms) on a single chat app.

Observations: every entry is developer-ops; none spans two messaging apps; none uses Telegram for a field role plus Mattermost for an office role; all approvals are prompt conventions; most lack a template or a working demo link at the time of reading. Switch's Product Hunt thread and SD Times coverage frame the product around non-engineering rooms too (marketing, legal, "If you can message a colleague, you can put an agent to work"), so a distributor's order desk is on-message for the Switch judges.

## 6. Switch facts that affect OrderRoom's design and demo

- **Message event payload** (`agent-events`): `addressed`, `sender` (`@<localpart>:<server>`, treat as opaque), `sender_name`, `message_id`, `body`, `timestamp`, `thread_id`, `attachments[{filename, mimetype, size, mxc, msgtype}]`. `command` events carry `user_id`, `user_name`. Act only when `addressed` is true.
- **Identity:** addressing rules name Switch users, not platform accounts; "An unclaimed platform account matches nobody"; account claims are many-to-many; agents inherit the owner's access; refusals are visible replies. Telegram linking: post once (with a @username), then "This is me" in Switch Console; one bot represents all agents; Group Privacy off before adding the bot; files relayed as documents (20 MB cap); voice notes not documented; `👀` progress marker needs reactions enabled; tables arrive as raw text (format invoices as monospace lines, not Markdown tables, for Telegram).
- **Agent settings:** Tools allow-list and Disallowed tools under Advanced configuration; "Who can talk to your agent": Only me / Me and my agents / Anyone / Custom rules; Auto mode on by default; Bypass off; changes apply at next session (stop session in Console, re-address).
- **Templates:** keys listed in rec. 1; `{$creator}` requires the deployer to have linked an account on that messaging app; server preflight returns reason codes (`provider_login_missing`, `name_taken`…) and creates nothing on failure; "Capture as template" from an existing room copies instructions, roles, aliases, documents and access.
- **Local server:** "Only you can access a local server. To work with colleagues, connect to Slack, Discord, or Telegram." Verify multi-user Mattermost locally on Nov 4 (HLD risk 5 extended).
- **Safety guidance** (working-safely-with-agents): working directory is "the strongest control"; keep Auto mode/Bypass off where possible; "Separate rooms that hold credentials from rooms that handle outside content"; restricting who can address an agent "doesn't limit what the agent reads." OrderRoom's DB-outside-agent-dir and allow-list design maps onto this page; cite it in the README.
- **Room commands for the demo:** `!help`, `!list-agents`, `!agents-status` (🟢/⚪/🔴/🟡), `!roles`, `!room-url`, `!run-cmd @agent`. Avoid `!reset`, `!compact`, `!interrupt` on camera.
- **Payments-room worked example:** roles (shared vs exclusive), references, room instructions "for the whole team," restrict edit rights, "Permit the room, not just the person." Optional polish: give the manager an exclusive `approver` role so `!roles` shows who can approve.

## 7. General evidence on sponsored devtool hackathons

- Devpost "advice from 5 judges": video is the first signal of effort and is watched first; "err on more details… ambiguity is a red flag"; want the sponsor product's use case shown clearly when the prompt calls for it; reject shoehorned or repackaged ideas, "polished intros with thin code", "barely modified template"; flag back-end-only projects with no UI; balance all criteria rather than maxing one.
- Devpost demo-video tips: plan early, script it yourself, open with the elevator pitch "in the first few seconds", show the running project not slides, good microphone, upload to YouTube early, mark not-for-kids, verify not private.
- Ajeet Raina (WeMakeDevs FutureStack): README = problem, setup steps, technologies (sponsor tech explicit), screenshots/GIFs, architecture, credits; video 2 min: 15–20 s problem, 60–75 s working solution, 15–20 s impact; avoid "one large commit at the end, which looks suspicious."
- Colosseum: pitch video is "the most important element of the submission" for shortlisting; ≤3 min; common mistakes include exceeding the limit, buzzwords, vague descriptions, and forgetting to give judges access.
- A judging framework cited in search: judges spend ~12–20 min per project (≈4 min video, 5–8 min README/code), so README and code are nearly as heavy as the video.
- Disqualification/ignore patterns across sources: cannot run; private/expired links; sponsor tool named but not shown; work started before the event; thin code behind a polished front; unclear who did what.

## 8. Side prizes

- **Best Blog (AirPods 5; "clarity, accuracy, and how much it helps a first-time Switch user"):** see rec. 14. Agent Harness "Field report" brief: "the job you gave the agent, how you wired it up, what [the tool] handled, and what broke along the way… Screenshots and a demo clip help." Publish on a proper platform.
- **Code with Wispr ($500):** requires "a Wispr usage scorecard (a screenshot from Insights in the Wispr Flow desktop app)". Insights "Your Usage" tab shows WPM, fixes made by Flow, total (lifetime) words, desktop usage, activity heatmap; desktop only; share cards exportable. The parallel Wispr challenge rubric: real problem 30%, how you used Wispr 30%, works 25%, demo clarity 15%; required "a short Flow clip." Promo: one free month of Wispr Flow Pro via the hackathon page.
- **#HowISwitch (top 5 Logitech keyboards; swag for top 20 posts):** no criteria published; prior WeMakeDevs social tracks asked for "a clip of your agent working, something that surprised you, or a bug that took an hour," tagging the organizers. Vertical short clips match Kunal's own promo format.

## 9. Gaps in this research

- No recording or transcript of the Nov 2 kickoff was found; YouTube listing pages do not render for fetchers. Check manually.
- Discord announcements are not public.
- No named-judge statements from Switch or Ankur Tyagi about this hackathon were found; the Switch team's priorities were inferred from their docs, repo issues, Product Hunt replies and press quotes.

## Sources (read)

Hackathon pages and organizer posts
1. https://www.wemakedevs.org/hackathons/switch
2. https://www.wemakedevs.org/hackathons/switch/resources
3. https://www.wemakedevs.org/hackathons/switch/schedule
4. https://www.wemakedevs.org/hackathons/switch/rules
5. https://www.devtoolsacademy.com/hackathons/flip-the-switch
6. https://luma.com/switchai
7. https://cubbbix.com/blog/flip-the-switch-hackathon
8. https://www.wemakedevs.org/blogs/how-to-build-a-switch-workflow-that-finishes-a-real-task
9. https://www.wemakedevs.org/blogs/rss.xml
10. https://x.com/WeMakeDevs/status/2116543166895829274 (Switch guide announcement)
11. https://x.com/WeMakeDevs/status/2116158322428825873 (3,000+ builders, swag)
12. https://x.com/kunalstwt/status/2115677436520051196 (announcement, vertical video)
13. https://x.com/kunalstwt/status/2101587446479618269 (Kunal's submission-day tips)

Previous WeMakeDevs hackathons
14. https://x.com/WeMakeDevs/status/2098065522458022141 (Agent Harness winners)
15. https://x.com/WeMakeDevs/status/2103344149718298688 (First Commit blog winners)
16. https://www.wemakedevs.org/hackathons/trueforge
17. https://www.wemakedevs.org/hackathons/trueforge/rules
18. https://www.wemakedevs.org/blogs/agent-harness-hackathon-kick-off
19. https://www.wemakedevs.org/aws/first-commit
20. https://www.wemakedevs.org/aws/first-commit/rules
21. https://www.wemakedevs.org/blogs/first-commit-hackathon-recap-and-whats-next
22. https://www.wemakedevs.org/blogs/hangover-wrap-up-blog
23. https://www.wemakedevs.org/blogs/hack-all-february
24. https://archive.wemakedevs.org/hackathons/futurestack25/projects
25. https://archive.wemakedevs.org/hackathons/signoz
26. https://archive.wemakedevs.org/hackathons/cognee
27. https://www.wemakedevs.org/blogs/wispr
28. https://dev.to/hibino_reddy/sure-ai-winning-the-meta-track-at-futurestack-genai-hackathon-by-wemakedevs-5h4
29. https://builder.aws.com/content/3JbRGhy5MZZIjshWBtVBSAZOD5s/the-timetable-nobody-has
30. https://dev.to/ajeetraina/top-5-tips-to-win-the-futurestack-genai-hackathon-2pgg

DevTools Academy / Ankur Tyagi
31. https://www.devtoolsacademy.com/blog
32. https://dev.to/tyaga001/a-software-developers-guide-to-writing-bgj

Switch docs, repo and company
33. https://docs.switchagents.ai
34. https://docs.switchagents.ai/llms.txt
35. https://docs.switchagents.ai/switch-rooms/getting-started
36. https://docs.switchagents.ai/switch-rooms/getting-started/add-a-second-agent.md
37. https://docs.switchagents.ai/switch-rooms/getting-started/agent-settings.md
38. https://docs.switchagents.ai/switch-rooms/building/payments-room
39. https://docs.switchagents.ai/switch-rooms/administer/room-templates.md
40. https://docs.switchagents.ai/switch-rooms/internals/agent-protocol
41. https://docs.switchagents.ai/switch-rooms/internals/agent-events.md
42. https://docs.switchagents.ai/switch-rooms/internals/identity-and-access.md
43. https://docs.switchagents.ai/switch-rooms/resources/working-safely-with-agents.md
44. https://docs.switchagents.ai/switch-rooms/deploy/messaging-apps/telegram
45. https://docs.switchagents.ai/switch-rooms/use-cases/index.md
46. https://docs.switchagents.ai/switch-rooms/using/index.md
47. https://github.com/sandbox-quantum/switch (README; ~3.0k stars, 191 forks)
48. https://github.com/sandbox-quantum/switch/blob/main/docs/TEMPLATES.md
49. https://github.com/sandbox-quantum/switch/blob/main/examples/agent-templates/triage-pair.template.yaml
50. https://github.com/sandbox-quantum/switch/blob/main/examples/agent-templates/support-desk.template.yaml
51. https://github.com/sandbox-quantum/switch/blob/main/docs/official/using/what-comes-back.md
52. https://github.com/sandbox-quantum/switch/blob/main/docs/official/using/hand-off-work.md
53. https://github.com/sandbox-quantum/switch/blob/main/docs/official/resources/room-commands.md
54. https://github.com/sandbox-quantum/switch/issues?q=label%3Ahackathon (issue list via gh)
55. https://www.switchagents.ai/blog-posts/switch-getting-started
56. https://www.producthunt.com/posts/switch-14
57. https://sdtimes.com/?p=61032

Projects already being built on Switch
58. https://github.com/sarath-ppt/switch-hackathon-project
59. https://github.com/jaysid97/pr-pilot
60. https://github.com/kamalesh404/CrewPilot
61. https://github.com/majorML/flip-all-agent
62. https://github.com/gareeb-studio/product-studio/issues/8
63. https://dev.to/ronitgupta138/how-we-built-an-autonomous-sre-incident-war-room-on-switch-42cf

General judging and demo-video evidence
64. https://info.devpost.com/blog/hackathon-judging-tips
65. https://info.devpost.com/blog/understanding-hackathon-submission-and-judging-criteria
66. https://info.devpost.com/blog/6-tips-for-making-a-hackathon-demo-video
67. https://blog.colosseum.com/perfecting-your-hackathon-submission/
68. https://docs.wisprflow.ai/articles/8760230576-your-usage-tab-track-your-dictation-stats-in-wispr-flow (via search snippets)

Not reachable: x.com directly (402), xcancel (451), YouTube channel listing pages (no content rendered). X posts were read through the fxtwitter API.
