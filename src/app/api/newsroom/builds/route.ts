import { loadNewsroomConfig } from "@/newsroom/config/load-config";
import { getCommunityBuilds } from "@/newsroom/providers/community-builds";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!(await loadNewsroomConfig()).liveSources)
    return Response.json(
      {
        projects: [],
        fetchedAt: "",
        state: "disabled",
        incomplete: false,
        message: "Live project discovery is disabled in the Newsroom configuration.",
      },
      { headers },
    );
  try {
    return Response.json(await getCommunityBuilds(), { headers });
  } catch {
    return Response.json(
      { error: "GitHub project discovery is unavailable. It may be rate-limited; retry later." },
      { status: 502, headers },
    );
  }
}
