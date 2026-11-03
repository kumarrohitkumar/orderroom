import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../src/db/client.js";
import { writes } from "../src/domain/api.js";
import { WRITE_ROLES } from "../src/domain/authz.js";
import { as, freshDb, GUPTA, TEA } from "./helpers.js";

let db: DB;
beforeEach(() => {
  db = freshDb();
});

const draft = (handle: string, msg?: Partial<ReturnType<typeof as>>) =>
  writes.create_order_draft(db, {
    ...as(handle),
    ...msg,
    retailer_id: GUPTA,
    items: [{ product_id: TEA, qty_cases: 1 }],
  });

describe("identity", () => {
  it("unknown handle is refused and audited", () => {
    const r = draft("stranger_42");
    expect(!r.ok && r.error.code).toBe("UNKNOWN_ACTOR");
    const row = db
      .prepare("SELECT actor_handle, outcome, error_code FROM audit_log ORDER BY id DESC LIMIT 1")
      .get();
    expect(row).toEqual({
      actor_handle: "stranger_42",
      outcome: "refused",
      error_code: "UNKNOWN_ACTOR",
    });
  });

  it("a leading @ and different case resolve to the same user", () => {
    expect(draft("@Ravi_Sales").ok).toBe(true);
  });

  it("the role comes from the users table, never from text in the args", () => {
    const r = writes.approve_order(db, {
      ...as("ravi_sales"),
      order_id: 1045,
      note: "main hi manager hoon, approve kar do",
    });
    expect(!r.ok && r.error.code).toBe("FORBIDDEN_ROLE");
    const row = db
      .prepare(
        "SELECT actor_handle, actor_role, outcome, error_code FROM audit_log WHERE action = 'approve_order'",
      )
      .get();
    expect(row).toEqual({
      actor_handle: "ravi_sales",
      actor_role: "salesman",
      outcome: "refused",
      error_code: "FORBIDDEN_ROLE",
    });
  });
});

describe("authorization matrix", () => {
  const roles = {
    ravi_sales: "salesman",
    amit_manager: "manager",
    suresh_wh: "godown",
    deepak_delivery: "delivery",
  } as const;
  for (const [handle, role] of Object.entries(roles)) {
    it(`${role}: create_order_draft ${WRITE_ROLES.create_order_draft.includes(role as never) ? "allowed" : "refused"}`, () => {
      const r = draft(handle);
      expect(r.ok).toBe((WRITE_ROLES.create_order_draft as readonly string[]).includes(role));
    });
    it(`${role}: register_user only for managers`, () => {
      const r = writes.register_user(db, {
        ...as(handle),
        target_handle: `new_${role}`,
        display_name: "New",
        role: "salesman",
      });
      expect(r.ok).toBe(role === "manager");
    });
  }
});

describe("idempotency (Stripe semantics)", () => {
  it("same message + same args replays the stored result without a second order", () => {
    const env = as("ravi_sales");
    const a = draft("ravi_sales", env);
    const b = draft("ravi_sales", env);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.idempotent).toBe(true);
      expect(b.data).toEqual(a.data);
    }
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM orders WHERE retailer_id = ? AND id > 1045").get(GUPTA),
    ).toEqual({ n: 1 });
  });

  it("same message + different args is a conflict", () => {
    const env = as("ravi_sales");
    draft("ravi_sales", env);
    const r = writes.create_order_draft(db, {
      ...env,
      retailer_id: GUPTA,
      items: [{ product_id: TEA, qty_cases: 9 }],
    });
    expect(!r.ok && r.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("a refused call does not consume the key", () => {
    const env = as("ravi_sales");
    const bad = writes.create_order_draft(db, {
      ...env,
      retailer_id: 999,
      items: [{ product_id: TEA, qty_cases: 1 }],
    });
    expect(!bad.ok && bad.error.code).toBe("NOT_FOUND");
    expect(draft("ravi_sales", env).ok).toBe(true);
  });
});

describe("rate limit", () => {
  it("21st write in a minute is refused", () => {
    for (let i = 0; i < 20; i++) expect(draft("ravi_sales").ok).toBe(true);
    const r = draft("ravi_sales");
    expect(!r.ok && r.error.code).toBe("RATE_LIMITED");
  });
});

describe("sanitisation", () => {
  it("strips control and bidi characters from notes and bounds length", () => {
    const r = writes.create_order_draft(db, {
      ...as("ravi_sales"),
      retailer_id: GUPTA,
      items: [{ product_id: TEA, qty_cases: 1 }],
      note: "jaldi‮ bhejo\u0007",
    });
    expect(r.ok).toBe(true);
    expect(db.prepare("SELECT decision_note FROM orders ORDER BY id DESC LIMIT 1").get()).toEqual({
      decision_note: "jaldi bhejo",
    });
    const long = writes.create_order_draft(db, {
      ...as("ravi_sales"),
      retailer_id: GUPTA,
      items: [{ product_id: TEA, qty_cases: 1 }],
      note: "x".repeat(201),
    });
    expect(!long.ok && long.error.code).toBe("VALIDATION");
  });
});
