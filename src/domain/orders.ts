// LLD §4 state machine + §5 rules. Every function here runs inside runWrite's transaction.
import type { DB } from "../db/client.js";
import type { WriteCtx, WriteResult } from "./audit.js";
import { STATUS_ROLES } from "./authz.js";
import { addDays, now, sqlTimestamp, today } from "./clock.js";
import {
  avgMonthlyPurchase,
  type CreditView,
  creditView,
  getRetailer,
  lastPayment,
  type RetailerRow,
} from "./credit.js";
import { DomainError, notFound, validation } from "./errors.js";
import { type Actor, forbidden, handlesWithRole } from "./identity.js";
import { computeTotals, rupees } from "./money.js";
import {
  available,
  daysOfCover,
  freeQty,
  getProduct,
  needed,
  type ProductRow,
  schemeText,
} from "./stock.js";

export type OrderStatus =
  | "awaiting_confirmation"
  | "needs_approval"
  | "confirmed"
  | "packed"
  | "dispatched"
  | "delivered"
  | "returned"
  | "rejected"
  | "cancelled";

export type Reason =
  | { type: "OVER_CREDIT"; exposure: number; limit: number; headroom_after: number }
  | { type: "OVERDUE"; oldest_due_days: number; credit_days: number }
  | {
      type: "SHORT_STOCK";
      product_id: number;
      name: string;
      requested: number;
      available: number;
      days_of_cover: number;
    };

export interface OrderRow {
  id: number;
  retailer_id: number;
  status: OrderStatus;
  approval_reasons: string | null;
  created_by: number;
  approved_by: number | null;
  decision_note: string | null;
  return_reason: string | null;
  subtotal: number;
  tax: number;
  total: number;
  bill_no: string | null;
  bill_path: string | null;
  confirmed_at: string | null;
  delivered_at: string | null;
  due_date: string | null;
  room_id: string;
  source_message_id: string;
  created_at: string;
}

interface ItemRow {
  product_id: number;
  qty_requested: number;
  qty_confirmed: number | null;
  qty_free: number;
  qty_backordered: number;
  unit_price: number;
}

export interface ItemInput {
  product_id: number;
  qty_cases: number;
}

const DRAFT: OrderStatus[] = ["awaiting_confirmation", "needs_approval"];

// ───────────────────────────── loading ─────────────────────────────

export function getOrderRow(db: DB, id: number): OrderRow {
  const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
  if (!o) throw notFound("order", `#${id}`);
  return o;
}

function items(db: DB, orderId: number): ItemRow[] {
  return db
    .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid")
    .all(orderId) as ItemRow[];
}

function handleOf(db: DB, userId: number | null): string | null {
  if (userId == null) return null;
  return (
    (
      db.prepare("SELECT handle FROM users WHERE id = ?").get(userId) as
        | { handle: string }
        | undefined
    )?.handle ?? null
  );
}

function mustRetailer(db: DB, id: number): RetailerRow {
  const r = getRetailer(db, id);
  if (!r?.active) throw notFound("party", id);
  return r;
}

function mustProduct(db: DB, id: number): ProductRow {
  const p = getProduct(db, id);
  if (!p?.active) throw notFound("product", id);
  return p;
}

// ───────────────────────────── evaluation ─────────────────────────────

export interface DraftLine {
  product_id: number;
  sku: string;
  name: string;
  qty: number;
  unit_price: number;
  gst_pct: number;
  available: number;
  days_of_cover: number;
  free_qty: number;
  scheme_text: string | null;
  short: boolean;
}

interface Evaluation {
  lines: DraftLine[];
  estimate: ReturnType<typeof computeTotals>;
  credit: CreditView;
  reasons: Reason[];
}

function mergeItems(input: ItemInput[]): ItemInput[] {
  if (input.length === 0) throw validation("An order needs at least one item");
  const m = new Map<number, number>();
  for (const it of input) {
    if (!Number.isInteger(it.qty_cases) || it.qty_cases <= 0 || it.qty_cases > 9999) {
      throw validation(`qty_cases must be a whole number 1–9999 (got ${it.qty_cases})`);
    }
    m.set(it.product_id, (m.get(it.product_id) ?? 0) + it.qty_cases);
  }
  return [...m].map(([product_id, qty_cases]) => ({ product_id, qty_cases }));
}

