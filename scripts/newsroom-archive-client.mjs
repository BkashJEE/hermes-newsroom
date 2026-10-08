/** Shared by agent controls: bookmarks use the same durable API as the UI. */
export async function changeBookmark(base, action, id) {
  if (!["save", "unsave"].includes(action) || !id) throw new Error("Supply a story ID to save or unsave.");
  const headers = { "X-Newsroom-Client": "1", "Content-Type": "application/json" };
  const get = async (path) => {
    const response = await fetch(base + path, { headers });
    if (!response.ok) throw new Error(`Newsroom HTTP ${response.status}`);
    return response.json();
  };
  const archive = await get("/api/newsroom/archive");
  const retained = archive.records.find((record) => record.story.id === id);
  let story = retained?.story,
    mode = retained?.mode;
  if (!story) {
    const feed = await get("/api/newsroom");
    story = feed.stories.find((candidate) => candidate.id === id);
    mode = feed.mode;
  }
  if (!story)
    throw new Error(
      "Story not found in the feed or permanent archive. Import older browser saves from Archive first.",
    );
  const response = await fetch(base + "/api/newsroom/archive", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "story", story, mode, saved: action === "save" }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Permanent bookmark could not be written.");
  return {
    action,
    id,
    saved: action === "save",
    permanent: true,
    note: "Reload Archive to update an already-open browser.",
  };
}
