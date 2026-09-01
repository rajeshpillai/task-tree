import { describe, expect, it, vi } from "vitest";
import { rowActions } from "./rowActions";

function spies() {
  return {
    onAddSubtask: vi.fn<(id: string) => void>(),
    onMoveTask: vi.fn<(id: string, delta: number) => void>(),
    onIndentTask: vi.fn<(id: string) => void>(),
    onOutdentTask: vi.fn<(id: string) => void>(),
    onDeleteTask: vi.fn<(id: string) => void>(),
  };
}

type Spies = ReturnType<typeof spies>;

const run = (id: string, label: string, handlers: Spies) =>
  rowActions(id, handlers).find((a) => a.label === label)!.run();

describe("rowActions", () => {
  it("offers the six row actions in order", () => {
    expect(rowActions("t1", spies()).map((a) => a.label)).toEqual([
      "Add subtask",
      "Move up",
      "Move down",
      "Indent",
      "Outdent",
      "Delete",
    ]);
  });

  it("separates navigation and the destructive action from the rest", () => {
    const grouped = rowActions("t1", spies())
      .filter((a) => a.startsGroup)
      .map((a) => a.label);
    expect(grouped).toEqual(["Move up", "Delete"]);
  });

  it("binds add subtask to the row it came from", () => {
    const h = spies();
    run("t1", "Add subtask", h);
    expect(h.onAddSubtask).toHaveBeenCalledWith("t1");
  });

  it("moves up by one and down by one", () => {
    const h = spies();
    run("t1", "Move up", h);
    expect(h.onMoveTask).toHaveBeenCalledWith("t1", -1);

    run("t1", "Move down", h);
    expect(h.onMoveTask).toHaveBeenCalledWith("t1", 1);
  });

  it("binds indent and outdent", () => {
    const h = spies();
    run("t1", "Indent", h);
    expect(h.onIndentTask).toHaveBeenCalledWith("t1");

    run("t1", "Outdent", h);
    expect(h.onOutdentTask).toHaveBeenCalledWith("t1");
  });

  it("binds delete", () => {
    const h = spies();
    run("t1", "Delete", h);
    expect(h.onDeleteTask).toHaveBeenCalledWith("t1");
  });

  it("binds each row to its own id", () => {
    const h = spies();
    run("first", "Delete", h);
    run("second", "Delete", h);
    expect(h.onDeleteTask.mock.calls).toEqual([["first"], ["second"]]);
  });
});
