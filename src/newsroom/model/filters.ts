import {
  SOURCE_IDS,
  SOURCE_LABELS,
  STORY_TYPES,
  STORY_TYPE_LABELS,
  importance,
  type SourceId,
  type Story,
  type StoryType,
  type Watchlist,
} from "./story";

export const TIME_RANGES = ["live", "hour", "today", "24h", "week", "custom"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  live: "Live",
  hour: "Last Hour",
  today: "Today",
  "24h": "Last 24 Hours",
  week: "This Week",
  custom: "Custom",
};

export const SORT_KEYS = [
  "relevance",
  "importance",
  "rising",
  "newest",
  "evidence",
  "actionable",
  "least-covered",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  relevance: "Hermes Relevance",
  importance: "Most Important",
  rising: "Fastest Rising",
  newest: "Newest",
  evidence: "Evidence Strength",
  actionable: "Most Actionable",
  "least-covered": "Least Covered",
};

export const SOURCE_OPTIONS: { value: SourceId | "all"; label: string }[] = [
  { value: "all", label: "All Sources" },
  ...SOURCE_IDS.map((id) => ({ value: id, label: SOURCE_LABELS[id] })),
];

export const TYPE_OPTIONS: { value: StoryType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  ...STORY_TYPES.map((type) => ({ value: type, label: STORY_TYPE_LABELS[type] })),
];

export interface NewsroomFilters {
  q: string;
  source: SourceId | "all";
  range: TimeRange;
  /** yyyy-mm-dd, only used when range is "custom" */
  from: string;
  to: string;
  type: StoryType | "all";
  sort: SortKey;
  watch: string;
}

export const DEFAULT_FILTERS: NewsroomFilters = {
  q: "",
  source: "all",
  range: "24h",
  from: "",
  to: "",
  type: "all",
  sort: "relevance",
  watch: "",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Parse filters from a query string, ignoring anything unknown or malformed. */
export function parseFilters(params: URLSearchParams): NewsroomFilters {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  return {
    q: (params.get("q") ?? "").slice(0, 200),
    source: oneOf(params.get("source"), ["all", ...SOURCE_IDS], "all"),
    range: oneOf(params.get("range"), TIME_RANGES, DEFAULT_FILTERS.range),
    from: DATE_RE.test(from) ? from : "",
    to: DATE_RE.test(to) ? to : "",
    type: oneOf(params.get("type"), ["all", ...STORY_TYPES], "all"),
    sort: oneOf(params.get("sort"), SORT_KEYS, DEFAULT_FILTERS.sort),
    watch: (params.get("watch") ?? "").slice(0, 64),
  };
}

/** Serialize filters, omitting defaults so URLs stay short. Keeps unrelated params. */
export function writeFilters(filters: NewsroomFilters, base?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const key of Object.keys(DEFAULT_FILTERS) as (keyof NewsroomFilters)[]) {
    const value = filters[key];
    const isCustomDate = key === "from" || key === "to";
    if (!value || value === DEFAULT_FILTERS[key] || (isCustomDate && filters.range !== "custom")) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  return params;
}

export function isFiltered(filters: NewsroomFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    filters.source !== "all" ||
    filters.range !== DEFAULT_FILTERS.range ||
    filters.type !== "all" ||
    filters.watch !== ""
  );
}

/** [start, end] window in epoch ms for a time range, relative to `now`. */
export function timeWindow(filters: NewsroomFilters, now: Date): [number, number] {
  const end = now.getTime();
  const HOUR = 3_600_000;
  switch (filters.range) {
    case "live":
      return [end - 15 * 60_000, end];
    case "hour":
      return [end - HOUR, end];
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return [start.getTime(), end];
    }
    case "24h":
      return [end - 24 * HOUR, end];
    case "week":
      return [end - 7 * 24 * HOUR, end];
    case "custom": {
      const start = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : 0;
      const stop = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : end;
      return [start, stop];
    }
  }
}

export function matchesSearch(story: Story, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    story.title,
    story.summary,
    story.sourceLabel,
    SOURCE_LABELS[story.source],
    ...story.topics,
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function matchesWatchlist(story: Story, watchlist: Watchlist | undefined): boolean {
  if (!watchlist) return true;
  return story.topics.some((topic) => watchlist.topics.includes(topic));
}

const comparators: Record<SortKey, (a: Story, b: Story) => number> = {
  relevance: (a, b) => b.relevanceScore - a.relevanceScore,
  importance: (a, b) => importance(b) - importance(a),
  rising: (a, b) => b.momentum.changePct - a.momentum.changePct,
  newest: (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  evidence: (a, b) => b.evidenceScore - a.evidenceScore,
  actionable: (a, b) => b.actionability - a.actionability,
  "least-covered": (a, b) => a.sourceCount - b.sourceCount || b.relevanceScore - a.relevanceScore,
};

export function sortStories(stories: Story[], sort: SortKey): Story[] {
  const compare = comparators[sort];
  // Stable tie-break on newest, then id, so the order never jitters between renders.
  return [...stories].sort(
    (a, b) =>
      compare(a, b) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id),
  );
}

export interface ApplyOptions {
  now: Date;
  watchlists?: Watchlist[];
  includeDismissed?: boolean;
}

/** Search, filter and sort. Dismissed stories are excluded unless asked for. */
export function applyFilters(stories: Story[], filters: NewsroomFilters, options: ApplyOptions): Story[] {
  const [start, end] = timeWindow(filters, options.now);
  const watchlist = filters.watch ? options.watchlists?.find((w) => w.id === filters.watch) : undefined;
  const kept = stories.filter((story) => {
    if (!options.includeDismissed && story.dismissed) return false;
    if (filters.source !== "all" && story.source !== filters.source) return false;
    if (filters.type !== "all" && story.type !== filters.type) return false;
    const published = Date.parse(story.publishedAt);
    if (published < start || published > end) return false;
    if (filters.watch && !matchesWatchlist(story, watchlist)) return false;
    return matchesSearch(story, filters.q);
  });
  return sortStories(kept, filters.sort);
}
