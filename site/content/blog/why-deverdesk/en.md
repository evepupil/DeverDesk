---
title: Why we built DeverDesk
description: Indie developers run several projects. DeverDesk connects tasks, time, and the ledger to show each project's effort and return together.
date: 2026-09-30
tags: [product]
cover: /blog/why-deverdesk.webp
coverAlt: The DeverDesk workbench showing tasks, time, and project data together
author: DeverDesk
featured: true
---

An indie developer's day rarely revolves around one project. After a day job, the evening might go to updating a Template Store, checking an API Relay, writing a Developer Blog post, and answering Paid Consulting email. Each piece of work can look small on its own. Together, they make up a one-person company with no office, colleagues, or operations assistant.

The records of that work tend to live in different places. A task list knows what you meant to do. A calendar shows when you were busy. A ledger tracks income and expenses. When you ask a practical question, the pieces are hard to assemble: how much did the time spent on the Template Store actually return? The API Relay appears to earn well, but how many evenings does it take to maintain?

## Tasks and money tell only half the story

A count of completed tasks can make activity look like progress. An income total can hide the time required to keep that income coming. The Template Store may have collected a healthy amount this month while taking many evenings to build and support. A blog may have modest direct income and still be a channel you want to keep writing. A task board or a ledger on its own leaves out the other half of the context.

DeverDesk starts with a concrete idea: attach every task, time entry, and ledger entry to a Project. Once records share that context, the app can show a Project's received net income, tracked hours, and resulting hourly rate together. You still make the decision about what deserves your time; you no longer need to assemble three separate records before you can ask the question.

## One console, eight views

DeverDesk has eight views for the regular work of a one-person company:

| View | What it is for |
| --- | --- |
| Today | Plan today's tasks and timeline, check in on routines, and see time tracked today and net income against a monthly target |
| Week | Review seven days, see daily capacity, and move tasks between days |
| Tasks | Organize tasks as a board or list, grouped or filtered by status, Project, or priority |
| Projects | Compare stage, net income, hours, hourly rate, monthly goal progress, and the next milestone |
| Ledger | Record income and expenses, keep pending payments visible, and export CSV |
| Insights | Review trends for net income, tracked time, hourly rate, and completed tasks, including Project breakdowns |
| Review | See a weekly summary of completed work and where time went, then add reflection notes |
| Routines | Manage daily, weekly, and monthly routines with streaks and check-ins |

Which Project receives an income entry or a block of time depends on the record you make. DeverDesk provides places to organize and calculate those records; it does not decide whether you should keep a Project. An hourly rate can reveal a difference and suggest a question. It cannot replace every long-term consideration.

## Why open source and self-hosting matter

DeverDesk is open source under AGPL-3.0. You can inspect, modify, and self-host it. If you provide a modified version to others as a network service, the license also requires you to make the corresponding source available to those users. Public source makes the way the product works inspectable and gives people a starting point for adapting their own console.

The cloud edition runs in your Cloudflare account. Its static pages and API are deployed together as a Worker, a Cloudflare service that runs the application's interface endpoints. Its data is stored in D1, Cloudflare's SQLite database. Your financial records live in the database attached to your own deployment, rather than an account hosted for you by DeverDesk. Cloudflare's free tier is more than enough for one person. The [deployment guide](/en/blog/deploy-to-cloudflare/) and [repository](https://github.com/evepupil/DeverDesk) explain how to get started.

## Start with one record

You can open the [live demo](https://app.deverdesk.com) to explore the interface. It runs the local edition with sample data, and your changes stay in the current browser. To understand where records live in each edition, read [local or cloud](/en/blog/local-vs-cloud/). When you begin using DeverDesk, choose one Project and record a task, a period of work, and an income entry. After you have worked for a while, open Insights and review the Project breakdown. You will have concrete records to question instead of trying to reconstruct an entire month from memory.

DeverDesk is not meant to turn every minute into a billable unit. It is meant to put the work that already happened back in the Project where it belongs, so the next decision about how to spend an evening has a little more evidence behind it.