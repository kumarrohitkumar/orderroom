import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/client.js";
import { seed } from "../src/db/seed.js";
import { writes } from "../src/domain/api.js";
import { dailySummary } from "../src/domain/reads.js";

describe("business day is India time", () => {
  it("a bill cut at 00:30 IST counts in that IST day's DSR", () => {
    process.env.ORDERROOM_REQUIRE_STAMP = "0";
    process.env.ORDERROOM_NOW = "2026-11-04T19:00:00Z"; // Nov 5, 00:30 IST
    const db = openDb(":memory:");
    seed(db);
    const s = (h: string, m: string) => ({ actor_handle: h, message_id: m, room_id: "r" });
    const d = writes.create_order_draft(db, {
      ...s("ravi_sales", "a"),
      retailer_id: 2,
      items: [{ product_id: 5, qty_cases: 2 }],
    });
    expect(d.ok).toBe(true);
    expect(writes.confirm_order(db, { ...s("ravi_sales", "b"), order_id: 1046 }).ok).toBe(true);
    expect(
      writes.record_payment(db, {
        ...s("ravi_sales", "c"),
        retailer_id: 2,
        amount_paise: 100000,
        mode: "upi",
      }).ok,
    ).toBe(true);
    const dsr = dailySummary(db, { actor_handle: "amit_manager" });
    expect(dsr.date).toBe("2026-11-05");
    expect(dsr.bills_cut).toBe(1);
    expect(dsr.productive_calls).toBe(1);
    expect(dsr.collection_total).toBe(100000);
  });
});
