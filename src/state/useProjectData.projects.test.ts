import { IDBFactory } from "fake-indexeddb";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "../db/open";
import { stages as stageRepo, tasks as taskRepo } from "../db/repo";
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

describe("projects", () => {
  it("creates a project with its own stages and switches to it", async () => {
    const { result } = await loaded();
    const firstId = result.current.project!.id;

    await act(async () => {
      await result.current.createProject("Side project");
    });

    expect(result.current.project!.name).toBe("Side project");
    expect(result.current.project!.id).not.toBe(firstId);
    expect(result.current.stages).toHaveLength(3);
    expect(result.current.tasks).toEqual([]);
  });

  it("switches back to a project and brings its tasks with it", async () => {
    const { result } = await loaded();
    const firstId = result.current.project!.id;
    const taskCount = result.current.tasks.length;

    await act(async () => {
      await result.current.createProject("Side project");
    });
    expect(result.current.tasks).toEqual([]);

    await act(async () => {
      await result.current.selectProject(firstId);
    });
    expect(result.current.tasks).toHaveLength(taskCount);
  });

  it("ignores a blank project name", async () => {
    const { result } = await loaded();
    const before = result.current.projects.length;

    await act(async () => {
      expect(await result.current.createProject("   ")).toBeNull();
    });

    expect(result.current.projects).toHaveLength(before);
  });
});

describe("stages", () => {
  it("keeps stages per project, so renaming one does not touch the other", async () => {
    const { result } = await loaded();
    const firstId = result.current.project!.id;
    const targetName = result.current.stages[0].name;

    await act(async () => {
      await result.current.createProject("Side project");
    });
    const otherStageId = result.current.stages[0].id;

    await act(async () => {
      await result.current.renameStage(otherStageId, "Renamed only here");
    });

    const firstStages = await stageRepo.byProject(firstId);
    expect(firstStages[0].name).toBe(targetName);
    expect(result.current.stages[0].name).toBe("Renamed only here");
  });

  it("refuses to delete a stage that still has tasks, and says how many", async () => {
    const { result } = await loaded();
    const inUse = result.current.stages.find((s) =>
      result.current.tasks.some((t) => t.stageId === s.id),
    )!;
    const expected = result.current.tasks.filter((t) => t.stageId === inUse.id).length;

    let outcome: { ok: boolean; count?: number; reason?: string } | null = null;
    await act(async () => {
      outcome = await result.current.deleteStage(inUse.id);
    });

    expect(outcome).toEqual({ ok: false, reason: "in-use", count: expected });
    expect(await stageRepo.byProject(result.current.project!.id)).toHaveLength(3);
  });

  it("deletes a stage nothing points at", async () => {
    const { result } = await loaded();

    await act(async () => {
      await result.current.addStage("Blocked", "#000000");
    });
    const added = result.current.stages.at(-1)!;

    let outcome: { ok: boolean } | null = null;
    await act(async () => {
      outcome = await result.current.deleteStage(added.id);
    });

    expect(outcome).toEqual({ ok: true });
    expect(result.current.stages.map((s) => s.id)).not.toContain(added.id);
  });

  it("refuses to remove the last stage, since a task needs one", async () => {
    const { result } = await loaded();

    await act(async () => {
      await result.current.createProject("Empty");
    });
    // No tasks here, so the only thing stopping a delete is the count.
    const [a, b, c] = result.current.stages;
    await act(async () => {
      await result.current.deleteStage(a.id);
      await result.current.deleteStage(b.id);
    });

    let outcome: { ok: boolean; reason?: string } | null = null;
    await act(async () => {
      outcome = await result.current.deleteStage(c.id);
    });

    expect(outcome).toEqual({ ok: false, reason: "last-stage", count: 0 });
  });

  it("adds a stage at the end and recolours one in place", async () => {
    const { result } = await loaded();

    await act(async () => {
      await result.current.addStage("Blocked", "#111111");
    });
    const added = result.current.stages.at(-1)!;
    expect(added.name).toBe("Blocked");

    await act(async () => {
      await result.current.recolorStage(added.id, "#222222");
    });

    expect(result.current.stages.at(-1)!.color).toBe("#222222");
  });
});

describe("people and assignment", () => {
  it("adds a person and assigns them to a task", async () => {
    const { result } = await loaded();
    const target = result.current.tasks[0];

    await act(async () => {
      await result.current.addUser("Ada", "#123456");
    });
    const ada = result.current.users.at(-1)!;

    await act(async () => {
      await result.current.setTaskAssignee(target.id, ada.id);
    });

    expect((await taskRepo.get(target.id))?.assigneeId).toBe(ada.id);
  });

  it("clears an assignee back to unassigned", async () => {
    const { result } = await loaded();
    const assigned = result.current.tasks.find((t) => t.assigneeId !== null)!;

    await act(async () => {
      await result.current.setTaskAssignee(assigned.id, null);
    });

    expect((await taskRepo.get(assigned.id))?.assigneeId).toBeNull();
  });

  it("changes a task's stage", async () => {
    const { result } = await loaded();
    const target = result.current.tasks[0];
    const other = result.current.stages.find((s) => s.id !== target.stageId)!;

    await act(async () => {
      await result.current.setTaskStage(target.id, other.id);
    });

    expect((await taskRepo.get(target.id))?.stageId).toBe(other.id);
  });

  it("leaves other tasks untouched when one is assigned", async () => {
    const { result } = await loaded();
    const [target, ...rest] = result.current.tasks;
    const before = rest.map((t) => ({ id: t.id, assigneeId: t.assigneeId }));

    await act(async () => {
      await result.current.setTaskAssignee(target.id, null);
    });

    for (const row of before) {
      expect(result.current.tasks.find((t) => t.id === row.id)!.assigneeId).toBe(row.assigneeId);
    }
  });
});
