// Retrieval eval: does the right past case come first, and is the precedent
// verdict right (including saying "no precedent" when there is none)?
//   npm run eval

import { loadEnvFile } from "node:process";
import { readFileSync } from "node:fs";

try {
  loadEnvFile(".env.local");
} catch {}

const { retrieve } = await import("../lib/analyze.ts");
const samples: { label: string; text: string; expectTop: string[]; expectVerdict: string }[] = JSON.parse(
  readFileSync("data/samples.json", "utf8"),
);

let hits = 0;
let verdictOk = 0;
for (const s of samples) {
  const r = await retrieve(s.text);
  const top = r.matches[0];
  const hit = s.expectTop.length === 0 ? true : s.expectTop.includes(top.caseId);
  const vOk = r.verdict === s.expectVerdict;
  hits += hit ? 1 : 0;
  verdictOk += vOk ? 1 : 0;
  console.log(
    `${hit ? "✓" : "✗"} ${vOk ? "✓" : "✗"}  ${s.label}\n     top: ${r.matches
      .slice(0, 3)
      .map((m) => `${m.caseId} ${m.score.toFixed(2)} (sem ${m.signals.semantic.toFixed(2)} kw ${m.signals.keyword.toFixed(2)} attr ${m.signals.attributes.toFixed(2)})`)
      .join(" | ")}\n     verdict: ${r.verdict} (expected ${s.expectVerdict}); type: ${r.profile.type}; systems: ${r.profile.systems.join(", ")}`,
  );
}
console.log(`\nTop-1 hit: ${hits}/${samples.length}   Verdict: ${verdictOk}/${samples.length}`);
