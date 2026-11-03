// Deterministic, made-up demo data (LLD §11). No real companies, customers or brands.
// Dates are relative to the clock (ORDERROOM_NOW pins it), so ages like "12 days" stay true.
import { addDays, sqlTimestamp, today } from "../domain/clock.js";
import { computeTotals } from "../domain/money.js";
import type { DB } from "./client.js";
import { resetSchema } from "./migrate.js";

const R = (rupees: number) => Math.round(rupees * 100); // ₹ → paise

export const SEED_USERS = [
  { handle: "ravi_sales", display_name: "Ravi (salesman)", role: "salesman" },
  { handle: "priya_sales", display_name: "Priya (salesman)", role: "salesman" },
  { handle: "amit_manager", display_name: "Amit (manager)", role: "manager" },
  { handle: "owner", display_name: "Owner", role: "manager" },
  { handle: "suresh_wh", display_name: "Suresh (godown)", role: "godown" },
  { handle: "deepak_delivery", display_name: "Deepak (delivery)", role: "delivery" },
] as const;

interface SeedRetailer {
  name: string;
  area: string;
  limit: number; // ₹
  days?: number;
  outstanding?: number; // ₹
  aliases?: string[];
}

// Index + 1 = id; code R-00NN.
export const SEED_RETAILERS: SeedRetailer[] = [
  {
    name: "Sharma General Store",
    area: "Karol Bagh",
    limit: 40000,
    outstanding: 38500,
    aliases: ["sharma", "sharma ji", "sharma wale"],
  },
  {
    name: "Gupta Provision Store",
    area: "Karol Bagh",
    limit: 100000,
    outstanding: 10000,
    aliases: ["gupta", "gupta provision"],
  },
  {
    name: "Verma Kirana",
    area: "Lajpat Nagar",
    limit: 50000,
    outstanding: 22000,
    aliases: ["verma", "verma ji"],
  },
  { name: "Singh Traders", area: "Rohini", limit: 45000, outstanding: 5000 },
  { name: "Singh Stores", area: "Lajpat Nagar", limit: 30000, outstanding: 0 },
  {
    name: "Khan Bakers & General",
    area: "Karol Bagh",
    limit: 35000,
    outstanding: 6500,
    aliases: ["khan bakers", "khan"],
  },
  {
    name: "Jain Super Mart",
    area: "Rohini",
    limit: 80000,
    outstanding: 0,
    aliases: ["jain", "jain mart"],
  },
  {
    name: "Agarwal Confectionery",
    area: "Lajpat Nagar",
    limit: 25000,
    outstanding: 0,
    aliases: ["agarwal"],
  },
  { name: "Bansal Kirana", area: "Rohini", limit: 30000, outstanding: 4200 },
  { name: "Malhotra Daily Needs", area: "Karol Bagh", limit: 40000, outstanding: 0 },
  { name: "Arora Provision", area: "Lajpat Nagar", limit: 35000, outstanding: 0 },
  { name: "Chopra General Store", area: "Rohini", limit: 30000, outstanding: 0 },
  { name: "Kapoor Mini Mart", area: "Karol Bagh", limit: 50000, outstanding: 0 },
  { name: "Mehta Traders", area: "Lajpat Nagar", limit: 40000, outstanding: 0 },
  { name: "Yadav Kirana", area: "Rohini", limit: 20000, outstanding: 0 },
  { name: "Saini Store", area: "Rohini", limit: 20000, outstanding: 0 },
  { name: "Bhatia Super Store", area: "Karol Bagh", limit: 60000, outstanding: 0 },
  { name: "Sethi Provision", area: "Lajpat Nagar", limit: 30000, outstanding: 0 },
  { name: "Grover General Store", area: "Rohini", limit: 25000, outstanding: 0 },
  { name: "Rana Daily Mart", area: "Karol Bagh", limit: 30000, outstanding: 0 },
];

