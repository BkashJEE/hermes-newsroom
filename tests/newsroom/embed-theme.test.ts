import { describe, expect, it } from "vitest";
import { applyHostTheme, themeFromSearch } from "@/newsroom/components/embed-theme";

function root(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

describe("embedded host theme", () => {
  it("maps host colours and fonts onto Newsroom variables", () => {
    const element = root();
    const applied = applyHostTheme(
      {
        bg: "rgb(10, 11, 12)",
        panel: "rgba(19, 21, 23, 0.9)",
        accent: "rgb(0, 83, 253)",
        text: "rgb(238, 240, 234)",
        fontUi: "Source Sans 3, system-ui, sans-serif",
      },
      element,
    );
    expect(applied).toEqual(expect.arrayContaining(["bg", "panel", "accent", "text", "fontUi"]));
    expect(element.style.getPropertyValue("--bg")).toBe("rgb(10, 11, 12)");
    expect(element.style.getPropertyValue("--green")).toBe("rgb(0, 83, 253)");
    expect(element.style.getPropertyValue("--shell-accent")).toBe("rgb(0, 83, 253)");
    expect(element.style.getPropertyValue("--font-ui")).toContain("Source Sans 3");
    expect(element.dataset.hostTheme).toBe("on");
  });

  it("rejects anything that is not a plain colour or font stack", () => {
    const element = root();
    const applied = applyHostTheme(
      {
        bg: "url(https://example.test/x.png)",
        panel: "red; background-image: url(//evil.test)",
        accent: "var(--anything)",
        text: "#76b900",
        text2: "expression(alert(1))",
        fontUi: "Barlow; background: url(//evil.test)",
        unknownKey: "rgb(1, 2, 3)",
      },
      element,
    );
    expect(applied).toEqual([]);
    expect(element.getAttribute("style") ?? "").toBe("");
    expect(element.dataset.hostTheme).toBeUndefined();
  });

  it("reads params only for an explicit Hermes embed", () => {
    expect(themeFromSearch("?bg=rgb(1,2,3)")).toEqual({});
    expect(themeFromSearch("?embed=hermes&bg=rgb(1,2,3)&accent=rgb(4,5,6)")).toEqual({
      bg: "rgb(1,2,3)",
      accent: "rgb(4,5,6)",
    });
  });
});
