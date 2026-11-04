// LLD §5.6: collections. Outstanding may go negative (advance).
// Cash a salesman or delivery boy says he collected is only a claim until a manager verifies it,
// so it never frees credit on its own (otherwise "₹10 lakh mila" would unblock any order).

import type { DB } from "../db/client.js";
import type { WriteCtx, WriteResult } from "./audit.js";
import { now, sqlTimestamp } from "./clock.js";
import { getRetailer, oldestDueDays } from "./credit.js";
import { DomainError, notFound, validation } from "./errors.js";
import { rupees } from "./money.js";

export interface PaymentResult {
  payment_id: number;
  party: { id: number; name: string; area: string };
  amount: number;
  mode: string;
  status: "pending" | "verified" | "rejected";
  new_outstanding: number;
  oldest_due_days: number;
  open_orders: { id: number; status: string; total: number }[];
  reply_text: string;
}

function openOrders(db: DB, retailerId: number) {
  // Live state so the agent never repeats a stale status from memory (other rooms move orders).
  return db
    .prepare(
      "SELECT id, status, total FROM orders WHERE retailer_id = ? AND status IN ('awaiting_confirmation','needs_approval','confirmed','packed','dispatched') ORDER BY id",
    )
    .all(retailerId) as { id: number; status: string; total: number }[];
}

export function recordPayment(
  ctx: WriteCtx,
  a: {
    retailer_id: number;
    amount_paise: number;
    mode: "cash" | "upi" | "cheque" | "bank";
    reference?: string | null;
  },
): WriteResult<PaymentResult> {
  const { db, actor, stamp } = ctx;
  const r = getRetailer(db, a.retailer_id);
  if (!r?.active) throw notFound("party", a.retailer_id);
  if (!Number.isInteger(a.amount_paise) || a.amount_paise <= 0 || a.amount_paise > 100_000_000) {
    throw validation("amount_paise must be a positive whole number up to ₹10,00,000");
  }
  const verified = actor.role === "manager";
  const at = sqlTimestamp(now());
  const info = db
    .prepare(
      "INSERT INTO payments (retailer_id, amount, mode, reference, recorded_by, status, verified_by, verified_at, source_message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      r.id,
      a.amount_paise,
      a.mode,
      a.reference ?? null,
      actor.id,
      verified ? "verified" : "pending",
      verified ? actor.id : null,
      verified ? at : null,
      stamp.message_id,
      at,
    );
  const pid = Number(info.lastInsertRowid);
  if (verified) {
    db.prepare("UPDATE retailers SET outstanding = outstanding - ? WHERE id = ?").run(
      a.amount_paise,
      r.id,
    );
  }
  const newOut = verified ? r.outstanding - a.amount_paise : r.outstanding;
  const due = oldestDueDays(db, { id: r.id, outstanding: newOut });
  const open = openOrders(db, r.id);
  return {
    data: {
      payment_id: pid,
      party: { id: r.id, name: r.name, area: r.area },
      amount: a.amount_paise,
      mode: a.mode,
      status: verified ? "verified" : "pending",
      new_outstanding: newOut,
      oldest_due_days: due,
      open_orders: open,
      reply_text: [
        verified
          ? `💰 Payment P${pid} ${rupees(a.amount_paise)} ${a.mode} · ${r.name} · outstanding ${rupees(newOut)}${newOut > 0 ? ` · oldest bill ${due} d` : ""}`
          : `💰 Payment P${pid} ${rupees(a.amount_paise)} ${a.mode} · ${r.name} noted · manager verify karega, tab tak outstanding ${rupees(newOut)}`,
        ...(open.length
          ? [`Open orders: ${open.map((o) => `#${o.id} ${o.status}`).join(", ")}`]
          : []),
      ].join("\n"),
    },
    entityId: r.id,
    before: { outstanding: r.outstanding },
  };
}

/** Manager confirms (cash handed over / UPI seen) or rejects a pending payment. */
export function verifyPayment(
  ctx: WriteCtx,
  a: { payment_id: number; decision: "verify" | "reject" },
): WriteResult<PaymentResult> {
  const { db, actor } = ctx;
  const p = db.prepare("SELECT * FROM payments WHERE id = ?").get(a.payment_id) as
    | { id: number; retailer_id: number; amount: number; mode: string; status: string }
    | undefined;
  if (!p) throw notFound("payment", a.payment_id);
  if (p.status !== "pending") {
    throw new DomainError(
      "INVALID_TRANSITION",
      `payment ${p.id} is already ${p.status}`,
      `Payment P${p.id} pehle hi ${p.status} hai.`,
    );
  }
  const r = getRetailer(db, p.retailer_id);
  if (!r) throw notFound("party", p.retailer_id);
  const ok = a.decision === "verify";
  db.prepare("UPDATE payments SET status = ?, verified_by = ?, verified_at = ? WHERE id = ?").run(
    ok ? "verified" : "rejected",
    actor.id,
    sqlTimestamp(now()),
    p.id,
  );
  if (ok) {
    db.prepare("UPDATE retailers SET outstanding = outstanding - ? WHERE id = ?").run(
      p.amount,
      r.id,
    );
  }
  const newOut = ok ? r.outstanding - p.amount : r.outstanding;
  const due = oldestDueDays(db, { id: r.id, outstanding: newOut });
  return {
    data: {
      payment_id: p.id,
      party: { id: r.id, name: r.name, area: r.area },
      amount: p.amount,
      mode: p.mode,
      status: ok ? "verified" : "rejected",
      new_outstanding: newOut,
      oldest_due_days: due,
      open_orders: openOrders(db, r.id),
      reply_text: ok
        ? `✅ Payment P${p.id} ${rupees(p.amount)} ${p.mode} verified · ${r.name} · outstanding ${rupees(newOut)}`
        : `❌ Payment P${p.id} ${rupees(p.amount)} ${p.mode} rejected · ${r.name} · outstanding ${rupees(newOut)}`,
    },
    entityId: p.id,
    before: { status: p.status, outstanding: r.outstanding },
  };
}
