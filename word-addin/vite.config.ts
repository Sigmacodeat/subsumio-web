import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        taskpane: "src/taskpane.html",
      },
    },
  },
  server: {
    port: 3002,
    cors: true,
  },
});
