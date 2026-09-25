"use client";

import {
  ArrowRight,
  Boxes,
  ChevronRight,
  FlaskConical,
  Lightbulb,
  MessageSquareReply,
  Radar,
  Share2,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { hasMeasuredMomentum, pickLead, signalMeter, trendingTopics } from "../model/derive";
import type { RecommendedAction, Story } from "../model/story";
import { useNewsroom } from "../state/newsroom-store";
import { useSectionStories } from "../state/use-section-stories";
import styles from "./decision-rail.module.css";

const ACTIONS: { id: RecommendedAction; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "track", label: "Track", hint: "Follow for updates", icon: Radar },
  { id: "ignore", label: "Ignore", hint: "Not relevant for now", icon: X },
];

/** Run a recommended action locally. Nothing leaves this device. */
export function useRunAction() {
  const { toggleTrack, dismiss } = useNewsroom();
  return (action: RecommendedAction, story: Story) => {
    if (action === "track") toggleTrack(story.id);
    else dismiss(story.id);
  };
}

function WhatShouldIDo() {
  const { focusId, storyById, tracked, announcement, openFile } = useNewsroom();
  const filtered = useSectionStories("front-page");
  const run = useRunAction();
  const focused = storyById(focusId);
  const story = focused && !focused.dismissed ? focused : pickLead(filtered);

  return (
    <section className={styles.panel} aria-labelledby="wsid-heading">
      <header className={styles.header}>
        <h2 id="wsid-heading" className={styles.title}>
          What should I do?
        </h2>
        {story ? (
          <p className={styles.sub}>
            For:{" "}
            <button type="button" className={styles.storyLink} onClick={() => openFile(story.id)}>
              {story.title}
            </button>
          </p>
        ) : (
          <p className={styles.sub}>No story selected.</p>
        )}
      </header>
      <ul className={styles.actions}>
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          const recommended = story?.recommendedAction === action.id;
          const isTracking = action.id === "track" && story ? tracked.has(story.id) : false;
          return (
            <li key={action.id}>
              <button
                type="button"
                className={styles.action}
                data-action={action.id}
                data-recommended={recommended || undefined}
                disabled={!story}
                aria-pressed={action.id === "track" ? isTracking : undefined}
                onClick={() => story && run(action.id, story)}
              >
                <Icon size={18} aria-hidden className={styles.actionIcon} />
                <span className={styles.actionLabel}>
                  {action.id === "track" && isTracking ? "Tracking" : action.label}
                </span>
                <span className={styles.actionHint}>
                  {recommended ? <span className={styles.recommended}>Recommended</span> : action.hint}
                </span>
                <ChevronRight size={16} aria-hidden className={styles.chevron} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className={styles.result} aria-hidden>
        {announcement || "Actions stay on this device. Nothing is posted."}
      </p>
    </section>
  );
}

export function SignalMeter() {
  const { filtered } = useNewsroom();
  const readings = signalMeter(filtered);
  const measured = hasMeasuredMomentum(filtered);
  return (
    <section className={styles.panel} aria-labelledby="signal-heading">
      <header className={styles.header}>
        <h2 id="signal-heading" className={styles.title}>
          {measured ? "Signal Meter" : "Coverage by topic"}
        </h2>
        <p className={styles.sub}>
          {measured
            ? "Activity in the current view, 0–100"
            : "Share of matching stories. Categories may overlap; growth is unmeasured."}
        </p>
      </header>
      <ul className={styles.meters}>
        {readings.map((r) => (
          <li key={r.area} className={styles.meterRow}>
            <span className={styles.meterLabel} id={`meter-${r.area}`}>
              {r.label}
            </span>
            <span
              className={styles.meterTrack}
              role="meter"
              aria-labelledby={`meter-${r.area}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={r.value}
              aria-valuetext={
                measured
                  ? `${r.value} of 100, ${r.level}`
                  : `${r.count} of ${filtered.length} stories, ${r.value}%`
              }
            >
              <span className={styles.meterFill} data-area={r.area} style={{ width: `${r.value}%` }} />
            </span>
            <span className={styles.meterValue}>
              {r.value}
              {measured ? "" : "%"}
            </span>
            <span className="visually-hidden">{measured ? r.level : `${r.count} stories`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TrendingNow() {
  const { filtered, setFilters } = useNewsroom();
  const topics = trendingTopics(filtered);
  const measured = hasMeasuredMomentum(filtered);
  return (
    <section className={styles.panel} aria-labelledby="trending-heading">
      <header className={styles.header}>
        <h2 id="trending-heading" className={styles.title}>
          {measured ? "Trending Now" : "Topics in this feed"}
        </h2>
        <p className={styles.sub}>
          {measured ? "Combined momentum across sources" : "Ranked by story count; growth is unmeasured"}
        </p>
      </header>
      {topics.length === 0 ? (
        <p className={styles.empty}>No topics in the current view.</p>
      ) : (
        <ol className={styles.trending}>
          {topics.map((t) => (
            <li key={t.topic}>
              <button
                type="button"
                className={styles.trend}
                onClick={() => setFilters({ q: t.topic })}
                title={`Search for ${t.topic}`}
              >
                <span className={styles.rank}>{t.rank}</span>
                <span className={styles.topic}>{t.topic}</span>
                <span className={styles.change} data-negative={t.changePct < 0 || undefined}>
                  {measured
                    ? `${t.changePct >= 0 ? "↑" : "↓"} ${Math.abs(t.changePct)}%`
                    : `${t.stories} stories`}
                  {measured ? <span className="visually-hidden"> momentum change</span> : null}
                </span>
                <span className={styles.sources}>
                  {t.sources} {t.sources === 1 ? "source" : "sources"}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function DecisionRail() {
  return (
    <>
      <WhatShouldIDo />
      <SignalMeter />
      <TrendingNow />
    </>
  );
}
