// LLD §7. Refusals are normal results the agent relays; only VALIDATION/INTERNAL/NOT_FOUND are tool errors.

export type ErrorCode =
  | "VALIDATION"
  | "INTERNAL"
  | "NOT_FOUND"
  | "UNKNOWN_ACTOR"
  | "FORBIDDEN_ROLE"
  | "PREVENT_NON_CREATOR"
  | "INVALID_TRANSITION"
  | "AMBIGUOUS_MATCH"
  | "NO_MATCH"
  | "INSUFFICIENT_STOCK"
  | "RATE_LIMITED"
  | "IDEMPOTENCY_CONFLICT"
  | "ALREADY_REGISTERED"
  | "UNSTAMPED"
  | "VOICE_UNAVAILABLE";

export const TOOL_ERROR_CODES: ReadonlySet<ErrorCode> = new Set([
  "VALIDATION",
  "INTERNAL",
  "NOT_FOUND",
]);

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  next_step: string;
  details?: Record<string, unknown>;
}

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly nextStep: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }

  toBody(): ErrorBody {
    return {
      code: this.code,
      message: this.message,
      next_step: this.nextStep,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export type Envelope<T> =
  | { ok: true; data: T; idempotent?: boolean }
  | { ok: false; error: ErrorBody };

export function isToolError(e: Envelope<unknown>): boolean {
  return !e.ok && TOOL_ERROR_CODES.has(e.error.code);
}

export const notFound = (what: string, id: unknown) =>
  new DomainError(
    "NOT_FOUND",
    `${what} ${String(id)} not found`,
    `Check the ${what} id and try again.`,
  );

export const validation = (message: string, nextStep = "Fix the input and call again.") =>
  new DomainError("VALIDATION", message, nextStep);