function evaluate(db: DB, r: RetailerRow, input: ItemInput[], excludeOrderId?: number): Evaluation {
  const lines: DraftLine[] = input.map((it) => {
    const p = mustProduct(db, it.product_id);
    const avail = available(p);
    return {
      product_id: p.id,
      sku: p.sku,
      name: p.name,
      qty: it.qty_cases,
      unit_price: p.case_price,
      gst_pct: p.gst_pct,
      available: avail,
      days_of_cover: daysOfCover(p),
      free_qty: freeQty(p, it.qty_cases),
      scheme_text: schemeText(p),
      short: needed(p, it.qty_cases) > avail,
    };
  });
  const estimate = computeTotals(
    lines.map((l) => ({ qty: l.qty, unitPrice: l.unit_price, gstPct: l.gst_pct })),
  );
  const credit = creditView(db, r, estimate.total, excludeOrderId);
  const reasons: Reason[] = [];
  if (credit.over_credit) {
    reasons.push({
      type: "OVER_CREDIT",
      exposure: credit.exposure,
      limit: credit.credit_limit,
      headroom_after: credit.headroom_after,
    });
  }
  if (credit.overdue) {
    reasons.push({
      type: "OVERDUE",
      oldest_due_days: credit.oldest_due_days,
      credit_days: credit.credit_days,
    });
  }
  for (const l of lines) {
    if (l.short) {
      reasons.push({
        type: "SHORT_STOCK",
        product_id: l.product_id,
        name: l.name,
        requested: l.qty,
        available: l.available,
        days_of_cover: l.days_of_cover,
      });
    }
  }
  return { lines, estimate, credit, reasons };
}

export interface ApprovalCard {
  outstanding: number;
  credit_limit: number;
  exposure: number;
  headroom_after: number;
  oldest_due_days: number;
  credit_days: number;
  last_payment: ReturnType<typeof lastPayment>;
  avg_monthly_purchase: number;
  reasons: Reason[];
  text: string;
}

function approvalCard(db: DB, r: RetailerRow, ev: Evaluation): ApprovalCard {
  const lp = lastPayment(db, r.id);
  const avg = avgMonthlyPurchase(db, r.id);
  const c = ev.credit;
  const text = [
    `Outstanding ${rupees(c.outstanding)} · limit ${rupees(c.credit_limit)} · is order ke baad ${rupees(c.exposure)} (${c.headroom_after >= 0 ? `${rupees(c.headroom_after)} bacha` : `${rupees(-c.headroom_after)} upar`})`,
    `Oldest bill ${c.oldest_due_days} d (credit ${c.credit_days} d) · last paid ${lp ? `${rupees(lp.amount)} ${lp.mode} (${lp.days_ago} d ago)` : "—"} · avg ${rupees(avg)}/month`,
  ].join("\n");
  return {
    outstanding: c.outstanding,
    credit_limit: c.credit_limit,
    exposure: c.exposure,
    headroom_after: c.headroom_after,
    oldest_due_days: c.oldest_due_days,
    credit_days: c.credit_days,
    last_payment: lp,
    avg_monthly_purchase: avg,
    reasons: ev.reasons,
    text,
  };
}

function reasonText(reasons: Reason[]): string[] {
  return reasons.map((x) => {
    switch (x.type) {
      case "OVER_CREDIT":
        return `⚠️ Credit: ${rupees(x.exposure)} exposure vs ${rupees(x.limit)} limit`;
      case "OVERDUE":
        return `⚠️ Overdue: oldest bill ${x.oldest_due_days} d (credit ${x.credit_days} d)`;
      default:
        return `⚠️ Stock: ${x.name} — ${x.requested} maange, sirf ${x.available} hai`;
    }
  });
}

// ───────────────────────────── drafts ─────────────────────────────

export interface DraftResult {
  order_id: number;
  status: OrderStatus;
  party: { id: number; code: string; name: string; area: string };
  lines: DraftLine[];
  estimate_total: number;
  estimate_total_text: string;
  approval_reasons: Reason[];
  approval_card: ApprovalCard | null;
  approver_handles: string[];
  creator_handle: string;
  reply_text: string;
}

