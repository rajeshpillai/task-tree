import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb } from "./open";
import { projects, stages, tasks, users } from "./repo";
import { newId, type Task } from "./schema";

let projectId: string;
let stageId: string;

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
  await openDb();
  const [project] = await projects.all();
  projectId = project.id;
  stageId = (await stages.byProject(projectId))[0].id;
});

function makeTask(over: Partial<Task> = {}): Task {
  const now = Date.now();
  return {
    id: newId(),
    projectId,
    parentId: null,
    title: "Untitled",
    notes: "",
    assigneeId: null,
    stageId,
    order: 0,
    dueDate: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe("tasks", () => {
  it("round-trips a task", async () => {
    const task = makeTask({ title: "Ship v1" });
    await tasks.put(task);
    expect(await tasks.get(task.id)).toEqual(task);
  });

  it("keeps a task readable after the connection is closed and reopened", async () => {
    const task = makeTask({ title: "Survives a reload" });
    await tasks.put(task);

    // A page reload is a new connection to the same stored database.
    await closeDb();
    await openDb();

    expect(await tasks.get(task.id)).toEqual(task);
  });

  it("returns undefined for an id that was never stored", async () => {
    expect(await tasks.get("nope")).toBeUndefined();
  });

  it("scopes byProject to one project", async () => {
    const other = { id: newId(), name: "Other", createdAt: Date.now() };
    await projects.put(other);
    await tasks.put(makeTask({ title: "Mine" }));
    await tasks.put(makeTask({ title: "Theirs", projectId: other.id }));

    expect((await tasks.byProject(projectId)).map((t) => t.title)).toEqual(["Mine"]);
    expect((await tasks.byProject(other.id)).map((t) => t.title)).toEqual(["Theirs"]);
  });

  it("returns tasks sorted by order, including root tasks with a null parent", async () => {
    await tasks.put(makeTask({ title: "third", order: 3 }));
    await tasks.put(makeTask({ title: "first", order: 1 }));
    await tasks.put(makeTask({ title: "second", order: 2 }));

    expect((await tasks.byProject(projectId)).map((t) => t.title)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("put overwrites an existing task rather than duplicating it", async () => {
    const task = makeTask({ title: "Before" });
    await tasks.put(task);
    await tasks.put({ ...task, title: "After" });

    const all = await tasks.byProject(projectId);
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("After");
  });

  it("removes a task", async () => {
    const task = makeTask();
    await tasks.put(task);
    await tasks.remove(task.id);
    expect(await tasks.get(task.id)).toBeUndefined();
  });

  it("writes many tasks in one transaction", async () => {
    const rows = [makeTask({ order: 1 }), makeTask({ order: 2 }), makeTask({ order: 3 })];
    await tasks.putMany(rows);
    expect(await tasks.byProject(projectId)).toHaveLength(3);
  });

  it("removes many tasks in one transaction", async () => {
    const rows = [makeTask({ order: 1 }), makeTask({ order: 2 }), makeTask({ order: 3 })];
    await tasks.putMany(rows);
    await tasks.removeMany([rows[0].id, rows[2].id]);

    const left = await tasks.byProject(projectId);
    expect(left.map((t) => t.id)).toEqual([rows[1].id]);
  });

  it("putMany and removeMany accept an empty list", async () => {
    await expect(tasks.putMany([])).resolves.toBeUndefined();
    await expect(tasks.removeMany([])).resolves.toBeUndefined();
  });
});

describe("projects", () => {
  it("round-trips and removes", async () => {
    const row = { id: newId(), name: "Side project", createdAt: Date.now() };
    await projects.put(row);
    expect(await projects.get(row.id)).toEqual(row);

    await projects.remove(row.id);
    expect(await projects.get(row.id)).toBeUndefined();
  });
});

describe("stages", () => {
  it("scopes byProject and keeps them ordered", async () => {
    const other = { id: newId(), name: "Other", createdAt: Date.now() };
    await projects.put(other);
    await stages.put({
      id: newId(),
      projectId: other.id,
      name: "Backlog",
      color: "#000",
      order: 0,
    });

    expect((await stages.byProject(other.id)).map((s) => s.name)).toEqual(["Backlog"]);
    expect(await stages.byProject(projectId)).toHaveLength(3);
  });

  it("removes a stage", async () => {
    const [first] = await stages.byProject(projectId);
    await stages.remove(first.id);
    expect(await stages.byProject(projectId)).toHaveLength(2);
  });
});

describe("users", () => {
  it("starts empty and round-trips", async () => {
    expect(await users.all()).toEqual([]);

    const row = { id: newId(), name: "Rajesh", color: "#6366f1" };
    await users.put(row);
    expect(await users.all()).toEqual([row]);

    await users.remove(row.id);
    expect(await users.all()).toEqual([]);
  });
});
