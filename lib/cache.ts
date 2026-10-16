// Two-level cache for the expensive, deterministic-enough LLM steps.
//   - data/precomputed.json: built by `npm run precompute` for the sample requests,
//     so the demo works instantly and does not burn the free-tier quota.
//   - an in-process Map for anything else seen during the life of the server.
// Ranking is never cached: it must react to new team feedback immediately.
// Briefings are keyed by the request AND the top cases, so if feedback changes
// which cases come first, a fresh briefing is written for the new ranking.

import { createHash } from "node:crypto";
import precomputed from "../data/precomputed.json" with { type: "json" };
import type { Briefing, RequestProfile } from "./types.ts";

export interface CachedProfile {
  profile: RequestProfile;
  vector: number[];
  model: string;
}
export interface CachedBriefing {
  briefing: Briefing;
  dropped: number;
  model: string;
}

interface Store {
  profiles: Record<string, CachedProfile>;
  briefings: Record<string, CachedBriefing>;
}

const file = precomputed as unknown as Store;
const runtime: Store = { profiles: {}, briefings: {} };

export const hashText = (text: string) =>
  createHash("sha256").update(text.trim().replace(/\s+/g, " ").toLowerCase()).digest("hex").slice(0, 20);

export const briefingKey = (text: string, caseIds: string[]) => `${hashText(text)}|${caseIds.join(",")}`;

export function getProfile(text: string): CachedProfile | undefined {
  const k = hashText(text);
  return runtime.profiles[k] ?? file.profiles?.[k];
}
export function putProfile(text: string, v: CachedProfile) {
  runtime.profiles[hashText(text)] = v;
}

export function getBriefing(key: string): CachedBriefing | undefined {
  return runtime.briefings[key] ?? file.briefings?.[key];
}
export function putBriefing(key: string, v: CachedBriefing) {
  runtime.briefings[key] = v;
}

// Used by the precompute script to dump what was computed in this process.
export function dumpRuntime(): Store {
  return runtime;
}
