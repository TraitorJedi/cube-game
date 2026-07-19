import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        app: resolve(root, "index.html"),
        react: resolve(root, "react.html"),
      },
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          three: ["three"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
