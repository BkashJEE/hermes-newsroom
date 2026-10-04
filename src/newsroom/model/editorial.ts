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

const BRIEFING = 5;

/**
 * A short briefing: the five events worth reading.
 *
 * Routine project activity and individual merged changes are held back, because a
 * briefing padded with them is not a briefing. But holding them back cannot mean
 * showing nothing: on a live GitHub feed those two kinds are often the *whole*
 * day's collection, and a page reading "0 selected events" while 45 things
 * happened is a broken page, not a quiet one.
 *
 * So they are a fallback rather than an exclusion — merged changes first, since
 * they are upstream Hermes work, then project activity.
 */
export function frontPageSelection(stories: Story[]): Story[] {
  const headlines = stories.filter(
    (story) => !isProjectActivity(story) && hermesUpdateKind(story) !== "change",
  );
  if (headlines.length >= BRIEFING) return headlines.slice(0, BRIEFING);
  const fallback = [
    ...stories.filter((story) => hermesUpdateKind(story) === "change"),
    ...stories.filter((story) => isProjectActivity(story) && hermesUpdateKind(story) !== "change"),
  ];
  return [...headlines, ...fallback.slice(0, BRIEFING - headlines.length)];
}
