import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    // 记录器的测试要建临时 git 仓库，多个测试文件并行时会比 5 秒默认值慢
    testTimeout: 20_000,
    include: ["src/**/*.test.ts", "worker/**/*.test.ts", "integrations/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
