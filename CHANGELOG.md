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
