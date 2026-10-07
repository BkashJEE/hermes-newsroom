"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_FILTERS,
  applyFilters,
  parseFilters,
  writeFilters,
  type NewsroomFilters,
} from "../model/filters";
import type { Story } from "../model/story";
import type { FeedResult } from "../providers/types";
import { parseScenario, type Scenario } from "../providers/scenarios";
import { readJSON, writeJSON } from "./storage";
import { archiveRequest, readArchive } from "../archive/client";
import { emptyArchive, type ArchiveData } from "../archive/model";

export const STALE_AFTER_MS = 15 * 60_000;
const LIVE_REFRESH_MS = 60_000;
const OVERLAY_KEY = "newsroom:v1:overlays";

export type FeedStatus = "loading" | "ready" | "error" | "offline";

interface Overlays {
  saved: string[];
  unsaved: string[];
  snapshots: Record<string, Story>;
  dismissed: string[];
  tracked: string[];
}

const EMPTY_OVERLAYS: Overlays = {
  saved: [],
  unsaved: [],
  snapshots: {},
  dismissed: [],
  tracked: [],
};

export interface NewsroomStore {
  // feed
  status: FeedStatus;
  feed: FeedResult | null;
  error: string | null;
  refreshing: boolean;
  lastUpdated: Date | null;
  stale: boolean;
  live: boolean;
  scenario: Scenario;
  now: Date;
  setLive: (live: boolean) => void;
  refresh: () => void;
  // stories
  stories: Story[];
  filtered: Story[];
  storyById: (id: string | null | undefined) => Story | undefined;
  // filters
  filters: NewsroomFilters;
  setFilters: (patch: Partial<NewsroomFilters>) => void;
  clearFilters: () => void;
  showDismissed: boolean;
  setShowDismissed: (show: boolean) => void;
  // overlays + actions
  tracked: Set<string>;
  toggleSave: (id: string) => void;
  toggleTrack: (id: string) => void;
  dismiss: (id: string) => void;
  restore: (id: string) => void;
  lastDismissed: string | null;
  undoDismiss: () => void;
  announcement: string;
  announce: (message: string) => void;
  archive: ArchiveData;
  archiveError: string;
  archiveReady: boolean;
  archiveSaving: boolean;
  reloadArchive: () => Promise<void>;
  // ui
  focusId: string | null;
  setFocusId: (id: string | null) => void;
  fileId: string | null;
  openFile: (id: string) => void;
  closeFile: () => void;
  dailyOpen: boolean;
  setDailyOpen: (open: boolean) => void;
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  /** Desktop nav width: "auto" follows the breakpoint, the others are the user's choice. */
  navMode: "auto" | "collapsed" | "expanded";
  setNavMode: (mode: "auto" | "collapsed" | "expanded") => void;
}

const NewsroomContext = createContext<NewsroomStore | null>(null);

export function useNewsroom(): NewsroomStore {
  const store = useContext(NewsroomContext);
  if (!store) throw new Error("useNewsroom must be used inside <NewsroomProvider>");
  return store;
}

