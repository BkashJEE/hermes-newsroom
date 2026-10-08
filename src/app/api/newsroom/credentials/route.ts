import type { NextRequest } from "next/server";
import { localRequest } from "@/newsroom/config/local-request";
import { CredentialError, clearKey, credentialStatus, saveKey, jevKey } from "@/newsroom/jev/credential";
import { postDirect, failureForStatus } from "@/newsroom/jev/transport";
import { JevFailure } from "@/newsroom/jev/model";

export const runtime = "nodejs";

/**
 * The Jev key, set from the app instead of a text editor.
 *
 * This route accepts a key and never returns one. A GET reports whether one is
 * configured and its last four characters; there is no shape of request that
 * reads the key back, so a page that can reach this route still cannot exfiltrate
 * what is stored.
 */
function allowed(request: NextRequest) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  return (
    localRequest(host, request.headers.get("origin")) &&
    request.headers.get("x-newsroom-client") === "1" &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const DENIED = { error: "Open the local Newsroom app to change credentials." };

export async function GET(request: NextRequest) {
  if (!allowed(request)) return json(DENIED, 403);
  return json(await credentialStatus());
}

export async function POST(request: NextRequest) {
  if (!allowed(request)) return json(DENIED, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "JSON required." }, 415);
  let input: { action?: unknown; key?: unknown };
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  if (input.action === "clear") return json(await clearKey());

  if (input.action === "save") {
    try {
      return json(await saveKey(input.key));
    } catch (error) {
      if (error instanceof CredentialError) return json({ error: error.message }, 400);
      return json({ error: "The key could not be saved. Check the state directory." }, 503);
    }
  }

  // Spend one real request to answer the only question that matters about a key.
  if (input.action === "verify") {
    const key = await jevKey();
    if (!key) return json({ ok: false, message: "No key is configured yet." });
    try {
      await postDirect(
        {
          state: { probe: "connectivity check" },
          // The direct API spells a yes/no question "noul"; the AI SDK calls the
          // same thing "boolean". Sending the SDK's name here returns HTTP 400,
          // which reads as a broken key when the key is fine.
          questions: {
            ok: { type: "noul", instructions: "Answer yes. This is a connectivity check." },
          },
        },
        request.signal,
        key,
      );
      return json({ ok: true, message: "Jev answered. The key works." });
    } catch (error) {
      const failure = error instanceof JevFailure ? error : new JevFailure(failureForStatus(undefined));
      return json({ ok: false, message: failure.message });
    }
  }

  return json({ error: "Invalid request." }, 400);
}
