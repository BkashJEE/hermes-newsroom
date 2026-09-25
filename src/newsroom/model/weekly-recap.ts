import { newspaperExcerpt } from "./newspaper";

export interface WeeklyEntry {
  id: string;
  title: string;
  summary: string;
  url: string;
  at: string;
  label: string;
  desk: "inside" | "community";
  released: boolean;
  activity?: boolean;
  topics: string[];
  source: string;
  type: string;
}

/** Keep source wording bounded even when a release is one long CJK paragraph. */
export function weeklyPoints(text: string, count = 2, length = 120): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
  const points = text
    .split(/\n+/)
    .flatMap((line) => Array.from(segmenter.segment(line), (part) => newspaperExcerpt(part.segment, length)))
    .filter((point) => point && !/^(?:sha-?256|checksum|https?:\/\/)/i.test(point));
  return [...new Set(points)].slice(0, count);
}

function repository(url: string): string | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parsed.hostname === "github.com" && parts.length >= 2
      ? parts.slice(0, 2).join("/").toLowerCase()
      : null;
  } catch {
    return null;
  }
}

/** One release recap per repository/channel; never merge previews into shipped releases. */
export function groupWeeklyEntries(entries: WeeklyEntry[]) {
  const unique = [...new Map(entries.map((entry) => [entry.url, entry])).values()].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  );
  const releaseRepos = new Set(unique.filter((e) => /release/i.test(e.label)).map((e) => repository(e.url)));
  const grouped = new Map<string, WeeklyEntry & { sources: WeeklyEntry[] }>();
  for (const entry of unique) {
    const repo = repository(entry.url);
    if (entry.activity && repo && releaseRepos.has(repo)) continue;
    const key =
      repo && /release/i.test(entry.label) && !/merged/i.test(entry.label)
        ? `${repo}:${entry.released ? "stable" : "preview"}`
        : entry.url;
    const existing = grouped.get(key);
    if (existing) existing.sources.push(entry);
    else grouped.set(key, { ...entry, sources: [entry] });
  }
  return [...grouped.values()];
}
