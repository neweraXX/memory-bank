// Team feedback ("this past case was / wasn't useful for this kind of request").
// Stored as net vote counters per (work type, case) so the ranking learns which
// precedents actually help. Backends:
//   - Upstash Redis (REST) when UPSTASH_* env vars are set (production)
//   - a local JSON file in development
//   - process memory as a last resort (serverless without Redis: resets on cold start)

import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./env.ts";
import type { Votes } from "./search.ts";

const KEY = "memorybank:votes";
const FILE = path.join(process.cwd(), "data", "feedback.local.json");
let memory: Votes = {};

export type FeedbackBackend = "redis" | "file" | "memory";

export function backend(): FeedbackBackend {
  const { upstashUrl, upstashToken } = env();
  if (upstashUrl && upstashToken) return "redis";
  if (process.env.VERCEL) return "memory";
  return "file";
}

async function redis(command: (string | number)[]) {
  const { upstashUrl, upstashToken } = env();
  const res = await fetch(upstashUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${upstashToken}`, "content-type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  return (await res.json()).result;
}

export async function getVotes(): Promise<Votes> {
  try {
    switch (backend()) {
      case "redis": {
        const flat: string[] = (await redis(["HGETALL", KEY])) ?? [];
        const out: Votes = {};
        for (let i = 0; i < flat.length; i += 2) out[flat[i]] = Number(flat[i + 1]);
        return out;
      }
      case "file":
        return JSON.parse(await fs.readFile(FILE, "utf8"));
      default:
        return memory;
    }
  } catch {
    return backend() === "memory" ? memory : {};
  }
}

export async function addVote(workType: string, caseId: string, useful: boolean) {
  const delta = useful ? 1 : -1;
  const keys = [`${workType}|${caseId}`, `*|${caseId}`];
  switch (backend()) {
    case "redis":
      for (const k of keys) await redis(["HINCRBY", KEY, k, delta]);
      return;
    case "file": {
      const votes = await getVotes();
      for (const k of keys) votes[k] = (votes[k] ?? 0) + delta;
      await fs.writeFile(FILE, JSON.stringify(votes, null, 2));
      return;
    }
    default:
      for (const k of keys) memory[k] = (memory[k] ?? 0) + delta;
  }
}
