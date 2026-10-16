// Hybrid retrieval: semantic (embeddings) + keyword (BM25) + structured attributes
// + team feedback. Each signal covers a weakness of the others:
//   - embeddings catch paraphrases ("leavers lose access" ~ "deprovisioning")
//   - BM25 catches exact names the embedding blurs ("SCIM", "NetSuite", "4.12")
//   - attributes encode what a human would check first (same kind of work, same systems)
//   - feedback lets the team correct the ranking over time

import index from "../data/index.json" with { type: "json" };
import { CASES, caseText } from "./cases.ts";
import type { Match, PastCase, RequestProfile } from "./types.ts";

export const WEIGHTS = { semantic: 0.45, keyword: 0.2, attributes: 0.35 };
export const FEEDBACK_MAX_BOOST = 0.12;
// Thresholds calibrated with scripts/eval.ts on the sample requests.
export const THRESHOLDS = { strong: 0.6, partial: 0.42 };

// ---------- keyword (BM25) ----------

const STOP = new Set(
  "a an and are as at be but by can do for from has have in into is it its of on or our so that the their them they this to us we what when will with you your all any need needs want please".split(
    " ",
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t));
}

const docs = CASES.map((c) => tokenize(caseText(c)));
const avgLen = docs.reduce((s, d) => s + d.length, 0) / docs.length;
const df = new Map<string, number>();
for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);

function bm25(query: string[], docIdx: number, k1 = 1.4, b = 0.75) {
  const d = docs[docIdx];
  const tf = new Map<string, number>();
  for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
  let score = 0;
  for (const q of new Set(query)) {
    const f = tf.get(q);
    if (!f) continue;
    const n = df.get(q) ?? 0;
    const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
    score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgLen)));
  }
  return score;
}

// ---------- semantic ----------

const vectors = new Map((index as { entries: { id: string; vector: number[] }[] }).entries.map((e) => [e.id, e.vector]));

function cosine(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Gemini embeddings rarely go below ~0.5 cosine for any two business texts, so
// rescale the useful band [0.55, 0.85] to [0, 1].
function rescaleCosine(c: number) {
  return Math.min(1, Math.max(0, (c - 0.55) / 0.3));
}

// ---------- structured attributes ----------

const lower = (xs: string[] = []) => xs.map((x) => x.toLowerCase());

function overlap(a: string[], b: string[]) {
  const A = new Set(lower(a));
  const B = new Set(lower(b));
  if (!A.size || !B.size) return { score: 0, shared: [] as string[] };
  const shared = [...A].filter((x) => B.has(x));
  return { score: shared.length / Math.min(A.size, B.size), shared };
}

function attributeScore(p: RequestProfile, c: PastCase) {
  const reasons: string[] = [];
  let score = 0;
  if (p.type === c.type) {
    score += 0.45;
    reasons.push(`Same kind of work: ${c.type}`);
  }
  const sys = overlap(p.systems, c.attributes.systems);
  if (sys.shared.length) {
    score += 0.35 * sys.score;
    reasons.push(`Same system: ${sys.shared.join(", ")}`);
  }
  const nonEn = (xs?: string[]) => lower(xs).filter((l) => l !== "english");
  const lang = overlap(nonEn(p.languages), nonEn(c.attributes.languages));
  if (nonEn(p.languages).length && nonEn(c.attributes.languages).length) {
    score += 0.1;
    reasons.push(
      lang.shared.length ? `Same non-English data: ${lang.shared.join(", ")}` : "Also non-English data (encoding risk)",
    );
  }
  const tags = overlap(p.tags, c.attributes.tags);
  if (tags.shared.length) {
    score += 0.1 * Math.min(1, tags.score * 2);
    reasons.push(`Shared topics: ${tags.shared.slice(0, 3).join(", ")}`);
  }
  return { score: Math.min(1, score), reasons };
}

// ---------- ranking ----------

export type Votes = Record<string, number>; // key "<type>|<caseId>" or "*|<caseId>" -> net votes

function feedbackBoost(p: RequestProfile, caseId: string, votes: Votes) {
  const specific = votes[`${p.type}|${caseId}`] ?? 0;
  const general = votes[`*|${caseId}`] ?? 0;
  const net = specific + 0.3 * general;
  return FEEDBACK_MAX_BOOST * Math.tanh(net / 3);
}

export function rank(p: RequestProfile, requestText: string, queryVector: number[], votes: Votes, limit = 5): Match[] {
  const q = tokenize(`${requestText} ${p.systems.join(" ")} ${p.tags.join(" ")}`);
  const raw = CASES.map((c, i) => ({ c, kw: bm25(q, i) }));
  const maxKw = Math.max(...raw.map((r) => r.kw), 1e-9);

  return raw
    .map(({ c, kw }) => {
      const vec = vectors.get(c.id);
      const semantic = vec ? rescaleCosine(cosine(queryVector, vec)) : 0;
      const keyword = kw / maxKw;
      const attr = attributeScore(p, c);
      const feedback = feedbackBoost(p, c.id, votes);
      const score =
        WEIGHTS.semantic * semantic + WEIGHTS.keyword * keyword + WEIGHTS.attributes * attr.score + feedback;
      const matchedOn = [...attr.reasons];
      if (feedback > 0.02) matchedOn.push("Marked useful by the team before");
      if (feedback < -0.02) matchedOn.push("Marked not useful by the team before");
      return {
        caseId: c.id,
        score: Math.max(0, Math.min(1, score)),
        signals: { semantic, keyword, attributes: attr.score, feedback },
        matchedOn,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function verdictFor(matches: Match[]): "strong precedent" | "partial precedent" | "no precedent" {
  const top = matches[0]?.score ?? 0;
  if (top >= THRESHOLDS.strong) return "strong precedent";
  if (top >= THRESHOLDS.partial) return "partial precedent";
  return "no precedent";
}
