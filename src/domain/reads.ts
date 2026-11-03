// Read-only queries behind the 7 read tools (LLD §10).
import type { DB } from "../db/client.js";
import { requireRole } from "./audit.js";
import { READ_ROLES } from "./authz.js";
import { addDays, daysBetween, today } from "./clock.js";
import {
  avgMonthlyPurchase,
  creditView,
  getRetailer,
  lastPayment,
  oldestDueDays,
  type RetailerRow,
} from "./credit.js";
import { notFound } from "./errors.js";
import { type Candidate, rank } from "./matching.js";
import { rupees } from "./money.js";
import { available, daysOfCover, type ProductRow, schemeText } from "./stock.js";

export function findRetailer(db: DB, query: string) {
  const rows = db.prepare("SELECT * FROM retailers WHERE active = 1").all() as RetailerRow[];
  const aliases = db.prepare("SELECT retailer_id, alias FROM retailer_aliases").all() as {
    retailer_id: number;
    alias: string;
  }[];
  const cands: Candidate<RetailerRow>[] = rows.map((r) => ({
    item: r,
    fields: [
      r.name,
      `${r.name} ${r.area}`,
      r.code,
      ...aliases.filter((a) => a.retailer_id === r.id).map((a) => a.alias),
    ],
  }));
  const res = rank(query, cands);
  return {
    status: res.status,
    matches: res.matches.map((m) => ({
      id: m.item.id,
      code: m.item.code,
      name: m.item.name,
      area: m.item.area,
      outstanding: m.item.outstanding,
      credit_limit: m.item.credit_limit,
      oldest_due_days: oldestDueDays(db, m.item),
      score: m.score,
      confidence: m.confidence,
    })),
    hint:
      res.status === "unique"
        ? "Use the first match."
        : res.status === "ambiguous"
          ? "Ask the sender one question listing these options (name + area)."
          : "No party matched. Ask the sender for the shop name and area.",
  };
}

export function findProduct(db: DB, query: string) {
  const rows = db
    .prepare(
      "SELECT p.*, s.on_hand, s.reserved, s.avg_daily_cases FROM products p JOIN stock s ON s.product_id = p.id WHERE p.active = 1",
    )
    .all() as ProductRow[];
  const aliases = db.prepare("SELECT product_id, alias FROM product_aliases").all() as {
    product_id: number;
    alias: string;
  }[];
  const cands: Candidate<ProductRow>[] = rows.map((p) => ({
    item: p,
    fields: [p.name, p.sku, ...aliases.filter((a) => a.product_id === p.id).map((a) => a.alias)],
  }));
  const res = rank(query, cands);
  return {
    status: res.status,
    matches: res.matches.map((m) => ({
      id: m.item.id,
      sku: m.item.sku,
      name: m.item.name,
      case_size: m.item.case_size,
      case_price: m.item.case_price,
      case_price_text: rupees(m.item.case_price),
      available: available(m.item),
      days_of_cover: daysOfCover(m.item),
      scheme_text: schemeText(m.item),
      score: m.score,
      confidence: m.confidence,
    })),
    hint:
      res.status === "unique"
        ? "Use the first match."
        : res.status === "ambiguous"
          ? "Ask which one (≤3 options), or pick the first if the sender's words match its alias exactly."
          : "No product matched. Ask the sender to name it differently.",
  };
}

function mustRetailer(db: DB, id: number): RetailerRow {
  const r = getRetailer(db, id);
  if (!r) throw notFound("party", id);
  return r;
}

export function retailerDues(db: DB, retailerId: number) {
  const r = mustRetailer(db, retailerId);
  const c = creditView(db, r, 0);
  const lp = lastPayment(db, r.id);
  return {
    party: { id: r.id, code: r.code, name: r.name, area: r.area },
    credit_limit: r.credit_limit,
    credit_days: r.credit_days,
    outstanding: r.outstanding,
    open_total: c.open_total,
    exposure: c.exposure,
    headroom: c.headroom_after,
    oldest_due_days: c.oldest_due_days,
    overdue: c.overdue,
    last_payment: lp,
    reply_text: `${r.name}: outstanding ${rupees(r.outstanding)} · open bills ${rupees(c.open_total)} · limit ${rupees(r.credit_limit)} · headroom ${rupees(c.headroom_after)} · oldest bill ${c.oldest_due_days} d${c.overdue ? " ⚠️ overdue" : ""} · last paid ${lp ? `${rupees(lp.amount)} ${lp.mode}, ${lp.days_ago} d ago` : "—"}`,
  };
}

