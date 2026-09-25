import { resolveFixture } from "@/newsroom/providers/fixture-provider";
import { FIXTURE_STORIES } from "@/newsroom/fixtures/stories";
import type { Story } from "@/newsroom/model/story";

export const NOW = new Date("2026-09-21T15:00:00Z");

export function fixtureStories(now: Date = NOW): Story[] {
  return FIXTURE_STORIES.map((f) => resolveFixture(f, now));
}

export function story(overrides: Partial<Story> = {}): Story {
  return { ...fixtureStories()[0], ...overrides };
}
