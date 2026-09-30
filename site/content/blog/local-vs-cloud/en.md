---
title: "Local or cloud: where your data actually lives"
description: Local keeps data in this browser. Cloud stores it in your D1 database and syncs records across devices, including offline changes.
date: 2026-09-27
tags: [product, open-source]
cover: /blog/local-vs-cloud.webp
coverAlt: Data moving between a local browser and the user's own Cloudflare database
author: DeverDesk
---

One of the first things to understand about a work tool is where its records end up. DeverDesk has a local edition and a cloud edition. Both come from the same codebase, and a build-time switch selects which one is packaged. The views may look similar, while saving and syncing work differently.

The local edition is for someone who wants to open the app and keep records in the current browser. The cloud edition is for someone who wants to use multiple devices and is comfortable deploying the service to their own Cloudflare account. Follow the data flow before choosing the one that fits your habits.

## Local edition: this browser only

The local edition stores data in the current browser. When you open [app.deverdesk.com](https://app.deverdesk.com), you see the local edition with sample data. New records and changes stay in that browser; they are not sent to a server. There is no online account and no cross-device sync.

If browser data is cleared, the locally saved work goes with it, so regular backup exports matter. Choose **Export backup** from the avatar menu to save a file. You can later import that file to restore or move records. The demo uses the local edition because it runs as a static app and does not need a server to store each visitor's data.

## Cloud edition: your D1 database plus a local cache

The cloud edition is deployed in your Cloudflare account, and its durable records are stored in D1. D1 is Cloudflare's SQLite database. The browser still keeps a local cache and an upload queue, so the app can load the data on that device and save a change locally before the sync engine handles it.

Sync works record by record. The browser queues changed records for upload and fetches records written by other devices. You can keep working offline; the queue stays in the browser and uploads automatically after connectivity returns. A sync indicator shows states such as synced, syncing, offline, or error. Language preference is stored on each device, while cloud-edition work records follow the sync rules.

## When two devices change the same record

Independent records are merged individually. For example, a task added on one device and an income entry added on another can both remain. If both devices edit the same record, DeverDesk compares its modification times and the newer version becomes current; records without a conflict are still merged separately. The sync design also advances a new timestamp beyond the latest version already known on that device, helping an edit remain newer even when the device clock is a little behind.

The sync indicator helps you see whether queued changes have been uploaded. Signing out clears the local cache, so DeverDesk asks for confirmation if changes are still waiting to upload. Signing out while offline cannot complete the server-side logout or clear the cache successfully; reconnect before signing out.

## Compare the two editions

| Question | Local edition | Cloud edition |
| --- | --- | --- |
| Where data lives | The current browser | Your Cloudflare D1 database, with a working cache in each browser |
| Multiple devices | No sync | Automatic record-by-record sync, with offline changes uploaded later |
| Sign-in | None | A Passcode or Cloudflare Access |
| How to get it | Open app.deverdesk.com | Deploy from the repository with one click or manually |

If you want to try the app right away and avoid a sign-in flow, start with the demo and export backups regularly. If you need the same records on two devices, deploy the cloud edition and import a backup to bring your local records over. See the [Cloudflare deployment guide](/en/blog/deploy-to-cloudflare/). DeverDesk is open source under AGPL-3.0; start with the [project repository](https://github.com/evepupil/DeverDesk) to inspect the code.

You do not have to choose based on a vague idea that “cloud is more convenient” or “local is more private.” Ask whether you need multiple devices to share the same records, whether you are willing to manage a Cloudflare deployment, and whether backup exports fit your routine. Those answers are more useful than the edition names.

## The demo is local by design

The public demo uses the local edition with sample data. Your changes stay in your browser, which makes the demo convenient for exploring the views without signing in. The cloud edition serves a different purpose: it puts the database and deployment in your account and syncs records among devices.

You can start local, export a backup, and import it after setting up the cloud edition. The two editions share their code, but data does not silently move between them. Knowing that boundary makes it easier to choose where to enter real records and how to preserve them.