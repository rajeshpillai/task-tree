import { IDBFactory } from "fake-indexeddb";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb } from "../db/open";
import { projects, tasks as taskRepo } from "../db/repo";
import { DEFAULT_PRIORITY, newId } from "../db/schema";
import { siblingsOf, subtreeIds } from "../lib/tree";
import { useProjectData } from "./useProjectData";

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

async function loaded() {
  const view = renderHook(() => useProjectData());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

const titled = (t: { title: string }) => t.title;

describe("addTask", () => {
  it("puts a new task at the root of the current project", async () => {
    const { result } = await loaded();
    const before = result.current.tasks.length;

    let created: { id: string } | null = null;
    await act(async () => {
      created = await result.current.addTask(null, "Brand new");
    });

    expect(result.current.tasks).toHaveLength(before + 1);
    const stored = await taskRepo.get(created!.id);
    expect(stored?.parentId).toBeNull();
    expect(stored?.projectId).toBe(result.current.project!.id);
    expect(stored?.title).toBe("Brand new");
  });

  it("gives a new task the first stage and no assignee", async () => {
    const { result } = await loaded();

    let created: { id: string } | null = null;
    await act(async () => {
      created = await result.current.addTask(null);
    });

    const stored = await taskRepo.get(created!.id);
    expect(stored?.stageId).toBe(result.current.stages[0].id);
    expect(stored?.assigneeId).toBeNull();
  });

  it("orders each new root task after the last one", async () => {
    const { result } = await loaded();

    await act(async () => {
      await result.current.addTask(null, "First added");
      await result.current.addTask(null, "Second added");
    });

    const roots = siblingsOf(result.current.tasks, null).map(titled);
    expect(roots.indexOf("First added")).toBeLessThan(roots.indexOf("Second added"));
  });

  it("nests a subtask under its parent", async () => {
    const { result } = await loaded();
    const parent = result.current.tasks.find((t) => t.parentId === null)!;

    let child: { id: string } | null = null;
    await act(async () => {
      child = await result.current.addTask(parent.id, "A subtask");
    });

    const stored = await taskRepo.get(child!.id);
    expect(stored?.parentId).toBe(parent.id);
    expect(siblingsOf(result.current.tasks, parent.id).map(titled)).toContain("A subtask");
  });
});

describe("setTaskPriority", () => {
  it("writes the new priority through to storage", async () => {
    const { result } = await loaded();
    const target = result.current.tasks[0];

    await act(async () => {
      await result.current.setTaskPriority(target.id, "low");
    });

    expect(result.current.tasks.find((t) => t.id === target.id)?.priority).toBe("low");
    expect((await taskRepo.get(target.id))?.priority).toBe("low");
  });

  it("leaves a new task in the middle of the scale, which claims nothing", async () => {
    const { result } = await loaded();

    let created: { id: string } | null = null;
    await act(async () => {
      created = await result.current.addTask(null);
    });

    expect((await taskRepo.get(created!.id))?.priority).toBe(DEFAULT_PRIORITY);
  });

  it("does nothing for a task that is not there", async () => {
    const { result } = await loaded();
    const before = result.current.tasks;

    await act(async () => {
      await result.current.setTaskPriority(newId(), "high");
    });

    expect(result.current.tasks).toEqual(before);
  });
});

describe("deleteTask", () => {
  it("deletes the whole subtree, not just the row", async () => {
    const { result } = await loaded();
    const parent = result.current.tasks.find(
      (t) => t.parentId === null && result.current.tasks.some((c) => c.parentId === t.id),
    )!;
    const doomed = subtreeIds(result.current.tasks, parent.id);
    expect(doomed.length).toBeGreaterThan(1);

    await act(async () => {
      await result.current.deleteTask(parent.id);
    });

    for (const id of doomed) expect(await taskRepo.get(id)).toBeUndefined();
    expect(result.current.tasks.some((t) => doomed.includes(t.id))).toBe(false);
  });

  it("reports how many tasks went", async () => {
    const { result } = await loaded();
    const parent = result.current.tasks.find(
      (t) => t.parentId === null && result.current.tasks.some((c) => c.parentId === t.id),
    )!;
    const expected = subtreeIds(result.current.tasks, parent.id).length;

    let outcome: { count: number } | null = null;
    await act(async () => {
      outcome = await result.current.deleteTask(parent.id);
    });

    expect(outcome!.count).toBe(expected);
  });

  it("undo restores the whole subtree, not just the parent", async () => {
    const { result } = await loaded();
    const parent = result.current.tasks.find(
      (t) => t.parentId === null && result.current.tasks.some((c) => c.parentId === t.id),
    )!;
    const before = subtreeIds(result.current.tasks, parent.id).sort();

    let outcome: { undo: () => Promise<void> } | null = null;
    await act(async () => {
      outcome = await result.current.deleteTask(parent.id);
    });
    await act(async () => {
      await outcome!.undo();
    });

    for (const id of before) expect(await taskRepo.get(id)).toBeDefined();
    expect(subtreeIds(result.current.tasks, parent.id).sort()).toEqual(before);
  });

  it("undo restores the rows exactly as they were", async () => {
    const { result } = await loaded();
    const target = result.current.tasks[0];
    const snapshot = await taskRepo.get(target.id);

    let outcome: { undo: () => Promise<void> } | null = null;
    await act(async () => {
      outcome = await result.current.deleteTask(target.id);
    });
    await act(async () => {
      await outcome!.undo();
    });

    expect(await taskRepo.get(target.id)).toEqual(snapshot);
  });

  it("returns null for a task that is not there", async () => {
    const { result } = await loaded();

    let outcome: unknown = "unset";
    await act(async () => {
      outcome = await result.current.deleteTask("ghost");
    });

    expect(outcome).toBeNull();
  });
});

describe("moveTask", () => {
  it("moves a task down past one sibling and leaves the rest alone", async () => {
    const { result } = await loaded();
    const roots = siblingsOf(result.current.tasks, null);
    const [first, second] = roots;
    const untouched = roots.slice(2).map((t) => ({ id: t.id, order: t.order }));

    await act(async () => {
      await result.current.moveTask(first.id, 1);
    });

    const after = siblingsOf(result.current.tasks, null);
    expect(after[0].id).toBe(second.id);
    expect(after[1].id).toBe(first.id);
    for (const row of untouched) {
      expect(result.current.tasks.find((t) => t.id === row.id)!.order).toBe(row.order);
    }
  });

  it("moves a task up", async () => {
    const { result } = await loaded();
    const roots = siblingsOf(result.current.tasks, null);
    const target = roots[2];

    await act(async () => {
      await result.current.moveTask(target.id, -1);
    });

    expect(siblingsOf(result.current.tasks, null)[1].id).toBe(target.id);
  });

  it("refuses to move the first task up", async () => {
    const { result } = await loaded();
    const first = siblingsOf(result.current.tasks, null)[0];

    let moved = true;
    await act(async () => {
      moved = await result.current.moveTask(first.id, -1);
    });

    expect(moved).toBe(false);
  });

  it("refuses to move the last task down", async () => {
    const { result } = await loaded();
    const roots = siblingsOf(result.current.tasks, null);

    let moved = true;
    await act(async () => {
      moved = await result.current.moveTask(roots[roots.length - 1].id, 1);
    });

    expect(moved).toBe(false);
  });

  it("survives a reload", async () => {
    const { result } = await loaded();
    const [first, second] = siblingsOf(result.current.tasks, null);

    await act(async () => {
      await result.current.moveTask(first.id, 1);
    });

    await closeDb();
    await openDb();
    const stored = await taskRepo.byProject(result.current.project!.id);
    const roots = siblingsOf(stored, null);
    expect(roots[0].id).toBe(second.id);
  });
});

describe("indentTask and outdentTask", () => {
  it("makes a task a child of the sibling above it", async () => {
    const { result } = await loaded();
    const roots = siblingsOf(result.current.tasks, null);
    const [above, target] = roots;

    await act(async () => {
      await result.current.indentTask(target.id);
    });

    expect((await taskRepo.get(target.id))?.parentId).toBe(above.id);
  });

  it("refuses to indent the first task of a group", async () => {
    const { result } = await loaded();
    const first = siblingsOf(result.current.tasks, null)[0];

    let ok = true;
    await act(async () => {
      ok = await result.current.indentTask(first.id);
    });

    expect(ok).toBe(false);
    expect((await taskRepo.get(first.id))?.parentId).toBeNull();
  });

  it("makes a child a sibling of its own parent", async () => {
    const { result } = await loaded();
    const child = result.current.tasks.find((t) => t.parentId !== null)!;
    const parent = result.current.tasks.find((t) => t.id === child.parentId)!;

    await act(async () => {
      await result.current.outdentTask(child.id);
    });

    expect((await taskRepo.get(child.id))?.parentId).toBe(parent.parentId);
  });

  it("refuses to outdent a task that is already at the root", async () => {
    const { result } = await loaded();
    const root = siblingsOf(result.current.tasks, null)[0];

    let ok = true;
    await act(async () => {
      ok = await result.current.outdentTask(root.id);
    });

    expect(ok).toBe(false);
  });

  it("takes the descendants along on an indent", async () => {
    const { result } = await loaded();
    const roots = siblingsOf(result.current.tasks, null);
    const target = roots.find((t) => result.current.tasks.some((c) => c.parentId === t.id))!;
    const descendants = subtreeIds(result.current.tasks, target.id).filter((id) => id !== target.id);

    await act(async () => {
      await result.current.indentTask(target.id);
    });

    for (const id of descendants) {
      const stored = await taskRepo.get(id);
      expect(stored).toBeDefined();
      expect(subtreeIds(result.current.tasks, target.id)).toContain(id);
    }
  });
});

describe("reparenting guards", () => {
  it("rejects a move onto the task's own descendant", async () => {
    const { result } = await loaded();
    const parent = result.current.tasks.find(
      (t) => t.parentId === null && result.current.tasks.some((c) => c.parentId === t.id),
    )!;
    const child = result.current.tasks.find((t) => t.parentId === parent.id)!;

    // Indenting the child cannot pull the parent under it; the guard lives in
    // canReparent, and this is the path that reaches it from the UI.
    await act(async () => {
      await result.current.indentTask(child.id);
    });

    const stored = await taskRepo.get(parent.id);
    expect(stored?.parentId).toBeNull();
    expect(subtreeIds(result.current.tasks, parent.id)).toContain(child.id);
  });
});

describe("moveTaskToProject", () => {
  it("takes the whole subtree to the other project", async () => {
    const { result } = await loaded();
    const other = { id: newId(), name: "Other project", createdAt: Date.now() };
    await projects.put(other);

    const parent = result.current.tasks.find(
      (t) => t.parentId === null && result.current.tasks.some((c) => c.parentId === t.id),
    )!;
    const moving = subtreeIds(result.current.tasks, parent.id);
    expect(moving.length).toBeGreaterThan(1);

    await act(async () => {
      await result.current.moveTaskToProject(parent.id, other.id);
    });

    const landed = await taskRepo.byProject(other.id);
    expect(landed.map((t) => t.id).sort()).toEqual([...moving].sort());
    expect(result.current.tasks.some((t) => moving.includes(t.id))).toBe(false);
  });

  it("roots the moved task in its new project", async () => {
    const { result } = await loaded();
    const other = { id: newId(), name: "Other project", createdAt: Date.now() };
    await projects.put(other);
    const child = result.current.tasks.find((t) => t.parentId !== null)!;

    await act(async () => {
      await result.current.moveTaskToProject(child.id, other.id);
    });

    expect((await taskRepo.get(child.id))?.parentId).toBeNull();
  });

  it("keeps the descendants pointing at their own parents", async () => {
    const { result } = await loaded();
    const other = { id: newId(), name: "Other project", createdAt: Date.now() };
    await projects.put(other);
    const parent = result.current.tasks.find(
      (t) => t.parentId === null && result.current.tasks.some((c) => c.parentId === t.id),
    )!;
    const child = result.current.tasks.find((t) => t.parentId === parent.id)!;

    await act(async () => {
      await result.current.moveTaskToProject(parent.id, other.id);
    });

    expect((await taskRepo.get(child.id))?.parentId).toBe(parent.id);
  });

  it("does nothing for a task that is not there", async () => {
    const { result } = await loaded();
    const before = result.current.tasks.length;

    await act(async () => {
      await result.current.moveTaskToProject("ghost", "nowhere");
    });

    expect(result.current.tasks).toHaveLength(before);
  });
});
