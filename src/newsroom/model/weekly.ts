import type { CommunityBuild } from "./community-build";
import type { Story } from "./story";

export interface WeeklyUpdate {
  id: string;
  repo: string;
  title: string;
  summary: string;
  url: string;
  at: string;
  kind: "release" | "prerelease" | "merged";
}
export interface WeeklyDigest {
  updates: WeeklyUpdate[];
  projects: CommunityBuild[];
  since: string;
  fetchedAt: string;
  checkedRepositories: number;
  notices: string[];
  state: "live" | "stale" | "disabled";
}

export function hasHermesReleaseChange(update: WeeklyUpdate): boolean {
  return (
    /hermes/i.test(update.repo.split("/")[1] ?? "") || /\bhermes\b/i.test(`${update.title} ${update.summary}`)
  );
}

export function isHermesStory(story: Story): boolean {
  return (
    story.topics.includes("Hermes Agent") ||
    /\bhermes[ -]+agent\b/i.test(story.title) ||
    /^https:\/\/github\.com\/NousResearch\/hermes-agent(?:\/|$)/i.test(story.sourceUrl)
  );
}

export function inWeek(value: unknown, now: Date): value is string {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now.getTime() && time >= now.getTime() - 7 * 86400000;
}

/** Accept only public GitHub event URLs belonging to the requested repository. */
export function weeklyUpdate(value: unknown, repo: string, merged: boolean, now: Date): WeeklyUpdate | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const at = merged ? row.merged_at : row.published_at;
  if (!inWeek(at, now) || (!merged && row.draft) || typeof row.html_url !== "string") return null;
  const prefix = `https://github.com/${repo}/${merged ? "pull/" : "releases/tag/"}`;
  if (!row.html_url.startsWith(prefix)) return null;
  const title = merged ? row.title : row.name || row.tag_name;
  if (typeof title !== "string" || !title.trim()) return null;
  return {
    id: `${repo}:${merged ? "merge" : "release"}:${row.id}`,
    repo,
    title: title.slice(0, 220),
    summary: typeof row.body === "string" ? row.body.slice(0, 1500) : "Open the source for details.",
    url: row.html_url,
    at,
    kind: merged ? "merged" : row.prerelease ? "prerelease" : "release",
  };
}
