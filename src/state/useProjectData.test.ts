import { IDBFactory } from "fake-indexeddb";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb } from "../db/open";
import { projects, tasks as taskRepo } from "../db/repo";
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

describe("useProjectData", () => {
  it("loads the seeded project with its stages, users and tasks", async () => {
    const { result } = await loaded();

    expect(result.current.error).toBeNull();
    expect(result.current.project?.name).toBe("My tasks");
    expect(result.current.stages).toHaveLength(3);
    expect(result.current.users.length).toBeGreaterThan(0);
    expect(result.current.tasks.length).toBeGreaterThan(0);
  });

  it("renames a task in state and in the database", async () => {
    const { result } = await loaded();
    const target = result.current.tasks[0];

    await result.current.renameTask(target.id, "Renamed");

    await waitFor(() =>
      expect(result.current.tasks.find((t) => t.id === target.id)?.title).toBe("Renamed"),
    );
    expect((await taskRepo.get(target.id))?.title).toBe("Renamed");
  });

  it("keeps the rename after the connection is closed and reopened", async () => {
    const { result } = await loaded();
    const target = result.current.tasks[0];
    await result.current.renameTask(target.id, "Survives a reload");

    await closeDb();
    await openDb();

    expect((await taskRepo.get(target.id))?.title).toBe("Survives a reload");
  });

  it("bumps updatedAt on a rename", async () => {
    const { result } = await loaded();
    const target = result.current.tasks[0];

    await result.current.renameTask(target.id, "Touched");

    const stored = await taskRepo.get(target.id);
    expect(stored!.updatedAt).toBeGreaterThanOrEqual(target.updatedAt);
    expect(stored!.createdAt).toBe(target.createdAt);
  });

  it("ignores a rename for a task that no longer exists", async () => {
    const { result } = await loaded();
    const before = result.current.tasks;

    await result.current.renameTask("deleted-id", "Nope");

    expect(result.current.tasks).toEqual(before);
  });

  it("reports an error instead of rendering an empty project", async () => {
    // A database with the stores but no seeded project: the load reads a row
    // that is not there.
    await closeDb();
    const factory = new IDBFactory();
    globalThis.indexedDB = factory;
    await openDb();
    await projects.remove((await projects.all())[0].id);
    await closeDb();

    const { result } = await loaded();
    expect(result.current.error).not.toBeNull();
  });
});
