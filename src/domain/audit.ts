// LLD §6: one audited, idempotent, rate-limited path for every write.
import { createHash } from "node:crypto";
import type { DB } from "../db/client.js";
import { WRITE_ROLES, type WriteAction } from "./authz.js";
import { now, sqlTimestamp } from "./clock.js";
import { DomainError, type Envelope, TOOL_ERROR_CODES } from "./errors.js";
import { type Actor, forbidden, resolveActor } from "./identity.js";
import { log } from "./log.js";
import { checkRoom } from "./rooms.js";
import { verifyStamp } from "./stamp.js";

export const RATE_LIMIT_PER_MIN = 20;

export interface Stamp {
  actor_handle: string;
  message_id: string;
  room_id: string;
  stamp_sig?: string;
}

export interface WriteCtx {
  db: DB;
  actor: Actor;
  stamp: Stamp;
}

export interface WriteSpec {
  action: WriteAction;
  entity: string;
  entityId?: string | number | null;
  /** What one message may do once per action (defaults to entityId), e.g. one draft per party. */
  scope?: string | number | null;
}

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

/** sha256 over the canonical args, minus the delivery envelope (message/room ids). */
export function requestHash(args: object): string {
  const { message_id: _m, room_id: _r, stamp_sig: _s, ...rest } = args as Record<string, unknown>;
  return createHash("sha256")
    .update(JSON.stringify(canonical(rest)))
    .digest("hex");
}

interface AuditRow {
  actor: Actor | null;
  handle: string;
  spec: WriteSpec;
  stamp: Stamp;
  hash: string;
  scope: string;
  args: object;
  outcome: "ok" | "refused" | "error";
  errorCode?: string | null;
  entityId?: string | number | null;
  before?: unknown;
  after?: unknown;
}

function insertAudit(db: DB, r: AuditRow): void {
  db.prepare(
    `INSERT INTO audit_log (at, actor_id, actor_handle, actor_role, action, entity, entity_id, room_id, message_id,
       request_hash, idem_scope, args_json, outcome, error_code, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sqlTimestamp(now()),
    r.actor?.id ?? null,
    r.actor?.handle ?? r.handle,
    r.actor?.role ?? null,
    r.spec.action,
    r.spec.entity,
    r.entityId != null ? String(r.entityId) : null,
    r.stamp.room_id,
    r.stamp.message_id,
    r.hash,
    r.scope,
    JSON.stringify({ ...(r.args as Record<string, unknown>), stamp_sig: undefined }),
    r.outcome,
    r.errorCode ?? null,
    r.before === undefined ? null : JSON.stringify(r.before),
    r.after === undefined ? null : JSON.stringify(r.after),
  );
  log(r.outcome === "error" ? "error" : "info", "audit", {
    action: r.spec.action,
    actor_handle: r.actor?.handle ?? r.handle,
    role: r.actor?.role ?? null,
    entity_id: r.entityId ?? null,
    outcome: r.outcome,
    error_code: r.errorCode ?? null,
    message_id: r.stamp.message_id,
  });
}

function recentWrites(db: DB, handle: string): number {
  const since = sqlTimestamp(new Date(now().getTime() - 60_000));
  return (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM audit_log WHERE actor_handle = ? COLLATE NOCASE AND at > ?",
      )
      .get(handle, since) as { n: number }
  ).n;
}

export interface WriteResult<T> {
  data: T;
  entityId?: string | number | null;
  before?: unknown;
}

/**
 * Runs `fn` inside an IMMEDIATE transaction after identity, role, rate-limit and idempotency checks.
 * Every call, including refusals, leaves exactly one audit row.
 */
export function runWrite<T, A extends Stamp>(
  db: DB,
  spec: WriteSpec,
  args: A,
  fn: (ctx: WriteCtx) => WriteResult<T>,
): Envelope<T> {
  const stamp: Stamp = {
    actor_handle: args.actor_handle,
    message_id: args.message_id,
    room_id: args.room_id,
  };
  const hash = requestHash(args);
  const scope = String(spec.scope ?? spec.entityId ?? "");
  let actor: Actor | null = null;
  let entityId = spec.entityId ?? null;

  try {
    verifyStamp(spec.action, args);
    actor = resolveActor(db, stamp.actor_handle);
    const allowed = WRITE_ROLES[spec.action] as readonly Actor["role"][];
    if (!allowed.includes(actor.role)) throw forbidden(db, actor, spec.action, [...allowed]);
    checkRoom(db, actor, stamp.room_id);
    if (recentWrites(db, actor.handle) >= RATE_LIMIT_PER_MIN) {
      throw new DomainError(
        "RATE_LIMITED",
        `More than ${RATE_LIMIT_PER_MIN} writes in a minute from ${actor.handle}`,
        "Thoda ruk ke phir se bhejo — ek minute mein bahut zyada actions ho gaye.",
      );
    }
    const a = actor;
    const out = db
      .transaction((): Envelope<T> => {
        const prior = db
          .prepare(
            "SELECT request_hash, after_json FROM audit_log WHERE message_id = ? AND action = ? AND idem_scope = ? AND outcome = 'ok'",
          )
          .get(stamp.message_id, spec.action, scope) as
          | { request_hash: string; after_json: string }
          | undefined;
        if (prior) {
          if (prior.request_hash === hash) {
            return { ok: true, data: JSON.parse(prior.after_json) as T, idempotent: true };
          }
          throw new DomainError(
            "IDEMPOTENCY_CONFLICT",
            `message ${stamp.message_id} already did ${spec.action} with different input`,
            "Yeh message pehle hi process ho chuka hai. Naya message bhejo.",
          );
        }
        const res = fn({ db, actor: a, stamp });
        entityId = res.entityId ?? entityId;
        insertAudit(db, {
          actor: a,
          handle: a.handle,
          spec,
          stamp,
          hash,
          scope,
          args,
          outcome: "ok",
          entityId,
          before: res.before,
          after: res.data,
        });
        return { ok: true, data: res.data };
      })
      .immediate();
    return out;
  } catch (e) {
    const err =
      e instanceof DomainError
        ? e
        : new DomainError(
            "INTERNAL",
            "Unexpected error",
            "Kuch gadbad hui. Manager ko batao; dobara try karo.",
          );
    if (!(e instanceof DomainError))
      log("error", "internal", { action: spec.action, error: String(e) });
    insertAudit(db, {
      actor,
      handle: stamp.actor_handle,
      spec,
      stamp,
      hash,
      scope,
      args,
      outcome: TOOL_ERROR_CODES.has(err.code) ? "error" : "refused",
      errorCode: err.code,
      entityId,
    });
    return { ok: false, error: err.toBody() };
  }
}

export const ALL_ROLES: readonly Actor["role"][] = ["salesman", "manager", "godown", "delivery"];

/** Read-side gate: a stamped, registered sender with one of `roles`, in a room that role may use. */
export function requireRole(
  db: DB,
  a: { actor_handle: string; message_id?: string; room_id?: string; stamp_sig?: string },
  roles: readonly Actor["role"][],
  tool: string,
  label = tool,
): Actor {
  verifyStamp(tool, a);
  const actor = resolveActor(db, a.actor_handle);
  if (!roles.includes(actor.role)) throw forbidden(db, actor, label, [...roles]);
  checkRoom(db, actor, a.room_id);
  return actor;
}
