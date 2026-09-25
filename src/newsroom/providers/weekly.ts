import "server-only";
import { getCommunityBuilds } from "./community-builds";
import {
  hasHermesReleaseChange,
  inWeek,
  weeklyUpdate,
  type WeeklyDigest,
  type WeeklyUpdate,
} from "../model/weekly";

const TTL = 60 * 60_000;
let cached: WeeklyDigest | undefined;
let pending: Promise<WeeklyDigest> | undefined;

export async function fetchWeeklyDigest(
  fetcher: typeof fetch = fetch,
  discover = getCommunityBuilds,
  now = new Date(),
): Promise<WeeklyDigest> {
  const notices: string[] = [];
  const updates: WeeklyUpdate[] = [];
  const discovery = await discover().catch(() => {
    notices.push("Community discovery is unavailable; release coverage is incomplete.");
    return null;
  });
  if (discovery?.state === "stale" || discovery?.incomplete)
    notices.push("Community discovery is cached or incomplete.");
  const projects = (discovery?.projects ?? []).filter((p) => inWeek(p.updatedAt, now));
  // Bound unauthenticated GitHub traffic. Activity itself is never labelled a shipment.
  const candidates = [...projects]
    .sort(
      (a, b) =>
        Number(/hermes/i.test(b.name.split("/")[1])) - Number(/hermes/i.test(a.name.split("/")[1])) ||
        b.stars - a.stars,
    )
    .slice(0, 8);
  async function read(repo: string, merged: boolean) {
    try {
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Invalid repository");
      const endpoint = merged
        ? "pulls?state=closed&sort=updated&direction=desc&per_page=50"
        : "releases?per_page=5";
      const response = await fetcher(`https://api.github.com/repos/${repo}/${endpoint}`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "Hermes-Newsroom" },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Unavailable");
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error("Invalid response");
      for (const row of rows) {
        const update = weeklyUpdate(row, repo, merged, now);
        if (update && (merged || hasHermesReleaseChange(update))) updates.push(update);
      }
      if (rows.length === (merged ? 50 : 5))
        notices.push(`${repo}: checked one page; additional updates may exist.`);
    } catch {
      notices.push(`${repo}: ${merged ? "merged changes" : "release history"} unavailable or rate-limited.`);
    }
  }
  await read("NousResearch/hermes-agent", true);
  for (let i = 0; i < candidates.length; i += 4)
    await Promise.all(candidates.slice(i, i + 4).map((p) => read(p.name, false)));
  return {
    updates: [...new Map(updates.map((u) => [u.id, u])).values()].sort(
      (a, b) => Date.parse(b.at) - Date.parse(a.at),
    ),
    projects,
    since: new Date(now.getTime() - 7 * 86400000).toISOString(),
    fetchedAt: now.toISOString(),
    checkedRepositories: candidates.length,
    notices,
    state: discovery?.state === "stale" ? "stale" : "live",
  };
}

export async function getWeeklyDigest(): Promise<WeeklyDigest> {
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < TTL) return cached;
  if (!pending) {
    pending = fetchWeeklyDigest()
      .then((value) => (cached = value))
      .finally(() => {
        pending = undefined;
      });
  }
  return pending;
}
