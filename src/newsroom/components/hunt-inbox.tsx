"use client";
import { useState } from "react";
import { routing, type HuntRecord } from "../jev/model";
import { sourceHref } from "../model/newspaper";
import styles from "./jev-live-desk.module.css";
export function HuntInbox({ records }: { records: HuntRecord[] }) {
  const [filter, setFilter] = useState("all");
  const route = (r: HuntRecord) => (r.evaluation ? routing(r.evaluation.decision) : "Awaiting Jev");
  const shown = records.filter(
    (r) =>
      filter === "all" ||
      (filter === "Use case" ? r.evaluation?.decision.category === "Use case" : route(r) === filter),
  );
  return (
    <section className={styles.discovery} aria-label="Hermes hunt inbox">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Real sources · saved locally</p>
          <h3>Hermes hunt inbox · {records.length}</h3>
        </div>
        <label>
          Show saved findings{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {["all", "Keep", "Use case", "Review", "Awaiting Jev", "Drop"].map((v) => (
              <option key={v} value={v}>
                {v === "all" ? "All findings" : v}
              </option>
            ))}
          </select>
        </label>
      </header>
      <p className={styles.notice}>
        Up to 300 findings from the last 30 days survive reloads. Keep means Jev judged the excerpt relevant,
        not fact-checked. Repository activity is not proof of shipping. Unchanged evaluated excerpts are
        skipped on the next hunt.
      </p>
      {!shown.length ? (
        <p>
          {records.length
            ? "No findings in this view yet."
            : "Start with Fetch news. Real candidates will appear here; Jev decisions are added only after an acknowledged live run."}
        </p>
      ) : (
        <ul className={styles.inbox}>
          {shown.slice(0, 60).map((r) => (
            <li key={r.candidate.sourceUrl}>
              <div className={styles.header}>
                <strong>
                  {route(r)}
                  {r.evaluation ? ` · ${r.evaluation.decision.category}` : ""}
                </strong>
                <span>{r.candidate.source}</span>
              </div>
              <a href={sourceHref(r.candidate.sourceUrl) ?? undefined} target="_blank" rel="noreferrer">
                {r.candidate.title}
              </a>
              <p>
                {r.candidate.summary.slice(0, 220)}
                {r.candidate.summary.length > 220 ? "…" : ""}
              </p>
              {r.candidate.summary.length > 220 && (
                <details>
                  <summary>Read full excerpt</summary>
                  <p>{r.candidate.summary}</p>
                </details>
              )}
              <small>
                Source date {new Date(r.candidate.publishedAt).toLocaleDateString()} · First found{" "}
                {new Date(r.firstSeenAt).toLocaleString()}
              </small>
              {r.evaluation && (
                <p className={styles.notice}>
                  Jev: {r.evaluation.decision.relevance ?? "Unclear"} · selected relevance confidence{" "}
                  {r.evaluation.decision.relevanceProbability === undefined
                    ? "not supplied"
                    : `${Math.round(r.evaluation.decision.relevanceProbability * 100)}%`}{" "}
                  · {r.evaluation.elapsedMs ?? "—"} ms · evaluated{" "}
                  {new Date(r.evaluation.evaluatedAt).toLocaleString()}. Confidence is not accuracy.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {shown.length > 60 && (
        <p>Showing 60 of {shown.length}. Narrow the findings filter to see a smaller group.</p>
      )}
    </section>
  );
}