function draftResult(
  db: DB,
  orderId: number,
  status: OrderStatus,
  r: RetailerRow,
  ev: Evaluation,
  creator: string,
): DraftResult {
  const needs = status === "needs_approval";
  const card = needs ? approvalCard(db, r, ev) : null;
  const approvers = needs ? handlesWithRole(db, "manager") : [];
  const lineText = ev.lines.map((l) => {
    const scheme = l.free_qty > 0 ? ` (${l.scheme_text} → +${l.free_qty} free)` : "";
    return l.short
      ? `• ${l.name} — ${l.qty} cs ⚠️ sirf ${l.available} in stock (${l.days_of_cover} din ka cover)`
      : `• ${l.name} — ${l.qty} cs ✅${scheme}`;
  });
  const tail = needs
    ? [
        ...reasonText(ev.reasons).filter((t) => !t.startsWith("⚠️ Stock")),
        card?.text ?? "",
        `Approval chahiye: ${approvers.join(", ")}`,
      ]
    : [`Sab theek ✅  Confirm: @desk confirm ${orderId}`];
  return {
    order_id: orderId,
    status,
    party: { id: r.id, code: r.code, name: r.name, area: r.area },
    lines: ev.lines,
    estimate_total: ev.estimate.total,
    estimate_total_text: rupees(ev.estimate.total),
    approval_reasons: ev.reasons,
    approval_card: card,
    approver_handles: approvers,
    creator_handle: creator,
    reply_text: [
      `Draft #${orderId} — ${r.name}, ${r.area}`,
      ...lineText,
      `Estimate ${rupees(ev.estimate.total)} incl. GST`,
      ...tail.filter(Boolean),
    ].join("\n"),
  };
}

function writeItems(db: DB, orderId: number, lines: DraftLine[]): void {
  db.prepare("DELETE FROM order_items WHERE order_id = ?").run(orderId);
  const ins = db.prepare(
    "INSERT INTO order_items (order_id, product_id, qty_requested, unit_price) VALUES (?, ?, ?, ?)",
  );
  for (const l of lines) ins.run(orderId, l.product_id, l.qty, l.unit_price);
}

function nextCounter(db: DB, name: string): number {
  const row = db
    .prepare("UPDATE counters SET value = value + 1 WHERE name = ? RETURNING value")
    .get(name) as { value: number } | undefined;
  if (!row) throw new Error(`counter ${name} missing`);
  return row.value;
}

export function createDraft(
  ctx: WriteCtx,
  a: { retailer_id: number; items: ItemInput[]; note?: string | null },
): WriteResult<DraftResult> {
  const { db, actor, stamp } = ctx;
  const r = mustRetailer(db, a.retailer_id);
  const ev = evaluate(db, r, mergeItems(a.items));
  const status: OrderStatus = ev.reasons.length ? "needs_approval" : "awaiting_confirmation";
  const id = nextCounter(db, "order");
  const ts = sqlTimestamp(now());
  db.prepare(
    `INSERT INTO orders (id, retailer_id, status, approval_reasons, created_by, decision_note, subtotal, tax, total, room_id, source_message_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    r.id,
    status,
    JSON.stringify(ev.reasons),
    actor.id,
    a.note ?? null,
    ev.estimate.subtotal,
    ev.estimate.tax,
    ev.estimate.total,
    stamp.room_id,
    stamp.message_id,
    ts,
    ts,
  );
  writeItems(db, id, ev.lines);
  return { data: draftResult(db, id, status, r, ev, actor.handle), entityId: id };
}

function assertCreatorOrManager(db: DB, actor: Actor, o: OrderRow, action: string): void {
  if (actor.role === "manager") return;
  if (o.created_by !== actor.id) {
    const creator = handleOf(db, o.created_by) ?? "creator";
    throw new DomainError(
      "PREVENT_NON_CREATOR",
      `#${o.id} was created by ${creator}; ${actor.handle} cannot ${action} it`,
      `Yeh draft ${creator} ka hai; wahi ya manager ${action === "confirm" ? "confirm" : "change"} karega.`,
      { creator_handle: creator },
    );
  }
}

