export const UPDATE_QUESTIONS = [
  {
    id: "changed",
    title: "What changed",
    description: "Changes to existing behavior, defaults, and workflows.",
  },
  { id: "new", title: "What is new", description: "New capabilities, integrations, and options." },
  {
    id: "gone",
    title: "What is gone",
    description: "Removed functionality and announced deprecations, as described in the notes.",
  },
  {
    id: "better",
    title: "What is better",
    description: "Reported fixes, reliability improvements, and performance gains.",
  },
  {
    id: "bad",
    title: "What is bad",
    description: "Documented known issues, regressions, limitations, and breaking changes.",
  },
] as const;

export type UpdateQuestion = (typeof UPDATE_QUESTIONS)[number]["id"];
export interface UpdateBrief {
  groups: Record<UpdateQuestion, string[]>;
  truncated: boolean;
  coverageNote?: string;
}

function plain(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function headingGroup(text: string): UpdateQuestion | null {
  if (/\b(known issues?|limitations?|regressions?|breaking changes?|caveats?|warnings?)\b/i.test(text))
    return "bad";
  if (/\b(removed|removals?|deprecated|deprecations?)\b/i.test(text)) return "gone";
  if (/\b(fixes|bug fixes|fixed|improvements?|performance|reliability)\b/i.test(text)) return "better";
  if (/\b(new|added|features|additions)\b/i.test(text)) return "new";
  if (/\b(changed|changes|migration|defaults?|behavior)\b/i.test(text)) return "changed";
  return null;
}

// Classify source statements, not the mere presence of a word such as "crash".
function statementGroup(text: string): UpdateQuestion | null {
  if (
    /\b(no known (issues?|regressions?)|no (breaking changes|removals|deprecations)|nothing (removed|deprecated))\b/i.test(
      text,
    )
  )
    return null;
  if (
    /\b(still (fails?|crashes?|broken|unsupported)|remains? (broken|unsupported)|not yet supported|breaking change|regression introduced)\b/i.test(
      text,
    )
  )
    return "bad";
  const lead = text.replace(/^hermes agent:\s*/i, "");
  if (/^(feat|fix|perf|refactor|chore)(\([^)]*\))?!:/i.test(lead)) return "bad";
  if (
    /^(?:\S[^:]{0,60}:\s*)?(?:fix(?:es|ed)?|resolve[ds]?|improve[ds]?|optimi[sz]e[ds]?|speed(?:s)? up|prevent[sd]?|restore[sd]?)\b/i.test(
      lead,
    ) ||
    /^(fix|perf)(\([^)]*\))?!?:/i.test(lead)
  )
    return "better";
  if (/^(known issues?|known limitations?|regressions?)\s*:/i.test(lead)) return "bad";
  if (/\b(?:remove[ds]?|drop(?:s|ped)?|deprecate[ds]?|no longer supports?|replacing the)\b/i.test(lead))
    return "gone";
  if (
    /\b(performance (improvements?|gains|work)|faster (startup|loading|responses)|reduced (latency|memory usage))\b/i.test(
      lead,
    )
  )
    return "better";
  if (
    /^(feat|feature)(\([^)]*\))?!?:/i.test(lead) ||
    /^(?:\S[^:]{0,60}:\s*)?(?:add(?:s|ed)?|introduce[sd]?|new|enable[sd]?|support(?:s)? for)\b/i.test(lead) ||
    /\bnew (capabilities|features|integrations|commands|tools|options|community plugins)\b/i.test(lead)
  )
    return "new";
  if (
    /^(?:\S[^:]{0,60}:\s*)?(?:change[sd]?|update[sd]?|switch(?:es|ed)?|rename[sd]?|replace[sd]?|move[sd]?|migrate[sd]?|default(?:s)? to|require[sd]?)\b/i.test(
      lead,
    ) ||
    /^(refactor|chore)(\([^)]*\))?!?:/i.test(lead)
  )
    return "changed";
  return null;
}

