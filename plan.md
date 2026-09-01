# Task Management (Tabular form + Treeview for subtasks)

The goal is to build a spreadsheet like application to manage my tasks.

- A spreadsheet like interface
- A task can have many subtasks
- A task can be assigned to a user
- A task belongs to a stage (todo, inprogress, completed etc). These stages can be customized per project
- A task belongs to a project

This application will be statically hosted on GitHub Pages.

---

## Decisions

**Grid is zen-ui `TreeTable`, not `SpreadsheetGrid`.** TreeTable gives typed
columns with expandable subtask rows via `getSubRows`, plus sorting, global
filter, row selection and virtualization. Tasks stay records with a `parentId`
rather than becoming cells. SpreadsheetGrid is a formula engine (`CellMap`,
`SheetCalculator`, A1 refs) and would make nesting a visual convention instead
of real data.

**Users are local labels, not accounts.** Static hosting plus IndexedDB means
no server, no auth, no sync. Data lives in one browser profile on one machine.
An assignee is a name you define and pick from, useful for filtering and
grouping, but nobody else ever sees it. Real multi-user assignment would need
a backend and is out of scope.

**Export and import ships in v1.** IndexedDB is the only copy. Clearing site
data or switching machines loses everything, so JSON round-trip is a v1
feature, not a nice-to-have.

**Theme is zen-ui's `zen-theme`.** The suite ships `default`, `zen-theme`,
`dark` and `paper`.

**Nesting is unlimited depth.** `getSubRows` recurses anyway. Reparenting
guards against cycles.

**Deleting a parent deletes its subtree**, offered with an undo toast. Moving a
task to another project moves its whole subtree with it.

## Data model

One IndexedDB database `task-tree`, version 1, four object stores.

```ts
Project { id, name, createdAt }
Stage   { id, projectId, name, color, order }
User    { id, name, color }
Task    { id, projectId, parentId | null, title, notes,
          assigneeId | null, stageId, order, dueDate | null,
          createdAt, updatedAt }
```

Indexes: `tasks.by-project` on `projectId`, `stages.by-project` on
`projectId`. There is deliberately no `by-parent` index: IndexedDB skips any
record whose key path value is null, so every root task would be missing from
it. A project's tasks are read flat and nested in memory, which that index was
never needed for. `src/db/open.test.ts` pins this behaviour so the reasoning
does not have to be rediscovered.

An index `getAll` returns index-key then primary-key order, and ids are random
UUIDs, so rows arrive shuffled. The repo sorts by `order` on the way out.

`order` is a float so a drag between two rows is a midpoint write, not a
renumber of the whole sibling list. Ids come from `crypto.randomUUID()`, no
uuid dependency (LOOPS.md VIII).

The store loads a project's tasks flat and assembles the tree in memory.
TreeTable wants a nested shape; IndexedDB wants flat rows with an index. One
`buildTree(tasks)` function is the seam between them and is pure, so it tests
without a database.

## Contract

The build is done when every one of these passes. Each is a test, not a vibe.

**Storage**
1. Opening the app with an empty database creates a default project with
   stages Todo, In progress, Completed.
2. A task written to IndexedDB is readable after a full page reload.
3. `buildTree` turns a flat list into a nested one, parents before children.
4. `buildTree` on an empty list returns an empty array, not a crash.
5. A task whose `parentId` points at a missing task surfaces at the root
   rather than vanishing.
6. Schema version 1 opens cleanly against an empty IndexedDB and against an
   existing one.

**Tasks**
7. Creating a task puts it in the current project at the root.
8. Creating a subtask nests it under its parent and the parent shows an
   expand control.
9. Editing a title inline persists on blur and survives a reload.
10. Deleting a parent deletes its entire subtree.
11. Undo after a delete restores the whole subtree, not just the parent.
12. Reparenting a task onto one of its own descendants is rejected.
13. Moving a task to another project moves its descendants too.
14. Reordering between two siblings writes a midpoint `order` and touches no
    other row.

**Stages and users**
15. Stages are per project, so renaming a stage in project A does not change
    project B.
16. Deleting a stage that has tasks is blocked with a message naming the
    count.
17. A task can be unassigned, and unassigned rows still render.
18. Assigning a user updates the row without a full grid re-render.

**Grid**
19. Expand and collapse state survives a sort.
20. The global filter matches on title and keeps matching rows' ancestors
    visible, so a match never appears orphaned.