function invalidTransition(o: OrderRow, to: string): DomainError {
  return new DomainError(
    "INVALID_TRANSITION",
    `#${o.id} is ${o.status}; cannot move to ${to}`,
    `Order #${o.id} abhi "${o.status}" hai, isliye yeh nahi ho sakta.`,
    { current_status: o.status },
  );
}

export function reviseDraft(
  ctx: WriteCtx,
  a: { order_id: number; items: ItemInput[] },
): WriteResult<DraftResult> {
  const { db, actor } = ctx;
  const o = getOrderRow(db, a.order_id);
  assertCreatorOrManager(db, actor, o, "revise");
  if (!DRAFT.includes(o.status)) throw invalidTransition(o, "revised draft");
  const r = mustRetailer(db, o.retailer_id);
  const ev = evaluate(db, r, mergeItems(a.items), o.id);
  const status: OrderStatus = ev.reasons.length ? "needs_approval" : "awaiting_confirmation";
  db.prepare(
    "UPDATE orders SET status = ?, approval_reasons = ?, subtotal = ?, tax = ?, total = ?, updated_at = ? WHERE id = ?",
  ).run(
    status,
    JSON.stringify(ev.reasons),
    ev.estimate.subtotal,
    ev.estimate.tax,
    ev.estimate.total,
    sqlTimestamp(now()),
    o.id,
  );
  writeItems(db, o.id, ev.lines);
  return {
    data: draftResult(db, o.id, status, r, ev, handleOf(db, o.created_by) ?? ""),
    entityId: o.id,
    before: { status: o.status },
  };
}

// ───────────────────────────── confirm / approve ─────────────────────────────

export interface BillLine {
  sku: string;
  name: string;
  cases: number;
  case_size: number;
  units: number;
  free: number;
  backordered: number;
  unit_price: number;
  gst_pct: number;
  amount: number;
}

export interface ConfirmResult {
  order_id: number;
  status: OrderStatus;
  party: { id: number; code: string; name: string; area: string };
  total: number;
  total_text: string;
  subtotal: number;
  tax: number;
  tax_by_rate: Record<string, number>;
  bill_no: string | null;
  bill_path: string | null;
  bill_lines: BillLine[];
  bill_text: string;
  pick_list_text: string;
  godown_handles: string[];
  creator_handle: string;
  approved_by: string | null;
  backorders: { name: string; qty: number }[];
  applied_changes: { product_id: number; qty_confirmed: number }[];
  credit_at_decision: CreditView | null;
  approval_card: ApprovalCard | null;
  reply_text: string;
}

/** Largest q such that q + scheme free(q) fits in `avail`. */
function maxConfirmable(p: ProductRow, avail: number): number {
  let q = Math.max(0, avail);
  while (q > 0 && needed(p, q) > avail) q--;
  return q;
}

