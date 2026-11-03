// The role × action matrix (LLD §4). State and creator rules live in orders.ts.
import type { Role } from "./identity.js";

export const WRITE_ROLES = {
  create_order_draft: ["salesman", "manager"],
  revise_order_draft: ["salesman", "manager"],
  confirm_order: ["salesman", "manager"],
  approve_order: ["manager"],
  reject_order: ["manager"],
  cancel_order: ["salesman", "manager"],
  update_status: ["godown", "delivery", "manager"],
  record_payment: ["salesman", "manager", "delivery"],
  register_user: ["manager"],
} as const satisfies Record<string, readonly Role[]>;

export type WriteAction = keyof typeof WRITE_ROLES;

/** Who may move an order into each status via update_status. */
export const STATUS_ROLES: Record<"packed" | "dispatched" | "delivered" | "returned", Role[]> = {
  packed: ["godown", "manager"],
  dispatched: ["godown", "manager"],
  delivered: ["delivery", "godown", "manager"],
  returned: ["delivery", "godown", "manager"],
};

export const READ_ROLES = {
  daily_summary: ["manager"],
} as const satisfies Record<string, readonly Role[]>;
