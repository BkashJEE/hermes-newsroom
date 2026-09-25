import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aggregateProviders } from "@/newsroom/providers/aggregate";
import { buildProviders } from "@/newsroom/providers/registry";
import { parseScenario } from "@/newsroom/providers/scenarios";
import { NewsroomProvider } from "@/newsroom/state/newsroom-store";
import { NewsroomShell } from "@/newsroom/components/newsroom-shell";
import { FrontPage } from "@/newsroom/components/front-page";
import { FIXTURE_STORIES } from "@/newsroom/fixtures/stories";
import { currentUrl, setUrl } from "./navigation-mock";

vi.mock("next/navigation", async () => (await import("./navigation-mock")).navigationMock);

const WATCHLISTS = [
  { id: "security", label: "Security", topics: ["Security"] },
  { id: "local-models", label: "Local Models", topics: ["Local Models"] },
];

async function fakeFeed(input: RequestInfo | URL) {
  const scenario = parseScenario(new URL(String(input), "http://localhost").searchParams.get("scenario"));
  const now = new Date();
  const feed = await aggregateProviders(
    buildProviders(scenario === "slow" ? "default" : scenario),
    { now: now.toISOString(), since: new Date(now.getTime() - 30 * 86_400_000).toISOString() },
    { watchlists: WATCHLISTS },
  );
  if (scenario === "stale") feed.generatedAt = new Date(now.getTime() - 47 * 60_000).toISOString();
  return new Response(JSON.stringify(feed), { status: 200 });
}

function renderNewsroom(path = "/newsroom") {
  setUrl(path);
  return render(
    <NewsroomProvider>
      <NewsroomShell>
        <FrontPage />
      </NewsroomShell>
    </NewsroomProvider>,
  );
}

const lead = () => screen.findByRole("heading", { level: 2, name: "Agents are rebuilding context" });

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(fakeFeed));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Front Page", () => {
  it("shows a loading skeleton, then the lead story, flashcards, live list and rail", async () => {
    renderNewsroom();
    expect(screen.getByLabelText("Loading intelligence")).toHaveAttribute("aria-busy", "true");
    await lead();
    const cards = screen.getByRole("region", { name: "Flashcards" });
    expect(within(cards).getAllByRole("article")).toHaveLength(3);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What should I do?" })).toBeInTheDocument();
    expect(screen.getAllByRole("meter")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: "Trending Now" })).toBeInTheDocument();
    expect(screen.getByText("Fixture data")).toBeInTheDocument();
  });

  it("meters expose label, number and level, not color alone", async () => {
    renderNewsroom();
    await lead();
    const meter = screen.getByRole("meter", { name: "Hermes" });
    expect(meter).toHaveAttribute("aria-valuenow");
    expect(meter.getAttribute("aria-valuetext")).toMatch(/^\d+ of 100, (Low|Moderate|High|Very high)$/);
  });
});

