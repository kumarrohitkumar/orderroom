# FMCG general-trade domain research for OrderRoom

> Written Nov 3, 2026 from 40 public web sources read in full (list at the end) plus ~15 more surfaced in search summaries. Public material only: vendor blogs (Bizom, FieldAssist, BeatRoute, mAssist, HublerX, SpireStock, Tally, myBillBook), industry guides (Kirana Club), news (Business Standard, Kotak Neo, KNN/Kantar, Tribune/PTI), API docs (Sarvam, OpenAI, AI4Bharat). Most numbers come from vendors with a commercial stake; each is labelled. Hinglish phrasing in the glossary is marked **[sourced]** when a source used it and **[domain]** when it is ordinary trade usage that no source happened to quote.
>
> Read with `docs/LLD.md` §5 (business rules) and §11 (seed data). Suggested changes to those sections are called out as **LLD change**.

---

## Top 15 actionable findings

1. **Use the trade's own words, not ours.** The industry says *beat* (the day's route), *order booking*, *bill* (invoice), *bill cut* (an invoice raised), *scheme*, *outstanding / udhaar / baki*, *party* (a retailer account), *godown* (warehouse), *case / peti*, *SKU*, *primary / secondary sales*, *DSR*. Rename in the agent's replies and the README: "Draft order" → "Order booked (draft)", "Invoice INV-…" → "Bill INV-… cut", "warehouse" → "godown", "retailer" → "party/outlet" where natural. Full glossary in §1. **LLD change**: add these as agent-instruction vocabulary and as product/retailer aliases.

2. **The real order-to-cash chain has one step we skip: credit and stock are checked *before* the bill is cut, by the distributor's desk, not by the salesman.** Salesman books → desk enters → credit check → stock check → bill (scheme + GST) → load sheet / picking → challan + vehicle → delivery boy delivers and may collect → collection on next beat → evening reconciliation ("the 9 PM session"). Our MCP flow already matches this; make the agent *narrate* it in those terms ("Credit check ✅, stock ✅, bill cut, godown ko load sheet bhej diya"). Detail in §2.

3. **What a manager weighs on an over-credit exception is: outstanding, *oldest unpaid days*, last payment date/amount, usual monthly purchase, and headroom after this bill.** Vendor and credit-policy sources agree the hold trigger is *age of overdue* (40–60 days), not just the limit. **LLD change** (cheap, high "they get it"): the `needs_approval` card for OVER_CREDIT should show `outstanding`, `oldest_due_days`, `last_payment {amount, date}`, `avg_monthly_purchase`, and `exposure_after`. Derive `oldest_due_days` from the oldest `delivered` order with unpaid balance (orders table already has timestamps). §3.

4. **Credit days per party is a first-class field in every DMS.** Brand→distributor terms are 15–30 days; distributor→retailer terms were 12–14 days and have crept to ~25 (Business Standard, 2023) and 30–60 in some markets (Kotak Neo). **LLD change**: add `credit_days INTEGER DEFAULT 21` to `retailers`; add `OVERDUE` as a third approval reason (`oldest_due_days > credit_days`) alongside OVER_CREDIT and SHORT_STOCK. Seed one retailer whose balance is under the limit but 45 days old, so the demo shows the agent catching an *aged* debt, which is what real credit control does.

5. **One scheme rule is enough to look real, and the canonical one is the quantity scheme: "10+1" (buy 10 cases get 1 free) or a QPS slab (12 cases → 3%, 24 → 5%).** Tally's own FMCG guide uses "Buy 10 Cases, Get 1 Case Free" as its example. **LLD change**: `products.scheme TEXT` holding JSON like `{"type":"free_qty","buy":10,"free":1}`; `create_order_draft` adds a free line (`unit_price 0`, flagged `scheme`) and the bill prints "Scheme: 10+1". Nothing else in pricing needs to change. §4.

6. **Partial fulfilment is normal, and the vocabulary is "short supply" / "back order" / "baaki next trip mein".** Vendor benchmark: fill rate > 95%; order rejection rate < 3%. The field pain quote: "The salesperson promises fifty cases. Only thirty two are in the godown." (biizline). **LLD change**: on SHORT_STOCK the draft should *offer* `available` now and record `qty_backordered = requested − confirmed` on the line; the daily summary reports fill rate = confirmed/requested. §5.

7. **Stock is spoken in cases and days of cover, with batch/expiry underneath.** Norm: 12–18 days of distributor stock; < 7–10 days on a key SKU is a stock-out warning; > 25–30 days is overstock. Our `low = available < 5` should become `low = days_cover < 7` once we have a daily rate; for the demo, keep the threshold but *say* "sirf 3 peti bachi, 2 din ka stock". Add a `batch`/`expiry` column only if cheap; otherwise mention FIFO in README future work. §5.

8. **The report a manager actually reads is the DSR (Daily Sales Report) with: outlets visited, productive calls (bills cut), strike rate, lines per bill, bill value, fill rate, collection (cash/UPI/cheque), outstanding > credit days, PJP adherence.** Note the double meaning: DSR = *Distributor Sales Representative* (the salesman) **and** *Daily Sales Report*. **LLD change**: rename the `daily_summary` output keys to DSR language: `bills_cut`, `productive_calls` (distinct retailers billed), `lines_per_bill`, `fill_rate_pct`, `collection_total`, `collection_by_mode`, `overdue_parties`, `low_stock`, `pending_approval`. Benchmarks for the README: strike rate 60–75% GT, LPC 4–6, 30–45 outlets/day. §6.

9. **The "orders come in over WhatsApp/phone in free text" claim is well supported (vendor data, but consistent):** HublerX: 60–70% of distributor orders arrive as WhatsApp messages such as *"bhai 200 amul 1L, 50 dahi 400g, deliver kal"*, 300–600 messages a day per distributor, "a WhatsApp message takes 15 seconds, a distributor app 3–5 minutes", app adoption < 15%. SpireStock: handwritten/phone orders are 85–90% accurate; a salesman is a bottleneck at 30–40 retailers/day. biizline: intake loses 2–5% of order accuracy; manual scheme handling leaks 3–6% margin; stock blind spots lose 4–7% of monthly throughput; combined "operational tax" 6–12% of revenue. mAssist: "Field reps sometimes take orders from accounts already on credit hold." Use these verbatim with URLs in README/video (§7 has exact quotes).

