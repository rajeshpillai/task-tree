# Changelog

## [2026-09-02 00:30]
- Scaffolded the app: Vite 8 + React 19 + TypeScript 6, strict mode on.
- Test setup: Vitest 4 with jsdom, Testing Library, fake-indexeddb, and a v8
  coverage gate that fails the run below 80%.
- Vite `base` set to `/task-tree/` for GitHub Pages, and the zen-ui aliases
  wired ahead of the submodule landing.
- Vitest 3 pulls its own Vite 7 while the scaffold is Vite 8, which produced
  two incompatible Vite type trees and broke `tsc -b`. Upgraded to Vitest 4,
  whose peer range covers Vite 8, so the tree dedupes to one copy.
- Files: package.json, vite.config.ts, tsconfig.app.json, index.html,
  src/main.tsx, src/App.tsx, src/App.test.tsx, src/index.css, src/test/setup.ts

## [2026-09-02 00:34]
- Vendored zen-ui as a submodule at vendor/zen-ui, pinned to dev, over HTTPS so
  CI needs no deploy key.
- Added scripts/zen-ui-build.sh (npm run zen), which initialises the submodule
  if empty, builds the React binding, and checks all four files the Vite alias
  resolves by name actually exist.
- Wired the aliases and rendered a zen-ui Button, verified styled in a browser
  with a clean console.
- tsc could not see the two CSS side-effect subpaths, since the tsconfig path
  maps only the bare package entry and zen-ui's own styles.d.ts sits outside
  the program. Declared both in src/zen-ui-css.d.ts.
- Files: .gitmodules, vendor/zen-ui, scripts/zen-ui-build.sh, package.json,
  src/App.tsx, src/main.tsx, src/App.test.tsx, src/zen-ui-css.d.ts, .gitignore

## [2026-09-02 00:42]
- IndexedDB layer: schema types, database open with a seeded default project
  and its three stages, and CRUD for projects, stages, users and tasks.
- Dropped the planned tasks.by-parent index. IndexedDB skips records whose key
  path value is null, so every root task would have been missing from it. A
  test pins that behaviour so the reasoning survives.
- byProject now sorts by the order field. An index getAll returns index-key
  then primary-key order, and ids are random UUIDs, so seeded stages came back
  shuffled. Caught by a test, fixed in the repo rather than the assertion.
- Removed a null-transaction guard in onupgradeneeded. The spec guarantees a
  versionchange transaction for the whole callback, so it was unreachable.
- Scoped oxlint away from vendor/, which was linting the zen-ui submodule.
- Contract 1, 2 and 6 pass. 30 tests, coverage 98.97% statements, 100% branches.
- Files: src/db/schema.ts, src/db/open.ts, src/db/repo.ts, src/db/open.test.ts,
  src/db/open.failures.test.ts, src/db/repo.test.ts, .oxlintrc.json, plan.md

## [2026-09-02 00:47]
- Pure tree functions: buildTree, flattenTree, subtreeIds, isDescendant,
  canReparent, midpoint, reorderSiblings. No database, no React.
- buildTree never drops a task. An orphan whose parent is missing surfaces at
  the root, and a task caught in a parent cycle is detached and promoted
  rather than left unreachable and invisible.
- reorderSiblings normally writes one midpoint row. Floats run out of room
  after about fifty splits of one gap, and a collapsed midpoint would leave two
  rows sharing an order and jumping around, so it renumbers the sibling list
  when that happens. Both paths are tested, including fifty repeated splits.
- Contract 3, 4, 5, 12 and 14 pass. 71 tests, coverage 98.98% statements,
  96.42% branches.
- Files: src/lib/tree.ts, src/lib/tree.test.ts

## [2026-09-02 00:58]
- TaskGrid on zen-ui TreeTable: title, assignee, stage and due columns, inline
  title editing, expand/collapse, sort, global filter, virtualization.
- Seeded sample content on first run: 5 top-level tasks nesting three deep,
  three users, spread across the stages with due dates either side of today.
