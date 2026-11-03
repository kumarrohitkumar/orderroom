// LLD §5.7: free text from chat is untrusted. Bound it, strip control characters, label it on output.
import { validation } from "./errors.js";

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;
export const HANDLE_RE = /^@?[A-Za-z0-9_.-]{2,64}$/;

export function cleanText(
  value: string | undefined | null,
  field: string,
  max = 200,
): string | null {
  if (value === undefined || value === null) return null;
  const s = value.replace(CONTROL, "").replace(/\s+/g, " ").trim();
  if (s.length === 0) return null;
  if (s.length > max) throw validation(`${field} is longer than ${max} characters`);
  return s;
}

export function normalizeHandle(handle: string): string {
  const h = handle.trim().replace(/^@/, "");
  if (!HANDLE_RE.test(h)) throw validation(`"${handle}" is not a valid chat handle`);
  return h.toLowerCase();
}
