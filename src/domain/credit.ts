// LLD §5.1. Credit exposure, oldest unpaid bill, and the approval card a manager actually weighs.
import type { DB } from "../db/client.js";
import { addDays, daysBetween, today } from "./clock.js";

export interface RetailerRow {
  id: number;
  code: string;
  name: string;
  area: string;
  credit_limit: number;
  credit_days: number;
  outstanding: number;
  active: number;
}

export const OPEN_STATUSES = ["confirmed", "packed", "dispatched"] as const;

export function getRetailer(db: DB, id: number): RetailerRow | undefined {
  return db.prepare("SELECT * FROM retailers WHERE id = ?").get(id) as RetailerRow | undefined;
}

/** Σ totals of confirmed/packed/dispatched orders (billed, not yet in outstanding). */
export function openTotal(db: DB, retailerId: number, excludeOrderId?: number): number {
  return (
    db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS s FROM orders
         WHERE retailer_id = ? AND status IN ('confirmed','packed','dispatched') AND id != ?`,
      )
      .get(retailerId, excludeOrderId ?? -1) as { s: number }
  ).s;
}

/**
 * Payments clear the oldest bills first, so the outstanding amount is made of the newest delivered bills.
 * Walk delivered bills newest-first until they cover the outstanding; the last one is the oldest unpaid.
 */
export function oldestDueDays(db: DB, r: Pick<RetailerRow, "id" | "outstanding">): number {
  if (r.outstanding <= 0) return 0;
  const bills = db
    .prepare(
      "SELECT total, delivered_at FROM orders WHERE retailer_id = ? AND status = 'delivered' AND delivered_at IS NOT NULL ORDER BY delivered_at DESC, id DESC",
    )
    .all(r.id) as { total: number; delivered_at: string }[];
  if (bills.length === 0) return 0;
  let acc = 0;
  let oldest = bills[0]?.delivered_at as string;
  for (const b of bills) {
    acc += b.total;
    oldest = b.delivered_at;
    if (acc >= r.outstanding) break;
  }
  return Math.max(0, daysBetween(oldest, today()));
}

export interface LastPayment {
  amount: number;
  mode: string;
  days_ago: number;
}

export function lastPayment(db: DB, retailerId: number): LastPayment | null {
  const p = db
    .prepare(
      "SELECT amount, mode, created_at FROM payments WHERE retailer_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .get(retailerId) as { amount: number; mode: string; created_at: string } | undefined;
  if (!p) return null;
  return {
    amount: p.amount,
    mode: p.mode,
    days_ago: Math.max(0, daysBetween(p.created_at.slice(0, 10), today())),
  };
}

/** Last 90 days of billed purchases / 3. */
export function avgMonthlyPurchase(db: DB, retailerId: number): number {
  const since = addDays(today(), -90);
  const s = (
    db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS s FROM orders
         WHERE retailer_id = ? AND bill_no IS NOT NULL AND status != 'cancelled' AND substr(created_at, 1, 10) >= ?`,
      )
      .get(retailerId, since) as { s: number }
  ).s;
  return Math.round(s / 3);
}

export interface CreditView {
  credit_limit: number;
  credit_days: number;
  outstanding: number;
  open_total: number;
  exposure: number; // outstanding + open + this order
  headroom_after: number; // limit − exposure
  oldest_due_days: number;
  over_credit: boolean;
  overdue: boolean;
}

export function creditView(
  db: DB,
  r: RetailerRow,
  thisOrderTotal: number,
  excludeOrderId?: number,
): CreditView {
  const open = openTotal(db, r.id, excludeOrderId);
  const exposure = r.outstanding + open + thisOrderTotal;
  const due = oldestDueDays(db, r);
  return {
    credit_limit: r.credit_limit,
    credit_days: r.credit_days,
    outstanding: r.outstanding,
    open_total: open,
    exposure,
    headroom_after: r.credit_limit - exposure,
    oldest_due_days: due,
    over_credit: exposure > r.credit_limit,
    overdue: due > r.credit_days,
  };
}
