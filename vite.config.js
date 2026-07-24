import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        app: resolve(root, "index.html"),
        legacy: resolve(root, "legacy.html"),
      },
      output: {
        manualChunks(id) {
          const moduleId = id.replaceAll("\\", "/");

          if (moduleId.includes("/node_modules/react/") ||
              moduleId.includes("/node_modules/react-dom/") ||
              moduleId.includes("/node_modules/scheduler/")) {
            return "react";
          }

          if (moduleId.includes("/node_modules/three/")) {
            return "three";
          }

          if (moduleId.includes("/node_modules/@supabase/")) {
            return "supabase";
          }
        },
      },
    },
  },
});
