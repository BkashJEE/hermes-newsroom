import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WORKSPACES, workspaceById } from "@/config/workspaces";
import { WorkspaceOverview } from "@/components/shell/workspace-overview";
import { XStudioNewsroom } from "@/components/shell/x-studio-newsroom";

export const dynamicParams = false;

export function generateStaticParams() {
  return WORKSPACES.filter((w) => w.kind === "desktop").map((w) => ({ space: w.id }));
}

export async function generateMetadata({ params }: PageProps<"/[space]">): Promise<Metadata> {
  const { space } = await params;
  return { title: workspaceById(space)?.label ?? "Not found" };
}

export default async function WorkspacePage({ params }: PageProps<"/[space]">) {
  const { space } = await params;
  const workspace = workspaceById(space);
  if (!workspace || workspace.kind !== "desktop") notFound();
  return (
    <WorkspaceOverview
      workspace={workspace}
      featured={space === "x-studio" ? <XStudioNewsroom /> : undefined}
    />
  );
}
