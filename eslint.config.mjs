import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // wrangler 本地运行时生成的打包文件和 Worker 类型声明
    ".wrangler/**",
    "worker/worker-configuration.d.ts",
    // 官网是独立的子项目，有自己的代码检查配置
    "site/**",
    // 派活用的临时脚本和任务书（不进仓库）
    ".fleet/**",
  ]),
]);

export default eslintConfig;
