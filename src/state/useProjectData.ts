import { useCallback, useEffect, useRef, useState } from "react";
import { projects, stages as stageRepo, tasks as taskRepo, users as userRepo } from "../db/repo";
import { newId, type Project, type Stage, type Task, type User } from "../db/schema";
import { canReparent, nextOrder, reorderSiblings, siblingsOf, subtreeIds } from "../lib/tree";

/** Puts the deleted subtree back exactly as it was. */
export type Undo = () => Promise<void>;

export interface ProjectData {
  loading: boolean;
  error: Error | null;
  project: Project | null;
  stages: Stage[];
  users: User[];
  tasks: Task[];
  addTask: (parentId: string | null, title?: string) => Promise<Task | null>;
  renameTask: (id: string, title: string) => Promise<void>;
  deleteTask: (id: string) => Promise<{ count: number; undo: Undo } | null>;
  moveTask: (id: string, delta: number) => Promise<boolean>;
  indentTask: (id: string) => Promise<boolean>;
  outdentTask: (id: string) => Promise<boolean>;
  moveTaskToProject: (id: string, projectId: string) => Promise<void>;
}

const NEW_TASK_TITLE = "New task";

export function useProjectData(): ProjectData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  /**
   * Mirrors `tasks`, updated in the same call as the state. Mutations read
   * this rather than closing over `tasks`, so two actions in a row both see
   * the latest list without waiting for a re-render. It is deliberately not a
   * state updater callback: generating an id or writing to IndexedDB inside
   * one is impure, and StrictMode's double invocation would add every new task
   * twice under two different ids.
   */
  const tasksRef = useRef<Task[]>([]);

  const commit = useCallback((next: Task[]) => {
    tasksRef.current = next;
    setTasks(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [first] = await projects.all();
        const [projectStages, allUsers, projectTasks] = await Promise.all([
          stageRepo.byProject(first.id),
          userRepo.all(),
          taskRepo.byProject(first.id),
        ]);
        if (cancelled) return;
        setProject(first);
        setStages(projectStages);
        setUsers(allUsers);
        commit(projectTasks);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause : new Error(String(cause)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [commit]);

  const addTask = useCallback(
    async (parentId: string | null, title = NEW_TASK_TITLE): Promise<Task | null> => {
      if (!project || stages.length === 0) return null;

      const current = tasksRef.current;
      const now = Date.now();
      const task: Task = {
        id: newId(),
        projectId: project.id,
        parentId,
        title,
        notes: "",
        assigneeId: null,
        stageId: stages[0].id,
        order: nextOrder(current, parentId),
        dueDate: null,
        createdAt: now,
        updatedAt: now,
      };

      await taskRepo.put(task);
      commit([...current, task]);
      return task;
    },
    [commit, project, stages],
  );

  const renameTask = useCallback(
    async (id: string, title: string) => {
      const current = tasksRef.current;
      const existing = current.find((t) => t.id === id);
      if (!existing) return;

      const updated = { ...existing, title, updatedAt: Date.now() };
      await taskRepo.put(updated);
      commit(current.map((t) => (t.id === id ? updated : t)));
    },
    [commit],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const current = tasksRef.current;
      const ids = new Set(subtreeIds(current, id));
      const removed = current.filter((t) => ids.has(t.id));
      if (removed.length === 0) return null;

      await taskRepo.removeMany([...ids]);
      commit(current.filter((t) => !ids.has(t.id)));

      // The whole subtree comes back, not just the row that was clicked.
      const undo: Undo = async () => {
        await taskRepo.putMany(removed);
        commit([...tasksRef.current.filter((t) => !ids.has(t.id)), ...removed]);
      };

      return { count: removed.length, undo };
    },
    [commit],
  );

  const moveTask = useCallback(
    async (id: string, delta: number) => {
      const current = tasksRef.current;
      const task = current.find((t) => t.id === id);
      if (!task) return false;

      const siblings = siblingsOf(current, task.parentId);
      const from = siblings.findIndex((t) => t.id === id);
      const to = from + delta;
      if (to < 0 || to >= siblings.length) return false;

      const changes = reorderSiblings(siblings, id, to);
      const orderById = new Map(changes.map((c) => [c.id, c.order]));
      const now = Date.now();
      const updated = current
        .filter((t) => orderById.has(t.id))
        .map((t) => ({ ...t, order: orderById.get(t.id)!, updatedAt: now }));

      await taskRepo.putMany(updated);
      commit(current.map((t) => updated.find((u) => u.id === t.id) ?? t));
      return true;
    },
    [commit],
  );

  /** Reparents `id` under `newParentId`, appended after any existing children. */
  const reparent = useCallback(
    async (id: string, newParentId: string | null) => {
      const current = tasksRef.current;
      const task = current.find((t) => t.id === id);
      if (!task || !canReparent(current, id, newParentId)) return false;

      const updated = {
        ...task,
        parentId: newParentId,
        order: nextOrder(current, newParentId),
        updatedAt: Date.now(),
      };
      await taskRepo.put(updated);
      commit(current.map((t) => (t.id === id ? updated : t)));
      return true;
    },
    [commit],
  );

  /** Becomes a child of the sibling above it, which is what an indent means. */
  const indentTask = useCallback(
    async (id: string) => {
      const current = tasksRef.current;
      const task = current.find((t) => t.id === id);
      if (!task) return false;

      const siblings = siblingsOf(current, task.parentId);
      const index = siblings.findIndex((t) => t.id === id);
      // The first row of a group has nothing above it to become a child of.
      if (index <= 0) return false;

      return reparent(id, siblings[index - 1].id);
    },
    [reparent],
  );

  /** Becomes a sibling of its own parent. */
  const outdentTask = useCallback(
    async (id: string) => {
      const current = tasksRef.current;
      const task = current.find((t) => t.id === id);
      if (!task || task.parentId === null) return false;

      const parent = current.find((t) => t.id === task.parentId);
      return reparent(id, parent?.parentId ?? null);
    },
    [reparent],
  );

  const moveTaskToProject = useCallback(
    async (id: string, projectId: string) => {
      const current = tasksRef.current;
      const ids = new Set(subtreeIds(current, id));
      const moving = current.filter((t) => ids.has(t.id));
      if (moving.length === 0) return;

      const now = Date.now();
      // The whole subtree follows. Leaving descendants behind would strand
      // them in the old project pointing at a parent that is no longer there.
      const updated = moving.map((t) =>
        t.id === id
          ? { ...t, projectId, parentId: null, updatedAt: now }
          : { ...t, projectId, updatedAt: now },
      );

      await taskRepo.putMany(updated);
      commit(current.filter((t) => !ids.has(t.id)));
    },
    [commit],
  );

  return {
    loading,
    error,
    project,
    stages,
    users,
    tasks,
    addTask,
    renameTask,
    deleteTask,
    moveTask,
    indentTask,
    outdentTask,
    moveTaskToProject,
  };
}