10. **Scale numbers for the pitch (news sources):** ~12–13 million kirana stores; ~400,000–450,000 distributors (AICPDF); kiranas carry ~79% of FMCG sales (Kantar, Dec 2024) and "nearly 80%" per HUL coverage; HUL alone has 3,500 distributors in 2,000 towns and cut kirana supply time from 3 days to under 24 h; distributor net margin 3–5% on 30–60 days of credit (Kotak Neo). §7.

11. **Voice is real: Flipkart Wholesale reported ~3 million voice queries/day, >50% from towns under 50,000, and says voice is 5× faster than typing in Hindi; Flipkart later put a Sarvam-powered voice ordering bot on WhatsApp for kirana retailers.** Exotel's WhatsApp-bot docs treat voice notes as a standard input but cap them at 1 minute and warn that domain words (product names) and spoken numbers are the weak spots, which is exactly our "echo and confirm" rule. Keep the stretch; it is on-trend. §8.

12. **STT recommendation for a 4-day build: OpenAI `gpt-4o-transcribe` (or `whisper-1`) at $0.006/min, with `language: "hi"` and a `prompt` listing product names and "case/peti".** One multipart call, no duration cap for Telegram notes, key already in `.env.example`. Sarvam Saaras v4 is the better Hinglish choice on paper (₹0.49/min, `codemix`/`translit` output modes giving Roman-script Hinglish, 22 languages, ₹100 free credits) but its REST endpoint takes ≤ 30 s of audio and longer notes need the batch job + polling. Make the provider an env switch (`STT_PROVIDER=openai|sarvam`) only if it costs < 1 hour; otherwise OpenAI only. AI4Bharat IndicConformer/IndicWhisper are open weights (Hindi WER ~13% on Vistaar) but need NeMo/GPU; not for this week. §8.

13. **Returns have a vocabulary we should at least name correctly:** *market return* (goods sent back from the shop), *damage / leakage (L&D)*, *expiry / near-expiry*, *wrong SKU*, settled by *credit note*. Our `returned` status is fine for v1; add an optional `return_reason` enum (`damage|expiry|wrong_sku|refused`) on `update_status(returned)` so the audit row reads like a real one. §5.

14. **Recommended seed-data vocabulary (LLD §11):** retailers as "Sharma General Store", "Gupta Provision Store", "Verma Kirana", "Singh Traders", "Singh Stores", "Khan Bakers & General", "Jain Super Mart", "Agarwal Confectionery" with aliases `sharma`, `sharma ji`, `sharma wale`, `gupta store`; areas Karol Bagh / Lajpat Nagar / Rohini are fine (add "beat" names: "Karol Bagh beat = Monday/Thursday"). Products with `case_size` that looks real (noodles 70 g ×96, 140 g ×48; glucose biscuits ×120 or ×72; tea 250 g ×48; soap 100 g ×72; detergent 1 kg ×24; namkeen 40 g ×100 in 5 "patti" of 20). Aliases: `peti`, `carton`, `box`, `case`; `patti`/`strip` for sachet strips; `nudal`, `noodle`, `nudals`; `glucose`, `glucose biscuit`; `chai`, `chai patti`; `sabun`; `surf` → detergent **only as a generic alias, not a brand**. Per-product GST: don't default to 18 — use 5/12/18 mix (biscuits/namkeen/noodles lower, soap/detergent 18) and say "verify current rate" in a comment. Users: `ravi_sales`, `priya_sales` (DSRs), `amit_manager` (Sales Manager / "Sir"), `suresh_wh` (godown incharge), `deepak_delivery` (delivery boy). Historical orders with `delivered` dates spread 5–50 days back so aging is non-trivial; 5 payments with mixed modes (cash, UPI, cheque) because UPI is now 60–75% of sub-₹1 lakh invoices.

15. **Ranked feature ideas (value ÷ effort, highest first).** Details in §9.
    1. **Approval card with credit context** (outstanding, oldest-due days, last payment, headroom after bill) — ~1 h, biggest "they get it" signal.
    2. **DSR-style daily summary** (bills cut, productive calls, lines/bill, fill rate, collection by mode, overdue parties) — ~1 h, just renaming and two aggregates.
    3. **Scheme line `10+1`** on one product, printed on the bill — ~2 h.
    4. **Partial fulfilment + backorder line + fill rate** — ~2–3 h, touches approve/confirm.
    5. **"Pichla order repeat"** (last-order recall per retailer: `last_order` tool, "same as last time" → draft) — ~1.5 h, very field-real.
    6. **Credit-days + OVERDUE reason + collection reminder in summary** ("3 parties cross 30 days: …") — ~2 h.
    7. **Return reason enum** on `returned` — 20 min.
    8. **Load sheet per dispatch** (text block the godown can tick: order, party, area, cases) — ~1 h, nice in video.
    Skip: batch/expiry tracking, route optimisation, scheme claims, credit notes.

---

## 1. Vocabulary and glossary

Term → meaning → Hinglish phrasing to use in the agent, seed data and demo script.

