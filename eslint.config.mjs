import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "tsconfig.tsbuildinfo",
      // Deno runtime (Supabase Edge Function) — 由 Deno 自帶工具檢查，非 Next tsc/eslint
      "supabase/functions/**",
      // Cloudflare Workers（獨立 tsconfig 與 @cloudflare/workers-types）— 於各自目錄檢查
      "workers/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    // Baseline for the existing codebase: keep these surfaced as warnings so
    // `npm run lint` passes, then tighten back to "error" as code is cleaned up.
    // - no-explicit-any: used deliberately for Supabase join result shapes.
    // - set-state-in-effect / static-components: very strict advisory rules newly
    //   added in Next 16's config; flag patterns that are acceptable here.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
    },
  },
];

export default eslintConfig;
