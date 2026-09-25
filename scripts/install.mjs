#!/usr/bin/env node
/**
 * Install Hermes Newsroom on this machine.
 *
 * The mechanical parts of an install are the same everywhere and are easy to get
 * subtly wrong by hand: which directory Hermes scans for desktop plugins, which
 * port the plugin expects, what a working autostart unit looks like on this
 * platform. They live here, so an agent reading `skills/install-hermes-newsroom`
 * can make the judgement calls and leave the file operations to one tested path.
 *
 *   node scripts/install.mjs               # build, install the plugin, verify
 *   node scripts/install.mjs --autostart   # ... and start it at login
 *   node scripts/install.mjs --dry-run     # print every step, change nothing
 *
 * Nothing here needs credentials, and nothing is sent anywhere. The only network
 * access is an optional `git clone` of the plugin repository, and only when a
 * local copy was not supplied.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_PORT = 3520;
export const PLUGIN_REPO = "https://github.com/BkashJEE/hermes-newsroom-plugin";
/** The name of the plugin folder is the plugin's identity to Hermes. */
export const PLUGIN_NAME = "hermes-newsroom";
export const MIN_NODE = 22;

/** This file lives in `scripts/`, so the repository is its parent — unless a test
 *  runner loaded it through a non-file URL, where the working directory is right. */
function repoRoot() {
  try {
    return path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  } catch {
    return process.cwd();
  }
}

export const REPO_ROOT = repoRoot();

// ---------------------------------------------------------------- arguments

const FLAGS = new Set(["--autostart", "--dry-run", "--no-plugin", "--plugin-only", "--skip-build"]);
const VALUES = new Set(["--port", "--plugin-source", "--hermes-home"]);

export function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    autostart: false,
    dryRun: false,
    plugin: true,
    app: true,
    build: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (VALUES.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value.`);
      i += 1;
      if (arg === "--port") options.port = parsePort(value);
      if (arg === "--plugin-source") options.pluginSource = value;
      if (arg === "--hermes-home") options.hermesHome = value;
      continue;
    }
    if (!FLAGS.has(arg)) throw new Error(`Unknown option: ${arg}`);
    if (arg === "--autostart") options.autostart = true;
    if (arg === "--dry-run") options.dryRun = true;
    if (arg === "--no-plugin") options.plugin = false;
    if (arg === "--skip-build") options.build = false;
    if (arg === "--plugin-only") {
      options.app = false;
      options.build = false;
    }
  }
  return options;
}

/** A port the plugin can actually reach: an unprivileged TCP port, nothing else. */
export function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Not a usable port: ${value}. Give a number between 1024 and 65535.`);
  }
  return port;
}

// ------------------------------------------------------------- hermes layout

/**
 * Where Hermes keeps its home. HERMES_HOME wins because Hermes itself sets it
 * per profile; otherwise every platform uses `~/.hermes`.
 */
export function resolveHermesHome({ env = {}, home = homedir() } = {}) {
  const configured = env.HERMES_HOME;
  if (configured && configured.trim()) return configured.trim();
  return path.join(home, ".hermes");
}

/**
 * Desktop plugins are scanned from one directory, whatever the platform.
 * A `.hermes-package.json` marker must never be written beside the file: it tells
 * Hermes the folder is a copy of an installed agent package, which makes the
 * plugin load disabled and lets Hermes delete the folder when that package is gone.
 */
export function pluginTarget(hermesHome) {
  return path.join(hermesHome, "desktop-plugins", PLUGIN_NAME, "plugin.js");
}

// ----------------------------------------------------------------- autostart

