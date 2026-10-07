import type { NextRequest } from "next/server";
import { archiveStore } from "@/newsroom/archive/server";
import {
  ArchiveInputError,
  MAX_ARCHIVE_BYTES,
  parseArchive,
  parseEditionDraft,
  parseMode,
  parseStory,
} from "@/newsroom/archive/model";
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
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: NextRequest) {
  if (!local(request)) return json({ error: "Use the local Newsroom app." }, 403);
  try {
    return json(await archiveStore.read());
  } catch {
    return json(
      { error: "The permanent archive could not be read. Existing files have not been replaced." },
      503,
    );
  }
}
async function body(request: NextRequest) {
  if (Number(request.headers.get("content-length")) > MAX_ARCHIVE_BYTES) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) throw new ArchiveInputError();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ARCHIVE_BYTES) {
        await reader.cancel();
        throw new RangeError();
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}
export async function POST(request: NextRequest) {
  if (!local(request)) return json({ error: "Use the local Newsroom app." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "JSON required." }, 415);
  try {
    const input = await body(request);
    if (input?.action === "story") {
      if (typeof input.saved !== "boolean") throw new ArchiveInputError();
      const story = parseStory(input.story);
      await archiveStore.saveStory({
        story: { ...story, saved: input.saved, dismissed: false },
        saved: input.saved,
        mode: parseMode(input.mode),
        updatedAt: new Date().toISOString(),
      });
      return json({ ok: true });
    }
    if (input?.action === "edition")
      return json(await archiveStore.saveEdition(parseEditionDraft(input.edition)), 201);
    if (input?.action === "import") {
      await archiveStore.importBackup(parseArchive(input.backup));
      return json({ ok: true });
    }
    throw new ArchiveInputError();
  } catch (error) {
    if (error instanceof RangeError)
      return json({ error: "Archive input is too large (25 MB maximum)." }, 413);
    if (error instanceof ArchiveInputError || error instanceof SyntaxError)
      return json({ error: "Invalid archive data. No changes were saved." }, 400);
    return json(
      {
        error:
          "The permanent archive could not be written. Retry after checking available disk space and the archive lock.",
      },
      503,
    );
  }
}