| Term | Meaning in the trade | Phrasing to use | Source tag |
|---|---|---|---|
| **Beat / route** | The set of outlets one salesman covers in a day; beats repeat weekly/fortnightly. "The geographic area and outlet set assigned to a rep is called a beat." (mAssist). "This is the route that a salesman (DSR/SO/SR) follows on a particular day." (Wabel) | "aaj Karol Bagh beat hai", "beat pe hoon" | [sourced] |
| **PJP** | Permanent Journey Plan: the recurring schedule of which beat on which day. Vendor sources quote PJP adherence targets > 90% and real-world adherence as low as 30% (Bizom). | "PJP ke hisaab se Thursday Rohini" | [sourced] |
| **Order booking** | Taking the order at the counter (or over phone/WhatsApp). "Beat-and-book: visiting outlets in person to take orders" (Kirana Club). | "order book kar do", "order likh lo" | [sourced]/[domain] |
| **Bill / bill cut** | Invoice; "cutting a bill" = raising an invoice. "Bill-cut regularity" schemes reward "ordering in at least 4 of 5 weekly calls" (Unotags). Also LPI = Lines Per Invoice (Wabel). | "bill kaat do", "bill kat gaya", "aaj 14 bill cut hue" | [sourced] |
| **Challan** | Delivery challan: records "item quantities, vehicle information, and delivery terms so every order movement is properly recorded before final billing or delivery" (myBillBook). Goods move on a challan; money is on the bill. | "challan ke saath gaadi nikli" | [sourced] |
| **Load sheet / loading slip** | The godown's pick list per vehicle; "vehicle-specific inventory manifest"; reconciliation "Stock Loaded − Invoices Billed = Remaining Stock" (Tally). | "load sheet godown ko bhej di" | [sourced] |
| **Scheme** | Trade promotion: free goods, % off, slabs. "Trade Schemes are usually additional support in terms of Sales Promotion" (M. Sethi). Primary scheme = company→distributor; secondary scheme = distributor→retailer, claimed back. | "scheme kya chal rahi hai?", "10+1 chal raha hai noodles pe" | [sourced] |
| **QPS** | Quantity Purchase Scheme, "the general-trade workhorse" (Unotags): 12 cases → 3%, 24 → 5%, 48 → 7%. | "QPS slab" | [sourced] |
| **Margin** | Retailer 5–10% on national brands, 10–18% regional; distributor 6–12% (Kirana Club); distributor *net* 3–5% (Kotak Neo). | "margin kitna milega?" | [sourced] |
| **MRP / PTR / PTS** | MRP ₹100 → retailer buys at PTR ₹85 → distributor buys at PTS ₹76 (Kirana Club worked example). Older usage: RLP (Retailer Landing Price), DLP (Distributor Landing Price) (M. Sethi). | "PTR pe bill banega" | [sourced] |
| **Outstanding / udhaar / baki** | Unpaid dues of a party. "Udhar Vasuli" = collecting dues (3SI playbook title). | "Sharma ji ka kitna baki hai?", "udhaar 38,500 hai" | [sourced] |
| **Credit days / credit period** | Days allowed to pay from invoice date ("Credit period begins from invoice date, not delivery date" — Kirana Club terms sheet). | "21 din ka credit hai" | [sourced] |
| **Party** | A customer account (retailer/wholesaler). "Party-wise ledgers", "Party-wise outstanding reports" (myBillBook). | "party ka ledger", "party over-limit hai" | [sourced] |
| **Collection / vasooli** | Collecting money against bills, by salesman on beat, by delivery boy, or via UPI link. | "collection kitni hui?", "15,000 cash mila" | [sourced]/[domain] |
| **Peti / case / carton** | A shipper case. Student prototypes note "regional units like 'peti', 'dabba'" and the sample message "Bhai 3 peti … bhej dena" (GitHub, synthetic). "1 Case of X comprises of 24 units" (M. Sethi). | "das peti noodles", "5 case biscuit" | [sourced] |
| **Patti** | A strip of sachets/pouches (e.g., 20 × ₹5 packs). | "do patti shampoo" | [domain] |
| **SKU** | "a specific product from a range … a 100-gram Dettol original soap is one SKU" (Wabel). | "kaunsa SKU? 70 g ya 140 g?" | [sourced] |
| **Primary / secondary / tertiary** | Company→distributor / distributor→retailer / retailer→consumer ("offtake") (Wabel, Terra Insight). | "secondary 31 lakh hua is month" | [sourced] |
| **DSR** | (a) Distributor Sales Representative: "the salesmen who are responsible to make sales of company's products (SKUs) to retailers … employed by distributors but managed by TM/TSM" (Wabel). (b) Daily Sales Report. Both are in use; context decides. | "DSR bhej do" (report) / "DSR Ravi" (person) | [sourced] |
| **Cash memo** | A simple cash bill without credit terms; FMCG billing software produces "GST invoices, cash bills, and delivery challans" (Vyapar via search). | "cash memo bana do" | [sourced] |
| **Market return** | Goods coming back from the shop: damage, expiry, wrong SKU. Types: "Damage in transit", "Expiry returns", "Wrong SKU delivered", "Quality claims" (Kirana Club). "L&D (Leakage & Damage)" (Wabel). Settled by **credit note**. | "market return aaya 2 case", "damage ka credit note" | [sourced] |
| **Godown** | Warehouse; each van can be a "virtual godown" (Tally). | "godown mein stock hai?" | [sourced] |
| **Stock / maal / stock-out / short supply** | "Short supply: credit note for shortage" (engineerbabu). | "maal nahi hai", "short supply 2 peti" | [sourced]/[domain] |
| **Days of stock / stock cover** | "how many days of inventory a distributor holds based on current sales velocity"; norm 12–18 days (mAssist). | "sirf 3 din ka stock" | [sourced] |
| **Productive call (PC)** | A visit that produced an order. Strike rate = "% of all successful sales calls out of total calls made by a DSR" (Wabel). | "aaj 22 call, 15 productive" | [sourced] |
| **Lines per call (LPC)** | Distinct SKUs per productive call; "4 to 6 lines per call is typical for general trade" (mAssist). | "LPC 4.2" | [sourced] |
| **Fill rate / OTIF** | Supplied ÷ ordered; "benchmark is above 95% within 48 hours" (mAssist). | "fill rate 92%" | [sourced] |
| **Supply hold / dispatch hold** | Stopping fresh supply to an overdue party; "next dispatch hold hoga agar 7 din mein clear nahin hua" (3SI). | "supply hold pe hai" | [sourced] |
| **Van sales / ready stock** | Selling off the vehicle on the beat (Tally). Contrast: *pre-sell* (book today, deliver tomorrow) — our model. | "kal ki gaadi mein jayega" | [sourced] |
| **TSI / SO / PSR / ISR** | Company-side field roles (Territory Sales Incharge, Sales Officer, Pilot Sales Rep …) who supervise DSRs (FMCG Sales Guru, Kirana Club). | "TSI sahab" | [sourced] |

Agent reply templates in the right register (all [domain], built from the sourced words):

