import { describe, expect, it } from "vitest";
import { counts } from "../src/db/seed.js";
import { freshDb } from "./helpers.js";

describe("seed", () => {
  const db = freshDb();

  it("creates the documented row counts", () => {
    expect(counts(db)).toEqual({
      users: 6,
      retailers: 20,
      products: 15,
      stock: 15,
      orders: 10,
      order_items: 22,
      payments: 6,
    });
  });

  it("sets up the Sharma demo party", () => {
    const r = db.prepare("SELECT * FROM retailers WHERE code = 'R-0001'").get() as Record<
      string,
      number | string
    >;
    expect(r.name).toBe("Sharma General Store");
    expect(r.credit_limit).toBe(4_000_000);
    expect(r.outstanding).toBe(3_850_000);
  });

  it("has exactly one scheme SKU and short biscuits", () => {
    const schemes = db.prepare("SELECT sku FROM products WHERE scheme IS NOT NULL").all();
    expect(schemes).toEqual([{ sku: "NDL-070" }]);
    const bis = db.prepare("SELECT on_hand, reserved FROM stock WHERE product_id = 3").get();
    expect(bis).toEqual({ on_hand: 3, reserved: 0 });
  });

  it("leaves the bill counter so the first demo bill is INV-2026-0012", () => {
    expect(db.prepare("SELECT value FROM counters WHERE name='bill'").get()).toEqual({ value: 11 });
    const last = db.prepare("SELECT MAX(bill_no) AS b FROM orders").get();
    expect(last).toEqual({ b: "INV-2026-0011" });
    expect(db.prepare("SELECT MAX(id) AS id FROM orders").get()).toEqual({ id: 1045 });
  });

  it("is idempotent", () => {
    const again = freshDb();
    expect(counts(again)).toEqual(counts(db));
  });
});
