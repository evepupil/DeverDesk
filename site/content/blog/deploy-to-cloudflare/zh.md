---
title: 五分钟把 DeverDesk 部署到你自己的 Cloudflare
description: Cloudflare 一键部署或命令行发布在线版。设置访问口令、绑定域名，再从本地版导出并导入备份。
date: 2026-09-28
tags: [guide]
cover: /blog/deploy-to-cloudflare.webp
coverAlt: DeverDesk 在线版部署在用户自己的 Cloudflare 账户中
author: DeverDesk
---

在线版把 DeverDesk 放在你的 Cloudflare 账号下运行。页面是静态文件，Worker 是运行接口的 Cloudflare 服务，D1 是 Cloudflare 的 SQLite 数据库。它们打包部署为一个 Worker；你的在线版收支数据保存在自己账号的 D1 中。

准备好 GitHub 和 Cloudflare 账号后，可以选一键部署，也可以在终端手动完成。Cloudflare 免费额度对一个人使用已经足够。标题里的五分钟是快速上手的目标，实际耗时会受账号授权和部署环境影响。

## 一键部署

打开[Cloudflare 一键部署入口](https://deploy.workers.cloudflare.com/?url=https://github.com/evepupil/DeverDesk)，按向导完成四步：

1. 授权 GitHub。Cloudflare 会在你的账号下复制一份仓库；之后向这个副本推送代码时，它会自动重新部署。
2. Cloudflare 为部署创建 D1 数据库。
3. 设置 `DEVERDESK_PASSWORD`。这是打开工作台时输入的访问口令。
4. 等构建完成，打开分配给你的 `*.workers.dev` 地址并登录。

设置好访问口令之后，在线版会使用它作为默认登录方式。登录一次会保持 30 天；同一 IP 连续输错 10 次后，会锁定 15 分钟。改访问口令会让所有设备退出登录。部署配置和更新方式也列在[中文 README](https://github.com/evepupil/DeverDesk/blob/main/README.zh-CN.md)中。

## 用命令行部署

手动方式需要 Node.js 22 以上和 pnpm 10。下面是仓库说明里的完整命令顺序：

```bash
git clone https://github.com/evepupil/DeverDesk.git
cd DeverDesk
pnpm install
pnpm exec wrangler login                          # 登录你的 Cloudflare 账号
pnpm build
pnpm run deploy                                   # 先建表，再部署 Worker
pnpm exec wrangler secret put DEVERDESK_PASSWORD  # 设置访问口令（输入时不显示）
```

首次运行 `pnpm run deploy` 时，Wrangler 会先创建所需数据库，再应用建表迁移并部署 Worker。注意命令必须写成 `pnpm run deploy`；单独运行 `pnpm deploy` 是 pnpm 自带的另一个命令。以后拉取新代码后，再运行 `pnpm build && pnpm run deploy` 更新。

## 两种登录方式和自己的域名

默认使用访问口令。另一种方式是 Cloudflare Access：把 Worker 放到 Access 后面，并设置 `ACCESS_TEAM_DOMAIN` 和 `ACCESS_AUD`。通过 Access 登录的人会直接进入工作台，不需要再输入口令。一个用于管理 Cloudflare 访问的部署说明也可以在[仓库](https://github.com/evepupil/DeverDesk/blob/main/README.zh-CN.md)查看。

如果希望用自己的域名，在 Cloudflare 后台打开 **Workers & Pages → 你的 Worker → Settings → Domains & Routes**，给该 Worker 添加自定义域名。绑定之后，继续从这个地址访问你的在线工作台。

## 从本地版搬入已有记录

本地版和在线版使用同一套代码，切换版本时数据需要通过备份迁移。在本地版头像菜单中选择「导出备份」，然后打开自己部署的在线版，在头像菜单选择「导入备份」并选中刚导出的文件。迁移后，在线版会把导入的记录加入同步流程。

演示站 [app.deverdesk.com](https://app.deverdesk.com) 运行的是本地版，数据只留在当前浏览器，不能代替自己的在线部署。想先比较两种版本，可以读[数据存在哪里](/zh/blog/local-vs-cloud/)；想了解为什么项目、时间和收支要连在一起，见[产品介绍](/zh/blog/why-deverdesk/)。

部署完成后，你拥有一套由自己 Cloudflare 账号托管的工作台。记得保存好访问口令，并确认从本地迁移时选的是正确的备份文件。

## 部署前后可以逐项核对

一键部署时，先确认授权的是自己准备长期使用的 GitHub 账号。Cloudflare 会在这个账号关联的流程里复制仓库，之后该副本的代码更新会触发重新部署。访问口令由你设置，适合在创建 Worker 时就准备好并妥善保存。命令行部署则先登录 Cloudflare，再由构建和部署命令发布页面与接口；第一次部署会创建数据库并应用表结构迁移。

部署后，先访问 `*.workers.dev` 地址，用访问口令进入工作台。如果你启用 Cloudflare Access，就按 README 设置团队域名和应用的 Audience 标签，再通过 Access 登录。使用自定义域名时，从 Worker 的 Domains & Routes 添加，不需要改变应用里记录数据的方式。后续发布新版本时，按 README 拉取代码、重新构建并部署。

本地版和在线版的备份往返适合把已有记录搬过去。导出前，在本地版确认当前数据属于这个浏览器；导入时在自己的在线工作台选择对应的备份文件。演示站中的样例数据属于演示环境，若你只想迁移自己的记录，先确认导出的文件就是你的工作数据。更多数据位置差异见[本地版和在线版对比](/zh/blog/local-vs-cloud/)。

## 选适合自己的部署方式

如果希望少碰命令行，一键流程会代你创建仓库副本和 D1 数据库；如果希望自己控制代码更新，也可以使用手动步骤。两种方式最终部署的是同一套在线版：静态页面与 Worker 一起运行，D1 保存云端记录。改用 Access 或自定义域名属于登录和访问入口的配置，数据库仍在你自己的 Cloudflare 账号中。

遇到需要更新部署的情况，可以回到 README 对照完整步骤和环境要求。不要把口令写进公开仓库；`wrangler secret put` 会在输入时隐藏内容。部署好后，也可以继续阅读[时薪计算方法](/zh/blog/hourly-rate/)，了解上线后如何把到账记录和投入时间放在一起查看。