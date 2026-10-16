// Domain model for the Memory Bank.
// A "case" is one piece of past work: a client request, how it was handled,
// how it ended, and what the team learned.

export type Source = "ticket" | "email" | "chat" | "note";

export interface TimelineEntry {
  id: string; // e.g. "KST-118#3", stable so answers can cite it
  date: string; // ISO date
  source: Source;
  author: string;
  text: string;
}

export interface Person {
  name: string;
  role: string;
  status: "active" | "left";
}

export type WorkType =
  | "Data migration"
  | "SSO & provisioning"
  | "Integration"
  | "Reporting"
  | "Performance"
  | "Onboarding & templates";

export type Outcome = "On time" | "Late" | "Escalated" | "Cancelled";

export interface CaseAttributes {
  systems: string[]; // third-party systems involved (Salesforce, Okta, SAP...)
  volume?: number; // records / users / documents, when relevant
  volumeUnit?: string; // "records", "users", ...
  deadlineDays?: number; // time the client gave us
  languages?: string[]; // data languages / scripts, matters for migrations
  region?: string; // data residency / client region
  tags: string[];
}

export interface Artifact {
  name: string;
  kind: "script" | "checklist" | "template" | "runbook" | "doc";
  summary: string;
}

export interface PastCase {
  id: string;
  title: string;
  type: WorkType;
  client: { name: string; segment: "Mid-market" | "Enterprise"; industry: string };
  request: string; // what the client originally asked for, in their words
  attributes: CaseAttributes;
  owner: Person;
  team: Person[];
  opened: string;
  closed: string;
  estimateDays: number;
  actualDays: number;
  outcome: Outcome;
  timeline: TimelineEntry[];
  resolution: string;
  lessons: string[];
  artifacts: Artifact[];
}

// ---- Analysis output ----

export interface RequestProfile {
  summary: string;
  type: WorkType | "Other";
  systems: string[];
  volume?: number;
  volumeUnit?: string;
  deadlineDays?: number;
  languages?: string[];
  region?: string;
  tags: string[];
}

export interface Match {
  caseId: string;
  score: number; // 0..1 final ranking score
  signals: { semantic: number; keyword: number; attributes: number; feedback: number };
  matchedOn: string[]; // human-readable reasons computed in code
}

export type Risk = "high" | "medium" | "low";

export interface Difference {
  dimension: string; // "Volume", "Systems", "Deadline", "People", ...
  before: string; // what the past case had
  now: string; // what the new request has
  risk: Risk;
  note: string;
  source: "rule" | "ai";
}

export interface Cited {
  text: string;
  cites: string[]; // case ids or timeline entry ids
}

export interface Briefing {
  verdict: "strong precedent" | "partial precedent" | "no precedent";
  headline: string;
  howItWent: Cited[];
  differences: Difference[];
  plan: Cited[];
  reuse: { artifact: string; fromCase: string; why: string }[];
  lessons: (Cited & { from: string; personLeft: boolean })[];
  openQuestions: string[];
}

export interface AnalyzeResult {
  profile: RequestProfile;
  matches: Match[];
  briefing: Briefing;
  droppedCitations: number; // citations the model invented and we removed
  timingsMs: Record<string, number>;
  model: string;
  cached: boolean; // served from the precomputed / in-process cache
}
