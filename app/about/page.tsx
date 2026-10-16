export const metadata = { title: "How it works · Memory Bank" };

export default function About() {
  return (
    <article className="stack" style={{ maxWidth: 820 }}>
      <h1>How it works</h1>
      <p className="lede">
        Teams re-solve problems they have already solved because past work is buried in tickets, mailboxes and the
        heads of people who have left. The useful question is not only “what did we do before?” but{" "}
        <b>“how did it go, and what is different this time?”</b>
      </p>

      <section className="panel">
        <h2>The pipeline</h2>
        <ol className="cited">
          <li>
            <b>Profile the request.</b> An LLM turns free text into fields a teammate would check first: kind of work,
            systems, volume, deadline, data languages, region.
          </li>
          <li>
            <b>Hybrid retrieval.</b> Each past case is scored on four signals: meaning (embeddings), exact words (BM25,
            for names like “SCIM” or “NetSuite”), structured facts (same work type, same systems, non-English data), and
            team feedback. The final score and the reasons are shown, nothing is a black box.
          </li>
          <li>
            <b>Precedent verdict in code.</b> Thresholds, not the model, decide whether there is a strong, partial or no
            precedent. When there is none, the app says so instead of stretching a weak match.
          </li>
          <li>
            <b>Rule-based differences.</b> Volume ratios, deadline vs. how long the past case <i>really</i> took, new
            systems the team has never touched, non-English data, region, people who have left, and the past case&apos;s
            track record. Deterministic and explainable.
          </li>
          <li>
            <b>Grounded briefing.</b> The LLM writes how it went, a starter plan, what to reuse and lessons, using only
            the retrieved cases, and must cite case or timeline-entry ids for every claim.
          </li>
          <li>
            <b>Citation check.</b> Code verifies every citation exists in the cases given to the model. Unsupported
            claims and invented artifacts are removed before display, and the count is shown.
          </li>
          <li>
            <b>Learning loop.</b> 👍 / 👎 on a past case is stored per work type and nudges future rankings, so the
            history the team finds useful rises to the top.
          </li>
        </ol>
      </section>

      <section className="panel">
        <h2>Reliability</h2>
        <ul className="cited">
          <li>
            A retrieval eval (<code>npm run eval</code>) checks that the right case ranks first and that “no precedent”
            is detected for requests the team has never handled.
          </li>
          <li>
            Every LLM call has fallbacks across models and a backoff for rate limits. Results for the sample requests
            are precomputed, so the demo never depends on the API being up.
          </li>
          <li>Storage for feedback is pluggable (Redis in production, file locally) behind one small module.</li>
        </ul>
      </section>

      <section className="panel">
        <h2>Why I built it this way</h2>
        <p style={{ margin: 0 }}>
          I work in L1 application support. Before this, I built a team-memory chatbot for my real support team (169
          questions from 9 people in 10 days, 25 times the team taught it something new). The lesson: people only trust
          a memory tool if they can see <i>where</i> an answer came from and if it admits when it does not know. Memory
          Bank is that lesson turned into a tool for project and delivery teams.
        </p>
      </section>

      <p className="footnote">All clients, people and cases are fictional sample data.</p>
    </article>
  );
}
