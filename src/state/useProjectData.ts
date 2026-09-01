import { useCallback, useEffect, useRef, useState } from "react";
import { projects, stages as stageRepo, tasks as taskRepo, users as userRepo } from "../db/repo";
import {
  DEFAULT_STAGES,
  newId,
  type Project,
  type Stage,
  type Task,
  type User,
} from "../db/schema";
import { canReparent, nextOrder, reorderSiblings, siblingsOf, subtreeIds } from "../lib/tree";

/** Puts the deleted subtree back exactly as it was. */
export type Undo = () => Promise<void>;

/** Why a stage could not be removed, so the UI can say what is in the way. */
export interface StageDeleteBlocked {
  ok: false;
  reason: "in-use" | "last-stage";
  count: number;
}

export type StageDeleteResult = { ok: true } | StageDeleteBlocked;

export interface ProjectData {
  loading: boolean;
  error: Error | null;
  projects: Project[];
  project: Project | null;
  stages: Stage[];
  users: User[];
  tasks: Task[];
  selectProject: (id: string) => Promise<void>;
  createProject: (name: string) => Promise<Project | null>;
  addStage: (name: string, color: string) => Promise<Stage | null>;
  renameStage: (id: string, name: string) => Promise<void>;
  recolorStage: (id: string, color: string) => Promise<void>;
  deleteStage: (id: string) => Promise<StageDeleteResult>;
  addUser: (name: string, color: string) => Promise<User | null>;
  setTaskAssignee: (taskId: string, assigneeId: string | null) => Promise<void>;
  setTaskStage: (taskId: string, stageId: string) => Promise<void>;
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
  const [allProjects, setAllProjects] = useState<Project[]>([]);
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
        const all = await projects.all();
        const [first] = all;
        const [projectStages, allUsers, projectTasks] = await Promise.all([
          stageRepo.byProject(first.id),
          userRepo.all(),
          taskRepo.byProject(first.id),
        ]);
        if (cancelled) return;
        setAllProjects(all);
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

  const selectProject = useCallback(
    async (id: string) => {
      const next = allProjects.find((p) => p.id === id);
      if (!next || next.id === project?.id) return;

      const [projectStages, projectTasks] = await Promise.all([
        stageRepo.byProject(id),
        taskRepo.byProject(id),
      ]);
      setProject(next);
      setStages(projectStages);
      commit(projectTasks);
    },
    [allProjects, commit, project],
  );

  const createProject = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (trimmed === "") return null;

      const row: Project = { id: newId(), name: trimmed, createdAt: Date.now() };
      await projects.put(row);

      // A project with no stages cannot hold a task, so it starts with the
      // same three the first project got.
      const seeded: Stage[] = DEFAULT_STAGES.map((stage, i) => ({
        id: newId(),
        projectId: row.id,
        name: stage.name,
        color: stage.color,
        order: i,
      }));
      for (const stage of seeded) await stageRepo.put(stage);

      setAllProjects((current) => [...current, row]);
      setProject(row);
      setStages(seeded);
      commit([]);
      return row;
    },
    [commit],
  );

  const addStage = useCallback(
    async (name: string, color: string) => {
      const trimmed = name.trim();
      if (!project || trimmed === "") return null;

      const row: Stage = {
        id: newId(),
        projectId: project.id,
        name: trimmed,
        color,
        order: stages.length === 0 ? 0 : stages[stages.length - 1].order + 1,
      };
      await stageRepo.put(row);
      setStages((current) => [...current, row]);
      return row;
    },
    [project, stages],
  );

  /** Writes happen before the state update, never inside it: see tasksRef. */
  const patchStage = useCallback(
    async (id: string, patch: Partial<Stage>) => {
      const existing = stages.find((s) => s.id === id);
      if (!existing) return;

      const updated = { ...existing, ...patch };
      await stageRepo.put(updated);
      setStages((current) => current.map((s) => (s.id === id ? updated : s)));
    },
    [stages],
  );

  const renameStage = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (trimmed === "") return;
      await patchStage(id, { name: trimmed });
    },
    [patchStage],
  );

  const recolorStage = useCallback(
    (id: string, color: string) => patchStage(id, { color }),
    [patchStage],
  );

  const deleteStage = useCallback(
    async (id: string): Promise<StageDeleteResult> => {
      // Removing a stage that tasks point at would leave those rows with a
      // stage that is not there, so it is refused rather than cascaded.
      const inUse = tasksRef.current.filter((t) => t.stageId === id).length;
      if (inUse > 0) return { ok: false, reason: "in-use", count: inUse };
      if (stages.length <= 1) return { ok: false, reason: "last-stage", count: 0 };

      await stageRepo.remove(id);
      setStages((current) => current.filter((s) => s.id !== id));
      return { ok: true };
    },
    [stages],
  );

  const addUser = useCallback(async (name: string, color: string) => {
    const trimmed = name.trim();
    if (trimmed === "") return null;

    const row: User = { id: newId(), name: trimmed, color };
    await userRepo.put(row);
    setUsers((current) => [...current, row]);
    return row;
  }, []);

  const patchTask = useCallback(
    async (taskId: string, patch: Partial<Task>) => {
      const current = tasksRef.current;
      const existing = current.find((t) => t.id === taskId);
      if (!existing) return;

      const updated = { ...existing, ...patch, updatedAt: Date.now() };
      await taskRepo.put(updated);
      commit(current.map((t) => (t.id === taskId ? updated : t)));
    },
    [commit],
  );

  const setTaskAssignee = useCallback(
    (taskId: string, assigneeId: string | null) => patchTask(taskId, { assigneeId }),
    [patchTask],
  );

  const setTaskStage = useCallback(
    (taskId: string, stageId: string) => patchTask(taskId, { stageId }),
    [patchTask],
  );

  return {
    loading,
    error,
    projects: allProjects,
    project,
    selectProject,
    createProject,
    addStage,
    renameStage,
    recolorStage,
    deleteStage,
    addUser,
    setTaskAssignee,
    setTaskStage,
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
