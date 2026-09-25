import { describe, expect, it } from "vitest";
import { buildUpdateBrief } from "@/newsroom/model/update-brief";

describe("source-backed update explanations", () => {
  it("reads prose update lists and makes deferred release notes visible", () => {
    const brief = buildUpdateBrief(
      "v2",
      `
> Full curated notes for this window are deferred to v3.
## About this release
Also in the window: per-profile start/stop controls; the Connectors page replacing the MCP tab; hot-path performance work across config loading; and new community plugins in the catalog.
`,
    );
    expect(brief.groups.changed).toEqual(["per-profile start/stop controls"]);
    expect(brief.groups.gone).toEqual(["the Connectors page replacing the MCP tab"]);
    expect(brief.groups.better).toEqual(["hot-path performance work across config loading"]);
    expect(brief.groups.new).toEqual(["and new community plugins in the catalog."]);
    expect(brief.coverageNote).toContain("deferred to v3");
  });
  it("extracts all five questions while keeping removals and deprecations distinct in the wording", () => {
    const brief = buildUpdateBrief(
      "v2",
      `
## Changed
- The default model is now configurable per profile.
## Added
- Calendar integration with read-only access.
## Removed
- Removed the legacy upload command.
- Deprecated the old config key; it still works until v3.
## Fixed
- Fixed the crash when opening an empty session.
## Known issues
- Offline sync still fails on Windows.
`,
    );
    expect(brief.groups).toEqual({
      changed: ["The default model is now configurable per profile."],
      new: ["Calendar integration with read-only access."],
      gone: ["Removed the legacy upload command.", "Deprecated the old config key; it still works until v3."],
      better: ["Fixed the crash when opening an empty session."],
      bad: ["Offline sync still fails on Windows."],
    });
  });
  it("does not turn fixed failures or absence statements into current problems", () => {
    const brief = buildUpdateBrief(
      "v2",
      `
## Known issues
- Fixed the renderer crash loop.
- Fixed a known issue with session restore.
- No known issues remain in this version.
## Removed
- No removals or deprecations this time.
`,
    );
    expect(brief.groups.bad).toEqual([]);
    expect(brief.groups.gone).toEqual([]);
    expect(brief.groups.better).toEqual([
      "Fixed the renderer crash loop.",
      "Fixed a known issue with session restore.",
    ]);
  });
  it("preserves wrapped context and skips code, comments, checklist tasks, and contributor sections", () => {
    const brief = buildUpdateBrief(
      "v2",
      `
## Added
- Added [calendar support](https://example.com/calendar)
  for local profiles only.
<!-- Added an invented feature. -->
\`\`\`sh
add destructive-command
\`\`\`
## Test plan
- [ ] Add a test for the calendar flow.
## New contributors
- Added developer credit.
`,
    );
    expect(brief.groups.new).toEqual(["Added calendar support for local profiles only."]);
  });
  it("does not invent missing categories or infer problems from generic crash mentions", () => {
    expect(buildUpdateBrief("v2", "A patch release. 500 commits from 100 contributors.").groups).toEqual({
      changed: [],
      new: [],
      gone: [],
      better: [],
      bad: [],
    });
    const merged = buildUpdateBrief("fix(desktop): recover renderer crash loops", "", true);
    expect(merged.groups.better).toEqual(["fix(desktop): recover renderer crash loops"]);
    expect(merged.groups.bad).toEqual([]);
  });
  it("does not carry a category into the next unrelated section", () => {
    const brief = buildUpdateBrief(
      "v2",
      "## Removed\n- Removed old telemetry.\n## About this release\n- A hundred contributors worked on it.",
    );
    expect(brief.groups.gone).toEqual(["Removed old telemetry."]);
  });
  it("flags explicitly breaking changes and reads bold changelog headings", () => {
    expect(buildUpdateBrief("feat(api)!: require the new schema", "", true).groups.bad).toEqual([
      "feat(api)!: require the new schema",
    ]);
    expect(buildUpdateBrief("v2", "**Known issues**\n- Slow sync on large histories.").groups.bad).toEqual([
      "Slow sync on large histories.",
    ]);
  });
  it("marks bounded excerpts as incomplete and removes duplicate source statements", () => {
    const brief = buildUpdateBrief(
      "v2",
      `## Added\n- Added one integration.\n- Added one integration.\n- Added ${"details ".repeat(100)}`,
    );
    expect(brief.groups.new).toHaveLength(2);
    expect(brief.truncated).toBe(true);
    expect(brief.groups.new[1].length).toBeLessThanOrEqual(651);
  });
});