function finalize(
  ctx: WriteCtx,
  o: OrderRow,
  r: RetailerRow,
  changes: Map<number, number>,
  approvedBy: Actor | null,
  note: string | null,
): ConfirmResult {
  const { db } = ctx;
  const rows = items(db, o.id);
  for (const pid of changes.keys()) {
    if (!rows.some((x) => x.product_id === pid))
      throw validation(`product ${pid} is not on order #${o.id}`);
  }
  const plan = rows.map((it) => {
    const p = mustProduct(db, it.product_id);
    const qty = changes.get(it.product_id) ?? it.qty_requested;
    if (!Number.isInteger(qty) || qty < 0 || qty > it.qty_requested) {
      throw validation(
        `${p.name}: qty_confirmed must be 0–${it.qty_requested}`,
        "Zyada quantity ke liye draft revise karo.",
      );
    }
    const free = freeQty(p, qty);
    const avail = available(p);
    if (qty + free > avail) {
      const max = maxConfirmable(p, avail);
      throw new DomainError(
        "INSUFFICIENT_STOCK",
        `${p.name}: need ${qty + free}, available ${avail}`,
        `${p.name} sirf ${avail} case hai. Likho: approve ${o.id}, ${p.name} ${max} (baaki backorder).`,
        { product_id: p.id, name: p.name, requested: qty, available: avail, max_confirmable: max },
      );
    }
    return { it, p, qty, free };
  });
  if (plan.every((x) => x.qty === 0))
    throw validation("Every line is 0 cases", "Order reject ya cancel karo.");

  const totals = computeTotals(
    plan.map((x) => ({ qty: x.qty, unitPrice: x.it.unit_price, gstPct: x.p.gst_pct })),
  );
  const upd = db.prepare(
    "UPDATE order_items SET qty_confirmed = ?, qty_free = ?, qty_backordered = ? WHERE order_id = ? AND product_id = ?",
  );
  const reserve = db.prepare("UPDATE stock SET reserved = reserved + ? WHERE product_id = ?");
  for (const x of plan) {
    upd.run(x.qty, x.free, x.it.qty_requested - x.qty, o.id, x.p.id);
    if (x.qty + x.free > 0) reserve.run(x.qty + x.free, x.p.id);
  }
  const billNo = `INV-${today().slice(0, 4)}-${String(nextCounter(db, "bill")).padStart(4, "0")}`;
  const credit = approvedBy ? creditView(db, r, totals.total, o.id) : null;
  db.prepare(
    `UPDATE orders SET status = 'confirmed', subtotal = ?, tax = ?, total = ?, bill_no = ?, confirmed_at = ?, updated_at = ?,
       approved_by = COALESCE(?, approved_by), decision_note = COALESCE(?, decision_note) WHERE id = ?`,
  ).run(
    totals.subtotal,
    totals.tax,
    totals.total,
    billNo,
    sqlTimestamp(now()),
    sqlTimestamp(now()),
    approvedBy?.id ?? null,
    note,
    o.id,
  );

  const billLines: BillLine[] = plan.map((x) => ({
    sku: x.p.sku,
    name: x.p.name,
    cases: x.qty,
    case_size: x.p.case_size,
    units: x.qty * x.p.case_size,
    free: x.free,
    backordered: x.it.qty_requested - x.qty,
    unit_price: x.it.unit_price,
    gst_pct: x.p.gst_pct,
    amount: x.qty * x.it.unit_price,
  }));
  const backorders = billLines
    .filter((b) => b.backordered > 0)
    .map((b) => ({ name: b.name, qty: b.backordered }));
  const party = { id: r.id, code: r.code, name: r.name, area: r.area };
  const view = {
    order_id: o.id,
    bill_no: billNo,
    party,
    billLines,
    totals,
    approvedBy: approvedBy?.handle ?? null,
  };
  const godown = handlesWithRole(db, "godown");
  const creator = handleOf(db, o.created_by) ?? "";
  return {
    order_id: o.id,
    status: "confirmed",
    party,
    total: totals.total,
    total_text: rupees(totals.total),
    subtotal: totals.subtotal,
    tax: totals.tax,
    tax_by_rate: totals.taxByRate,
    bill_no: billNo,
    bill_path: null,
    bill_lines: billLines,
    bill_text: billText(view),
    pick_list_text: pickListText(view),
    godown_handles: godown,
    creator_handle: creator,
    approved_by: approvedBy?.handle ?? null,
    backorders,
    applied_changes: [...changes].map(([product_id, qty_confirmed]) => ({
      product_id,
      qty_confirmed,
    })),
    credit_at_decision: credit,
    approval_card: null,
    reply_text: [
      `Confirmed ✅ #${o.id} — ${r.name}${approvedBy ? ` (approved by ${approvedBy.handle})` : ""}`,
      ...billLines.map(
        (b) =>
          `• ${b.name} — ${b.cases} cs${b.free ? ` + ${b.free} free` : ""}${b.backordered ? ` · ${b.backordered} cs backorder` : ""}`,
      ),
      `Total ${rupees(totals.total)} incl. GST · ${billNo}`,
      `Pick list → ${godown.join(", ") || "godown"}`,
    ].join("\n"),
  };
}

interface BillView {
  order_id: number;
  bill_no: string;
  party: { name: string; area: string; code: string };
  billLines: BillLine[];
  totals: ReturnType<typeof computeTotals>;
  approvedBy: string | null;
}

