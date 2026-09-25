import type { SourceId, Story } from "@/newsroom/model/story";
import { FIXTURE_STORIES, type FixtureStory } from "@/newsroom/fixtures/stories";
import type { NewsProvider, ProviderQuery } from "./types";

export function resolveFixture(fixture: FixtureStory, now: Date): Story {
  const { minutesAgo, detectedAfter = 2, ...story } = fixture;
  const published = now.getTime() - minutesAgo * 60_000;
  return {
    ...story,
    publishedAt: new Date(published).toISOString(),
    detectedAt: new Date(Math.min(now.getTime(), published + detectedAfter * 60_000)).toISOString(),
    saved: false,
    dismissed: false,
  };
}

export interface FixtureProviderOptions {
  id: string;
  label: string;
  sources: readonly SourceId[];
  /** Simulated failure, used by development scenarios and tests. */
  fail?: string;
  /** Simulated latency in ms. */
  delayMs?: number;
  stories?: FixtureStory[];
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    });
  });
}

/** Serves synthetic stories for a set of source families. No network access. */
export function createFixtureProvider(options: FixtureProviderOptions): NewsProvider {
  const pool = options.stories ?? FIXTURE_STORIES;
  return {
    id: options.id,
    label: options.label,
    kind: "fixture",
    sources: options.sources,
    async fetchStories(query: ProviderQuery, signal: AbortSignal) {
      if (options.delayMs) await wait(options.delayMs, signal);
      if (options.fail) throw new Error(options.fail);
      const now = new Date(query.now);
      const since = Date.parse(query.since);
      return pool
        .filter((f) => options.sources.includes(f.source))
        .map((f) => resolveFixture(f, now))
        .filter((s) => Date.parse(s.publishedAt) >= since);
    },
  };
}

/** The default fixture set, split by source family so partial failure can be shown. */
export const FIXTURE_GROUPS = [
  {
    id: "fixture:social",
    label: "Social fixtures (Reddit, X, Facebook)",
    sources: ["reddit", "x", "facebook"],
  },
  { id: "fixture:dev", label: "Developer fixtures (Hacker News, GitHub)", sources: ["hackernews", "github"] },
  {
    id: "fixture:editorial",
    label: "Editorial fixtures (blogs, research, Hermes community)",
    sources: ["official-blog", "research", "hermes-community"],
  },
] as const satisfies readonly { id: string; label: string; sources: readonly SourceId[] }[];
