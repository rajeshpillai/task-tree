import {
  DB_NAME,
  DB_VERSION,
  DEFAULT_PROJECT_NAME,
  DEFAULT_STAGES,
  STORE,
  newId,
  type Project,
  type Stage,
} from "./schema";

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
  DEFAULT_STAGES.forEach((stage, i) => {
    const row: Stage = {
      id: newId(),
      projectId: project.id,
      name: stage.name,
      color: stage.color,
      order: i,
    };
    stages.add(row);
  });
}

function upgrade(db: IDBDatabase, tx: IDBTransaction): void {
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

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    // The spec guarantees a versionchange transaction for the whole of
    // onupgradeneeded; the type is nullable only because the property is null
    // outside that window.
    req.onupgradeneeded = () => upgrade(req.result, req.transaction!);
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
