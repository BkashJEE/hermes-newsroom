import "server-only";
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { parsePosts, type XState } from "./model";
export function createXStore(directory: string) {
  const file = join(directory, "state.json");
  async function readXState(): Promise<XState> {
    let state: XState;
    try {
      state = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { posts: [] };
      throw error;
    }
    if (
      state.job &&
      ["queued", "collecting"].includes(state.job.state) &&
      Date.now() - Date.parse(state.job.requestedAt) > 10 * 60000
    )
      state.job = {
        ...state.job,
        state: "failed",
        message:
          "Browser collection timed out. Check that the browser and scheduled collector are available.",
      };
    return state;
  }
  async function updateX(
    action: "request" | "claim" | "complete" | "unavailable" | "failed",
    id?: string,
    raw?: unknown,
  ): Promise<XState> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const lock = join(directory, "write.lock");
    for (let attempt = 0; ; attempt++) {
      try {
        await writeFile(lock, "", { flag: "wx", mode: 0o600 });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt >= 20) throw error;
        await delay(25);
      }
    }
    try {
      const state = await readXState();
      const now = new Date().toISOString();
      if (action === "request" || action === "claim") {
        if (action === "claim" && state.job?.state === "collecting")
          throw new Error("Collection already active.");
        if (!state.job || !["queued", "collecting"].includes(state.job.state))
          state.job = { id: randomUUID(), state: "queued", requestedAt: now };
        if (action === "claim") state.job = { ...state.job, state: "collecting", startedAt: now };
      } else {
        if (!id || state.job?.id !== id || state.job.state !== "collecting")
          throw new Error("Collection lease is no longer active.");
        const posts = action === "complete" ? parsePosts(raw) : [];
        if (action === "complete") {
          const merged = new Map(
            state.posts
              .filter((p) => Date.parse(p.publishedAt) > Date.now() - 30 * 86400000)
              .map((p) => [p.id, p]),
          );
          posts.forEach((p) => merged.set(p.id, p));
          state.posts = [...merged.values()]
            .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
            .slice(0, 300);
          state.lastCollectedAt = now;
        }
        state.job = {
          ...state.job,
          state: action,
          finishedAt: now,
          postIds: posts.map((p) => p.id),
          message:
            action === "complete"
              ? `${posts.length} public posts captured from the browser search sample.`
              : action === "unavailable"
                ? "Open an accessible X browser tab and sign in if needed. No private pages are collected."
                : "X search could not be read. Previous captured posts are retained.",
        };
      }
      await writeFile(file + ".next", JSON.stringify(state), { mode: 0o600 });
      await rename(file + ".next", file);
      return state;
    } finally {
      await unlink(lock);
    }
  }
  return { readXState, updateX };
}
export const { readXState, updateX } = createXStore(
  join(homedir(), ".local/state/omarchy-command-center/browser-x"),
);
export function xStatus(state: XState) {
  return { job: state.job, lastCollectedAt: state.lastCollectedAt, count: state.posts.length };
}
