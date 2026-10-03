import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { aggregateProviders } from "@/newsroom/providers/aggregate";
import { buildProviders } from "@/newsroom/providers/registry";
import { NewsroomProvider } from "@/newsroom/state/newsroom-store";
import { SectionPage } from "@/newsroom/components/section-page";
import { CommandBar } from "@/newsroom/components/command-bar";
import { NEWSROOM_SECTIONS } from "@/newsroom/sections";
import { sectionStories } from "@/newsroom/model/section-scope";
import { DEFAULT_FILTERS } from "@/newsroom/model/filters";
import { currentUrl, setUrl } from "./navigation-mock";
import { story } from "./helpers";

vi.mock("next/navigation", async () => (await import("./navigation-mock")).navigationMock);

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const now = new Date();
      return new Response(
        JSON.stringify(
          await aggregateProviders(buildProviders(), {
            now: now.toISOString(),
            since: new Date(0).toISOString(),
          }),
        ),
      );
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function open(query = "") {
  setUrl(`/newsroom/editions${query}`);
  return render(
    <NewsroomProvider>
      <CommandBar />
      <SectionPage sectionId="editions" />
    </NewsroomProvider>,
  );
}

it("has eight sections and keeps personal work separate from public Editions", () => {
  expect(NEWSROOM_SECTIONS.map((s) => s.id)).toEqual([
    "front-page",
    "hermes-agent-updates",
    "live-wire",
    "editions",
    "personal-daily",
    "built-with-hermes",
    "trend-radar",
    "archive",
  ]);
});

it("defaults to Today, preserves filters in range links and reacts to URL history", async () => {
  open("?q=Hermes&source=github&watch=hermes&scenario=default");
  const range = screen.getByRole("navigation", { name: "Edition range" });
  expect(within(range).getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  const week = within(range).getByRole("link", { name: "This week" });
  const destination = new URL(week.getAttribute("href")!, "http://localhost");
  expect(Object.fromEntries(destination.searchParams)).toMatchObject({
    range: "week",
    q: "Hermes",
    source: "github",
    watch: "hermes",
    scenario: "default",
  });
  expect(screen.getByRole("combobox", { name: "Time range" })).toBeDisabled();
  await act(async () => setUrl(destination.pathname + destination.search));
  expect(week).toHaveAttribute("aria-current", "page");
  expect(await screen.findByRole("region", { name: "Hermes ecosystem this week" })).toBeInTheDocument();
  await act(async () => setUrl("/newsroom/editions?range=today"));
  expect(await screen.findByRole("button", { name: "Flashcards" })).toHaveAttribute("aria-pressed", "true");
});

it("clears search and source without losing the weekly edition", async () => {
  open("?range=week&q=missing&source=github");
  await userEvent.setup().click(screen.getByRole("button", { name: "Clear filters" }));
  expect(currentUrl().searchParams.get("range")).toBe("week");
  expect(currentUrl().searchParams.has("q")).toBe(false);
  expect(currentUrl().searchParams.has("source")).toBe(false);
  expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
});

it("uses local midnight for Today and seven days for This week while respecting source filters", () => {
  const now = new Date(2026, 9, 3, 12);
  const recent = story({
    id: "today",
    publishedAt: new Date(2026, 9, 3, 10).toISOString(),
    topics: ["Hermes Agent"],
    source: "github",
  });
  const yesterday = { ...recent, id: "yesterday", publishedAt: new Date(2026, 9, 2, 23).toISOString() };
  const old = { ...recent, id: "old", publishedAt: new Date(2026, 8, 20).toISOString() };
  const future = { ...recent, id: "future", publishedAt: new Date(2026, 9, 4).toISOString() };
  const rows = [recent, yesterday, old, future];
  expect(sectionStories("editions", rows, DEFAULT_FILTERS, { now }).map((s) => s.id)).toEqual(["today"]);
  expect(
    sectionStories("editions", rows, { ...DEFAULT_FILTERS, range: "week" }, { now }).map((s) => s.id),
  ).toEqual(["today", "yesterday"]);
  expect(
    sectionStories("editions", rows, { ...DEFAULT_FILTERS, range: "week", source: "reddit" }, { now }),
  ).toEqual([]);
});
