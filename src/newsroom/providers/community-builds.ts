import "server-only";
import { parseCommunityBuild, type BuildDiscovery } from "../model/community-build";

const TTL = 10 * 60_000;
let cached: BuildDiscovery | undefined;
let pending: Promise<BuildDiscovery> | undefined;

export async function fetchCommunityBuilds(
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<BuildDiscovery> {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    q: `hermes-agent in:description,topics fork:false archived:false is:public pushed:>=${since}`,
    sort: "stars",
    order: "desc",
    per_page: "60",
  });
  const response = await fetcher(`https://api.github.com/search/repositories?${params}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Hermes-Newsroom" },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GitHub discovery unavailable (HTTP ${response.status}).`);
  const data = await response.json();
  if (!data || !Array.isArray(data.items)) throw new Error("GitHub returned an invalid project listing.");
  const seen = new Set<number>();
  const projects = data.items
    .map(parseCommunityBuild)
    .filter((project: ReturnType<typeof parseCommunityBuild>): project is NonNullable<typeof project> => {
      if (!project || seen.has(project.id)) return false;
      seen.add(project.id);
      return true;
    })
    .sort((a: { stars: number }, b: { stars: number }) => b.stars - a.stars);
  return {
    projects,
    fetchedAt: now.toISOString(),
    state: "live",
    incomplete: data.incomplete_results === true,
  };
}

export async function getCommunityBuilds(): Promise<BuildDiscovery> {
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < TTL) return cached;
  if (!pending) {
    pending = fetchCommunityBuilds()
      .then((result) => (cached = result))
      .catch((error) => {
        if (cached)
          return {
            ...cached,
            state: "stale" as const,
            message: "GitHub refresh failed. Showing the last successful popularity snapshot.",
          };
        throw error;
      })
      .finally(() => {
        pending = undefined;
      });
  }
  return pending;
}
