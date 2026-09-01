import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Stage, Task, User } from "../db/schema";
import { TaskGrid } from "./TaskGrid";

const STAGES: Stage[] = [
  { id: "todo", projectId: "p1", name: "Todo", color: "#94a3b8", order: 0 },
  { id: "doing", projectId: "p1", name: "In progress", color: "#6366f1", order: 1 },
  { id: "done", projectId: "p1", name: "Completed", color: "#10b981", order: 2 },
];

const USERS: User[] = [{ id: "u1", name: "Rajesh", color: "#6366f1" }];

let clock = 0;
function task(over: Partial<Task> & { id: string }): Task {
  clock += 1;
  return {
    projectId: "p1",
    parentId: null,
    title: over.id,
    notes: "",
    assigneeId: null,
    stageId: "todo",
    order: 0,
    dueDate: null,
    createdAt: clock,
    updatedAt: clock,
    ...over,
  };
}

function renderGrid(tasks: Task[], handlers: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  const spies = {
    onRenameTask: vi.fn(),
    onAddSubtask: vi.fn(),
    onMoveTask: vi.fn(),
    onIndentTask: vi.fn(),
    onOutdentTask: vi.fn(),
    onDeleteTask: vi.fn(),
    onAssign: vi.fn(),
    onSetStage: vi.fn(),
    ...handlers,
  };
  render(<TaskGrid tasks={tasks} stages={STAGES} users={USERS} {...spies} />);
  return spies;
}

/** Row labels in the order they appear, ignoring the header row. */
function visibleTitles(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent?.trim() ?? "");
}

