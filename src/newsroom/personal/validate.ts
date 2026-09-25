import type { PersonalEdition } from "./types";

export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export function validatePaper(
  raw: string,
  sourceIds: string[],
): Pick<PersonalEdition, "headline" | "sections"> {
  const data = JSON.parse(
    raw
      .trim()
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```$/, ""),
  );
  const ids = new Set(sourceIds);
  const text = (value: unknown, max: number) =>
    typeof value === "string" && value.trim().length > 0 && value.length <= max;
  if (
    !text(data?.headline, 200) ||
    !Array.isArray(data.sections) ||
    !data.sections.length ||
    data.sections.length > 8
  )
    throw new Error("Invalid newspaper format");
  for (const section of data.sections) {
    if (
      !text(section.title, 100) ||
      (section.page !== undefined && ![1, 2, 3, 4].includes(section.page)) ||
      !Array.isArray(section.bullets) ||
      !section.bullets.length ||
      section.bullets.length > 20
    )
      throw new Error("Invalid newspaper section");
    for (const bullet of section.bullets) {
      if (
        !text(bullet.text, 1600) ||
        !Array.isArray(bullet.sources) ||
        !bullet.sources.length ||
        bullet.sources.length > 20 ||
        bullet.sources.some((id: unknown) => typeof id !== "string" || !ids.has(id))
      )
        throw new Error("Every newspaper bullet must cite supplied work records");
    }
  }
  return {
    headline: data.headline,
    sections: data.sections.map((section: PersonalEdition["sections"][number]) => ({
      title: section.title,
      ...(section.page !== undefined ? { page: section.page } : {}),
      bullets: section.bullets.map((b) => ({ text: b.text, sources: [...new Set(b.sources)] })),
    })),
  };
}
