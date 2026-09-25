import { afterEach, expect, it, vi } from "vitest";
import { resolveGateway, runHermes } from "@/newsroom/hermes/server";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("uses both explicit environment overrides without reading Hermes credentials", async () => {
  const read = vi.fn(async () => {
    throw new Error("Unexpected read");
  });
  expect(
    await resolveGateway(
      { HERMES_API_URL: "http://127.0.0.1:8642", HERMES_API_KEY: "synthetic-test-key" },
      read,
    ),
  ).toEqual({
    base: "http://127.0.0.1:8642",
    headers: { Authorization: "Bearer synthetic-test-key", "Content-Type": "application/json" },
  });
  expect(read).not.toHaveBeenCalled();
});
it("falls back independently when only the key is overridden", async () => {
  const read = vi.fn(async () =>
    JSON.stringify({ platforms: { api_server: { listener_base: "http://127.0.0.1:8642" } } }),
  );
  expect((await resolveGateway({ HERMES_API_KEY: "synthetic-test-key" }, read)).base).toBe(
    "http://127.0.0.1:8642",
  );
  expect(read).toHaveBeenCalledTimes(1);
});
it("falls back independently when only the URL is overridden", async () => {
  const read = vi.fn(async () => 'API_SERVER_KEY="synthetic-fallback"\n');
  expect(
    (await resolveGateway({ HERMES_API_URL: "http://localhost:8642/" }, read)).headers.Authorization,
  ).toBe("Bearer synthetic-fallback");
  expect(read).toHaveBeenCalledTimes(1);
});
it("rejects non-loopback credential destinations", async () => {
  const read = vi.fn(async () => "");
  await expect(
    resolveGateway({ HERMES_API_URL: "https://outside.example", HERMES_API_KEY: "synthetic-test-key" }, read),
  ).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});
it("sends request-level tool controls without asserting gateway enforcement", async () => {
  vi.stubEnv("HERMES_API_URL", "http://127.0.0.1:8642");
  vi.stubEnv("HERMES_API_KEY", "synthetic-test-key");
  const fetch = vi.fn(async () => Response.json({ choices: [{ message: { content: "Sourced text" } }] }));
  vi.stubGlobal("fetch", fetch);
  expect(
    await runHermes("Synthetic untrusted story", new AbortController().signal, {
      gateway: async () => ({
        base: "http://127.0.0.1:8642",
        headers: { Authorization: "Bearer synthetic-test-key", "Content-Type": "application/json" },
      }),
      installation: async () => ({ source: "synthetic-project", workspace: 8 }),
      fetch,
    }),
  ).toBe("Sourced text");
  const args = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(args[0]).toBe("http://127.0.0.1:8642/v1/chat/completions");
  expect(JSON.parse(String(args[1].body))).toMatchObject({ tools: [], tool_choice: "none", stream: false });
});