describe("filters", () => {
  it("the chosen sort changes the selected lead and list together", async () => {
    const user = userEvent.setup();
    renderNewsroom();
    await lead();
    for (const value of ["newest", "evidence", "least-covered"]) {
      await user.selectOptions(screen.getByRole("combobox", { name: "Sort" }), value);
      const firstRow = within(screen.getByRole("table")).getAllByRole("row")[1];
      const title = within(firstRow).getAllByRole("button")[0].textContent;
      expect(document.querySelector("#lead-headline")?.textContent).toBe(title);
    }
    expect(within(screen.getByRole("table")).getAllByRole("row").length).toBeLessThanOrEqual(9);
  });
  it("explains an unconnected live source and lets readers return to connected sources", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const fixture = await (await fakeFeed(input)).json();
        return new Response(
          JSON.stringify({
            ...fixture,
            mode: "live",
            stories: fixture.stories.filter(
              (s: { source: string }) => s.source === "github" || s.source === "hackernews",
            ),
          }),
        );
      }),
    );
    renderNewsroom("/newsroom?source=x");
    expect(await screen.findByText("X is not connected.")).toBeVisible();
    expect(screen.getByRole("option", { name: "X — not connected" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Source connection required" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Show connected sources" }));
    expect(screen.queryByText("X is not connected.")).not.toBeInTheDocument();
    expect(currentUrl().searchParams.has("source")).toBe(false);
  });

  it("keeps fixture X stories available without a live connection warning", async () => {
    renderNewsroom("/newsroom?source=x");
    await screen.findByRole("table");
    expect(screen.getByRole("option", { name: "X" })).toBeInTheDocument();
    expect(screen.queryByText("X is not connected.")).not.toBeInTheDocument();
  });

  it("search filters stories and persists to the URL", async () => {
    const user = userEvent.setup();
    renderNewsroom();
    await lead();
    await user.type(screen.getByRole("searchbox", { name: "Search stories" }), "sandbox");
    await waitFor(() => expect(currentUrl().searchParams.get("q")).toBe("sandbox"));
    await screen.findByRole("heading", { level: 2, name: /Sandbox escape fixed/ });
    expect(screen.getByText(/^1$/, { selector: "strong" })).toBeInTheDocument();
  });

  it("shows the no-results state and clears filters", async () => {
    const user = userEvent.setup();
    renderNewsroom("/newsroom?q=zzzz-no-match");
    await screen.findByRole("heading", { name: "No stories match" });
    await user.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    await lead();
    expect(currentUrl().search).toBe("");
  });

  it("source, time, type and sort selects update the URL and the view", async () => {
    const user = userEvent.setup();
    renderNewsroom();
    await lead();
    await user.selectOptions(screen.getByRole("combobox", { name: "Source" }), "github");
    expect(currentUrl().searchParams.get("source")).toBe("github");
    const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
    await waitFor(() => rows().forEach((r) => expect(r).toHaveTextContent("GitHub")));

    await user.selectOptions(screen.getByRole("combobox", { name: "Time range" }), "week");
    expect(currentUrl().searchParams.get("range")).toBe("week");

    await user.selectOptions(screen.getByRole("combobox", { name: "Type" }), "build");
    expect(currentUrl().searchParams.get("type")).toBe("build");

    await user.selectOptions(screen.getByRole("combobox", { name: "Sort" }), "newest");
    expect(currentUrl().searchParams.get("sort")).toBe("newest");
    await waitFor(() => expect(rows()[0]).toHaveTextContent("Hermes Toolkit v0.3 released"));
    expect(rows()[1]).toHaveTextContent("passes 10k stars");
  });

  it("custom range reveals date inputs", async () => {
    const user = userEvent.setup();
    renderNewsroom();
    await lead();
    await user.selectOptions(screen.getByRole("combobox", { name: "Time range" }), "custom");
    expect(await screen.findByLabelText("From date")).toBeInTheDocument();
    expect(screen.getByLabelText("To date")).toBeInTheDocument();
  });

  it("restores filters from the URL on load", async () => {
    renderNewsroom("/newsroom?source=reddit&sort=evidence");
    await screen.findByRole("table");
    expect(screen.getByRole("combobox", { name: "Source" })).toHaveValue("reddit");
    expect(screen.getByRole("combobox", { name: "Sort" })).toHaveValue("evidence");
  });

  it("watchlists filter the feed", async () => {
    const user = userEvent.setup();
    renderNewsroom();
    await lead();
    const button = screen.getByRole("button", { name: /Security/, pressed: false });
    await user.click(button);
    expect(currentUrl().searchParams.get("watch")).toBe("security");
    expect(await screen.findByText(/in Security/)).toBeInTheDocument();
  });
});

