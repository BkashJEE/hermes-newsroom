import { describe, expect, it } from "vitest";
import { resolveStateDir } from "@/newsroom/config/state-path";

const HOME = "/home/user";

describe("state directory", () => {
  it("keeps the existing Linux location, so nothing moves for current installs", () => {
    expect(resolveStateDir({ platform: "linux", home: HOME, env: {} })).toBe(
      "/home/user/.local/state/omarchy-command-center",
    );
  });

  it("honours XDG_STATE_HOME when the user set one", () => {
    expect(resolveStateDir({ platform: "linux", home: HOME, env: { XDG_STATE_HOME: "/data/state" } })).toBe(
      "/data/state/omarchy-command-center",
    );
    // A relative XDG value is not usable as a base; fall back rather than guess.
    expect(resolveStateDir({ platform: "linux", home: HOME, env: { XDG_STATE_HOME: "state" } })).toBe(
      "/home/user/.local/state/omarchy-command-center",
    );
  });

  it("uses Application Support on macOS", () => {
    expect(resolveStateDir({ platform: "darwin", home: "/Users/me", env: {} })).toBe(
      "/Users/me/Library/Application Support/omarchy-command-center",
    );
  });

  it("uses LOCALAPPDATA on Windows, falling back inside the profile", () => {
    expect(
      resolveStateDir({
        platform: "win32",
        home: "C:\\Users\\me",
        env: { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
      }),
    ).toBe("C:\\Users\\me\\AppData\\Local\\omarchy-command-center");
    expect(resolveStateDir({ platform: "win32", home: "C:\\Users\\me", env: {} })).toContain(
      "omarchy-command-center",
    );
  });

  it("gives every caller a path under one root", () => {
    const root = resolveStateDir({ platform: "linux", home: HOME, env: {} });
    expect(resolveStateDir({ platform: "linux", home: HOME, env: {} }, "jev")).toBe(`${root}/jev`);
    expect(resolveStateDir({ platform: "linux", home: HOME, env: {} }, "browser-x")).toBe(
      `${root}/browser-x`,
    );
  });
});
