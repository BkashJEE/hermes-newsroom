import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/newsroom/jev/route";
import { evaluatePublic, evaluateDemo, acquireRun, saveRun } from "@/newsroom/jev/server";
import { discoverNews } from "@/newsroom/jev/discovery";
vi.mock("@/newsroom/jev/inbox", () => ({
  readHuntInbox: vi.fn(async () => []),
  rememberHuntRun: vi.fn(async () => []),
}));
vi.mock("@/newsroom/jev/discovery", () => ({
  discoverNews: vi.fn(async (_count, _includeX, _signal, emit) => {
    const discovery = {
      stage: "collecting",
      startedAt: new Date().toISOString(),
      elapsedMs: 0,
      sources: [],
      candidates: [],
      selectedIds: [],
      selectionRule: "Synthetic selection",
    };
    emit(discovery);
    return {
      discovery: { ...discovery, stage: "selected", selectedIds: ["fresh-public"] },
      inputs: [
        {
          id: "fresh-public",
          title: "Synthetic freshly collected story",
          summary: "Synthetic excerpt",
          sourceUrl: "https://example.com/fresh",
        },
      ],
    };
  }),
}));
const settings = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/newsroom/config/load-config", () => ({
  loadNewsroomConfig: async () => ({ liveSources: true, jev: settings, xBrowser: { enabled: true } }),
}));
vi.mock("@/newsroom/browser-x/server", () => ({
  readXState: async () => ({
    job: {
      id: "capture-test",
      state: "complete",
      startedAt: new Date(Date.now() - 1000).toISOString(),
      finishedAt: new Date().toISOString(),
      postIds: ["public-1"],
    },
  }),
}));
vi.mock("@/newsroom/jev/server", () => ({
  helperReady: vi.fn(async () => true),
  lastRun: vi.fn(async () => null),
  acquireRun: vi.fn(async () => async () => {}),
  saveRun: vi.fn(async () => {}),
  evaluateDemo: vi.fn(async () => ({ category: "Other", probabilities: {}, needsReview: true })),
  evaluatePublic: vi.fn(async () => ({
    category: "Build",
    probabilities: { Build: 0.9 },
    needsReview: false,
  })),
}));
vi.mock("@/app/api/newsroom/route", () => ({
  GET: async () =>
    Response.json({
      mode: "live",
      stories: [
        {
          id: "public-1",
          title: "Synthetic public title",
          summary: "Synthetic public excerpt",
          source: "github",
          sourceUrl: "https://example.com/source",
        },
      ],
    }),
}));
function request(body: unknown, origin = "http://127.0.0.1:3510") {
  return new NextRequest("http://127.0.0.1:3510/api/newsroom/jev", {
    method: "POST",
    headers: { host: "127.0.0.1:3510", origin, "x-newsroom-client": "1" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  settings.enabled = false;
});
describe("Jev endpoint boundaries", () => {
  it("rejects cross-origin and nonlocal access before evaluator or lock", async () => {
    expect((await POST(request({ mode: "demo" }, "https://example.com"))).status).toBe(403);
    expect((await GET(new NextRequest("http://example.com/api/newsroom/jev"))).status).toBe(403);
    expect(acquireRun).not.toHaveBeenCalled();
  });
  it("blocks paid requests without both config opt-in and acknowledgement", async () => {
    expect((await POST(request({ mode: "live", confirmPaid: true, storyIds: ["public-1"] }))).status).toBe(
      403,
    );
    settings.enabled = true;
    expect((await POST(request({ mode: "live", storyIds: ["public-1"] }))).status).toBe(403);
    expect(evaluatePublic).not.toHaveBeenCalled();
  });
  it("streams a clearly labelled synthetic demo without invoking Jev", async () => {
    const response = await POST(request({ mode: "demo", state: "ignored private input" }));
    const lines = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines[0].run.mode).toBe("demo");
    expect(lines[0].run.items[0].status).toBe("queued");
    expect(lines.some((e) => e.run?.items[0].status === "processing")).toBe(true);
    expect(lines.at(-1).saved).toBe(true);
    expect(evaluateDemo).toHaveBeenCalledTimes(3);
    expect(evaluatePublic).not.toHaveBeenCalled();
    expect(saveRun).toHaveBeenCalledOnce();
    expect(JSON.stringify(lines)).not.toContain("ignored private input");
  });
  it("resolves only current public IDs and caps the batch", async () => {
    settings.enabled = true;
    expect((await POST(request({ mode: "live", confirmPaid: true, storyIds: ["private-1"] }))).status).toBe(
      422,
    );
    expect(
      (await POST(request({ mode: "live", confirmPaid: true, storyIds: Array(6).fill("public-1") }))).status,
    ).toBe(400);
    const response = await POST(
      request({
        mode: "live",
        confirmPaid: true,
        storyIds: ["public-1"],
        title: "replace with private text",
      }),
    );
    await response.text();
    expect(evaluatePublic).toHaveBeenCalledOnce();
    expect(vi.mocked(evaluatePublic).mock.calls[0][0].title).toBe("Synthetic public title");
  });
  it("uses only server-owned labelled inputs for the benchmark", async () => {
    settings.enabled = true;
    const response = await POST(
      request({ mode: "live", purpose: "benchmark", confirmPaid: true, state: "private replacement" }),
    );
    const output = await response.text();
    expect(evaluatePublic).toHaveBeenCalledTimes(5);
    expect(output).toContain('"purpose":"benchmark"');
    expect(output).not.toContain("private replacement");
    expect(vi.mocked(evaluatePublic).mock.calls[0][0]).not.toHaveProperty("category");
  });
  it("requires the completed capture and derives hunt IDs from it, not the client", async () => {
    settings.enabled = true;
    expect(
      (await POST(request({ mode: "live", purpose: "hunt", confirmPaid: true, collectionId: "wrong" })))
        .status,
    ).toBe(422);
    const response = await POST(
      request({
        mode: "live",
        purpose: "hunt",
        confirmPaid: true,
        collectionId: "capture-test",
        storyIds: ["private-1"],
        count: 3,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"purpose":"hunt"');
    expect(vi.mocked(evaluatePublic).mock.calls[0][0].id).toBe("public-1");
  });
});

it("streams collection before live evaluation and ignores client-injected story content", async () => {
  settings.enabled = true;
  const response = await POST(
    request({
      mode: "live",
      purpose: "pipeline",
      count: 1,
      confirmPaid: true,
      storyIds: ["private"],
      title: "private injected text",
    }),
  );
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(events[0].discovery.stage).toBe("collecting");
  expect(events.findIndex((e) => e.run)).toBeGreaterThan(events.findIndex((e) => e.discovery));
  expect(evaluatePublic).toHaveBeenCalledOnce();
  expect(vi.mocked(evaluatePublic).mock.calls[0][0].id).toBe("fresh-public");
  expect(JSON.stringify(events)).not.toContain("private injected text");
  expect(vi.mocked(saveRun).mock.calls[0][0].discovery?.stage).toBe("complete");
});
it("collect-only preview never invokes Jev even when live evaluation is disabled", async () => {
  const response = await POST(request({ mode: "live", purpose: "pipeline", count: 3, previewOnly: true }));
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('"collectionComplete":true');
  expect(discoverNews).toHaveBeenCalledOnce();
  expect(evaluatePublic).not.toHaveBeenCalled();
  expect(saveRun).not.toHaveBeenCalled();
});
it("pipeline rejects missing consent and invalid batch size before collection", async () => {
  settings.enabled = true;
  expect((await POST(request({ mode: "live", purpose: "pipeline", count: 3 }))).status).toBe(403);
  expect(
    (await POST(request({ mode: "live", purpose: "pipeline", count: 99, confirmPaid: true }))).status,
  ).toBe(400);
  expect(discoverNews).not.toHaveBeenCalled();
});
