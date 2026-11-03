// LLD §9. Fuzzy match party and product names typed in Hinglish chat.

const STOP = new Set([
  "store",
  "general",
  "ji",
  "bhai",
  "wale",
  "wala",
  "ka",
  "ko",
  "ke",
  "ki",
  "the",
  "shop",
  "kirana",
  "se",
  "aur",
  "and",
  "&",
  "peti",
  "case",
  "cases",
  "carton",
  "box",
  "do",
  "bhejo",
]);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

function trigrams(t: string): Set<string> {
  const p = `  ${t} `;
  const out = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}

/** Dice coefficient over padded trigrams, 0..1. */
export function trigramSim(a: string, b: string): number {
  if (a === b) return 1;
  const A = trigrams(a);
  const B = trigrams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/** How well query tokens are covered by a field's tokens (fuzzy per token), blended with Jaccard. */
function fieldScore(q: string[], f: string[]): number {
  if (q.length === 0 || f.length === 0) return 0;
  if (q.join(" ") === f.join(" ")) return 1;
  let covered = 0;
  for (const qt of q) {
    let best = 0;
    for (const ft of f) best = Math.max(best, qt === ft ? 1 : trigramSim(qt, ft));
    covered += best >= 0.6 ? best : 0;
  }
  const containment = covered / q.length;
  const fs = new Set(f);
  const inter = q.filter((t) => fs.has(t)).length;
  const jaccard = inter / new Set([...q, ...f]).size;
  return Math.min(0.99, 0.75 * containment + 0.25 * jaccard);
}

export interface Candidate<T> {
  item: T;
  fields: string[]; // name, aliases, "name area"
}

export type Confidence = "high" | "medium" | "low";

export interface Match<T> {
  item: T;
  score: number;
  confidence: Confidence;
}

export interface MatchResult<T> {
  status: "unique" | "ambiguous" | "none";
  matches: Match<T>[];
}

export function rank<T>(query: string, cands: Candidate<T>[], limit = 3): MatchResult<T> {
  const q = tokens(query);
  const scored = cands
    .map((c) => ({
      item: c.item,
      score: Math.max(0, ...c.fields.map((f) => fieldScore(q, tokens(f)))),
    }))
    .filter((m) => m.score >= 0.45)
    .sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);
  const best = top[0]?.score ?? 0;
  const second = top[1]?.score ?? 0;
  const exactCount = scored.filter((m) => m.score === 1).length;
  const unique = (best === 1 && exactCount === 1) || (best >= 0.85 && second < 0.6);
  const conf = (s: number, i: number): Confidence =>
    i === 0 && unique ? "high" : s >= 0.6 ? "medium" : "low";
  return {
    status: top.length === 0 ? "none" : unique ? "unique" : "ambiguous",
    matches: top.map((m, i) => ({
      ...m,
      score: Math.round(m.score * 100) / 100,
      confidence: conf(m.score, i),
    })),
  };
}
