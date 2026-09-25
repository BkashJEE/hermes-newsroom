import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { JevLiveDesk } from "@/newsroom/components/jev-live-desk";
import { DEMO_STORIES } from "@/newsroom/jev/model";
afterEach(() => vi.unstubAllGlobals());
it("restores the saved failed collection and shows why each selected story lacks a decision", async () => {
  const now = new Date().toISOString();
  const candidates = DEMO_STORIES.slice(0, 3).map((story) => ({
    ...story,
    source: "github",
    channel: "official-release",
    publishedAt: now,
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith("browser-x")
          ? { enabled: false }
          : {
              enabled: true,
              ready: true,
              inbox: [],
              lastRun: {
                id: "saved-failure",
                mode: "live",
                model: "typesafe-ai/jev",
                state: "failed",
                purpose: "pipeline",
                startedAt: now,
                finishedAt: now,
                events: [{ at: now, message: "Run failed" }],
                items: candidates.map((story, index) => ({
                  ...story,
                  status: index === 0 ? "failed" : "cancelled",
                  ...(index === 0 ? { error: "The Jev provider request failed." } : {}),
                })),
                discovery: {
                  stage: "failed",
                  startedAt: now,
                  elapsedMs: 200,
                  sources: [
                    { id: "gh", label: "GitHub releases", kind: "network", state: "ready", count: 3 },
                  ],
                  candidates,
                  selectedIds: candidates.map((story) => story.id),
                  selectionRule: "Synthetic selection",
                },
              },
            },
      ),
    ),
  );
  render(<JevLiveDesk stories={[]} />);
  expect((await screen.findAllByText("JEV FAILED")).length).toBeGreaterThan(0);
  expect(screen.getByRole("alert")).toHaveTextContent("0/3 stories evaluated");
  const process = screen.getByRole("region", { name: "Live news process" });
  expect(process).toHaveTextContent("3 stories found");
  expect(process).toHaveTextContent("3 for Jev");
  expect(process).toHaveTextContent("0/3 decisions");
  const selection = within(process).getByRole("list", { name: "Selected stories and Jev status" });
  expect(selection).toHaveTextContent("JEV FAILED");
  expect(within(selection).getAllByText("NOT ATTEMPTED")).toHaveLength(2);
  expect(
    within(process)
      .getByText(/Collected stories · 3 · 3 selected/)
      .closest("details"),
  ).not.toHaveAttribute("open");
  expect(screen.getByText(/previously saved result/)).toBeVisible();
});
it("an interrupted stream stops the processing indicator and labels the result unknown", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) =>
      options?.method === "POST"
        ? new Response(
            JSON.stringify({
              run: {
                id: "synthetic",
                mode: "demo",
                model: "Scripted demo",
                state: "running",
                startedAt: new Date().toISOString(),
                events: [],
                items: [{ ...DEMO_STORIES[0], status: "processing" }],
              },
            }) + "\n",
          )
        : Response.json({ enabled: false, ready: false, lastRun: null }),
    ),
  );
  render(<JevLiveDesk stories={[]} />);
  await user.click(screen.getByRole("button", { name: "Watch demo · no API call" }));
  expect(
    (await screen.findAllByRole("alert")).some((alert) =>
      alert.textContent?.includes("stream ended before completion"),
    ),
  ).toBe(true);
  expect(within(screen.getByRole("region", { name: "Processing" })).queryByRole("article")).toBeNull();
  expect(screen.getAllByText(/Stream interrupted; result unknown/)).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Cancel run" })).toBeDisabled();
});
it("a queued X refresh does not lock Jev tests or present the old demo as running", async () => {
  const user = userEvent.setup();
  let job: { id: string; state: string; requestedAt: string } | undefined;
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("browser-x")) {
        if (options?.method === "POST") {
          job = { id: "synthetic-queue", state: "queued", requestedAt: new Date().toISOString() };
          requests.push({ url, body: JSON.parse(String(options.body)) });
        }
        return Response.json({ enabled: true, count: 0, job });
      }
      if (options?.method === "POST") {
        requests.push({ url, body: JSON.parse(String(options.body)) });
        return Response.json({ error: "Synthetic provider response" }, { status: 503 });
      }
      return Response.json({
        enabled: true,
        ready: true,
        lastRun: {
          id: "old-demo",
          mode: "demo",
          state: "complete",
          model: "Scripted demo",
          startedAt: new Date().toISOString(),
          items: [],
          events: [],
        },
      });
    }),
  );
  render(<JevLiveDesk stories={[]} />);
  const consent = await screen.findByRole("checkbox");
  await user.click(screen.getByRole("button", { name: "Queue X refresh · no Jev call" }));
  expect(screen.getByRole("status", { name: "X collection status" })).toHaveTextContent(
    "Waiting for the Codex browser worker",
  );
  expect(screen.getByText("JEV IDLE")).toBeVisible();
  expect(screen.queryByText(/previously saved result/)).toBeNull();
  expect(screen.getByRole("button", { name: "Show previous DEMO result" })).toBeEnabled();
  expect(consent).toBeEnabled();
  expect(screen.getByRole("button", { name: "Watch demo · no API call" })).toBeEnabled();
  const test = screen.getByRole("button", { name: "Test Jev · 5 labelled examples" });
  expect(test).toBeDisabled();
  await user.click(consent);
  expect(test).toBeEnabled();
  await user.click(test);
  expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic provider response");
  expect(requests).toEqual([
    { url: "/api/newsroom/browser-x", body: { action: "request" } },
    {
      url: "/api/newsroom/jev",
      body: expect.objectContaining({ purpose: "benchmark", mode: "live", confirmPaid: true }),
    },
  ]);
});

