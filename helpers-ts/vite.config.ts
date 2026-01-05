import { defineConfig } from "vite";

export default defineConfig({
  base: "/helpers/",
  build: {
    outDir: "../public/helpers",
    emptyOutDir: true,
  },
});
