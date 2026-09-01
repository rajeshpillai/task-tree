import { Button, Toaster, ToastAction, toast } from "@algorisys/zen-ui-react";
import { TaskGrid } from "./components/TaskGrid";
import { useProjectData } from "./state/useProjectData";

export function App() {
  const {
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
  } = useProjectData();

  async function handleDelete(id: string) {
    const result = await deleteTask(id);
    if (!result) return;

    toast({
      title: result.count === 1 ? "Task deleted" : `${result.count} tasks deleted`,
      description: result.count > 1 ? "The whole subtree went with it." : undefined,
      action: (
        <ToastAction altText="Undo the delete" onClick={() => void result.undo()}>
          Undo
        </ToastAction>
      ),
    });
  }

  return (
    <main className="zen-mx-auto zen-flex zen-max-w-6xl zen-flex-col zen-gap-4 zen-p-6">
      <header className="zen-flex zen-items-center zen-justify-between zen-gap-4">
        <h1 className="zen-text-2xl zen-font-semibold">{project?.name ?? "Task Tree"}</h1>
        <Button onClick={() => void addTask(null)} disabled={loading || !project}>
          Add task
        </Button>
      </header>

      {error ? (
        <p role="alert">Could not open your tasks: {error.message}</p>
      ) : (
        <TaskGrid
          tasks={tasks}
          stages={stages}
          users={users}
          loading={loading}
          onRenameTask={renameTask}
          onAddSubtask={(parentId) => void addTask(parentId)}
          onMoveTask={(id, delta) => void moveTask(id, delta)}
          onIndentTask={(id) => void indentTask(id)}
          onOutdentTask={(id) => void outdentTask(id)}
          onDeleteTask={(id) => void handleDelete(id)}
        />
      )}

      <Toaster />
    </main>
  );
}
