// Loads the case library and resolves people. In a real deployment this module
// is the only thing that changes: point it at Jira / Zendesk / SharePoint exports.

import rawCases from "../data/cases.json" with { type: "json" };
import rawPeople from "../data/people.json" with { type: "json" };
import type { PastCase, Person, TimelineEntry } from "./types.ts";

type RawCase = Omit<PastCase, "owner" | "team" | "timeline"> & {
  owner: string;
  team: string[];
  timeline: Omit<TimelineEntry, "id">[];
};

const people = rawPeople as Record<string, Person>;

function person(name: string): Person {
  return people[name] ?? { name, role: "Unknown", status: "active" };
}

export const CASES: PastCase[] = (rawCases as RawCase[]).map((c) => ({
  ...c,
  owner: person(c.owner),
  team: c.team.map(person),
  timeline: c.timeline
    .map((e, i) => ({ ...e, id: `${c.id}#${i + 1}` }))
    .sort((a, b) => a.date.localeCompare(b.date)),
}));

const byId = new Map(CASES.map((c) => [c.id, c]));

export function getCase(id: string) {
  return byId.get(id);
}

// Every id an answer is allowed to cite: case ids and timeline entry ids.
export const CITABLE_IDS = new Set<string>(CASES.flatMap((c) => [c.id, ...c.timeline.map((e) => e.id)]));

// The text we search over. Request + what happened + lessons: people search with
// the words of a new request, so the client's own words matter most.
export function caseText(c: PastCase) {
  return [
    c.title,
    `Type: ${c.type}. Client: ${c.client.name} (${c.client.segment}, ${c.client.industry}).`,
    `Request: ${c.request}`,
    `Systems: ${c.attributes.systems.join(", ") || "none"}. Tags: ${c.attributes.tags.join(", ")}.`,
    c.attributes.languages ? `Languages: ${c.attributes.languages.join(", ")}.` : "",
    c.attributes.region ? `Region: ${c.attributes.region}.` : "",
    `Resolution: ${c.resolution}`,
    `Lessons: ${c.lessons.join(" ")}`,
    c.timeline.map((e) => e.text).join(" "),
  ]
    .filter(Boolean)
    .join("\n");
}
