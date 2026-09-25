"use client";
import { useEffect, useRef, useState } from "react";
import type { Story } from "../model/story";
import {
  CATEGORIES,
  CRITERIA,
  routing,
  runMetrics,
  type Category,
  type Mode,
  type RunSnapshot,
  type Discovery,
  type HuntRecord,
} from "../jev/model";
import type { CollectionJob } from "../browser-x/model";
import { sourceHref } from "../model/newspaper";
import { HuntInbox } from "./hunt-inbox";
import { JevDiscovery } from "./jev-discovery";
import styles from "./jev-live-desk.module.css";
const headers = { "Content-Type": "application/json", "x-newsroom-client": "1" };
export function JevLiveDesk({ stories }: { stories: Story[] }) {
  const [inbox, setInbox] = useState<HuntRecord[]>([]);
  const [notice, setNotice] = useState("");
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [restored, setRestored] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  const [activity, setActivity] = useState("IDLE");
  const runStarted = useRef(false);
  const [run, setRun] = useState<RunSnapshot | null>(null);
  const [status, setStatus] = useState({ enabled: false, ready: false });
  const [xStatus, setXStatus] = useState<{
    enabled: boolean;
    count?: number;
    lastCollectedAt?: string;
    job?: CollectionJob;
  }>({ enabled: false });
  const [collectingRequest, setCollectingRequest] = useState(false);
  const [collectionError, setCollectionError] = useState("");
  const [now, setNow] = useState(Date.now);
  const [resultFilter, setResultFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [paid, setPaid] = useState(false);
  const [count, setCount] = useState(3);
  const [overrides, setOverrides] = useState<Record<string, Category>>({});
  const abort = useRef<AbortController | null>(null);
  const collectionAbort = useRef<AbortController | null>(null);
  const collectionPending = ["queued", "collecting"].includes(xStatus.job?.state ?? "");
  const freshCapture =
    xStatus.job?.state === "complete" &&
    !!xStatus.job.postIds?.length &&
    now - Date.parse(xStatus.job.finishedAt ?? "") < 600000;
  const selected = stories
    .filter((s) => ["github", "hackernews", ...(xStatus.enabled ? ["x"] : [])].includes(s.source))
    .slice(0, count);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/newsroom/jev", { headers, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not check Jev status.");
        const data = await response.json();
        if (Array.isArray(data.inbox)) setInbox(data.inbox);
        setStatus({ enabled: data.enabled === true, ready: data.ready === true });
        if (data.lastRun && !runStarted.current) {
          setRestored(true);
          setShowPrevious(data.lastRun.state === "failed");
          setDiscovery(data.lastRun.discovery ?? null);
          setRun(data.lastRun);
          setSaved(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Jev status is unavailable. Retry by reloading this tab.");
      });
    return () => {
      controller.abort();
      abort.current?.abort();
      collectionAbort.current?.abort();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const poll = () =>
      fetch("/api/newsroom/browser-x", { headers, signal: controller.signal })
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((data) => {
          setXStatus(data);
          setNow(Date.now());
          setCollectionError("");
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setCollectionError("Cannot reach the X collector. Jev tests do not require X collection.");
        });
    void poll();
    const timer = setInterval(() => void poll(), 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  async function collectOnly() {
    const controller = new AbortController();
    collectionAbort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    setCollectingRequest(true);
    setCollectionError("");
    try {
      const response = await fetch("/api/newsroom/browser-x", {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({ action: "request" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue browser collection.");
      setXStatus(data);
      setNow(Date.now());
    } catch (cause) {
      setCollectionError(
        controller.signal.aborted
          ? "The collection request timed out. Check its status before retrying. Jev tests are still available."
          : cause instanceof Error
            ? cause.message
            : "Collection request failed.",
      );
    } finally {
      clearTimeout(timeout);
      setCollectingRequest(false);
      collectionAbort.current = null;
    }
  }
  async function start(
    mode: Mode,
    purpose: "classify" | "hunt" | "benchmark" | "pipeline" = "classify",
    previewOnly = false,
  ) {
    runStarted.current = true;
    setRestored(false);
    setShowPrevious(false);
    setDiscovery(null);
    setActivity(
      purpose === "pipeline" ? "STARTING NEWS COLLECTION" : mode === "demo" ? "DEMO RUNNING" : "JEV STARTING",
    );
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    setRun(null);
    setSaved(false);
    setOverrides({});
    setResultFilter("all");
    try {
      if (purpose === "hunt" && !freshCapture)
        throw new Error(
          "Refresh X first, then run Jev after collection completes. Test Jev needs no browser collection.",
        );
      const collectionId = purpose === "hunt" ? xStatus.job?.id : undefined;
      const response = await fetch("/api/newsroom/jev", {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          mode,
          purpose,
          collectionId,
          count,
          storyIds: selected.map((s) => s.id),
          confirmPaid: paid,
          previewOnly,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Run could not start.");
      }
      if (!response.body) throw new Error("Streaming is unavailable.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines)
          if (line.trim()) {
            const event = JSON.parse(line);

            if (event.discovery) {
              setDiscovery(event.discovery);
              setActivity(
                event.discovery.stage === "collecting"
                  ? "COLLECTING NEWS"
                  : event.discovery.stage.toUpperCase(),
              );
            }
            if (Array.isArray(event.inbox)) setInbox(event.inbox);
            if (event.notice) setNotice(event.notice);
            if (event.collectionComplete) finished = true;
            if (event.run) {
              if (event.run.discovery) setDiscovery(event.run.discovery);
              setActivity(mode === "demo" ? "DEMO RUNNING" : "JEV EVALUATING");
              setRun(event.run);
              finished = event.run.state !== "running";
            }
            if (event.saved) setSaved(true);
            if (event.error) throw new Error(event.error);
          }
        if (done) break;
      }
      if (!finished) throw new Error("The stream ended before completion. Reload to check the saved run.");
    } catch (cause) {
      setDiscovery((current) =>
        current ? { ...current, stage: controller.signal.aborted ? "cancelled" : "failed" } : null,
      );
      if (controller.signal.aborted) {
        setRun((current) =>
          current
            ? {
                ...current,
                state: "cancelled",
                finishedAt: new Date().toISOString(),
                items: current.items.map((item) =>
                  ["queued", "processing"].includes(item.status)
                    ? { ...item, status: "cancelled", decision: undefined }
                    : item,
                ),
              }
            : null,
        );
        setError(
          previewOnly
            ? "News collection cancelled. No Jev call was made."
            : mode === "demo"
              ? "Demo cancelled. No provider call was made."
              : "Cancelled locally. A request already sent may still be billed; no further stories will be started.",
        );
      } else {
        controller.abort();
        setError(cause instanceof Error ? cause.message : "Run failed.");
        setRun((current) =>
          current?.state === "running"
            ? {
                ...current,
                state: "failed",
                finishedAt: new Date().toISOString(),
                items: current.items.map((item) =>
                  ["queued", "processing"].includes(item.status)
                    ? {
                        ...item,
                        status: "failed",
                        decision: undefined,
                        error: "Stream interrupted; result unknown. Reload to check the saved run.",
                      }
                    : item,
                ),
                events: [
                  ...current.events,
                  { at: new Date().toISOString(), message: "Client stream interrupted; result unknown" },
                ],
              }
            : current,
        );
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }
  function download() {
    if (!run) return;
    const evidence = {
      ...run,
      ...(discovery ? { discovery } : {}),
      humanOverrides: overrides,
      metrics: runMetrics(run, overrides),
      cost: "Not supplied by this adapter",
      note:
        run.mode === "demo"
          ? "Scripted synthetic demo; no Jev call. Not model-performance evidence."
          : "Provider decisions are not verified facts. Timings include local adapter overhead.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `jev-${run.mode}-${run.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const metrics = run ? runMetrics(run, overrides) : null;
  const columns = [
    { name: "Queued", states: ["queued"] },
    { name: "Processing", states: ["processing"] },
    { name: "Results & review", states: ["classified", "review", "failed", "cancelled"] },
  ];
  return (
    <section className={styles.desk} aria-label="Jev Live Desk">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Watch the work happen</p>
          <h3>Jev Live Desk</h3>
          <p>
            Hunt Hermes Agent releases, community projects, practical use cases and merged changes. Watch real
            collection, then Jev relevance and category decisions. Findings stay in the inbox below.
          </p>
        </div>
        <span className={styles.badge} data-state={run?.state}>
          {busy ? activity : run?.state === "failed" ? "JEV FAILED" : "JEV IDLE"}
        </span>
      </header>
      {status.enabled && (
        <label className={styles.consent}>
          <input type="checkbox" checked={paid} disabled={busy} onChange={(e) => setPaid(e.target.checked)} />{" "}
          Send fetched or selected public headlines/excerpts (including saved X posts) or the five synthetic
          test examples to Vercel/TypeSafe and use Gateway credits. No price estimate is available.
        </label>
      )}
      <p className={styles.notice}>
        {status.enabled && status.ready && !paid
          ? "Check the Gateway-usage box to enable Fetch news + run Jev or Test Jev. Fetch news alone uses no Gateway credits."
          : "Targeted GitHub and Hacker News searches run directly. X is a saved browser sample, not a fresh fetch. No browser is needed for the other sources."}
      </p>
      <div className={styles.controls}>
        <button
          disabled={busy || !paid || !status.enabled || !status.ready}
          onClick={() => void start("live", "pipeline")}
        >
          Fetch news + run Jev
        </button>
        <button disabled={busy} onClick={() => void start("live", "pipeline", true)}>
          Fetch news · no Jev call
        </button>
        <button
          disabled={collectingRequest || collectionPending || !xStatus.enabled}
          onClick={() => void collectOnly()}
        >
          {collectingRequest ? "Requesting X refresh…" : "Queue X refresh · no Jev call"}
        </button>
        <button
          disabled={busy || !freshCapture || !paid || !status.enabled || !status.ready}
          onClick={() => void start("live", "hunt")}
        >
          Run Jev on fresh X
        </button>
        <button
          disabled={busy || !paid || !status.enabled || !status.ready}
          onClick={() => void start("live", "benchmark")}
        >
          Test Jev · 5 labelled examples
        </button>
        <button disabled={busy} onClick={() => void start("demo")}>
          Watch demo · no API call
        </button>
        <label>
          Public stories
          <select value={count} disabled={busy} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n} stories per run
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || !paid || !status.enabled || !status.ready || !selected.length}
          onClick={() => void start("live")}
        >
          Run live Jev
        </button>
        <button disabled={!busy} onClick={() => abort.current?.abort()}>
          Cancel run
        </button>
        <button disabled={!run || busy || (restored && !showPrevious)} onClick={download}>
          Download proof JSON
        </button>
      </div>
      {run?.state === "failed" && (
        <p role="alert" className={styles.error}>
          {run.mode === "demo" ? "Demo" : "Jev"} stopped: {run.items.filter((item) => item.decision).length}/
          {run.items.length} stories evaluated.{" "}
          {run.items.find((item) => item.status === "failed")?.error ?? "No usable result was saved."}
          {run.mode === "live" &&
            run.items.some((item) => item.status === "cancelled") &&
            " The remaining stories were not attempted; they stay in Awaiting Jev."}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {discovery && <JevDiscovery discovery={discovery} run={run} />}
      <details className={styles.input}>
        <summary>X browser collection status</summary>
        <p className={styles.notice}>
          X browser collector:{" "}
          {xStatus.enabled
            ? `${xStatus.count ?? 0} saved posts · checks every 5 minutes while an X tab is accessible`
            : "disabled"}
          .{" "}
          {xStatus.lastCollectedAt
            ? `Last collected ${new Date(xStatus.lastCollectedAt).toLocaleString()}.`
            : "No successful capture yet."}{" "}
          This is a bounded search sample, not all X trends.
        </p>
        <div className={styles.collection} role="status" aria-label="X collection status">
          <strong>X: {xStatus.job?.state ?? "idle"}</strong>
          {xStatus.job?.state === "queued" ? (
            <p>
              Waiting for the Codex browser worker ·{" "}
              {Math.max(0, Math.floor((now - Date.parse(xStatus.job.requestedAt)) / 1000))} s. This refresh
              has not started browser collection and does not call Jev. The scheduled check may be delayed
              while Codex is busy. You can run Test Jev or use saved news now.
            </p>
          ) : xStatus.job?.state === "collecting" ? (
            <p>
              The browser worker has claimed this request and is collecting posts. Collection does not start
              Jev.
            </p>
          ) : xStatus.job?.message ? (
            <p>{xStatus.job.message}</p>
          ) : null}
          {freshCapture ? (
            <p>Fresh capture ready. Acknowledge Gateway usage, then choose Run Jev on fresh X.</p>
          ) : (
            <p>
              Run Jev on fresh X needs a completed, non-empty capture from the last 10 minutes. Run live Jev
              can use saved news.
            </p>
          )}
          {collectionError && (
            <p role="alert" className={styles.error}>
              {collectionError}
            </p>
          )}
        </div>
      </details>
      <p className={styles.notice}>
        {status.enabled
          ? status.ready
            ? "Jev helper and credential configured · Gateway connection is confirmed only after a successful live run · maximum 5 stories per run and 10 calls per hour."
            : "Live is enabled, but the local Jev helper or credential is unavailable."
          : "Live paid calls are disabled. Demo is scripted with synthetic examples; it does not prove Jev performance."}
      </p>

      <details className={styles.input}>
        <summary>Inputs for a live run · {selected.length} public stories</summary>
        <ul>
          {selected.map((s) => (
            <li key={s.id}>{s.title}</li>
          ))}
        </ul>
        <p>
          Only title (up to 240 characters) and summary (up to 1,200 characters) are submitted. Personal work
          and drafts are excluded.
        </p>
      </details>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {restored && run && (
        <button className={styles.previous} onClick={() => setShowPrevious(!showPrevious)}>
          {showPrevious ? "Hide" : "Show"} previous {run.mode === "demo" ? "DEMO" : "live"} result
        </button>
      )}
      {run && (!restored || showPrevious) ? (
        <>
          <div className={styles.runline}>
            <strong>{run.mode === "demo" ? "DEMO — scripted examples, no model call" : run.model}</strong>
            <span>
              {run.items.filter((s) => ["classified", "review"].includes(s.status)).length}/{run.items.length}{" "}
              decisions · {restored ? "previously saved result" : saved ? "saved result" : "current view"}
            </span>
          </div>
          <p className={styles.notice}>
            {run.mode === "demo"
              ? "Demo pacing is artificial. There are no model probabilities, inference timings or costs to report."
              : "Probabilities are model outputs, not verified correctness. Time includes adapter overhead. Cost is not supplied by this adapter."}
          </p>
          {run.mode === "live" && metrics && (
            <div className={styles.metrics} aria-label="Measured Jev results">
              <p>
                <strong>
                  {metrics.evaluated}/{metrics.total}
                </strong>{" "}
                evaluated
              </p>
              <p>
                <strong>{metrics.meanMs === null ? "—" : `${metrics.meanMs} ms`}</strong> mean Jev request
                time
              </p>
              <p>
                <strong>{metrics.p95Ms === null ? "—" : `${metrics.p95Ms} ms`}</strong> p95 request time
              </p>
              <p>
                <strong>
                  {metrics.accuracy === null
                    ? "Not measured"
                    : `${metrics.accuracy}% (${metrics.correct}/${metrics.labelled})`}
                </strong>{" "}
                {run.purpose === "benchmark"
                  ? "synthetic category test accuracy"
                  : "agreement with your category reviews"}
              </p>
              {run.purpose === "benchmark" && (
                <p>
                  <strong>
                    {metrics.relevanceCorrect}/{metrics.total}
                  </strong>{" "}
                  relevance labels matched · small synthetic test, not real-world accuracy
                </p>
              )}
              {run.collectionMs !== undefined && (
                <p>
                  <strong>{(run.collectionMs / 1000).toFixed(1)} s</strong>{" "}
                  {run.purpose === "pipeline"
                    ? "news collection time"
                    : "browser collection time, excluding queue wait"}
                </p>
              )}
            </div>
          )}
          <label className={styles.override}>
            Show decisions{" "}
            <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
              <option value="all">All results</option>
              <option value="Keep">Keep for newsroom</option>
              <option value="Review">Needs review</option>
              <option value="Drop">Excluded by Jev</option>
            </select>
          </label>
          <p className={styles.notice}>
            Keep requires a relevant result and probability ≥75% plus a usable category; uncertain results go
            to review. Confidence is not accuracy. Decisions filter this run, not the raw source feed.
          </p>
          <div className={styles.board}>
            {columns.map((column) => (
              <section key={column.name} className={styles.column} aria-label={column.name}>
                <h4>
                  {column.name}{" "}
                  <span>
                    {
                      run.items.filter(
                        (item) =>
                          column.states.includes(item.status) &&
                          (resultFilter === "all" ||
                            ["queued", "processing"].includes(item.status) ||
                            routing(item.decision) === resultFilter),
                      ).length
                    }
                  </span>
                </h4>
                {run.items
                  .filter(
                    (item) =>
                      column.states.includes(item.status) &&
                      (resultFilter === "all" ||
                        ["queued", "processing"].includes(item.status) ||
                        routing(item.decision) === resultFilter),
                  )
                  .map((item) => (
                    <article className={styles.card} key={item.id} data-status={item.status}>
                      <p className={styles.itemStatus}>
                        {item.status === "processing" ? (
                          <>
                            <span className={styles.pulse} />{" "}
                            {run.mode === "demo" ? "Playing example…" : "Waiting for Jev…"}
                          </>
                        ) : (
                          item.status
                        )}
                      </p>
                      <h5>{item.title}</h5>
                      {item.decision && (
                        <strong className={styles.choice}>
                          {overrides[item.id] ?? item.decision.category}
                          {overrides[item.id] ? " · your override" : ""}
                        </strong>
                      )}
                      {run.mode === "live" && item.elapsedMs !== undefined && (
                        <p>
                          {item.elapsedMs.toLocaleString()} ms
                          {item.decision?.tokens !== undefined ? ` · ${item.decision.tokens} tokens` : ""}
                        </p>
                      )}
                      {item.decision && run.mode === "live" && (
                        <p>
                          <strong>{routing(item.decision)}</strong> ·{" "}
                          {item.decision.relevance ?? "Relevance not returned"}
                          {item.decision.relevanceProbability !== undefined
                            ? ` · ${(item.decision.relevanceProbability * 100).toFixed(1)}% model probability`
                            : ""}
                        </p>
                      )}
                      {item.error && <p>{item.error}</p>}
                      <details>
                        <summary>Inspect input & result</summary>
                        <p>{item.summary}</p>
                        {item.sourceUrl && (
                          <a href={sourceHref(item.sourceUrl)} target="_blank" rel="noreferrer">
                            Original source
                          </a>
                        )}
                        {item.decision && (
                          <>
                            <p>Provider category: {item.decision.category}</p>
                            {CATEGORIES.map((category) => {
                              const probability = item.decision?.probabilities[category];
                              return probability === undefined ? null : (
                                <div className={styles.probability} key={category}>
                                  <span>{category}</span>
                                  <meter
                                    min={0}
                                    max={1}
                                    value={probability}
                                    aria-label={`${category} probability`}
                                  />
                                  <span>{(probability * 100).toFixed(1)}%</span>
                                </div>
                              );
                            })}
                            {!Object.keys(item.decision.probabilities).length && (
                              <p>No probabilities supplied.</p>
                            )}
                          </>
                        )}
                        <details>
                          <summary>Classification criteria</summary>
                          <ul>
                            {CATEGORIES.map((c) => (
                              <li key={c}>
                                {c}: {CRITERIA[c]}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </details>
                      {item.decision && (
                        <label className={styles.override}>
                          Your review
                          <select
                            aria-label={`Review ${item.title}`}
                            value={overrides[item.id] ?? ""}
                            onChange={(e) =>
                              setOverrides((current) => {
                                const copy = { ...current };
                                if (e.target.value) copy[item.id] = e.target.value as Category;
                                else delete copy[item.id];
                                return copy;
                              })
                            }
                          >
                            <option value="">Unreviewed / undo review</option>
                            {CATEGORIES.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </label>
                      )}
                    </article>
                  ))}
                {!run.items.some((item) => column.states.includes(item.status)) && (
                  <p className={styles.empty}>No stories here.</p>
                )}
              </section>
            ))}
          </div>
          <details className={styles.timeline} open>
            <summary>Event log · {run.events.length}</summary>
            <ol>
              {run.events.map((event, index) => (
                <li key={index}>
                  <time>{new Date(event.at).toLocaleTimeString()}</time> {event.message}
                </li>
              ))}
            </ol>
          </details>
          <p className={styles.notice}>
            Review choices affect this view and its download only. They do not change the news feed. Download
            before leaving to retain your overrides.
          </p>
          <p role="status" className={styles.status}>
            {run.state === "running" ? "Run in progress" : `Run ${run.state}`}
          </p>
        </>
      ) : (
        <p className={styles.empty}>
          Choose Fetch news to see actual collection. Fetch news + run Jev adds live evaluation after Gateway
          acknowledgement. The demo uses scripted examples.
        </p>
      )}
      <HuntInbox records={inbox} />
    </section>
  );
}
