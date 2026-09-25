import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/newsroom/hermes/route";
import { runHermes } from "@/newsroom/hermes/server";
vi.mock("@/newsroom/hermes/server", () => ({
  hermesStatus: vi.fn(),
  runHermes: vi.fn(async () => "Grounded brief"),
}));
vi.mock("@/app/api/newsroom/route", () => ({
  GET: vi.fn(async () =>
    Response.json({
      mode: "fixture",
      generatedAt: "2026-09-21",
      stories: [{ id: "story-1", title: "Example", file: { evidence: [] } }],
    }),
  ),
}));
afterEach(() => vi.clearAllMocks());
function request(body: unknown, headers: Record<string, string> = { "x-newsroom-client": "1" }) {
  return new NextRequest("http://127.0.0.1:3520/api/newsroom/hermes", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
describe("Hermes request boundary", () => {
  it("rejects cross-origin requests and missing client headers before invoking Hermes", async () => {
    expect(
      (
        await POST(
          request(
            { task: "daily", question: "brief" },
            { origin: "https://evil.example", "x-newsroom-client": "1" },
          ),
        )
      ).status,
    ).toBe(403);
    expect((await POST(request({ task: "daily", question: "brief" }, {}))).status).toBe(403);
    expect(runHermes).not.toHaveBeenCalled();
  });
  it("accepts the original loopback Host when Next normalizes its internal URL", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3520/api/newsroom/hermes", {
        method: "POST",
        headers: { host: "127.0.0.1:3520", origin: "http://127.0.0.1:3520", "x-newsroom-client": "1" },
        body: JSON.stringify({ task: "daily", question: "brief" }),
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects invalid task and nonexistent story selection", async () => {
    expect((await POST(request({ task: "shell", question: "run" }))).status).toBe(400);
    expect((await POST(request({ task: "daily", question: "brief", storyIds: ["missing"] }))).status).toBe(
      422,
    );
    expect(runHermes).not.toHaveBeenCalled();
  });
  it("uses server evidence, not client-supplied story content", async () => {
    const response = await POST(
      request({
        task: "daily",
        question: "brief",
        storyIds: ["story-1"],
        stories: [{ title: "untrusted client override" }],
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      text: "Grounded brief",
      composedBy: "Hermes Agent",
      feedMode: "fixture",
    });
    const prompt = vi.mocked(runHermes).mock.calls[0][0];
    expect(prompt).toContain("Example");
    expect(prompt).not.toContain("untrusted client override");
  });
});
