import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NEWSROOM_SECTIONS, sectionById } from "@/newsroom/sections";
import { SectionPage } from "@/newsroom/components/section-page";

export const dynamicParams = false;

export function generateStaticParams() {
  return NEWSROOM_SECTIONS.filter((s) => s.id !== "front-page").map((s) => ({ section: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/newsroom/[section]">): Promise<Metadata> {
  const { section } = await params;
  return { title: sectionById(section)?.label ?? "Not found" };
}

export default async function NewsroomSectionPage({ params }: PageProps<"/newsroom/[section]">) {
  const { section: id } = await params;
  const section = sectionById(id);
  if (!section || section.id === "front-page") notFound();
  return <SectionPage sectionId={section.id} />;
}
