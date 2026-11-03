// The 16 OrderRoom tools (LLD §10). Thin adapters: zod in, domain call, envelope out.
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { getDb } from "../db/client.js";
import { writes } from "../domain/api.js";
import { writeBillPdf } from "../domain/billPdf.js";
import { DomainError, type Envelope, isToolError } from "../domain/errors.js";
import { log } from "../domain/log.js";
import type { ConfirmResult } from "../domain/orders.js";
import { orderView } from "../domain/orders.js";
import * as R from "../domain/reads.js";

// ── shared schemas ──
const stamp = {
  actor_handle: z
    .string()
    .min(1)
    .max(80)
    .describe(
      "Sender handle from the [Switch] header. Overwritten by a hook; pass what the header says.",
    ),
  message_id: z
    .string()
    .min(1)
    .max(200)
    .describe("message_id from the [Switch] header (idempotency key)."),
  room_id: z.string().min(1).max(200).describe("room id from the [Switch] header."),
  stamp_sig: z
    .string()
    .max(128)
    .optional()
    .describe("Added by the OrderRoom hook. Never set it yourself."),
};
const id = z.number().int().positive();
const items = z
  .array(
    z.object({
      product_id: id,
      qty_cases: z.number().int().min(1).max(9999).describe("Whole cases (peti)."),
    }),
  )
  .min(1)
  .max(30);
const envelope = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      next_step: z.string(),
      details: z.unknown().optional(),
    })
    .optional(),
  idempotent: z.boolean().optional(),
});

const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

type Env = Envelope<unknown>;

function result(env: Env) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(env) }],
    structuredContent: env as unknown as Record<string, unknown>,
    isError: isToolError(env),
  };
}

function read<T>(fn: () => T): Env {
  try {
    return { ok: true, data: fn() };
  } catch (e) {
    if (e instanceof DomainError) {
      log("info", "read_refused", { code: e.code, message: e.message });
      return { ok: false, error: e.toBody() };
    }
    log("error", "read_internal", { error: String(e) });
    return {
      ok: false,
      error: { code: "INTERNAL", message: "Unexpected error", next_step: "Try again once." },
    };
  }
}

/** After a confirm/approve commits: render the PDF, store its path, fall back to bill_text on failure. */
async function withBill(env: Env): Promise<Env> {
  if (!env.ok) return env;
  const d = env.data as ConfirmResult;
  if (d?.status !== "confirmed" || !d.bill_no || !Array.isArray(d.bill_lines)) return env;
  const db = getDb();
  const existing = db.prepare("SELECT bill_path FROM orders WHERE id = ?").get(d.order_id) as {
    bill_path: string | null;
  };
  try {
    const path = existing?.bill_path ?? (await writeBillPdf(d));
    db.prepare("UPDATE orders SET bill_path = ? WHERE id = ?").run(path, d.order_id);
    return { ...env, data: { ...d, bill_path: path } };
  } catch (e) {
    log("warn", "bill_pdf_failed", { order_id: d.order_id, error: String(e) });
    return env; // bill_text is always present
  }
}