21. Sorting by stage orders by the stage's `order`, not alphabetically.
22. An empty project renders an empty state, not a bare header.
23. 1000 tasks render without dropped frames, virtualization on
    (LOOPS.md XXXIX).

**Export and import**
24. Export produces JSON containing every project, stage, user and task.
25. Importing an export into an empty database reproduces it exactly.
26. Importing malformed JSON fails with a message and leaves existing data
    untouched.

**Ship**
27. `npm run build` emits to `dist/` with `base: "/task-tree/"`.
28. The deployed Pages URL loads, creates a task, and keeps it across a
    reload.
29. Coverage is at or above 80% (LOOPS.md XII).

## Tasks

```
Task: 1-scaffold
  Files: package.json, vite.config.ts, tsconfig.json, index.html, src/main.tsx
  Action: Vite React-TS scaffold. Vitest + jsdom + @testing-library/react +
          fake-indexeddb. v8 coverage with an 80% threshold that fails the run.
          base: "/task-tree/".
  Verify: npm test passes with one trivial test; npm run build emits dist/
  Done:   Empty app renders, test and build commands both green

Task: 2-zen-ui
  Files: .gitmodules, vendor/zen-ui, vite.config.ts, tsconfig.json, src/App.tsx
  Action: Add zen-ui as a submodule, bun install, bun run build:lib. Wire the
          three aliases longest-first, dedupe react and react-dom, extend
          server.fs.allow, add the tsconfig path. Render one zen-ui Button.
  Verify: Dev server shows a styled Button; tsc resolves the import
  Done:   zen-ui components import and render with styles applied

Task: 3-db
  Files: src/db/schema.ts, src/db/open.ts, src/db/tasks.ts, src/db/*.test.ts
  Action: IndexedDB open and upgrade, the four stores and their indexes, CRUD
          for each. Raw browser API behind this module, no wrapper dep.
  Verify: Tests against fake-indexeddb
  Done:   Contract 1, 2 and 6 pass (3-5 are buildTree, task 4)

Task: 4-tree
  Files: src/lib/tree.ts, src/lib/tree.test.ts
  Action: buildTree, flattenTree, isDescendant, midpoint ordering. Pure
          functions, no database.
  Verify: Unit tests including the cycle and orphan cases
  Done:   Contract 3, 4, 5, 12, 14 pass

Task: 5-grid
  Files: src/components/TaskGrid.tsx, src/components/TaskGrid.test.tsx
  Action: TreeTable wired to the store. Columns for title, assignee, stage,
          due date. Inline title edit, expand/collapse, sort, global filter,
          virtualization on.
  Verify: Testing Library, plus 1000-row render timing
  Done:   Contract 19-23 pass

Task: 6-crud-ui
  Files: src/components/TaskGrid.tsx, src/components/TaskRowMenu.tsx, tests
  Action: Add task, add subtask, delete subtree with undo toast, drag to
          reorder and reparent via dnd-kit.
  Verify: Testing Library covering delete, undo, and the cycle rejection
  Done:   Contract 7-14 pass

Task: 7-projects-stages
  Files: src/components/ProjectPicker.tsx, src/components/StageEditor.tsx, tests
  Action: Project switcher, per-project stage CRUD with ordering and colors,
          the local user list.
  Verify: Tests for per-project isolation and the in-use stage delete block
  Done:   Contract 15-18 pass

Task: 8-export-import
  Files: src/lib/backup.ts, src/lib/backup.test.ts, src/components/BackupMenu.tsx
  Action: JSON export via a Blob download, import with validation and a clear
          failure path that does not touch existing data.
  Verify: Round-trip test, malformed-input test
  Done:   Contract 24-26 pass

Task: 9-deploy
  Files: .github/workflows/pages.yml
  Action: Actions workflow building and publishing to Pages, submodule
          checkout included and zen-ui built in CI.
  Verify: Workflow green, deployed URL loads and persists a task
  Done:   Contract 27-28 pass
```

## Open before task 9

The repo is **private**, and GitHub Pages from a private repo needs a paid
plan. On Free it must be public:

```bash
gh repo edit rajeshpillai/task-tree --visibility public
```

zen-ui is PolyForm Noncommercial, so a public repo and a public Pages site are
fine for a personal or teaching project. Commercial use needs a license from
Algorisys.

CI has to check out the submodule (`submodules: recursive`) and build zen-ui
with bun before building the app, since the alias points at `dist` and `dist`
is not committed.
