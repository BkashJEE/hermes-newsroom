"use client";

import { useState } from "react";
import { hermesUpdateKind } from "../model/editorial";
import { buildUpdateBrief, UPDATE_QUESTIONS } from "../model/update-brief";
import type { Story } from "../model/story";
import styles from "./hermes-update-brief.module.css";

export function HermesUpdateBrief({ updates }: { updates: Story[] }) {
  const releases = updates.filter((story) => hermesUpdateKind(story) === "release");
  const changes = updates.filter((story) => hermesUpdateKind(story) === "change");
  const [chosen, setChosen] = useState("");
  const fallback =
    releases.find((story) => story.releaseChannel !== "prerelease")?.id ?? releases[0]?.id ?? "merged";
  const selected = chosen === "merged" || releases.some((story) => story.id === chosen) ? chosen : fallback;
  const stories = selected === "merged" ? changes : releases.filter((story) => story.id === selected);
  const briefs = stories.map((story) => ({
    story,
    brief: story.updateBrief ?? buildUpdateBrief(story.title, story.file.fullSummary, selected === "merged"),
  }));
  return (
    <section className={styles.brief} aria-label="Five questions about this update">
      <header className={styles.header}>
        <div>
          <h3>Understand the update</h3>
          <p>What changed, what is new, what is gone, what is better, and what is bad.</p>
        </div>
        <label className={styles.selector}>
          Update to explain
          <select value={selected} onChange={(event) => setChosen(event.target.value)}>
            {releases.map((story) => (
              <option key={story.id} value={story.id}>
                {story.title}
                {story.releaseChannel === "prerelease" ? " · prerelease" : ""}
              </option>
            ))}
            <option value="merged">Merged changes · not necessarily released ({changes.length})</option>
          </select>
        </label>
      </header>
      <p className={styles.context}>
        {selected === "merged"
          ? "Merged upstream over the past 30 days. These changes may not be included in a published version yet."
          : `${stories[0]?.releaseChannel === "prerelease" ? "Preview release" : "Published release"} · ${stories[0]?.title ?? "No matching release"}`}
      </p>
      <p className={styles.method}>
        Source excerpts grouped automatically from release notes and change descriptions. Improvements are
        reported by the source; missing notes do not establish that there are no problems or removals.
      </p>
      {briefs
        .filter(({ brief }) => brief.coverageNote)
        .map(({ story, brief }) => (
          <p key={story.id} className={styles.method}>
            <strong>Release-note coverage:</strong> {brief.coverageNote}{" "}
            <a href={story.sourceUrl} target="_blank" rel="noreferrer">
              Read source ↗
            </a>
          </p>
        ))}
      {briefs.some(({ brief }) => brief.truncated) ? (
        <p className={styles.method}>
          Some notes are shortened. Open the original source for the complete context.
        </p>
      ) : null}
      <div className={styles.grid}>
        {UPDATE_QUESTIONS.map((question) => {
          const items = briefs.flatMap(({ story, brief }) =>
            brief.groups[question.id].map((text) => ({ story, text })),
          );
          const list = (rows: typeof items) => (
            <ul>
              {rows.map(({ story, text }, index) => (
                <li key={`${story.id}:${index}`}>
                  <p>{text}</p>
                  <a href={story.sourceUrl} target="_blank" rel="noreferrer">
                    {selected === "merged" ? story.title : "Read release notes"} ↗
                  </a>
                </li>
              ))}
            </ul>
          );
          return (
            <section
              key={question.id}
              aria-label={question.title}
              className={styles.question}
              data-question={question.id}
            >
              <h4>{question.title}</h4>
              <p className={styles.description}>{question.description}</p>
              {items.length ? (
                <>
                  {list(items.slice(0, 3))}
                  {items.length > 3 ? (
                    <details>
                      <summary>Show {items.length - 3} more source excerpts</summary>
                      {list(items.slice(3))}
                    </details>
                  ) : null}
                </>
              ) : (
                <p className={styles.empty}>
                  {question.id === "bad"
                    ? "No explicit known issues or regressions identified in the collected notes. This is not a clean bill of health."
                    : question.id === "gone"
                      ? "No removals or deprecations identified in the collected notes."
                      : "No explicit details identified in the collected notes."}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
