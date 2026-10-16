// Orchestrates one analysis:
//   1. profile the new request (LLM -> structured fields)
//   2. retrieve similar past cases (hybrid ranking, see search.ts)
//   3. compute differences with rules (diff.ts)
//   4. write the briefing (LLM), grounded only in the retrieved cases
//   5. verify every citation against the library and drop anything unsupported
//
// The model never decides WHAT is similar or WHETHER there is a precedent: code does.
// The model only explains, plans and summarises, and must cite.

import { briefingKey, getBriefing, getProfile, putBriefing, putProfile } from "./cache.ts";
import { CASES, getCase } from "./cases.ts";
import { compare } from "./diff.ts";
import { getVotes } from "./feedback.ts";
import { chatJson, embed } from "./llm.ts";
import { rank, verdictFor } from "./search.ts";
import type { AnalyzeResult, Briefing, Cited, Difference, PastCase, RequestProfile, Risk, WorkType } from "./types.ts";

const WORK_TYPES: WorkType[] = [
  "Data migration",
  "SSO & provisioning",
  "Integration",
  "Reporting",
  "Performance",
  "Onboarding & templates",
];
const KNOWN_SYSTEMS = [...new Set(CASES.flatMap((c) => c.attributes.systems))];
const TOP_FOR_BRIEFING = 3;

export async function analyze(requestText: string): Promise<AnalyzeResult> {
  const t: Record<string, number> = {};
  const time = async <T>(label: string, fn: () => Promise<T>) => {
    const s = Date.now();
    try {
      return await fn();
    } finally {
      t[label] = Date.now() - s;
    }
  };

  const { profile, matches, verdict, model: m1, cachedProfile } = await time("retrieve", () =>
    retrieve(requestText),
  );
  const top = matches.slice(0, TOP_FOR_BRIEFING).map((m) => getCase(m.caseId)!);

  // Rule-based differences against the closest case.
  const ruleDiffs = verdict === "no precedent" ? [] : compare(profile, top[0]);

  const key = briefingKey(requestText, top.map((c) => c.id));
  let written = getBriefing(key);
  const cachedBriefing = Boolean(written);
  if (!written) {
    written = await time("briefing", () => writeBriefing(requestText, profile, verdict, top, ruleDiffs));
    putBriefing(key, written);
  }
  // Rules are cheap and may have changed since the briefing was cached: recompute.
  const briefing = {
    ...written.briefing,
    verdict,
    differences: [...ruleDiffs, ...written.briefing.differences.filter((d) => d.source === "ai")],
  };

  return {
    profile,
    matches,
    briefing,
    droppedCitations: written.dropped,
    timingsMs: t,
    model: written.model || m1,
    cached: cachedProfile && cachedBriefing,
  };
}

// Steps 1-2 only (no briefing). Used by the eval script too.
export async function retrieve(requestText: string) {
  let hit = getProfile(requestText);
  const cachedProfile = Boolean(hit);
  const votesP = getVotes();
  if (!hit) {
    const [{ profile, model }, [vector]] = await Promise.all([profileRequest(requestText), embed([requestText])]);
    hit = { profile, vector, model };
    putProfile(requestText, hit);
  }
  const matches = rank(hit.profile, requestText, hit.vector, await votesP);
  return { profile: hit.profile, matches, verdict: verdictFor(matches), model: hit.model, cachedProfile };
}

// ---------- step 1: profile ----------

