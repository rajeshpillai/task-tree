import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, request } from "./open";
import { DB_NAME, DB_VERSION, DEFAULT_PROJECT_NAME, DEFAULT_STAGES, STORE } from "./schema";
import { projects, stages } from "./repo";

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

describe("openDb", () => {
  it("creates the four stores at version 1", async () => {
    const db = await openDb();
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(["projects", "stages", "tasks", "users"]);
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
