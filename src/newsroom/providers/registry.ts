import "server-only";
import { hermesHuntProviders } from "./hermes-hunt";
import { blueskyProvider } from "./bluesky";
import { redditProvider } from "./reddit";
import type { NewsProvider } from "./types";
import { FIXTURE_GROUPS, createFixtureProvider } from "./fixture-provider";
import type { Scenario } from "./scenarios";

/**
 * Builds the provider list for a request. Live mode uses bounded public
 * Hermes searches; development scenarios keep their synthetic providers.
 */
export function buildProviders(
  scenario: Scenario = "default",
  liveSources = false,
  social: { bluesky?: boolean; reddit?: boolean } = {},
): NewsProvider[] {
  if (liveSources && scenario === "default")
    return [
      ...hermesHuntProviders(),
      // An operator can switch a social source off; the Hermes searches stay.
      ...(social.bluesky === false ? [] : [blueskyProvider()]),
      ...(social.reddit === false ? [] : [redditProvider()]),
    ];
  return FIXTURE_GROUPS.map((group, index) =>
    createFixtureProvider({
      ...group,
      stories: scenario === "empty" ? [] : undefined,
      delayMs: scenario === "slow" ? 2500 : 0,
      fail:
        scenario === "error" || (scenario === "partial" && index === 0)
          ? "Simulated provider failure (development scenario)"
          : undefined,
    }),
  );
}
