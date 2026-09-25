import { describe, expect, it, vi } from "vitest";
import { fetchWeeklyDigest } from "@/newsroom/providers/weekly";
import { weeklyUpdate, isHermesStory, hasHermesReleaseChange } from "@/newsroom/model/weekly";
import { story, NOW } from "./helpers";

const at = NOW.toISOString();
const release = {
  id: 1,
  name: "Synthetic release",
  body: "A documented change.",
  published_at: at,
  html_url: "https://github.com/example/hermes-tool/releases/tag/v1",
  draft: false,
};
describe("weekly public evidence", () => {
  it("does not include unrelated release notes from a general integration project", () => {
    const update = weeklyUpdate(release, "example/hermes-tool", false, NOW)!;
    expect(hasHermesReleaseChange(update)).toBe(true);
    expect(hasHermesReleaseChange({ ...update, repo: "example/general-tools" })).toBe(false);
    expect(
      hasHermesReleaseChange({
        ...update,
        repo: "example/general-tools",
        summary: "Fix the Hermes provider.",
      }),
    ).toBe(true);
  });
  it("distinguishes published releases, prereleases and merged changes", () => {
    expect(weeklyUpdate(release, "example/hermes-tool", false, NOW)?.kind).toBe("release");
    expect(weeklyUpdate({ ...release, prerelease: true }, "example/hermes-tool", false, NOW)?.kind).toBe(
      "prerelease",
    );
    expect(
      weeklyUpdate(
        {
          id: 2,
          title: "Fix synthetic transport",
          merged_at: at,
          html_url: "https://github.com/NousResearch/hermes-agent/pull/2",
        },
        "NousResearch/hermes-agent",
        true,
        NOW,
      )?.kind,
    ).toBe("merged");
  });
  it("rejects drafts, old/future releases, unmerged changes and unrelated URLs", () => {
    for (const patch of [
      { draft: true },
      { published_at: "2025-01-01" },
      { published_at: "2027-01-01" },
      { html_url: "https://example.com/release" },
    ])
      expect(weeklyUpdate({ ...release, ...patch }, "example/hermes-tool", false, NOW)).toBeNull();
    expect(weeklyUpdate({ ...release, merged_at: null }, "example/hermes-tool", true, NOW)).toBeNull();
  });
  it("filters general AI and unrelated Hermes stories out of the weekly scope", () => {
    expect(
      isHermesStory(story({ title: "New AI model", topics: ["AI"], sourceUrl: "https://example.com" })),
    ).toBe(false);
    expect(
      isHermesStory(story({ title: "Hermes radio", topics: [], sourceUrl: "https://example.com" })),
    ).toBe(false);
    expect(
      isHermesStory(story({ title: "New Hermes Agent skill", topics: [], sourceUrl: "https://example.com" })),
    ).toBe(true);
  });
  it("bounds public requests and reports unavailable history without inventing shipments", async () => {
    const projects = Array.from({ length: 10 }, (_, id) => ({
      id,
      name: `example/hermes-${id}`,
      description: "Synthetic Hermes Agent plugin",
      url: `https://github.com/example/hermes-${id}`,
      stars: 100 - id,
      forks: 1,
      updatedAt: at,
      language: null,
      topics: ["hermes-agent"],
    }));
    const fetcher = vi.fn(async () => Response.json({ message: "rate limited" }, { status: 403 }));
    const result = await fetchWeeklyDigest(
      fetcher,
      async () => ({ projects, fetchedAt: at, state: "live", incomplete: false }),
      NOW,
    );
    expect(fetcher).toHaveBeenCalledTimes(9);
    expect(result.checkedRepositories).toBe(8);
    expect(result.projects).toHaveLength(10);
    expect(result.updates).toEqual([]);
    expect(result.notices).toHaveLength(9);
    expect(fetcher.mock.calls.every((args) => !JSON.stringify(args).includes("Authorization"))).toBe(true);
  });
});
