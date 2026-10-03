import { afterEach, expect, it, vi } from "vitest";
import { GatewayConfigError, probeGateway, resolveGateway, runHermes } from "@/newsroom/hermes/server";
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
    remote: false,
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
it("rejects non-loopback credential destinations by default and names the address and the opt-in", async () => {
  const read = vi.fn(async () => "");
  await expect(
    resolveGateway({ HERMES_API_URL: "https://outside.example", HERMES_API_KEY: "synthetic-test-key" }, read),
  ).rejects.toThrow(/outside\.example.*HERMES_ALLOW_REMOTE_GATEWAY=1/);
  await expect(
    resolveGateway({ HERMES_API_URL: "http://gateway.tailnet.ts.net:8642" }, read),
  ).rejects.toBeInstanceOf(GatewayConfigError);
  expect(read).not.toHaveBeenCalled();
});
it("keeps refusing a remote URL when the opt-in is present but not truthy", async () => {
  const read = vi.fn(async () => "");
  for (const flag of ["", "0", "false", "no"])
    await expect(
      resolveGateway(
        {
          HERMES_ALLOW_REMOTE_GATEWAY: flag,
          HERMES_API_URL: "http://gateway.tailnet.ts.net:8642",
          HERMES_API_KEY: "synthetic-test-key",
        },
        read,
      ),
    ).rejects.toThrow(/HERMES_ALLOW_REMOTE_GATEWAY=1/);
  expect(read).not.toHaveBeenCalled();
});
it("accepts an explicitly opted-in remote gateway over http or https without reading local Hermes files", async () => {
  const read = vi.fn(async () => {
    throw new Error("Unexpected read");
  });
  for (const url of [
    "http://100.64.0.7:8642",
    "https://gateway.tailnet.ts.net:8642/",
    "http://[fd7a::1]:8642",
  ])
    expect(
      await resolveGateway(
        { HERMES_ALLOW_REMOTE_GATEWAY: "1", HERMES_API_URL: url, HERMES_API_KEY: " synthetic-remote-key " },
        read,
      ),
    ).toEqual({
      base: url.replace(/\/$/, ""),
      headers: { Authorization: "Bearer synthetic-remote-key", "Content-Type": "application/json" },
      remote: true,
    });
  expect(read).not.toHaveBeenCalled();
});
it("requires HERMES_API_KEY for a remote gateway instead of the local ~/.hermes/.env key", async () => {
  const read = vi.fn(async () => 'API_SERVER_KEY="local-only"\n');
  await expect(
    resolveGateway(
      { HERMES_ALLOW_REMOTE_GATEWAY: "1", HERMES_API_URL: "https://gateway.tailnet.ts.net:8642" },
      read,
    ),
  ).rejects.toThrow(/HERMES_API_KEY/);
  expect(read).not.toHaveBeenCalled();
});
it("rejects remote URLs that are not a bare http(s) host:port base", async () => {
  const read = vi.fn(async () => "");
  for (const url of [
    "https://gateway.tailnet.ts.net",
    "http://gateway.tailnet.ts.net:0",
    "http://gateway.tailnet.ts.net:8642/v1",
    "http://gateway.tailnet.ts.net:8642?x=1",
    "http://user:pw@gateway.tailnet.ts.net:8642",
    "ws://gateway.tailnet.ts.net:8642",
    "not a url",
  ])
    await expect(
      resolveGateway(
        { HERMES_ALLOW_REMOTE_GATEWAY: "1", HERMES_API_URL: url, HERMES_API_KEY: "synthetic-test-key" },
        read,
      ),
    ).rejects.toThrow(/explicit port and no path/);
  expect(read).not.toHaveBeenCalled();
});
it("leaves loopback behaviour unchanged when the opt-in is set", async () => {
  const read = vi.fn(async () => 'API_SERVER_KEY="synthetic-fallback"\n');
  expect(
    await resolveGateway({ HERMES_ALLOW_REMOTE_GATEWAY: "1", HERMES_API_URL: "http://127.0.0.1:8642" }, read),
  ).toMatchObject({ base: "http://127.0.0.1:8642", remote: false });
  expect(read).toHaveBeenCalledTimes(1);
});
const headers = { Authorization: "Bearer synthetic-test-key", "Content-Type": "application/json" } as const;
it("tells a local user to start the local gateway only when a local gateway is configured", async () => {
  const down = vi.fn(async () => {
    throw new TypeError("fetch failed");
  });
  const local = await probeGateway({ base: "http://127.0.0.1:8642", headers, remote: false }, down);
  expect(local).toMatchObject({ connected: false, remote: false });
  expect(local.message).toMatch(/Start the local Hermes API gateway/);
  const remote = await probeGateway(
    { base: "https://gateway.tailnet.ts.net:8642", headers, remote: true },
    down,
  );
  expect(remote).toMatchObject({ connected: false, remote: true });
  expect(remote.message).toMatch(/remote gateway gateway\.tailnet\.ts\.net:8642 is unreachable/);
  expect(remote.message).not.toMatch(/local/i);
  expect(down).toHaveBeenCalledTimes(2);
});
it("reports a connected remote gateway with its host and an unhealthy one with its status", async () => {
  const ok = vi.fn(async () => new Response("ok", { status: 200 }));
  expect(await probeGateway({ base: "http://100.64.0.7:8642", headers, remote: true }, ok)).toEqual({
    connected: true,
    remote: true,
    message: "Hermes connected (remote gateway 100.64.0.7:8642)",
  });
  expect(await probeGateway({ base: "http://127.0.0.1:8642", headers, remote: false }, ok)).toEqual({
    connected: true,
    remote: false,
    message: "Hermes connected",
  });
  const unauthorized = vi.fn(async () => new Response("", { status: 401 }));
  const status = await probeGateway({ base: "http://100.64.0.7:8642", headers, remote: true }, unauthorized);
  expect(status.connected).toBe(false);
  expect(status.message).toMatch(/answered 401/);
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
        remote: false,
      }),
      installation: async () => ({ source: "synthetic-project", workspace: 8 }),
      fetch,
    }),
  ).toBe("Sourced text");
  const args = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(args[0]).toBe("http://127.0.0.1:8642/v1/chat/completions");
  expect(JSON.parse(String(args[1].body))).toMatchObject({ tools: [], tool_choice: "none", stream: false });
});
