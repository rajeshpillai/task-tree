import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const here = dirname(fileURLToPath(import.meta.url));

// zen-ui is not on npm and its dist is gitignored upstream, so it cannot be a
// package.json dependency. The source is vendored as a submodule and we point
// straight at the dist it builds. Missing dist => npm run zen.
const zenDist = resolve(here, "vendor/zen-ui/packages/react/dist");

export default defineConfig({
  // GitHub Pages serves this at /task-tree/, not at the domain root.
  base: "/task-tree/",
  plugins: [react()],
  resolve: {
    // One React instance across the package boundary, or hooks break in ways
    // that look like a component bug rather than a duplicated runtime.
    dedupe: ["react", "react-dom"],
    // Longest first: a string `find` also matches subpaths, so a bare
    // "@algorisys/zen-ui-react" listed first would rewrite the stylesheet
    // import to ".../index.js/styles".
    alias: [
      { find: "@algorisys/zen-ui-react/preflight", replacement: `${zenDist}/preflight.css` },
      { find: "@algorisys/zen-ui-react/styles", replacement: `${zenDist}/style.css` },
      { find: "@algorisys/zen-ui-react", replacement: `${zenDist}/index.js` },
    ],
  },
  // Vite refuses to read outside the project root without this.
  server: { fs: { allow: [here, zenDist] } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