interface SeedProduct {
  sku: string;
  name: string;
  caseSize: number;
  casePrice: number; // ₹ per case
  gst: number;
  scheme?: { type: "free_qty"; buy: number; free: number };
  onHand: number;
  avgDaily: number;
  aliases: string[];
}

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    sku: "NDL-070",
    name: "Crunchy Masala Noodles 70g",
    caseSize: 96,
    casePrice: 960,
    gst: 12,
    scheme: { type: "free_qty", buy: 10, free: 1 },
    onHand: 60,
    avgDaily: 8,
    aliases: ["noodles", "noodle", "nudal", "nudals", "masala noodles"],
  },
  {
    sku: "NDL-140",
    name: "Crunchy Masala Noodles 140g",
    caseSize: 48,
    casePrice: 816,
    gst: 12,
    onHand: 25,
    avgDaily: 3,
    aliases: ["bada noodles", "noodles 140", "family noodles"],
  },
  {
    sku: "BIS-GLU",
    name: "Gold Glucose Biscuits",
    caseSize: 120,
    casePrice: 1020,
    gst: 18,
    onHand: 3,
    avgDaily: 1.5,
    aliases: ["glucose", "glucose biscuit", "gold biscuit"],
  },
  {
    sku: "BIS-CRM",
    name: "Choco Cream Biscuits",
    caseSize: 72,
    casePrice: 1224,
    gst: 18,
    onHand: 30,
    avgDaily: 3,
    aliases: ["cream biscuit", "choco biscuit"],
  },
  {
    sku: "TEA-AG250",
    name: "Assam Gold Tea 250g",
    caseSize: 24,
    casePrice: 2640,
    gst: 5,
    onHand: 40,
    avgDaily: 4,
    aliases: ["chai", "chai patti", "tea", "assam chai"],
  },
  {
    sku: "TEA-KE250",
    name: "Kadak Elaichi Tea 250g",
    caseSize: 24,
    casePrice: 2880,
    gst: 5,
    onHand: 22,
    avgDaily: 2,
    aliases: ["elaichi chai", "elaichi tea"],
  },
  {
    sku: "SOP-NEEM",
    name: "Neem Fresh Soap 100g",
    caseSize: 144,
    casePrice: 4032,
    gst: 18,
    onHand: 35,
    avgDaily: 3,
    aliases: ["neem sabun", "sabun", "soap"],
  },
  {
    sku: "SOP-ROSE",
    name: "Rose Glow Soap 100g",
    caseSize: 144,
    casePrice: 4320,
    gst: 18,
    onHand: 4,
    avgDaily: 1,
    aliases: ["rose sabun", "rose soap"],
  },
  {
    sku: "DET-BW1K",
    name: "Brite Wash Detergent 1kg",
    caseSize: 24,
    casePrice: 2280,
    gst: 18,
    onHand: 50,
    avgDaily: 4,
    aliases: ["surf", "detergent", "washing powder"],
  },
  {
    sku: "DET-LS1K",
    name: "Lemon Shine Detergent 1kg",
    caseSize: 24,
    casePrice: 2520,
    gst: 18,
    onHand: 28,
    avgDaily: 2,
    aliases: ["lemon surf", "lemon detergent"],
  },
  {
    sku: "NMK-ALU40",
    name: "Aloo Bhujia 40g",
    caseSize: 240,
    casePrice: 1080,
    gst: 12,
    onHand: 45,
    avgDaily: 5,
    aliases: ["bhujia", "aloo bhujia", "namkeen"],
  },
  {
    sku: "NMK-KM40",
    name: "Khatta Meetha Mix 40g",
    caseSize: 240,
    casePrice: 1080,
    gst: 12,
    onHand: 30,
    avgDaily: 3,
    aliases: ["khatta meetha", "mixture"],
  },
  {
    sku: "NMK-MD40",
    name: "Moong Dal Namkeen 40g",
    caseSize: 240,
    casePrice: 1080,
    gst: 12,
    onHand: 2,
    avgDaily: 1,
    aliases: ["moong dal"],
  },
  {
    sku: "BEV-MNG200",
    name: "Mango Fruit Drink 200ml",
    caseSize: 30,
    casePrice: 510,
    gst: 12,
    onHand: 70,
    avgDaily: 6,
    aliases: ["mango drink", "frooty wala", "juice"],
  },
  {
    sku: "PST-HB100",
    name: "Herbal Bright Toothpaste 100g",
    caseSize: 72,
    casePrice: 3024,
    gst: 18,
    onHand: 20,
    avgDaily: 1.5,
    aliases: ["toothpaste", "paste", "manjan"],
  },
];

type Status = "delivered" | "dispatched" | "packed" | "confirmed" | "rejected" | "cancelled";

interface SeedOrder {
  id: number;
  retailer: number; // retailer id
  by: string; // handle
  daysAgo: number; // created
  status: Status;
  deliveredDaysAgo?: number;
  items: [sku: string, cases: number][];
  note?: string;
}

