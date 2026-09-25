import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aggregateProviders } from "@/newsroom/providers/aggregate";
import { buildProviders } from "@/newsroom/providers/registry";
import { NewsroomProvider } from "@/newsroom/state/newsroom-store";
import { SectionPage } from "@/newsroom/components/section-page";
import { NEWSROOM_SECTIONS } from "@/newsroom/sections";
import { setUrl } from "./navigation-mock";
import { story } from "./helpers";
import { HermesUpdateBrief } from "@/newsroom/components/hermes-update-brief";
import { buildUpdateBrief, UPDATE_QUESTIONS } from "@/newsroom/model/update-brief";

vi.mock("next/navigation", async () => (await import("./navigation-mock")).navigationMock);

async function feed() {
  const now = new Date();
  const result = await aggregateProviders(buildProviders(), {
    now: now.toISOString(),
    since: new Date(now.getTime() - 30 * 86_400_000).toISOString(),
  });
  return new Response(JSON.stringify(result), { status: 200 });
}

function renderSection(id: string) {
  setUrl(`/newsroom/${id}`);
  return render(
    <NewsroomProvider>
      <SectionPage sectionId={id} />
    </NewsroomProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(feed));
});

afterEach(() => vi.unstubAllGlobals());

describe("section workspaces", () => {
  it("explains five questions per release, with source links and a separate merged view", async () => {
    const user = userEvent.setup();
    const release = story({
      id: "github:hermes:brief",
      title: "Synthetic release",
      source: "github",
      releaseChannel: "stable",
      sourceUrl: "https://github.com/NousResearch/hermes-agent/releases/tag/brief",
      updateBrief: buildUpdateBrief(
        "Synthetic release",
        "## Added\n- Added calendar integration.\n## Known issues\n- Offline sync still fails on Windows.",
      ),
    });
    const merge = story({
      id: "github:change:brief",
      title: "fix: recover renderer crashes",
      source: "github",
      sourceUrl: "https://github.com/NousResearch/hermes-agent/pull/123",
      updateBrief: buildUpdateBrief("fix: recover renderer crashes", "", true),
    });
    render(<HermesUpdateBrief updates={[release, merge]} />);
    for (const { title } of UPDATE_QUESTIONS)
      expect(screen.getByRole("region", { name: title })).toBeInTheDocument();
    const additions = screen.getByRole("region", { name: "What is new" });
    expect(within(additions).getByText("Added calendar integration.")).toBeInTheDocument();
    expect(within(additions).getByRole("link")).toHaveAttribute("href", release.sourceUrl);
    expect(
      within(screen.getByRole("region", { name: "What is bad" })).getByText(/Offline sync/),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Update to explain" }), "merged");
    expect(screen.getByText(/may not be included in a published version yet/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "What is better" })).getByRole("link")).toHaveAttribute(
      "href",
      merge.sourceUrl,
    );
    expect(
      within(screen.getByRole("region", { name: "What is bad" })).getByText(/No explicit known issues/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Added calendar integration.")).not.toBeInTheDocument();
  });
  it("keeps official releases and merged changes separate from community projects", async () => {
    const publishedAt = new Date(Date.now() - 3600000).toISOString();
    const rows = [
      story({
        id: "github:hermes:1",
        title: "Official test release",
        source: "github",
        type: "build",
        publishedAt,
        sourceUrl: "https://github.com/NousResearch/hermes-agent/releases/tag/test",
        releaseChannel: "stable",
      }),
      story({
        id: "github:change:2",
        title: "Upstream test fix",
        source: "github",
        type: "developing",
        publishedAt,
        sourceUrl: "https://github.com/NousResearch/hermes-agent/pull/2",
      }),
      story({
        id: "github:project:3",
        title: "Community test project",
        source: "github",
        type: "community",
        publishedAt,
        sourceUrl: "https://github.com/community/example",
      }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const result = await (await feed()).json();
        return new Response(JSON.stringify({ ...result, stories: rows }));
      }),
    );
    renderSection("hermes-agent-updates");
    const releases = await screen.findByRole("region", { name: "Published releases · 1" });
    expect(within(releases).getByRole("link", { name: /Read release & upgrade notes/ })).toHaveAttribute(
      "href",
      rows[0].sourceUrl,
    );
    const changes = screen.getByRole("region", { name: "Merged fixes & changes · 1" });
    expect(within(changes).getByRole("button", { name: "Upstream test fix" })).toBeInTheDocument();
    expect(within(changes).getByText(/may not be included in a published version/)).toBeInTheDocument();
    expect(screen.queryByText("Community test project")).not.toBeInTheDocument();
  });
  it.each(
    NEWSROOM_SECTIONS.filter((s) => s.id !== "front-page" && s.id !== "personal-daily").map((s) => [
      s.id,
      s.label,
    ]),
  )("%s renders a titled workspace", async (id, label) => {
    renderSection(id);
    expect(screen.getByRole("heading", { level: 2, name: label })).toBeInTheDocument();
    expect(screen.getByText("Workspace", { exact: true })).toBeInTheDocument();
    // Content arrives once the feed loads — never an empty page.
    expect(await screen.findAllByRole("region")).not.toHaveLength(0);
  });

  it("Live Wire lists stories newest first", async () => {
    renderSection("live-wire");
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Hermes users compare local vs hosted models");
  });

  it("Hermes Daily displays four newspaper pages and opens the browser print dialog", async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderSection("hermes-daily");
    await screen.findByRole("region", { name: /^Newspaper page 1/ });
    expect(screen.getByRole("button", { name: "Newspaper" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findAllByRole("region", { name: /^Newspaper page/ })).toHaveLength(4);
    const sources = screen.getByRole("region", { name: /^Newspaper page 4/ });
    expect(within(sources).getAllByRole("link").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    expect(
      within(screen.getByLabelText("Daily flashcards")).getAllByRole("article").length,
    ).toBeLessThanOrEqual(9);
    await user.click(screen.getByRole("button", { name: "Print / Save PDF" }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });

  it("Weekly Chronicle shows only the Hermes ecosystem with a compact card grid", async () => {
    renderSection("weekly-chronicle");
    const grid = await screen.findByRole("region", { name: "Hermes ecosystem this week" });
    expect((await within(grid).findAllByRole("article")).length).toBeGreaterThan(0);
    expect(within(grid).getByRole("combobox", { name: "Weekly desk" })).toBeInTheDocument();
    expect(within(grid).getByText(/Published stable releases/)).toBeInTheDocument();
  });

  it("Built With Hermes shows builds and community stories", async () => {
    renderSection("built-with-hermes");
    expect(
      await screen.findByRole("region", { name: "Community releases & builds · 3" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Project activity/ })).toBeInTheDocument();
  });

  it("Trend Radar ranks ten topics with meters and links to a search", async () => {
    renderSection("trend-radar");
    const panel = await screen.findByRole("region", { name: "Top topics" });
    const links = within(panel).getAllByRole("link");
    expect(links).toHaveLength(10);
    expect(links[0].getAttribute("href")).toMatch(/^\/newsroom\?q=/);
    expect(screen.getAllByRole("meter").length).toBeGreaterThanOrEqual(10);
  });

  it("Archive shows saved stories and restores dismissed ones", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "newsroom:v1:overlays",
      JSON.stringify({ saved: ["fixture:hermes-toolkit"], dismissed: ["fixture:host-outage"] }),
    );
    renderSection("archive");
    const saved = await screen.findByRole("region", { name: "Saved · 1" });
    expect(within(saved).getByText("Hermes Toolkit v0.3 released")).toBeInTheDocument();
    const dismissed = screen.getByRole("region", { name: "Dismissed · 1" });
    await user.click(within(dismissed).getByRole("button", { name: /Restore/ }));
    expect(await screen.findByRole("region", { name: "Dismissed · 0" })).toBeInTheDocument();
  });
});