async function profileRequest(text: string) {
  const { data, model } = await chatJson<RequestProfile>([
    {
      role: "system",
      content: `You turn a client request into structured fields for a professional-services team at Kestrel, a B2B workflow software company.
Return JSON with exactly these keys:
- summary: one sentence, plain English
- type: one of ${JSON.stringify([...WORK_TYPES, "Other"])}
- systems: third-party systems named or clearly implied. Prefer these spellings when they match: ${JSON.stringify(KNOWN_SYSTEMS)}. Empty array if none.
- volume: number of records/users/documents if stated (number only), else null
- volumeUnit: unit for volume, else null
- deadlineDays: working days available if stated or inferable (2 weeks = 10), else null
- languages: human languages of the data if mentioned or implied by offices/countries (e.g. an office in Hanoi implies Vietnamese), else null
- region: client region or data residency requirement if mentioned, else null
- tags: 3 to 8 short lowercase topic tags (e.g. "deduplication", "scim", "encoding")
Never invent numbers that are not in the text.`,
    },
    { role: "user", content: text },
  ]);
  const p: RequestProfile = {
    summary: String(data.summary ?? ""),
    type: (WORK_TYPES as string[]).includes(data.type) ? data.type : "Other",
    systems: Array.isArray(data.systems) ? data.systems.map(String) : [],
    volume: num(data.volume),
    volumeUnit: data.volumeUnit ? String(data.volumeUnit) : undefined,
    deadlineDays: num(data.deadlineDays),
    languages: Array.isArray(data.languages) && data.languages.length ? data.languages.map(String) : undefined,
    region: data.region ? String(data.region) : undefined,
    tags: Array.isArray(data.tags) ? data.tags.map((x) => String(x).toLowerCase()).slice(0, 8) : [],
  };
  return { profile: p, model };
}

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : undefined);

// ---------- step 4: briefing ----------

interface RawBriefing {
  headline: string;
  howItWent: Cited[];
  extraDifferences: { dimension: string; before: string; now: string; risk: Risk; note: string; cites?: string[] }[];
  plan: Cited[];
  reuse: { artifact: string; fromCase: string; why: string }[];
  lessons: (Cited & { from: string })[];
  openQuestions: string[];
}

function compactCase(c: PastCase) {
  return {
    id: c.id,
    title: c.title,
    type: c.type,
    client: c.client,
    request: c.request,
    attributes: c.attributes,
    owner: `${c.owner.name} (${c.owner.role}${c.owner.status === "left" ? ", LEFT THE COMPANY" : ""})`,
    team: c.team.map((p) => `${p.name}${p.status === "left" ? " (left)" : ""}`),
    estimateDays: c.estimateDays,
    actualDays: c.actualDays,
    outcome: c.outcome,
    timeline: c.timeline.map((e) => ({ id: e.id, date: e.date, source: e.source, author: e.author, text: e.text })),
    resolution: c.resolution,
    lessons: c.lessons,
    artifacts: c.artifacts.map((a) => `${a.name}: ${a.summary}`),
  };
}

