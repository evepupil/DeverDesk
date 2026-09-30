---
title: Deploy DeverDesk to your own Cloudflare in five minutes
description: Deploy with Cloudflare's one-click flow or the CLI. Set a Passcode, add a domain, and import a local-edition backup.
date: 2026-09-28
tags: [guide]
cover: /blog/deploy-to-cloudflare.webp
coverAlt: DeverDesk cloud edition deployed in the user's own Cloudflare account
author: DeverDesk
---

The cloud edition runs inside your Cloudflare account. Its pages are static files; a Worker is the Cloudflare service that runs the API; and D1 is Cloudflare's SQLite database. They are deployed together as one Worker, with your cloud-edition records stored in the D1 database attached to your account.

With GitHub and Cloudflare accounts ready, choose the one-click flow or deploy from a terminal. Cloudflare's free tier is more than enough for one person. “Five minutes” is the quick-start goal in the title; the time it takes can depend on account authorization and the deployment environment.

## Use one-click deploy

Open the [Cloudflare deploy link](https://deploy.workers.cloudflare.com/?url=https://github.com/evepupil/DeverDesk) and follow four steps:

1. Authorize GitHub. Cloudflare creates a copy of the repository in your account and automatically redeploys when you push changes to that copy.
2. Cloudflare creates a D1 database for the deployment.
3. Set `DEVERDESK_PASSWORD`. This is the Passcode you enter to open the workspace.
4. When the build finishes, open the assigned `*.workers.dev` address and sign in.

The Passcode is the default sign-in method. A session lasts 30 days. After 10 failed attempts from the same IP, sign-in is locked for 15 minutes. Changing the Passcode signs out every device. The [repository README](https://github.com/evepupil/DeverDesk/blob/main/README.zh-CN.md) documents deployment and updates.

## Deploy from a terminal

The manual route requires Node.js 22 or later and pnpm 10. These are the commands from the repository instructions:

```bash
git clone https://github.com/evepupil/DeverDesk.git
cd DeverDesk
pnpm install
pnpm exec wrangler login                          # sign in to Cloudflare
pnpm build
pnpm run deploy                                   # create tables, then deploy the Worker
pnpm exec wrangler secret put DEVERDESK_PASSWORD  # set the Passcode (input is hidden)
```

On a first deployment, `pnpm run deploy` lets Wrangler create the database, applies the database migrations, and deploys the Worker. Keep the `run`: `pnpm deploy` by itself is an unrelated built-in pnpm command. To update later, pull the latest code and run `pnpm build && pnpm run deploy` again.

## Choose a sign-in method and domain

The Passcode is the default. You can instead put the Worker behind Cloudflare Access and set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`. People authenticated through Access go directly to the workspace without entering the Passcode. Deployment details and the exact variable names are in the [README](https://github.com/evepupil/DeverDesk/blob/main/README.zh-CN.md).

To use your own domain, open the Cloudflare dashboard and go to **Workers & Pages → your Worker → Settings → Domains & Routes**. Add a custom domain to that Worker. You can then use that address for your workspace.

## Move records from the local edition

The local and cloud editions share one codebase, but their data stores are separate. In the local edition, open the avatar menu and choose **Export backup**. In your deployed cloud edition, open the avatar menu, choose **Import backup**, and select that file. The imported records enter the cloud edition's sync process.

The [app.deverdesk.com demo](https://app.deverdesk.com) runs the local edition. Its data stays in the current browser, so it is a way to try the interface, not a substitute for your own cloud deployment. For help choosing an edition, read [where your data lives](/en/blog/local-vs-cloud/); for the reason Projects, time, and ledger entries belong together, see [why we built DeverDesk](/en/blog/why-deverdesk/).

After deployment, the workspace is hosted in your Cloudflare account. Keep the Passcode available to the people who need it, and check that you selected the intended backup when bringing local records over.

## Check the setup after publishing

With the one-click flow, confirm that you authorized the GitHub account where you want to keep the repository copy. Cloudflare creates that copy as part of the setup, and code pushed to it triggers redeployment. Decide on a Passcode while creating the Worker and keep it available for sign-in. With the terminal route, sign in to Cloudflare first, then build and deploy the pages and API. On a first deployment, the deploy command creates the database and applies its schema migrations.

After the deployment finishes, open the `*.workers.dev` address and sign in with the Passcode. If you use Cloudflare Access, set the team domain and application audience tag from the README, then sign in through Access. A custom domain changes the address people use to reach the Worker; adding it under Domains & Routes does not change where the database lives. To publish a later version, follow the README's pull, build, and deploy instructions again.

The backup export and import steps are the path for moving existing records between editions. Before exporting, make sure the local browser contains the records you intend to move. At import time, choose that backup file in your own cloud workspace. The demo includes sample data, so check that the file you select contains your own work if that is what you want to migrate. The [edition comparison](/en/blog/local-vs-cloud/) explains where each set of records lives.

## Pick the deployment path that suits you

The one-click flow handles creating a repository copy and D1 database. The manual route gives you a command-by-command deployment process. Both deploy the same cloud edition: static pages and a Worker run together, and D1 stores the cloud records. Choosing Access or a custom domain changes the sign-in or address configuration; the database remains in your Cloudflare account.

When it is time to update, return to the README and follow its requirements and complete commands. Do not commit the Passcode to a public repository; `wrangler secret put` hides the value while you enter it. Once the workspace is running, the guide to [working out an hourly rate](/en/blog/hourly-rate/) shows how received ledger entries and tracked time can be reviewed together.