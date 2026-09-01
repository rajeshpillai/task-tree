# Implementation Log

## Project setup and planning

**Status:** tasks 1-7 complete, deploying next

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

**buildTree loses nothing.** Orphans and cycles both surface at the root
instead of vanishing. Cycles are reachable through import of user-supplied
JSON, so this is a real case rather than a hypothetical one.

**Ordering degrades gracefully.** A float midpoint runs out of room after
roughly fifty splits of the same gap. Rather than let two rows share an order
and jump around, reorderSiblings renumbers the sibling list when the midpoint
collapses.

**First run is seeded with sample content.** Asked for during task 5. An
empty grid gives nothing to try the filter, sort or nesting against. Written
in the same upgrade transaction as the project and its stages.

**@tanstack/react-table is a dev dependency for types only.** A consequence of
the bundler-alias route: zen-ui bundles the runtime into its dist, but its
declarations still import the types, and without the package installed
ColumnDef resolves to `any` and column definitions go unchecked. Pinned to
8.21.3 to match what zen-ui bundles.

**Tests give jsdom a layout box rather than turning virtualization off.**
jsdom does no layout and ships no ResizeObserver, so a virtualizer measures a
zero-height scroller and renders nothing. Disabling virtualization in tests
would mean never testing the shipped configuration.

**No drag and drop in v1, by decision.** TreeTable exposes no row-level drag
hook, so dnd-kit cannot reach its rows without forking it. Reorder and reparent
ship as menu actions, which cover the same operations and work from the
keyboard. Drag goes upstream into zen-ui afterwards.

**Selects in the grid are the platform select, not Radix.** Radix drives its
controls from Pointer Events, which jsdom does not implement: a simulated click
never opens them, and each open costs tens of seconds of test time. The native
select is accessible and carries none of that.

### Blocked

Nothing blocked. The repo was made public on 2 September 2026, which unblocks
GitHub Pages.
