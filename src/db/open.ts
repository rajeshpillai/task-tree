import {
  DB_NAME,
  DB_VERSION,
  DEFAULT_PRIORITY,
  DEFAULT_PROJECT_NAME,
  DEFAULT_STAGES,
  STORE,
  newId,
  type Project,
  type Stage,
  type Task,
} from "./schema";
import { sampleData } from "./sample";

/**
 * Resolves when the request settles. Every IndexedDB call is event-based, so
 * this is the seam between that API and the rest of the app.
 */
export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Resolves when the transaction commits, rejects if it aborts or errors. */
export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException("aborted", "AbortError"));
  });
}

function seed(tx: IDBTransaction): void {
  const project: Project = {
    id: newId(),
    name: DEFAULT_PROJECT_NAME,
    createdAt: Date.now(),
  };
  tx.objectStore(STORE.projects).add(project);

  const stages = tx.objectStore(STORE.stages);
  const stageIds: string[] = [];
  DEFAULT_STAGES.forEach((stage, i) => {
    const row: Stage = {
      id: newId(),
      projectId: project.id,
      name: stage.name,
      color: stage.color,
      order: i,
    };
    stageIds.push(row.id);
    stages.add(row);
  });

  // A first run opens on something worth looking at rather than an empty
  // grid. Same transaction as the project and its stages, so the whole first
  // run either lands or does not.
  const sample = sampleData(project.id, stageIds);
  const users = tx.objectStore(STORE.users);
  for (const user of sample.users) users.add(user);
  const tasks = tx.objectStore(STORE.tasks);
  for (const task of sample.tasks) tasks.add(task);
}

function createStores(db: IDBDatabase, tx: IDBTransaction): void {
  db.createObjectStore(STORE.projects, { keyPath: "id" });

  const stages = db.createObjectStore(STORE.stages, { keyPath: "id" });
  stages.createIndex("by-project", "projectId");

  db.createObjectStore(STORE.users, { keyPath: "id" });

  const tasks = db.createObjectStore(STORE.tasks, { keyPath: "id" });
  // Only by-project. There is deliberately no by-parent index: IndexedDB skips
  // any record whose key path value is null, so every root task would be
  // missing from it. A project's tasks are read flat and nested in memory.
  tasks.createIndex("by-project", "projectId");

  seed(tx);
}

/**
 * Gives every task written before v2 the default priority. A cursor rather
 * than getAll plus putMany: this runs inside the versionchange transaction,
 * where the whole migration has to be one synchronous walk, and it keeps the
 * store off the heap on a large database.
 */
function backfillPriority(tx: IDBTransaction): void {
  const cursorRequest = tx.objectStore(STORE.tasks).openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    const task = cursor.value as Task;
    // Only the ones actually missing it, so a re-entered migration is a no-op
    // and a task already triaged is never overwritten.
    if (task.priority === undefined) cursor.update({ ...task, priority: DEFAULT_PRIORITY });
    cursor.continue();
  };
}

/**
 * Runs for every version between the one on disk and DB_VERSION, so a browser
 * holding v1 data is migrated rather than reseeded. `oldVersion` is 0 on a
 * first run, which is what makes the store creation and the seed conditional
 * on the same check.
 */
function upgrade(db: IDBDatabase, tx: IDBTransaction, oldVersion: number): void {
  if (oldVersion < 1) createStores(db, tx);
  if (oldVersion >= 1 && oldVersion < 2) backfillPriority(tx);
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    // The spec guarantees a versionchange transaction for the whole of
    // onupgradeneeded; the type is nullable only because the property is null
    // outside that window.
    req.onupgradeneeded = (event) => upgrade(req.result, req.transaction!, event.oldVersion);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("another tab is holding an older version open"));
  });
  return dbPromise;
}

/** Closes the connection and drops the cache, so the next openDb reconnects. */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise.catch(() => null);
  dbPromise = null;
  db?.close();
}
