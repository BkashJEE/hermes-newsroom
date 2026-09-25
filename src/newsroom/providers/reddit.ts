import "server-only";

import type { Story } from "../model/story";
import type { NewsProvider } from "./types";
import {
  SEARCH_PHRASES,
  mentionsHermes,
  publication,
  searchResponse,
  socialStory,
  socialProvider,
} from "./social-search";
import { redditAtomPosts } from "./reddit-atom";

/** Public Atom search; access denial/rate limits are errors, not an empty feed. */
export function redditProvider(fresh = false): NewsProvider {
  return socialProvider(
    "reddit-search",
    "Reddit · public search sample",
    "reddit",
    async (query, signal) => {
      const params = new URLSearchParams({
        q: SEARCH_PHRASES.join(" OR "),
        sort: "new",
        type: "link",
        t: "all",
        limit: "100",
      });
      const response = await searchResponse(
        `https://www.reddit.com/search.rss?${params}`,
        signal,
        "Reddit",
        "application/atom+xml",
      );
      let xml: string;
      try {
        xml = await response.text();
      } catch {
        signal.throwIfAborted();
        throw new Error("Reddit search is unavailable.");
      }
      const stories = new Map<string, Story>();
      for (const { id, title, text, url, publishedAt } of redditAtomPosts(xml)) {
        const at = publication(publishedAt, query);
        if (!at || !mentionsHermes(`${title} ${text}`)) continue;
        const key = `reddit:${id}`;
        stories.set(
          key,
          socialStory({
            id: key,
            source: "reddit",
            label: "Reddit · public search sample",
            url,
            title,
            text: text || title,
            publishedAt: at,
            now: query.now,
          }),
        );
      }
      return [...stories.values()];
    },
    fresh,
  );
}