describe("flashcards and intelligence file", () => {
  it("expands a flashcard in place", async () => {
    const user = userEvent.setup();
    renderNewsroom();
    await lead();
    const expand = screen.getAllByRole("button", { name: "Expand" })[0];
    await user.click(expand);
    expect(expand).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "Why it matters", level: 4 })).toBeInTheDocument();
  });

  it("opens the intelligence file with every section, and closes it", async () => {
    const user = userEvent.setup();
    renderNewsroom();
    await lead();
    await user.click(screen.getByRole("button", { name: /Open Intelligence File/ }));
    const dialog = await screen.findByRole("dialog", { name: "Agents are rebuilding context" });
    for (const name of [
      "Full summary",
      "Why it matters",
      /Evidence · 5/,
      "Original source",
      /Conflicting evidence · 1/,
      /Hermes relevance · 92\/100/,
      "Recommended next action",
    ]) {
      expect(within(dialog).getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(within(dialog).getAllByRole("link").length).toBeGreaterThanOrEqual(6);
    await user.click(within(dialog).getByRole("button", { name: "Close intelligence file" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("selecting a live-list row opens that story", async () => {
    const user = userEvent.setup();
    renderNewsroom();
    await lead();
    await user.click(
      within(screen.getByRole("table")).getByRole("button", { name: "Hermes Toolkit v0.3 released" }),
    );
    expect(await screen.findByRole("dialog", { name: "Hermes Toolkit v0.3 released" })).toBeInTheDocument();
  });

  it("saves from the overflow menu", async () => {
    const user = userEvent.setup();
    renderNewsroom();
    await lead();
    await user.click(screen.getAllByRole("button", { name: /More actions for/ })[0]);
    await user.click(screen.getByRole("menuitem", { name: "Save story" }));
    expect(screen.getAllByText("Saved").length).toBeGreaterThan(0);
  });
});

describe("What Should I Do?", () => {
  it("the only story actions are the reading ones, and both show a local result", async () => {
    const user = userEvent.setup();
    renderNewsroom();
    await lead();
    const rail = () => screen.getByRole("region", { name: "What should I do?" });
    const action = (name: RegExp) => within(rail()).getByRole("button", { name });

    // Drafting and work-queue actions were removed: the Newsroom reports, it does not produce.
    for (const gone of [/^Post/, /^Reply/, /^Test/, /^Build/]) {
      expect(within(rail()).queryByRole("button", { name: gone })).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/Desk queue/)).not.toBeInTheDocument();

    // Track → toggles tracking state
    await user.click(action(/^Track/));
    expect(within(rail()).getByRole("button", { name: /^Tracking/, pressed: true })).toBeInTheDocument();

    // Ignore → dismisses with undo
    await user.click(action(/^Ignore/));
    expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Agents are rebuilding context" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await lead();
  });

  it("dismissed stories can be shown and restored", async () => {
    const user = userEvent.setup();
    renderNewsroom();
    await lead();
    await user.click(
      within(screen.getByRole("region", { name: "What should I do?" })).getByRole("button", {
        name: /^Ignore/,
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Show 1 dismissed" }));
    await user.click(within(screen.getByRole("table")).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /dismissed/ })).not.toBeInTheDocument());
  });
});

describe("Generate Daily", () => {
  it("opens a locally composed brief", async () => {
    const user = userEvent.setup();
    renderNewsroom();
    await lead();
    await user.click(screen.getByRole("button", { name: "Generate Daily" }));
    const dialog = await screen.findByRole("dialog", { name: /Hermes Daily —/ });
    expect(within(dialog).getByText(/Local summary/)).toBeInTheDocument();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(5);
  });
});

describe("ticker", () => {
  it("shows breaking stories, steps manually and can be dismissed", async () => {
    const user = userEvent.setup();
    renderNewsroom();
    const ticker = await screen.findByRole("region", { name: "Breaking intelligence" });
    const first = within(ticker).getByRole("button", { name: /memory plugin/ });
    expect(first).toBeInTheDocument();
    await user.click(within(ticker).getByRole("button", { name: "Next breaking item" }));
    expect(within(ticker).getByRole("button", { name: /outage/ })).toBeInTheDocument();
    await user.click(within(ticker).getByRole("button", { name: "Dismiss breaking ticker" }));
    expect(screen.queryByRole("region", { name: "Breaking intelligence" })).not.toBeInTheDocument();
  });

  it("does not auto-advance when reduced motion is preferred", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (q: string) =>
        ({
          matches: q.includes("reduce"),
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList,
    );
    renderNewsroom();
    const ticker = await screen.findByRole("region", { name: "Breaking intelligence" });
    expect(within(ticker).queryByRole("button", { name: /Pause ticker/ })).not.toBeInTheDocument();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(within(ticker).getByText(/1\/2/)).toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe("interface states", () => {
  it("empty feed", async () => {
    renderNewsroom("/newsroom?scenario=empty");
    expect(await screen.findByRole("heading", { name: "No intelligence yet" })).toBeInTheDocument();
  });

  it("provider error when every source fails", async () => {
    renderNewsroom("/newsroom?scenario=error");
    expect(await screen.findByRole("heading", { name: "Sources are not responding" })).toBeInTheDocument();
  });

  it("partial failure keeps the rest of the feed", async () => {
    renderNewsroom("/newsroom?scenario=partial");
    expect(await screen.findByText("1 of 3 sources unavailable.")).toBeInTheDocument();
    await lead();
  });

  it("stale data warning", async () => {
    renderNewsroom("/newsroom?scenario=stale");
    expect(await screen.findByText("This feed may be out of date.")).toBeInTheDocument();
  });

  it("offline state", async () => {
    renderNewsroom("/newsroom?scenario=offline");
    expect(await screen.findByRole("heading", { name: "You are offline" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("request failure shows an error, not a blank page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    renderNewsroom();
    expect(await screen.findByRole("heading", { name: "The Newsroom could not load" })).toBeInTheDocument();
  });
});

describe("keyboard", () => {
  it("'/' focuses search and Escape clears it", async () => {
    const user = userEvent.setup();
    renderNewsroom();
    await lead();
    await user.keyboard("/");
    const search = screen.getByRole("searchbox", { name: "Search stories" });
    expect(search).toHaveFocus();
    await user.keyboard("abc");
    await user.keyboard("{Escape}");
    expect(search).toHaveValue("");
  });

  it("overflow menu supports arrow keys and Escape", async () => {
    const user = userEvent.setup();
    renderNewsroom();
    await lead();
    const toggle = screen.getAllByRole("button", { name: /More actions for/ })[0];
    await user.click(toggle);
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });
});

it("fixtures are the only data source", () => {
  expect(FIXTURE_STORIES.length).toBeGreaterThan(15);
});
