import { openDb, request, transactionDone } from "./open";
import { STORE, type Project, type Stage, type Task, type User } from "./schema";

type StoreName = (typeof STORE)[keyof typeof STORE];

async function read<T>(store: StoreName, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return request(run(db.transaction(store, "readonly").objectStore(store)));
}

async function write(store: StoreName, run: (s: IDBObjectStore) => void): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  run(tx.objectStore(store));
  return transactionDone(tx);
}

/**
 * An index getAll returns index-key then primary-key order, and ids are random
 * UUIDs, so rows arrive shuffled. Both callers have an explicit `order` field
 * and every consumer depends on it, so sorting belongs here rather than in
 * each call site.
 */
async function byProject<T extends { order: number }>(
  store: StoreName,
  projectId: string,
): Promise<T[]> {
  const db = await openDb();
  const index = db.transaction(store, "readonly").objectStore(store).index("by-project");
  const rows = await request(index.getAll(projectId) as IDBRequest<T[]>);
  return rows.sort((a, b) => a.order - b.order);
}

export const projects = {
  all: () => read<Project[]>(STORE.projects, (s) => s.getAll()),
  get: (id: string) => read<Project | undefined>(STORE.projects, (s) => s.get(id)),
  put: (row: Project) => write(STORE.projects, (s) => void s.put(row)),
  remove: (id: string) => write(STORE.projects, (s) => void s.delete(id)),
};

export const stages = {
  byProject: (projectId: string) => byProject<Stage>(STORE.stages, projectId),
  put: (row: Stage) => write(STORE.stages, (s) => void s.put(row)),
  remove: (id: string) => write(STORE.stages, (s) => void s.delete(id)),
};

export const users = {
  all: () => read<User[]>(STORE.users, (s) => s.getAll()),
  put: (row: User) => write(STORE.users, (s) => void s.put(row)),
  remove: (id: string) => write(STORE.users, (s) => void s.delete(id)),
};

export const tasks = {
  byProject: (projectId: string) => byProject<Task>(STORE.tasks, projectId),
  get: (id: string) => read<Task | undefined>(STORE.tasks, (s) => s.get(id)),
  put: (row: Task) => write(STORE.tasks, (s) => void s.put(row)),
  remove: (id: string) => write(STORE.tasks, (s) => void s.delete(id)),
  /** One transaction, so a subtree delete cannot land half-applied. */
  putMany: (rows: readonly Task[]) =>
    write(STORE.tasks, (s) => {
      for (const row of rows) s.put(row);
    }),
  removeMany: (ids: readonly string[]) =>
    write(STORE.tasks, (s) => {
      for (const id of ids) s.delete(id);
    }),
};
