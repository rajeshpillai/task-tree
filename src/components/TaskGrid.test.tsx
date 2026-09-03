import { render, screen, waitFor, within } from "@testing-library/react";
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
    priority: "medium",
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
    onSetPriority: vi.fn(),
    ...handlers,
  };
  render(<TaskGrid tasks={tasks} stages={STAGES} users={USERS} {...spies} />);
  return spies;
}

/**
 * Row labels in the order they appear, ignoring the header row. Read from the
 * title element rather than the whole cell, which also carries the expand
 * chevron and the subtask badge. A row being edited holds an input, whose text
 * is its value rather than its textContent.
 */
function visibleTitles(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => {
      const cell = within(row).getAllByRole("cell")[0];
      const input = cell.querySelector("input");
      if (input) return input.value;
      const title = cell.querySelector('button:not([aria-hidden="true"])');
      return title?.textContent?.trim() ?? cell.textContent?.trim() ?? "";
    });
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

/**
 * A new task is created outside the grid, so the grid learns about it from
 * `newTaskId`. Driving it that way also keeps these tests clear of the row
 * menu, which is a Radix menu and expensive to open under jsdom (see
 * TaskRowMenu.test.tsx).
 */
describe("a newly added task", () => {
  const nested = [
    task({ id: "parent" }),
    task({ id: "child", parentId: "parent" }),
    task({ id: "fresh", parentId: "child", title: "New task" }),
  ];

  function renderWith(props: Partial<React.ComponentProps<typeof TaskGrid>>) {
    const onNewTaskRevealed = vi.fn();
    const base = {
      tasks: nested,
      stages: STAGES,
      users: USERS,
      onRenameTask: vi.fn(),
      onAddSubtask: vi.fn(),
      onMoveTask: vi.fn(),
      onIndentTask: vi.fn(),
      onOutdentTask: vi.fn(),
      onDeleteTask: vi.fn(),
      onAssign: vi.fn(),
      onSetStage: vi.fn(),
      onSetPriority: vi.fn(),
      onNewTaskRevealed,
    };
    const view = render(<TaskGrid {...base} {...props} />);
    return {
      onNewTaskRevealed,
      rerender: (next: Partial<React.ComponentProps<typeof TaskGrid>>) =>
        view.rerender(<TaskGrid {...base} {...next} />),
    };
  }

  it("opens every collapsed ancestor so the row is on screen", () => {
    renderWith({ newTaskId: "fresh" });

    expect(visibleTitles()).toEqual(["parent", "child", "New task"]);
  });

  it("puts the caret in the new row's title, with the placeholder selected", async () => {
    renderWith({ newTaskId: "fresh" });

    const input = await screen.findByRole("textbox", { name: "Rename New task" });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("New task");
  });

  it("edits only the new row, leaving its ancestors as plain titles", async () => {
    renderWith({ newTaskId: "fresh" });

    await screen.findByRole("textbox", { name: "Rename New task" });
    expect(screen.getByRole("button", { name: "parent" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Rename parent" })).not.toBeInTheDocument();
  });

  it("clears an active search, which would otherwise hide the new row", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWith({});

    const search = screen.getByPlaceholderText("Search tasks…");
    await user.type(search, "parent");
    expect(visibleTitles()).toEqual(["parent"]);

    rerender({ newTaskId: "fresh" });

    expect(search).toHaveValue("");
    expect(visibleTitles()).toContain("New task");
  });

  it("reports back so the caller can drop the id", async () => {
    const { onNewTaskRevealed } = renderWith({ newTaskId: "fresh" });

    await waitFor(() => expect(onNewTaskRevealed).toHaveBeenCalled());
  });

  it("does nothing until the task itself arrives in the list", () => {
    const { rerender } = renderWith({ tasks: [nested[0], nested[1]], newTaskId: "fresh" });

    // Only the id is known so far; nothing to open and nothing to focus.
    expect(visibleTitles()).toEqual(["parent"]);

    rerender({ newTaskId: "fresh" });
    expect(visibleTitles()).toEqual(["parent", "child", "New task"]);
  });

  it("leaves every row read-only when no task was just added", () => {
    renderWith({});

    expect(screen.queryByRole("textbox", { name: /^Rename/ })).not.toBeInTheDocument();
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

describe("the subtask count hint", () => {
  it("shows how many children a collapsed row is hiding", () => {
    renderGrid([
      task({ id: "parent" }),
      task({ id: "a", parentId: "parent" }),
      task({ id: "b", parentId: "parent" }),
    ]);

    // The chevron says there is something below; the badge says how much.
    expect(screen.getByRole("img", { name: "2 subtasks" })).toBeInTheDocument();
  });

  it("counts direct children, and names the deeper total as well", () => {
    renderGrid([
      task({ id: "parent" }),
      task({ id: "child", parentId: "parent" }),
      task({ id: "grandchild", parentId: "child" }),
      task({ id: "great", parentId: "grandchild" }),
    ]);

    expect(screen.getByRole("img", { name: "1 subtask, 3 in total" })).toBeInTheDocument();
  });

  it("puts the hint in the title cell, beside the task it belongs to", () => {
    renderGrid([task({ id: "parent" }), task({ id: "child", parentId: "parent" })]);

    const titleCell = within(screen.getAllByRole("row")[1]).getAllByRole("cell")[0];
    expect(within(titleCell).getByRole("img", { name: "1 subtask" })).toBeInTheDocument();
  });

  it("shows no hint on a leaf, which would otherwise read as a zero", () => {
    renderGrid([task({ id: "alone" })]);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("gives each row its own count once the tree is open", async () => {
    const user = userEvent.setup();
    renderGrid([
      task({ id: "parent" }),
      task({ id: "child", parentId: "parent" }),
      task({ id: "g1", parentId: "child" }),
      task({ id: "g2", parentId: "child" }),
    ]);

    await user.click(screen.getByRole("button", { name: /expand all/i }));

    expect(screen.getByRole("img", { name: "1 subtask, 3 in total" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "2 subtasks" })).toBeInTheDocument();
  });

  it("does not swallow the title's own accessible name", () => {
    renderGrid([task({ id: "parent", title: "Ship v1" }), task({ id: "c", parentId: "parent" })]);

    expect(screen.getByRole("button", { name: "Ship v1" })).toBeInTheDocument();
  });
});

describe("priority", () => {
  it("offers the whole scale, most urgent first", () => {
    renderGrid([task({ id: "t1", title: "Pick me" })]);

    expect(
      within(screen.getByLabelText("Priority for Pick me"))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["High", "Medium", "Low"]);
  });

  it("shows the task's own priority", () => {
    renderGrid([task({ id: "t1", title: "Pick me", priority: "high" })]);

    expect(screen.getByLabelText("Priority for Pick me")).toHaveDisplayValue("High");
  });

  it("changes a task's priority from the row", async () => {
    const user = userEvent.setup();
    const spies = renderGrid([task({ id: "t1", title: "Pick me" })]);

    await user.selectOptions(screen.getByLabelText("Priority for Pick me"), "high");

    expect(spies.onSetPriority).toHaveBeenCalledWith("t1", "high");
  });

  it("colour codes the cell, and codes each priority differently", () => {
    renderGrid([
      task({ id: "t1", title: "Urgent", priority: "high" }),
      task({ id: "t2", title: "Whenever", priority: "low" }),
    ]);

    const high = screen.getByLabelText("Priority for Urgent");
    const low = screen.getByLabelText("Priority for Whenever");

    expect(high.style.backgroundColor).not.toBe("");
    expect(high.style.borderColor).not.toBe("");
    expect(high.style.borderColor).not.toBe(low.style.borderColor);
  });

  it("takes its colour from a per-theme token, not a fixed hue", () => {
    renderGrid([task({ id: "t1", title: "Urgent", priority: "high" })]);
    const cell = screen.getByLabelText("Priority for Urgent");

    // One literal hex cannot pass contrast on both grounds: amber measured
    // 1.89:1 against its own chip on the light page, under the 3:1 that a
    // control's boundary needs, and a hue light enough for the dark page is
    // the hue that vanishes on the light one. index.css holds a pair per
    // priority; a hex creeping back in here is the regression to catch.
    expect(cell.style.borderColor).toBe("var(--priority-high)");
    expect(cell.style.backgroundColor).toContain("var(--priority-high)");
  });

  it("mixes the wash opaquely, because the OS option list inherits it", () => {
    renderGrid([task({ id: "t1", title: "Urgent", priority: "high" })]);
    const cell = screen.getByLabelText("Priority for Urgent");

    // A select hands its background-color to the OS-drawn option list, and the
    // popup composites a translucent colour over a light canvas rather than
    // over the page. A 16% amber came out cream there while the option text
    // stayed the dark theme's near-white: unreadable. Mixing against the
    // theme's background instead keeps the popup and its text in agreement.
    expect(cell.style.backgroundColor).toContain("var(--zen-color-background)");
    expect(cell.style.backgroundColor).not.toContain("transparent");
  });

  it("keeps the label as the meaning, so colour is never the only signal", () => {
    renderGrid([task({ id: "t1", title: "Urgent", priority: "high" })]);

    // The colour is a tint and a border; the text stays the inherited
    // foreground, which is the only thing measured for contrast.
    expect(screen.getByLabelText("Priority for Urgent").style.color).toBe("");
    expect(screen.getByLabelText("Priority for Urgent")).toHaveDisplayValue("High");
  });

  it("sorts by the scale rather than alphabetically", async () => {
    const user = userEvent.setup();
    // Alphabetically this is High, Low, Medium. By urgency it is High, Medium,
    // Low.
    renderGrid([
      task({ id: "b", priority: "medium" }),
      task({ id: "c", priority: "low" }),
      task({ id: "a", priority: "high" }),
    ]);

    await user.click(screen.getByRole("button", { name: /priority/i }));

    expect(visibleTitles()).toEqual(["a", "b", "c"]);
  });

  it("still renders a task whose priority was never set", () => {
    renderGrid([task({ id: "t1", title: "Legacy", priority: undefined as never })]);

    expect(screen.getByLabelText("Priority for Legacy")).toHaveDisplayValue("Unset");
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
