# DeverDesk for Claude Code

## Install

```bash
claude plugin marketplace add evepupil/DeverDesk
claude plugin install deverdesk@deverdesk
```

## Configure

Enter your DeverDesk address without a trailing slash. Create an access token from the avatar menu → Connect AI and choose the Write permission.

## What it does

The plugin records coding time and completed tasks automatically. It uploads activity only from directories you bind to a DeverDesk project.

After you publish a release, Claude Code marks the matching milestone as done when exactly one pending milestone fits by name or version. If none fits or several could, it asks you first. You can undo it in DeverDesk's AI activity.

## Bind a folder

Tell Claude Code: “Link this folder to DeverDesk.” It will ask which side project to use or create one for this folder.

## Check setup

Run `deverdesk-recorder doctor` in Claude Code.

## Known limitations

Node.js 18 or later must be available on `PATH`. Tasks usually appear in DeverDesk about 15 minutes after a commit. See [the integration design](../../docs/模块设计/编程记录接入.md) for details.

## Privacy

Local event logs stay on your computer; only activity from bound directories is uploaded.

# Claude Code 版 DeverDesk

## 安装

```bash
claude plugin marketplace add evepupil/DeverDesk
claude plugin install deverdesk@deverdesk
```

## 配置

DeverDesk 地址填写云端地址，不要带结尾斜杠。访问令牌在头像菜单 → 连接 AI 中创建，权限选择「直接改」。

## 功能

插件会自动记录工时和已完成任务；只上传已绑定到 DeverDesk 副业的目录。

发布之后，如果恰好有一个待完成的里程碑在名字或版本号上对得上，Claude Code 会把它标成完成；对不上或有几个候选，会先问你。标错了可以在 DeverDesk 的 AI 动态里撤销。

## 绑定目录

对 Claude Code 说：「把这个项目加进 DeverDesk」，再选择已有副业或创建一个。

## 自检

运行 `deverdesk-recorder doctor`。

## 已知限制

需要 Node.js 18 或更高版本。提交后任务通常约 15 分钟才会出现在 DeverDesk。详情见[接入设计文档](../../docs/模块设计/编程记录接入.md)。

## 隐私

本机事件日志保留在电脑上，只有绑定目录的活动会上传。