async function writeBriefing(
  request: string,
  profile: RequestProfile,
  verdict: Briefing["verdict"],
  cases: PastCase[],
  ruleDiffs: Difference[],
): Promise<{ briefing: Briefing; dropped: number; model: string }> {
  const { data, model } = await chatJson<RawBriefing>(
    [
      {
        role: "system",
        content: `You are the team's memory. A new client request arrived. You get the most similar PAST CASES from the team's own history (already chosen by a retrieval system) and differences already computed by rules.
Write a briefing that helps whoever picks up the request reuse past work.

Hard rules:
- Use ONLY facts from the past cases provided. Do not use outside knowledge about the client or systems.
- Every item in howItWent, plan, lessons and extraDifferences must have "cites": ids of the cases (e.g. "KST-104") or timeline entries (e.g. "KST-104#3") that support it. Prefer timeline entry ids.
- Verdict from retrieval is "${verdict}". If "no precedent": say clearly in the headline that the team has not done this before, keep howItWent to what partially transfers, and make openQuestions longer.
- Do not repeat the rule-based differences. Add extraDifferences only for things rules could not see (scope, stakeholders, client behaviour), max 3.
- reuse: only artifacts that appear in the provided cases, with the exact artifact name.
- lessons: concrete, from the cases' lessons or timelines. "from" = the person's name if the lesson comes from someone who LEFT THE COMPANY, else the case id.
- Be concise and specific. Numbers and names beat adjectives.

Return JSON:
{
 "headline": "1-2 sentences: closest precedent, how it went, the main thing that is different now",
 "howItWent": [{"text": "...", "cites": ["..."]}],            // 2-4 items
 "extraDifferences": [{"dimension": "...", "before": "...", "now": "...", "risk": "high|medium|low", "note": "...", "cites": ["..."]}],
 "plan": [{"text": "step...", "cites": ["..."]}],              // 4-7 ordered steps for THIS request
 "reuse": [{"artifact": "...", "fromCase": "KST-...", "why": "..."}],
 "lessons": [{"text": "...", "cites": ["..."], "from": "..."}], // 2-5 items
 "openQuestions": ["question to ask the client or team before starting"]  // 2-5 items
}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          newRequest: request,
          requestProfile: profile,
          ruleBasedDifferences: ruleDiffs.map(({ dimension, before, now, note }) => ({ dimension, before, now, note })),
          pastCases: cases.map(compactCase),
        }),
      },
    ],
    { timeoutMs: 90_000 },
  );

  return { ...verify(data, verdict, cases, ruleDiffs), model };
}

// ---------- step 5: verification ----------

// Smaller fallback models sometimes return {"question": "..."} instead of a string.
function asText(x: unknown): string {
  if (typeof x === "string") return x.trim();
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    const v = o.question ?? o.text ?? o.q ?? Object.values(o).find((y) => typeof y === "string");
    return typeof v === "string" ? v.trim() : "";
  }
  return "";
}

function verify(raw: RawBriefing, verdict: Briefing["verdict"], cases: PastCase[], ruleDiffs: Difference[]) {
  const allowed = new Set(cases.flatMap((c) => [c.id, ...c.timeline.map((e) => e.id)]));
  let dropped = 0;

  const cleanCites = (cites: unknown): string[] => {
    const list = Array.isArray(cites) ? cites.map(String) : [];
    const ok = list.filter((id) => allowed.has(id));
    dropped += list.length - ok.length;
    return [...new Set(ok)];
  };
  const keepCited = <T extends { text?: string; cites?: unknown }>(items: T[] = []) =>
    items
      .map((i) => ({ ...i, text: asText(i.text), cites: cleanCites(i.cites) }))
      .filter((i) => {
        if (i.text && i.cites.length) return true;
        dropped++; // an unsupported claim is removed entirely
        return false;
      });

  const people = new Map(cases.flatMap((c) => [c.owner, ...c.team]).map((p) => [p.name, p]));
  const artifacts = new Map(cases.flatMap((c) => c.artifacts.map((a) => [a.name.toLowerCase(), { a, c }])));

  const extra: Difference[] = (raw.extraDifferences ?? []).slice(0, 3).flatMap((d) => {
    const cites = cleanCites(d.cites);
    if (!cites.length) {
      dropped++;
      return [];
    }
    const risk: Risk = ["high", "medium", "low"].includes(d.risk) ? d.risk : "medium";
    return [{ dimension: d.dimension, before: d.before, now: d.now, risk, note: d.note, source: "ai" as const }];
  });

  const briefing: Briefing = {
    verdict,
    headline: asText(raw.headline),
    howItWent: keepCited(raw.howItWent),
    differences: [...ruleDiffs, ...extra],
    plan: keepCited(raw.plan),
    reuse: (raw.reuse ?? []).flatMap((r) => {
      const hit = artifacts.get(String(r.artifact).toLowerCase());
      if (!hit) {
        dropped++;
        return [];
      }
      return [{ artifact: hit.a.name, fromCase: hit.c.id, why: asText(r.why) }];
    }),
    lessons: keepCited(raw.lessons).map((l) => {
      const from = String((l as { from?: string }).from ?? "");
      return { ...l, from, personLeft: people.get(from)?.status === "left" };
    }),
    openQuestions: (raw.openQuestions ?? []).map(asText).filter(Boolean).slice(0, 5),
  };
  return { briefing, dropped };
}
