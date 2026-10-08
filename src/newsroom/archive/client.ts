import { parseArchive } from "./model";
export async function archiveRequest(payload?: unknown) {
  const response = await fetch("/api/newsroom/archive", {
    method: payload === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: {
      "x-newsroom-client": "1",
      ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Permanent archive unavailable.");
  return result;
}
export async function readArchive() {
  return parseArchive(await archiveRequest());
}
