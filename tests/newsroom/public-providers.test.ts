import { afterEach, describe, expect, it, vi } from "vitest";
import { publicProviders } from "@/newsroom/providers/public-providers";
import { aggregateProviders } from "@/newsroom/providers/aggregate";
afterEach(() => vi.unstubAllGlobals());
describe("live sources", () => {
  it("labels a failed live feed as live, never fixture", async () => {
    const result = await aggregateProviders(
      [
        {
          id: "live",
          label: "Live",
          kind: "live",
          sources: [],
          fetchStories: async () => {
            throw new Error("unavailable");
          },
        },
      ],
      { now: new Date().toISOString(), since: "2026-01-01" },
    );
    expect(result.mode).toBe("live");
    expect(result.providers[0].state).toBe("error");
    expect(result.stories).toEqual([]);
  });
  it("normalizes official release and AI discussion without invented corroboration", async () => {
    const now = new Date().toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Response.json(
          url.includes("api.github")
            ? [
                {
                  id: 55,
                  name: "v1",
                  published_at: now,
                  html_url: "https://github.com/NousResearch/hermes-agent/releases/tag/v1",
                  body: "Release notes",
                },
              ]
            : url.includes("topstories")
              ? [1, 2, 3]
              : {
                  id: url.includes("/1.") ? 1 : 2,
                  title: url.includes("/1.")
                    ? "New AI agent"
                    : url.includes("/3.")
                      ? "Hermes radio network"
                      : "Gardening tips",
                  time: Date.now() / 1000,
                  score: 30,
                },
        ),
      ),
    );
    const result = await aggregateProviders(publicProviders(), { now, since: "2026-01-01" });
    expect(result.stories).toHaveLength(2);
    expect(
      result.stories.every(
        (s) => s.sourceCount === 1 && s.status === "unconfirmed" && s.momentum.measured === false,
      ),
    ).toBe(true);
  });
});

it("extracts update details beyond the card excerpt from the full release body", async () => {
  const now = new Date().toISOString();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json([
        {
          id: 150,
          name: "Synthetic detailed release",
          published_at: now,
          html_url: "https://github.com/NousResearch/hermes-agent/releases/tag/detailed",
          body: `${"Release context. ".repeat(180)}\n## Removed\n- Removed the obsolete cache switch.\n## Known issues\n- Offline mode is not yet supported.`,
        },
      ]),
    ),
  );
  const rows = await publicProviders(true)[0].fetchStories(
    { now, since: "2026-01-01" },
    new AbortController().signal,
  );
  expect(rows[0].file.fullSummary).not.toContain("obsolete cache switch");
  expect(rows[0].updateBrief?.groups.gone).toEqual(["Removed the obsolete cache switch."]);
  expect(rows[0].updateBrief?.groups.bad).toEqual(["Offline mode is not yet supported."]);
});

it("explicit fresh collection bypasses the public-source cache", async () => {
  const fetcher = vi.fn(async () =>
    Response.json([
      {
        id: 99,
        name: "Synthetic fresh release",
        published_at: new Date().toISOString(),
        html_url: "https://github.com/NousResearch/hermes-agent/releases/tag/synthetic",
        body: "Synthetic notes",
      },
    ]),
  );
  vi.stubGlobal("fetch", fetcher);
  const query = { now: new Date().toISOString(), since: "2026-01-01" };
  await publicProviders(true)[0].fetchStories(query, new AbortController().signal);
  await publicProviders()[0].fetchStories(query, new AbortController().signal);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await publicProviders(true)[0].fetchStories(query, new AbortController().signal);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
