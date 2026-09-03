import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, request } from "./open";
import {
  DB_NAME,
  DB_VERSION,
  DEFAULT_PRIORITY,
  DEFAULT_PROJECT_NAME,
  DEFAULT_STAGES,
  PRIORITIES,
  STORE,
} from "./schema";
import { projects, stages, tasks, users } from "./repo";

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

describe("openDb", () => {
  it("creates the four stores", async () => {
    const db = await openDb();
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(["projects", "stages", "tasks", "users"]);
  });

  it("seeds sample tasks and users so a first run is not an empty grid", async () => {
    await openDb();
    const [project] = await projects.all();

    const seededTasks = await tasks.byProject(project.id);
    expect(seededTasks.length).toBeGreaterThan(10);
    expect(seededTasks.some((t) => t.parentId !== null)).toBe(true);
    expect(await users.all()).not.toHaveLength(0);
  });

  it("gives every sample task a stage that exists", async () => {
    await openDb();
    const [project] = await projects.all();
    const stageIds = new Set((await stages.byProject(project.id)).map((s) => s.id));

    for (const task of await tasks.byProject(project.id)) {
      expect(stageIds).toContain(task.stageId);
    }
  });

  it("gives every sample task a priority on the scale", async () => {
    await openDb();
    const [project] = await projects.all();
    const ids = new Set(PRIORITIES.map((p) => p.id));

    for (const task of await tasks.byProject(project.id)) {
      expect(ids).toContain(task.priority);
    }
  });

  it("spreads the sample across the whole scale, so the colour coding shows", async () => {
    await openDb();
    const [project] = await projects.all();
    const used = new Set((await tasks.byProject(project.id)).map((t) => t.priority));

    expect(used.size).toBe(PRIORITIES.length);
  });

  it("gives every sample task either a real assignee or none", async () => {
    await openDb();
    const [project] = await projects.all();
    const userIds = new Set((await users.all()).map((u) => u.id));

    for (const task of await tasks.byProject(project.id)) {
      if (task.assigneeId !== null) expect(userIds).toContain(task.assigneeId);
    }
  });

  it("gives every sample subtask a parent that exists", async () => {
    await openDb();
    const [project] = await projects.all();
    const all = await tasks.byProject(project.id);
    const ids = new Set(all.map((t) => t.id));

    for (const task of all) {
      if (task.parentId !== null) expect(ids).toContain(task.parentId);
    }
  });

  it("seeds a default project with the three default stages", async () => {
    await openDb();
    const [project] = await projects.all();
    expect(project.name).toBe(DEFAULT_PROJECT_NAME);

    const seeded = await stages.byProject(project.id);
    expect(seeded.map((s) => s.name)).toEqual(DEFAULT_STAGES.map((s) => s.name));
    expect(seeded.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it("opens an existing database without re-seeding", async () => {
    await openDb();
    const first = await projects.all();
    await closeDb();

    await openDb();
    const second = await projects.all();
    expect(second).toEqual(first);
    expect(second).toHaveLength(1);
  });

  it("returns the same connection to concurrent callers", async () => {
    const [a, b] = await Promise.all([openDb(), openDb()]);
    expect(a).toBe(b);
  });

  it("closeDb is safe to call before anything is open", async () => {
    await expect(closeDb()).resolves.toBeUndefined();
  });
});

describe("index design", () => {
  // The reason there is no by-parent index on tasks. IndexedDB skips any
  // record whose key path value is null, so root tasks would silently vanish
  // from it. This test fails if that ever stops being true.
  it("IndexedDB omits records with a null indexed value", async () => {
    const db = await openDb();
    const tx = db.transaction(STORE.stages, "readwrite");
    const store = tx.objectStore(STORE.stages);
    store.put({ id: "orphan", projectId: null, name: "x", color: "#000", order: 0 });
    await new Promise((r) => (tx.oncomplete = r));

    const all = await request(
      db.transaction(STORE.stages, "readonly").objectStore(STORE.stages).getAll(),
    );
    const viaIndex = await request(
      db
        .transaction(STORE.stages, "readonly")
        .objectStore(STORE.stages)
        .index("by-project")
        .getAll(),
    );

    expect(all.map((r: { id: string }) => r.id)).toContain("orphan");
    expect(viaIndex.map((r: { id: string }) => r.id)).not.toContain("orphan");
  });
});

describe("DB_NAME", () => {
  it("is stable, since changing it orphans every existing user's data", () => {
    expect(DB_NAME).toBe("task-tree");
  });
});

describe("the v1 to v2 migration", () => {
  /**
   * Opens a v1 database by hand and writes a task shaped the way v1 stored
   * one, with no priority at all. Anyone already running the app has exactly
   * this on disk, so reseeding instead of migrating would lose their tasks.
   */
  async function seedV1Task(): Promise<string> {
    const id = "legacy-task";
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore(STORE.projects, { keyPath: "id" });
        db.createObjectStore(STORE.stages, { keyPath: "id" }).createIndex(
          "by-project",
          "projectId",
        );
        db.createObjectStore(STORE.users, { keyPath: "id" });
        db.createObjectStore(STORE.tasks, { keyPath: "id" }).createIndex(
          "by-project",
          "projectId",
        );
        req.transaction!.objectStore(STORE.projects).add({
          id: "p1",
          name: "Existing work",
          createdAt: 1,
        });
        req.transaction!.objectStore(STORE.tasks).add({
          id,
          projectId: "p1",
          parentId: null,
          title: "Written before priorities existed",
          notes: "",
          assigneeId: null,
          stageId: "s1",
          order: 0,
          dueDate: null,
          createdAt: 1,
          updatedAt: 1,
        });
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    return id;
  }

  it("backfills the default priority rather than dropping the task", async () => {
    const id = await seedV1Task();

    const db = await openDb();
    expect(db.version).toBe(DB_VERSION);

    const migrated = await tasks.get(id);
    expect(migrated?.title).toBe("Written before priorities existed");
    expect(migrated?.priority).toBe(DEFAULT_PRIORITY);
  });

  it("keeps the existing project instead of reseeding over it", async () => {
    await seedV1Task();
    await openDb();

    expect((await projects.all()).map((p) => p.name)).toEqual(["Existing work"]);
  });
});
