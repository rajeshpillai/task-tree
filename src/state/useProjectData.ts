import { useCallback, useEffect, useState } from "react";
import { projects, stages as stageRepo, tasks as taskRepo, users as userRepo } from "../db/repo";
import type { Project, Stage, Task, User } from "../db/schema";

export interface ProjectData {
  loading: boolean;
  error: Error | null;
  project: Project | null;
  stages: Stage[];
  users: User[];
  tasks: Task[];
  renameTask: (id: string, title: string) => Promise<void>;
}

export function useProjectData(): ProjectData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

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
        setTasks(projectTasks);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause : new Error(String(cause)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const renameTask = useCallback(async (id: string, title: string) => {
    const existing = await taskRepo.get(id);
    if (!existing) return;
    const next = { ...existing, title, updatedAt: Date.now() };
    await taskRepo.put(next);
    setTasks((current) => current.map((t) => (t.id === id ? next : t)));
  }, []);

  return { loading, error, project, stages, users, tasks, renameTask };
}
