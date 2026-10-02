---
title: "Connect your AI assistant to DeverDesk: MCP and OAuth"
description: The cloud edition is also an MCP server. Claude Code and Codex connect with a token; ChatGPT and Claude on the web and mobile use OAuth. Learn the three permission levels, AI activity and undo first.
date: 2026-10-02
tags: [guide, product]
cover: /blog/connect-ai.webp
coverAlt: A chat bubble from an AI assistant plugged into the DeverDesk workspace
author: DeverDesk
---

The cloud edition is also an [MCP](https://modelcontextprotocol.io) server. MCP is a common protocol that lets AI assistants use outside tools: once Claude Code, Codex, Cursor or VS Code is connected, it can check today's plan, record income and fit tasks into free time slots for you. ChatGPT, and Claude on the web and mobile, connect through OAuth instead, with a few clicks on an authorization page and no token to copy.

Only the cloud edition has this entry point. The local edition keeps its data in the browser, so there is no service to connect to. The [Cloudflare deployment guide](/en/blog/deploy-to-cloudflare/) covers setting up the cloud edition.

## Decide how far it may go

Every connection gets one of three permission levels:

- **Read only**: it can only read your data.
- **Propose** (the default): its changes wait in a queue until you accept them in **AI activity**.
- **Write**: changes apply right away and can be undone at any time.

Start with the default for the first few days. See whether the changes it proposes match how you work, then decide whether to move up to Write.

## Connect with a token: Claude Code, Codex, Cursor, VS Code

Open **Connect AI** from the avatar menu, name the connection, pick a permission and copy the configuration shown for your client. The token appears only once, so save it right away. For Claude Code the command looks like this:

```bash
claude mcp add --transport http deverdesk https://your-workspace.example.com/mcp \
  --header "Authorization: Bearer dd_your_token"
```

These tools can also connect with just the address and ask you to approve in the browser. Tokens keep working as before.

## Connect with OAuth: ChatGPT, and Claude on the web and mobile

1. Copy the connector address at the top of the **Connect AI** dialog. It looks like `https://your-workspace.example.com/mcp`.
2. In ChatGPT, turn on developer mode in settings and create a connector with that address. In Claude, open Settings → Connectors → Add custom connector. A connector added on the web also works in the mobile apps.
3. Your browser opens DeverDesk's authorization page. It shows which app is asking to connect and which website it will return to. Sign in, pick a permission (Propose by default) and choose **Allow**.

After you allow it, the app holds a key that is valid for one hour and renews itself; the connection expires after 30 days without use. It shows up in the **Connect AI** list next to your manual tokens, where you can change its permission or disconnect it at any time. Once disconnected, its next request is refused.

If your cloud edition sits behind Cloudflare Access, add Access bypass rules for `/mcp`, `/oauth/*` and `/.well-known/*`. DeverDesk checks tokens itself, and the authorization page stays behind Access.

## What it can do

| Group | What it does |
| --- | --- |
| Capture | Add several tasks at once; record income and expenses (an external order ID skips duplicates); log time; start and stop the timer; check off routines; write weekly notes |
| Check | Today, this week, every project, one project in depth; stats for any period; the weekly review; keyword search; flexible queries |
| Plan | Edit tasks in bulk; schedule a day into free time slots; spread tasks over a week by capacity; reschedule; manage projects, milestones and routines; delete records |

Things you can say:

- "What is left on my list today?"
- "Which project has the best hourly rate this month?"
- "Log income: Template Store, 200."
- "Fit my unscheduled tasks into today's free time."

## Every change is recorded and can be undone

Everything an assistant changes is recorded. The sparkles icon in the top bar opens **AI activity**, where you accept or reject proposals and undo changes; records created by an assistant carry the same icon. Deleting, or changing more than ten records at once, is shown to you as a preview first and applies only after you confirm. Dates and times follow the time zone in your schedule settings, which the browser fills in the first time you sign in.

## One more thing: let coding time record itself

If you write code with Claude Code or Codex, you can also install a small recorder that logs your coding time and tasks in the matching side project. Time counts only while you are around, windows running in parallel share it so the total never exceeds the clock, a commit finishes a task, and only folders bound to a project are uploaded; everything else stays on your machine. Setup steps are in the [README](https://github.com/evepupil/DeverDesk#log-coding-time-automatically).
