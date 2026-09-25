import { redirect } from "next/navigation";
import { WORKSPACES } from "@/config/workspaces";

export default function Home() {
  redirect(WORKSPACES.find((w) => w.id === "agents")?.href ?? WORKSPACES[0].href);
}