export function billText(v: BillView): string {
  const lines = v.billLines.filter((b) => b.cases > 0 || b.free > 0).slice(0, 8);
  return [
    `🧾 ${v.bill_no} · Order #${v.order_id}`,
    `${v.party.name}, ${v.party.area} (${v.party.code})`,
    ...lines.map(
      (b) =>
        `${b.name}: ${b.cases} cs × ${rupees(b.unit_price)} = ${rupees(b.amount)}${b.free ? ` (+${b.free} free)` : ""}`,
    ),
    `Subtotal ${rupees(v.totals.subtotal)} · GST ${rupees(v.totals.tax)} · Total ${rupees(v.totals.total)}`,
    ...(v.approvedBy ? [`Approved by ${v.approvedBy}`] : []),
  ].join("\n");
}

export function pickListText(
  v: Pick<BillView, "order_id" | "bill_no" | "party" | "billLines">,
): string {
  return [
    `📦 Pick list #${v.order_id} (${v.bill_no}) — ${v.party.name}, ${v.party.area}`,
    ...v.billLines
      .filter((b) => b.cases + b.free > 0)
      .map(
        (b) =>
          `☐ ${b.sku} ${b.name} — ${b.cases + b.free} cs (${(b.cases + b.free) * b.case_size} pcs)${b.free ? ` incl. ${b.free} free` : ""}`,
      ),
    `Packed ho jaye to likho: @desk ${v.order_id} packed`,
  ].join("\n");
}

export function confirmOrder(
  ctx: WriteCtx,
  a: { order_id: number },
): WriteResult<ConfirmResult | DraftResult> {
  const { db, actor } = ctx;
  const o = getOrderRow(db, a.order_id);
  assertCreatorOrManager(db, actor, o, "confirm");
  if (o.status === "needs_approval") {
    throw new DomainError(
      "INVALID_TRANSITION",
      `#${o.id} needs manager approval`,
      `#${o.id} ko manager approval chahiye: ${handlesWithRole(db, "manager").join(", ")}.`,
      { current_status: o.status, tag_handles: handlesWithRole(db, "manager") },
    );
  }
  if (o.status !== "awaiting_confirmation") throw invalidTransition(o, "confirmed");
  const r = mustRetailer(db, o.retailer_id);
  const rows = items(db, o.id);
  const ev = evaluate(
    db,
    r,
    rows.map((x) => ({ product_id: x.product_id, qty_cases: x.qty_requested })),
    o.id,
  );
  if (ev.reasons.length) {
    // Something changed since the draft (stock moved, a payment bounced): route to approval instead.
    db.prepare(
      "UPDATE orders SET status = 'needs_approval', approval_reasons = ?, updated_at = ? WHERE id = ?",
    ).run(JSON.stringify(ev.reasons), sqlTimestamp(now()), o.id);
    return {
      data: draftResult(db, o.id, "needs_approval", r, ev, handleOf(db, o.created_by) ?? ""),
      entityId: o.id,
      before: { status: o.status },
    };
  }
  return {
    data: finalize(ctx, o, r, new Map(), null, null),
    entityId: o.id,
    before: { status: o.status },
  };
}

export function approveOrder(
  ctx: WriteCtx,
  a: {
    order_id: number;
    changes?: { product_id: number; qty_confirmed: number }[];
    note?: string | null;
  },
): WriteResult<ConfirmResult> {
  const { db, actor } = ctx;
  const o = getOrderRow(db, a.order_id);
  if (o.status !== "needs_approval") throw invalidTransition(o, "approved");
  const r = mustRetailer(db, o.retailer_id);
  const changes = new Map((a.changes ?? []).map((c) => [c.product_id, c.qty_confirmed]));
  return {
    data: finalize(ctx, o, r, changes, actor, a.note ?? null),
    entityId: o.id,
    before: { status: o.status },
  };
}

// ───────────────────────────── reject / cancel / status ─────────────────────────────

export interface SimpleResult {
  order_id: number;
  status: OrderStatus;
  creator_handle: string;
  reply_text: string;
  [k: string]: unknown;
}

