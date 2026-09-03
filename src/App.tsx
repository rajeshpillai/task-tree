import { useCallback, useState } from "react";
import { Button, Toaster, ToastAction, toast } from "@algorisys/zen-ui-react";
import { ProjectPicker } from "./components/ProjectPicker";
import { StageEditor } from "./components/StageEditor";
import { TaskGrid } from "./components/TaskGrid";
import { UserEditor } from "./components/UserEditor";
import { useProjectData } from "./state/useProjectData";

export function App() {
  const data = useProjectData();
  const { addTask, deleteTask } = data;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newTaskId, setNewTaskId] = useState<string | null>(null);

  /**
   * The grid, not this component, knows what is hiding a row and which cell
   * takes the caret. It only needs to be told which task is the new one.
   *
   * The handlers below are memoized because the grid rebuilds its column
   * definitions whenever one changes identity, and TanStack renders a cell
   * renderer as a component: a rebuild remounts every cell and throws away the
   * open title editor. Inline arrows here would close it on the next render.
   */
  const handleAdd = useCallback(
    async (parentId: string | null) => {
      const task = await addTask(parentId);
      if (task) setNewTaskId(task.id);
    },
    [addTask],
  );

  const handleDelete = useCallback(async (id: string) => {
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
  }, [deleteTask]);

  const forgetNewTask = useCallback(() => setNewTaskId(null), []);

  return (
    <main className="zen-mx-auto zen-flex zen-max-w-6xl zen-flex-col zen-gap-4 zen-p-6">
      <h1 className="zen-text-2xl zen-font-semibold">Task Tree</h1>

      <header className="zen-flex zen-flex-wrap zen-items-end zen-justify-between zen-gap-4">
        <ProjectPicker
          projects={data.projects}
          currentId={data.project?.id ?? null}
          onSelect={(id) => void data.selectProject(id)}
          onCreate={(name) => void data.createProject(name)}
        />
        <div className="zen-flex zen-items-center zen-gap-2">
          <Button variant="outline" onClick={() => setSettingsOpen((open) => !open)}>
            {settingsOpen ? "Hide settings" : "Settings"}
          </Button>
          <Button onClick={() => void handleAdd(null)} disabled={data.loading || !data.project}>
            Add task
          </Button>
        </div>
      </header>

      {settingsOpen && (
        <div className="zen-grid zen-gap-6 zen-rounded-zen-md zen-border zen-border-zen-border zen-p-4 md:zen-grid-cols-2">
          <StageEditor
            stages={data.stages}
            onRename={(id, name) => void data.renameStage(id, name)}
            onRecolor={(id, color) => void data.recolorStage(id, color)}
            onAdd={(name, color) => void data.addStage(name, color)}
            onDelete={data.deleteStage}
          />
          <UserEditor users={data.users} onAdd={(name, color) => void data.addUser(name, color)} />
        </div>
      )}

      {data.error ? (
        <p role="alert">Could not open your tasks: {data.error.message}</p>
      ) : (
        <TaskGrid
          tasks={data.tasks}
          stages={data.stages}
          users={data.users}
          loading={data.loading}
          onRenameTask={data.renameTask}
          onAddSubtask={handleAdd}
          onMoveTask={data.moveTask}
          onIndentTask={data.indentTask}
          onOutdentTask={data.outdentTask}
          onDeleteTask={handleDelete}
          onAssign={data.setTaskAssignee}
          onSetStage={data.setTaskStage}
          onSetPriority={data.setTaskPriority}
          newTaskId={newTaskId}
          onNewTaskRevealed={forgetNewTask}
        />
      )}

      <Toaster />
    </main>
  );
}
