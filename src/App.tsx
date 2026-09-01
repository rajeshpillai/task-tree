import { useState } from "react";
import { Button, Toaster, ToastAction, toast } from "@algorisys/zen-ui-react";
import { ProjectPicker } from "./components/ProjectPicker";
import { StageEditor } from "./components/StageEditor";
import { TaskGrid } from "./components/TaskGrid";
import { UserEditor } from "./components/UserEditor";
import { useProjectData } from "./state/useProjectData";

export function App() {
  const data = useProjectData();
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function handleDelete(id: string) {
    const result = await data.deleteTask(id);
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
          <Button onClick={() => void data.addTask(null)} disabled={data.loading || !data.project}>
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
          onAddSubtask={(parentId) => void data.addTask(parentId)}
          onMoveTask={(id, delta) => void data.moveTask(id, delta)}
          onIndentTask={(id) => void data.indentTask(id)}
          onOutdentTask={(id) => void data.outdentTask(id)}
          onDeleteTask={(id) => void handleDelete(id)}
          onAssign={(id, assigneeId) => void data.setTaskAssignee(id, assigneeId)}
          onSetStage={(id, stageId) => void data.setTaskStage(id, stageId)}
        />
      )}

      <Toaster />
    </main>
  );
}
