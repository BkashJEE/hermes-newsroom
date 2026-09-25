"use client";

import Link from "next/link";
import { JevLiveDesk } from "./jev-live-desk";
import { CommunityBuilds } from "./community-builds";
import { WeeklyChronicleCards } from "./weekly-chronicle";
import { DailyNewspaper } from "./daily-newspaper";
import { PersonalDaily } from "./personal-daily";
import { useState, type ReactNode } from "react";
import { Boxes, FlaskConical, Share2, Trash2, Undo2, type LucideIcon } from "lucide-react";
import { NEWSROOM_BASE, sectionById } from "../sections";
import { isFiltered, sortStories, writeFilters } from "../model/filters";
import { sourceNotConnected } from "../model/source-availability";
import { hasMeasuredMomentum, timeAgo, trendingTopics } from "../model/derive";
import { useSectionStories } from "../state/use-section-stories";
import { hermesUpdateKind } from "../model/editorial";
import { HermesUpdateBrief } from "./hermes-update-brief";
import { useStickyRow } from "../state/use-sticky-row";
import type { Story } from "../model/story";
import { useNewsroom } from "../state/newsroom-store";
import { Flashcard } from "./flashcard";
import { LiveList } from "./front-page";
import { SignalMeter } from "./decision-rail";
import { FeedBanners, FrontPageSkeleton, OfflineState, RequestError } from "./status";
import { MomentumIndicator, RelativeTime, SourceName, TypeLabel } from "./ui";
import styles from "./section-page.module.css";

