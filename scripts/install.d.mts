/** Types for the installer, which is plain ESM so it runs with bare `node`. */

export const DEFAULT_PORT: number;
export const PLUGIN_REPO: string;
export const PLUGIN_NAME: string;
export const MIN_NODE: number;
export const REPO_ROOT: string;

export interface InstallOptions {
  port: number;
  autostart: boolean;
  dryRun: boolean;
  /** Install the desktop plugin into the Hermes home. */
  plugin: boolean;
  /** Install the app itself, as opposed to only the plugin. */
  app: boolean;
  build: boolean;
  pluginSource?: string;
  hermesHome?: string;
}

export interface AutostartUnit {
  /** Where the login unit belongs on this platform. */
  path: string;
  text: string;
  /** Commands that make the written unit take effect; empty where none is needed. */
  enable: [string, string[]][];
  note: string;
}

export function parseArgs(argv: string[]): InstallOptions;
export function parsePort(value: string): number;
export function resolveHermesHome(context?: {
  env?: Record<string, string | undefined>;
  home?: string;
}): string;
export function pluginTarget(hermesHome: string): string;
export function autostartUnit(context: {
  platform: string;
  repoRoot: string;
  nodePath: string;
  port: number;
  home?: string;
}): AutostartUnit;
export function checkNode(version?: string): number;
export function install(options: InstallOptions): Promise<number>;
