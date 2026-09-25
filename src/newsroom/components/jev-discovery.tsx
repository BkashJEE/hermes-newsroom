import type { Discovery, RunSnapshot } from "../jev/model";
import { routing } from "../jev/model";
import { sourceHref } from "../model/newspaper";
import styles from "./jev-live-desk.module.css";
export function JevDiscovery({ discovery, run }: { discovery: Discovery; run: RunSnapshot | null }) {
  const selected = new Set(discovery.selectedIds);
  const done = run?.items.filter((item) => item.decision) ?? [];
  const failedRequest = run?.items.find((item) => item.status === "failed")?.error;
  const stage = run?.state === "failed" ? "failed" : discovery.stage;
  const stopped = ["cancelled", "failed"].includes(stage);
  const evaluating = stage === "evaluating" || (stopped && !!run);
  const collected =
    stage !== "collecting" && discovery.sources.every((source) => source.state !== "fetching");
  const itemById = new Map(run?.items.map((item) => [item.id, item]) ?? []);
  const candidateById = new Map(discovery.candidates.map((story) => [story.id, story]));
  const selectedStories = discovery.selectedIds
    .map((id) => candidateById.get(id))
    .filter((story) => story !== undefined);
  const selectedStatus = (id: string) => {
    const item = itemById.get(id);
    if (item?.status === "cancelled") return run?.state === "failed" ? "NOT ATTEMPTED" : "CANCELLED";
    if (item?.status === "failed") return "JEV FAILED";
    if (item?.decision) return `JEV RESULT · ${routing(item.decision)}`;
    if (item?.status === "processing") return "JEV IN PROGRESS";
    return "AWAITING JEV";
  };
  return (
    <section className={styles.discovery} aria-label="Live news process">
      <header className={styles.header}>
        <h3>News → selection → Jev → review</h3>
        <span className={styles.badge} data-state={stage}>
          {stage.toUpperCase()}
        </span>
      </header>
      <ol className={styles.stages} aria-label="News process stages">
        <li data-state={stage === "collecting" ? "current" : collected ? "complete" : "failed"}>
          <span>01 · COLLECT</span>
          <strong>{discovery.candidates.length} stories found</strong>
          <small>
            {collected
              ? "Source requests finished"
              : stage === "collecting"
                ? "Reading public sources"
                : "Collection stopped"}
          </small>
        </li>
        <li data-state={stage === "selected" ? "current" : selected.size ? "complete" : "pending"}>
          <span>02 · SELECT</span>
          <strong>{selected.size} for Jev</strong>
          <small>Chosen from collected candidates</small>
        </li>
        <li
          data-state={
            stopped && run
              ? "failed"
              : stage === "evaluating"
                ? "current"
                : stage === "complete"
                  ? "complete"
                  : "pending"
          }
        >
          <span>03 · JEV EVALUATE</span>
          <strong>
            {done.length}/{selected.size} decisions
          </strong>
          <small>
            {stopped && run
              ? "Stopped on a request"
              : stage === "evaluating"
                ? "Requests in progress"
                : stage === "complete"
                  ? "Evaluation finished"
                  : "Not started"}
          </small>
        </li>
        <li data-state={stage === "complete" ? "complete" : "pending"}>
          <span>04 · REVIEW</span>
          <strong>{stage === "complete" ? "Ready" : "Waiting"}</strong>
          <small>
            {stopped
              ? done.length
                ? "Review available decisions"
                : "No decisions to review"
              : "Keep, review or drop"}
          </small>
        </li>
      </ol>
      {evaluating && (
        <p className={styles.processResult} data-state={stage}>
          {stopped
            ? stage === "failed"
              ? `Jev stopped after ${done.length} of ${selected.size} decisions. ${run?.items.filter((item) => item.status === "cancelled").length ?? 0} selected stories were not attempted.`
              : `Run cancelled after ${done.length} of ${selected.size} decisions. No further stories were started.`
            : `Jev is evaluating selected stories one at a time: ${done.length} of ${selected.size} decisions returned.`}
          {stage === "failed" && failedRequest && <strong>{failedRequest}</strong>}
        </p>
      )}
      <div className={styles.sources} aria-label="Source collection progress">
        {discovery.sources.map((source) => (
          <article key={source.id}>
            <strong>{source.label}</strong>
            <p>
              {source.state === "fetching"
                ? source.kind === "network"
                  ? "Fetching from public API…"
                  : "Reading saved sample…"
                : source.state}{" "}
              · {source.count} stories
            </p>
            {source.elapsedMs !== undefined && (
              <p>
                {source.elapsedMs} ms ·{" "}
                {source.kind === "saved" ? "local read, not a browser fetch" : "source request time"}
              </p>
            )}
            {source.capturedAt && <p>Captured {new Date(source.capturedAt).toLocaleString()}</p>}
            {source.message && <p>{source.message}</p>}
          </article>
        ))}
      </div>
      <p className={styles.notice}>
        {discovery.selectionRule} Collection took {discovery.elapsedMs} ms so far. This run considers the last
        30 days; page filters do not limit this collection.
      </p>
      {selectedStories.length > 0 && (
        <div className={styles.selection}>
          <h4>Selected for this run · {selectedStories.length}</h4>
          <ol className={styles.selectedCards} aria-label="Selected stories and Jev status">
            {selectedStories.map((story) => (
              <li key={story.id} data-state={itemById.get(story.id)?.status ?? "queued"}>
                <span className={styles.candidateState}>{selectedStatus(story.id)}</span>
                <a href={sourceHref(story.sourceUrl) ?? undefined} target="_blank" rel="noreferrer">
                  {story.title}
                </a>
                <small>{story.channel ?? story.source}</small>
              </li>
            ))}
          </ol>
        </div>
      )}
      {discovery.stage === "selected" && !run && (
        <p>
          Collection finished. No Jev call has started. Use Fetch news + run Jev to collect again and evaluate
          the selected stories.
        </p>
      )}
      <details className={styles.input}>
        <summary>
          Collected stories · {discovery.candidates.length} · {selected.size} selected
        </summary>
        <ol className={styles.candidates}>
          {discovery.candidates.map((story) => (
            <li key={story.id} data-selected={selected.has(story.id)}>
              <div>
                <span className={styles.candidateState}>
                  {selected.has(story.id)
                    ? `SELECTED · ${selectedStatus(story.id)}`
                    : story.evaluated
                      ? "ALREADY EVALUATED · SKIPPED"
                      : discovery.stage === "collecting"
                        ? "COLLECTED"
                        : "OUTSIDE THIS BATCH"}
                </span>{" "}
                · {story.channel ?? story.source} ·{" "}
                {story.newToNewsroom ? "New to this newsroom" : "Seen before"}
              </div>
              <a href={sourceHref(story.sourceUrl) ?? undefined} target="_blank" rel="noreferrer">
                {story.title}
              </a>
            </li>
          ))}
        </ol>
      </details>
      <div className={styles.outcomes} aria-label="Jev routing counts">
        {(["Keep", "Review", "Drop"] as const).map((label) => (
          <p key={label}>
            <strong>{done.filter((item) => routing(item.decision) === label).length}</strong> {label}
          </p>
        ))}
      </div>
    </section>
  );
}
