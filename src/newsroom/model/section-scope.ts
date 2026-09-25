import { applyFilters, type ApplyOptions, type NewsroomFilters } from "./filters";
import type { Story } from "./story";
import { isHermesStory } from "./weekly";
import { frontPageSelection, hermesUpdateKind, isCommunityBuild } from "./editorial";
import { selectNewspaper } from "./newspaper";

export const SECTION_TIME_LABELS: Record<string, string> = {
  "hermes-agent-updates": "Past 30 days",
  "weekly-chronicle": "Past 7 days",
  "built-with-hermes": "Past 30 days",
  archive: "All retained dates",
};

/** Shared by the workspace and Hermes so the selected evidence has the same scope. */
export function sectionStories(
  section: string,
  stories: Story[],
  filters: NewsroomFilters,
  options: ApplyOptions,
): Story[] {
  const scopedFilters = SECTION_TIME_LABELS[section]
    ? { ...filters, range: "custom" as const, from: "", to: "" }
    : filters;
  const candidates = stories.filter((story) => {
    const age = options.now.getTime() - Date.parse(story.publishedAt);
    if (section === "hermes-agent-updates")
      return age >= 0 && age <= 30 * 86400000 && hermesUpdateKind(story) !== null;
    if (section === "weekly-chronicle") return age >= 0 && age <= 7 * 86400000 && isHermesStory(story);
    if (section === "built-with-hermes") return age >= 0 && age <= 30 * 86400000 && isCommunityBuild(story);
    if (section === "archive") return story.saved || story.dismissed;
    return true;
  });
  const filtered = applyFilters(candidates, scopedFilters, {
    ...options,
    includeDismissed: section === "archive" || options.includeDismissed,
  });
  if (section === "front-page" || section === "newsroom") return frontPageSelection(filtered);
  if (section === "hermes-daily") return selectNewspaper(filtered).flatMap((page) => page.stories);
  return filtered;
}
