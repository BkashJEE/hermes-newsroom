import type { FeedResult } from "../providers/types";
import type { SourceId } from "./story";

/** Implemented live feed adapters, independent of temporary provider failures. */
export const LIVE_SOURCES: readonly SourceId[] = ["github", "hackernews", "bluesky", "reddit"];

export function sourceNotConnected(
  mode: FeedResult["mode"] | undefined,
  source: SourceId | "all",
  connected: readonly SourceId[] = LIVE_SOURCES,
) {
  return mode === "live" && source !== "all" && !connected.includes(source);
}
