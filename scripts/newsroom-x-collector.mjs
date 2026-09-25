/** Fixed loopback transport shared by the CLI and the local browser worker. */
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

export class TransportError extends Error {
  constructor(status) {
    super(`Newsroom transport failed (HTTP ${status || "unreachable"}).`);
    this.status = status;
  }
}

export async function collectorRequest(action = "status", id, posts, fetcher = fetch) {
  if (!["status", "request", "claim", "complete", "unavailable", "failed"].includes(action))
    throw new Error("Unknown collector action");
  const body = action === "status" ? undefined : JSON.stringify({ action, id, posts });
  if (body && body.length > 60000) throw new Error("Batch too large");
  try {
    const response = await fetcher("http://127.0.0.1:3520/api/newsroom/browser-x", {
      method: action === "status" ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "x-newsroom-client": "1" },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    const value = await response.json();
    return { ok: response.ok, status: response.status, value };
  } catch {
    // Never dump request bodies, browser output, or captured text into the journal.
    throw new TransportError(0);
  }
}

export async function transport(action, id, posts) {
  const result = await collectorRequest(action, id, posts);
  if (!result.ok) throw new TransportError(result.status);
  return result.value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const [action = "status", id] = process.argv.slice(2);
    let posts;
    if (action === "complete") {
      let input = "";
      for await (const chunk of process.stdin) {
        input += chunk;
        if (input.length > 60000) throw new Error("Batch too large");
      }
      posts = JSON.parse(input);
    }
    const result = await collectorRequest(action, id, posts);
    console.log(JSON.stringify(result.value));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error("Collector transport failed; check the local Newsroom service and input.");
    process.exitCode = 1;
  }
}
