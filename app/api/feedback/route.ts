import { getCase } from "@/lib/cases.ts";
import { addVote, backend, getVotes } from "@/lib/feedback.ts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const caseId = String(body.caseId ?? "");
  const workType = String(body.workType ?? "Other").slice(0, 40);
  if (!getCase(caseId) || typeof body.useful !== "boolean") {
    return Response.json({ error: "Need { caseId, workType, useful: boolean }" }, { status: 400 });
  }
  await addVote(workType, caseId, body.useful);
  return Response.json({ ok: true, backend: backend() });
}

export async function GET() {
  return Response.json({ backend: backend(), votes: await getVotes() });
}
