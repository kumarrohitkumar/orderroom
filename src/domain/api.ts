// One entry per write tool: the role-checked, audited, idempotent call used by MCP and tests alike.
import type { DB } from "../db/client.js";
import { runWrite, type Stamp } from "./audit.js";
import type { Role } from "./identity.js";
import * as O from "./orders.js";
import { recordPayment, verifyPayment } from "./payments.js";
import { cleanText } from "./sanitize.js";
import { registerUser } from "./users.js";

type In<T> = Stamp & T;

export const writes = {
  create_order_draft: (
    db: DB,
    a: In<{ retailer_id: number; items: O.ItemInput[]; note?: string }>,
  ) =>
    runWrite(db, { action: "create_order_draft", entity: "order", scope: a.retailer_id }, a, (c) =>
      O.createDraft(c, { ...a, note: cleanText(a.note, "note") }),
    ),
  revise_order_draft: (db: DB, a: In<{ order_id: number; items: O.ItemInput[] }>) =>
    runWrite(db, { action: "revise_order_draft", entity: "order", entityId: a.order_id }, a, (c) =>
      O.reviseDraft(c, a),
    ),
  confirm_order: (db: DB, a: In<{ order_id: number }>) =>
    runWrite(db, { action: "confirm_order", entity: "order", entityId: a.order_id }, a, (c) =>
      O.confirmOrder(c, a),
    ),
  approve_order: (
    db: DB,
    a: In<{
      order_id: number;
      changes?: { product_id: number; qty_confirmed: number }[];
      note?: string;
    }>,
  ) =>
    runWrite(db, { action: "approve_order", entity: "order", entityId: a.order_id }, a, (c) =>
      O.approveOrder(c, { ...a, note: cleanText(a.note, "note") }),
    ),
  reject_order: (db: DB, a: In<{ order_id: number; reason: string }>) =>
    runWrite(db, { action: "reject_order", entity: "order", entityId: a.order_id }, a, (c) =>
      O.rejectOrder(c, {
        order_id: a.order_id,
        reason: cleanText(a.reason, "reason") ?? "no reason given",
      }),
    ),
  cancel_order: (db: DB, a: In<{ order_id: number; reason?: string }>) =>
    runWrite(db, { action: "cancel_order", entity: "order", entityId: a.order_id }, a, (c) =>
      O.cancelOrder(c, { order_id: a.order_id, reason: cleanText(a.reason, "reason") }),
    ),
  update_status: (
    db: DB,
    a: In<{
      order_id: number;
      status: "packed" | "dispatched" | "delivered" | "returned";
      return_reason?: "damage" | "expiry" | "wrong_sku" | "refused";
    }>,
  ) =>
    runWrite(db, { action: "update_status", entity: "order", entityId: a.order_id }, a, (c) =>
      O.updateStatus(c, a),
    ),
  record_payment: (
    db: DB,
    a: In<{
      retailer_id: number;
      amount_paise: number;
      mode: "cash" | "upi" | "cheque" | "bank";
      reference?: string;
    }>,
  ) =>
    runWrite(
      db,
      { action: "record_payment", entity: "retailer", entityId: a.retailer_id },
      a,
      (c) => recordPayment(c, { ...a, reference: cleanText(a.reference, "reference", 64) }),
    ),
  verify_payment: (db: DB, a: In<{ payment_id: number; decision: "verify" | "reject" }>) =>
    runWrite(db, { action: "verify_payment", entity: "payment", entityId: a.payment_id }, a, (c) =>
      verifyPayment(c, a),
    ),
  register_user: (db: DB, a: In<{ target_handle: string; display_name: string; role: Role }>) =>
    runWrite(
      db,
      { action: "register_user", entity: "user", scope: a.target_handle.toLowerCase() },
      a,
      (c) => registerUser(c, a),
    ),
};
