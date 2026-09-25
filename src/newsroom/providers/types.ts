import type { SourceId, Story, Watchlist } from "@/newsroom/model/story";

/** What the Newsroom asks every provider for. */
export interface ProviderQuery {
  /** ISO timestamp the request treats as "now". */
  now: string;
  /** Oldest publication time worth returning (ISO). Providers may return less. */
  since: string;
}

/**
 * A source of Newsroom stories. Live adapters (Reddit, Hacker News, X,
 * Facebook, GitHub, RSS, research feeds, Hermes) implement this on the
 * server and translate their raw responses into the normalized `Story`.
 */
export interface NewsProvider {
  /** Unique id, e.g. "fixture:social" or "hackernews". */
  id: string;
  label: string;
  kind: "fixture" | "live";
  /** Source families this provider can return. */
  sources: readonly SourceId[];
  fetchStories(query: ProviderQuery, signal: AbortSignal): Promise<Story[]>;
}

export type ProviderState = "ok" | "error" | "timeout";

export interface ProviderStatus {
  id: string;
  label: string;
  kind: NewsProvider["kind"];
  state: ProviderState;
  storyCount: number;
  /** Safe, user-facing message. Never include credentials or raw responses. */
  message?: string;
  durationMs: number;
}

export interface FeedResult {
  connectedSources?: SourceId[];
  personalDaily?: { enabled: boolean; title?: string };
  stories: Story[];
  providers: ProviderStatus[];
  generatedAt: string;
  mode: "fixture" | "live" | "mixed";
  watchlists: Watchlist[];
}
