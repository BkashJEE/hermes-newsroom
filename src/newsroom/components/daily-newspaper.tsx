"use client";

import { useMemo, useState } from "react";
import { Copy, Printer, LayoutGrid, Newspaper } from "lucide-react";
import { useNewsroom } from "../state/newsroom-store";
import { newspaperExcerpt, selectNewspaper, sourceHref } from "../model/newspaper";
import { SOURCE_LABELS, STORY_TYPE_LABELS, type Story } from "../model/story";
import { TIME_RANGE_LABELS } from "../model/filters";
import { Flashcard } from "./flashcard";
import styles from "./daily-newspaper.module.css";

export function DailyNewspaper() {
  const { filtered, feed, filters, openFile, announce } = useNewsroom();
  const [view, setView] = useState<"cards" | "newspaper">("newspaper");
  const sections = useMemo(() => selectNewspaper(filtered), [filtered]);
  const selected = sections.flatMap((section) => section.stories);
  const cards = selected;
  const cutoff = feed?.generatedAt ?? "";
  const date = cutoff
    ? new Date(cutoff).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
    : "";
  const scope = `${filters.source === "all" ? "All sources" : SOURCE_LABELS[filters.source]} · ${TIME_RANGE_LABELS[filters.range]}`;
  const mode =
    feed?.mode === "fixture"
      ? "Sample edition · fixture data"
      : feed?.mode === "mixed"
        ? "Mixed live and sample data"
        : "Public news edition";
  const ref = (story: Story) => selected.findIndex((item) => item.id === story.id) + 1;

  async function copy() {
    const text = [
      "HERMES DAILY",
      `${date} · ${mode} · ${scope}`,
      `Source cutoff: ${cutoff}`,
      ...sections.map(
        (section) =>
          `\n${section.title}\n${section.stories.length ? section.stories.map((story) => `${story.title}\n- ${newspaperExcerpt(story.summary)}\n- Why it matters: ${newspaperExcerpt(story.file.whyItMatters, 200)}\n- Suggested next step: ${newspaperExcerpt(story.file.nextAction, 160)}\nSource: ${sourceHref(story.sourceUrl) ?? "Unavailable"}`).join("\n\n") : section.empty}`,
      ),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      announce("Daily newspaper copied with source links.");
    } catch {
      announce("Copy failed. Select the newspaper text to copy it.");
    }
  }

  const storyArticle = (story: Story, lead: boolean) => (
    <article key={story.id} className={`${styles.story} ${lead ? styles.lead : ""}`}>
      <p className={styles.kicker}>
        {STORY_TYPE_LABELS[story.type]} · {story.status}
      </p>
      <h4>
        <button onClick={() => openFile(story.id)} type="button" title="Open full intelligence file">
          {newspaperExcerpt(story.title, 145)}
        </button>
      </h4>
      <p className={styles.byline}>
        {SOURCE_LABELS[story.source]} ·{" "}
        {new Date(story.publishedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })}{" "}
        · Evidence {story.evidenceMeasured === false ? "Unmeasured" : `${story.evidenceScore}/100`}
      </p>
      <ul>
        <li>{newspaperExcerpt(story.summary) || "No summary supplied. Read the original source."}</li>
        <li>
          <strong>Why it matters:</strong> {newspaperExcerpt(story.file.whyItMatters, 200) || "Not assessed."}
        </li>
        <li>
          <strong>Suggested next step:</strong>{" "}
          {newspaperExcerpt(story.file.nextAction, 160) || "Review the source."}
        </li>
      </ul>
      {sourceHref(story.sourceUrl) ? (
        <a href={sourceHref(story.sourceUrl)} target="_blank" rel="noreferrer">
          Read source [{ref(story)}]
        </a>
      ) : (
        <span>Source link unavailable</span>
      )}
    </article>
  );

  function masthead(page: number, title: string, subtitle: string) {
    return (
      <>
        {page === 1 ? (
          <header className={styles.masthead}>
            <p>Your daily intelligence. Worth your attention.</p>
            <h2>HERMES DAILY</h2>
            <div>
              {date} · {mode} · UTC
            </div>
          </header>
        ) : (
          <div className={styles.runningHead}>
            <strong>Hermes Daily</strong>
            <span>
              {date} · {mode}
            </span>
          </div>
        )}
        <header className={styles.sectionHead}>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </header>
      </>
    );
  }
  function footer(page: number) {
    return (
      <footer className={styles.footer}>
        <span>
          {mode} · {scope}
        </span>
        <span>{page} / 4</span>
      </footer>
    );
  }

  return (
    <div className={styles.reader} data-newspaper-reader data-view={view}>
      <div className={styles.toolbar} data-section-toolbar>
        <div>
          <strong>Daily selection · {cards.length} stories</strong>
          <p>A short edition from {filtered.length} matching signals · source links included</p>
        </div>
        <div className={styles.viewSwitch} role="group" aria-label="Daily view">
          <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")}>
            <LayoutGrid size={16} aria-hidden /> Flashcards
          </button>
          <button type="button" aria-pressed={view === "newspaper"} onClick={() => setView("newspaper")}>
            <Newspaper size={16} aria-hidden /> Newspaper
          </button>
        </div>
        <button type="button" onClick={() => window.print()}>
          <Printer size={16} aria-hidden /> Print / Save PDF
        </button>
        <button type="button" onClick={() => void copy()} disabled={!selected.length}>
          <Copy size={16} aria-hidden /> Copy newspaper
        </button>
      </div>
      <div className={styles.cardView}>
        {cards.length ? (
          <div className={styles.cardGrid} aria-label="Daily flashcards">
            {cards.map((story) => (
              <Flashcard key={story.id} story={{ ...story, summary: newspaperExcerpt(story.summary, 300) }} />
            ))}
          </div>
        ) : (
          <p className={styles.cardEmpty}>
            No stories match the current filters. Change the source, time range or search.
          </p>
        )}
        <details className={styles.method}>
          <summary>How this edition is built</summary>
          <p>
            Both views contain the same short selection of up to nine stories across three news pages,
            followed by a source ledger in the newspaper. Both use feed excerpts assembled locally. Use the
            Hermes Agent panel for an agent-written brief.
          </p>
        </details>
      </div>
      <div className={styles.edition}>
        <p className={styles.hint}>
          Read below, or choose “Save as PDF” in the print dialog. A4 portrait, 100% scale; turn browser
          headers and footers off.
        </p>
        <nav className={styles.pageNav} aria-label="Newspaper pages">
          {[...sections.map((s) => s.title), "Sources & Editorial Notes"].map((title, i) => (
            <a key={title} href={`#daily-page-${i + 1}`}>
              {i + 1}. {title}
            </a>
          ))}
        </nav>
        {sections.map((section, index) => (
          <section
            key={section.title}
            id={`daily-page-${index + 1}`}
            className={styles.sheet}
            aria-label={`Newspaper page ${index + 1}: ${section.title}`}
            data-newspaper-sheet
          >
            {masthead(index + 1, section.title, section.subtitle)}
            <div className={styles.pageBody}>
              {section.stories.length ? (
                <div className={index === 0 ? styles.frontStories : styles.stories}>
                  {section.stories.map((story, i) => storyArticle(story, index === 0 && i === 0))}
                </div>
              ) : (
                <p className={styles.empty}>{section.empty}</p>
              )}
              {index === 0 && (
                <aside className={styles.deskNote}>
                  <h4>From the editor’s desk</h4>
                  <p>
                    {selected.length} selected stories from{" "}
                    {filtered.filter((story) => !story.dismissed).length} matching items. This edition
                    assembles feed excerpts locally; it is not an agent-written report. Headlines open the
                    full intelligence file. Suggested actions have not been executed.
                  </p>
                </aside>
              )}
            </div>
            {footer(index + 1)}
          </section>
        ))}
        <section
          id="daily-page-4"
          className={styles.sheet}
          aria-label="Newspaper page 4: Sources & Editorial Notes"
          data-newspaper-sheet
        >
          {masthead(4, "Sources & Editorial Notes", "Follow the evidence. Know the gaps.")}
          <div className={styles.pageBody}>
            <p className={styles.cutoff}>
              Feed retrieved:{" "}
              <time dateTime={cutoff}>{cutoff ? new Date(cutoff).toUTCString() : "Unavailable"}</time>.
              Filters: {scope}
              {filters.q ? ` · Search: ${filters.q}` : ""}
              {filters.type !== "all" ? ` · Type: ${STORY_TYPE_LABELS[filters.type]}` : ""}
              {filters.watch ? ` · Watchlist: ${filters.watch}` : ""}
              {filters.range === "custom" ? ` · ${filters.from} to ${filters.to}` : ""}.
            </p>
            <ol className={styles.sourceList}>
              {selected.map((story) => (
                <li key={story.id}>
                  <strong>{newspaperExcerpt(story.title, 110)}</strong>
                  <span>
                    {SOURCE_LABELS[story.source]} · {story.status} · {story.sourceCount} source
                    {story.sourceCount === 1 ? "" : "s"}
                  </span>
                  {sourceHref(story.sourceUrl) ? (
                    <a href={sourceHref(story.sourceUrl)} target="_blank" rel="noreferrer">
                      [{ref(story)}] {new URL(story.sourceUrl).hostname} · Open original
                    </a>
                  ) : (
                    <span>Source link unavailable</span>
                  )}
                </li>
              ))}
            </ol>
            {!selected.length && <p className={styles.empty}>No sources to list for the current filters.</p>}
            <aside className={styles.deskNote}>
              <h4>Coverage & method</h4>
              <ul>
                <li>
                  Stories are ranked by relevance, evidence and momentum. Up to three stories per news page;
                  specialist stories are reserved for their sections. Dismissed items are excluded.
                </li>
                <li>
                  Excerpts may be shortened. Read the linked source for full context. Evidence scores are
                  signals, not independent verification.
                </li>
                <li>
                  Source status:{" "}
                  {feed?.providers
                    .map((provider) => `${provider.label}: ${provider.state} (${provider.storyCount})`)
                    .join("; ") || "Unavailable"}
                  .
                </li>
                <li>Personal conversations are not included in this public-news edition.</li>
              </ul>
            </aside>
          </div>
          {footer(4)}
        </section>
      </div>
    </div>
  );
}
