// LLD §8. The handle arrives stamped by the PreToolUse hook from the Switch header; the model cannot pick it.
import type { DB } from "../db/client.js";
import { DomainError } from "./errors.js";
import { HANDLE_RE } from "./sanitize.js";

export type Role = "salesman" | "manager" | "godown" | "delivery";

export interface Actor {
  id: number;
  handle: string;
  display_name: string;
  role: Role;
}

export function resolveActor(db: DB, rawHandle: string | undefined): Actor {
  const handle = (rawHandle ?? "").trim().replace(/^@/, "");
  if (!handle || !HANDLE_RE.test(handle)) {
    throw new DomainError(
      "UNKNOWN_ACTOR",
      "Sender could not be identified",
      "Aapka account OrderRoom mein registered nahi hai. Manager likhe: @desk register <handle> as salesman.",
    );
  }
  const row = db
    .prepare(
      "SELECT id, handle, display_name, role FROM users WHERE handle = ? COLLATE NOCASE AND active = 1",
    )
    .get(handle) as Actor | undefined;
  if (!row) {
    throw new DomainError(
      "UNKNOWN_ACTOR",
      `${handle} is not registered`,
      `${handle} OrderRoom mein registered nahi hai. Manager likhe: @desk register ${handle} as salesman.`,
      { handle },
    );
  }
  return row;
}

export function handlesWithRole(db: DB, role: Role): string[] {
  return (
    db.prepare("SELECT handle FROM users WHERE role = ? AND active = 1 ORDER BY id").all(role) as {
      handle: string;
    }[]
  ).map((r) => r.handle);
}

const ROLE_HI: Record<Role, string> = {
  salesman: "salesman",
  manager: "manager",
  godown: "godown",
  delivery: "delivery",
};

export function forbidden(db: DB, actor: Actor, action: string, allowed: Role[]): DomainError {
  const who = allowed.flatMap((r) => handlesWithRole(db, r));
  const roles = allowed.map((r) => ROLE_HI[r]).join(" / ");
  return new DomainError(
    "FORBIDDEN_ROLE",
    `${actor.handle} (${actor.role}) cannot ${action}`,
    `Sirf ${roles} yeh kar sakta hai. Role account se aata hai, message se nahi.${who.length ? ` Tag: ${who.join(", ")}` : ""}`,
    { actor_role: actor.role, allowed_roles: allowed, tag_handles: who },
  );
}
