export const DB_NAME = "task-tree";
export const DB_VERSION = 1;

export const STORE = {
  projects: "projects",
  stages: "stages",
  users: "users",
  tasks: "tasks",
} as const;

export interface Project {
  id: string;
  name: string;
  createdAt: number;
}

export interface Stage {
  id: string;
  projectId: string;
  name: string;
  color: string;
  order: number;
}

export interface User {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  projectId: string;
  /** null for a root task. */
  parentId: string | null;
  title: string;
  notes: string;
  assigneeId: string | null;
  stageId: string;
  /**
   * Float, so dropping a row between two siblings is a midpoint write rather
   * than a renumber of the whole sibling list.
   */
  order: number;
  dueDate: number | null;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_PROJECT_NAME = "My tasks";

export const DEFAULT_STAGES: ReadonlyArray<{ name: string; color: string }> = [
  { name: "Todo", color: "#94a3b8" },
  { name: "In progress", color: "#6366f1" },
  { name: "Completed", color: "#10b981" },
];

export const newId = (): string => crypto.randomUUID();
