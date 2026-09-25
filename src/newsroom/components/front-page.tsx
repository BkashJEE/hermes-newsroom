"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BarChart3, Bookmark, BookmarkCheck, FileText, ShieldCheck } from "lucide-react";
import { SORT_KEYS, SORT_LABELS, TYPE_OPTIONS, isFiltered, type SortKey } from "../model/filters";
import { timeAgo } from "../model/derive";
import type { Story, StoryType } from "../model/story";
import { useNewsroom } from "../state/newsroom-store";
import { useSectionStories } from "../state/use-section-stories";
import { Flashcard } from "./flashcard";
import { DecisionRail } from "./decision-rail";
import {
  EmptyFeed,
  FeedBanners,
  FrontPageSkeleton,
  NoResults,
  OfflineState,
  ProviderError,
  RailSkeleton,
  RequestError,
} from "./status";
import { MomentumIndicator, RelativeTime, ScoreChip, SourceName, TypeLabel } from "./ui";
import { NewsBullets } from "./news-bullets";
import styles from "./front-page.module.css";

const LIVE_LIST_LIMIT = 10;

function ViewBar({ selectedCount }: { selectedCount: number }) {
  const { filters, setFilters, filtered, stories, showDismissed, setShowDismissed, clearFilters, feed } =
    useNewsroom();
  const dismissedCount = stories.filter((s) => s.dismissed).length;
  const watchlist = feed?.watchlists.find((w) => w.id === filters.watch);
  return (
    <div className={styles.viewBar}>
      <label className={styles.field}>
        <span>Type</span>
        <select
          value={filters.type}
          onChange={(event) => setFilters({ type: event.target.value as StoryType | "all" })}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span>Sort</span>
        <select
          value={filters.sort}
          onChange={(event) => setFilters({ sort: event.target.value as SortKey })}
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </label>
      <details className={styles.scoring}>
        <summary>How this ranking works</summary>
        <p>
          Selected: {SORT_LABELS[filters.sort]}. This changes the lead, flashcards and list. Equal scores are
          ordered by newest publication, then story ID.
        </p>
        <ul>
          <li>
            Hermes relevance: source/title heuristic until a reviewed model assessment is applied. Current
            base values: GitHub 90, HN 65 (90 for an explicit Hermes Agent title), X browser matches 60.
          </li>
          <li>
            Evidence: GitHub release 70, HN submission 35, X post 25. These are source heuristics, not
            fact-check probabilities.
          </li>
          <li>
            Importance: 45% relevance + 35% evidence + 20% momentum. Unmeasured momentum contributes zero.
          </li>
          <li>
            Fastest rising requires repeated engagement measurements; currently unavailable for live sources.
            Ties fall back to newest.
          </li>
          <li>
            Actionability: coarse provider defaults (GitHub/HN 50, X 40). Least covered uses source count;
            one-source stories often tie.
          </li>
          <li>
            Jev&apos;s hunt decides Hermes relevance and category, then keeps, excludes or requests review.
            Model confidence does not increase evidence strength or prove popularity.
          </li>
        </ul>
      </details>
      <p className={styles.count} aria-live="polite">
        <strong>{selectedCount}</strong> {selectedCount === 1 ? "headline" : "headlines"} selected from{" "}
        {filtered.length} matching signals
        {watchlist ? <> in {watchlist.label}</> : null}
      </p>
      {dismissedCount > 0 ? (
        <button
          type="button"
          className={styles.textButton}
          aria-pressed={showDismissed}
          onClick={() => setShowDismissed(!showDismissed)}
        >
          {showDismissed ? "Hide" : "Show"} {dismissedCount} dismissed
        </button>
      ) : null}
      {isFiltered(filters) ? (
        <button type="button" className={styles.textButton} onClick={clearFilters}>
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function LeadStory({ story }: { story: Story }) {
  const { now, openFile, toggleSave } = useNewsroom();
  return (
    <article
      className={styles.lead}
      aria-labelledby="lead-headline"
      data-no-image={!story.image || undefined}
    >
      <div className={styles.leadText}>
        <div className={styles.leadTop}>
          <TypeLabel type={story.type} size="md" />
          <span className={styles.leadMeta}>
            <RelativeTime iso={story.publishedAt} label={timeAgo(story.publishedAt, now)} />
            <span aria-hidden> · </span>
            <SourceName source={story.source} withMark={false} />
          </span>
        </div>
        <h2 id="lead-headline" className={styles.leadHeadline}>
          {story.title}
        </h2>
        <NewsBullets className={styles.leadSummary} text={story.summary} />
        <div className={styles.chips}>
          <ScoreChip icon={FileText} value={story.sourceCount} label="Sources" />
          <ScoreChip icon={BarChart3} value={story.relevanceScore} label="Relevance" />
          <ScoreChip
            icon={ShieldCheck}
            value={story.evidenceMeasured === false ? "Unmeasured" : story.evidenceScore}
            label="Evidence"
          />
          <span className={styles.momentumChip}>
            <MomentumIndicator momentum={story.momentum} />
            {story.momentum.measured !== false ? (
              <span className="visually-hidden">momentum {story.momentum.score}</span>
            ) : null}
          </span>
        </div>
        <div className={styles.leadActions}>
          <button type="button" className={styles.primary} onClick={() => openFile(story.id)}>
            Open Intelligence File <ArrowRight size={18} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.secondary}
            aria-pressed={story.saved}
            onClick={() => toggleSave(story.id)}
          >
            {story.saved ? <BookmarkCheck size={17} aria-hidden /> : <Bookmark size={17} aria-hidden />}
            {story.saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
      {story.image ? (
        <div className={styles.leadVisual}>
          <Image
            src={story.image.src}
            alt={story.image.alt}
            fill
            sizes="(min-width: 1600px) 40vw, 90vw"
            unoptimized
          />
        </div>
      ) : null}
    </article>
  );
}

export function LiveList({
  stories,
  title = "Live Intelligence",
  limit = LIVE_LIST_LIMIT,
}: {
  stories: Story[];
  title?: string;
  limit?: number;
}) {
  const { now, openFile, restore } = useNewsroom();
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? stories : stories.slice(0, limit);
  return (
    <section className={styles.live} aria-labelledby="live-heading">
      <header className={styles.liveHeader}>
        <h2 id="live-heading" className={styles.sectionTitle}>
          {title}
        </h2>
        <p className={styles.liveNote}>
          <span className={styles.dot} aria-hidden /> {rows.length} of {stories.length} matching stories
        </p>
      </header>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Time</th>
              <th scope="col">Headline</th>
              <th scope="col" className={styles.num}>
                Relevance
              </th>
              <th scope="col">Momentum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((story) => (
              <tr
                key={story.id}
                data-dismissed={story.dismissed || undefined}
                onClick={() => openFile(story.id)}
              >
                <td>
                  <SourceName source={story.source} />
                </td>
                <td className={styles.time}>
                  <RelativeTime iso={story.publishedAt} label={timeAgo(story.publishedAt, now)} />
                </td>
                <td className={styles.headlineCell}>
                  <TypeLabel type={story.type} />
                  <button
                    type="button"
                    className={styles.rowButton}
                    onClick={(event) => {
                      event.stopPropagation();
                      openFile(story.id);
                    }}
                  >
                    {story.title}
                  </button>
                  {story.saved ? <span className={styles.rowFlag}>Saved</span> : null}
                  {story.dismissed ? (
                    <button
                      type="button"
                      className={styles.restore}
                      onClick={(event) => {
                        event.stopPropagation();
                        restore(story.id);
                      }}
                    >
                      Restore
                    </button>
                  ) : null}
                </td>
                <td className={`${styles.num} ${styles.score}`}>{story.relevanceScore}</td>
                <td>
                  <MomentumIndicator momentum={story.momentum} showValue />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {stories.length > limit ? (
        <button type="button" className={styles.textButton} onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show fewer" : `Show all ${stories.length}`}
        </button>
      ) : null}
    </section>
  );
}

function FrontPageContent() {
  const { status, feed, stories, filtered } = useNewsroom();
  const headlines = useSectionStories("front-page");

  if (!feed) {
    if (status === "loading") return <FrontPageSkeleton />;
    if (status === "offline") return <OfflineState />;
    return <RequestError />;
  }
  const allFailed = feed.providers.length > 0 && feed.providers.every((p) => p.state !== "ok");
  const body = allFailed ? (
    <ProviderError />
  ) : stories.length === 0 ? (
    <EmptyFeed />
  ) : filtered.length === 0 ? (
    <NoResults />
  ) : headlines.length === 0 ? (
    <p>
      No headline selections in this view. Browse <Link href="/newsroom/live-wire">Live Wire</Link> for all
      incoming signals, or <Link href="/newsroom/hermes-agent-updates">Hermes Agent Updates</Link> for
      releases and fixes.
    </p>
  ) : (
    <Stories stories={headlines} limit={8} />
  );

  return (
    <>
      <FeedBanners />
      {!allFailed && stories.length > 0 ? <ViewBar selectedCount={headlines.length} /> : null}
      <p>
        Up to eight headlines.{" "}
        <Link href="/newsroom/hermes-agent-updates">Official releases &amp; fixes</Link> ·{" "}
        <Link href="/newsroom/built-with-hermes">Community projects</Link> ·{" "}
        <Link href="/newsroom/live-wire">All incoming signals</Link>
      </p>
      {body}
    </>
  );
}

function Stories({ stories, limit }: { stories: Story[]; limit: number }) {
  const lead = stories[0];
  const cards = stories.slice(1, 4);
  return (
    <>
      {lead ? <LeadStory story={lead} /> : null}
      <section className={styles.cards} aria-label="Flashcards">
        {cards.map((story) => (
          <Flashcard key={story.id} story={story} />
        ))}
      </section>
      <LiveList key={limit} stories={stories} title="Selected headlines" limit={limit} />
    </>
  );
}

/** Front Page: centre workspace plus the decision rail. */
export function FrontPage() {
  const { feed } = useNewsroom();
  return (
    <div data-layout="front" className={styles.layout}>
      <div className={styles.center}>
        <FrontPageContent />
      </div>
      <aside className={styles.rail} aria-label="Decision rail">
        {feed ? <DecisionRail /> : <RailSkeleton />}
      </aside>
    </div>
  );
}