function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function NewsroomProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/newsroom";
  const searchParams = useSearchParams();
  const filters = useMemo(() => {
    const parsed = parseFilters(new URLSearchParams(searchParams?.toString()));
    if (pathname === "/newsroom/editions") {
      parsed.range = parsed.range === "week" ? "week" : "today";
      parsed.from = "";
      parsed.to = "";
    }
    return parsed;
  }, [searchParams, pathname]);
  const scenario = parseScenario(searchParams?.get("scenario"));

  const [status, setStatus] = useState<FeedStatus>("loading");
  const [feed, setFeed] = useState<FeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [live, setLive] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [overlays, setOverlays] = useState<Overlays>(EMPTY_OVERLAYS);
  const [overlaysLoaded, setOverlaysLoaded] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [lastDismissed, setLastDismissed] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [navMode, setNavMode] = useState<"auto" | "collapsed" | "expanded">("auto");
  const [archive, setArchive] = useState<ArchiveData>(emptyArchive);
  const [archiveError, setArchiveError] = useState("");
  const [archiveReady, setArchiveReady] = useState(false);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const archiveQueue = useRef(Promise.resolve());
  const inflight = useRef<AbortController | null>(null);

  // Load per-viewer overlays after mount (storage is browser-only and optional).
  useEffect(() => {
    const stored = readJSON<Partial<Overlays>>(OVERLAY_KEY, {});
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from external storage once
    setOverlays({ ...EMPTY_OVERLAYS, ...stored });
    setOverlaysLoaded(true);
  }, []);

  useEffect(() => {
    if (overlaysLoaded) writeJSON(OVERLAY_KEY, overlays);
  }, [overlays, overlaysLoaded]);

  const reloadArchive = useCallback(async () => {
    try {
      const data = await readArchive();
      setArchive(data);
      setOverlays((o) => {
        const ids = new Set(data.records.map((r) => r.story.id));
        return {
          ...o,
          saved: [
            ...o.saved.filter((id) => !ids.has(id)),
            ...data.records.filter((r) => r.saved).map((r) => r.story.id),
          ],
          unsaved: [
            ...o.unsaved.filter((id) => !ids.has(id)),
            ...data.records.filter((r) => !r.saved).map((r) => r.story.id),
          ],
          snapshots: {
            ...o.snapshots,
            ...Object.fromEntries(data.records.map((r) => [r.story.id, r.story])),
          },
        };
      });
      setArchiveError("");
      setArchiveReady(true);
    } catch (cause) {
      setArchiveError(cause instanceof Error ? cause.message : "Permanent archive unavailable.");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from the external archive service
    void reloadArchive();
  }, [reloadArchive]);

  const load = useCallback(async () => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    const offline =
      scenario === "offline" || (typeof navigator !== "undefined" && navigator.onLine === false);
    if (offline) {
      setStatus("offline");
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    try {
      const query = scenario === "default" ? "" : `?scenario=${scenario}`;
      const response = await fetch(`/api/newsroom${query}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`The Newsroom service answered ${response.status}.`);
      const next = (await response.json()) as FeedResult;
      setFeed(next);
      setError(null);
      setStatus("ready");
      setLastUpdated(new Date());
      setNow(new Date());
    } catch (cause) {
      if (controller.signal.aborted) return;
      const unreachable = cause instanceof TypeError || navigator.onLine === false;
      setStatus(unreachable ? "offline" : "error");
      setError(cause instanceof Error ? cause.message : "Unknown error");
    } finally {
      if (inflight.current === controller) setRefreshing(false);
    }
  }, [scenario]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching the feed is the external sync
    void load();
    return () => inflight.current?.abort();
  }, [load]);

  // Live mode polls; paused mode only refreshes on demand.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void load(), LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, load]);

  // Keep relative times honest without re-fetching.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const goOffline = () => setStatus("offline");
    const goOnline = () => void load();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [load]);

  const stories = useMemo(() => {
    const saved = new Set(overlays.saved);
    const dismissed = new Set(overlays.dismissed);
    const retained = Object.values(overlays.snapshots).filter(
      (s) =>
        overlays.saved.includes(s.id) || overlays.dismissed.includes(s.id) || overlays.tracked.includes(s.id),
    );
    const candidates =
      pathname === "/newsroom/archive"
        ? [...(feed?.stories ?? []), ...retained]
        : [...retained, ...(feed?.stories ?? [])];
    const merged = new Map(candidates.map((s) => [s.id, s]));
    return [...merged.values()].map((s) => ({
      ...s,
      saved: !overlays.unsaved.includes(s.id) && (saved.has(s.id) || s.saved),
      dismissed: dismissed.has(s.id),
    }));
  }, [feed, overlays, pathname]);

  const filtered = useMemo(
    () =>
      applyFilters(stories, filters, { now, watchlists: feed?.watchlists, includeDismissed: showDismissed }),
    [stories, filters, now, feed?.watchlists, showDismissed],
  );

  const storyById = useCallback(
    (id: string | null | undefined) => (id ? stories.find((s) => s.id === id) : undefined),
    [stories],
  );

  const setFilters = useCallback(
    (patch: Partial<NewsroomFilters>) => {
      const next = writeFilters({ ...filters, ...patch }, new URLSearchParams(searchParams?.toString()));
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [filters, pathname, router, searchParams],
  );

  const clearFilters = useCallback(
    () =>
      setFilters({
        ...DEFAULT_FILTERS,
        ...(pathname === "/newsroom/editions" ? { range: filters.range } : {}),
      }),
    [setFilters, pathname, filters.range],
  );

  const announce = useCallback((message: string) => setAnnouncement(message), []);

  const title = useCallback((id: string) => stories.find((s) => s.id === id)?.title ?? "Story", [stories]);

  const toggleSave = useCallback(
    (id: string) => {
      const story = stories.find((s) => s.id === id);
      if (!story) return;
      if (!archiveReady) {
        announce("Permanent archive unavailable. Retry from Archive before saving.");
        return;
      }
      const saving = !story.saved;
      setArchiveSaving(true);
      archiveQueue.current = archiveQueue.current.then(async () => {
        try {
          await archiveRequest({ action: "story", story, saved: saving, mode: feed?.mode ?? "fixture" });
          setOverlays((o) => ({
            ...o,
            saved: saving ? [...new Set([...o.saved, id])] : o.saved.filter((x) => x !== id),
            unsaved: saving ? o.unsaved.filter((x) => x !== id) : [...new Set([...o.unsaved, id])],
            snapshots: { ...o.snapshots, [id]: story },
          }));
          await reloadArchive();
          announce(saving ? `Saved permanently: ${story.title}` : `Removed from saved: ${story.title}`);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Permanent save failed.";
          setArchiveError(message);
          announce(message);
        }
      });
      const pending = archiveQueue.current;
      void pending.finally(() => {
        if (archiveQueue.current === pending) setArchiveSaving(false);
      });
    },
    [announce, stories, archiveReady, feed, reloadArchive],
  );

  const toggleTrack = useCallback(
    (id: string) => {
      const tracking = !overlays.tracked.includes(id);
      setOverlays((o) => ({ ...o, tracked: toggleIn(o.tracked, id) }));
      announce(tracking ? `Tracking: ${title(id)}` : `Stopped tracking: ${title(id)}`);
    },
    [announce, overlays.tracked, title],
  );

  const dismiss = useCallback(
    (id: string) => {
      setOverlays((o) => ({
        ...o,
        dismissed: o.dismissed.includes(id) ? o.dismissed : [...o.dismissed, id],
        snapshots: stories.find((s) => s.id === id)
          ? { ...o.snapshots, [id]: stories.find((s) => s.id === id)! }
          : o.snapshots,
      }));
      setLastDismissed(id);
      setFocusId((current) => (current === id ? null : current));
      announce(`Dismissed: ${title(id)}`);
    },
    [announce, title, stories],
  );

  const restore = useCallback(
    (id: string) => {
      setOverlays((o) => ({ ...o, dismissed: o.dismissed.filter((x) => x !== id) }));
      setLastDismissed((current) => (current === id ? null : current));
      announce(`Restored: ${title(id)}`);
    },
    [announce, title],
  );

  const undoDismiss = useCallback(() => {
    if (lastDismissed) restore(lastDismissed);
  }, [lastDismissed, restore]);

  const openFile = useCallback((id: string) => {
    setFileId(id);
    setFocusId(id);
  }, []);

  const value = useMemo<NewsroomStore>(
    () => ({
      archive,
      archiveError,
      archiveReady,
      archiveSaving,
      reloadArchive,
      status,
      feed,
      error,
      refreshing,
      lastUpdated,
      stale: !!feed && now.getTime() - Date.parse(feed.generatedAt) > STALE_AFTER_MS,
      live,
      scenario,
      now,
      setLive,
      refresh: () => void load(),
      stories,
      filtered,
      storyById,
      filters,
      setFilters,
      clearFilters,
      showDismissed,
      setShowDismissed,
      tracked: new Set(overlays.tracked),
      toggleSave,
      toggleTrack,
      dismiss,
      restore,
      lastDismissed,
      undoDismiss,
      announcement,
      announce,
      focusId,
      setFocusId,
      fileId,
      openFile,
      closeFile: () => setFileId(null),
      dailyOpen,
      setDailyOpen,
      navOpen,
      setNavOpen,
      navMode,
      setNavMode,
    }),
    [
      archive,
      archiveError,
      archiveReady,
      archiveSaving,
      reloadArchive,
      status,
      feed,
      error,
      refreshing,
      lastUpdated,
      now,
      live,
      scenario,
      load,
      stories,
      filtered,
      storyById,
      filters,
      setFilters,
      clearFilters,
      showDismissed,
      overlays.tracked,
      toggleSave,
      toggleTrack,
      dismiss,
      restore,
      lastDismissed,
      undoDismiss,
      announcement,
      announce,
      focusId,
      fileId,
      openFile,
      dailyOpen,
      navOpen,
      navMode,
    ],
  );

  return <NewsroomContext.Provider value={value}>{children}</NewsroomContext.Provider>;
}