export function usualOrder(db: DB, retailerId: number) {
  const r = mustRetailer(db, retailerId);
  const last = db
    .prepare(
      "SELECT id, created_at FROM orders WHERE retailer_id = ? AND bill_no IS NOT NULL AND status NOT IN ('cancelled','returned') ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .get(r.id) as { id: number; created_at: string } | undefined;
  if (!last) {
    return {
      party: { id: r.id, name: r.name },
      lines: [],
      last_order_id: null,
      last_order_days_ago: null,
      avg_monthly_purchase: 0,
      reply_text: `${r.name} ka koi pichla order nahi mila.`,
    };
  }
  const lines = db
    .prepare(
      "SELECT i.product_id, p.name, COALESCE(i.qty_confirmed, i.qty_requested) AS qty FROM order_items i JOIN products p ON p.id = i.product_id WHERE i.order_id = ? AND COALESCE(i.qty_confirmed, i.qty_requested) > 0",
    )
    .all(last.id) as { product_id: number; name: string; qty: number }[];
  const ago = daysBetween(last.created_at.slice(0, 10), today());
  return {
    party: { id: r.id, name: r.name },
    last_order_id: last.id,
    last_order_days_ago: ago,
    lines,
    avg_monthly_purchase: avgMonthlyPurchase(db, r.id),
    reply_text: `${r.name} ka usual (#${last.id}, ${ago} d pehle): ${lines.map((l) => `${l.name} ${l.qty} cs`).join(", ")}`,
  };
}

const OPEN = ["awaiting_confirmation", "needs_approval", "confirmed", "packed", "dispatched"];

export function listOpenOrders(
  db: DB,
  a: {
    status?: string[];
    retailer_id?: number;
    room_id?: string;
    response_format?: "concise" | "detailed";
  },
) {
  const statuses = a.status?.length ? a.status : OPEN;
  const params: unknown[] = [...statuses];
  let sql = `SELECT o.id, o.status, o.total, o.created_at, r.name AS party, u.handle AS created_by
    FROM orders o JOIN retailers r ON r.id = o.retailer_id JOIN users u ON u.id = o.created_by
    WHERE o.status IN (${statuses.map(() => "?").join(",")})`;
  if (a.retailer_id) {
    sql += " AND o.retailer_id = ?";
    params.push(a.retailer_id);
  }
  if (a.room_id) {
    sql += " AND o.room_id = ?";
    params.push(a.room_id);
  }
  sql += " ORDER BY CASE o.status WHEN 'needs_approval' THEN 0 ELSE 1 END, o.id DESC LIMIT 25";
  const rows = db.prepare(sql).all(...params) as {
    id: number;
    status: string;
    total: number;
    created_at: string;
    party: string;
    created_by: string;
  }[];
  const orders = rows.map((o) => ({
    ...o,
    total_text: rupees(o.total),
    age_days: daysBetween(o.created_at.slice(0, 10), today()),
  }));
  const pending = orders.filter((o) => o.status === "needs_approval").length;
  const fmt = a.response_format ?? "concise";
  return {
    orders:
      fmt === "concise"
        ? orders.map(({ id, party, status, total_text, created_by }) => ({
            id,
            party,
            status,
            total_text,
            created_by,
          }))
        : orders,
    pending_approval_count: pending,
    reply_text: orders.length
      ? [
          `Open orders: ${orders.length} (approval pending: ${pending})`,
          ...orders
            .slice(0, 10)
            .map((o) => `#${o.id} ${o.party} · ${o.status} · ${o.total_text} · ${o.created_by}`),
        ].join("\n")
      : "Koi open order nahi hai.",
  };
}

export function dailySummary(
  db: DB,
  a: {
    actor_handle: string;
    stamp_sig?: string;
    date?: string;
    response_format?: "concise" | "detailed";
  },
) {
  requireRole(db, a, READ_ROLES.daily_summary, "see the daily summary");
  const day = a.date ?? today();
  const billed = db
    .prepare(
      "SELECT id, retailer_id, total FROM orders WHERE bill_no IS NOT NULL AND status != 'cancelled' AND substr(confirmed_at, 1, 10) = ?",
    )
    .all(day) as { id: number; retailer_id: number; total: number }[];
  const ids = billed.map((b) => b.id);
  const itemAgg = ids.length
    ? (db
        .prepare(
          `SELECT COUNT(*) AS lines, COALESCE(SUM(qty_requested),0) AS req, COALESCE(SUM(qty_confirmed),0) AS conf FROM order_items WHERE order_id IN (${ids.map(() => "?").join(",")})`,
        )
        .get(...ids) as { lines: number; req: number; conf: number })
    : { lines: 0, req: 0, conf: 0 };
  const calls = (
    db
      .prepare(
        "SELECT COUNT(DISTINCT retailer_id) AS n FROM orders WHERE substr(created_at, 1, 10) = ? AND status != 'cancelled'",
      )
      .get(day) as { n: number }
  ).n;
  const pays = db
    .prepare(
      "SELECT mode, SUM(amount) AS s FROM payments WHERE substr(created_at, 1, 10) = ? GROUP BY mode",
    )
    .all(day) as {
    mode: string;
    s: number;
  }[];
  const collection = pays.reduce((s, p) => s + p.s, 0);
  const orderValue = billed.reduce((s, b) => s + b.total, 0);
  const pending = db
    .prepare(
      "SELECT o.id, r.name AS party, o.total FROM orders o JOIN retailers r ON r.id = o.retailer_id WHERE o.status = 'needs_approval' ORDER BY o.id",
    )
    .all() as { id: number; party: string; total: number }[];
  const retailers = db.prepare("SELECT * FROM retailers WHERE active = 1").all() as RetailerRow[];
  const overdue: { name: string; outstanding: number; oldest_due_days: number }[] = [];
  const overLimit: { name: string; exposure: number; limit: number }[] = [];
  for (const r of retailers) {
    const c = creditView(db, r, 0);
    if (c.overdue)
      overdue.push({
        name: r.name,
        outstanding: r.outstanding,
        oldest_due_days: c.oldest_due_days,
      });
    if (c.exposure > r.credit_limit)
      overLimit.push({ name: r.name, exposure: c.exposure, limit: r.credit_limit });
  }
  const low = (
    db
      .prepare(
        "SELECT p.*, s.on_hand, s.reserved, s.avg_daily_cases FROM products p JOIN stock s ON s.product_id = p.id WHERE p.active = 1",
      )
      .all() as ProductRow[]
  )
    .filter((p) => available(p) < 5 || daysOfCover(p) < 3)
    .map((p) => ({ name: p.name, available: available(p), days_of_cover: daysOfCover(p) }));
  const fill = itemAgg.req ? Math.round((itemAgg.conf / itemAgg.req) * 1000) / 10 : null;
  const lpb = billed.length ? Math.round((itemAgg.lines / billed.length) * 10) / 10 : 0;
  return {
    date: day,
    bills_cut: billed.length,
    productive_calls: calls,
    lines_per_bill: lpb,
    order_value: orderValue,
    fill_rate_pct: fill,
    collection_total: collection,
    collection_by_mode: Object.fromEntries(pays.map((p) => [p.mode, p.s])),
    pending_approval: pending,
    overdue_parties: overdue,
    low_stock: low,
    over_limit_parties: overLimit,
    reply_text: [
      `📊 DSR ${day}`,
      `Bills ${billed.length} · value ${rupees(orderValue)} · productive calls ${calls} · lines/bill ${lpb} · fill rate ${fill ?? "—"}%`,
      `Collection ${rupees(collection)}${pays.length ? ` (${pays.map((p) => `${p.mode} ${rupees(p.s)}`).join(", ")})` : ""}`,
      `Approval pending: ${pending.length ? pending.map((p) => `#${p.id} ${p.party}`).join(", ") : "none"}`,
      `Overdue: ${overdue.length ? overdue.map((o) => `${o.name} ${o.oldest_due_days} d`).join(", ") : "none"}`,
      `Low stock: ${low.length ? low.map((l) => `${l.name} (${l.available})`).join(", ") : "none"}`,
    ].join("\n"),
  };
}

/** Used by tests and the DSR "yesterday" phrasing. */
export const yesterday = () => addDays(today(), -1);