- Draft: `Order booked (draft #1046) — Sharma General Store, Karol Bagh beat\n• Crunchy Masala Noodles 70g — 10 peti (₹…)\n• Gold Glucose — 5 peti → sirf 3 available ⚠️\nCredit: outstanding ₹38,500 / limit ₹40,000, oldest bill 23 din ⚠️\n@amit_manager approval chahiye.`
- Confirmed: `Bill INV-2026-0012 cut ✅ ₹…\nGodown: @suresh_wh load sheet ready, Karol Bagh gaadi.`
- Collection: `₹15,000 cash Sharma store se record kiya. Baki ab ₹23,500.`
- Summary header: `DSR — 4 Nov\nBills cut 14 | Productive calls 12/22 | Lines/bill 3.4 | Fill rate 93%\nCollection ₹1,12,400 (UPI 68%) | Overdue parties 3`

## 2. Order-to-cash at a small distributor

What the sources describe, stitched into one day:

1. **Order booking.** DSR visits the beat (30–45 outlets/day; "handling 30-40 retailers per day" — SpireStock; "Daily outlets visited per sales rep: 45 (Industry average)" — Bizom). Orders are written in an order book or app; increasingly retailers message directly: "Orders arrive by phone or WhatsApp, and the distributor tracks stock in basic Tally software" (mAssist). Typical text: *"bhai 200 amul 1L, 50 dahi 400g, deliver kal"* (HublerX).
2. **Order entry at the desk.** Someone retypes into Tally/DMS, often in the evening: "A 10 AM order reaches the desk at 6 PM" (biizline); "Visit logs are filled in at day's end" (mAssist). Manual accuracy 85–90% (SpireStock).
3. **Credit check.** DMS rule: "Available credit = Credit limit − outstanding + uncleared credits"; "Outstanding beyond credit days triggers order hold" (engineerbabu). Today's failure: "Field reps sometimes take orders from accounts already on credit hold" (mAssist).
4. **Stock check / allocation.** "The salesperson promises fifty cases. Only thirty two are in the godown" (biizline). Orders get cut short or rejected; "Order Rejection Rate … stock unavailability, credit breach, or data errors … benchmark is below 3%" (mAssist).
5. **Billing.** Bill = GST invoice with party GSTIN, HSN per line, CGST/SGST (Tally). Scheme applied here — "Scheme Compliance Rate: share of eligible orders where the correct trade scheme was applied at order entry … benchmark above 90%" (mAssist). Errors: "Margin leakage from pricing errors is systematic and invisible until month-end reconciliation" (HublerX); "The team gets it right on 90 percent of orders" (biizline).
6. **Picking / packing.** Godown works from the load sheet; stock moved to a vehicle "godown" (Tally).
7. **Dispatch.** Vehicle per area/beat; delivery challan; e-way bill above threshold (search, verify). Next-day delivery in 12–24 h for manual, retailers "prefer orders to be delivered within 1 to 3 days, with under 48 hours being the sweet spot" (Kirana Club survey of 9,000 retailers).
8. **Delivery.** Delivery boy hands over, may take cash/UPI: "Cash can be collected at the counter, during delivery, or by a salesman on a route" (myBillBook).
9. **Collection.** Salesman collects on the next beat; UPI now 60–75% of invoices under ₹1 lakh (3SI). Failure: "cash is collected during delivery but not marked against the correct invoice … bill ₹12,500, paid ₹7,500, pending ₹5,000" (myBillBook).
10. **Settlement / reconciliation.** Evening: "One person creates the bill, another collects cash, someone else checks UPI, and the owner later tries to match everything at night" (myBillBook); the accountant's "9 PM session" (3SI). DSO 60–75 days for manual distributors, 40–55 automated; "Above 65 days is a structural problem" (3SI).

Where mistakes happen (for the README "problem" slide):
- Lost/duplicated intake: "Missed orders are a matter of frequency, not possibility" (biizline). No source quantified duplicates; our idempotency story stands on its own.
- Over-credit: orders taken on held accounts; "Overdue amounts surface late" (mAssist).
- Stock surprise: "the lag in learning about a low-stock SKU … the single biggest driver of low secondary OFR" (mAssist OFR); "Lost sales from these blind spots average 4 to 7 percent of monthly throughput" (biizline).
- Wrong price/scheme: 3–6% margin leakage (biizline); "Scheme knowledge is inconsistent. Execution is patchy … reps recall them from memory" (mAssist).
- Missed collections: "Collection defaults from poor credit visibility: 0.25 to 1 percent of revenue" (biizline); "when credit is tracked only in notebooks, follow-ups depend on memory" (myBillBook).

## 3. Credit control practices

- **Limit sizing.** "Based on two to three months of historical purchase volume, not the retailer's request" (3SI). For new parties: "Start with a trial limit of ₹1 to 2 lakh … 30-day review" (AI Accountant, SMB generic). Warn "at bill creation, before goods leave the shop" (Accountune).
- **Credit days.** Brand→distributor 15–30 days (Kirana Club). Distributor→retailer: "the credit period that they bargain for has increased to about 25 days from 12 to 14" (Business Standard, 2023, via search); "extending 30 to 60 days of credit" on "margins of 3% to 5%" (Kotak Neo). Retailers buy from "7 to 12 distributors, each giving 30 to 60 days of credit" (3SI).
- **Aging buckets.** 0–30 normal; 31–60 itemised statement; 61–90 personal contact and freeze; 90+ settle or write off (Accountune). Policy automation blog: "0 to 30, 30 to 60, 60 to 90, 90 plus, with MSME 45 day focus".
- **Hold triggers.** "Auto freeze accounts at 40 days overdue" (AI Accountant); 3SI cadence: day 3 gentle, 15 due-date, 30 firm ("next dispatch hold hoga agar 7 din mein clear nahin hua"), 45 owner escalation, 60 dispatch held. "Lower-priority parties face automatic dispatch holds at day 60" (3SI collections).
- **Exceptions.** Maker (sales) → checker (finance) → approver; decision "time-bound and logged"; overrides "expire after 30 days or one transaction" (AI Accountant). Audit guidance: "Confirm available credit, current exposure, and open orders were reviewed before the hold was removed" (MangoApps template via search).
- **What the approver looks at**: aging, last payment behaviour, whether an advance/partial payment is confirmed, the party's value tier (Gold/Silver/Bronze — 3SI), season. Early-payment discount 1–2% within 10 days is a lever (3SI).
- **Cultural note.** Reminders should be in the retailer's language: "Hinglish suits most of North and Central India. Don't switch to formal English, because it 'feels like a bank recovery notice'" (3SI). Sample reminder: "Namaste ji, aapka ₹4,200 pending hai. Kripya jaldi settle kar dijiye." vs the itemised version which the author prefers (Accountune). "A reminder at day 20 is a receipt. A reminder at day 100 is an accusation."

