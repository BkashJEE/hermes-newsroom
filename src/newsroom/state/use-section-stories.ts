"use client";

import { sectionStories } from "../model/section-scope";
import { useNewsroom } from "./newsroom-store";

export function useSectionStories(section: string) {
  const { stories, filters, now, feed, showDismissed } = useNewsroom();
  return sectionStories(section, stories, filters, {
    now,
    watchlists: feed?.watchlists,
    includeDismissed: showDismissed,
  });
}
