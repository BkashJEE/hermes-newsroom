import { describe, expect, it } from "vitest";
import { localRequest, loopbackHost } from "@/newsroom/config/local-request";

describe("recognising this machine", () => {
  it("accepts the ports Newsroom actually runs on", () => {
    expect(loopbackHost("127.0.0.1:3520")).toBe(true); // npm start
    expect(loopbackHost("localhost:3510")).toBe(true); // npm run dev
  });

  it("accepts a port the user chose, which is the whole point", () => {
    // scripts/install.mjs --port N. A fixed pair silently broke every such install.
    expect(loopbackHost("127.0.0.1:4100")).toBe(true);
    expect(loopbackHost("127.0.0.1:8080")).toBe(true);
    expect(loopbackHost("[::1]:3520")).toBe(true);
  });

  it("refuses anything that is not loopback", () => {
    expect(loopbackHost("example.com:3520")).toBe(false);
    expect(loopbackHost("192.168.1.10:3520")).toBe(false);
    // A host that merely starts with a loopback name is a different host.
    expect(loopbackHost("127.0.0.1.evil.com:3520")).toBe(false);
    expect(loopbackHost("localhost.evil.com:3520")).toBe(false);
    // No port means this did not come through the local server.
    expect(loopbackHost("127.0.0.1")).toBe(false);
    expect(loopbackHost(null)).toBe(false);
    expect(loopbackHost(undefined)).toBe(false);
  });
});

describe("recognising the local page", () => {
  it("allows a same-origin request, and one with no Origin at all", () => {
    expect(localRequest("127.0.0.1:3520", "http://127.0.0.1:3520")).toBe(true);
    // Browsers omit Origin on same-origin GETs; so does a local CLI client.
    expect(localRequest("127.0.0.1:3520", null)).toBe(true);
    expect(localRequest("127.0.0.1:3520", "https://127.0.0.1:3520")).toBe(true);
  });

  it("refuses another site driving these routes from a browser that can reach them", () => {
    expect(localRequest("127.0.0.1:3520", "https://evil.example")).toBe(false);
    // Same host name, different port: still a different origin.
    expect(localRequest("127.0.0.1:3520", "http://127.0.0.1:9999")).toBe(false);
  });

  it("refuses a loopback-looking Origin when the host itself is remote", () => {
    expect(localRequest("newsroom.example.com:3520", "http://127.0.0.1:3520")).toBe(false);
  });
});
