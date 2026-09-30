import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// 单测只测数据和计算：语言选择、格式化、GitHub 数据解析、更新日志和博客内容（纯展示层不写单测）
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
