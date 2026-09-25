import "server-only";

import type { Story } from "../model/story";
import type { NewsProvider } from "./types";
import {
  SEARCH_PHRASES,
  mentionsHermes,
  object,
  publication,
  searchJson,
  socialStory,
  socialProvider,
} from "./social-search";

/** Two bounded public searches, no auth, no firehose and no embedded-link fetches. */
export function blueskyProvider(fresh = false): NewsProvider {
  return socialProvider(
    "bluesky-search",
    "Bluesky · public search sample",
    "bluesky",
    async (query, signal) => {
      const stories = new Map<string, Story>();
      for (const phrase of SEARCH_PHRASES) {
        const params = new URLSearchParams({
          q: phrase,
          sort: "latest",
          since: query.since,
          until: query.now,
          limit: "50",
        });
        const data = object(
          await searchJson(
            `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?${params}`,
            signal,
            "Bluesky",
          ),
        );
        if (!Array.isArray(data?.posts)) throw new Error("Invalid Bluesky search response.");
        for (const raw of data.posts.slice(0, 50)) {
          const post = object(raw);
          const record = object(post?.record);
          const author = object(post?.author);
          const uri = typeof post?.uri === "string" ? post.uri : "";
          const match =
            /^at:\/\/(did:[a-z]+:[A-Za-z0-9._:%-]+)\/app\.bsky\.feed\.post\/([A-Za-z0-9_~.-]+)$/.exec(uri);
          const text = typeof record?.text === "string" ? record.text.trim() : "";
          const at = publication(record?.createdAt, query);
          if (!match || author?.did !== match[1] || !at || !text || !mentionsHermes(text)) continue;
          const id = `bluesky:${uri}`;
          stories.set(
            id,
            socialStory({
              id,
              source: "bluesky",
              label: "Bluesky · public search sample",
              url: `https://bsky.app/profile/${match[1]}/post/${match[2]}`,
              title: text.slice(0, 250),
              text,
              publishedAt: at,
              now: query.now,
            }),
          );
        }
      }
      return [...stories.values()];
    },
    fresh,
  );
}
