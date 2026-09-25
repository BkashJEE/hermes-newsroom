import type { Story } from "./story";

/** Identify upstream updates by their original URL, never by a matching headline. */
export function hermesUpdateKind(story: Story): "release" | "change" | null {
  if (story.source !== "github") return null;
  try {
    const url = new URL(story.sourceUrl);
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    if (/^\/NousResearch\/hermes-agent\/releases\/tag\/[^/]+\/?$/i.test(url.pathname)) return "release";
    // Only the merged-change collector establishes that a PR has merged.
    if (
      /^\/NousResearch\/hermes-agent\/pull\/\d+\/?$/i.test(url.pathname) &&
      story.id.startsWith("github:change:")
    )
      return "change";
  } catch {
    // An invalid URL cannot establish an official upstream source.
  }
  return null;
}

export function isProjectActivity(story: Story): boolean {
  return story.id.startsWith("github:project:") || story.sourceLabel === "Hermes project search";
}

export function isCommunityBuild(story: Story): boolean {
  return (
    !hermesUpdateKind(story) &&
    (isProjectActivity(story) || story.type === "build" || story.topics.includes("Community Builds"))
  );
}

/** A full page. Fewer than this and the front page reads as broken, not quiet. */
const FRONT_PAGE = 8;

/**
 * Current-events briefing, not a second complete wire. Prefer headlines, then
 * fill the page with merged changes and project activity, because most days the
 * only fresh Hermes material *is* merges and new repos: preferring headlines but
 * refusing to fill left a single release on the page. Inputs have already passed
 * the editorial gate and the user's filters; never widen their time window or
 * relabel a merge/activity item as a release.
 */
export function frontPageSelection(stories: Story[]): Story[] {
  const headlines = stories.filter(
    (story) => !isProjectActivity(story) && hermesUpdateKind(story) !== "change",
  );
  if (headlines.length >= FRONT_PAGE) return headlines.slice(0, FRONT_PAGE);
  const fallback = [
    ...stories.filter((story) => hermesUpdateKind(story) === "change"),
    ...stories.filter((story) => isProjectActivity(story) && hermesUpdateKind(story) !== "change"),
  ];
  return [...headlines, ...fallback.slice(0, FRONT_PAGE - headlines.length)];
}
