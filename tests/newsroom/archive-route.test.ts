import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/newsroom/archive/route";
import { emptyArchive } from "@/newsroom/archive/model";
import { story } from "./helpers";
const store = vi.hoisted(() => ({
  read: vi.fn(),
  saveStory: vi.fn(),
  saveEdition: vi.fn(),
  importBackup: vi.fn(),
}));
vi.mock("@/newsroom/archive/server", () => ({ archiveStore: store }));
beforeEach(() => {
  vi.resetAllMocks();
  store.read.mockResolvedValue(emptyArchive());
});
function request(payload?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://127.0.0.1:3510/api/newsroom/archive", {
    method: payload ? "POST" : "GET",
    headers: {
      host: "127.0.0.1:3510",
      "x-newsroom-client": "1",
      "content-type": "application/json",
      ...headers,
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
}
it("guards private archive reads and writes against foreign origins and nonlocal hosts", async () => {
  for (const headers of [
    { origin: "https://elsewhere.test" },
    { host: "attacker.test:3510" },
    { "x-newsroom-client": "" },
  ] as Record<string, string>[]) {
    expect((await GET(request(undefined, headers))).status).toBe(403);
    expect((await POST(request({ action: "import", backup: emptyArchive() }, headers))).status).toBe(403);
  }
  expect(store.read).not.toHaveBeenCalled();
  expect(store.importBackup).not.toHaveBeenCalled();
});
it("validates mutations before touching storage and returns a no-store response", async () => {
  expect(
    (
      await POST(
        request({
          action: "story",
          story: story({ sourceUrl: "javascript:bad" }),
          saved: true,
          mode: "fixture",
        }),
      )
    ).status,
  ).toBe(400);
  expect(store.saveStory).not.toHaveBeenCalled();
  const response = await POST(request({ action: "story", story: story(), saved: true, mode: "fixture" }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(store.saveStory).toHaveBeenCalledWith(expect.objectContaining({ saved: true, mode: "fixture" }));
});
it("reports failed writes without claiming success and rejects oversized bodies", async () => {
  store.saveStory.mockRejectedValue(new Error("private filesystem detail"));
  const response = await POST(request({ action: "story", story: story(), saved: true, mode: "fixture" }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private filesystem detail");
  expect(
    (await POST(request({ action: "import" }, { "content-length": String(26 * 1024 * 1024) }))).status,
  ).toBe(413);
});
