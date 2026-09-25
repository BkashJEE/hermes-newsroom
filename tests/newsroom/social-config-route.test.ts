import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/newsroom/route";

vi.mock("@/newsroom/config/load-config", () => ({
  loadNewsroomConfig: async () => ({
    liveSources: true,
    watchlists: [],
    personalDaily: { enabled: false },
    xBrowser: { enabled: false },
    socialSources: { bluesky: false, reddit: true },
  }),
}));
vi.mock("@/newsroom/providers/registry", () => ({ buildProviders: () => [] }));

it("does not advertise disabled social providers as connected", async () => {
  const response = await GET(new NextRequest("http://localhost/api/newsroom"));
  expect((await response.json()).connectedSources).toEqual(["github", "hackernews", "reddit"]);
});
