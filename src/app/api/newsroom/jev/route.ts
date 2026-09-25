import { NextRequest } from "next/server";
import { loadNewsroomConfig } from "@/newsroom/config/load-config";
import { GET as getFeed } from "../route";
import type { FeedResult } from "@/newsroom/providers/types";
import { BENCHMARK, DEMO_STORIES, type PublicInput, type RunSnapshot } from "@/newsroom/jev/model";
import { readXState } from "@/newsroom/browser-x/server";
import {
  acquireRun,
  evaluateDemo,
  evaluatePublic,
  helperReady,
  lastRun,
  saveRun,
} from "@/newsroom/jev/server";
import { readHuntInbox, rememberHuntRun } from "@/newsroom/jev/inbox";
import { discoverNews } from "@/newsroom/jev/discovery";
import type { Discovery } from "@/newsroom/jev/model";
import { runClassification } from "@/newsroom/jev/runner";
export const runtime = "nodejs";
function local(request: NextRequest) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const origin = request.headers.get("origin");
  return (
    /^(127\.0\.0\.1|localhost):(3510|3520)$/.test(host) &&
    (!origin || origin === `http://${host}`) &&
    request.headers.get("x-newsroom-client") === "1"
  );
}
export async function GET(request: NextRequest) {
  if (!local(request)) return Response.json({ error: "Use the local Newsroom app." }, { status: 403 });
  const config = await loadNewsroomConfig();
  return Response.json(
    {
      enabled: config.jev.enabled,
      ready: config.jev.enabled && (await helperReady()),
      lastRun: await lastRun(),
      inbox: await readHuntInbox(),
      maxStories: 5,
      maxCallsPerHour: 10,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: NextRequest) {
  if (!local(request)) return Response.json({ error: "Use the local Newsroom app." }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 4000) return Response.json({ error: "Request too large." }, { status: 413 });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body || !["demo", "live"].includes(body.mode))
    return Response.json({ error: "Choose demo or live mode." }, { status: 400 });
  const config = await loadNewsroomConfig();
  const previewOnly = body.mode === "live" && body.purpose === "pipeline" && body.previewOnly === true;
  if (body.mode === "live" && !previewOnly && (!config.jev.enabled || body.confirmPaid !== true))
    return Response.json(
      { error: "Live Jev requires local opt-in and acknowledgement of paid public-data evaluation." },
      { status: 403 },
    );
  let inputs: PublicInput[] = DEMO_STORIES;
  const purpose: RunSnapshot["purpose"] = ["hunt", "benchmark", "pipeline"].includes(body.purpose)
    ? body.purpose
    : "classify";
  if (purpose === "pipeline" && (body.mode !== "live" || !config.liveSources))
    return Response.json({ error: "News discovery requires live public sources." }, { status: 422 });
  if (purpose === "pipeline" && ![1, 3, 5].includes(body.count))
    return Response.json({ error: "Choose 1, 3 or 5 stories." }, { status: 400 });
  let collectionMs: number | undefined;
  if (body.mode === "live" && purpose === "benchmark") inputs = BENCHMARK.map((b) => b.input);
  if (body.mode === "live" && purpose !== "benchmark" && purpose !== "pipeline") {
    if (purpose === "hunt") {
      const state = await readXState();
      if (
        !config.xBrowser?.enabled ||
        !state.job ||
        state.job?.id !== body.collectionId ||
        state.job.state !== "complete" ||
        Date.now() - Date.parse(state.job.finishedAt ?? "") > 600000
      )
        return Response.json({ error: "Finish a fresh browser collection first." }, { status: 422 });
      const limit = [1, 3, 5].includes(body.count) ? body.count : 3;
      body.storyIds = state.job.postIds?.slice(0, limit) ?? [];
      collectionMs = Date.parse(state.job.finishedAt!) - Date.parse(state.job.startedAt!);
    }
    if (
      !Array.isArray(body.storyIds) ||
      !body.storyIds.length ||
      body.storyIds.length > 5 ||
      !body.storyIds.every((id: unknown) => typeof id === "string")
    )
      return Response.json({ error: "Choose one to five current public story IDs." }, { status: 400 });
    const feed = (await (
      await getFeed(new NextRequest(new URL("/api/newsroom", request.url)))
    ).json()) as FeedResult;
    if (feed.mode !== "live")
      return Response.json({ error: "Live evaluation requires the public live feed." }, { status: 422 });
    const byId = new Map(feed.stories.map((s) => [s.id, s]));
    inputs = [...new Set(body.storyIds as string[])].flatMap((id) => {
      const s = byId.get(id);
      // Restrict export to currently implemented public providers, never personal/draft input.
      return s && ["github", "hackernews", ...(config.xBrowser?.enabled ? ["x"] : [])].includes(s.source)
        ? [
            {
              id: s.id,
              title: s.title.slice(0, 240),
              summary: s.summary.slice(0, 1200),
              sourceUrl: s.sourceUrl,
            },
          ]
        : [];
    });
    if (inputs.length !== new Set(body.storyIds).size)
      return Response.json(
        { error: "Some selected stories are unavailable or not public-provider stories. Refresh the feed." },
        { status: 422 },
      );
  }
  if (body.mode === "live" && !previewOnly && !(await helperReady()))
    return Response.json({ error: "Jev helper or provider credential is unavailable." }, { status: 503 });
  let release: () => Promise<void>;
  try {
    release = await acquireRun();
  } catch {
    return Response.json(
      { error: "Another run is active, or its lock needs recovery after interruption." },
      { status: 409 },
    );
  }
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(180000)]);
  let disconnected = false;
  const stream = new ReadableStream({
    async start(output) {
      const send = (value: unknown) => {
        if (!disconnected) {
          try {
            output.enqueue(new TextEncoder().encode(JSON.stringify(value) + "\n"));
          } catch {
            disconnected = true;
            controller.abort();
          }
        }
      };
      let discovery: Discovery | undefined;
      try {
        if (purpose === "pipeline") {
          const result = await discoverNews(
            body.count,
            config.xBrowser?.enabled === true,
            signal,
            (snapshot) => {
              discovery = snapshot;
              send({ discovery });
            },
          );
          inputs = result.inputs;
          discovery = result.discovery;
          collectionMs = discovery.elapsedMs;
          if (previewOnly) {
            send({ collectionComplete: true, inbox: await readHuntInbox() });
            return;
          }
          if (!inputs.length) {
            discovery.stage = "complete";
            send({
              discovery,
              collectionComplete: true,
              inbox: await readHuntInbox(),
              notice: discovery.candidates.length
                ? "All collected excerpts have already been evaluated. No Jev credits used."
                : "No candidates found. Check source statuses; no Jev credits used.",
            });
            return;
          }
          discovery.stage = "evaluating";
          send({ discovery });
        }
        const run = await runClassification(
          inputs,
          body.mode,
          signal,
          body.mode === "demo" ? evaluateDemo : evaluatePublic,
          (run) => {
            if (discovery && run.state !== "running") discovery.stage = run.state;
            send({ run: { ...run, purpose, collectionMs, ...(discovery ? { discovery } : {}) } });
          },
        );
        run.purpose = purpose;
        run.collectionMs = collectionMs;
        if (discovery) run.discovery = discovery;
        await saveRun(run);
        if (run.mode === "live" && run.purpose !== "benchmark") await rememberHuntRun(run);
        send({ saved: true, inbox: await readHuntInbox() });
      } catch {
        if (discovery) {
          discovery.stage = signal.aborted ? "cancelled" : "failed";
          send({ discovery });
        }
        send({ error: "Run storage or streaming failed. The displayed results may not be saved." });
      } finally {
        await release().catch(() => {});
        if (!disconnected) {
          try {
            output.close();
          } catch {
            /* disconnected */
          }
        }
      }
    },
    cancel() {
      disconnected = true;
      controller.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
