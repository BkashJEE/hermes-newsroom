import type { Story, Watchlist } from "@/newsroom/model/story";
import type { FeedResult, NewsProvider, ProviderQuery, ProviderStatus } from "./types";

export class ProviderTimeoutError extends Error {
  constructor(ms: number) {
    super(`No response within ${ms} ms`);
    this.name = "ProviderTimeoutError";
  }
}

async function runProvider(
  provider: NewsProvider,
  query: ProviderQuery,
  timeoutMs: number,
): Promise<{ status: ProviderStatus; stories: Story[] }> {
  const controller = new AbortController();
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProviderTimeoutError(timeoutMs));
    }, timeoutMs);
  });
  const status = (partial: Pick<ProviderStatus, "state" | "storyCount" | "message">): ProviderStatus => ({
    id: provider.id,
    label: provider.label,
    kind: provider.kind,
    durationMs: Date.now() - started,
    ...partial,
  });
  try {
    const stories = await Promise.race([provider.fetchStories(query, controller.signal), timeout]);
    return { status: status({ state: "ok", storyCount: stories.length }), stories };
  } catch (error) {
    const timedOut = error instanceof ProviderTimeoutError;
    return {
      status: status({
        state: timedOut ? "timeout" : "error",
        storyCount: 0,
        // Only the error's own message: providers must keep secrets out of it.
        message: error instanceof Error ? error.message : "Unknown provider error",
      }),
      stories: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run every provider in parallel. A provider that throws or times out is
 * reported in `providers` and contributes no stories; it never fails the feed.
 */
export async function aggregateProviders(
  providers: NewsProvider[],
  query: ProviderQuery,
  options: { timeoutMs?: number; watchlists?: Watchlist[] } = {},
): Promise<FeedResult> {
  const results = await Promise.all(providers.map((p) => runProvider(p, query, options.timeoutMs ?? 8000)));
  const seen = new Map<string, Story>();
  for (const { stories } of results) {
    for (const story of stories) if (!seen.has(story.id)) seen.set(story.id, story);
  }
  const contributing = providers.filter((_, i) => results[i].status.state === "ok");
  const kinds = new Set((contributing.length ? contributing : providers).map((p) => p.kind));
  return {
    stories: [...seen.values()],
    providers: results.map((r) => r.status),
    generatedAt: query.now,
    mode: kinds.size > 1 ? "mixed" : kinds.has("live") ? "live" : "fixture",
    watchlists: options.watchlists ?? [],
  };
}
