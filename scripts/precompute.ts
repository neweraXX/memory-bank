// Precompute profiles + briefings for the sample requests into data/precomputed.json,
// so the hosted demo answers them instantly without spending API quota.
//   npm run precompute
// Paced to stay under Gemini free-tier limits (5 requests/minute/model).

import { loadEnvFile } from "node:process";
import { readFileSync, writeFileSync } from "node:fs";

try {
  loadEnvFile(".env.local");
} catch {}

const { analyze } = await import("../lib/analyze.ts");
const { dumpRuntime } = await import("../lib/cache.ts");
const samples: { label: string; text: string }[] = JSON.parse(readFileSync("data/samples.json", "utf8"));
const existing = JSON.parse(readFileSync("data/precomputed.json", "utf8"));

for (const [i, s] of samples.entries()) {
  if (i) await new Promise((r) => setTimeout(r, 25_000));
  const r = await analyze(s.text);
  console.log(
    `${s.label}: ${r.briefing.verdict}, top ${r.matches[0].caseId}, ${r.briefing.plan.length} plan steps, ` +
      `${r.droppedCitations} citations dropped, ${r.cached ? "cached" : `${Object.values(r.timingsMs).reduce((a, b) => a + b, 0)} ms`}`,
  );
}

const fresh = dumpRuntime();
const out = {
  profiles: { ...existing.profiles, ...fresh.profiles },
  briefings: { ...existing.briefings, ...fresh.briefings },
};
writeFileSync("data/precomputed.json", JSON.stringify(out));
console.log(`Saved ${Object.keys(out.profiles).length} profiles, ${Object.keys(out.briefings).length} briefings`);
