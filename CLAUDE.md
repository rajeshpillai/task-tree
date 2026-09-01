# Rules for this project

A task tree app. Tasks nest into a tree, stored locally in the browser.

## Tech stack

- **React 19** with **TypeScript**
- **Vite** for dev server and build
- **Vitest** + jsdom + @testing-library/react for tests, v8 for coverage
- **zen-ui** for components, React binding, vendored as a git submodule (see below)
- **IndexedDB** for storage. Use the browser API directly behind one local
  module (`src/db/`). Do not add `idb` or Dexie unless that module gets
  genuinely unwieldy, and say why if you do (LOOPS.md VIII).

React 19 is the target because zen-ui's React binding peers on `^18 || ^19`.

## zen-ui

Source: https://github.com/Algorisys-Technologies/zen-ui (v12.0.1)
Package: `@algorisys/zen-ui-react`, Radix-backed.

**It is not on npm.** `npm i @algorisys/zen-ui-react` returns 404. It is
vendored here as a git submodule and resolved by a Vite alias pointing at its
built `dist`. Nothing is installed into `node_modules`.

**License is PolyForm Noncommercial 1.0.0.** Free for personal, learning and
research use. Commercial use needs a separate license.

### Setup

```bash
git submodule add https://github.com/Algorisys-Technologies/zen-ui vendor/zen-ui
cd vendor/zen-ui && bun install
cd packages/react && bun run build:lib
```

The zen-ui repo is a bun workspace, so its own build needs `bun`. The app
itself does not.

### vite.config.ts

```ts
const zenDist = resolve(__dirname, "vendor/zen-ui/packages/react/dist");

resolve: {
  dedupe: ["react", "react-dom"],
  alias: [
    { find: "@algorisys/zen-ui-react/preflight", replacement: `${zenDist}/preflight.css` },
    { find: "@algorisys/zen-ui-react/styles",    replacement: `${zenDist}/style.css` },
    { find: "@algorisys/zen-ui-react",           replacement: `${zenDist}/index.js` },
  ],
},
server: { fs: { allow: [__dirname, zenDist] } },
```

### tsconfig.json

```jsonc
"baseUrl": ".",
"paths": {
  "@algorisys/zen-ui-react": ["vendor/zen-ui/packages/react/dist/index.d.ts"]
}
```

### Four things that will bite

1. **Alias order is load-bearing.** A string `find` also matches subpaths, so
   the bare `@algorisys/zen-ui-react` entry would swallow `/styles` and
   `/preflight` and rewrite them to `.../index.js/styles`. Longest first.
2. **`dedupe` is not optional.** Two copies of React across the boundary breaks
   hooks, and it looks like a component bug rather than a duplicate runtime.
3. **The alias points at `dist`, not `src`.** After changing anything inside
   `vendor/zen-ui`, re-run `bun run build:lib` or the edit is invisible.
4. **Do not `npm install` the submodule directory.** zen-ui depends on
   `@algorisys/zen-ui-core` with the `workspace:*` protocol, which only
   resolves inside its own monorepo. The alias route sidesteps this because
   core is inlined at build time.

Radix, dnd-kit, TanStack Table, zod and the rest of zen-ui's dependencies are
bundled into `dist`, so the app installs none of them. Only `react` and
`react-dom` are externalized.

Chart, RichText, Map and Camera lazy-load optional peers (`recharts`,
`jodit-pro-react`, `leaflet`, `react-leaflet`, `react-webcam`,
`@monaco-editor/react`, `katex`, `pdfjs-dist`). Install one only when a
component that needs it is actually used.

### Importing

```tsx
import { Button, Dialog } from "@algorisys/zen-ui-react";
import "@algorisys/zen-ui-react/styles";
```

## Testing

Tests live next to the code as `*.test.ts` / `*.test.tsx`. Run `npm test`.
Coverage floor is 80% per LOOPS.md XII. IndexedDB needs `fake-indexeddb` under
jsdom, since jsdom does not implement it.

## Working rules

Follow LOOPS.md for coding practices. Two of its rules matter most here
because this project has no long history to fall back on:

- **CHANGELOG.md** (XXIV). Every functional change, timestamped.
- **IMPLEMENT.md** (XXV). What was decided in conversation and what got built.

Both live at the project root.
