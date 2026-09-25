import "server-only";
import { cached, json, publicProviders, story } from "./public-providers";
import type { NewsProvider } from "./types";
import type { Story } from "../model/story";
import { buildUpdateBrief } from "../model/update-brief";

const upstream = "NousResearch/hermes-agent";
function clean(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}
function date(value: unknown): string | null {
  const at = Date.parse(String(value));
  return Number.isFinite(at) && at <= Date.now() + 60000 ? new Date(at).toISOString() : null;
}
function githubUrl(value: unknown, path: RegExp): value is string {
  return typeof value === "string" && path.test(value);
}
function candidate(base: Story, label: string, explanation: string): Story {
  return {
    ...base,
    sourceLabel: label,
    type: "community",
    relevanceScore: 70,
    evidenceScore: 35,
    summary: base.file.fullSummary.slice(0, 1200),
    file: { ...base.file, whyItMatters: explanation, relevanceExplanation: explanation },
  };
}
/** Bounded, unauthenticated public searches. Search hits are candidates, not verified news. */
export function hermesHuntProviders(fresh = false): NewsProvider[] {
  return [
    publicProviders(fresh)[0],
    cached(
      "hermes-projects",
      "Community projects · recent activity",
      ["github"],
      async (query, signal) => {
        const params = new URLSearchParams({
          q: `"hermes-agent" in:name,description,topics fork:false archived:false is:public pushed:>=${query.since.slice(0, 10)}`,
          sort: "updated",
          order: "desc",
          per_page: "30",
        });
        const data = await json(`https://api.github.com/search/repositories?${params}`, signal);
        if (!Array.isArray(data?.items) || data.incomplete_results)
          throw new Error("Incomplete project search");
        return data.items.flatMap((r: Record<string, unknown>) => {
          const at = date(r.pushed_at);
          if (
            !at ||
            r.private !== false ||
            r.fork ||
            r.archived ||
            r.full_name === upstream ||
            !githubUrl(r.html_url, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/)
          )
            return [];
          const excerpt = `${clean(r.description) || "No project description supplied."} Topics: ${Array.isArray(r.topics) ? r.topics.map(clean).join(", ") : "none"}. Last code push: ${at}; this is not a release or proof of a working integration.`;
          return [
            candidate(
              story(
                `github:project:${r.id}`,
                clean(r.full_name),
                r.html_url,
                at,
                "github",
                excerpt,
                query.now,
              ),
              "Hermes project search",
              "Candidate project or use case. Search matches are not verified integrations; Jev must assess the excerpt, and a person should inspect the source.",
            ),
          ];
        });
      },
      fresh,
    ),
    cached(
      "hermes-changes",
      "Inside Hermes · merged changes",
      ["github"],
      async (query, signal) => {
        const params = new URLSearchParams({
          q: `repo:${upstream} is:pr is:merged merged:>=${query.since.slice(0, 10)}`,
          sort: "updated",
          order: "desc",
          per_page: "20",
        });
        const data = await json(`https://api.github.com/search/issues?${params}`, signal);
        if (!Array.isArray(data?.items) || data.incomplete_results)
          throw new Error("Incomplete changes search");
        return data.items.flatMap((r: Record<string, unknown>) => {
          const pr = r.pull_request as { merged_at?: unknown } | undefined;
          const at = date(pr?.merged_at);
          if (!at || !githubUrl(r.html_url, /^https:\/\/github\.com\/NousResearch\/hermes-agent\/pull\/\d+$/))
            return [];
          const s = candidate(
            story(
              `github:change:${r.id}`,
              `Hermes Agent: ${clean(r.title)}`,
              r.html_url,
              at,
              "github",
              `Merged upstream change, not necessarily in a published release. ${clean(r.body)}`,
              query.now,
            ),
            "Hermes merged change",
            "Merged code can reveal upcoming capabilities or fixes. A merge does not establish a released feature.",
          );
          return [
            {
              ...s,
              type: "developing" as const,
              updateBrief: buildUpdateBrief(clean(r.title), r.body, true),
            },
          ];
        });
      },
      fresh,
    ),
    cached(
      "hermes-discussions",
      "Hermes usage · Hacker News search",
      ["hackernews"],
      async (query, signal) => {
        const params = new URLSearchParams({
          query: '"hermes agent"',
          tags: "story",
          hitsPerPage: "30",
          numericFilters: `created_at_i>=${Math.floor(Date.parse(query.since) / 1000)}`,
        });
        const data = await json(`https://hn.algolia.com/api/v1/search_by_date?${params}`, signal);
        if (!Array.isArray(data?.hits)) throw new Error("Invalid discussion search");
        return data.hits.flatMap((r: Record<string, unknown>) => {
          const at = date(r.created_at);
          if (!at || !/^\d+$/.test(String(r.objectID)) || !r.title) return [];
          const excerpt =
            clean(r.story_text) ||
            "No post body supplied. The linked article has not been fetched; assess only the headline.";
          return [
            candidate(
              story(
                `hn:${r.objectID}`,
                clean(r.title),
                `https://news.ycombinator.com/item?id=${r.objectID}`,
                at,
                "hackernews",
                excerpt,
                query.now,
              ),
              "Hermes HN search",
              "Targeted Hermes discussion; sparse excerpts may need manual review.",
            ),
          ];
        });
      },
      fresh,
    ),
  ];
}
