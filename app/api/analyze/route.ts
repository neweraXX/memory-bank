import { analyze } from "@/lib/analyze.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHARS = 4000;

export async function POST(req: Request) {
  let text = "";
  try {
    ({ text } = await req.json());
  } catch {
    return Response.json({ error: "Body must be JSON: { text }" }, { status: 400 });
  }
  text = String(text ?? "").trim();
  if (text.length < 15) return Response.json({ error: "Describe the request in at least a sentence." }, { status: 400 });
  if (text.length > MAX_CHARS) return Response.json({ error: `Keep it under ${MAX_CHARS} characters.` }, { status: 400 });

  try {
    return Response.json(await analyze(text));
  } catch (err) {
    console.error("analyze failed", err);
    return Response.json({ error: "The AI service is busy. Try again in a few seconds." }, { status: 503 });
  }
}
