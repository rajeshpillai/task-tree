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
