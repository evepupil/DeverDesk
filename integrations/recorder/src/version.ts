/**
 * 记录器的版本号，只在这里写一份：命令行的 --version、上传请求里的客户端版本、
 * 请求头里的 User-Agent、被拒绝任务的「下个版本再试」都用它。
 * 插件清单（integrations/claude-code/.claude-plugin/plugin.json）里的版本号要和它一致，
 * integrations/claude-code/plugin.test.ts 有一条单测核对。
 * Claude Code 靠清单里的版本号判断插件有没有更新，改了记录器或插件内容就要一起升版本号。
 */
export const RECORDER_VERSION = "0.1.1"
