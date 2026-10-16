"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CaseDrawer, { OutcomeBadge, PersonName } from "./CaseDrawer.tsx";
import type { AnalyzeResult, Cited, Difference, PastCase } from "@/lib/types.ts";

interface Sample {
  label: string;
  text: string;
}

const STEPS = ["Reading the request", "Searching past cases", "Comparing with the closest ones", "Writing the briefing"];
const VERDICT_CLASS = { "strong precedent": "strong", "partial precedent": "partial", "no precedent": "none" } as const;
const VERDICT_LABEL = {
  "strong precedent": "We have done this before",
  "partial precedent": "We have done something close",
  "no precedent": "No real precedent in our history",
} as const;

export default function MemoryBank({ cases, samples }: { cases: PastCase[]; samples: Sample[] }) {
  const byId = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases]);
  const [text, setText] = useState("");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState<{ id: string; highlight?: string } | null>(null);
  const [votes, setVotes] = useState<Record<string, boolean>>({});
  const [rankChanged, setRankChanged] = useState("");

  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const timers = [700, 1600, 2600].map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  const run = useCallback(
    async (input: string, opts: { keepVotes?: boolean } = {}) => {
      setLoading(true);
      setError("");
      if (!opts.keepVotes) {
        setVotes({});
        setRankChanged("");
      }
      const before = result?.matches.map((m) => m.caseId).join(",");
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: input }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Something went wrong");
        if (opts.keepVotes && before) {
          const after = (data as AnalyzeResult).matches.map((m) => m.caseId).join(",");
          setRankChanged(after !== before ? "Ranking updated with your feedback." : "Same order: the signal was not strong enough to move it yet.");
        }
        setResult(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [result],
  );

  async function vote(caseId: string, useful: boolean) {
    if (!result) return;
    setVotes((v) => ({ ...v, [caseId]: useful }));
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId, workType: result.profile.type, useful }),
    });
  }

  const Cite = ({ id }: { id: string }) => {
    const caseId = id.split("#")[0];
    if (!byId.has(caseId)) return null;
    return (
      <button className="cite" title={`Open source ${id}`} aria-label={`Source ${id}`} onClick={() => setOpen({ id: caseId, highlight: id.includes("#") ? id : undefined })}>
        {id}
      </button>
    );
  };
  const Cites = ({ ids }: { ids: string[] }) => (
    <>
      {ids.map((id) => (
        <Cite key={id} id={id} />
      ))}
    </>
  );
  const CitedList = ({ items, ordered }: { items: Cited[]; ordered?: boolean }) => {
    const Tag = ordered ? "ol" : "ul";
    return (
      <Tag className="cited">
        {items.map((it, i) => (
          <li key={i}>
            {it.text}
            <Cites ids={it.cites} />
          </li>
        ))}
      </Tag>
    );
  };

  const b = result?.briefing;
  const p = result?.profile;

  return (
    <>
      <h1>A new request came in. Have we done this before?</h1>
      <p className="lede">
        Paste the client&apos;s request. Memory Bank finds similar past cases in your team&apos;s history, shows how they
        really went, what is different this time, and what you can reuse. Every statement links to its source.
      </p>

      <section className="panel stack">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. “We are moving off HubSpot and need 80k contacts in Kestrel by month-end…”"
          aria-label="New client request"
        />
        <div className="row spread">
          <div className="row">
            <span className="small muted">Try:</span>
            {samples.map((s) => (
              <button
                key={s.label}
                className="chip"
                onClick={() => {
                  setText(s.text);
                  run(s.text);
                }}
                disabled={loading}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button className="btn" disabled={loading || text.trim().length < 15} onClick={() => run(text)}>
            {loading ? "Searching…" : "Find past work"}
          </button>
        </div>
        {loading && (
          <div className="steps" aria-live="polite">
            {STEPS.map((s, i) => (
              <span key={s} className={i < step ? "done" : i === step ? "on" : ""}>
                {s}
              </span>
            ))}
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </section>

      {result && b && p && (
        <div className="grid">
          <div className="stack">
            <section className={`panel verdict ${VERDICT_CLASS[b.verdict]}`}>
              <div className="row spread">
                <h2 style={{ margin: 0 }}>{VERDICT_LABEL[b.verdict]}</h2>
                <span className="small muted">top match {(result.matches[0].score * 100).toFixed(0)}%</span>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 16 }}>{b.headline}</p>
              <div className="profile">
                <span className="badge ghost">{p.type}</span>
                {p.systems.map((s) => (
                  <span key={s} className="badge ghost">
                    {s}
                  </span>
                ))}
                {p.volume && (
                  <span className="badge ghost">
                    {p.volume.toLocaleString("en-US")} {p.volumeUnit}
                  </span>
                )}
                {p.deadlineDays && <span className="badge ghost">{p.deadlineDays} days</span>}
                {p.languages?.map((l) => (
                  <span key={l} className="badge ghost">
                    {l}
                  </span>
                ))}
                {p.region && <span className="badge ghost">{p.region}</span>}
              </div>
            </section>

            {b.howItWent.length > 0 && (
              <section className="panel">
                <h2>How similar cases went</h2>
                <CitedList items={b.howItWent} />
              </section>
            )}

            {b.differences.length > 0 && (
              <section className="panel">
                <h2>What&apos;s different this time</h2>
                <DiffTable diffs={b.differences} />
              </section>
            )}

            {b.plan.length > 0 && (
              <section className="panel">
                <h2>Starter plan</h2>
                <CitedList items={b.plan} ordered />
              </section>
            )}

            {b.reuse.length > 0 && (
              <section className="panel">
                <h2>Reuse instead of rebuilding</h2>
                <ul className="cited">
                  {b.reuse.map((r) => (
                    <li key={r.artifact}>
                      <b>{r.artifact}</b> from <Cite id={r.fromCase} />
                      <div className="small muted">{r.why}</div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {b.lessons.length > 0 && (
              <section className="panel">
                <h2>Lessons the team already paid for</h2>
                <ul className="cited">
                  {b.lessons.map((l, i) => (
                    <li key={i}>
                      {l.text}
                      <Cites ids={l.cites} />
                      {l.personLeft && (
                        <div className="small" style={{ marginTop: 2 }}>
                          <span className="badge left">from {l.from}, who has left</span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {b.openQuestions.length > 0 && (
              <section className="panel">
                <h2>Ask before you start</h2>
                <ul className="cited">
                  {b.openQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </section>
            )}

            <p className="footnote">
              Retrieval and differences are computed in code; the AI ({result.model}) only writes the briefing from the
              cases shown. {result.droppedCitations > 0
                ? `${result.droppedCitations} unsupported citation(s) or claim(s) were removed before display.`
                : "Every citation was checked against the case library."}{" "}
              {result.cached ? "Served from cache." : `Took ${(Object.values(result.timingsMs).reduce((a, x) => a + x, 0) / 1000).toFixed(1)}s.`}
            </p>
          </div>

          <aside className="stack">
            <section className="panel">
              <h2>Similar past cases</h2>
              {result.matches.map((m) => {
                const c = byId.get(m.caseId)!;
                return (
                  <div key={m.caseId} className="match">
                    <div className="row spread">
                      <span className="mono small muted">{c.id}</span>
                      <OutcomeBadge c={c} />
                    </div>
                    <h3>
                      <button onClick={() => setOpen({ id: c.id })}>{c.title}</button>
                    </h3>
                    <div className="bar" title={`${(m.score * 100).toFixed(0)}% match`}>
                      <span style={{ width: `${Math.round(m.score * 100)}%` }} />
                    </div>
                    <div className="signals" title="How the match score is built">
                      <span>meaning {pct(m.signals.semantic)}</span>
                      <span>words {pct(m.signals.keyword)}</span>
                      <span>facts {pct(m.signals.attributes)}</span>
                      <span>team {m.signals.feedback >= 0 ? "+" : ""}{(m.signals.feedback * 100).toFixed(0)}</span>
                    </div>
                    <div className="small" style={{ marginTop: 6 }}>
                      Owner: <PersonName p={c.owner} /> · {c.estimateDays}d planned → {c.actualDays}d
                    </div>
                    {m.matchedOn.length > 0 && (
                      <ul className="reasons muted">
                        {m.matchedOn.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    )}
                    <div className="vote">
                      <span className="muted">Useful for this?</span>
                      <button className={votes[c.id] === true ? "picked" : ""} onClick={() => vote(c.id, true)} aria-label="Useful">
                        👍
                      </button>
                      <button className={votes[c.id] === false ? "picked" : ""} onClick={() => vote(c.id, false)} aria-label="Not useful">
                        👎
                      </button>
                    </div>
                  </div>
                );
              })}
              {Object.keys(votes).length > 0 && (
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="chip" onClick={() => run(text, { keepVotes: true })} disabled={loading}>
                    Re-rank with feedback
                  </button>
                  {rankChanged && <span className="small muted">{rankChanged}</span>}
                </div>
              )}
              <p className="footnote">
                Feedback is shared by the team: future requests of the same type rank useful cases higher.
              </p>
            </section>
          </aside>
        </div>
      )}

      {open && byId.get(open.id) && (
        <CaseDrawer c={byId.get(open.id)!} highlight={open.highlight} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function DiffTable({ diffs }: { diffs: Difference[] }) {
  const order = { high: 0, medium: 1, low: 2 };
  const sorted = [...diffs].sort((a, b) => order[a.risk] - order[b.risk]);
  return (
    <>
      <table className="diff">
        <thead>
          <tr>
            <th>Risk</th>
            <th>What</th>
            <th>Last time</th>
            <th>This time</th>
            <th>So what</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d, i) => (
            <tr key={i}>
              <td>
                <span className={`badge ${d.risk}`}>{d.risk}</span>
              </td>
              <td>
                <b>{d.dimension}</b>
                {d.source === "ai" && <div className="small muted">AI-spotted</div>}
              </td>
              <td>{d.before}</td>
              <td>{d.now}</td>
              <td>{d.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="diff-mobile">
        {sorted.map((d, i) => (
          <div key={i} className="diff-card">
            <div className="row">
              <span className={`badge ${d.risk}`}>{d.risk}</span>
              <b>{d.dimension}</b>
              {d.source === "ai" && <span className="small muted">AI-spotted</span>}
            </div>
            <div className="small" style={{ marginTop: 4 }}>
              {d.before} → <b>{d.now}</b>
            </div>
            <div className="small muted">{d.note}</div>
          </div>
        ))}
      </div>
    </>
  );
}
