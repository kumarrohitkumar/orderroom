// LLD §5.6: collections. Outstanding may go negative (advance).
import type { WriteCtx, WriteResult } from "./audit.js";
import { now, sqlTimestamp } from "./clock.js";
import { getRetailer, oldestDueDays } from "./credit.js";
import { notFound, validation } from "./errors.js";
import { rupees } from "./money.js";

export interface PaymentResult {
  payment_id: number;
  party: { id: number; name: string; area: string };
  amount: number;
  mode: string;
  new_outstanding: number;
  oldest_due_days: number;
  reply_text: string;
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
  const info = db
    .prepare(
      "INSERT INTO payments (retailer_id, amount, mode, reference, recorded_by, source_message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      r.id,
      a.amount_paise,
      a.mode,
      a.reference ?? null,
      actor.id,
      stamp.message_id,
      sqlTimestamp(now()),
    );
  db.prepare("UPDATE retailers SET outstanding = outstanding - ? WHERE id = ?").run(
    a.amount_paise,
    r.id,
  );
  const newOut = r.outstanding - a.amount_paise;
  const due = oldestDueDays(db, { id: r.id, outstanding: newOut });
  return {
    data: {
      payment_id: Number(info.lastInsertRowid),
      party: { id: r.id, name: r.name, area: r.area },
      amount: a.amount_paise,
      mode: a.mode,
      new_outstanding: newOut,
      oldest_due_days: due,
      reply_text: `💰 Payment ${rupees(a.amount_paise)} ${a.mode} · ${r.name} · outstanding ${rupees(newOut)}${newOut > 0 ? ` · oldest bill ${due} d` : ""}`,
    },
    entityId: r.id,
    before: { outstanding: r.outstanding },
  };
}
