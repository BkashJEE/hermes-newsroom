"use client";

import type { ReactNode } from "react";
import { AlertOctagon, AlertTriangle, Clock, Inbox, RotateCcw, SearchX, WifiOff } from "lucide-react";
import { useNewsroom } from "../state/newsroom-store";
import { sourceNotConnected } from "../model/source-availability";
import { SOURCE_LABELS } from "../model/story";
import styles from "./status.module.css";

type BannerKind = "partial" | "error" | "offline" | "stale";

const BANNER_ICONS = { partial: AlertTriangle, error: AlertOctagon, offline: WifiOff, stale: Clock };

export function Banner({
  kind,
  title,
  children,
  action,
}: {
  kind: BannerKind;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = BANNER_ICONS[kind];
  return (
    <div className={styles.banner} data-kind={kind} role={kind === "error" ? "alert" : "status"}>
      <Icon size={18} aria-hidden className={styles.bannerIcon} />
      <p>
        <strong>{title}</strong> {children}
      </p>
      {action}
    </div>
  );
}

/** Warnings that sit above the Front Page while stories are still shown. */
export function FeedBanners() {
  const { feed, status, stale, refresh, error, lastUpdated, now, filters, setFilters } = useNewsroom();
  if (!feed) return null;
  const failed = feed.providers.filter((p) => p.state !== "ok");
  const retry = (
    <button type="button" className={styles.bannerAction} onClick={refresh}>
      <RotateCcw size={14} aria-hidden /> Retry
    </button>
  );
  return (
    <>
      {filters.source !== "all" && sourceNotConnected(feed.mode, filters.source, feed.connectedSources) ? (
        <Banner
          kind="partial"
          title={`${SOURCE_LABELS[filters.source]} is not connected.`}
          action={
            <button
              type="button"
              className={styles.bannerAction}
              onClick={() => setFilters({ source: "all" })}
            >
              Show connected sources
            </button>
          }
        >
          This platform has no enabled collector. Selecting a source only filters collected stories; an empty
          result does not mean nothing is trending there.
        </Banner>
      ) : null}
      {status === "offline" ? (
        <Banner kind="offline" title="You are offline." action={retry}>
          Showing the stories loaded
          {lastUpdated
            ? ` at ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : ""}
          .
        </Banner>
      ) : null}
      {status === "error" ? (
        <Banner kind="error" title="Refresh failed." action={retry}>
          {error} Showing the last stories that loaded.
        </Banner>
      ) : null}
      {failed.length > 0 && failed.length < feed.providers.length ? (
        <Banner
          kind="partial"
          title={`${failed.length} of ${feed.providers.length} sources unavailable.`}
          action={retry}
        >
          {failed.map((p) => p.label).join(", ")} did not respond. Everything else is shown.
        </Banner>
      ) : null}
      {stale && status === "ready" ? (
        <Banner kind="stale" title="This feed may be out of date." action={retry}>
          It was generated {Math.round((now.getTime() - Date.parse(feed.generatedAt)) / 60_000)} minutes ago.
        </Banner>
      ) : null}
    </>
  );
}

export function StatePanel({
  icon: Icon,
  title,
  children,
  action,
  tone = "neutral",
}: {
  icon: typeof Inbox;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <section className={styles.panel} data-tone={tone} aria-live="polite">
      <Icon size={30} aria-hidden className={styles.panelIcon} />
      <h2 className={styles.panelTitle}>{title}</h2>
      {children ? <p className={styles.panelText}>{children}</p> : null}
      {action}
    </section>
  );
}

export function EmptyFeed() {
  const { refresh } = useNewsroom();
  return (
    <StatePanel
      icon={Inbox}
      title="No intelligence yet"
      action={
        <button type="button" className={styles.button} onClick={refresh}>
          Refresh
        </button>
      }
    >
      Every source answered, but none had stories. Check back soon or refresh.
    </StatePanel>
  );
}

export function NoResults() {
  const { clearFilters, filters, feed } = useNewsroom();
  const disconnected = sourceNotConnected(feed?.mode, filters.source, feed?.connectedSources);
  return (
    <StatePanel
      icon={SearchX}
      title={disconnected ? "Source connection required" : "No stories match"}
      action={
        <button type="button" className={styles.button} onClick={clearFilters}>
          Clear filters
        </button>
      }
    >
      {disconnected
        ? "No posts have been collected from this platform. Choose a connected source to see live stories."
        : filters.q
          ? `Nothing matches “${filters.q}” with the current filters.`
          : "Nothing matches the current filters."}
    </StatePanel>
  );
}

export function ProviderError() {
  const { refresh, feed } = useNewsroom();
  return (
    <StatePanel
      icon={AlertOctagon}
      tone="error"
      title="Sources are not responding"
      action={
        <button type="button" className={styles.button} onClick={refresh}>
          Try again
        </button>
      }
    >
      {feed?.providers.length ?? 0} of {feed?.providers.length ?? 0} sources failed, so there is nothing to
      show. The Newsroom will recover as soon as any source responds.
    </StatePanel>
  );
}

export function RequestError() {
  const { refresh, error } = useNewsroom();
  return (
    <StatePanel
      icon={AlertOctagon}
      tone="error"
      title="The Newsroom could not load"
      action={
        <button type="button" className={styles.button} onClick={refresh}>
          Try again
        </button>
      }
    >
      {error ?? "Something went wrong loading the feed."}
    </StatePanel>
  );
}

export function OfflineState() {
  const { refresh } = useNewsroom();
  return (
    <StatePanel
      icon={WifiOff}
      title="You are offline"
      action={
        <button type="button" className={styles.button} onClick={refresh}>
          Try again
        </button>
      }
    >
      The Newsroom needs a connection to its local server. It will reload when you are back online.
    </StatePanel>
  );
}

export function FrontPageSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="Loading intelligence">
      <div className={styles.skelLead} />
      <div className={styles.skelRow}>
        <div />
        <div />
        <div />
      </div>
      <div className={styles.skelList} />
    </div>
  );
}

export function RailSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden>
      <div className={styles.skelRail} />
      <div className={styles.skelRailShort} />
      <div className={styles.skelRailShort} />
    </div>
  );
}

export function UndoToast() {
  const { lastDismissed, undoDismiss, storyById } = useNewsroom();
  const story = storyById(lastDismissed);
  if (!story || !story.dismissed) return null;
  return (
    <div className={styles.toast} role="status">
      <span>
        Dismissed <span className={styles.toastTitle}>{story.title}</span>
      </span>
      <button type="button" onClick={undoDismiss}>
        Undo
      </button>
    </div>
  );
}
