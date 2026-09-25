import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Watchlist } from "@/newsroom/model/story";

export interface NewsroomConfig {
  watchlists: Watchlist[];
  liveSources: boolean;
  socialSources: { bluesky: boolean; reddit: boolean };
  jev: { enabled: boolean };
  xBrowser?: { enabled: boolean };
  personalDaily: { enabled: boolean; title: string; timezone: string };
}

const CONFIG_DIR = path.join(process.cwd(), "config");

function sanitize(raw: unknown): NewsroomConfig {
  const list = (raw as { watchlists?: unknown })?.watchlists;
  const watchlists = Array.isArray(list)
    ? list
        .filter(
          (w): w is Watchlist =>
            typeof w?.id === "string" &&
            typeof w?.label === "string" &&
            Array.isArray(w?.topics) &&
            w.topics.every((t: unknown) => typeof t === "string"),
        )
        .map((w) => ({ id: w.id.slice(0, 64), label: w.label.slice(0, 80), topics: w.topics.slice(0, 50) }))
    : [];
  const settings = (raw as { personalDaily?: { enabled?: unknown; title?: unknown; timezone?: unknown } })
    ?.personalDaily;
  const title =
    typeof settings?.title === "string" && settings.title.trim()
      ? settings.title.slice(0, 80)
      : "My Hermes Daily";
  let timezone = "UTC";
  if (typeof settings?.timezone === "string") {
    try {
      new Intl.DateTimeFormat("en", { timeZone: settings.timezone });
      timezone = settings.timezone;
    } catch {
      /* use UTC */
    }
  }
  return {
    xBrowser: { enabled: (raw as { xBrowser?: { enabled?: unknown } })?.xBrowser?.enabled === true },
    jev: { enabled: (raw as { jev?: { enabled?: unknown } })?.jev?.enabled === true },
    personalDaily: { enabled: settings?.enabled === true, title, timezone },
    watchlists,
    liveSources: (raw as { liveSources?: unknown })?.liveSources === true,
    socialSources: {
      bluesky: (raw as { socialSources?: { bluesky?: unknown } })?.socialSources?.bluesky !== false,
      reddit: (raw as { socialSources?: { reddit?: unknown } })?.socialSources?.reddit !== false,
    },
  };
}

/**
 * Personal configuration lives in `config/newsroom.local.json` (git-ignored).
 * Without it, the committed example config is used, so the core always runs.
 */
export async function loadNewsroomConfig(): Promise<NewsroomConfig & { source: "local" | "example" }> {
  for (const [file, source] of [
    ["newsroom.local.json", "local"],
    ["newsroom.example.json", "example"],
  ] as const) {
    try {
      const text = await readFile(path.join(CONFIG_DIR, file), "utf8");
      const config = sanitize(JSON.parse(text));
      if (source !== "local") {
        config.personalDaily.enabled = false;
        config.jev.enabled = false;
        config.xBrowser = { enabled: false };
      }
      return { ...config, source };
    } catch {
      // Missing or unreadable: fall through to the next candidate.
    }
  }
  return { ...sanitize({}), source: "example" };
}
