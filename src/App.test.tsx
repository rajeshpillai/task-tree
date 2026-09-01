import { IDBFactory } from "fake-indexeddb";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { closeDb, openDb } from "./db/open";
import { projects, stages, tasks } from "./db/repo";
import { newId, type Task } from "./db/schema";

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

describe("App", () => {
  it("shows the seeded project as the selected one once the database opens", async () => {
    render(<App />);
    // The select renders before the projects load, so wait for the option
    // rather than for the control.
    await screen.findByRole("option", { name: "My tasks" });
    expect(screen.getByLabelText("Project")).toHaveDisplayValue("My tasks");
  });

  it("opens on the seeded sample tasks rather than an empty grid", async () => {
    render(<App />);
    expect(await screen.findByText("Launch the new landing page")).toBeInTheDocument();
  });

  it("renders tasks that are already stored", async () => {
    await openDb();
    const [project] = await projects.all();
    const [stage] = await stages.byProject(project.id);
    const now = Date.now();
    const task: Task = {
      id: newId(),
      projectId: project.id,
      parentId: null,
      title: "Already here",
      notes: "",
      assigneeId: null,
      stageId: stage.id,
      order: 0,
      dueDate: null,
      createdAt: now,
      updatedAt: now,
    };
    await tasks.put(task);

    render(<App />);
    expect(await screen.findByText("Already here")).toBeInTheDocument();
  });

  it("reports a failure to open the database instead of rendering an empty grid", async () => {
    await closeDb();
    // No stores and no seeded project, so the load throws on the missing row.
    globalThis.indexedDB = new IDBFactory();
    const broken = indexedDB.open("task-tree", 1);
    await new Promise((r) => (broken.onsuccess = r));
    broken.result.close();

    render(<App />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