describe("TaskGrid", () => {
  it("renders an empty state rather than a bare header for a project with no tasks", () => {
    renderGrid([]);

    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(screen.queryByRole("row")).not.toBeInTheDocument();
  });

  it("renders a row per root task with its stage and assignee", () => {
    renderGrid([task({ id: "Ship v1", stageId: "doing", assigneeId: "u1" })]);

    expect(screen.getByText("Ship v1")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Rajesh")).toBeInTheDocument();
  });

  it("shows Unassigned when a task has no assignee", () => {
    renderGrid([task({ id: "Orphan work" })]);
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("shows a dash when a task has no due date", () => {
    renderGrid([task({ id: "Someday" })]);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("still renders a task whose stage was removed", () => {
    renderGrid([task({ id: "Stranded", stageId: "deleted-stage" })]);

    expect(screen.getByText("Stranded")).toBeInTheDocument();
    expect(screen.getByLabelText("Stage for Stranded")).toHaveDisplayValue("No stage");
  });

  it("falls back to Unassigned when the assignee no longer exists", () => {
    renderGrid([task({ id: "Ghosted", assigneeId: "deleted-user" })]);

    expect(screen.getByLabelText("Assignee for Ghosted")).toHaveDisplayValue("Unassigned");
  });

  it("formats a due date that is set", () => {
    renderGrid([task({ id: "Dated", dueDate: Date.UTC(2026, 2, 14, 12) })]);
    expect(screen.getByText(/14 Mar|Mar 14/)).toBeInTheDocument();
  });

  describe("hierarchy", () => {
    const nested = [
      task({ id: "parent" }),
      task({ id: "child", parentId: "parent" }),
      task({ id: "grandchild", parentId: "child" }),
    ];

    it("hides descendants until a row is expanded", () => {
      renderGrid(nested);

      expect(visibleTitles()).toEqual(["parent"]);
    });

    it("reveals children through Expand all", async () => {
      const user = userEvent.setup();
      renderGrid(nested);

      await user.click(screen.getByRole("button", { name: /expand all/i }));

      expect(visibleTitles()).toEqual(["parent", "child", "grandchild"]);
    });
  });

  describe("sorting", () => {
    it("orders by the stage's own order, not alphabetically", async () => {
      const user = userEvent.setup();
      // Alphabetically this is Completed, In progress, Todo. By workflow it is
      // Todo, In progress, Completed.
      renderGrid([
        task({ id: "c", stageId: "done" }),
        task({ id: "a", stageId: "todo" }),
        task({ id: "b", stageId: "doing" }),
      ]);

      await user.click(screen.getByRole("button", { name: /stage/i }));

      expect(visibleTitles()).toEqual(["a", "b", "c"]);
    });

    it("keeps expanded rows open across a sort", async () => {
      const user = userEvent.setup();
      renderGrid([
        task({ id: "parent", stageId: "done" }),
        task({ id: "child", parentId: "parent" }),
        task({ id: "other", stageId: "todo" }),
      ]);

      await user.click(screen.getByRole("button", { name: /expand all/i }));
      expect(visibleTitles()).toContain("child");

      await user.click(screen.getByRole("button", { name: /stage/i }));

      expect(visibleTitles()).toContain("child");
    });
  });

  describe("global filter", () => {
    const nested = [
      task({ id: "Groceries" }),
      task({ id: "Buy milk", parentId: "Groceries" }),
      task({ id: "Taxes" }),
    ];

    it("keeps a matching row's ancestors visible so the match is not orphaned", async () => {
      const user = userEvent.setup();
      renderGrid(nested);

      await user.type(screen.getByPlaceholderText("Search tasks…"), "milk");

      const titles = visibleTitles();
      expect(titles).toContain("Groceries");
      expect(titles).toContain("Buy milk");
      expect(titles).not.toContain("Taxes");
    });

    it("matches on the title rather than on stage or assignee text", async () => {
      const user = userEvent.setup();
      renderGrid([
        task({ id: "Write docs", stageId: "doing", assigneeId: "u1" }),
        task({ id: "Fix bug", stageId: "todo" }),
      ]);

      await user.type(screen.getByPlaceholderText("Search tasks…"), "Rajesh");

      expect(screen.getByText("No tasks match that search.")).toBeInTheDocument();
    });
  });

  describe("inline title editing", () => {
    it("commits a new title on Enter", async () => {
      const user = userEvent.setup();
      const { onRenameTask } = renderGrid([task({ id: "t1", title: "Old title" })]);

      await user.click(screen.getByRole("button", { name: "Old title" }));
      const input = screen.getByRole("textbox", { name: "Rename Old title" });
      await user.clear(input);
      await user.type(input, "New title{Enter}");

      expect(onRenameTask).toHaveBeenCalledWith("t1", "New title");
    });

    it("reverts on Escape without committing", async () => {
      const user = userEvent.setup();
      const { onRenameTask } = renderGrid([task({ id: "t1", title: "Old title" })]);

      await user.click(screen.getByRole("button", { name: "Old title" }));
      await user.type(screen.getByRole("textbox", { name: /^Rename/ }), "Discarded{Escape}");

      expect(onRenameTask).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Old title" })).toBeInTheDocument();
    });

    it("treats a blank title as a cancel, since an empty row cannot be recovered", async () => {
      const user = userEvent.setup();
      const { onRenameTask } = renderGrid([task({ id: "t1", title: "Old title" })]);

      await user.click(screen.getByRole("button", { name: "Old title" }));
      const input = screen.getByRole("textbox", { name: /^Rename/ });
      await user.clear(input);
      await user.type(input, "   {Enter}");

      expect(onRenameTask).not.toHaveBeenCalled();
    });

    it("does not fire a rename when the title is unchanged", async () => {
      const user = userEvent.setup();
      const { onRenameTask } = renderGrid([task({ id: "t1", title: "Same" })]);

      await user.click(screen.getByRole("button", { name: "Same" }));
      await user.type(screen.getByRole("textbox", { name: /^Rename/ }), "{Enter}");

      expect(onRenameTask).not.toHaveBeenCalled();
    });
  });
});

describe("row menu", () => {
  const nested = [task({ id: "parent" }), task({ id: "child", parentId: "parent" })];

  it("offers a menu on every visible row", async () => {
    const user = userEvent.setup();
    renderGrid(nested);

    expect(screen.getByRole("button", { name: "Actions for parent" })).toBeInTheDocument();
    // A collapsed child has no row, so no menu until its parent is opened.
    expect(screen.queryByRole("button", { name: "Actions for child" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand all/i }));
    expect(screen.getByRole("button", { name: "Actions for child" })).toBeInTheDocument();
  });

});

describe("assignment and stage", () => {
  it("assigns a person from the row", async () => {
    const user = userEvent.setup();
    const spies = renderGrid([task({ id: "t1", title: "Pick me" })]);

    await user.selectOptions(screen.getByLabelText("Assignee for Pick me"), "u1");

    expect(spies.onAssign).toHaveBeenCalledWith("t1", "u1");
  });

  it("clears an assignee back to unassigned", async () => {
    const user = userEvent.setup();
    const spies = renderGrid([task({ id: "t1", title: "Pick me", assigneeId: "u1" })]);

    await user.selectOptions(screen.getByLabelText("Assignee for Pick me"), "");

    expect(spies.onAssign).toHaveBeenCalledWith("t1", null);
  });

  it("changes a task's stage from the row", async () => {
    const user = userEvent.setup();
    const spies = renderGrid([task({ id: "t1", title: "Pick me" })]);

    await user.selectOptions(screen.getByLabelText("Stage for Pick me"), "done");

    expect(spies.onSetStage).toHaveBeenCalledWith("t1", "done");
  });

  it("offers every stage and every person", () => {
    renderGrid([task({ id: "t1", title: "Pick me" })]);

    expect(
      within(screen.getByLabelText("Stage for Pick me")).getAllByRole("option").map((o) => o.textContent),
    ).toEqual(["Todo", "In progress", "Completed"]);
    expect(
      within(screen.getByLabelText("Assignee for Pick me")).getAllByRole("option").map((o) => o.textContent),
    ).toEqual(["Unassigned", "Rajesh"]);
  });
});

describe("scale", () => {
  /**
   * Contract 23. Virtualization means the row count in the DOM stays bounded
   * no matter how many tasks exist, which is what keeps scrolling smooth. A
   * wall-clock budget alone would be flaky on shared CI, so this asserts the
   * mechanism as well as the time.
   */
  it("renders 1000 tasks without putting 1000 rows in the DOM", () => {
    const many: Task[] = Array.from({ length: 1000 }, (_, i) =>
      task({ id: `t${i}`, title: `Task ${i}`, order: i, stageId: STAGES[i % 3].id }),
    );

    const started = performance.now();
    renderGrid(many);
    const elapsed = performance.now() - started;

    const rendered = screen.getAllByRole("row").length - 1;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(100);
    expect(elapsed).toBeLessThan(2000);
  });
});
