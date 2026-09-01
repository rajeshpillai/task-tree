import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskRowMenu } from "./TaskRowMenu";
import { rowActions } from "./rowActions";

/**
 * The only test in the suite that opens a Radix menu, and it lives here rather
 * than inside a grid test for a reason. Radix drives its trigger from Pointer
 * Events, which jsdom does not implement, so it has to be opened by keyboard;
 * and an open costs seconds of jsdom time that scales with how much DOM is
 * mounted, so it runs against the menu alone. Which action is bound to which
 * row is covered by rowActions.test.ts, where it costs nothing.
 */
describe("TaskRowMenu", () => {
  const handlers = {
    onAddSubtask: vi.fn(),
    onMoveTask: vi.fn(),
    onIndentTask: vi.fn(),
    onOutdentTask: vi.fn(),
    onDeleteTask: vi.fn(),
  };

  it("opens with its actions and runs the one that is chosen", () => {
    const onDeleteTask = vi.fn();
    render(
      <TaskRowMenu
        title="Ship v1"
        actions={rowActions("t1", { ...handlers, onDeleteTask })}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Actions for Ship v1" });
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Add subtask",
      "Move up",
      "Move down",
      "Indent",
      "Outdent",
      "Delete",
    ]);

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDeleteTask).toHaveBeenCalledWith("t1");
  });
});
