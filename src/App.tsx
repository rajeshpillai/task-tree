import { TaskGrid } from "./components/TaskGrid";
import { useProjectData } from "./state/useProjectData";

export function App() {
  const { loading, error, project, stages, users, tasks, renameTask } = useProjectData();

  return (
    <main className="zen-mx-auto zen-flex zen-max-w-5xl zen-flex-col zen-gap-4 zen-p-6">
      <header>
        <h1 className="zen-text-2xl zen-font-semibold">{project?.name ?? "Task Tree"}</h1>
      </header>

      {error ? (
        <p role="alert">Could not open your tasks: {error.message}</p>
      ) : (
        <TaskGrid
          tasks={tasks}
          stages={stages}
          users={users}
          onRenameTask={renameTask}
          loading={loading}
        />
      )}
    </main>
  );
}
