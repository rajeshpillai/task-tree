import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Stage } from "../db/schema";
import { StageEditor } from "./StageEditor";
import type { StageDeleteResult } from "../state/useProjectData";

const STAGES: Stage[] = [
  { id: "todo", projectId: "p1", name: "Todo", color: "#94a3b8", order: 0 },
  { id: "doing", projectId: "p1", name: "In progress", color: "#6366f1", order: 1 },
];

function renderEditor(onDelete: () => Promise<StageDeleteResult>) {
  const spies = { onRename: vi.fn(), onRecolor: vi.fn(), onAdd: vi.fn() };
  render(<StageEditor stages={STAGES} onDelete={onDelete} {...spies} />);
  return spies;
}

describe("StageEditor", () => {
  it("lists every stage", () => {
    renderEditor(async () => ({ ok: true }));

    expect(screen.getByLabelText("Rename Todo")).toHaveValue("Todo");
    expect(screen.getByLabelText("Rename In progress")).toHaveValue("In progress");
  });

  it("names the blocking task count when a stage is still in use", async () => {
    const user = userEvent.setup();
    renderEditor(async () => ({ ok: false, reason: "in-use", count: 3 }));

    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Todo still has 3 tasks. Move them first.",
    );
  });

  it("uses the singular for a single blocking task", async () => {
    const user = userEvent.setup();
    renderEditor(async () => ({ ok: false, reason: "in-use", count: 1 }));

    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent("still has 1 task.");
  });

  it("explains that the last stage cannot go", async () => {
    const user = userEvent.setup();
    renderEditor(async () => ({ ok: false, reason: "last-stage", count: 0 }));

    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent("is the last stage");
  });

  it("says nothing when the delete goes through", async () => {
    const user = userEvent.setup();
    renderEditor(async () => ({ ok: true }));

    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("adds a stage by name and clears the field", async () => {
    const user = userEvent.setup();
    const spies = renderEditor(async () => ({ ok: true }));

    const field = screen.getByLabelText("New stage");
    await user.type(field, "Blocked");
    await user.click(screen.getByRole("button", { name: "Add stage" }));

    expect(spies.onAdd).toHaveBeenCalledWith("Blocked", expect.any(String));
    expect(field).toHaveValue("");
  });

  it("ignores a blank new stage", async () => {
    const user = userEvent.setup();
    const spies = renderEditor(async () => ({ ok: true }));

    await user.type(screen.getByLabelText("New stage"), "   ");
    await user.click(screen.getByRole("button", { name: "Add stage" }));

    expect(spies.onAdd).not.toHaveBeenCalled();
  });

  it("renames a stage on blur", async () => {
    const user = userEvent.setup();
    const spies = renderEditor(async () => ({ ok: true }));

    const field = screen.getByLabelText("Rename Todo");
    await user.clear(field);
    await user.type(field, "Backlog");
    await user.tab();

    expect(spies.onRename).toHaveBeenCalledWith("todo", "Backlog");
  });
});
