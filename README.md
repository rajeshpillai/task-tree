# Task Tree

A task manager where tasks nest. Tabular like a spreadsheet, with subtasks
expanding in place. Everything is stored in your browser with IndexedDB, so
there is no server and no account.

**Live: https://rajeshpillai.github.io/task-tree/**

## What it does

- Tasks nest to any depth, with expand and collapse in the grid
- Assign people, set a stage, set a due date, all inline
- Stages are per project, so a project can carry its own workflow
- Search matches on title and keeps a match's parents visible
- Delete a task and its whole subtree goes, behind an undo
- Handles a thousand tasks without slowing down, via row virtualization

Everything lives in one browser profile on one machine. There is no sync and
no sharing: an assignee is a label for filtering, not an account.

## Running it

zen-ui is not published to npm, so it is vendored as a submodule and the app
compiles against the dist it builds.

```bash
git clone --recurse-submodules https://github.com/rajeshpillai/task-tree
cd task-tree
npm run zen      # builds vendor/zen-ui (needs bun)
npm install
npm run dev
```

`npm run zen -- --update` moves the submodule pin to the latest `dev` and
rebuilds. Commit `vendor/zen-ui` afterwards or the change is yours alone.

```bash
npm test         # vitest
npm run coverage # with an 80% floor
npm run build    # typecheck and bundle
```

## Built with

React 19 and TypeScript on Vite, [zen-ui](https://github.com/Algorisys-Technologies/zen-ui)
for components, IndexedDB for storage, Vitest for tests.

zen-ui is licensed under PolyForm Noncommercial 1.0.0.
