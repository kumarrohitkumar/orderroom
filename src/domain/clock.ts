// One place for "now" so tests and the demo seed are deterministic.
// ORDERROOM_NOW (ISO string) pins the clock; otherwise the real time is used.
// Business dates are calendar days in India (Asia/Kolkata).

const IST_OFFSET_MIN = 330;

export function now(): Date {
  const pinned = process.env.ORDERROOM_NOW;
  return pinned ? new Date(pinned) : new Date();
}

/** YYYY-MM-DD in IST for the given instant. */
export function istDate(d: Date = now()): string {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function today(): string {
  return istDate(now());
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** SQLite-style UTC timestamp "YYYY-MM-DD HH:MM:SS" for an instant. */
export function sqlTimestamp(d: Date = now()): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** IST calendar day of a stored UTC timestamp "YYYY-MM-DD HH:MM:SS". */
export function istDayOf(ts: string): string {
  return istDate(new Date(`${ts.replace(" ", "T")}Z`));
}

/** SQL expression: IST calendar day of a UTC timestamp column. */
export const istDaySql = (col: string) => `date(${col}, '+330 minutes')`;
