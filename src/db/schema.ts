// Authoritative schema (LLD §3). Kept as a TS string so `tsc` ships it in dist/ with no copy step.
// Changes from LLD v2: orders.delivered_at ("oldest due days" = age of the oldest unpaid bill)
// and orders.confirmed_at (DSR counts bills cut per day).
// v2: rooms (office vs field), payments.status (salesman cash waits for a manager), audit idem_scope.

export const SCHEMA_VERSION = 2;

export const SCHEMA_SQL = `
CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  handle         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  participant_id TEXT UNIQUE,
  display_name   TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('salesman','manager','godown','delivery')),
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE retailers (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  area          TEXT NOT NULL,
  credit_limit  INTEGER NOT NULL,
  credit_days   INTEGER NOT NULL DEFAULT 21,
  outstanding   INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE retailer_aliases (
  retailer_id INTEGER NOT NULL REFERENCES retailers(id),
  alias       TEXT NOT NULL,
  PRIMARY KEY (retailer_id, alias)
);

CREATE TABLE products (
  id          INTEGER PRIMARY KEY,
  sku         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  case_size   INTEGER NOT NULL,
  case_price  INTEGER NOT NULL,
  gst_pct     INTEGER NOT NULL CHECK (gst_pct IN (0,5,12,18,28)),
  scheme      TEXT,
  active      INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE product_aliases (
  product_id INTEGER NOT NULL REFERENCES products(id),
  alias      TEXT NOT NULL,
  PRIMARY KEY (product_id, alias)
);

CREATE TABLE stock (
  product_id      INTEGER PRIMARY KEY REFERENCES products(id),
  on_hand         INTEGER NOT NULL CHECK (on_hand >= 0),
  reserved        INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand),
  avg_daily_cases REAL NOT NULL DEFAULT 1
);

CREATE TABLE orders (
  id                INTEGER PRIMARY KEY,
  retailer_id       INTEGER NOT NULL REFERENCES retailers(id),
  status            TEXT NOT NULL CHECK (status IN ('awaiting_confirmation','needs_approval','confirmed','packed','dispatched','delivered','returned','rejected','cancelled')),
  approval_reasons  TEXT,
  created_by        INTEGER NOT NULL REFERENCES users(id),
  approved_by       INTEGER REFERENCES users(id),
  decision_note     TEXT,
  return_reason     TEXT CHECK (return_reason IN ('damage','expiry','wrong_sku','refused') OR return_reason IS NULL),
  subtotal          INTEGER NOT NULL DEFAULT 0,
  tax               INTEGER NOT NULL DEFAULT 0,
  total             INTEGER NOT NULL DEFAULT 0,
  bill_no           TEXT UNIQUE,
  bill_path         TEXT,
  confirmed_at      TEXT,
  delivered_at      TEXT,
  due_date          TEXT,
  room_id           TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX orders_status_idx ON orders(status);
CREATE INDEX orders_retailer_idx ON orders(retailer_id);

CREATE TABLE order_items (
  order_id        INTEGER NOT NULL REFERENCES orders(id),
  product_id      INTEGER NOT NULL REFERENCES products(id),
  qty_requested   INTEGER NOT NULL CHECK (qty_requested > 0),
  qty_confirmed   INTEGER,
  qty_free        INTEGER NOT NULL DEFAULT 0,
  qty_backordered INTEGER NOT NULL DEFAULT 0,
  unit_price      INTEGER NOT NULL,
  PRIMARY KEY (order_id, product_id)
);

CREATE TABLE payments (
  id                INTEGER PRIMARY KEY,
  retailer_id       INTEGER NOT NULL REFERENCES retailers(id),
  amount            INTEGER NOT NULL CHECK (amount > 0),
  mode              TEXT NOT NULL CHECK (mode IN ('cash','upi','cheque','bank')),
  reference         TEXT,
  recorded_by       INTEGER NOT NULL REFERENCES users(id),
  status            TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('pending','verified','rejected')),
  verified_by       INTEGER REFERENCES users(id),
  verified_at       TEXT,
  source_message_id TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Manager and godown act only from an office room. The first office-role call binds the office
-- room if none is bound yet (install time); npm run bind-room changes it.
CREATE TABLE rooms (
  room_id    TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('office','field')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY,
  at           TEXT NOT NULL DEFAULT (datetime('now')),
  actor_id     INTEGER REFERENCES users(id),
  actor_handle TEXT,
  actor_role   TEXT,
  action       TEXT NOT NULL,
  tool_version INTEGER NOT NULL DEFAULT 1,
  entity       TEXT NOT NULL,
  entity_id    TEXT,
  room_id      TEXT,
  message_id   TEXT,
  request_hash TEXT,
  idem_scope   TEXT NOT NULL DEFAULT '',
  args_json    TEXT,
  outcome      TEXT NOT NULL CHECK (outcome IN ('ok','refused','error')),
  error_code   TEXT,
  before_json  TEXT,
  after_json   TEXT
);
CREATE UNIQUE INDEX audit_idem_idx ON audit_log(message_id, action, idem_scope) WHERE outcome = 'ok';
CREATE INDEX audit_actor_time_idx ON audit_log(actor_handle, at);

CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
`;

export const TABLES = [
  "audit_log",
  "rooms",
  "payments",
  "order_items",
  "orders",
  "stock",
  "product_aliases",
  "products",
  "retailer_aliases",
  "retailers",
  "users",
  "counters",
] as const;