- Applied zen-theme via data-theme on the document element.
- Stage and due columns sorted descending on the first click, because TanStack
  defaults a numeric column that way. Clicking Stage put Completed first, so
  the workflow read backwards. Fixed with sortDescFirst: false.
- Filtering kept a match's ancestors visible but left them collapsed, so a
  search showed the parent and hid the row that matched. Everything expands
  while a search is active, and the user's own expansion returns on clear.
- jsdom does no layout and has no ResizeObserver, so the virtualizer measured
  a zero-height scroller and rendered no rows, making the grid look empty to
  every assertion. The test setup now gives elements a real box, so components
  are tested in the configuration they ship in.
- Installed @tanstack/react-table 8.21.3 as a dev dependency for types only.
  The runtime is bundled inside zen-ui's dist, but its declarations import
  those types, and without them ColumnDef silently degrades to any.
- Contract 19-23 pass. 100 tests, coverage 98.44% statements, 88.98% branches.
- Files: src/components/TaskGrid.tsx, src/components/TitleCell.tsx,
  src/state/useProjectData.ts, src/db/sample.ts, src/App.tsx, src/test/setup.ts,
  index.html, and their tests

## [2026-09-02 02:10]
- Task CRUD: add task, add subtask, delete a subtree with an undo toast, move
  up and down, indent and outdent, and move a subtree to another project.
- No drag and drop. TreeTable exposes no row-level drag hook, so dnd-kit cannot
  reach its rows without forking it. The same operations ship as menu actions.
- The first draft ran mutations inside a setState updater. StrictMode invokes
  those twice, so every add would have created two tasks under two ids.
  Rewritten to read from a ref that is updated in the same call as the state.
- Radix drives its menu trigger from Pointer Events, which jsdom does not
  implement, so a simulated click never opens the menu and the query hangs
  until the test times out rather than failing. Worse, each open costs tens of
  seconds of jsdom time. Row actions are now plain data (rowActions.ts) tested
  directly, with a single keyboard-driven open covering the Radix integration.
  Suite went from over three minutes to about 70 seconds.
- Row menu is non-modal: a modal menu locks body scroll and traps focus, which
  inside a virtualized grid freezes the table under it.
- Contract 7-14 pass. 133 tests.
- Files: src/state/useProjectData.ts, src/components/TaskRowMenu.tsx,
  src/components/rowActions.ts, src/components/TaskGrid.tsx, src/App.tsx,
  src/lib/tree.ts, src/test/setup.ts, and their tests

## [2026-09-02 02:20]
- Projects: switch between them and create new ones. A new project is seeded
  with the three default stages, since a project with no stages cannot hold a
  task.
- Stages: add, rename, recolour and remove per project. Removing a stage that
  tasks still point at is refused with the count, and the last stage cannot be
  removed at all, because a task always needs one.
- People: add someone, assign them from the row, or clear back to unassigned.
- Assignee and stage cells are the platform select (zen-ui NativeSelect), not
  the Radix one. It is accessible, and it does not carry the Pointer Events
  problem that makes Radix menus untestable and slow under jsdom.
- Stage writes had slipped back inside a state updater. Moved out, matching the
  task mutations.
- Contract 15-18 pass. 162 tests.
- Files: src/state/useProjectData.ts, src/components/ProjectPicker.tsx,
  src/components/StageEditor.tsx, src/components/UserEditor.tsx,
  src/components/TaskGrid.tsx, src/App.tsx, and their tests

## [2026-09-02 02:52]
- Deployed to GitHub Pages at https://rajeshpillai.github.io/task-tree/
- Workflow builds the zen-ui submodule with bun before installing the app,
  since the Vite alias points at a dist that is not committed and a checkout
  without it cannot build. Then lint, test, build, publish.
- Repo made public, which is what GitHub Pages needs on a free plan.
- Verified live: seeded content renders, a stage change survives a reload.
- Files: .github/workflows/pages.yml, README.md
