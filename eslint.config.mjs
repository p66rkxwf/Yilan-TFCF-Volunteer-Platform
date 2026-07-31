import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
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
    // files 範圍需與 eslint-config-next 註冊 plugin 的範圍一致（16.2.x 起 plugin
    // 改為 files-scoped 註冊；無範圍的全域 rules 會在其他檔案上找不到 plugin 而報錯）。
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      // 無障礙（a11y）：在 eslint-config-next 已註冊的 jsx-a11y plugin 上補一組
      // 高價值規則。維持專案「先 warn、逐步收斂為 error」的慣例，不阻擋 lint。
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/interactive-supports-focus": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/mouse-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/anchor-is-valid": "warn",
      "jsx-a11y/no-autofocus": "warn",
    },
  },
];

export default eslintConfig;
