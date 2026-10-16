// "What's different this time": rule-based comparison between a new request and a
// past case. Deterministic on purpose: these are the checks an experienced
// teammate would run, and they must not depend on the model's mood.

import { CASES } from "./cases.ts";
import type { Difference, PastCase, RequestProfile } from "./types.ts";

const fmt = (n: number) => n.toLocaleString("en-US");
const lc = (xs: string[] = []) => xs.map((x) => x.toLowerCase());

// Systems the team has touched at least once, anywhere in the library.
const KNOWN_SYSTEMS = new Set(CASES.flatMap((c) => lc(c.attributes.systems)));

export function compare(p: RequestProfile, c: PastCase): Difference[] {
  const out: Difference[] = [];
  const a = c.attributes;

  // Volume
  if (p.volume && a.volume) {
    const ratio = p.volume / a.volume;
    if (ratio >= 1.5) {
      out.push({
        dimension: "Volume",
        before: `${fmt(a.volume)} ${a.volumeUnit ?? ""}`.trim(),
        now: `${fmt(p.volume)} ${p.volumeUnit ?? ""}`.trim(),
        risk: ratio >= 3 ? "high" : "medium",
        note: `${ratio.toFixed(1)}x the volume of ${c.id}. Expect dry runs, exports and checks to take longer.`,
        source: "rule",
      });
    }
  }

  // Systems
  const newSystems = lc(p.systems).filter((s) => !lc(a.systems).includes(s));
  for (const s of newSystems) {
    const everDone = KNOWN_SYSTEMS.has(s);
    const label = p.systems.find((x) => x.toLowerCase() === s) ?? s;
    out.push({
      dimension: "Systems",
      before: a.systems.join(", ") || "none",
      now: label,
      risk: everDone ? "medium" : "high",
      note: everDone
        ? `${c.id} did not involve ${label}, but other past cases did. Check those too.`
        : `The team has never worked with ${label} before. No playbook exists, verify API access and limits in week 1.`,
      source: "rule",
    });
  }

  // Deadline
  if (p.deadlineDays) {
    if (p.deadlineDays < c.actualDays) {
      out.push({
        dimension: "Deadline",
        before: `${c.actualDays} working days actually needed (estimate was ${c.estimateDays})`,
        now: `${p.deadlineDays} days available`,
        risk: "high",
        note: `Less time than ${c.id} really took. Cut scope, add people, or reset expectations now.`,
        source: "rule",
      });
    } else if (a.deadlineDays && p.deadlineDays < a.deadlineDays * 0.7) {
      out.push({
        dimension: "Deadline",
        before: `${a.deadlineDays} days given`,
        now: `${p.deadlineDays} days given`,
        risk: "medium",
        note: `Tighter timeline than ${c.id}, with less room for a second dry run or retest.`,
        source: "rule",
      });
    }
  }

  // Languages / encoding
  const nonEn = (xs?: string[]) => lc(xs).filter((l) => l !== "english");
  const newLangs = nonEn(p.languages).filter((l) => !nonEn(a.languages).includes(l));
  if (newLangs.length) {
    const encodingCase = CASES.find((x) => x.attributes.tags.includes("encoding") && x.outcome === "Escalated");
    out.push({
      dimension: "Languages",
      before: a.languages?.join(", ") || "English only",
      now: p.languages?.join(", ") ?? newLangs.join(", "),
      risk: nonEn(a.languages).length ? "medium" : "high",
      note: encodingCase
        ? `Non-English data that ${c.id} did not have. ${encodingCase.id} was escalated over broken characters: force UTF-8 and check samples with a native speaker.`
        : "Non-English data: force UTF-8 exports and check samples with a native speaker.",
      source: "rule",
    });
  }

  // Region / residency
  if (p.region && a.region && !sameRegion(p.region, a.region)) {
    out.push({
      dimension: "Region",
      before: a.region,
      now: p.region,
      risk: /residen|only|gdpr|singapore|eu/i.test(p.region) ? "medium" : "low",
      note: "Different region. Confirm data residency and which tenant/region to use at kickoff.",
      source: "rule",
    });
  }

  // People: knowledge walking out of the door
  const leftPeople = [c.owner, ...c.team].filter((x) => x.status === "left");
  if (leftPeople.length) {
    const stayed = [c.owner, ...c.team].filter((x) => x.status === "active");
    out.push({
      dimension: "People",
      before: leftPeople.map((x) => `${x.name} (${x.role})`).join(", "),
      now: "no longer at the company",
      risk: "medium",
      note: stayed.length
        ? `Only the notes are left from ${leftPeople[0].name}. ${stayed.map((x) => x.name).join(", ")} also worked on it: ask them.`
        : `Nobody who worked on ${c.id} is still here. Read the timeline and lessons carefully.`,
      source: "rule",
    });
  }

  // History: how the past case actually ended
  if (c.outcome !== "On time") {
    const over = c.actualDays - c.estimateDays;
    out.push({
      dimension: "Track record",
      before: `${c.outcome}${over > 0 ? `, ${over} days over estimate` : ""}`,
      now: "same type of work",
      risk: c.outcome === "Escalated" || c.outcome === "Cancelled" ? "high" : "medium",
      note: `${c.id} did not go to plan. Read its lessons before estimating.`,
      source: "rule",
    });
  }

  return out;
}

function sameRegion(x: string, y: string) {
  const key = (s: string) => s.toLowerCase().split(/[\s(]/)[0];
  return key(x) === key(y);
}