// Ids 1036–1045 so the first demo order is #1046 (DEMO_SCRIPT scene 2).
export const SEED_ORDERS: SeedOrder[] = [
  {
    id: 1036,
    retailer: 1,
    by: "ravi_sales",
    daysAgo: 31,
    status: "delivered",
    deliveredDaysAgo: 30,
    items: [
      ["NDL-070", 10],
      ["BIS-CRM", 4],
      ["TEA-AG250", 2],
    ],
  },
  {
    id: 1037,
    retailer: 3,
    by: "priya_sales",
    daysAgo: 46,
    status: "delivered",
    deliveredDaysAgo: 45,
    items: [
      ["TEA-AG250", 5],
      ["DET-BW1K", 3],
    ],
  },
  {
    id: 1038,
    retailer: 1,
    by: "ravi_sales",
    daysAgo: 13,
    status: "delivered",
    deliveredDaysAgo: 12,
    items: [
      ["NDL-070", 12],
      ["DET-BW1K", 4],
      ["NMK-ALU40", 3],
    ],
  },
  {
    id: 1039,
    retailer: 2,
    by: "ravi_sales",
    daysAgo: 15,
    status: "delivered",
    deliveredDaysAgo: 14,
    items: [
      ["TEA-AG250", 4],
      ["NDL-070", 10],
      ["SOP-NEEM", 1],
    ],
  },
  {
    id: 1040,
    retailer: 6,
    by: "priya_sales",
    daysAgo: 9,
    status: "delivered",
    deliveredDaysAgo: 8,
    items: [
      ["BIS-CRM", 3],
      ["BEV-MNG200", 6],
    ],
  },
  {
    id: 1041,
    retailer: 1,
    by: "ravi_sales",
    daysAgo: 6,
    status: "delivered",
    deliveredDaysAgo: 5,
    items: [
      ["TEA-KE250", 2],
      ["SOP-NEEM", 1],
      ["NMK-KM40", 2],
    ],
  },
  {
    id: 1042,
    retailer: 7,
    by: "priya_sales",
    daysAgo: 15,
    status: "rejected",
    items: [["PST-HB100", 10]],
    note: "Pehle purana payment clear karo",
  },
  {
    id: 1043,
    retailer: 8,
    by: "priya_sales",
    daysAgo: 10,
    status: "cancelled",
    items: [["BIS-GLU", 2]],
    note: "Party ne mana kar diya",
  },
  {
    id: 1044,
    retailer: 6,
    by: "priya_sales",
    daysAgo: 1,
    status: "dispatched",
    items: [
      ["NDL-140", 2],
      ["NMK-ALU40", 2],
    ],
  },
  {
    id: 1045,
    retailer: 4,
    by: "ravi_sales",
    daysAgo: 1,
    status: "packed",
    items: [
      ["DET-LS1K", 2],
      ["SOP-NEEM", 1],
    ],
  },
];

export const SEED_PAYMENTS: [
  retailer: number,
  rupees: number,
  mode: "cash" | "upi" | "cheque",
  daysAgo: number,
  by: string,
][] = [
  [1, 12000, "upi", 25, "ravi_sales"],
  [1, 8000, "cash", 9, "ravi_sales"],
  [2, 15000, "upi", 10, "ravi_sales"],
  [3, 5000, "cheque", 30, "priya_sales"],
  [6, 6000, "upi", 4, "priya_sales"],
  [7, 9000, "upi", 3, "priya_sales"],
];

export const FIRST_DEMO_BILL = 12; // INV-2026-0012

function stamp(daysAgo: number, hour = 11): string {
  const d = new Date(`${addDays(today(), -daysAgo)}T00:00:00Z`);
  d.setUTCHours(hour - 5, 30); // hh:00 IST expressed in UTC
  return sqlTimestamp(d);
}