function quoteUnix(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * The file that starts Newsroom at login, in whatever form this platform reads.
 * Returned rather than written, so `--dry-run` can show it and a test can read it.
 */
export function autostartUnit({ platform, repoRoot, nodePath, port, home = homedir() }) {
  const next = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
  const args = ["start", "--hostname", "127.0.0.1", "--port", String(port)];
  if (platform === "win32") {
    const startup = path.win32.join(
      home,
      "AppData",
      "Roaming",
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      "Startup",
      "hermes-newsroom.cmd",
    );
    return {
      path: startup,
      // `start ""` detaches, so the console window closes instead of lingering at login.
      text: `@echo off\r\ncd /d "${repoRoot}"\r\nstart "" /min "${nodePath}" "${next}" ${args.join(" ")}\r\n`,
      enable: [],
      note: "Windows runs anything in the Startup folder when you sign in.",
    };
  }
  if (platform === "darwin") {
    const plist = path.join(home, "Library", "LaunchAgents", "com.hermes.newsroom.plist");
    const argv = [nodePath, next, ...args]
      .map((value) => `    <string>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</string>`)
      .join("\n");
    return {
      path: plist,
      text: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.hermes.newsroom</string>
  <key>ProgramArguments</key>
  <array>
${argv}
  </array>
  <key>WorkingDirectory</key><string>${repoRoot}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
`,
      enable: [["launchctl", ["load", "-w", plist]]],
      note: "launchd starts it at login and restarts it if it stops.",
    };
  }
  const unit = path.join(home, ".config", "systemd", "user", "hermes-newsroom.service");
  const exec = [nodePath, next, ...args].map(quoteUnix).join(" ");
  return {
    path: unit,
    text: `[Unit]
Description=Hermes Newsroom
After=default.target

[Service]
Type=simple
WorkingDirectory=${quoteUnix(repoRoot)}
ExecStart=${exec}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`,
    enable: [
      ["systemctl", ["--user", "daemon-reload"]],
      ["systemctl", ["--user", "enable", "--now", "hermes-newsroom.service"]],
    ],
    note: "systemd starts it at login and restarts it on failure.",
  };
}

// --------------------------------------------------------------- the install

function say(message) {
  process.stdout.write(`${message}\n`);
}

function run(command, args, { cwd = REPO_ROOT, dryRun }) {
  say(`  $ ${command} ${args.join(" ")}`);
  if (dryRun) return;
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

export function checkNode(version = process.versions.node) {
  const major = Number(version.split(".")[0]);
  if (major < MIN_NODE) {
    throw new Error(`Newsroom needs Node ${MIN_NODE} or newer; this is Node ${version}.`);
  }
  return major;
}

/** A local plugin.js if one is nearby, otherwise a shallow clone into a temp dir. */
function obtainPlugin({ pluginSource, dryRun }) {
  if (pluginSource) {
    const file = pluginSource.endsWith(".js")
      ? pluginSource
      : path.join(pluginSource, "desktop", "plugin.js");
    if (!existsSync(file)) throw new Error(`No plugin.js at ${file}`);
    return { file, cleanup: () => {} };
  }
  const sibling = path.join(REPO_ROOT, "..", "hermes-newsroom-plugin", "desktop", "plugin.js");
  if (existsSync(sibling)) return { file: sibling, cleanup: () => {} };
  const temp = mkdtempSync(path.join(tmpdir(), "hermes-newsroom-plugin-"));
  say(`  $ git clone --depth 1 ${PLUGIN_REPO} ${temp}`);
  if (dryRun)
    return {
      file: path.join(temp, "desktop", "plugin.js"),
      cleanup: () => rmSync(temp, { recursive: true, force: true }),
    };
  execFileSync("git", ["clone", "--depth", "1", PLUGIN_REPO, temp], { stdio: "inherit" });
  return {
    file: path.join(temp, "desktop", "plugin.js"),
    cleanup: () => rmSync(temp, { recursive: true, force: true }),
  };
}

async function reachable(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/newsroom`, {
      signal: AbortSignal.timeout(4000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function install(options) {
  const { dryRun } = options;
  checkNode();
  const hermesHome = options.hermesHome ?? resolveHermesHome({ env: process.env });

  if (options.app && options.build) {
    say("Building Newsroom");
    run("npm", ["ci"], options);
    run("npm", ["run", "build"], options);
  }

  if (options.plugin) {
    say(`Installing the desktop plugin into ${hermesHome}`);
    if (!existsSync(hermesHome) && !dryRun) {
      say("  Hermes home not found. Skipping the plugin; Newsroom still runs in a browser.");
    } else {
      const { file, cleanup } = obtainPlugin(options);
      const target = pluginTarget(hermesHome);
      say(`  ${file} -> ${target}`);
      if (!dryRun) {
        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(file, target);
      }
      cleanup();
      say("  Restart the Hermes Desktop app: disk plugins are scanned at startup, not on reload.");
      if (options.port !== DEFAULT_PORT) {
        say(
          `  Port ${options.port} is not the default. In the Desktop window's local storage set\n` +
            `  hermes-newsroom:url = http://127.0.0.1:${options.port}/newsroom`,
        );
      }
    }
  }

  if (options.autostart) {
    const unit = autostartUnit({
      platform: process.platform,
      repoRoot: REPO_ROOT,
      nodePath: process.execPath,
      port: options.port,
    });
    say(`Starting Newsroom at login — ${unit.note}`);
    say(`  write ${unit.path}`);
    if (!dryRun) {
      mkdirSync(path.dirname(unit.path), { recursive: true });
      writeFileSync(unit.path, unit.text);
    }
    for (const [command, args] of unit.enable) run(command, args, { ...options, cwd: REPO_ROOT });
  }

  if (dryRun) {
    say("\nDry run: nothing was changed.");
    return 0;
  }

  if (options.app && !options.autostart) {
    say(`\nStart Newsroom with:  npm start   (http://127.0.0.1:${options.port}/newsroom)`);
    return 0;
  }
  if (options.autostart) {
    const ok = await reachable(options.port);
    say(
      ok
        ? `\nNewsroom is answering on http://127.0.0.1:${options.port}/newsroom`
        : `\nNewsroom is not answering on port ${options.port} yet. Check the service log.`,
    );
    return ok ? 0 : 1;
  }
  return 0;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    process.exitCode = await install(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
