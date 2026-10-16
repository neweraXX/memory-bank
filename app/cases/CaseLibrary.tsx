"use client";

import { useMemo, useState } from "react";
import CaseDrawer, { OutcomeBadge, PersonName } from "../CaseDrawer.tsx";
import type { PastCase } from "@/lib/types.ts";

export default function CaseLibrary({ cases }: { cases: PastCase[] }) {
  const [type, setType] = useState("All");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<PastCase | null>(null);
  const types = ["All", ...new Set(cases.map((c) => c.type))];

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cases
      .filter((c) => type === "All" || c.type === type)
      .filter((c) => !needle || JSON.stringify(c).toLowerCase().includes(needle))
      .sort((a, b) => b.opened.localeCompare(a.opened));
  }, [cases, type, q]);

  const left = cases.filter((c) => c.owner.status === "left").length;
  const late = cases.filter((c) => c.outcome !== "On time").length;

  return (
    <>
      <h1>Case library</h1>
      <p className="lede">
        {cases.length} past cases from the Kestrel professional-services team (sample data). {left} were owned by people
        who have since left; {late} did not finish on time. This is the history Memory Bank searches.
      </p>
      <section className="panel stack">
        <div className="row">
          {types.map((t) => (
            <button key={t} className="chip" style={t === type ? { borderColor: "var(--accent)" } : {}} onClick={() => setType(t)}>
              {t}
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by any word…"
            aria-label="Filter"
            className="chip"
            style={{ minWidth: 200 }}
          />
        </div>
        <div className="table-wrap">
          <table className="library">
            <thead>
              <tr>
                <th>Case</th>
                <th>Client</th>
                <th>Owner</th>
                <th>Planned → actual</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <td>
                    <a href={`#${c.id}`} onClick={(e) => (e.preventDefault(), setOpen(c))}>
                      {c.title}
                    </a>
                    <div className="small muted">
                      <span className="mono">{c.id}</span> · {c.type} · {c.opened}
                    </div>
                  </td>
                  <td>{c.client.name}</td>
                  <td>
                    <PersonName p={c.owner} />
                  </td>
                  <td>
                    {c.estimateDays}d → {c.actualDays}d
                  </td>
                  <td>
                    <OutcomeBadge c={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {open && <CaseDrawer c={open} onClose={() => setOpen(null)} />}
    </>
  );
}
