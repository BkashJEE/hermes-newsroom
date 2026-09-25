import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PersonalDaily } from "@/newsroom/components/personal-daily";
const snapshot = {
  date: "2026-09-21",
  timezone: "UTC",
  collectedAt: "2026-09-21T12:00:00Z",
  coverage: [{ profile: "default", state: "ok", sessions: 1, omitted: 0 }],
  records: [
    {
      id: "S1",
      profile: "default",
      sessionId: "test-session",
      title: "Local test work",
      source: "cli",
      messages: 2,
      firstAt: "",
      lastAt: "",
      request: "Please review",
      response: "Review reported.",
    },
  ],
};
afterEach(() => vi.unstubAllGlobals());
it("loads private evidence without generating, then renders saved bullets and working source links", async () => {
  const data = { title: "My Hermes Daily", snapshot, edition: null, editions: [] };
  const edition = {
    id: "edition-1",
    title: data.title,
    generatedAt: snapshot.collectedAt,
    snapshot,
    headline: "Review reported",
    sections: [{ title: "Work", bullets: [{ text: "A review was reported.", sources: ["S1"] }] }],
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(data))
    .mockResolvedValueOnce(Response.json({ edition }))
    .mockResolvedValueOnce(Response.json({ ...data, edition }));
  vi.stubGlobal("fetch", fetch);
  render(<PersonalDaily />);
  const button = await screen.findByRole("button", { name: "Generate my newspaper" });
  expect(fetch).toHaveBeenCalledTimes(1);
  await userEvent.click(button);
  const workPage = screen.getByRole("article", { name: /Personal newspaper page 2/ });
  expect(await within(workPage).findByText("A review was reported.")).toBeInTheDocument();
  expect(screen.getAllByRole("article", { name: /^Personal newspaper page/ })).toHaveLength(4);
  await userEvent.click(within(workPage).getByRole("link", { name: "S1" }));
  expect(document.querySelector("#work-S1")).toHaveAttribute("open");
});
it("shows a clear empty date instead of fabricated activity", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        title: "My Hermes Daily",
        snapshot: { ...snapshot, records: [], coverage: [] },
        edition: null,
        editions: [],
      }),
    ),
  );
  render(<PersonalDaily />);
  expect(await screen.findByText("No recorded work for this date")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Generate my newspaper" })).toBeDisabled();
});
