import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // DB 測試共用同一個 Postgres，平行跑會互相干擾（併發搶名額那題尤其）。
    // 測試很少、跑得快，序列化最單純。
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
