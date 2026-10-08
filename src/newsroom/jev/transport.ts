import "server-only";
import { JevFailure, type JevFailureCode } from "./model";

/**
 * How a Jev request reaches the model.
 *
 * Two transports exist for the same model, with separate credentials:
 *
 * - **direct** — one HTTPS request to the TypeSafe API with `TYPESAFE_API_KEY`.
 * - **gateway** — a child process running the Vercel AI Gateway SDK helper with
 *   `AI_GATEWAY_API_KEY`.
 *
 * The direct transport is preferred: one round trip, no child process, no SDK
 * dependency, and the credential is Newsroom's own rather than another tool's.
 * The gateway remains as a fallback for installs already set up that way.
 */
export type TransportId = "direct" | "gateway";

export const DIRECT_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
/** Pinned to the published alias; the response reports the exact version it used. */
export const DIRECT_MODEL = "jev-latest";
export const DIRECT_KEY = "TYPESAFE_API_KEY";
export const GATEWAY_KEY = "AI_GATEWAY_API_KEY";

/**
 * Which transport this process should use, given what is configured.
 *
 * `directKey` is the key actually resolved for this request — from the app's own
 * store or the environment — so a key saved through the settings screen counts
 * the same as one exported before the server started.
 */
export function chooseTransport(
  env: Record<string, string | undefined>,
  directKey: string | null = null,
): TransportId | null {
  if (directKey?.trim() || env[DIRECT_KEY]?.trim()) return "direct";
  if (env[GATEWAY_KEY]?.trim()) return "gateway";
  return null;
}

/**
 * Map an HTTP status to the failure the reader sees.
 *
 * Shared by both transports, so a 403 reads the same way whichever path produced
 * it — the one thing a reader needs to know is that the credential was refused,
 * not which library refused it.
 */
export function failureForStatus(status: number | undefined): JevFailureCode {
  if (status === 401 || status === 403) return "authentication";
  if (status === 402) return "credits";
  if (status === 404) return "unavailable";
  if (status === 429) return "rate-limit";
  if (status === 400 || status === 422) return "request";
  return "provider";
}

/**
 * Post one evaluation to the TypeSafe API.
 *
 * The response body is returned unparsed: `parseDecision` owns validation, and it
 * has to accept both transports' shapes anyway. Nothing from the error path is
 * forwarded — a failed request's body can echo the content that was sent.
 */
export async function postDirect(
  request: object,
  signal: AbortSignal,
  directKey: string | null | undefined,
): Promise<unknown> {
  const key = directKey?.trim();
  if (!key) throw new JevFailure("authentication");
  let response: Response;
  try {
    response = await fetch(DIRECT_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: DIRECT_MODEL, ...request }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]),
      redirect: "error",
    });
  } catch (error) {
    // An abort is the caller cancelling, not a provider fault; let it through.
    if (signal.aborted) throw error;
    throw new JevFailure("provider");
  }
  if (!response.ok) throw new JevFailure(failureForStatus(response.status));
  try {
    return await response.json();
  } catch {
    throw new JevFailure("invalid-result");
  }
}