export function rejectOrder(
  ctx: WriteCtx,
  a: { order_id: number; reason: string },
): WriteResult<SimpleResult> {
  const { db } = ctx;
  const o = getOrderRow(db, a.order_id);
  if (o.status !== "needs_approval") throw invalidTransition(o, "rejected");
  db.prepare(
    "UPDATE orders SET status = 'rejected', approved_by = ?, decision_note = ?, updated_at = ? WHERE id = ?",
  ).run(ctx.actor.id, a.reason, sqlTimestamp(now()), o.id);
  const creator = handleOf(db, o.created_by) ?? "";
  return {
    data: {
      order_id: o.id,
      status: "rejected",
      creator_handle: creator,
      reason: a.reason,
      reply_text: `❌ #${o.id} reject — ${ctx.actor.handle}: "${a.reason}"`,
    },
    entityId: o.id,
    before: { status: o.status },
  };
}

export function cancelOrder(
  ctx: WriteCtx,
  a: { order_id: number; reason?: string | null },
): WriteResult<SimpleResult> {
  const { db, actor } = ctx;
  const o = getOrderRow(db, a.order_id);
  if (DRAFT.includes(o.status)) {
    assertCreatorOrManager(db, actor, o, "cancel");
  } else if (o.status === "confirmed") {
    if (actor.role !== "manager")
      throw forbidden(db, actor, "cancel a confirmed order", ["manager"]);
    const release = db.prepare("UPDATE stock SET reserved = reserved - ? WHERE product_id = ?");
    for (const it of items(db, o.id)) {
      const q = (it.qty_confirmed ?? 0) + it.qty_free;
      if (q > 0) release.run(q, it.product_id);
    }
  } else {
    throw invalidTransition(o, "cancelled");
  }
  db.prepare(
    "UPDATE orders SET status = 'cancelled', decision_note = COALESCE(?, decision_note), updated_at = ? WHERE id = ?",
  ).run(a.reason ?? null, sqlTimestamp(now()), o.id);
  return {
    data: {
      order_id: o.id,
      status: "cancelled",
      creator_handle: handleOf(db, o.created_by) ?? "",
      voided_bill: o.bill_no,
      reply_text: `🚫 #${o.id} cancelled${o.bill_no ? ` · ${o.bill_no} void` : ""}${a.reason ? ` — "${a.reason}"` : ""}`,
    },
    entityId: o.id,
    before: { status: o.status },
  };
}

const NEXT: Record<string, OrderStatus[]> = {
  confirmed: ["packed"],
  packed: ["dispatched"],
  dispatched: ["delivered", "returned"],
};

