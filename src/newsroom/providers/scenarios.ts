/**
 * Development scenarios that force each interface state.
 * `offline` is handled in the browser (it never reaches the server).
 */
export const SCENARIOS = ["default", "slow", "empty", "error", "partial", "stale", "offline"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export function parseScenario(value: string | null | undefined): Scenario {
  return (SCENARIOS as readonly string[]).includes(value ?? "") ? (value as Scenario) : "default";
}

export function scenariosEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" || env.NEWSROOM_ENABLE_SCENARIOS === "1";
}
