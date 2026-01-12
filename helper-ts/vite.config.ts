import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  base: "/helper-shift/",
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../packages/helper-ts/src"),
    },
  },
  build: {
    outDir: "../public/helper-shift",
    emptyOutDir: true,
  },
});
