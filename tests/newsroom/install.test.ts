import { describe, expect, it } from "vitest";
// The installer is plain ESM so it runs with bare node; its types live beside it.
import {
  parseArgs,
  parsePort,
  resolveHermesHome,
  pluginTarget,
  autostartUnit,
  checkNode,
  DEFAULT_PORT,
} from "../../scripts/install.mjs";

describe("install options", () => {
  it("installs the app and the plugin on the default port when told nothing", () => {
    expect(parseArgs([])).toMatchObject({ port: DEFAULT_PORT, app: true, plugin: true, autostart: false });
  });

  it("rejects an unknown option rather than silently ignoring it", () => {
    expect(() => parseArgs(["--autostrat"])).toThrow(/Unknown option/);
    expect(() => parseArgs(["--port"])).toThrow(/needs a value/);
  });

  it("refuses a port the plugin could not reach", () => {
    expect(parsePort("3520")).toBe(3520);
    expect(() => parsePort("80")).toThrow(/between 1024 and 65535/);
    expect(() => parsePort("not-a-port")).toThrow(/usable port/);
  });

  it("does not rebuild when only the plugin is being installed", () => {
    expect(parseArgs(["--plugin-only"])).toMatchObject({ app: false, build: false, plugin: true });
  });
});

describe("hermes home", () => {
  it("follows HERMES_HOME, because Hermes sets it per profile", () => {
    expect(
      resolveHermesHome({ env: { HERMES_HOME: "/home/me/.hermes/profiles/ceo" }, home: "/home/me" }),
    ).toBe("/home/me/.hermes/profiles/ceo");
  });

  it("falls back to ~/.hermes, and treats a blank value as unset", () => {
    expect(resolveHermesHome({ env: {}, home: "/home/me" })).toBe("/home/me/.hermes");
    expect(resolveHermesHome({ env: { HERMES_HOME: "  " }, home: "/home/me" })).toBe("/home/me/.hermes");
  });

  it("puts the plugin in the folder Hermes scans, named after the plugin", () => {
    expect(pluginTarget("/home/me/.hermes")).toBe(
      "/home/me/.hermes/desktop-plugins/hermes-newsroom/plugin.js",
    );
  });
});

describe("autostart", () => {
  const base = { repoRoot: "/opt/hermes-newsroom", nodePath: "/usr/bin/node", port: 3520, home: "/home/me" };

  it("writes a systemd user unit on Linux", () => {
    const unit = autostartUnit({ ...base, platform: "linux" });
    expect(unit.path).toBe("/home/me/.config/systemd/user/hermes-newsroom.service");
    expect(unit.text).toContain("ExecStart='/usr/bin/node'");
    expect(unit.text).toContain("'--port' '3520'");
    expect(unit.enable).toContainEqual([
      "systemctl",
      ["--user", "enable", "--now", "hermes-newsroom.service"],
    ]);
  });

  it("quotes a path with a space, which a home directory often has", () => {
    const unit = autostartUnit({ ...base, platform: "linux", repoRoot: "/home/me/My Projects/newsroom" });
    expect(unit.text).toContain("WorkingDirectory='/home/me/My Projects/newsroom'");
  });

  it("writes a launch agent on macOS", () => {
    const unit = autostartUnit({ ...base, platform: "darwin" });
    expect(unit.path).toBe("/home/me/Library/LaunchAgents/com.hermes.newsroom.plist");
    expect(unit.text).toContain("<key>RunAtLoad</key><true/>");
    expect(unit.enable[0][0]).toBe("launchctl");
  });

  it("writes a Startup shortcut on Windows, with CRLF and no enable step", () => {
    const unit = autostartUnit({ ...base, platform: "win32", home: "C:\\Users\\me" });
    expect(unit.path).toContain("Start Menu\\Programs\\Startup\\hermes-newsroom.cmd");
    expect(unit.text).toContain("\r\n");
    expect(unit.enable).toEqual([]);
  });

  it("binds to loopback on every platform: this is a local app", () => {
    for (const platform of ["linux", "darwin", "win32"]) {
      expect(autostartUnit({ ...base, platform }).text).toContain("127.0.0.1");
    }
  });
});

describe("node version", () => {
  it("names the version it needs rather than failing during the build", () => {
    expect(() => checkNode("20.11.0")).toThrow(/Node 22 or newer/);
    expect(checkNode("22.0.0")).toBe(22);
  });
});
