import "server-only";
import type { Story } from "../model/story";
import type { NewsProvider, ProviderQuery } from "./types";

const cache = new Map<string, { until: number; since: number; stories: Story[] }>();

/** Five-minute snapshots retain original detection times; failures never become empty success. */
export function socialProvider(
  id: string,
  label: string,
  source: "bluesky" | "reddit",
  load: NewsProvider["fetchStories"],
  fresh: boolean,
): NewsProvider {
  return {
    id,
    label,
    sources: [source],
    kind: "live",
    async fetchStories(query, signal) {
      signal.throwIfAborted();
      const since = Date.parse(query.since);
      const now = Date.parse(query.now);
      if (!Number.isFinite(since) || !Number.isFinite(now) || since > now)
        throw new Error("Invalid social search time window.");
      const existing = cache.get(id);
      let stories: Story[];
      if (!fresh && existing && existing.until > Date.now() && since >= existing.since) {
        stories = existing.stories;
      } else {
        // Invalidate before a refresh: a failed refresh must not resurrect old success.
        cache.delete(id);
        stories = await load(query, signal);
        signal.throwIfAborted();
        cache.set(id, { until: Date.now() + 300000, since, stories });
      }
      return stories.filter((s) => Date.parse(s.publishedAt) >= since && Date.parse(s.publishedAt) <= now);
    },
  };
}

export const SEARCH_PHRASES = ['"Hermes Agent"', '"Nous Research"'] as const;
export const mentionsHermes = (text: string) => /\b(?:hermes[\s-]+agent|nous[\s-]+research)\b/i.test(text);

export function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function publication(value: unknown, query: ProviderQuery): string | null {
  if (typeof value !== "string") return null;
  const at = Date.parse(value);
  return Number.isFinite(at) && at >= Date.parse(query.since) && at <= Date.parse(query.now)
    ? new Date(at).toISOString()
    : null;
}

/** A single returned post is one source, never independent corroboration. */
export function socialStory(input: {
  id: string;
  source: "bluesky" | "reddit";
  label: string;
  url: string;
  title: string;
  text: string;
  publishedAt: string;
  now: string;
}): Story {
  return {
    id: input.id,
    source: input.source,
    sourceLabel: input.label,
    sourceUrl: input.url,
    title: input.title,
    summary: input.text.slice(0, 1200),
    publishedAt: input.publishedAt,
    detectedAt: input.now,
    type: "community",
    sourceCount: 1,
    // Keyword relevance is a ranking heuristic, not a provider confidence score.
    relevanceScore: 70,
    evidenceMeasured: false,
    evidenceScore: 0,
    momentum: { measured: false, score: 0, direction: "steady", changePct: 0 },
    actionability: 0,
    topics: [/hermes[\s-]+agent/i.test(input.text + input.title) ? "Hermes Agent" : "Nous Research"],
    signals: ["hermes", "community"],
    status: "unconfirmed",
    recommendedAction: "track",
    saved: false,
    dismissed: false,
    image: null,
    file: {
      fullSummary: input.text,
      whyItMatters:
        "A public Hermes ecosystem mention; the original author's claim is not independently verified.",
      evidence: [
        {
          id: `${input.id}:source`,
          claim: input.text || input.title,
          sourceLabel: input.label,
          url: input.url,
        },
      ],
      conflicting: [],
      relevanceExplanation:
        "Keyword-match ranking only. One returned post is one source. Evidence quality and momentum are unmeasured; reactions, replies and embedded links are not corroboration. Bounded search sample, not exhaustive coverage.",
      nextAction: "Read the original post and verify the reported event before acting.",
    },
  };
}

/** Never expose upstream response bodies or raw network errors in provider status. */
export async function searchResponse(
  url: string,
  signal: AbortSignal,
  label: string,
  accept = "application/json",
): Promise<Response> {
  signal.throwIfAborted();
  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: accept,
        "User-Agent": "linux:hermes-newsroom:0.1.0 (local read-only public news reader)",
      },
    });
  } catch {
    signal.throwIfAborted();
    throw new Error(`${label} search is unavailable.`);
  }
  if (!response.ok) throw new Error(`${label} search returned HTTP ${response.status}.`);
  return response;
}

export async function searchJson(url: string, signal: AbortSignal, label: string): Promise<unknown> {
  const response = await searchResponse(url, signal, label);
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} search returned invalid JSON.`);
  }
}
