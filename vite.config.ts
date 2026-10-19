import { defineConfig } from "vite";
export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/vanilla/" : "/",
  // WebLLM uses dynamic imports; ES-module workers keep code-splitting working (iOS 15+ supports them).
  worker: { format: "es" },
  build: { outDir: "dist", chunkSizeWarningLimit: 7000 }
});
