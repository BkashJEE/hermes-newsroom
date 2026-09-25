"use client";

import Link from "next/link";
import { Suspense } from "react";
import { JevLiveDesk } from "@/newsroom/components/jev-live-desk";
import { sortStories } from "@/newsroom/model/filters";
import { NewsroomProvider, useNewsroom } from "@/newsroom/state/newsroom-store";
import styles from "./workspace-overview.module.css";

function StudioDesk() {
  const { filtered } = useNewsroom();
  return <JevLiveDesk stories={sortStories(filtered, "newest")} />;
}

export function XStudioNewsroom() {
  return (
    <section className={styles.featured} aria-label="Hermes Newsroom in X-Studio">
      <div className={styles.featuredHeader}>
        <div>
          <p className={styles.eyebrow}>Collect → Jev → review</p>
          <h2>Hermes Newsroom in Studio</h2>
          <p>Follow the real news hunt and Jev decisions here before choosing what to share.</p>
        </div>
        <Link href="/newsroom/live-wire">Open full Live Wire</Link>
      </div>
      <Suspense fallback={<p role="status">Loading Jev Live Desk…</p>}>
        <NewsroomProvider>
          <StudioDesk />
        </NewsroomProvider>
      </Suspense>
    </section>
  );
}