Implication for OrderRoom: approve_order's audit `after_json` should carry `oldest_due_days` and `last_payment`, and the agent's approval card should print them. A one-line "temporary limit" is out of scope; a decision note is enough.

## 4. Schemes and pricing

- **Price ladder** (Kirana Club): MRP ₹100 → PTR ₹85 (retailer margin ~15% on MRP) → PTS ₹76 (distributor ~10% on PTR) → brand net ₹70–74. Expected margins: retailer 5–10% national brands, 10–18% regional, 18–25% new; distributor 6–12%. Hidden costs: schemes add 5–15% to cost of sales; credit losses 2–3%; returns/expiry 3–5% first year.
- **Scheme types** (FMCG Sales Guru, M. Sethi, Unotags, Tally):
  - Free goods / quantity: "1 piece free against purchase of 20 piece"; "Buy 10 Cases, Get 1 Case Free".
  - Percentage: "2 % extra against purchase of 10 carton"; "an unconditional 3.5% cash discount".
  - QPS slabs: 12 cases 3%, 24 → 5%, 48 → 7%; or value slabs ₹6,000 → 2%, ₹10,000 → 3%, ₹15,000 → 4%.
  - Primary (deducted on the company's invoice to the distributor) vs secondary (distributor passes to market, then claims; "Average Claims Outstanding" is a distributor ROI line).
  - Others for flavour only: display rent ₹300–1,500/store/month, bill-cut regularity bonus, first-bill bonus ₹50–200.
- **Field reality**: "field staff often cannot explain them properly, which leads to disputes" (FMCG Sales Guru); schemes "shared through paper circulars and WhatsApp" (mAssist).
- **GST on the bill** (Tally): party GSTIN + state decide CGST/SGST vs IGST; HSN per line; e-invoice/e-way bill optional. For the demo: intra-state, CGST+SGST split of the product's rate, HSN placeholder per product. Our flat `gst_pct` per product is fine; vary it (5/12/18) rather than defaulting everything to 18, and comment "verify current rate".

Cheapest realistic rule: free-quantity scheme on one SKU (`{"type":"free_qty","buy":10,"free":1}`), applied per bill, free line at ₹0, label "Scheme 10+1". Optional second: `{"type":"pct","min_cases":5,"pct":3}` as a line discount. Do not model claims.

## 5. Stock, stock-outs, partial fulfilment, returns

- **Units of talk**: cases/peti first, loose units ("pieces", "pcs") second; batch and expiry underneath ("Stock at distributor warehouse, by SKU, by lot, by expiry" — engineerbabu). FIFO at every level (Kirana Club).
- **Norms**: distributor days of stock 12–18 (mAssist); 10–21 with < 7 risky, > 30 overstock (Rework); "SKUs with > 60 days cover, needs push" (engineerbabu); "Stock approaching best-before date, needs priority liquidation".
- **Stock-out handling**: order is cut to available or rejected; "Order Rejection Rate … below 3%" benchmark; "a distributor sent only 70% of ordered SKUs. The rest was marked as unavailable or got delayed" (mAssist OFR). No source describes a formal backorder process at small distributors — in practice the balance rides on the next trip or is dropped. OOS at shelf: industry average ~8% (Rework).
- **Fill rate**: "(Quantity supplied / Quantity ordered) × 100"; "below 95% creates downstream problems" (Rework); line fill vs case fill vs OTIF (mAssist OFR).
- **Returns** (Kirana Club, engineerbabu): transit damage claims within 24–48 h with photos; expiry: brand bears within shelf life + 30 days, distributor if held too long; wrong SKU from picking errors; settle via credit note "against the next order"; keep returns < 2–3% of primary; claims idle > 7 days flagged. Retailer view: "Unwillingness to accept returns discourages retailers from taking a chance on new products" (Kirana Club survey).

OrderRoom mapping: SHORT_STOCK → offer available now + backorder line; summary shows fill rate; `returned` gets a reason; batch/expiry only as README future work.

## 6. Daily reports managers look at

Fields that recur across the KPI sources (mAssist, Rework, FieldAssist via search, Wabel):

| Field | Definition / benchmark |
|---|---|
| Outlets visited / calls | 22–30/day urban (Rework); 30–45 (SpireStock, Bizom); 80–150 outlets per beat cycle (mAssist) |
| Productive calls / bills cut | Visits with an order; strike rate 60–75% GT, 70–85% urban van (Rework, mAssist) |
| Lines per call / per bill | 4–6 typical GT (mAssist); example scorecard target 3.5 (Rework) |
| Bill value / AOV | Track vs prior month |
| Fill rate / OTIF | > 95% within 48 h |
| Order rejection rate | < 3% |
| Scheme compliance | > 90% |
| Collection | By mode (cash/UPI/cheque); UPI 60–75% of small invoices (3SI) |
| Outstanding & aging | Party-wise, 0–30/30–60/60–90/90+ buckets; DSO 45–55 healthy |
| Days of stock / low stock | 12–18 days norm; list SKUs < 7 days |
| PJP / beat adherence | > 85–90% |
| Secondary vs primary | Secondary within 5–10% of primary |

Our `daily_summary` should expose: `bills_cut`, `productive_calls`, `orders_requested`, `lines_per_bill`, `fill_rate_pct`, `collection_total`, `collection_by_mode`, `overdue_parties[{name, outstanding, oldest_due_days}]`, `over_limit_parties`, `low_stock[{name, available_cases}]`, `pending_approval`, `top_parties`. Phone-friendly: one metric per line.

## 7. Pain points and evidence (quotable, with URLs)

Market scale
- "nearly 13 million kirana stores contributing about 90% of sales"; "Roughly 400,000 of them [distributors], represented by the All India Consumer Products Distributors Federation"; "operating on margins of 3% to 5%" while "extending 30 to 60 days of credit" — Kotak Neo, https://kotakneo.com/investing-guide/insights/fmcg-distributor-disruption-quick-commerce/
- "Kirana stores, which accounted for 81 per cent of FMCG sales a year ago … saw their share slip to 79 per cent by December 2024" — Kantar via KNN, https://knnindia.co.in/news/newsdetails/sectors/others/quick-commerce-replacing-kirana-sales-in-fmcg-report
- "Nearly 80% of FMCG sales in India are controlled by kirana stores"; HUL: "With more than 3,500 distributors spread across 2,000 towns", "cut the supply time from three days to less than twenty-four hours", "remove credit restrictions for kirana stores, which account for three-fourths of its sales" — IIFL, https://www.indiainfoline.com/news/companies/hul-bypasses-distributors-targets-kiranas-directly
- "India has roughly 12 million kirana stores." — Kirana Club, https://kirana.club/resources/fmcg-distribution-india-guide
- AICPDF "more than 450,000 members" / "over 400,000 distributors and 350,000 sub-distributors" — Outlook Business / Business Standard (search summaries).

How orders are placed today
- "60–70% of distributor orders" arrive via WhatsApp; "A WhatsApp message takes 15 seconds. A distributor app requires login and form completion — 3–5 minutes"; "Distributors who have tried to move kirana stores to apps consistently find adoption below 15%"; "Distributors process 300–600 WhatsApp messages per day"; sample: "bhai 200 amul 1L, 50 dahi 400g, deliver kal" — HublerX (vendor), https://www.hublerx.ai/resources/blog/fmcg-distribution-software-india
- "the salesman becomes a bottleneck, handling 30-40 retailers per day"; handwritten orders "85-90%" accurate; manual order-to-dispatch "12-24 hours"; phone+manual entry "45 minutes" vs 8 in a DMS — SpireStock (vendor), https://spirestock.com/blog/retailer-order-app-fmcg-distribution-india
- "Orders arrive by phone or WhatsApp, and the distributor tracks stock in basic Tally software with no link to the company's systems"; "Field reps sometimes take orders from accounts already on credit hold"; "Scheme knowledge is inconsistent. Execution is patchy"; reps spend "only 30% of their week selling" — mAssist (vendor), https://blog.massistcrm.com/fmcg-distribution-challenges-how-smart-field-operations-fix-what-manual-processes-break
- "Missed orders are a matter of frequency, not possibility"; "A 10 AM order reaches the desk at 6 PM"; "losing two to five percent of order accuracy to the intake process alone"; "The salesperson promises fifty cases. Only thirty two are in the godown"; "Lost sales from these blind spots average 4 to 7 percent of monthly throughput"; "margin leakage from manual scheme handling at 3 to 6 percent"; "Combined operational tax for a manual FMCG distributor: 6 to 12 percent of annual revenue"; "The owner is the system" — biizline (vendor), https://biizline.com/order-management-problems-fmcg-distribution-india/
- "The problem starts when cash is collected during delivery but not marked against the correct invoice"; "One person creates the bill, another collects cash, someone else checks UPI" — myBillBook, https://mybillbook.in/blog/?p=10191
- "FMCG brands can't ensure a salesman visits their thousands of retailers each day" — Bizom, https://bizom.com/dont-make-retailers-wait-in-this-whatsapp-age
- "Retailers are 'ordering blind, often unaware of schemes, pricing changes, or new products'"; "Distributors are drowning in credit, not cash flow"; "NO Banda = NO Dhanda" — Badho/PTI sponsored, https://www.tribuneindia.com/news/business/badho-app-fixing-what-everyone-in-fmcg-knows-is-broken-indias-general-trade
- Retailer survey (9,000+ retailers): "Most prefer orders to be delivered within 1 to 3 days, with under 48 hours being the sweet spot"; out-of-stocks "a major pain point" — Kirana Club, https://insider.kirana.club/p/retailers-verdict-on-servicing

Credit
- DSO "60 to 75 days" manual vs "40 to 55" automated; "Above 65 days is a structural problem, not a seasonal one"; UPI "60 to 75% for invoices under ₹1 lakh" — 3SI, https://landing-3si.pages.dev/blog/how-indian-distributors-manage-collections
- "the fundamental trap is giving 60 days of credit while paying suppliers in 30"; "Retailers buy from 7 to 12 distributors, each giving 30 to 60 days of credit" — 3SI, https://landing-3si.pages.dev/blog/udhar-vasuli-kaise-kare-distributor
- "Recovery is a record problem long before it is a collection problem" — Accountune, https://accountune.com/udhaar-recovery-outstanding-payments
- "the credit period that they bargain for has increased to about 25 days from 12 to 14" — Business Standard 2023 (search summary; page 403 on fetch), https://www.business-standard.com/amp/companies/news/fmcg-items-start-to-pile-up-in-supply-chain-as-demand-starts-to-taper-off-123090700603_1.html

Use the vendor numbers with "vendor estimate" in the README; use Kantar/HUL/Kotak for the headline.

## 8. Voice

Evidence salesmen/retailers use voice
- Flipkart Wholesale voice search (Hindi + English, Jan 2022): "three times faster than typing in English and five times faster in Hindi"; "about three million voice queries per day, with more than half coming from towns under 50,000"; built because "most people may not write or read much English" — https://voicebot.ai/2022/02/01/flipkart-adds-hindi-and-english-voice-search-to-wholesale-e-commerce/
- Flipkart later launched a Sarvam-powered voice ordering bot on WhatsApp for small retailers (MIT Sloan ME article; page returned 500 on fetch; search summary only).
- Exotel WhatsApp bot docs: voice notes are a standard input; "Voice notes over one minute are unsupported"; accuracy drops with noise, long notes, and "product names, abbreviations, or uncommon words"; spoken numbers may come out as words; Hinglish/Benglish/Tanglish supported when multilingual is on — https://docs.exotel.com/intelligent-chat-agent/whatsapp-voice-note-support
- BeatRoute TeleOrder: AI phone agent takes orders in Hindi/English from unvisited outlets; retailer "couldn't tell the difference" — https://beatroute.io/newsroom/teleorder-ai-agent-live-orders/
- No public source shows a *salesman's* voice-note order log; the behaviour is inferred from the retailer-side evidence and from the WhatsApp-first ordering numbers in §7.

STT options (prices as published Nov 2026)

| Option | Price | Hindi/Hinglish notes | API effort |
|---|---|---|---|
| OpenAI `gpt-4o-transcribe` | $0.006/min (≈ ₹0.50) | Good Hindi; outputs Devanagari when `language=hi`; `prompt` steers product names; no official WER | One multipart POST, 25 MB cap, no duration cap for our notes. Key already planned. |
| OpenAI `whisper-1` | $0.006/min | Older; same API | Same |
| OpenAI `gpt-4o-mini-transcribe` | $0.003/min | Slightly lower accuracy | Same |
| Sarvam Saaras v4 (`/speech-to-text`) | ₹0.49/min pay-as-you-go, billed per second; ₹100 free credits | Built for 22 Indic languages; `codemix` and `translit` modes give Roman-script Hinglish directly (helps alias matching); Saaras v2.5 ~22% WER on IndicVoices (vendor) | REST ≤ 30 s audio per request; longer → batch job (upload, poll ~5 s). OGG/Opus accepted. |
| Google STT v2 (Chirp) | ~$0.024/min standard (third-party summaries) | Decent Hindi; no code-mix mode | More setup (GCP project, auth) |
| AI4Bharat IndicConformer / IndicWhisper | Free, CC-BY-4.0 | Hindi WER ~13% on Vistaar (community repos); best raw Hindi, weaker on English brand words | NeMo + GPU; gated HF repo. Not a 4-day option. |

Recommendation: **OpenAI `gpt-4o-transcribe`, `language: "hi"`, `prompt: "FMCG order in Hinglish: peti, case, noodles, biscuit, chai, sabun, Sharma store …"`.** Keep `transcribe_voice` as spec'd. Have the agent read Devanagari output as-is (Claude handles it) and echo "Samjha: …" in Roman Hinglish. If time allows, `STT_PROVIDER=sarvam` using `mode: "translit"` for Roman output; fall back to batch for > 30 s. Budget: ₹0.5 per note either way.

## 9. Feature ideas ranked by value ÷ effort

| # | Feature | Why domain people nod | Effort | Touches |
|---|---|---|---|---|
| 1 | **Credit context on the approval card** — outstanding, limit, oldest unpaid bill age, last payment (amount/date), avg monthly billing, exposure after this bill | This is literally what the owner looks at before saying "de do" | ~1 h | `credit.ts`, `retailer_dues`, approval reason JSON, agent template |
| 2 | **DSR-style daily summary** — bills cut, productive calls, lines/bill, fill rate, collection by mode, overdue parties, low stock | Every manager reads a DSR; using the fields makes the summary recognisable | ~1 h | `summary.ts` |
| 3 | **Scheme line "10+1"** on one SKU, printed on the bill | Schemes are the most-discussed thing on a beat | ~2 h | `products.scheme`, `orders.ts` totals, `invoice.ts` |
| 4 | **Partial fulfilment + backorder + fill rate** — "3 peti abhi, 2 backorder" | Short supply is daily life; a tool that *offers* available qty is what a desk clerk does | ~2–3 h | `order_items.qty_backordered`, approve/confirm, summary |
| 5 | **"Pichla order repeat"** — `last_order(retailer_id)` and "same as last time" | Salesmen reorder by habit; retailers say "wahi bhej do" | ~1.5 h | new read tool, agent instruction |
| 6 | **Credit days + OVERDUE reason + reminder list** — "3 parties crossed 30 days" in the summary | Age of debt, not just size, is what triggers holds | ~2 h | `retailers.credit_days`, `credit.ts`, summary |
| 7 | **Return reason** on `returned` (damage/expiry/wrong_sku/refused) | Market return vocabulary; audit row reads real | 20 min | `update_status` schema |
| 8 | **Load sheet per dispatch** — text block grouped by area: order, party, cases | Godown works from a load sheet, not from chat | ~1 h | `update_status(packed)` output |

Not worth it this week: batch/expiry, route optimisation, scheme claims, credit notes, PTR/PTS price ladders, e-way bill.

---

## Sources read in full (40)

Industry structure, vocabulary, flow
1. https://kirana.club/resources/fmcg-distribution-india-guide — chain, kirana count, TSI/beat vocabulary, credit cycle
2. https://kirana.club/resources/fmcg-distributor-kirana-margins — MRP→PTR→PTS example, margin ranges, hidden costs
3. https://kirana.club/resources/fmcg-distributor-terms-sheet — credit period, invoice-date rule, claim windows
4. https://kirana.club/resources/fmcg-returns-expiry-damages-gt — return types, responsibility matrix, credit notes
5. https://insider.kirana.club/p/retailers-verdict-on-servicing — 9,000-retailer survey on delivery/stock-outs
6. https://www.wabel.com/?p=1204 — FMCG terms: primary/secondary, beat, DSR, QPS/VPS, strike rate, LPC
7. https://mamtasethi2.blogspot.com/2016/04/fmcg-gyaan-with-msethi.html — trade schemes, QPS, RLP/DLP, case = 24 units, claims outstanding
8. https://fmcgsalesguru.blogspot.com/2020/04/how-to-manage-trade-scheme-in-fmcg-sales.html — scheme types, primary vs secondary, field roles
9. https://unotags.com/blog/types-of-retailer-schemes-fmcg.html — 12 retailer scheme types with slabs
10. https://www.terra-insight.com/insights/secondary-sales-gap-stock-in-trade-fmcg/ — primary/secondary/stock-in-trade equation, DMS lag
11. https://kotakneo.com/investing-guide/insights/fmcg-distributor-disruption-quick-commerce/ — 400k distributors, 13M kiranas, 3–5% margin, 30–60 day credit
12. https://www.indiainfoline.com/news/companies/hul-bypasses-distributors-targets-kiranas-directly — HUL figures, 80% kirana share
13. https://knnindia.co.in/news/newsdetails/sectors/others/quick-commerce-replacing-kirana-sales-in-fmcg-report — Kantar 81%→79%
14. https://www.tribuneindia.com/news/business/badho-app-fixing-what-everyone-in-fmcg-knows-is-broken-indias-general-trade — GT pain quotes (sponsored)

DMS / SFA vendor material (flow, KPIs, pain points)
15. https://engineerbabu.com/blog/?p=23896 — DMS modules, credit formula, overdue hold, claims, stock by lot/expiry
16. https://blog.massistcrm.com/beat-planning-in-sales-fmcg-guide — beat/route definitions, outlets per cycle, PCPD, LPC, BPA
17. https://blog.massistcrm.com/fmcg-distribution-challenges-how-smart-field-operations-fix-what-manual-processes-break — phone/WhatsApp orders, credit-hold orders, scheme execution
18. https://blog.massistcrm.com/10-kpis-every-fmcg-sales-manager-must-track-with-benchmarks — strike rate, LPC 4–6, fill rate > 95%, days of stock 12–18, rejection < 3%
19. https://blog.massistcrm.com/order-fulfillment-rate-fmcg-growth — OFR/fill rate/OTIF, causes of partial fulfilment
20. https://resources.rework.com/ms/libraries/fmcg-distribution-growth/fmcg-sales-kpis-metrics — KPI dashboard with benchmarks (served in Malay; numbers intact)
21. https://bizom.com/beat-optimization-for-fmcg-the-traveling-salesman-chronicles — 45 outlets/day, PJP adherence 30%
22. https://bizom.com/dont-make-retailers-wait-in-this-whatsapp-age — WhatsApp ordering rationale
23. https://beatroute.io/newsroom/teleorder-ai-agent-live-orders/ — AI phone order-taking in Hindi
24. https://www.hublerx.ai/resources/blog/fmcg-distribution-software-india — 60–70% WhatsApp orders, 15-second argument, sample message
25. https://spirestock.com/blog/retailer-order-app-fmcg-distribution-india — manual accuracy 85–90%, 30–40 retailers/day, adoption stats
26. https://biizline.com/order-management-problems-fmcg-distribution-india/ — intake, scheme, stock, credit loss percentages
27. https://tallysolutions.com/business-guides/tallyprime-for-fmcg-distributors/ — van sales, load sheet, "Buy 10 get 1", GST billing fields
28. https://mybillbook.in/blog/?p=10191 — cash-vs-invoice matching, party-wise ledgers, ageing

Credit and collections
29. https://landing-3si.pages.dev/blog/udhar-vasuli-kaise-kare-distributor — limit sizing, reminder cadence, Hinglish reminder wording
30. https://landing-3si.pages.dev/blog/how-indian-distributors-manage-collections — DSO tiers, UPI share, written credit policy
31. https://accountune.com/udhaar-recovery-outstanding-payments — ageing buckets, Hinglish reminder examples
32. https://aiaccountant.com/blog/customer-credit-limit-policy-automation — freeze triggers, approval tiers, override expiry

Voice and STT
33. https://voicebot.ai/2022/02/01/flipkart-adds-hindi-and-english-voice-search-to-wholesale-e-commerce/ — 3M voice queries/day, 5× faster in Hindi
34. https://docs.exotel.com/intelligent-chat-agent/whatsapp-voice-note-support — voice-note handling, limits, Hinglish
35. https://docs.sarvam.ai/api-reference-docs/pricing — ₹0.49/min STT, ₹100 free credits
36. https://docs.sarvam.ai/api-reference-docs/speech-to-text/apis/overview — Saaras v4, modes, 30 s REST limit, formats
37. https://developers.openai.com/api/docs/pricing — whisper-1 / gpt-4o-transcribe $0.006/min, mini $0.003/min
38. https://www.callmissed.com/blog/speech-text-apis-indian-languages-compared-2026 — Indian-language STT comparison, Saaras WER claim
39. https://huggingface.co/ai4bharat/IndicConformer — model card (template-only), NeMo, CC-BY-4.0, gated
40. https://ai4bharat.iitm.ac.in/areas/asr — IndicWav2Vec / IndicWhisper / IndicConformer overview

## Surfaced in search summaries (not fetched in full; quoted only via the summary)
- https://www.business-standard.com/amp/companies/news/fmcg-items-start-to-pile-up-in-supply-chain-as-demand-starts-to-taper-off-123090700603_1.html — retailer credit 12–14 → 25 days (403 on fetch)
- https://www.business-standard.com/amp/companies/news/hul-kirana-distribution-samadhan-strategy-124123100260_1.html — HUL Samadhan (403)
- https://www.outlookbusiness.com/explainers/kirana-stores-under-pressure-from-q-commerce-discounts-will-fmcg-giants-stem-the-tide — AICPDF 450,000 members, 13M kiranas
- https://www.business-standard.com/industry/news/fmcg-distributors-rally-to-defend-turf-against-online-competitors-125011200488_1.html — 400,000 distributors + 350,000 sub-distributors
- https://www.mitsloanme.com/article/flipkart-brings-voice-led-wholesale-ordering-to-whatsapp-with-sarvam-ai/ — Flipkart × Sarvam WhatsApp voice bot (500 on fetch)
- https://www.fieldassist.in/blog/beat-plan-fmcg-sales-distribution-management — beat/PJP definitions (socket error)
- https://medium.com/locus-sh/optimizing-fmcg-sales-beats-c49919bae715 — beat optimisation (403)
- https://www.credenceresearch.com/report/india-fmcg-market — GT & kirana 64% of 2025 value (market-research estimate)
- https://github.com/AI4Bharat/vistaar — IndicWhisper benchmarks (Hindi avg WER 13.6)
- https://huggingface.co/Singla0009/IndicConformer-GGUF — community Hindi WER 13.5% Kathbath
- https://github.com/ksnprojects/Kirana-AI — prototype with "Bhai 3 peti … bhej dena" sample (synthetic)
- https://www.mangoapps.com/templates/inspections/commercial-account-credit-hold-and-ar-aging-audit — hold-release checklist
- https://vyaparapp.in/free/billing-software-for-retail-shop/fmcg-distributor — GST invoice / cash bill / challan trio
