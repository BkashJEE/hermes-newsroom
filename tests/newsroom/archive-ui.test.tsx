import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NewsroomProvider, useNewsroom } from "@/newsroom/state/newsroom-store";
import { SectionPage } from "@/newsroom/components/section-page";
import { SaveEdition } from "@/newsroom/components/archive-controls";
import { emptyArchive, type ArchiveData } from "@/newsroom/archive/model";
import { setUrl } from "./navigation-mock";
import { story } from "./helpers";
vi.mock("next/navigation", async () => (await import("./navigation-mock")).navigationMock);
let data: ArchiveData;
let failWrite = false;
const item = story({ id: "durable-story", saved: false });
beforeEach(() => {
  window.localStorage.clear();
  data = emptyArchive();
  failWrite = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/newsroom/archive") {
        if (init?.method !== "POST") return Response.json(data);
        if (failWrite) return Response.json({ error: "Disk full. Save failed." }, { status: 503 });
        const body = JSON.parse(String(init.body));
        if (body.action === "story")
          data.records = [
            { story: body.story, saved: body.saved, updatedAt: new Date().toISOString(), mode: body.mode },
          ];
        if (body.action === "edition") {
          const saved = { ...body.edition, id: "edition-one", savedAt: new Date().toISOString() };
          data.editions.push(saved);
          return Response.json(saved);
        }
        return Response.json({ ok: true });
      }
      return Response.json({
        stories: [item],
        providers: [],
        watchlists: [],
        mode: "fixture",
        generatedAt: new Date().toISOString(),
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
function SaveProbe() {
  const { toggleSave, archiveReady, stories, archiveError, announcement } = useNewsroom();
  return (
    <>
      <button disabled={!archiveReady || !stories.length} onClick={() => toggleSave(item.id)}>
        Bookmark
      </button>
      <p>{stories.find((s) => s.id === item.id)?.saved ? "Persisted save" : "Not saved"}</p>
      <p role="alert">{archiveError}</p>
      <p role="status">{announcement}</p>
    </>
  );
}
it("restores a bookmark after clearing browser storage and remounting, even when the feed fails", async () => {
  setUrl("/newsroom");
  const first = render(
    <NewsroomProvider>
      <SaveProbe />
    </NewsroomProvider>,
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Bookmark" })).toBeEnabled());
  await userEvent.setup().click(screen.getByRole("button", { name: "Bookmark" }));
  await screen.findByText("Persisted save");
  first.unmount();
  window.localStorage.clear();
  setUrl("/newsroom/archive");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/newsroom/archive" ? Response.json(data) : Response.json({}, { status: 503 }),
    ),
  );
  render(
    <NewsroomProvider>
      <SectionPage sectionId="archive" />
    </NewsroomProvider>,
  );
  const saved = await screen.findByRole("region", { name: "Saved · 1" });
  expect(within(saved).getByText(item.title)).toBeInTheDocument();
});
it("does not display a successful bookmark when disk writes fail", async () => {
  failWrite = true;
  setUrl("/newsroom");
  render(
    <NewsroomProvider>
      <SaveProbe />
    </NewsroomProvider>,
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Bookmark" })).toBeEnabled());
  await userEvent.setup().click(screen.getByRole("button", { name: "Bookmark" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Disk full"));
  expect(screen.getByText("Not saved")).toBeInTheDocument();
  expect(data.records).toHaveLength(0);
});
it("reopens a dated edition with its original source text and demo label", async () => {
  setUrl("/newsroom/editions");
  const first = render(
    <NewsroomProvider>
      <SaveEdition
        period="today"
        reports={[
          {
            title: "Frozen headline",
            summary: "Original summary",
            at: item.publishedAt,
            label: "Source report",
            sources: [{ title: "Original source", url: item.sourceUrl, summary: "Evidence" }],
          },
        ]}
      />
    </NewsroomProvider>,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "Save dated edition" }));
  expect(await screen.findByRole("link", { name: "Read saved edition" })).toHaveAttribute(
    "href",
    "/newsroom/archive?edition=edition-one",
  );
  first.unmount();
  window.localStorage.clear();
  await act(async () => setUrl("/newsroom/archive?edition=edition-one"));
  render(
    <NewsroomProvider>
      <SectionPage sectionId="archive" />
    </NewsroomProvider>,
  );
  const edition = await screen.findByRole("region", { name: "Saved edition" });
  expect(within(edition).getByText("Frozen headline")).toBeInTheDocument();
  expect(within(edition).getByText("Demo snapshot · fixture data")).toBeInTheDocument();
  expect(within(edition).getByText("Original summary")).toBeInTheDocument();
  await userEvent.setup().click(within(edition).getByText("Details & sources · 1"));
  expect(within(edition).getByRole("link", { name: "Original source" })).toHaveAttribute(
    "href",
    item.sourceUrl,
  );
});
