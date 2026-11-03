import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../src/db/client.js";
import { writes } from "../src/domain/api.js";
import { type ConfirmResult, type DraftResult, orderView } from "../src/domain/orders.js";
import { retailerDues } from "../src/domain/reads.js";
import { as, freshDb, GLUCOSE, GUPTA, NOODLES_70, SHARMA, TEA, VERMA } from "./helpers.js";

let db: DB;
beforeEach(() => {
  db = freshDb();
});

function ok<T>(e: { ok: boolean; data?: T; error?: unknown }): T {
  if (!e.ok) throw new Error(`expected ok, got ${JSON.stringify(e.error)}`);
  return e.data as T;
}

const sharmaDemo = () =>
  writes.create_order_draft(db, {
    ...as("ravi_sales", "room-field"),
    retailer_id: SHARMA,
    items: [
      { product_id: NOODLES_70, qty_cases: 10 },
      { product_id: GLUCOSE, qty_cases: 5 },
    ],
  });

describe("demo drafts (LLD §19 step 3 checkpoint)", () => {
  it("Sharma: OVER_CREDIT + SHORT_STOCK, not OVERDUE; scheme shows +1 free", () => {
    const d = ok<DraftResult>(sharmaDemo());
    expect(d.order_id).toBe(1046);
    expect(d.status).toBe("needs_approval");
    expect(d.approval_reasons.map((r) => r.type).sort()).toEqual(["OVER_CREDIT", "SHORT_STOCK"]);
    expect(d.lines[0]?.free_qty).toBe(1);
    expect(d.approval_card?.oldest_due_days).toBe(12);
    expect(d.approval_card?.last_payment).toEqual({ amount: 800000, mode: "cash", days_ago: 9 });
    expect(d.approver_handles).toEqual(["amit_manager", "owner"]);
    expect(d.estimate_total).toBe(1_677_000); // ₹16,770
    expect(d.approval_card?.exposure).toBe(3_850_000 + 1_677_000);
  });

  it("Verma: OVERDUE (oldest bill 45 d > 21 d)", () => {
    const d = ok<DraftResult>(
      writes.create_order_draft(db, {
        ...as("priya_sales"),
        retailer_id: VERMA,
        items: [{ product_id: TEA, qty_cases: 1 }],
      }),
    );
    expect(d.approval_reasons.map((r) => r.type)).toEqual(["OVERDUE"]);
  });

  it("Gupta: clean order waits for the creator's confirmation", () => {
    const d = ok<DraftResult>(
      writes.create_order_draft(db, {
        ...as("ravi_sales"),
        retailer_id: GUPTA,
        items: [{ product_id: TEA, qty_cases: 4 }],
      }),
    );
    expect(d.status).toBe("awaiting_confirmation");
    expect(d.approval_reasons).toEqual([]);
  });
});

