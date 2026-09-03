# Implementation Log

## Project setup and planning

**Status:** live at https://rajeshpillai.github.io/task-tree/. Tasks 1-7 and 9 complete; task 8 (export/import) remains.

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

**A new task opens itself for naming.** Asked for on 3 September 2026. Adding
a subtask to a collapsed row appeared to do nothing, so the grid now opens
every collapsed ancestor of a new task, clears an active search that would
filter it out, and puts the caret in its title with the placeholder selected.
The grid is told only which task is new; it owns the question of what was
hiding the row and which cell takes the caret.

**A cell that owns state cannot depend on the column definitions.** TanStack
renders a `cell` renderer *as a component*, so rebuilding the columns array
hands React a new component type and remounts every cell in the grid. The
first cut of the auto-focus put the target row's id in the columns memo, which
remounted the very cell it had just told to open an editor, and the editor
closed as fast as it opened. The signal now travels by context, the columns
memo depends on nothing that changes mid-edit, and App's grid handlers are
memoized rather than inline arrows. That last part also fixes a bug that
predates this feature: any App render used to close an open title editor.

**The reveal happens during render, not in an effect.** An effect runs after
the commit, so the row would paint collapsed and then open, and paint as plain
text and then swap to an input. A render-phase state adjustment is React's
documented answer for reacting to a changed prop, and oxlint's
`set-state-in-effect` rule points the same way.

**Priority is a fixed scale in code, not editable data.** Asked for on 3
September 2026. Stages live in a store because a team renames them; High,
Medium and Low are a scale, so `PRIORITIES` is a constant. Its colour is not in
there either: that is presentation, it has to differ per theme, and it lives
with the tokens in index.css.

**One hex cannot colour-code both themes.** The first cut used badge hues, and
amber measured 1.89:1 against its own chip on the white page — under the 3:1
WCAG 1.4.11 asks of a control's boundary. A hue light enough to read on the
dark ground is exactly the hue that vanishes on the light one, so each priority
is a token pair, dark-on-light and light-on-dark, every one clearing 4.9:1.

**A `<select>` hands its background-color to the OS popup.** The wash was
translucent so it would composite over either theme's surface, which is right
for the control's own face and wrong for the option list: the popup composites
over a light canvas rather than over the page, so in dark mode a 16% amber came
out cream while the option text stayed the theme's near-white. Reported as a
contrast bug and confirmed by measurement. The wash is now mixed opaquely
against `--zen-color-background`, so the colour the popup inherits is dark in
dark mode and light in light mode and always agrees with the text on it. The
rule this leaves behind: never give a form control a translucent background.

**The v2 migration branches on `oldVersion`.** The original `upgrade` assumed a
first run, which is fine at version 1 and destructive at version 2 — anyone
already using the app has v1 tasks on disk. Store creation and the seed now sit
behind `oldVersion < 1`, and the priority backfill walks the task store with a
cursor, skipping rows that already have one so a re-entered migration is a
no-op.

**The subtask count shows direct children, with the total only when it
differs.** A collapsed chevron says something is below but not how much. The
visible number is the direct children because that is what expanding reveals;
the accessible name adds "N in total" only when the subtree runs deeper than
one level, since otherwise it says the same figure twice.

**The subtask badge's colour carries the subtree's size.** Asked for on 3
September 2026, delegated to a second agent working only on the badge. Teal,
because red/amber/slate are priority and slate/indigo/emerald are the default
stages, so anything from those families would read as urgency or workflow
state. The ink holds still and only the wash deepens, in three steps rather
than a continuum: nobody can tell an 18% chip from a 21% one, and holding the
ink still keeps the number equally legible at every step instead of trading
legibility for the signal. It took two tokens, not one — a wash of the ink
itself went grey-green at the heavy end.

The measurements were reproduced independently of the agent that made the
change, including a check that every colour in the stack is opaque
(compositing over white and black gives identical pixels). That matters here
because grid rows have their own hover background: a translucent chip is not
read at the contrast it was measured at.

### Blocked

Nothing blocked. The repo was made public on 2 September 2026, which unblocks
GitHub Pages.
