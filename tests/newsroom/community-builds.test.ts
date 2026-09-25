import { describe, expect, it, vi } from "vitest";
import { parseCommunityBuild } from "@/newsroom/model/community-build";
import { fetchCommunityBuilds } from "@/newsroom/providers/community-builds";
const project = {
  id: 1,
  full_name: "example/hermes-project",
  description: "A synthetic Hermes Agent project",
  private: false,
  fork: false,
  archived: false,
  pushed_at: "2026-09-20T10:00:00Z",
  stargazers_count: 200,
  forks_count: 20,
  topics: ["hermes-agent"],
  language: "TypeScript",
};
describe("community build discovery", () => {
  it("rejects private projects, forks, archived projects and the core agent", () => {
    for (const patch of [
      { private: true },
      { fork: true },
      { archived: true },
      { full_name: "NousResearch/hermes-agent" },
      { full_name: "example/awesome-hermes" },
      { full_name: "example/garden", description: "Gardening app", topics: [] },
      { pushed_at: "invalid" },
    ])
      expect(parseCommunityBuild({ ...project, ...patch })).toBeNull();
    expect(parseCommunityBuild(project)?.url).toBe("https://github.com/example/hermes-project");
  });
  it("deduplicates and ranks measured star totals without credentials", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        items: [
          project,
          { ...project, id: 2, full_name: "example/hermes-tools", stargazers_count: 900 },
          project,
        ],
        incomplete_results: true,
      }),
    );
    const result = await fetchCommunityBuilds(fetcher, new Date("2026-09-22T00:00:00Z"));
    expect(result.projects.map((p) => p.stars)).toEqual([900, 200]);
    expect(result.incomplete).toBe(true);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get("q")).toContain("is:public pushed:>=2026-08-23");
    expect(options.headers).not.toHaveProperty("Authorization");
  });
  it("reports rate limits rather than manufacturing a popular list", async () => {
    await expect(fetchCommunityBuilds(async () => new Response("", { status: 403 }))).rejects.toThrow(
      "HTTP 403",
    );
  });
});
