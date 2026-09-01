# Implementation Log

## Project setup and planning

**Status:** tasks 1-3 complete

### Discussed and decided

**Stack.** React 19 + TypeScript on Vite, Vitest with jsdom for tests,
IndexedDB for storage, zen-ui for components. React 19 because zen-ui's React
binding peers on `^18 || ^19`.

**zen-ui gets vendored as a git submodule.** It is not published to npm
(`npm i @algorisys/zen-ui-react` returns 404). Of the five distribution routes
its README documents, the submodule plus bundler alias route was chosen. It
works because only `react`, `react-dom`, `react/jsx-runtime` and five optional
peers are externalized in its lib build; Radix, dnd-kit, TanStack Table and zod
are bundled into `dist`, so the app installs none of them.

**Grid is `TreeTable`, not `SpreadsheetGrid`.** "Spreadsheet like interface"
was ambiguous between the two components zen-ui ships. TreeTable was chosen:
tasks stay records with a `parentId` and nesting is real data. SpreadsheetGrid
is a formula engine where nesting would only be a visual indent convention.

**Users are local labels, not accounts.** Static GitHub Pages plus IndexedDB
means no server, no auth, no sync. An assignee is a name for filtering and
grouping within one browser profile. Real multi-user assignment would need a
backend and was ruled out of scope.

**Export and import is a v1 feature.** IndexedDB is the only copy of the data,
so a JSON round-trip is required before shipping, not deferred.

**Storage uses the raw IndexedDB API** behind one `src/db/` module. No `idb` or
Dexie unless that module becomes unwieldy (LOOPS.md VIII).

**LOOPS.md rules in force.** CHANGELOG.md (XXIV) and this file (XXV) were kept
explicitly. File-level backups (XXIII) stay in force alongside git;
`.gitignore` excludes them.

### Implemented

- `CLAUDE.md` rewritten with the stack, the full zen-ui submodule setup, and
  the four gotchas of the alias route.
- `plan.md` expanded from a feature sketch into a 29-item contract and nine
  numbered tasks with verify and done criteria.
- `.gitignore`, git repo initialized on `main`.
- GitHub repo created at https://github.com/rajeshpillai/task-tree (private).

**Theme is `zen-theme`.** Picked from the four zen-ui ships (`default`,
`zen-theme`, `dark`, `paper`) to match the "modern with a fun vibe" direction.
Applied at task 5, when the grid lands.

**No by-parent index on tasks.** IndexedDB skips any record whose key path
value is null, so root tasks (`parentId: null`) would silently vanish from
such an index. The plan already read a project's tasks flat and nested them in
memory, so the index was never load-bearing. A test pins the behaviour.

### Blocked

- **Task 9 (deploy).** The repo is private and GitHub Pages from a private
  repo requires a paid plan. Needs `gh repo edit rajeshpillai/task-tree
  --visibility public`, or confirmation of a Pro plan.
