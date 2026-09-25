"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X, Zap } from "lucide-react";
import { useNewsroom } from "../state/newsroom-store";
import { tickerStories, timeAgo } from "../model/derive";
import { readJSON, writeJSON } from "../state/storage";
import styles from "./breaking-ticker.module.css";

const ROTATE_MS = 8000;
const DISMISS_KEY = "newsroom:v1:ticker-dismissed";

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  query?.addEventListener?.("change", callback);
  return () => query?.removeEventListener?.("change", callback);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    () => true,
  );
}

/**
 * Slim breaking-intelligence strip. It swaps items (no scrolling marquee),
 * pauses on hover/focus or on request, stops when the Newsroom is paused, and
 * never advances by itself when reduced motion is preferred.
 */
export function BreakingTicker() {
  const { stories, now, openFile, live } = useNewsroom();
  const items = tickerStories(stories.filter((s) => !s.dismissed));
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[] | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read session storage after mount
    setDismissedIds(readJSON<string[]>(DISMISS_KEY, [], "session"));
  }, []);

  const autoAdvance = items.length > 1 && !paused && !hovered && !reducedMotion && live;

  useEffect(() => {
    if (!autoAdvance) return;
    const timer = setInterval(() => setIndex((i) => i + 1), ROTATE_MS);
    return () => clearInterval(timer);
  }, [autoAdvance]);

  // Hidden until storage is read, and once every current item is dismissed.
  const key = items.map((s) => s.id).join("|");
  if (dismissedIds === null || items.length === 0 || dismissedIds.includes(key)) return null;

  const story = items[index % items.length];
  const position = (index % items.length) + 1;

  function dismiss() {
    const next = [...(dismissedIds ?? []), key];
    setDismissedIds(next);
    writeJSON(DISMISS_KEY, next, "session");
  }

  return (
    <section
      className={styles.ticker}
      aria-label="Breaking intelligence"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setHovered(false);
      }}
    >
      <span className={styles.label}>
        <Zap size={16} aria-hidden /> Breaking
      </span>
      <button type="button" className={styles.item} onClick={() => openFile(story.id)} key={story.id}>
        <span className={styles.headline}>{story.title}</span>
        <span className={styles.meta}>
          <span aria-hidden>•</span> {story.sourceCount} sources <span aria-hidden>•</span>{" "}
          {timeAgo(story.publishedAt, now)}
        </span>
      </button>
      <div className={styles.controls}>
        {items.length > 1 ? (
          <>
            <span
              className={`${styles.count} ${styles.optional}`}
              aria-label={`Item ${position} of ${items.length}`}
            >
              {position}/{items.length}
            </span>
            <button
              type="button"
              className={styles.optional}
              aria-label="Previous breaking item"
              onClick={() => setIndex((i) => i - 1 + items.length)}
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <button
              type="button"
              className={styles.optional}
              aria-label="Next breaking item"
              onClick={() => setIndex((i) => i + 1)}
            >
              <ChevronRight size={16} aria-hidden />
            </button>
            {reducedMotion ? null : (
              <button
                type="button"
                aria-label={paused ? "Resume ticker" : "Pause ticker"}
                aria-pressed={paused}
                onClick={() => setPaused(!paused)}
              >
                {paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
              </button>
            )}
          </>
        ) : null}
        <button type="button" aria-label="Dismiss breaking ticker" onClick={dismiss}>
          <X size={16} aria-hidden />
        </button>
      </div>
    </section>
  );
}
