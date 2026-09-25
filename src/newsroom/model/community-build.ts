export interface CommunityBuild {
  id: number;
  name: string;
  description: string;
  url: string;
  stars: number;
  forks: number;
  updatedAt: string;
  language: string | null;
  topics: string[];
}
export interface BuildDiscovery {
  projects: CommunityBuild[];
  fetchedAt: string;
  state: "live" | "stale" | "disabled";
  incomplete: boolean;
  message?: string;
}

/** The listing describes a project's claimed relationship, not a verified integration. */
export function parseCommunityBuild(value: unknown): CommunityBuild | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const name = typeof r.full_name === "string" ? r.full_name : "";
  const description = typeof r.description === "string" ? r.description : "";
  const topics = Array.isArray(r.topics) ? r.topics.filter((t): t is string => typeof t === "string") : [];
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(name) ||
    r.private !== false ||
    r.fork !== false ||
    r.archived !== false ||
    r.disabled === true ||
    name.toLowerCase() === "nousresearch/hermes-agent" ||
    /\bawesome\b/i.test(name)
  )
    return null;
  if (!/\bhermes\b/i.test(`${name} ${description}`) && !topics.includes("hermes-agent")) return null;
  if (
    typeof r.id !== "number" ||
    typeof r.pushed_at !== "string" ||
    !Number.isFinite(Date.parse(r.pushed_at))
  )
    return null;
  if (
    typeof r.stargazers_count !== "number" ||
    !Number.isFinite(r.stargazers_count) ||
    r.stargazers_count < 0 ||
    typeof r.forks_count !== "number" ||
    !Number.isFinite(r.forks_count) ||
    r.forks_count < 0
  )
    return null;
  return {
    id: r.id,
    name,
    description: description.slice(0, 600),
    url: `https://github.com/${name}`,
    stars: Math.floor(r.stargazers_count),
    forks: Math.floor(r.forks_count),
    updatedAt: new Date(r.pushed_at).toISOString(),
    language: typeof r.language === "string" ? r.language.slice(0, 50) : null,
    topics: topics.slice(0, 8),
  };
}
