import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { loadNewsroomConfig } from "@/newsroom/config/load-config";
import { GET, POST } from "@/app/api/newsroom/personal/route";
import { generatePersonal, personalData } from "@/newsroom/personal/server";
import { validDate, validatePaper } from "@/newsroom/personal/validate";
vi.mock("@/newsroom/personal/server", () => ({
  personalData: vi.fn(async () => ({ title: "My Hermes Daily" })),
  generatePersonal: vi.fn(async () => ({ id: "saved" })),
}));
vi.mock("@/newsroom/config/load-config", () => ({
  loadNewsroomConfig: vi.fn(async () => ({ personalDaily: { enabled: true } })),
}));
afterEach(() => vi.clearAllMocks());
const request = (headers: Record<string, string> = { "X-Newsroom-Client": "1" }) =>
  new NextRequest("http://127.0.0.1:3520/api/newsroom/personal", { headers });
describe("private work newspaper", () => {
  it("does not read or generate personal records when disabled", async () => {
    vi.mocked(loadNewsroomConfig).mockResolvedValueOnce({
      jev: { enabled: false },
      personalDaily: { enabled: false, title: "My Hermes Daily", timezone: "UTC" },
      watchlists: [],
      liveSources: false,
      socialSources: { bluesky: true, reddit: true },
      source: "example",
    });
    expect((await GET(request())).status).toBe(404);
    expect(personalData).not.toHaveBeenCalled();
    vi.mocked(loadNewsroomConfig).mockResolvedValueOnce({
      jev: { enabled: false },
      personalDaily: { enabled: false, title: "My Hermes Daily", timezone: "UTC" },
      watchlists: [],
      liveSources: false,
      socialSources: { bluesky: true, reddit: true },
      source: "example",
    });
    expect((await POST(request())).status).toBe(404);
    expect(generatePersonal).not.toHaveBeenCalled();
  });

  it("blocks private reads from other origins, forged hosts, and ordinary cross-site GETs", async () => {
    for (const headers of [
      {},
      { "X-Newsroom-Client": "1", origin: "https://outside.example" },
      { "X-Newsroom-Client": "1", host: "outside.example:3520" },
      { "X-Newsroom-Client": "1", "sec-fetch-site": "cross-site" },
    ] as Record<string, string>[])
      expect((await GET(request(headers))).status).toBe(403);
    expect(personalData).not.toHaveBeenCalled();
    expect((await GET(request())).status).toBe(200);
  });
  it("accepts the original Host and keeps private responses uncached", async () => {
    const r = await GET(
      new NextRequest("http://localhost:3520/api/newsroom/personal", {
        headers: { host: "127.0.0.1:3520", origin: "http://127.0.0.1:3520", "X-Newsroom-Client": "1" },
      }),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects invalid calendar dates and path traversal before generation", async () => {
    for (const date of ["../../secret", "2026-02-30", "2026-13-01", "2026-01-01/extra"]) {
      expect(validDate(date)).toBe(false);
      expect(
        (
          await POST(
            new NextRequest("http://127.0.0.1:3520/api/newsroom/personal", {
              method: "POST",
              headers: { "X-Newsroom-Client": "1" },
              body: JSON.stringify({ date }),
            }),
          )
        ).status,
      ).toBe(400);
    }
    expect(generatePersonal).not.toHaveBeenCalled();
  });
  it("rejects invented or missing citations instead of saving an unsourced newspaper", () => {
    const paper = {
      headline: "Work reported",
      sections: [{ title: "Builds", bullets: [{ text: "Agent reported a patch.", sources: ["S1"] }] }],
    };
    expect(validatePaper(JSON.stringify(paper), ["S1"])).toEqual(paper);
    expect(() => validatePaper(JSON.stringify(paper), ["S2"])).toThrow();
    paper.sections[0].bullets[0].sources = [];
    expect(() => validatePaper(JSON.stringify(paper), ["S1"])).toThrow();
  });
});
