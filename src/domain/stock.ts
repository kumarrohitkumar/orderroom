// LLD §5.2 + §5.4: availability, days of cover, and the one scheme rule.
import type { DB } from "../db/client.js";

export interface ProductRow {
  id: number;
  sku: string;
  name: string;
  case_size: number;
  case_price: number;
  gst_pct: number;
  scheme: string | null;
  active: number;
  on_hand: number;
  reserved: number;
  avg_daily_cases: number;
}

export interface Scheme {
  type: "free_qty";
  buy: number;
  free: number;
}

export function getProduct(db: DB, id: number): ProductRow | undefined {
  return db
    .prepare(
      "SELECT p.*, s.on_hand, s.reserved, s.avg_daily_cases FROM products p JOIN stock s ON s.product_id = p.id WHERE p.id = ?",
    )
    .get(id) as ProductRow | undefined;
}

export function available(p: Pick<ProductRow, "on_hand" | "reserved">): number {
  return p.on_hand - p.reserved;
}

export function daysOfCover(
  p: Pick<ProductRow, "on_hand" | "reserved" | "avg_daily_cases">,
): number {
  const d = p.avg_daily_cases > 0 ? available(p) / p.avg_daily_cases : 99;
  return Math.round(d * 10) / 10;
}

export function parseScheme(p: Pick<ProductRow, "scheme">): Scheme | null {
  if (!p.scheme) return null;
  const s = JSON.parse(p.scheme) as Scheme;
  return s.type === "free_qty" && s.buy > 0 ? s : null;
}

export function freeQty(p: Pick<ProductRow, "scheme">, qty: number): number {
  const s = parseScheme(p);
  return s ? Math.floor(qty / s.buy) * s.free : 0;
}

export function schemeText(p: Pick<ProductRow, "scheme">): string | null {
  const s = parseScheme(p);
  return s ? `Scheme ${s.buy}+${s.free}` : null;
}

/** Cases needed from the godown for a line, scheme freebies included. */
export function needed(p: Pick<ProductRow, "scheme">, qty: number): number {
  return qty + freeQty(p, qty);
}
