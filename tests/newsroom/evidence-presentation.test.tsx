import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_STORIES } from "@/newsroom/fixtures/stories";
import type { Story } from "@/newsroom/model/story";
import { aggregateProviders } from "@/newsroom/providers/aggregate";
import { buildProviders } from "@/newsroom/providers/registry";
import { NewsroomProvider } from "@/newsroom/state/newsroom-store";
import { FrontPage } from "@/newsroom/components/front-page";
import { IntelligenceFileDrawer } from "@/newsroom/components/intelligence-file";
import { DailyNewspaper } from "@/newsroom/components/daily-newspaper";
import { SourceMark } from "@/newsroom/components/ui";
import { localBridge } from "@/newsroom/hermes/bridge";
import { setUrl } from "./navigation-mock";

vi.mock("next/navigation", async () => (await import("./navigation-mock")).navigationMock);

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  setUrl("/newsroom");
});
afterEach(() => vi.unstubAllGlobals());

async function prepareStories(evidenceMeasured: boolean | undefined, evidenceScore: number) {
  const now = new Date();
  const feed = await aggregateProviders(buildProviders("default"), {
    now: now.toISOString(),
    since: new Date(0).toISOString(),
  });
  const stories: Story[] = ["bluesky", "reddit"].map((source, index) => ({
    ...FIXTURE_STORIES[0],
    id: `evidence-test-${index}`,
    title: `Social evidence example ${index}`,
    source: source as Story["source"],
    sourceLabel: source,
    sourceUrl: `https://example.com/${index}`,
    publishedAt: now.toISOString(),
    detectedAt: now.toISOString(),
    evidenceMeasured,
    evidenceScore,
    sourceCount: 1,
    image: null,
    saved: false,
    dismissed: false,
    momentum: { measured: true, score: 10, changePct: 0, direction: "steady" },
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ...feed, stories }))),
  );
  return stories;
}

function evidenceChip(scope: HTMLElement) {
  return within(scope).getByText("Evidence", { exact: true }).parentElement!;
}

describe("evidence presentation", () => {
  it("shows the neutral Bluesky source mark", () => {
    const { container } = render(<SourceMark source="bluesky" />);
    expect(container.querySelector('[data-source="bluesky"]')).toHaveTextContent("B");
  });
  it.each([
    { measured: false, score: 0, label: "Unmeasured" },
    { measured: true, score: 0, label: "0" },
    { measured: undefined, score: 74, label: "74" },
  ])("composes daily brief evidence as $label", async ({ measured, score, label }) => {
    const stories = await prepareStories(measured, score);
    const brief = await localBridge.composeDaily(stories, new Date());
    expect(brief.items).toHaveLength(2);
    for (const item of brief.items) expect(item.line).toContain(`evidence ${label})`);
    expect(brief.text).toContain(`evidence ${label})`);
    if (measured === false) expect(brief.text).not.toContain("evidence 0");
  });
  it.each([
    { measured: false, score: 0, label: "Unmeasured" },
    { measured: true, score: 0, label: "0/100" },
    { measured: undefined, score: 74, label: "74/100" },
  ])("prints evidence as $label in newspaper bylines", async ({ measured, score, label }) => {
    await prepareStories(measured, score);
    render(
      <NewsroomProvider>
        <DailyNewspaper />
      </NewsroomProvider>,
    );
    const page = await screen.findByRole("region", { name: "Newspaper page 1: The Front Page" });
    await within(page).findByRole("heading", { name: "Social evidence example 0" });
    expect(within(page).getAllByText(new RegExp(`Evidence ${label}$`))).toHaveLength(2);
    if (measured === false) expect(page).not.toHaveTextContent("Evidence 0/100");
  });
  it.each([
    { measured: false, score: 0, label: "Unmeasured" },
    { measured: true, score: 0, label: "0" },
    { measured: undefined, score: 74, label: "74" },
  ])(
    "uses $label for evidence across the front page, flashcard and file",
    async ({ measured, score, label }) => {
      await prepareStories(measured, score);
      render(
        <NewsroomProvider>
          <FrontPage />
          <IntelligenceFileDrawer />
        </NewsroomProvider>,
      );
      const heading = await screen.findByRole("heading", { level: 2, name: "Social evidence example 0" });
      expect.soft(evidenceChip(heading.closest("article")!)).toHaveTextContent(`${label}Evidence`);
      const cards = screen.getByRole("region", { name: "Flashcards" });
      const stat = within(cards).getByText("Evidence score").closest("div")!;
      expect.soft(stat.querySelector("dd")).toHaveTextContent(`${label} evid`);
      if (measured === false) expect.soft(stat.querySelector("dd")).not.toHaveTextContent("0");
      await userEvent.setup().click(screen.getByRole("button", { name: /Open Intelligence File/ }));
      const dialog = await screen.findByRole("dialog", { name: "Social evidence example 0" });
      expect(within(dialog).queryByText("Independent sources")).not.toBeInTheDocument();
      expect(within(dialog).getByText("Sources", { exact: true }).parentElement).toHaveTextContent(
        "1Sources",
      );
      expect.soft(evidenceChip(dialog)).toHaveTextContent(`${label}Evidence`);
    },
  );
});
