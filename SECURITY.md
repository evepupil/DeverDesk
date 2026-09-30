# Security Policy

**English** · [简体中文](#安全说明)

DeverDesk's cloud edition stores personal income and expense data, so we take security reports seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub instead: open the repository's **Security** tab and choose **Report a vulnerability**.

Please include:

- what is affected (the Worker API, sign-in, sync, access tokens, or the web app) and which edition;
- steps to reproduce, or a proof of concept;
- the impact you expect, for example reading or changing someone's data or bypassing sign-in.

We aim to acknowledge reports within a week and will keep you updated until a fix is released. Once it is fixed, we're happy to credit you unless you would rather stay anonymous.

## Supported versions

Security fixes land on the `main` branch. Self-hosted deployments get them by pulling the latest code and redeploying; if you used the one-click deploy, pushing the update to your copy of the repository redeploys it.

## Hardening your deployment

- Use a long, random passcode for `DEVERDESK_PASSWORD`. Changing it signs out every device.
- For stronger sign-in, put the Worker behind Cloudflare Access (see the README).
- Access tokens are shown once and stored only as hashes. Revoke tokens you no longer use.

---

## 安全说明

DeverDesk 在线版存的是个人收支数据，我们会认真对待每一份安全报告。

### 报告漏洞

请**不要公开提 Issue**，通过 GitHub 私下报告：打开仓库的 **Security** 页，点 **Report a vulnerability**。

请写清：

- 影响哪一部分（Worker 接口、登录、同步、访问令牌，还是网页本身），以及哪个版本；
- 复现步骤或验证代码；
- 可能造成的后果，比如读取或篡改别人的数据、绕过登录。

我们会尽量在一周内回复，并跟进到修复发布。修复后，除非你希望匿名，我们乐意在说明里致谢。

### 支持的版本

安全修复会合入 `main` 分支。自己部署的实例需要拉取最新代码重新部署；如果用的是一键部署，把更新推送到你那份仓库副本就会自动重新部署。

### 加固你的部署

- `DEVERDESK_PASSWORD` 用足够长的随机口令；改口令会让所有设备都退出登录。
- 想要更强的登录保护，可以把 Worker 放到 Cloudflare Access 后面（见 README）。
- 访问令牌只显示一次，服务器上只存摘要；不用的令牌及时撤销。
