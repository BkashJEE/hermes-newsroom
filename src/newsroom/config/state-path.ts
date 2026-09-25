import { homedir } from "node:os";
import path from "node:path";

/**
 * Where this app keeps its own state: aggregated feeds, saved editions, work
 * records, the browser profile.
 *
 * Each platform has a place users expect application state to live, and putting
 * a dot-directory in a Windows profile is not it. Linux keeps the original
 * `~/.local/state` path so existing installs do not have to move anything.
 */
export const APP_DIR = "omarchy-command-center";

export interface StateEnvironment {
  platform: NodeJS.Platform | string;
  home: string;
  env: Record<string, string | undefined>;
}

/** The path rules of the platform being described, not of the host running this. */
function rules(platform: NodeJS.Platform | string): path.PlatformPath {
  return platform === "win32" ? path.win32 : path.posix;
}

function baseDir({ platform, home, env }: StateEnvironment): string {
  const p = rules(platform);
  if (platform === "win32") {
    const local = env.LOCALAPPDATA;
    return local && p.isAbsolute(local) ? local : p.join(home, "AppData", "Local");
  }
  if (platform === "darwin") return p.join(home, "Library", "Application Support");
  // A relative XDG_STATE_HOME cannot serve as a base; the spec says to ignore it.
  const xdg = env.XDG_STATE_HOME;
  if (xdg && p.isAbsolute(xdg)) return xdg;
  return p.join(home, ".local", "state");
}

/** Resolve the state directory, or a named subdirectory of it. */
export function resolveStateDir(environment: StateEnvironment, ...segments: string[]): string {
  return rules(environment.platform).join(baseDir(environment), APP_DIR, ...segments);
}

/** The state directory for the running process. */
export function stateDir(...segments: string[]): string {
  return resolveStateDir({ platform: process.platform, home: homedir(), env: process.env }, ...segments);
}
