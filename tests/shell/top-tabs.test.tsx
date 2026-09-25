import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TopTabs } from "@/components/shell/top-tabs";
import { WORKSPACES } from "@/config/workspaces";

let pathname = "/agents";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("TopTabs", () => {
  it("renders every Command Center tab in bar order", () => {
    render(<TopTabs />);
    const nav = screen.getByRole("navigation", { name: "Command Center tabs" });
    const labels = within(nav)
      .getAllByRole("link")
      .map((link) => link.getAttribute("aria-label"));
    expect(labels).toEqual(WORKSPACES.map((w) => w.label));
  });

  it("marks the active tab with aria-current", () => {
    pathname = "/git";
    render(<TopTabs />);
    expect(screen.getByRole("link", { name: "Git" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Build" })).not.toHaveAttribute("aria-current");
  });

  it("opens a purpose menu, moves with arrow keys and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<TopTabs />);
    const toggle = screen.getByRole("button", { name: "Hermes OS tools" });
    await user.click(toggle);
    const menu = screen.getByRole("menu", { name: "Hermes OS tools" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });
});