/** One compact, clickable story line used across section pages. */
function StoryRow({ story, action }: { story: Story; action?: ReactNode }) {
  const { now, openFile } = useNewsroom();
  return (
    <li className={styles.row}>
      <TypeLabel type={story.type} />
      <button type="button" className={styles.rowTitle} onClick={() => openFile(story.id)}>
        {story.title}
      </button>
      <span className={styles.rowMeta}>
        <SourceName source={story.source} withMark={false} /> ·{" "}
        <RelativeTime iso={story.publishedAt} label={timeAgo(story.publishedAt, now)} />
      </span>
      <span className={styles.rowScore}>
        {story.relevanceScore}
        <span className="visually-hidden"> relevance</span>
      </span>
      <MomentumIndicator momentum={story.momentum} />
      {action}
    </li>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={styles.panel} aria-label={title}>
      <header className={styles.panelHeader}>
        <h3 className={styles.panelTitle}>{title}</h3>
        {note ? <p className={styles.panelNote}>{note}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

// --- sections ---------------------------------------------------------------

function LiveWire() {
  const { filtered, filters, feed } = useNewsroom();
  const newest = sortStories(filtered, "newest");
  return (
    <>
      {" "}
      <JevLiveDesk stories={newest} />{" "}
      {newest.length === 0 ? (
        <Empty>
          {sourceNotConnected(feed?.mode, filters.source, feed?.connectedSources)
            ? "No posts have been collected from this platform. Choose a connected source to see live stories."
            : "No stories match the current filters."}
        </Empty>
      ) : (
        <LiveList
          stories={newest}
          title={`Every signal, newest first${filters.q ? ` · “${filters.q}”` : ""}`}
          limit={25}
        />
      )}
    </>
  );
}

function WeeklyChronicle() {
  const week = sortStories(useSectionStories("weekly-chronicle"), "importance");
  return <WeeklyChronicleCards stories={week} />;
}

function HermesAgentUpdates() {
  const updates = sortStories(useSectionStories("hermes-agent-updates"), "newest");
  const releases = updates.filter((story) => hermesUpdateKind(story) === "release");
  const changes = updates.filter((story) => hermesUpdateKind(story) === "change");
  return (
    <>
      <HermesUpdateBrief updates={updates} />
      <Panel
        title={`Published releases · ${releases.length}`}
        note="Official release notes from NousResearch/hermes-agent over the past 30 days. Read compatibility and upgrade instructions before choosing a version."
      >
        {releases.length ? (
          <div className={styles.cards}>
            {releases.map((story) => (
              <div key={story.id}>
                <p className={styles.panelNote}>
                  {story.releaseChannel === "prerelease"
                    ? "Prerelease · preview version"
                    : "Published release"}
                </p>
                <Flashcard story={story} />
                <a className={styles.secondary} href={story.sourceUrl} target="_blank" rel="noreferrer">
                  Read release &amp; upgrade notes ↗
                </a>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No official releases match this section’s filters.</Empty>
        )}
      </Panel>
      <Panel
        title={`Merged fixes & changes · ${changes.length}`}
        note="Merged into the upstream repository; these changes may not be included in a published version yet."
      >
        {changes.length ? (
          <ul className={styles.rows}>
            {changes.map((story) => (
              <StoryRow key={story.id} story={story} />
            ))}
          </ul>
        ) : (
          <Empty>No merged upstream changes match this section’s filters.</Empty>
        )}
      </Panel>
    </>
  );
}

function BuiltWithHermes() {
  const live = useSectionStories("built-with-hermes");
  const builds = sortStories(
    live.filter((s) => s.type === "build"),
    "importance",
  );
  const community = sortStories(
    live.filter((s) => s.type !== "build"),
    "importance",
  );
  return (
    <>
      <CommunityBuilds />
      <Panel title={`Community releases & builds · ${builds.length}`}>
        {builds.length ? (
          <div className={styles.cards}>
            {builds.map((s) => (
              <Flashcard key={s.id} story={s} />
            ))}
          </div>
        ) : (
          <Empty>No new builds right now.</Empty>
        )}
      </Panel>
      <Panel
        title={`Project activity · ${community.length}`}
        note="Project discoveries and activity, not proof of a released or tested integration."
      >
        {community.length ? (
          <ul className={styles.rows}>
            {community.map((s) => (
              <StoryRow key={s.id} story={s} />
            ))}
          </ul>
        ) : (
          <Empty>
            No matching Hermes community stories in the connected feed. X coverage depends on the optional
            browser collector; Reddit and Facebook are not connected.
          </Empty>
        )}
      </Panel>
    </>
  );
}

function TrendRadar() {
  const { filtered, filters } = useNewsroom();
  const topics = trendingTopics(filtered, 10);
  const measured = hasMeasuredMomentum(filtered);
  const largest = Math.max(1, ...topics.map((t) => t.stories));
  return (
    <div className={styles.split}>
      <Panel
        title="Top topics"
        note={
          measured
            ? "Momentum across sources in the current view. Select a topic to search it."
            : "Ranked by story count in the current view. Live sources do not measure growth yet; these are coverage counts, not viral rankings."
        }
      >
        {topics.length === 0 ? <Empty>No topics in the current view.</Empty> : null}
        <ol className={styles.radar}>
          {topics.map((t) => (
            <li key={t.topic}>
              <Link
                href={`${NEWSROOM_BASE}?${writeFilters({ ...filters, q: t.topic })}`}
                className={styles.radarRow}
              >
                <span className={styles.briefRank}>{t.rank}</span>
                <span className={styles.radarTopic}>{t.topic}</span>
                <span
                  className={styles.radarTrack}
                  role="meter"
                  aria-label={`${t.topic} ${measured ? "momentum" : "stories"}`}
                  aria-valuemin={0}
                  aria-valuemax={measured ? 100 : largest}
                  aria-valuenow={measured ? t.momentum : t.stories}
                >
                  <span
                    className={styles.radarFill}
                    style={{ width: `${measured ? t.momentum : (t.stories / largest) * 100}%` }}
                  />
                </span>
                <span className={styles.radarValue}>{measured ? t.momentum : t.stories}</span>
                <span className={styles.radarChange} data-negative={t.changePct < 0 || undefined}>
                  {measured ? `${t.changePct >= 0 ? "↑" : "↓"} ${Math.abs(t.changePct)}%` : "stories"}
                </span>
                <span className={styles.radarSources}>
                  {t.sources} {t.sources === 1 ? "source" : "sources"}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </Panel>
      <SignalMeter />
    </div>
  );
}

function Archive() {
  const { restore } = useNewsroom();
  const stories = useSectionStories("archive");
  const saved = sortStories(
    stories.filter((s) => s.saved),
    "newest",
  );
  const dismissed = sortStories(
    stories.filter((s) => s.dismissed),
    "newest",
  );
  return (
    <>
      <Panel
        title={`Saved · ${saved.length}`}
        note="Kept on this device across all retained dates. Search, source and watchlist filters apply."
      >
        {saved.length ? (
          <div className={styles.cards}>
            {saved.map((s) => (
              <Flashcard key={s.id} story={s} />
            ))}
          </div>
        ) : (
          <Empty>No saved stories yet. Use the bookmark on any card or story.</Empty>
        )}
      </Panel>
      <Panel title={`Dismissed · ${dismissed.length}`}>
        {dismissed.length ? (
          <ul className={styles.rows}>
            {dismissed.map((s) => (
              <StoryRow
                key={s.id}
                story={s}
                action={
                  <button type="button" className={styles.restore} onClick={() => restore(s.id)}>
                    <Undo2 size={14} aria-hidden /> Restore
                  </button>
                }
              />
            ))}
          </ul>
        ) : (
          <Empty>Nothing dismissed.</Empty>
        )}
      </Panel>
    </>
  );
}

const SECTION_BODIES: Record<string, () => ReactNode> = {
  "hermes-agent-updates": HermesAgentUpdates,
  "live-wire": LiveWire,
  "hermes-daily": DailyNewspaper,
  "weekly-chronicle": WeeklyChronicle,
  "built-with-hermes": BuiltWithHermes,
  "trend-radar": TrendRadar,
  archive: Archive,
};

/** A Newsroom workspace built from the current feed and local saved records. */
export function SectionPage({ sectionId }: { sectionId: string }) {
  const { feed, status, filters, clearFilters } = useNewsroom();
  const headingRef = useStickyRow("--section-heading-height", sectionId);
  const section = sectionById(sectionId);
  if (!section) return null;
  if (sectionId === "personal-daily") return <PersonalDaily />;
  const Icon = section.icon;
  const Body = SECTION_BODIES[section.id];

  return (
    <section
      className={styles.page}
      aria-labelledby="section-title"
      data-newspaper-section={sectionId === "hermes-daily" || undefined}
    >
      <header ref={headingRef} className={styles.header} data-section-heading>
        <span className={styles.icon}>
          <Icon size={26} aria-hidden />
        </span>
        <div className={styles.headText}>
          <div className={styles.titleRow}>
            <h2 id="section-title" className={styles.title}>
              {section.label}
            </h2>
            <span className={styles.pill}>Workspace</span>
          </div>
          <p className={styles.description}>{section.description}</p>
          {isFiltered(filters) ? (
            <button type="button" className={styles.secondary} onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
      </header>

      {!feed ? (
        status === "loading" ? (
          <FrontPageSkeleton />
        ) : status === "offline" ? (
          <OfflineState />
        ) : (
          <RequestError />
        )
      ) : (
        <>
          <FeedBanners />
          {Body ? <Body /> : null}
        </>
      )}
    </section>
  );
}
