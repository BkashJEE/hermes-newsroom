import "server-only";
import type { Story } from "../model/story";
import type { NewsProvider } from "./types";
import { buildUpdateBrief } from "../model/update-brief";

const cache = new Map<string, { until: number; stories: Story[] }>();
export async function json(url: string, signal: AbortSignal) {
  const r = await fetch(url, {
    signal,
    headers: { Accept: "application/json", "User-Agent": "Hermes-Newsroom" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Public source returned HTTP ${r.status}`);
  return r.json();
}
export function story(
  id: string,
  title: string,
  url: string,
  publishedAt: string,
  source: "github" | "hackernews",
  summary: string,
  now: string,
): Story {
  const hermes = /\bhermes\s+agent\b/i.test(title) || source === "github";
  return {
    id,
    title,
    sourceUrl: url,
    publishedAt,
    detectedAt: now,
    source,
    sourceLabel: source === "github" ? "Hermes Agent releases" : "Hacker News",
    summary: summary
      .replace(/[#*_`>]/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 300),
    type: source === "github" ? "build" : "community",
    sourceCount: 1,
    relevanceScore: hermes ? 90 : 65,
    evidenceScore: source === "github" ? 70 : 35,
    momentum: { measured: false, score: 0, direction: "steady", changePct: 0 },
    actionability: 50,
    topics: hermes ? ["Hermes Agent", "Nous Research", "AI Agents"] : ["AI", "Community", "AI Agents"],
    signals: hermes ? ["hermes"] : ["ai-models", "community"],
    status: "unconfirmed",
    recommendedAction: "track",
    saved: false,
    dismissed: false,
    image: null,
    file: {
      fullSummary: summary,
      whyItMatters:
        source === "github"
          ? "An upstream Hermes release may affect your installed agent."
          : "A current community discussion to review before drawing conclusions.",
      evidence: [
        {
          id: `${id}:source`,
          claim: title,
          sourceLabel: source === "github" ? "GitHub release" : "Hacker News submission",
          url,
        },
      ],
      conflicting: [],
      relevanceExplanation:
        "Heuristic ranking from source and title. One source only; no independent verification or measured momentum.",
      nextAction: "Open the original source and verify the details before acting.",
    },
  };
}
export function cached(
  id: string,
  label: string,
  sources: NewsProvider["sources"],
  load: NewsProvider["fetchStories"],
  fresh = false,
): NewsProvider {
  return {
    id,
    label,
    sources,
    kind: "live",
    async fetchStories(query, signal) {
      const existing = cache.get(id);
      if (!fresh && existing && existing.until > Date.now())
        return existing.stories.filter((s) => s.publishedAt >= query.since);
      const stories = await load(query, signal);
      cache.set(id, { until: Date.now() + 300000, stories });
      return stories.filter((s) => s.publishedAt >= query.since);
    },
  };
}
export function publicProviders(fresh = false): NewsProvider[] {
  return [
    cached(
      "hermes-releases",
      "Hermes Agent · GitHub releases",
      ["github"],
      async (query, signal) => {
        const releases = await json(
          "https://api.github.com/repos/NousResearch/hermes-agent/releases?per_page=15",
          signal,
        );
        if (!Array.isArray(releases)) throw new Error("Invalid GitHub response");
        return releases
          .filter(
            (r) =>
              !r.draft &&
              r.published_at &&
              typeof r.html_url === "string" &&
              r.html_url.startsWith("https://github.com/NousResearch/hermes-agent/"),
          )
          .map((r) => ({
            ...story(
              `github:hermes:${r.id}`,
              `${/^hermes agent/i.test(String(r.name)) ? "" : "Hermes Agent "}${String(r.name || r.tag_name).slice(0, 200)}`,
              r.html_url,
              new Date(r.published_at).toISOString(),
              "github",
              String(r.body || "Open the release for details.").slice(0, 2000),
              query.now,
            ),
            releaseChannel: r.prerelease ? ("prerelease" as const) : ("stable" as const),
            updateBrief: buildUpdateBrief(String(r.name || r.tag_name), r.body),
          }));
      },
      fresh,
    ),
    cached(
      "hackernews-ai",
      "Hacker News · AI discussions",
      ["hackernews"],
      async (query, signal) => {
        const ids = await json("https://hacker-news.firebaseio.com/v0/topstories.json", signal);
        if (!Array.isArray(ids)) throw new Error("Invalid Hacker News response");
        const items: Story[] = [];
        for (let offset = 0; offset < Math.min(ids.length, 80); offset += 20) {
          const batch = await Promise.all(
            ids
              .slice(offset, offset + 20)
              .map((id) => json(`https://hacker-news.firebaseio.com/v0/item/${Number(id)}.json`, signal)),
          );
          for (const item of batch) {
            if (
              !item ||
              item.dead ||
              item.deleted ||
              !item.time ||
              !/\b(ai|llm|agent|agents|model|models|claude|gpt|openai|anthropic|inference)\b/i.test(
                item.title || "",
              )
            )
              continue;
            const url = `https://news.ycombinator.com/item?id=${item.id}`;
            items.push(
              story(
                `hn:${item.id}`,
                String(item.title).slice(0, 250),
                url,
                new Date(item.time * 1000).toISOString(),
                "hackernews",
                `Community submission with ${item.score ?? 0} points and ${item.descendants ?? 0} comments when fetched. The linked article has not been independently verified.`,
                query.now,
              ),
            );
          }
        }
        return items;
      },
      fresh,
    ),
  ];
}