export function updateStatus(
  ctx: WriteCtx,
  a: {
    order_id: number;
    status: "packed" | "dispatched" | "delivered" | "returned";
    return_reason?: "damage" | "expiry" | "wrong_sku" | "refused" | null;
  },
): WriteResult<SimpleResult> {
  const { db, actor } = ctx;
  const o = getOrderRow(db, a.order_id);
  const roles = STATUS_ROLES[a.status];
  if (!roles.includes(actor.role)) throw forbidden(db, actor, `mark orders ${a.status}`, roles);
  if (!(NEXT[o.status] ?? []).includes(a.status)) throw invalidTransition(o, a.status);
  const ts = sqlTimestamp(now());
  const its = items(db, o.id);
  const extra: Record<string, unknown> = {};
  let line = "";
  if (a.status === "dispatched") {
    const out = db.prepare(
      "UPDATE stock SET on_hand = on_hand - ?, reserved = reserved - ? WHERE product_id = ?",
    );
    for (const it of its) {
      const q = (it.qty_confirmed ?? 0) + it.qty_free;
      if (q > 0) out.run(q, q, it.product_id);
    }
    extra.stock_effect = "stock left the godown";
    line = " · stock updated";
  } else if (a.status === "delivered") {
    const r = mustRetailer(db, o.retailer_id);
    const due = addDays(today(), r.credit_days);
    db.prepare("UPDATE retailers SET outstanding = outstanding + ? WHERE id = ?").run(
      o.total,
      r.id,
    );
    db.prepare("UPDATE orders SET delivered_at = ?, due_date = ? WHERE id = ?").run(
      today(),
      due,
      o.id,
    );
    extra.outstanding_effect = o.total;
    extra.new_outstanding = r.outstanding + o.total;
    extra.due_date = due;
    line = ` · udhaar +${rupees(o.total)} (due ${due})`;
  } else if (a.status === "returned") {
    if (!a.return_reason) {
      throw validation(
        "return_reason is required",
        "Return ka reason batao: damage, expiry, wrong_sku ya refused.",
      );
    }
    // Damaged or expired cases must not go back on sale; only refused / wrong-SKU goods are sellable.
    const sellable = a.return_reason === "refused" || a.return_reason === "wrong_sku";
    if (sellable) {
      const back = db.prepare("UPDATE stock SET on_hand = on_hand + ? WHERE product_id = ?");
      for (const it of its) {
        const q = (it.qty_confirmed ?? 0) + it.qty_free;
        if (q > 0) back.run(q, it.product_id);
      }
    }
    db.prepare("UPDATE orders SET return_reason = ? WHERE id = ?").run(a.return_reason, o.id);
    extra.stock_effect = sellable ? "stock back in godown" : "written off, not restocked";
    line = sellable
      ? ` · ${a.return_reason}, stock wapas`
      : ` · ${a.return_reason}, stock write-off`;
  }
  db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(a.status, ts, o.id);
  const r = getRetailer(db, o.retailer_id);
  return {
    data: {
      order_id: o.id,
      status: a.status,
      creator_handle: handleOf(db, o.created_by) ?? "",
      ...extra,
      reply_text: `✅ #${o.id} ${a.status} — ${r?.name ?? ""}${line}`,
    },
    entityId: o.id,
    before: { status: o.status },
  };
}

// ───────────────────────────── read view ─────────────────────────────

export function orderView(db: DB, id: number) {
  const o = getOrderRow(db, id);
  const r = mustRetailer(db, o.retailer_id);
  const its = items(db, o.id);
  const lines = its.map((it) => {
    const p = getProduct(db, it.product_id) as ProductRow;
    return {
      product_id: p.id,
      sku: p.sku,
      name: p.name,
      qty_requested: it.qty_requested,
      qty_confirmed: it.qty_confirmed,
      qty_free: it.qty_free,
      qty_backordered: it.qty_backordered,
      unit_price: it.unit_price,
      available_now: available(p),
      scheme_text: schemeText(p),
    };
  });
  let card: ApprovalCard | null = null;
  if (o.status === "needs_approval") {
    const ev = evaluate(
      db,
      r,
      its.map((x) => ({ product_id: x.product_id, qty_cases: x.qty_requested })),
      o.id,
    );
    card = approvalCard(db, r, ev);
  }
  const reasons = o.approval_reasons ? (JSON.parse(o.approval_reasons) as Reason[]) : [];
  return {
    order_id: o.id,
    status: o.status,
    party: { id: r.id, code: r.code, name: r.name, area: r.area },
    created_by: handleOf(db, o.created_by),
    approved_by: handleOf(db, o.approved_by),
    decision_note: o.decision_note,
    lines,
    subtotal: o.subtotal,
    tax: o.tax,
    total: o.total,
    total_text: rupees(o.total),
    approval_reasons: reasons,
    approval_card: card,
    bill_no: o.bill_no,
    bill_path: o.bill_path,
    due_date: o.due_date,
    return_reason: o.return_reason,
    created_at: o.created_at,
    reply_text: [
      `#${o.id} · ${r.name} · ${o.status} · ${rupees(o.total)}${o.bill_no ? ` · ${o.bill_no}` : ""}`,
      ...lines.map(
        (l) =>
          `• ${l.name} — ${l.qty_confirmed ?? l.qty_requested} cs${l.qty_free ? ` + ${l.qty_free} free` : ""}${l.qty_backordered ? ` · ${l.qty_backordered} backorder` : ""}`,
      ),
      ...(o.status === "needs_approval" ? reasonText(reasons) : []),
      ...(card ? [card.text] : []),
    ].join("\n"),
  };
}
