# Memory Bank

**A new client request came in. Have we done this before, how did it go, and what is different this time?**

Memory Bank helps a delivery / support team find and reuse its own past work. Paste a new request and it:

1. finds the most similar past cases in the team's history, and says plainly when there is **no** real precedent;
2. shows **how those cases actually went**: planned vs. actual effort, where they got stuck, who handled them;
3. lists **what is different this time** (volume, deadline vs. how long it really took, new systems, non-English data, region, people who have left, track record), each with a risk level;
4. drafts a **starter plan**, the **artifacts to reuse** (scripts, checklists, templates) and the **lessons** the team already paid for, including those from people who left;
5. **cites every statement**: click a citation to open the exact ticket, email or chat message it came from.

The team's 👍 / 👎 on suggested cases feeds back into the ranking, so the history people actually find useful rises to the top.

> Built for *Agent in the Shell* (Anduin Cybernetics), challenge 03 “The Memory Bank”.
> All clients, people and cases are fictional sample data (the Kestrel professional-services team).

## Architecture

```
            new request (free text)
                    │
      ┌─────────────┴──────────────┐
      ▼                            ▼
 LLM: profile request         embedding (Gemini)
 (type, systems, volume,           │
  deadline, languages, region)     │
      │                            │
      └──────────┬─────────────────┘
                 ▼
     Hybrid ranking  (lib/search.ts)          ◄── team feedback (lib/feedback.ts)
     0.45 meaning (cosine)                         per work type, Redis / file
     0.20 exact words (BM25)
     0.35 structured facts (same work type, systems, languages, topics)
     ± feedback boost
                 │
     precedent verdict by threshold (code, not the model)
                 │
                 ▼
     Rule-based differences (lib/diff.ts)
     volume ratio · deadline vs. ACTUAL past effort · systems never seen
     non-English data · region · people who left · past outcome
                 │
                 ▼
     LLM briefing (lib/analyze.ts), grounded ONLY in the top 3 cases,
     every claim must cite a case id or timeline entry id
                 │
                 ▼
     Citation verifier: drops citations / claims / artifacts that are
     not in the cases given to the model, and reports how many
```

Design choices:

- **The model explains, code decides.** Similarity, the precedent verdict and the differences are computed in code and are explainable (the UI shows each signal). The LLM only writes, and its output is verified.
- **Hybrid retrieval** because each signal fails differently: embeddings catch paraphrases (“leavers lose access the same day” ≈ deprovisioning), BM25 catches exact names embeddings blur (SCIM, NetSuite), and structured facts encode what an experienced teammate checks first.
- **“What's different” compares against what really happened**, not the plan: a 15-day deadline is flagged against the 18 days the last similar migration actually took, not its 10-day estimate.
- **Knowledge that walked out of the door** is surfaced explicitly: cases and lessons from people who have left are labelled, with who else worked on it.
- **Honest when there is nothing.** Below a calibrated threshold the app says “no real precedent” and switches to questions to ask, instead of stretching a weak match.

## Reliability

- `npm run eval`: retrieval eval on the sample requests (right case ranked first; correct precedent verdict, including “no precedent”).
- Citation verification on every briefing; the number of removed claims is shown under each result.
- LLM calls fall back across models and back off on rate limits (Gemini free tier is 5 requests/min/model).
- Sample requests are precomputed (`npm run precompute`), so the hosted demo answers them instantly. Ranking is never cached: it always reflects the latest feedback, and if feedback changes the top cases a fresh briefing is written.

## Project layout

| Path | What |
|---|---|
| `data/cases.json` | The case library: request, attributes, owner/team, estimate vs. actual, outcome, timeline (ticket / email / chat / note), resolution, lessons, artifacts |
| `data/index.json` | Precomputed case embeddings (`npm run index`) |
| `lib/cases.ts` | Loads and normalises the library. The one module to replace to plug in Jira / Zendesk / SharePoint exports |
| `lib/search.ts` | Hybrid ranking and precedent verdict |
| `lib/diff.ts` | Rule-based “what's different this time” |
| `lib/analyze.ts` | Orchestration, prompts, citation verification |
| `lib/feedback.ts` | Pluggable feedback store (Upstash Redis REST, local file, memory) |
| `lib/llm.ts` | Minimal OpenAI-compatible client with model fallback |
| `app/` | Next.js UI and API routes |
| `scripts/` | `build-index`, `eval`, `precompute` |

## Run it

```bash
npm install
cp .env.example .env.local   # add LLM_API_KEY (Google AI Studio key works out of the box)
npm run index                # only needed after editing data/cases.json
npm run dev
```

Any OpenAI-compatible endpoint works: set `LLM_BASE_URL`, `LLM_MODEL` and `EMBED_MODEL`.
For persistent feedback in production, set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

## What I would build next

- Connectors that turn closed Jira tickets, mail threads and Slack channels into cases automatically, with an LLM pass that drafts the “lessons” for the owner to approve at closure.
- “Ask the person”: route questions to teammates who worked on a similar case and are still around.
- Calibrated estimates: suggest effort from the actual-vs-estimate history of similar cases.

## Why

I work in L1 application support. Before this I built a team-memory chatbot for my real support team: 169 questions from 9 people in 10 days, and 25 times the team taught it something new. The lesson was that people only trust a memory tool when they can see where an answer came from, and when it admits it does not know. Memory Bank is that lesson applied to delivery work.
