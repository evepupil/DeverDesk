---
title: "Quick add: capture a task in one line"
description: Write a title with duration, Project, date, and priority markers in one line. Quick add recognizes English and Chinese input in either interface language.
date: 2026-09-26
tags: [guide]
cover: /blog/quick-add.webp
coverAlt: A task and its duration, Project, and date captured in one line
author: DeverDesk
---

When a task occurs to you, writing it down should not require opening a form and filling several fields. DeverDesk quick add lets you put a title and a few markers on one line. It recognizes those markers and uses the remaining words as the task title.

## Put markers after the title

The basic pattern is “title + markers,” separated by spaces. The title can be ordinary text. Recognized duration, Project, date, and priority markers are removed from the title and saved in their corresponding fields. You can type English or Chinese regardless of the language currently shown by the interface.

Durations include `30m`, `1.5h`, `1h30m`, `2小时`, `45min`, and `2hr`. Common hour and minute abbreviations are supported, as are decimal hours. For example, `1.5h` becomes 90 minutes, and `1h30m` also means 90 minutes.

A Project marker starts with `#`, such as `#Template Store`, `#API Relay`, `#Developer Blog`, `#Paid Consulting`, or `#Newsletter`. The name must match an existing Project; quick add looks up the name. Dates can be `today`, `tomorrow`, `fri`, `friday`, or `next tue`, along with `今天`, `明天`, `周五`, `下周二`, `10-3`, and `10月3日`. Set priority with `!`, `!!`, or `!!!`: one exclamation mark is medium, two are high, and three are urgent.

## Five examples

| Input | What quick add recognizes |
| --- | --- |
| `Write weekly update 30m #Developer Blog tomorrow !!` | Title “Write weekly update”; 30 minutes; Developer Blog; tomorrow; high priority |
| `Refresh product page 1.5h #Template Store friday !!!` | Title “Refresh product page”; 90 minutes; Template Store; the upcoming Friday; urgent |
| `Check webhook 1h30m #API Relay next tue !` | Title “Check webhook”; 90 minutes; API Relay; next Tuesday; medium priority |
| `Reply to client 2小时 #Paid Consulting 10-3 !!` | Title “Reply to client”; 120 minutes; Paid Consulting; October 3; high priority |
| `Draft newsletter 45min #Newsletter 周五 !!!` | Title “Draft newsletter”; 45 minutes; Newsletter; the upcoming Friday; urgent |

You can put markers in a different order. The spaces separate markers, and only the unrecognized words remain in the task title. If a Project name does not match an existing Project, quick add will not create one; that `#` text remains part of the title.

## Capture on a phone or from the keyboard

The mobile interface has a quick-capture button in the bottom-right corner, ready for tasks you want to record on the go. At a computer, press `Ctrl` / `⌘` + `K` to open the command palette and search the workspace, then continue organizing the task. Quick add parses a line into task details, while the command palette searches the workspace; together they reduce the time spent switching between views.

After adding a task, you can update its status in Tasks or schedule it from Today or Week. DeverDesk's [eight views](/en/blog/why-deverdesk/) connect tasks with Projects, time, and the Ledger. For an example of how those records inform comparisons, read [how to calculate an hourly rate](/en/blog/hourly-rate/). A one-line capture does not replace later organization; it helps preserve an idea while it is fresh.

## English and Chinese both work

Quick add is independent of the interface language. In a Chinese interface, you can type `tomorrow` or `45min`; in an English interface, you can type `明天` or `下周二`. The recognized marker labels are shown in the current language, while the task title keeps the words you entered.

If the entire line becomes a title, check the spelling and spacing of each marker, and confirm that the Project exists. Start with a short entry, such as a title and duration, then add a Project, date, or priority. Once captured, the task is ready for you to organize around the time you actually have.

## Use quick add as the first step

For example, if you think of an API Relay check while doing something else, write a title, an estimate, `#API Relay`, and a date. You can return to Tasks afterward to review the recognized Project and planned date, then adjust the task as needed. Today and Week provide places to schedule tasks when you are ready to plan the work.

Quick add recognizes specific marker formats; it does not require a sentence written as a command. Ordinary words remain in the title, while values that match a duration, date, or priority format are parsed into their respective fields. A Project marker must match an existing Project, so it helps to confirm the Project's name before typing it after `#`. English markers work in the Chinese interface, and Chinese markers work in the English interface.

On a phone, the bottom-right quick-capture button is a convenient place to save an idea and organize it later. At a computer, capture the task in one line, then press `Ctrl` or `⌘` + `K` to search the workspace when you need to find existing work. One entry point captures a new task; the other searches what is already there. Adding a title and a rough duration while the work is fresh can save you from reconstructing the evening afterward.