import type { NextRequest } from "next/server";
import { aggregateProviders } from "@/newsroom/providers/aggregate";
import { applyEditorialGate } from "@/newsroom/model/newsworthy";
import { LIVE_SOURCES } from "@/newsroom/model/source-availability";
import { buildProviders } from "@/newsroom/providers/registry";
import { parseScenario, scenariosEnabled } from "@/newsroom/providers/scenarios";
import { loadNewsroomConfig } from "@/newsroom/config/load-config";
import { readXState } from "@/newsroom/browser-x/server";
import { xStory } from "@/newsroom/browser-x/model";

const THIRTY_DAYS = 30 * 24 * 3_600_000;
const STALE_OFFSET = 47 * 60_000;

/** Aggregated Newsroom feed. Providers (and any future credentials) stay on the server. */
export async function GET(request: NextRequest) {
  const requested = parseScenario(request.nextUrl.searchParams.get("scenario"));
  const scenario = scenariosEnabled() ? requested : "default";
  const now = new Date();
  const config = await loadNewsroomConfig();
  const feed = await aggregateProviders(
    [
      ...buildProviders(scenario, config.liveSources, config.socialSources),
      ...(config.liveSources && config.xBrowser?.enabled && scenario === "default"
        ? [
            {
              id: "x-browser",
              label: "X · browser search sample",
              kind: "live" as const,
              sources: ["x" as const],
              async fetchStories(query: import("@/newsroom/providers/types").ProviderQuery) {
                try {
                  return (await readXState()).posts.filter((p) => p.publishedAt >= query.since).map(xStory);
                } catch {
                  throw new Error("X capture storage is unavailable.");
                }
              },
            },
          ]
        : []),
    ],
    { now: now.toISOString(), since: new Date(now.getTime() - THIRTY_DAYS).toISOString() },
    { watchlists: config.watchlists },
  );
  // Live search backends also return mere existence (a repo that exists, a passing
  // mention). Development scenarios keep their fixtures exactly as authored.
  let filtered = 0;
  if (config.liveSources && scenario === "default") {
    const gate = applyEditorialGate(feed.stories);
    filtered = gate.dropped.length;
    feed.stories = gate.kept;
  }
  if (scenario === "stale") feed.generatedAt = new Date(now.getTime() - STALE_OFFSET).toISOString();
  return Response.json(
    {
      ...feed,
      filteredOut: filtered || undefined,
      connectedSources: config.liveSources
        ? [
            ...LIVE_SOURCES.filter((source) =>
              source === "bluesky" || source === "reddit" ? config.socialSources?.[source] !== false : true,
            ),
            ...(config.xBrowser?.enabled ? ["x"] : []),
          ]
        : undefined,
      personalDaily: config.personalDaily.enabled
        ? { enabled: true, title: config.personalDaily.title }
        : { enabled: false },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