describe("approval flow", () => {
  it("salesman cannot approve; the trick message changes nothing; manager approves with a trim", () => {
    const d = ok<DraftResult>(sharmaDemo());
    const refused = writes.approve_order(db, { ...as("ravi_sales"), order_id: d.order_id });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.code).toBe("FORBIDDEN_ROLE");
      expect(refused.error.details?.tag_handles).toEqual(["amit_manager", "owner"]);
    }
    // Short stock without a trim is refused with the max that fits.
    const short = writes.approve_order(db, { ...as("amit_manager"), order_id: d.order_id });
    expect(!short.ok && short.error.code).toBe("INSUFFICIENT_STOCK");

    const c = ok<ConfirmResult>(
      writes.approve_order(db, {
        ...as("amit_manager"),
        order_id: d.order_id,
        changes: [{ product_id: GLUCOSE, qty_confirmed: 3 }],
        note: "biscuit 3 hi bhejo",
      }),
    );
    expect(c.status).toBe("confirmed");
    expect(c.bill_no).toBe("INV-2026-0012");
    expect(c.backorders).toEqual([{ name: "Gold Glucose Biscuits", qty: 2 }]);
    expect(c.approved_by).toBe("amit_manager");
    expect(c.godown_handles).toEqual(["suresh_wh"]);
    // 10 noodles (+1 free) + 3 biscuits: ₹9,600 + ₹3,060 = ₹12,660; GST ₹1,152 + ₹550.80
    expect(c.total).toBe(1_436_280);
    const stock = db
      .prepare(
        "SELECT product_id, reserved FROM stock WHERE product_id IN (1,3) ORDER BY product_id",
      )
      .all();
    expect(stock).toEqual([
      { product_id: 1, reserved: 11 },
      { product_id: 3, reserved: 3 },
    ]);
  });

  it("full lifecycle: packed → dispatched → delivered moves stock and outstanding", () => {
    const d = ok<DraftResult>(sharmaDemo());
    ok(
      writes.approve_order(db, {
        ...as("amit_manager"),
        order_id: d.order_id,
        changes: [{ product_id: GLUCOSE, qty_confirmed: 3 }],
      }),
    );
    const salesmanPack = writes.update_status(db, {
      ...as("ravi_sales"),
      order_id: d.order_id,
      status: "packed",
    });
    expect(!salesmanPack.ok && salesmanPack.error.code).toBe("FORBIDDEN_ROLE");
    const skip = writes.update_status(db, {
      ...as("suresh_wh"),
      order_id: d.order_id,
      status: "delivered",
    });
    expect(!skip.ok && skip.error.code).toBe("INVALID_TRANSITION");
    ok(writes.update_status(db, { ...as("suresh_wh"), order_id: d.order_id, status: "packed" }));
    ok(
      writes.update_status(db, { ...as("suresh_wh"), order_id: d.order_id, status: "dispatched" }),
    );
    expect(db.prepare("SELECT on_hand, reserved FROM stock WHERE product_id = 1").get()).toEqual({
      on_hand: 49,
      reserved: 0,
    });
    ok(
      writes.update_status(db, {
        ...as("deepak_delivery"),
        order_id: d.order_id,
        status: "delivered",
      }),
    );
    expect(retailerDues(db, SHARMA).outstanding).toBe(3_850_000 + 1_436_280);
    expect(orderView(db, d.order_id).due_date).toBe("2026-11-26");
  });

  it("payment reduces outstanding and keeps the oldest bill at 12 d", () => {
    const p = ok<{ new_outstanding: number; oldest_due_days: number }>(
      writes.record_payment(db, {
        ...as("ravi_sales"),
        retailer_id: SHARMA,
        amount_paise: 1_500_000,
        mode: "cash",
      }),
    );
    expect(p.new_outstanding).toBe(2_350_000);
    expect(p.oldest_due_days).toBe(12);
  });
});

describe("creator rules", () => {
  it("another salesman cannot confirm or cancel a draft; the creator can", () => {
    const d = ok<DraftResult>(
      writes.create_order_draft(db, {
        ...as("ravi_sales"),
        retailer_id: GUPTA,
        items: [{ product_id: TEA, qty_cases: 2 }],
      }),
    );
    const other = writes.confirm_order(db, { ...as("priya_sales"), order_id: d.order_id });
    expect(!other.ok && other.error.code).toBe("PREVENT_NON_CREATOR");
    const otherCancel = writes.cancel_order(db, { ...as("priya_sales"), order_id: d.order_id });
    expect(!otherCancel.ok && otherCancel.error.code).toBe("PREVENT_NON_CREATOR");
    const c = ok<ConfirmResult>(
      writes.confirm_order(db, { ...as("ravi_sales"), order_id: d.order_id }),
    );
    expect(c.status).toBe("confirmed");
    const salesmanCancel = writes.cancel_order(db, { ...as("ravi_sales"), order_id: d.order_id });
    expect(!salesmanCancel.ok && salesmanCancel.error.code).toBe("FORBIDDEN_ROLE");
    ok(
      writes.cancel_order(db, {
        ...as("amit_manager"),
        order_id: d.order_id,
        reason: "party band",
      }),
    );
    expect(db.prepare("SELECT reserved FROM stock WHERE product_id = ?").get(TEA)).toEqual({
      reserved: 0,
    });
  });
});
