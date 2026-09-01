import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "../db/schema";
import { ProjectPicker } from "./ProjectPicker";

const PROJECTS: Project[] = [
  { id: "p1", name: "My tasks", createdAt: 1 },
  { id: "p2", name: "Side project", createdAt: 2 },
];

function renderPicker() {
  const spies = { onSelect: vi.fn(), onCreate: vi.fn() };
  render(<ProjectPicker projects={PROJECTS} currentId="p1" {...spies} />);
  return spies;
}

describe("ProjectPicker", () => {
  it("shows the current project", () => {
    renderPicker();
    expect(screen.getByLabelText("Project")).toHaveDisplayValue("My tasks");
  });

  it("switches to another project", async () => {
    const user = userEvent.setup();
    const spies = renderPicker();

    await user.selectOptions(screen.getByLabelText("Project"), "p2");

    expect(spies.onSelect).toHaveBeenCalledWith("p2");
  });

  it("creates a project by name", async () => {
    const user = userEvent.setup();
    const spies = renderPicker();

    await user.click(screen.getByRole("button", { name: "New project" }));
    await user.type(screen.getByLabelText("New project name"), "Third");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(spies.onCreate).toHaveBeenCalledWith("Third");
  });

  it("ignores a blank name", async () => {
    const user = userEvent.setup();
    const spies = renderPicker();

    await user.click(screen.getByRole("button", { name: "New project" }));
    await user.type(screen.getByLabelText("New project name"), "  ");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(spies.onCreate).not.toHaveBeenCalled();
  });

  it("abandons the new project field on Escape", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole("button", { name: "New project" }));
    await user.type(screen.getByLabelText("New project name"), "Nope{Escape}");

    expect(screen.queryByLabelText("New project name")).not.toBeInTheDocument();
  });
});
