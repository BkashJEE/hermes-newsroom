"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useNewsroom } from "../state/newsroom-store";
import { CommandBar } from "./command-bar";
import { SectionNav } from "./section-nav";
import { BreakingTicker } from "./breaking-ticker";
import { IntelligenceFileDrawer } from "./intelligence-file";
import { HermesPanel } from "./hermes-panel";
import { DailyModal } from "./daily-modal";
import { UndoToast } from "./status";
import styles from "./newsroom-shell.module.css";

/** Persistent Newsroom frame: command bar, section nav, ticker, dialogs. */
export function NewsroomShell({ children }: { children: ReactNode }) {
  const { announcement, navOpen, setNavOpen, navMode } = useNewsroom();
  const pathname = usePathname();

  // Close the small-screen nav drawer after navigating.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname, setNavOpen]);

  // "/" jumps to search, like the hint in the search box says.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        document.getElementById("newsroom-search")?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className={styles.shell}
      data-newsroom-shell
      data-nav-open={navOpen || undefined}
      data-nav={navMode === "auto" ? undefined : navMode}
    >
      <CommandBar />
      <SectionNav />
      <button
        type="button"
        className={styles.scrim}
        aria-label="Close navigation"
        tabIndex={-1}
        onClick={() => setNavOpen(false)}
      />
      <main data-newsroom-main id="main" className={styles.main}>
        {pathname !== "/newsroom/personal-daily" && (
          <>
            <BreakingTicker />
            <HermesPanel />
          </>
        )}
        {children}
      </main>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
      <UndoToast />
      <IntelligenceFileDrawer />
      <DailyModal />
    </div>
  );
}
