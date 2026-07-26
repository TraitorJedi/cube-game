import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/game/GameApp.jsx"],
    rules: {
      "react-hooks/refs": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "agent-files/**",
    "next-env.d.ts",
  ]),
]);
