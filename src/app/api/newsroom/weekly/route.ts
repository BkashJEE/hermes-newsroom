import { loadNewsroomConfig } from "@/newsroom/config/load-config";
import { getWeeklyDigest } from "@/newsroom/providers/weekly";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!(await loadNewsroomConfig()).liveSources)
    return Response.json(
      {
        updates: [],
        projects: [],
        since: "",
        fetchedAt: "",
        checkedRepositories: 0,
        notices: ["Live weekly discovery is disabled."],
        state: "disabled",
      },
      { headers },
    );
  try {
    return Response.json(await getWeeklyDigest(), { headers });
  } catch {
    return Response.json(
      { error: "Weekly GitHub updates are unavailable. Try again later." },
      { status: 502, headers },
    );
  }
}
