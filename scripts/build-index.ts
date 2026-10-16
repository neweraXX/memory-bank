// Precompute one embedding per case and write data/index.json.
// Run after editing data/cases.json:  npm run index
// (Node >= 22.6 runs this TypeScript file directly.)

import { writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createHash } from "node:crypto";

try {
  loadEnvFile(".env.local");
} catch {
  /* env may come from the shell instead */
}

const { CASES, caseText } = await import("../lib/cases.ts");
const { embed } = await import("../lib/llm.ts");
const { env } = await import("../lib/env.ts");

const texts = CASES.map(caseText);
const vectors = await embed(texts);

const index = {
  model: env().embedModel,
  dimensions: env().embedDimensions,
  builtAt: new Date().toISOString(),
  entries: CASES.map((c, i) => ({
    id: c.id,
    textHash: createHash("sha256").update(texts[i]).digest("hex").slice(0, 16),
    // 5 decimals is plenty for cosine similarity and keeps the file small
    vector: vectors[i].map((x) => Math.round(x * 1e5) / 1e5),
  })),
};

writeFileSync("data/index.json", JSON.stringify(index));
console.log(`Indexed ${index.entries.length} cases (${index.model}, ${index.dimensions} dims)`);
