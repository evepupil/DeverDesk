# Contributing to DeverDesk

**English** · [简体中文](#参与贡献)

Thanks for your interest in DeverDesk! Bug reports, ideas and pull requests are all welcome.

## Reporting bugs and suggesting features

- **Bugs:** open an issue with the steps to reproduce, what you expected, what happened, your browser, and whether you use the local or the cloud edition. Screenshots help a lot.
- **Ideas:** describe the problem you want solved before the solution; it makes it easier to find the right fit.
- **Security issues:** please do not open a public issue; follow [SECURITY.md](SECURITY.md).

## Development setup

You need Node.js 22+ and pnpm 10.

```bash
pnpm install
pnpm dev          # cloud edition: pages on :3000, API on :8787, local passcode "dev"
pnpm dev:local    # local edition only
```

See [Development](README.md#development) in the README for all commands.

## Before you open a pull request

Run the checks that apply to your change:

```bash
pnpm typecheck && pnpm lint && pnpm test   # always
pnpm build:local && pnpm probe             # interface changes (needs Microsoft Edge)
pnpm build && pnpm e2e                     # sign-in, sync or Worker changes
```

Continuous integration runs the type check, lint, unit tests and both builds on every pull request.

## Guidelines

- **TypeScript strict mode** everywhere, including the Worker.
- **Keep logic pure and tested.** Calculations belong in `src/domain/` with unit tests next to them (`*.test.ts`); components should stay thin.
- **All interface text goes into the dictionaries** in `src/i18n/messages/`. Add every new entry in both `zh-CN` and `en`; the types require matching keys, and a unit test fails on hard-coded Chinese outside the dictionaries.
- **Use the design tokens.** Colors, font sizes, spacing and radii come from `src/styles/tokens.css`; see the design spec in [docs/前端设计.md](docs/前端设计.md). Please don't hard-code values in components.
- **Keep the docs current.** If you change how a module behaves, update its document in `docs/模块设计/`.
- **Commits** use a short type prefix: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `ci:` or `chore:`.

## License

By contributing, you agree that your contributions are licensed under the [GNU AGPL v3.0](LICENSE), the same license as the project.

---

## 参与贡献

感谢关注 DeverDesk！欢迎提问题、提想法、提 Pull Request。

### 报问题、提建议

- **问题：** 提 Issue 时写清复现步骤、期望的结果、实际的结果、浏览器，以及用的是本地版还是在线版，最好附截图。
- **建议：** 先讲清想解决的问题，再说想要的做法，这样更容易找到合适的方案。
- **安全问题：** 请不要公开提 Issue，按 [SECURITY.md](SECURITY.md) 私下报告。

### 本地开发

需要 Node.js 22 以上和 pnpm 10。

```bash
pnpm install
pnpm dev          # 在线版：页面 :3000，接口 :8787，本地访问口令 dev
pnpm dev:local    # 只跑本地版
```

全部命令见中文 README 的 [本地开发](README.zh-CN.md#本地开发)。

### 提 Pull Request 之前

按改动范围跑对应的检查：

```bash
pnpm typecheck && pnpm lint && pnpm test   # 每次都跑
pnpm build:local && pnpm probe             # 改了界面（需要 Microsoft Edge）
pnpm build && pnpm e2e                     # 改了登录、同步或 Worker
```

每个 Pull Request 都会自动跑类型检查、代码检查、单元测试和两个版本的打包。

### 约定

- **TypeScript 严格模式**，Worker 也一样。
- **计算逻辑写成纯函数并配单元测试：** 放在 `src/domain/`，测试文件放在旁边（`*.test.ts`）；组件里尽量只做展示。
- **界面文字一律写进词条**（`src/i18n/messages/`），中文（`zh-CN`）和英文（`en`）都要加。类型检查要求两边的键一致，词条以外写死的中文会让单元测试失败。
- **用设计令牌：** 颜色、字号、间距、圆角都从 `src/styles/tokens.css` 取，规格见 [docs/前端设计.md](docs/前端设计.md)，不要在组件里写死数值。
- **文档跟着改：** 改了某个模块的行为，同步更新 `docs/模块设计/` 里对应的文档。
- **提交信息**用简短的类型前缀：`feat:`、`fix:`、`docs:`、`refactor:`、`test:`、`ci:`、`chore:`。

### 许可证

提交贡献即表示你同意这些贡献按本项目的 [GNU AGPL v3.0](LICENSE) 许可证发布。