/** Wipes and reseeds. Returns row counts for the setup log and tests. */
export function seed(db: DB): Record<string, number> {
  resetSchema(db);
  const t = today();

  db.transaction(() => {
    const insUser = db.prepare("INSERT INTO users (handle, display_name, role) VALUES (?, ?, ?)");
    for (const u of SEED_USERS) insUser.run(u.handle, u.display_name, u.role);
    const userId = (h: string) =>
      (db.prepare("SELECT id FROM users WHERE handle = ?").get(h) as { id: number }).id;

    const insR = db.prepare(
      "INSERT INTO retailers (id, code, name, area, credit_limit, credit_days, outstanding) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const insRA = db.prepare("INSERT INTO retailer_aliases (retailer_id, alias) VALUES (?, ?)");
    SEED_RETAILERS.forEach((r, i) => {
      const id = i + 1;
      insR.run(
        id,
        `R-${String(id).padStart(4, "0")}`,
        r.name,
        r.area,
        R(r.limit),
        r.days ?? 21,
        R(r.outstanding ?? 0),
      );
      for (const a of r.aliases ?? []) insRA.run(id, a);
    });

    const insP = db.prepare(
      "INSERT INTO products (id, sku, name, case_size, case_price, gst_pct, scheme) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const insPA = db.prepare("INSERT INTO product_aliases (product_id, alias) VALUES (?, ?)");
    const insS = db.prepare(
      "INSERT INTO stock (product_id, on_hand, reserved, avg_daily_cases) VALUES (?, ?, 0, ?)",
    );
    const sku = new Map<
      string,
      { id: number; price: number; gst: number; scheme?: SeedProduct["scheme"] }
    >();
    SEED_PRODUCTS.forEach((p, i) => {
      const id = i + 1;
      insP.run(
        id,
        p.sku,
        p.name,
        p.caseSize,
        R(p.casePrice),
        p.gst,
        p.scheme ? JSON.stringify(p.scheme) : null,
      );
      for (const a of p.aliases) insPA.run(id, a);
      insS.run(id, p.onHand, p.avgDaily);
      sku.set(p.sku, { id, price: R(p.casePrice), gst: p.gst, scheme: p.scheme });
    });

    const insO = db.prepare(`INSERT INTO orders
      (id, retailer_id, status, created_by, approved_by, decision_note, subtotal, tax, total, bill_no,
       confirmed_at, delivered_at, due_date, room_id, source_message_id, created_at, updated_at)
      VALUES (@id, @retailer_id, @status, @created_by, @approved_by, @decision_note, @subtotal, @tax, @total, @bill_no,
       @confirmed_at, @delivered_at, @due_date, 'seed', @msg, @created_at, @updated_at)`);
    const insI = db.prepare(`INSERT INTO order_items
      (order_id, product_id, qty_requested, qty_confirmed, qty_free, unit_price) VALUES (?, ?, ?, ?, ?, ?)`);
    const reserve = db.prepare("UPDATE stock SET reserved = reserved + ? WHERE product_id = ?");

    // Billed historical orders take INV-2026-0004 … 0011; the counter then sits at 11.
    let billNo = FIRST_DEMO_BILL - SEED_ORDERS.filter((o) => isBilled(o.status)).length;
    for (const o of SEED_ORDERS) {
      const billed = isBilled(o.status);
      const lines = o.items.map(([code, qty]) => {
        const p = sku.get(code);
        if (!p) throw new Error(`seed: unknown sku ${code}`);
        const free = billed && p.scheme ? Math.floor(qty / p.scheme.buy) * p.scheme.free : 0;
        return { p, qty, free };
      });
      const totals = computeTotals(
        lines.map((l) => ({ qty: l.qty, unitPrice: l.p.price, gstPct: l.p.gst })),
      );
      const delivered = o.deliveredDaysAgo !== undefined ? addDays(t, -o.deliveredDaysAgo) : null;
      const retailer = SEED_RETAILERS[o.retailer - 1];
      insO.run({
        id: o.id,
        retailer_id: o.retailer,
        status: o.status,
        created_by: userId(o.by),
        approved_by: o.status === "rejected" ? userId("amit_manager") : null,
        decision_note: o.note ?? null,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        bill_no: billed ? `INV-2026-${String(billNo++).padStart(4, "0")}` : null,
        confirmed_at: billed ? stamp(o.daysAgo, 12) : null,
        delivered_at: delivered,
        due_date: delivered ? addDays(delivered, retailer?.days ?? 21) : null,
        msg: `seed-${o.id}`,
        created_at: stamp(o.daysAgo, 10),
        updated_at: stamp(o.deliveredDaysAgo ?? o.daysAgo, 17),
      });
      for (const l of lines) {
        insI.run(o.id, l.p.id, l.qty, billed ? l.qty : null, l.free, l.p.price);
        // Confirmed/packed orders still hold their reservation; dispatched+ already left the godown.
        if (o.status === "confirmed" || o.status === "packed") reserve.run(l.qty + l.free, l.p.id);
      }
    }
    db.prepare("INSERT INTO counters (name, value) VALUES ('bill', ?)").run(FIRST_DEMO_BILL - 1);
    db.prepare("INSERT INTO counters (name, value) VALUES ('order', ?)").run(
      Math.max(...SEED_ORDERS.map((o) => o.id)),
    );

    const insPay = db.prepare(
      "INSERT INTO payments (retailer_id, amount, mode, recorded_by, source_message_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    SEED_PAYMENTS.forEach(([r, amt, mode, daysAgo, by], i) => {
      insPay.run(r, R(amt), mode, userId(by), `seed-pay-${i + 1}`, stamp(daysAgo, 16));
    });
  })();

  return counts(db);
}

function isBilled(s: Status): boolean {
  return s === "delivered" || s === "dispatched" || s === "packed" || s === "confirmed";
}

export function counts(db: DB): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of [
    "users",
    "retailers",
    "products",
    "stock",
    "orders",
    "order_items",
    "payments",
  ]) {
    out[t] = (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  }
  return out;
}
