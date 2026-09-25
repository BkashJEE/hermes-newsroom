"use client";
import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, FileText } from "lucide-react";
import type { PersonalData } from "../personal/types";
import { PersonalPaper } from "./personal-paper";
import { useStickyRow } from "../state/use-sticky-row";
import styles from "./personal-daily.module.css";

export function PersonalDaily() {
  const controlsRef = useStickyRow("--personal-controls-height");
  const [data, setData] = useState<PersonalData | null>(null);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async (day = "", edition = "", signal?: AbortSignal) => {
    try {
      const q = new URLSearchParams();
      if (day) q.set("date", day);
      if (edition) q.set("edition", edition);
      const response = await fetch(`/api/newsroom/personal?${q}`, {
        headers: { "X-Newsroom-Client": "1" },
        signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (signal?.aborted) return;
      setError("");
      setData(result);
      setDate(result.snapshot.date);
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "Could not load your newspaper.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    // Synchronize initial state with the asynchronous local API response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load("", "", controller.signal);
    return () => controller.abort();
  }, [load]);
  function reload(day = "", edition = "") {
    setLoading(true);
    setError("");
    setMessage("");
    void load(day, edition);
  }
  async function generate() {
    setWriting(true);
    setError("");
    setMessage("Hermes is reading the selected day's work records…");
    try {
      const response = await fetch("/api/newsroom/personal", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Newsroom-Client": "1" },
        body: JSON.stringify({ date }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await load(date, result.edition.id);
      setMessage("Your newspaper is saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate newspaper.");
      setMessage("");
    } finally {
      setWriting(false);
    }
  }
  async function copy() {
    if (!data?.edition) return;
    const e = data.edition;
    const text =
      `# ${e.title}\n${e.snapshot.date} · ${e.snapshot.timezone}\n\n${e.headline}\n\n` +
      e.sections
        .map(
          (s) => `## ${s.title}\n${s.bullets.map((b) => `- ${b.text} [${b.sources.join(", ")}]`).join("\n")}`,
        )
        .join("\n\n") +
      "\n\n## Sources\n" +
      e.snapshot.records
        .map((r) => `- ${r.id}: ${r.profile} · ${r.title} · session ${r.sessionId}`)
        .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Newspaper copied with source references.");
    } catch {
      setError("Copy failed. Select the newspaper text to copy it.");
    }
  }
  const snapshot = data?.snapshot;
  const edition = data?.edition;
  const disabled = loading || writing;
  return (
    <section
      className={styles.page}
      aria-labelledby="personal-title"
      aria-busy={disabled}
      data-personal-daily
    >
      <header className={styles.masthead}>
        <p className={styles.eyebrow}>Your work. Your agents. Your newspaper.</p>
        <h2 id="personal-title">{data?.title ?? "My Hermes Daily"}</h2>
        <p>A daily edition of your Hermes work, decisions and open threads.</p>
        <div className={styles.dateline}>
          <span>{date || "Loading edition…"}</span>
          <span>{snapshot?.timezone}</span>
          <span>{edition ? "Written by Hermes Agent" : "Work records · edition not yet written"}</span>
        </div>
      </header>
      <section
        ref={controlsRef}
        className={styles.controls}
        data-personal-controls
        aria-label="Personal edition controls"
      >
        <label>
          Edition date{" "}
          <input
            type="date"
            value={date}
            disabled={disabled}
            onChange={(e) => {
              setDate(e.target.value);
              if (e.target.value) reload(e.target.value);
            }}
          />
        </label>
        <button type="button" disabled={disabled} onClick={() => reload(date)}>
          <RefreshCw size={15} /> Reload edition
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={disabled || !snapshot?.records.length}
          onClick={() => void generate()}
        >
          <FileText size={16} />
          {writing ? "Hermes is writing…" : edition ? "Write updated edition" : "Generate my newspaper"}
        </button>
        {snapshot && (
          <button type="button" disabled={disabled} onClick={() => window.print()}>
            Print / Save PDF
          </button>
        )}
        {edition && (
          <button type="button" disabled={disabled} onClick={() => void copy()}>
            <Copy size={15} /> Copy newspaper
          </button>
        )}
        {data && data.editions.length > 0 && (
          <label>
            Saved editions{" "}
            <select
              value={edition?.id ?? ""}
              disabled={disabled}
              onChange={(e) => {
                if (e.target.value) reload("", e.target.value);
              }}
            >
              <option value="">Choose an edition</option>
              {data.editions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.date} ·{" "}
                  {new Date(e.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      <p className={styles.notice}>
        Generating sends the selected day’s conversation excerpts to your local Hermes gateway, which may call
        a cloud model using your configured provider. Reading records here does not call a model. Saved
        editions stay on this device.
      </p>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {loading && <p role="status">Reading local Hermes work records…</p>}
      {snapshot && (
        <>
          <div className={styles.stats}>
            <p>
              <strong>{snapshot.records.length}</strong> recorded sessions
            </p>
            <p>
              <strong>{snapshot.coverage.filter((p) => p.sessions > 0).length}</strong> profiles with work
            </p>
            <p>
              <strong>{snapshot.records.reduce((n, r) => n + r.messages, 0)}</strong> user and assistant
              messages
            </p>
            <p>
              <strong>{edition ? "Saved" : "Ready"}</strong>
              {edition ? " edition" : " to compose"}
            </p>
          </div>
          {snapshot.coverage.some((p) => p.state !== "ok" || p.omitted) && (
            <p className={styles.notice}>
              Coverage:{" "}
              {snapshot.coverage
                .filter((p) => p.state !== "ok" || p.omitted)
                .map(
                  (p) =>
                    `${p.profile}: ${p.state !== "ok" ? p.state : `${p.omitted} older sessions omitted`}`,
                )
                .join("; ")}
              . No activity is invented for unavailable profiles.
            </p>
          )}
          <PersonalPaper title={data.title} edition={edition ?? null} snapshot={snapshot} />
          {edition ? (
            <details className={styles.paper} aria-label="Full saved edition">
              <summary>Read the full saved edition</summary>
              <h3 className={styles.headline}>{edition.headline}</h3>
              <div className={styles.columns}>
                {edition.sections.map((s, i) => (
                  <section key={i}>
                    <h4>{s.title}</h4>
                    <ul>
                      {s.bullets.map((b, j) => (
                        <li key={j}>
                          {b.text}
                          <span className={styles.citations}>
                            {b.sources.map((id) => (
                              <a
                                key={id}
                                href={`#work-${id}`}
                                onClick={() => {
                                  const target = document.getElementById(`work-${id}`);
                                  if (target instanceof HTMLDetailsElement) target.open = true;
                                }}
                              >
                                {id}
                              </a>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
              <footer>
                Based on recorded conversations as of {new Date(snapshot.collectedAt).toLocaleString()}.
                Reported outcomes are not independent verification.
              </footer>
            </details>
          ) : (
            <div className={styles.empty}>
              <h3>
                {snapshot.records.length ? "Your reporting desk is ready" : "No recorded work for this date"}
              </h3>
              <p>
                {snapshot.records.length
                  ? "Generate an edition to turn the records below into sourced headlines and bullet points. Hermes uses your configured model connection."
                  : "Choose another date. Sessions appear when their user or assistant messages fall within that day."}
              </p>
            </div>
          )}
          <section className={styles.sources} aria-label="Work records">
            <h3>Behind the headlines</h3>
            <p>
              First user request and latest assistant response for each recorded session that day. Excerpts
              are bounded; tool outputs and system messages are excluded.
            </p>
            {snapshot.coverage.map((profile) => (
              <section key={profile.profile}>
                <h4>
                  {profile.profile}{" "}
                  <span>
                    · {profile.sessions} sessions · {profile.state}
                  </span>
                </h4>
                {snapshot.records
                  .filter((r) => r.profile === profile.profile)
                  .map((r) => (
                    <details key={r.id} id={`work-${r.id}`}>
                      <summary>
                        <span className={styles.ref}>{r.id}</span> {r.title}
                        <small>{r.messages} messages</small>
                      </summary>
                      <p className={styles.meta}>
                        Session {r.sessionId} · {r.source}
                      </p>
                      <h5>User request</h5>
                      <p className={styles.excerpt}>{r.request || "No user message recorded that day."}</p>
                      <h5>Latest assistant response</h5>
                      <p className={styles.excerpt}>
                        {r.response || "No assistant response recorded that day."}
                      </p>
                    </details>
                  ))}
              </section>
            ))}
          </section>
        </>
      )}
    </section>
  );
}