export function registerTools(server: McpServer): void {
  const db = () => getDb();

  // ───────────── reads ─────────────
  server.registerTool(
    "find_retailer",
    {
      title: "Find party",
      description:
        "Fuzzy-search parties (retailers) by the name the salesman typed, e.g. 'Sharma store' or 'gupta wale'. Use it before any order, payment or dues question to get the retailer_id. status 'unique' means use the first match; 'ambiguous' means ask one short question listing the options (name + area); 'none' means ask for the shop name and area. Never guess an id.",
      inputSchema: z.object({ query: z.string().min(1).max(100) }),
      outputSchema: envelope,
      annotations: READ,
    },
    async ({ query }) => result(read(() => R.findRetailer(db(), query))),
  );

  server.registerTool(
    "find_product",
    {
      title: "Find product",
      description:
        "Fuzzy-search products by Hinglish names like 'noodles', 'glucose biscuit', 'chai', 'surf'. Returns product_id, case price, available cases, days of cover and any scheme. Call once per item before create_order_draft; the units in chat (peti, case, carton, box) are all cases. If status is 'ambiguous', ask which one in a single question.",
      inputSchema: z.object({ query: z.string().min(1).max(100) }),
      outputSchema: envelope,
      annotations: READ,
    },
    async ({ query }) => result(read(() => R.findProduct(db(), query))),
  );

  server.registerTool(
    "retailer_dues",
    {
      title: "Party dues",
      description:
        "Credit position of one party: outstanding (udhaar), open bills not yet delivered, credit limit, headroom, oldest unpaid bill age and last payment. Use for questions like 'Sharma ka kitna baaki hai?'. Do not use it to decide approvals; create_order_draft already applies the credit rules. Post reply_text as is.",
      inputSchema: z.object({ retailer_id: id }),
      outputSchema: envelope,
      annotations: READ,
    },
    async ({ retailer_id }) => result(read(() => R.retailerDues(db(), retailer_id))),
  );

  server.registerTool(
    "retailer_usual_order",
    {
      title: "Usual order",
      description:
        "The party's last billed order lines, for 'Gupta ka usual' or 'wahi pichle wala'. Returns product_ids and quantities you can pass straight to create_order_draft after the sender says yes. It does not create anything. If lines is empty, say there is no previous order.",
      inputSchema: z.object({ retailer_id: id }),
      outputSchema: envelope,
      annotations: READ,
    },
    async ({ retailer_id }) => result(read(() => R.usualOrder(db(), retailer_id))),
  );

  server.registerTool(
    "get_order",
    {
      title: "Get order",
      description:
        "Full view of one order by number (#1046): status, lines, totals, approval reasons, the approval card when it needs approval, bill number and bill_path. Use for 'status of 1046' or before posting an approval card in the office room. Read-only; it never changes the order.",
      inputSchema: z.object({ order_id: id }),
      outputSchema: envelope,
      annotations: READ,
    },
    async ({ order_id }) => result(read(() => orderView(db(), order_id))),
  );

  server.registerTool(
    "list_open_orders",
    {
      title: "Open orders",
      description:
        "Orders that are not finished (draft, needs approval, confirmed, packed, dispatched), approvals first, at most 25. Use for 'kya pending hai', 'approval list' or 'aaj kya dispatch hona hai'. Filter by status, party or room when the question is narrower. response_format 'concise' (default) keeps the output small.",
      inputSchema: z.object({
        status: z
          .array(
            z.enum([
              "awaiting_confirmation",
              "needs_approval",
              "confirmed",
              "packed",
              "dispatched",
            ]),
          )
          .optional(),
        retailer_id: id.optional(),
        room_id: z.string().max(200).optional(),
        response_format: z.enum(["concise", "detailed"]).optional(),
      }),
      outputSchema: envelope,
      annotations: READ,
    },
    async (a) => result(read(() => R.listOpenOrders(db(), a))),
  );

  server.registerTool(
    "daily_summary",
    {
      title: "Daily sales report (DSR)",
      description:
        "The manager's end-of-day DSR: bills cut, order value, productive calls, lines per bill, fill rate, collections by mode, pending approvals, overdue parties, low stock and over-limit parties. Managers only; anyone else gets FORBIDDEN_ROLE. date is YYYY-MM-DD in India and defaults to today. Post reply_text as is.",
      inputSchema: z.object({
        actor_handle: stamp.actor_handle,
        stamp_sig: stamp.stamp_sig,
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        response_format: z.enum(["concise", "detailed"]).optional(),
      }),
      outputSchema: envelope,
      annotations: READ,
    },
    async (a) => result(read(() => R.dailySummary(db(), a))),
  );

  // ───────────── writes ─────────────
  server.registerTool(
    "create_order_draft",
    {
      title: "Create order draft",
      description:
        "Creates a draft order for one party from resolved product_ids and whole cases, then applies the rules in code: credit limit, overdue bills and stock. Result status is 'awaiting_confirmation' (clean; the sender confirms) or 'needs_approval' (tag approver_handles in the office room). Resolve the party and every product first; never invent ids or quantities. Post reply_text, which already contains the checks.",
      inputSchema: z.object({
        ...stamp,
        retailer_id: id,
        items,
        note: z.string().max(200).optional(),
      }),
      outputSchema: envelope,
      annotations: WRITE,
    },
    async (a) => result(writes.create_order_draft(db(), a)),
  );

  server.registerTool(
    "revise_order_draft",
    {
      title: "Revise draft",
      description:
        "Replaces the lines of a draft that is not yet confirmed and re-runs every check. Only the salesman who created it or a manager can revise. Use when the sender corrects quantities ('noodles 8 kar do'). For a manager trimming quantities while approving, use approve_order with changes instead.",
      inputSchema: z.object({ ...stamp, order_id: id, items }),
      outputSchema: envelope,
      annotations: WRITE,
    },
    async (a) => result(writes.revise_order_draft(db(), a)),
  );

  server.registerTool(
    "confirm_order",
    {
      title: "Confirm clean order",
      description:
        "Confirms a clean draft (status awaiting_confirmation): reserves stock, applies the scheme, cuts the bill and returns bill_path (PDF), bill_text and pick_list_text. Only the creator or a manager can confirm; it refuses drafts that need approval. After success, send the PDF with send_attachment (or post bill_text if that fails) and send pick_list_text to godown_handles with send_targeted_message.",
      inputSchema: z.object({ ...stamp, order_id: id }),
      outputSchema: envelope,
      annotations: WRITE,
    },
    async (a) => result(await withBill(writes.confirm_order(db(), a))),
  );

  server.registerTool(
    "approve_order",
    {
      title: "Approve order (manager)",
      description:
        "Manager approval of an order in needs_approval, optionally trimming quantities with changes (e.g. 'biscuit 3 hi bhejo' → qty_confirmed 3; the rest is backordered). The role check happens in code from the sender identity, so call it even if you doubt the sender and relay the refusal. Returns the same bill and pick list fields as confirm_order. On INSUFFICIENT_STOCK, offer details.max_confirmable.",
      inputSchema: z.object({
        ...stamp,
        order_id: id,
        changes: z
          .array(z.object({ product_id: id, qty_confirmed: z.number().int().min(0).max(9999) }))
          .max(30)
          .optional(),
        note: z.string().max(200).optional(),
      }),
      outputSchema: envelope,
      annotations: WRITE,
    },
    async (a) => result(await withBill(writes.approve_order(db(), a))),
  );

  server.registerTool(
    "reject_order",
    {
      title: "Reject order (manager)",
      description:
        "Manager rejection of an order in needs_approval with a short reason. Afterwards tell creator_handle in the room where the order was placed. Managers only; the code checks the sender's role. Use cancel_order instead when the party itself backs out.",
      inputSchema: z.object({ ...stamp, order_id: id, reason: z.string().min(1).max(200) }),
      outputSchema: envelope,
      annotations: WRITE,
    },
    async (a) => result(writes.reject_order(db(), a)),
  );

  server.registerTool(
    "cancel_order",
    {
      title: "Cancel order",
      description:
        "Cancels a draft (creator or manager) or a confirmed order (manager only; releases reserved stock and voids the bill). Packed or later orders cannot be cancelled; use update_status returned after dispatch. Ask for a reason if the sender gave none, but do not block on it.",
      inputSchema: z.object({ ...stamp, order_id: id, reason: z.string().max(200).optional() }),
      outputSchema: envelope,
      annotations: WRITE,
    },
    async (a) => result(writes.cancel_order(db(), a)),
  );

  server.registerTool(
    "update_status",
    {
      title: "Update order status",
      description:
        "Moves an order along confirmed → packed → dispatched → delivered, or dispatched → returned with a return_reason. Godown and managers pack and dispatch; delivery, godown and managers mark delivered or returned. Dispatch moves stock out of the godown; delivery adds the bill to the party's outstanding. Skipping a step returns INVALID_TRANSITION with the current status.",
      inputSchema: z.object({
        ...stamp,
        order_id: id,
        status: z.enum(["packed", "dispatched", "delivered", "returned"]),
        return_reason: z.enum(["damage", "expiry", "wrong_sku", "refused"]).optional(),
      }),
      outputSchema: envelope,
      annotations: WRITE,
    },
    async (a) => result(writes.update_status(db(), a)),
  );

  server.registerTool(
    "record_payment",
    {
      title: "Record collection",
      description:
        "Records money collected from a party: amount in paise (₹15,000 → 1500000) and mode cash, upi, cheque or bank. Salesmen, delivery and managers can record. Returns the new outstanding and oldest unpaid bill age. Confirm the amount back in the reply; never record a payment the sender did not state.",
      inputSchema: z.object({
        ...stamp,
        retailer_id: id,
        amount_paise: z.number().int().positive().max(100_000_000),
        mode: z.enum(["cash", "upi", "cheque", "bank"]),
        reference: z.string().max(64).optional(),
      }),
      outputSchema: envelope,
      annotations: WRITE,
    },
    async (a) => result(writes.record_payment(db(), a)),
  );

  server.registerTool(
    "register_user",
    {
      title: "Register teammate (manager)",
      description:
        "Adds a teammate or changes their role (salesman, manager, godown, delivery). Managers only. target_handle is the person's chat username exactly as Switch shows it, without spaces. Use when a manager writes '@desk register <handle> as salesman'.",
      inputSchema: z.object({
        ...stamp,
        target_handle: z.string().regex(/^@?[A-Za-z0-9_.-]{2,64}$/),
        display_name: z.string().min(1).max(64),
        role: z.enum(["salesman", "manager", "godown", "delivery"]),
      }),
      outputSchema: envelope,
      annotations: WRITE,
    },
    async (a) => result(writes.register_user(db(), a)),
  );
}

export const TOOL_COUNT = 16;
