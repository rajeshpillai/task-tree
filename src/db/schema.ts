export const DB_NAME = "task-tree";
export const DB_VERSION = 2;

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

export type Priority = "high" | "medium" | "low";

/**
 * The three priorities, most urgent first. Unlike stages these are not
 * editable data: it is a fixed scale, so it lives in code rather than in a
 * store. No colour here — that is presentation, it has to differ per theme,
 * and it lives with the tokens in index.css.
 */
export const PRIORITIES: ReadonlyArray<{ id: Priority; label: string }> = [
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

/**
 * What a new task gets, and what a task written before priorities existed is
 * backfilled with. Middle of the scale, so a backfill makes no claim about
 * work nobody has triaged.
 */
export const DEFAULT_PRIORITY: Priority = "medium";

export interface Task {
  id: string;
  projectId: string;
  /** null for a root task. */
  parentId: string | null;
  title: string;
  notes: string;
  assigneeId: string | null;
  stageId: string;
  priority: Priority;
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
