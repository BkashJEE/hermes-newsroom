import { loadNewsroomConfig } from "@/newsroom/config/load-config";
import { NextRequest } from "next/server";
import { generatePersonal, personalData } from "@/newsroom/personal/server";
import { validDate } from "@/newsroom/personal/validate";
export const runtime = "nodejs";
let busy = false;
const headers = { "Cache-Control": "no-store" };
function allowed(request: NextRequest) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const origin = request.headers.get("origin");
  return (
    /^(127\.0\.0\.1|localhost):(3510|3520)$/.test(host) &&
    (!origin || origin === `http://${host}`) &&
    request.headers.get("x-newsroom-client") === "1" &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}
export async function GET(request: NextRequest) {
  if (!allowed(request))
    return Response.json({ error: "Open the local Newsroom app." }, { status: 403, headers });
  if (!(await loadNewsroomConfig()).personalDaily.enabled)
    return Response.json(
      { error: "Personal Daily is disabled. Enable it in local configuration." },
      { status: 404, headers },
    );
  const date = request.nextUrl.searchParams.get("date") || undefined;
  const edition = request.nextUrl.searchParams.get("edition") || undefined;
  if (date && !validDate(date))
    return Response.json({ error: "Choose a valid date." }, { status: 400, headers });
  try {
    return Response.json(await personalData(date, edition), { headers });
  } catch {
    return Response.json(
      { error: "Could not read Hermes work records. Check the local profiles and date." },
      { status: 503, headers },
    );
  }
}
export async function POST(request: NextRequest) {
  if (!allowed(request))
    return Response.json({ error: "Open the local Newsroom app." }, { status: 403, headers });
  if (!(await loadNewsroomConfig()).personalDaily.enabled)
    return Response.json(
      { error: "Personal Daily is disabled. Enable it in local configuration." },
      { status: 404, headers },
    );
  if (busy)
    return Response.json({ error: "Your newspaper is already being written." }, { status: 409, headers });
  let date: string;
  try {
    const raw = await request.text();
    if (raw.length > 200) throw new Error();
    date = JSON.parse(raw).date;
    if (typeof date !== "string" || !validDate(date)) throw new Error();
  } catch {
    return Response.json({ error: "Choose a valid date." }, { status: 400, headers });
  }
  busy = true;
  try {
    const edition = await generatePersonal(
      date,
      AbortSignal.any([request.signal, AbortSignal.timeout(180000)]),
    );
    return Response.json({ edition }, { headers });
  } catch (error) {
    const empty = error instanceof Error && error.message.startsWith("No Hermes work");
    return Response.json(
      {
        error: empty
          ? "No Hermes work records for this date."
          : "Hermes could not produce a sourced newspaper. Your saved editions are unchanged; try again.",
      },
      { status: empty ? 422 : 502, headers },
    );
  } finally {
    busy = false;
  }
}
