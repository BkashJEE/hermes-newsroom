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

/** A short briefing. Quiet days stay quiet rather than filling with routine activity. */
export function frontPageSelection(stories: Story[]): Story[] {
  return stories
    .filter((story) => !isProjectActivity(story) && hermesUpdateKind(story) !== "change")
    .slice(0, 5);
}
