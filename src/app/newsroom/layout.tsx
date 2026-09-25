import "@fontsource/barlow-condensed/800.css";
import "@fontsource/barlow-condensed/900.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { NewsroomProvider } from "@/newsroom/state/newsroom-store";
import { EmbedTheme } from "@/newsroom/components/embed-theme";
import { NewsroomShell } from "@/newsroom/components/newsroom-shell";

export const metadata: Metadata = {
  title: { default: "Hermes Newsroom", template: "%s · Hermes Newsroom" },
  description: "Ranked, evidence-scored AI intelligence with a clear next action.",
};

export default function NewsroomLayout({ children }: LayoutProps<"/newsroom">) {
  // Filters live in the URL, so the interactive tree renders under Suspense.
  return (
    <Suspense fallback={<main id="main" aria-busy="true" style={{ padding: "var(--margin)" }} />}>
      <NewsroomProvider>
        <EmbedTheme />
        <NewsroomShell>{children}</NewsroomShell>
      </NewsroomProvider>
    </Suspense>
  );
}