it("fresh X evaluation does not start until a completed capture is available", async () => {
  const user = userEvent.setup();
  const post = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        post(url, JSON.parse(String(options.body)));
        return Response.json({ error: "Synthetic provider response" }, { status: 503 });
      }
      return Response.json(
        url.endsWith("browser-x")
          ? {
              enabled: true,
              count: 1,
              job: {
                id: "synthetic-capture",
                state: "complete",
                finishedAt: new Date().toISOString(),
                postIds: ["synthetic-post"],
              },
            }
          : { enabled: true, ready: true, lastRun: null },
      );
    }),
  );
  render(<JevLiveDesk stories={[]} />);
  await user.click(await screen.findByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Run Jev on fresh X" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic provider response");
  expect(post).toHaveBeenCalledExactlyOnceWith(
    "/api/newsroom/jev",
    expect.objectContaining({ purpose: "hunt", collectionId: "synthetic-capture" }),
  );
});

it("shows real collection events for the no-credit preview without enabling paid requests", async () => {
  const user = userEvent.setup();
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        posts.push(JSON.parse(String(options.body)));
        return new Response(
          JSON.stringify({
            discovery: {
              stage: "selected",
              startedAt: new Date().toISOString(),
              elapsedMs: 150,
              sources: [
                {
                  id: "gh",
                  label: "Synthetic GitHub",
                  kind: "network",
                  state: "ready",
                  count: 1,
                  elapsedMs: 150,
                },
              ],
              candidates: [
                {
                  ...DEMO_STORIES[0],
                  source: "github",
                  publishedAt: new Date().toISOString(),
                  relevanceScore: 90,
                },
              ],
              selectedIds: [DEMO_STORIES[0].id],
              selectionRule: "Synthetic ranking",
            },
          }) +
            "\n" +
            JSON.stringify({ collectionComplete: true }) +
            "\n",
        );
      }
      return Response.json({ enabled: true, ready: true, lastRun: null });
    }),
  );
  render(<JevLiveDesk stories={[]} />);
  await user.click(screen.getByRole("button", { name: "Fetch news · no Jev call" }));
  expect(await screen.findByRole("list", { name: "Selected stories and Jev status" })).toHaveTextContent(
    "AWAITING JEV",
  );
  expect(screen.getByText("JEV IDLE")).toBeVisible();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(posts).toEqual([
    expect.objectContaining({ purpose: "pipeline", previewOnly: true, confirmPaid: false }),
  ]);
});
