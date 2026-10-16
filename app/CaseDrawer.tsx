"use client";

import { useEffect, useRef } from "react";
import type { PastCase } from "@/lib/types.ts";

const SOURCE_ICON: Record<string, string> = { ticket: "🎫", email: "✉️", chat: "💬", note: "📝" };

export function OutcomeBadge({ c }: { c: PastCase }) {
  const cls = c.outcome === "On time" ? "low" : c.outcome === "Late" ? "medium" : "high";
  return <span className={`badge ${cls}`}>{c.outcome}</span>;
}

export function PersonName({ p }: { p: PastCase["owner"] }) {
  return (
    <>
      {p.name}
      {p.status === "left" && (
        <span className="badge left" style={{ marginLeft: 6 }}>
          left the company
        </span>
      )}
    </>
  );
}

export default function CaseDrawer({
  c,
  highlight,
  onClose,
}: {
  c: PastCase;
  highlight?: string;
  onClose: () => void;
}) {
  const hlRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    hlRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, highlight]);

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={c.title}>
        <div className="row spread">
          <span className="mono muted">{c.id}</span>
          <button className="chip" onClick={onClose}>
            Close ✕
          </button>
        </div>
        <h1 style={{ fontSize: 21, marginTop: 8 }}>{c.title}</h1>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="badge ghost">{c.type}</span>
          <OutcomeBadge c={c} />
          <span className="small muted">
            {c.opened} → {c.closed}
          </span>
        </div>

        <dl className="kv" style={{ marginTop: 16 }}>
          <dt>Client</dt>
          <dd>
            {c.client.name} · {c.client.segment} · {c.client.industry}
          </dd>
          <dt>Owner</dt>
          <dd>
            <PersonName p={c.owner} /> <span className="muted small">({c.owner.role})</span>
          </dd>
          {c.team.length > 0 && (
            <>
              <dt>Also worked on it</dt>
              <dd>
                {c.team.map((p, i) => (
                  <span key={p.name}>
                    {i > 0 && ", "}
                    <PersonName p={p} />
                  </span>
                ))}
              </dd>
            </>
          )}
          <dt>Effort</dt>
          <dd>
            estimated {c.estimateDays} days, took <b>{c.actualDays}</b>
          </dd>
          <dt>Systems</dt>
          <dd>{c.attributes.systems.join(", ") || "—"}</dd>
          {c.attributes.volume && (
            <>
              <dt>Volume</dt>
              <dd>
                {c.attributes.volume.toLocaleString("en-US")} {c.attributes.volumeUnit}
              </dd>
            </>
          )}
          {c.attributes.languages && (
            <>
              <dt>Languages</dt>
              <dd>{c.attributes.languages.join(", ")}</dd>
            </>
          )}
          {c.attributes.region && (
            <>
              <dt>Region</dt>
              <dd>{c.attributes.region}</dd>
            </>
          )}
        </dl>

        <h2 style={{ marginTop: 20 }}>Client request</h2>
        <p style={{ margin: 0 }}>“{c.request}”</p>

        <h2 style={{ marginTop: 20 }}>What happened</h2>
        <ol className="timeline">
          {c.timeline.map((e) => (
            <li key={e.id} id={e.id} ref={e.id === highlight ? hlRef : undefined} className={e.id === highlight ? "hl" : ""}>
              <div className="meta">
                {SOURCE_ICON[e.source]} {e.source} · {e.date} · {e.author} · <span className="mono">{e.id}</span>
              </div>
              <div>{e.text}</div>
            </li>
          ))}
        </ol>

        <h2 style={{ marginTop: 20 }}>Resolution</h2>
        <p style={{ margin: 0 }}>{c.resolution}</p>

        {c.lessons.length > 0 && (
          <>
            <h2 style={{ marginTop: 20 }}>Lessons</h2>
            <ul className="cited">
              {c.lessons.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </>
        )}

        {c.artifacts.length > 0 && (
          <>
            <h2 style={{ marginTop: 20 }}>Reusable work</h2>
            <ul className="cited">
              {c.artifacts.map((a) => (
                <li key={a.name}>
                  <b>{a.name}</b> <span className="badge ghost">{a.kind}</span>
                  <div className="small muted">{a.summary}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </>
  );
}
