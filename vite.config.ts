import { defineConfig } from "vite";

// Source lives in game/, the build goes to docs/ so GitHub Pages
// can serve it from the branch with "Source: /docs".
// Paths in build.outDir resolve from root, so ../docs is the repo's docs/.
export default defineConfig({
  root: "game",
  base: "./",
  build: {
    outDir: "../docs",
    emptyOutDir: true,
  },
});