/** Extract bounded, verbatim source statements; this is not an AI-written review. */
export function buildUpdateBrief(title: string, body: unknown, merged = false): UpdateBrief {
  const result: UpdateBrief = {
    groups: { changed: [], new: [], gone: [], better: [], bad: [] },
    truncated: false,
  };
  const raw = typeof body === "string" ? body : "";
  result.truncated = raw.length > 100000;
  const headings: { level: number; group: UpdateQuestion | null; ignored: boolean }[] = [];
  const seen = new Set<string>();
  let fenced = false;
  const add = (text: string, group: UpdateQuestion | null) => {
    if (!group || text.length < 12 || seen.has(text.toLowerCase())) return;
    if (
      /\b(no known (issues?|regressions?)|no (breaking changes|removals|deprecations)|nothing (removed|deprecated))\b/i.test(
        text,
      )
    )
      return;
    if (result.groups[group].length >= 40) {
      result.truncated = true;
      return;
    }
    const excerpt = text.length > 650 ? `${text.slice(0, 650)}…` : text;
    if (text.length > 650) result.truncated = true;
    result.groups[group].push(excerpt);
    seen.add(text.toLowerCase());
  };
  // A merged PR title is itself a source-backed description of the change.
  if (merged) add(plain(title), statementGroup(plain(title)) ?? "changed");
  const lines = raw
    .slice(0, 100000)
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !line) continue;
    if (
      !result.coverageNote &&
      /(?:curated|detailed|full) (?:release )?notes.*(?:deferred|ship with|forthcoming|not yet available)/i.test(
        plain(line),
      )
    ) {
      result.coverageNote = plain(line.replace(/^>\s*/, "")).slice(0, 650);
    }
    const heading =
      line.match(/^(#{1,6})\s+(.+?)\s*#*$/) ??
      (line.match(/^\*\*([^*]+)\*\*:?$/) ? [line, "###", line.replace(/\*\*|:$/g, "")] : null);
    if (heading) {
      const level = heading[1].length;
      while (headings.length && headings[headings.length - 1].level >= level) headings.pop();
      const label = plain(heading[2]);
      const parent = headings[headings.length - 1];
      headings.push({
        level,
        group: headingGroup(label) ?? parent?.group ?? null,
        ignored:
          /\b(test plan|testing|verification|contributors?|acknowledg|credits|installation|how to upgrade|checksums?|statistics|full changelog)\b/i.test(
            label,
          ) || !!parent?.ignored,
      });
      continue;
    }
    const context = headings[headings.length - 1];
    if (context?.ignored || /^(\||>|---|\[.*\]:|https?:\/\/)/.test(line)) continue;
    const bullet = line.match(/^(?:[-*+]\s+|\d+\.\s+)(.*)$/);
    if (/^\[[ xX]\]/.test(bullet?.[1] ?? "")) continue;
    let content = bullet?.[1] ?? line;
    // Preserve wrapped prose instead of turning a continuation into a new claim.
    while (
      i + 1 < lines.length &&
      /^\s{2,}\S/.test(lines[i + 1]) &&
      !/^\s*([-*+]\s|\d+\.\s|#|```|~~~)/.test(lines[i + 1])
    )
      content += ` ${lines[++i].trim()}`;
    const text = plain(content);
    const updateList = text.match(
      /^(?:Also in (?:this|the) (?:window|release)[^:]*:|(?:This|The) (?:release|update) (?:includes|brings)[:\s]+)\s*(.+)/i,
    );
    if (updateList) {
      for (const part of updateList[1].split(/;\s*/))
        add(part.trim(), statementGroup(part.trim()) ?? "changed");
      continue;
    }
    if (
      /^(release date|since v|about this release|full changelog|open the release|merged upstream change)\b/i.test(
        text,
      )
    )
      continue;
    const explicit = statementGroup(text);
    add(
      text,
      context?.group === "bad"
        ? explicit === "better"
          ? "better"
          : "bad"
        : (explicit ?? context?.group ?? null),
    );
  }
  return result;
}
