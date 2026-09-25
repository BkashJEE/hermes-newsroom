import { hermesStatus, runHermes } from "@/newsroom/hermes/server";
import { GET as getFeed } from "../route";
import { NextRequest } from "next/server";
import type { FeedResult } from "@/newsroom/providers/types";

export const runtime = "nodejs";
let busy = false;
// Editorial reading tasks only; the Newsroom does not draft posts or replies.
const tasks = ["analyze", "daily", "weekly"];
export async function GET() {
  return Response.json(await hermesStatus(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  // Next may normalize nextUrl to localhost; the browser sends the original Host.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const localHost = /^(127\.0\.0\.1|localhost):(3510|3520)$/.test(host);
  if (
    !localHost ||
    (origin && origin !== `http://${host}`) ||
    request.headers.get("x-newsroom-client") !== "1"
  ) {
    return Response.json({ error: "Use the local Newsroom app or control command." }, { status: 403 });
  }
  if (busy)
    return Response.json({ error: "Hermes is already working on a Newsroom request." }, { status: 409 });
  const raw = await request.text();
  if (raw.length > 12000) return Response.json({ error: "Request is too large." }, { status: 413 });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (
    !body ||
    !tasks.includes(body.task) ||
    typeof body.question !== "string" ||
    body.question.length > 4000 ||
    (body.storyIds !== undefined &&
      (!Array.isArray(body.storyIds) ||
        body.storyIds.length > 100 ||
        body.storyIds.some((id: unknown) => typeof id !== "string")))
  ) {
    return Response.json({ error: "Choose a valid task, question and story IDs." }, { status: 400 });
  }
  busy = true;
  try {
    const feed = (await (
      await getFeed(new NextRequest(new URL("/api/newsroom", request.url)))
    ).json()) as FeedResult;
    const ids = body.storyIds as string[] | undefined;
    const byId = new Map(feed.stories.map((story) => [story.id, story]));
    const selected = (
      ids
        ? [...new Set(ids)].flatMap((id) => {
            const story = byId.get(id);
            return story ? [story] : [];
          })
        : feed.stories
    ).slice(0, 40);
    if (!selected.length)
      return Response.json(
        { error: "No current stories match this request. Refresh the feed first." },
        { status: 422 },
      );
    const prompt = JSON.stringify({
      task: body.task,
      question: body.question,
      feedMode: feed.mode,
      generatedAt: feed.generatedAt,
      stories: selected.map((s) => ({
        id: s.id,
        title: s.title,
        summary: s.summary,
        sourceUrl: s.sourceUrl,
        publishedAt: s.publishedAt,
        evidence: s.file.evidence,
        status: s.status,
      })),
    });
    const text = await runHermes(prompt, AbortSignal.any([request.signal, AbortSignal.timeout(180000)]));
    return Response.json({
      text,
      generatedAt: new Date().toISOString(),
      composedBy: "Hermes Agent",
      feedMode: feed.mode,
    });
  } catch (error) {
    const message =
      error instanceof Error && /^Hermes returned/.test(error.message)
        ? error.message
        : "Hermes could not finish this request. Check the local gateway and try again.";
    return Response.json({ error: message }, { status: 502 });
  } finally {
    busy = false;
  }
}
