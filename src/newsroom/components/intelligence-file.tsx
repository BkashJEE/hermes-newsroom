"use client";

import { Bookmark, BookmarkCheck, ExternalLink, Radar, Undo2, X } from "lucide-react";
import { RECOMMENDED_ACTIONS, type RecommendedAction } from "../model/story";
import { timeAgo } from "../model/derive";
import { useNewsroom } from "../state/newsroom-store";
import { useRunAction } from "./decision-rail";
import { Dialog, DialogClose, MomentumIndicator, RelativeTime, ScoreChip, SourceName, TypeLabel } from "./ui";
import { NewsBullets } from "./news-bullets";
import styles from "./dialogs.module.css";

const ACTION_LABELS: Record<RecommendedAction, string> = {
  track: "Track this story",
  ignore: "Dismiss this story",
};

const STATUS_LABELS = {
  confirmed: "Confirmed",
  unconfirmed: "Unconfirmed",
  disputed: "Disputed",
  corrected: "Corrected",
} as const;

export function IntelligenceFileDrawer() {
  const { fileId, closeFile, storyById, now, toggleSave, toggleTrack, tracked, dismiss, restore } =
    useNewsroom();
  const run = useRunAction();
  const story = storyById(fileId);

  return (
    <Dialog open={!!story} onClose={closeFile} labelledBy="file-title" variant="drawer">
      {story ? (
        <div className={styles.drawer}>
          <header className={styles.drawerHeader}>
            <div className={styles.drawerTop}>
              <span className={styles.eyebrow}>Intelligence file</span>
              <DialogClose label="Close intelligence file" />
            </div>
            <div className={styles.labels}>
              <TypeLabel type={story.type} size="md" />
              <span className={styles.status} data-status={story.status}>
                {STATUS_LABELS[story.status]}
              </span>
              {tracked.has(story.id) ? <span className={styles.status}>Tracking</span> : null}
            </div>
            <h2 id="file-title" className={styles.fileTitle}>
              {story.title}
            </h2>
            <p className={styles.fileMeta}>
              <SourceName source={story.source} /> <span aria-hidden>·</span> {story.sourceLabel}{" "}
              <span aria-hidden>·</span> Published{" "}
              <RelativeTime iso={story.publishedAt} label={timeAgo(story.publishedAt, now)} />{" "}
              <span aria-hidden>·</span> Detected{" "}
              <RelativeTime iso={story.detectedAt} label={timeAgo(story.detectedAt, now)} />
            </p>
            <div className={styles.chips}>
              <ScoreChip value={story.sourceCount} label="Sources" />
              <ScoreChip value={story.relevanceScore} label="Relevance" />
              <ScoreChip
                value={story.evidenceMeasured === false ? "Unmeasured" : story.evidenceScore}
                label="Evidence"
              />
              <span className={styles.momentum}>
                <MomentumIndicator momentum={story.momentum} showValue />
              </span>
            </div>
          </header>

          <div className={styles.drawerBody}>
            <section aria-labelledby="file-summary">
              <h3 id="file-summary">Full summary</h3>
              <NewsBullets text={story.file.fullSummary || story.summary} />
            </section>

            <section aria-labelledby="file-why">
              <h3 id="file-why">Why it matters</h3>
              <p>{story.file.whyItMatters}</p>
            </section>

            <section aria-labelledby="file-evidence">
              <h3 id="file-evidence">Evidence · {story.file.evidence.length}</h3>
              {story.file.evidence.length ? (
                <ul className={styles.evidence}>
                  {story.file.evidence.map((item) => (
                    <li key={item.id}>
                      <span>{item.claim}</span>
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        {item.sourceLabel} <ExternalLink size={13} aria-hidden />
                        <span className="visually-hidden"> (opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>No evidence recorded yet.</p>
              )}
            </section>

            <section aria-labelledby="file-original">
              <h3 id="file-original">Original source</h3>
              <p>
                <a
                  href={story.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.sourceLink}
                >
                  {story.sourceLabel} <ExternalLink size={13} aria-hidden />
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </p>
            </section>

            <section aria-labelledby="file-conflicting">
              <h3 id="file-conflicting">Conflicting evidence · {story.file.conflicting.length}</h3>
              {story.file.conflicting.length ? (
                <ul className={styles.evidence} data-conflicting>
                  {story.file.conflicting.map((item) => (
                    <li key={item.id}>
                      <span>{item.claim}</span>
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        {item.sourceLabel} <ExternalLink size={13} aria-hidden />
                        <span className="visually-hidden"> (opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>No conflicting evidence found.</p>
              )}
            </section>

            <section aria-labelledby="file-relevance">
              <h3 id="file-relevance">Hermes relevance · {story.relevanceScore}/100</h3>
              <p>{story.file.relevanceExplanation || "No explanation recorded."}</p>
            </section>

            <section aria-labelledby="file-next" className={styles.next}>
              <h3 id="file-next">Recommended next action</h3>
              <p>{story.file.nextAction}</p>
              <div className={styles.nextActions}>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => run(story.recommendedAction, story)}
                >
                  {ACTION_LABELS[story.recommendedAction]}
                </button>
                <label className={styles.otherAction}>
                  <span className="visually-hidden">Other action</span>
                  <select
                    value=""
                    onChange={(event) => {
                      const action = event.target.value as RecommendedAction;
                      if (action) run(action, story);
                    }}
                  >
                    <option value="">Other action…</option>
                    {RECOMMENDED_ACTIONS.filter((a) => a !== story.recommendedAction).map((a) => (
                      <option key={a} value={a}>
                        {ACTION_LABELS[a]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          </div>

          <footer className={styles.drawerFooter}>
            <button
              type="button"
              className={styles.secondary}
              aria-pressed={story.saved}
              onClick={() => toggleSave(story.id)}
            >
              {story.saved ? <BookmarkCheck size={16} aria-hidden /> : <Bookmark size={16} aria-hidden />}
              {story.saved ? "Saved" : "Save"}
            </button>
            <button
              type="button"
              className={styles.secondary}
              aria-pressed={tracked.has(story.id)}
              onClick={() => toggleTrack(story.id)}
            >
              <Radar size={16} aria-hidden /> {tracked.has(story.id) ? "Tracking" : "Track"}
            </button>
            {story.dismissed ? (
              <button type="button" className={styles.secondary} onClick={() => restore(story.id)}>
                <Undo2 size={16} aria-hidden /> Restore
              </button>
            ) : (
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  dismiss(story.id);
                  closeFile();
                }}
              >
                <X size={16} aria-hidden /> Dismiss
              </button>
            )}
          </footer>
        </div>
      ) : null}
    </Dialog>
  );
}
