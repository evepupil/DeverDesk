import type { Messages } from "./zh"

/**
 * English dictionary. Its type comes from the Chinese one, so a missing or extra key fails the
 * type check; array lengths are checked in messages.test.ts. Sentence case, verbs first on buttons.
 * Product terms follow the app: 副业 = Projects, 收支 = Ledger, 例行 = Routines, 回顾 = Review.
 */
export const en: Messages = {
  meta: {
    siteName: "DeverDesk",
    home: {
      title: "DeverDesk — The one-person company console for indie developers",
      description:
        "Tasks, time and side-project money in one place — and the real hourly rate of every project. Open source, self-hosted on your own Cloudflare.",
    },
    changelog: {
      title: "Changelog — DeverDesk",
      description: "Every DeverDesk release, each linked to its commits on GitHub.",
    },
    blog: {
      title: "Blog — DeverDesk",
      description: "Notes on running a one-person company, pricing your time and self-hosting.",
    },
    postTitle: "{title} — DeverDesk Blog",
  },

  common: {
    tryDemo: "Try the demo",
    deploy: "Deploy to Cloudflare",
    viewOnGithub: "View on GitHub",
    star: "Star",
    githubAria: "DeverDesk on GitHub",
    githubStarsAria: "DeverDesk on GitHub, {n} stars",
    newTab: "(opens in a new tab)",
    openSourceBadge: "100% open source · AGPL-3.0",
    minutesRead: "{n} min read",
    readMore: "Read more",
    skipToContent: "Skip to content",
    chooseLanguage: "Choose your language",
  },

  nav: {
    aria: "Main",
    home: "DeverDesk home",
    features: "Features",
    openSource: "Open source",
    blog: "Blog",
    changelog: "Changelog",
    language: "Language",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },

  footer: {
    tagline: "The one-person company console for indie developers: tasks, time and side-project money in one place.",
    copyright: "© 2026 DeverDesk · Open source under AGPL-3.0",
    edit: "Edit this page on GitHub",
    columns: {
      product: {
        title: "Product",
        features: "Features",
        tour: "Product tour",
        faq: "FAQ",
        demo: "Live demo",
      },
      openSource: {
        title: "Open source",
        repo: "GitHub repository",
        license: "AGPL-3.0 license",
        issue: "Report an issue",
        contributing: "Contributing",
      },
      resources: {
        title: "Resources",
        blog: "Blog",
        changelog: "Changelog",
        deployGuide: "Deployment guide",
        oneClick: "One-click deploy",
      },
      language: {
        title: "Language",
      },
    },
  },

  home: {
    hero: {
      pill: "100% open source · AGPL-3.0",
      title: "See what every side project really pays per hour.",
      lead: "Tasks, time and money in one place. Every hour and every payment belongs to a project, so you get its real hourly rate.",
      secondary: "Self-host on Cloudflare",
      note: "No sign-up. The demo keeps your data in your browser.",
      frameUrl: "app.deverdesk.com",
      shotAlt: "The DeverDesk Today view: today's plan, timeline, routines and this month's money",
    },

    techStrip: {
      title: "Built on open source",
      subtitle: "Every line is public — and so is everything it's built on.",
    },

    features: {
      title: "Everything a one-person company runs on",
      subtitle: "Plan, track, bill and review — all connected.",
      today: {
        title: "Plan today in a few drags",
        body: "Drag tasks onto the timeline, move or resize blocks, or auto-schedule the whole day.",
        autoSchedule: "Auto-schedule",
        now: "Now",
        blocks: ["Write weekly report", "Fix text-selection popup", "Reply to store reviews"],
        dragging: "Investigate Claude API timeouts",
        capacity: "5h 30m of 6h planned",
      },
      rate: {
        title: "The real hourly rate of every project",
        body: "Net income divided by hours tracked — see which project deserves your evenings.",
        columns: ["Net this month", "Hours", "Per hour"],
        rows: [
          { name: "Template Store", net: "$3,200", hours: "26h", rate: "$123/h" },
          { name: "API Relay", net: "$1,860", hours: "9h", rate: "$207/h" },
          { name: "Developer Blog", net: "$420", hours: "14h", rate: "$30/h" },
        ],
      },
      money: {
        title: "Know when the money lands",
        body: "Pending payments stay on top, and you get a nudge when one is late.",
        items: [
          { project: "Template Store", text: "$3,200 pending · Oct 5" },
          { project: "API Relay", text: "Received +$860" },
          { project: "Paid Consulting", text: "3 days past the due date" },
        ],
        goalLabel: "Net this month",
        goalValue: "$5,480",
        goalTarget: "Goal $8,000",
        goalPercent: "68%",
      },
      quickAdd: {
        title: "One line to capture anything",
        body: "Duration, project, date and priority are picked out of a single line — in English or Chinese.",
        input: "Write report 30m #blog tomorrow !!",
        chips: ["30 min", "Developer Blog", "Tomorrow", "High priority"],
        hint: "Enter to add",
      },
      small: {
        review: { title: "A weekly summary, written for you", body: "What got done, where the time went and what came in — one paragraph a week." },
        routines: { title: "Routines with streaks", body: "Daily, weekly and monthly routines, with streaks you can see at a glance." },
        backup: { title: "Export and import backups", body: "Take all your data in one file. It's also how you move from local to cloud." },
        search: { title: "Search everything with ⌘K", body: "Tasks, projects and ledger entries from a single search box." },
        alerts: { title: "Alerts that matter", body: "Overbooked days, overdue tasks and late payments show up in one place." },
        timer: { title: "Timer and time logs", body: "Run a timer or log time afterwards — every minute counts toward the hourly rate." },
      },
    },

    tour: {
      title: "Eight views for your whole week",
      subtitle: "Real screens, with the same sample data as the live demo.",
      tablist: "Product views",
      shotAlt: "The DeverDesk {label} view",
      items: {
        today: {
          label: "Today",
          title: "Today: plan, timeline, routines and money",
          points: ["Move unfinished work to today in one click", "Drag to schedule, or click an empty slot to place a task", "This month's net income against your goal, and today's tracked time"],
        },
        week: {
          label: "Week",
          title: "Week: see which day is full",
          points: ["Seven days top to bottom, each with a capacity bar", "Drag tasks between days", "Unscheduled tasks wait on the side"],
        },
        tasks: {
          label: "Tasks",
          title: "Tasks: board or list, your call",
          points: ["Group by status, project or priority", "Filter and sort", "Drag a card to another column to change its status, project or priority"],
        },
        projects: {
          label: "Projects",
          title: "Projects: money and time for each one",
          points: ["A board by stage: idea, building, running", "Net income, hours, hourly rate and monthly goal", "A 12-week trend and the next milestone in the details"],
        },
        ledger: {
          label: "Ledger",
          title: "Ledger: pending payments always on top",
          points: ["Everything else grouped by month, project or category", "Mark entries as received or refunded", "Export to CSV"],
        },
        insights: {
          label: "Insights",
          title: "Insights: four metrics, one chart",
          points: ["Switch between net income, hours, hourly rate and tasks done", "Break it down by project, money and time", "Compare with the previous period"],
        },
        review: {
          label: "Review",
          title: "Review: a summary written every week",
          points: ["What got done, daily hours and money in and out", "Three reflection notes", "Browse past weeks any time"],
        },
        routines: {
          label: "Routines",
          title: "Routines: streaks, one check at a time",
          points: ["Daily, weekly and monthly", "Streaks and completion rate", "A 12-week check-in grid"],
        },
      },
    },

    editions: {
      title: "One workspace on every device",
      subtitle: "The cloud edition runs on your own Cloudflare. Changes sync record by record, and it keeps working offline.",
      devices: {
        phone: { title: "Capture on your phone", body: "One button in the corner for whatever comes up." },
        laptop: { title: "Plan on your computer", body: "Timeline, boards and shortcuts — plan the week in minutes." },
        tablet: { title: "Review on your tablet", body: "Charts and weekly reviews for a quiet weekend." },
      },
      cards: {
        local: { title: "Local edition: just open it", body: "No sign-up. Your data lives only in this browser, and nothing is stored on a server." },
        cloud: { title: "Cloud edition: your own Cloudflare", body: "One Worker and one D1 database. The free tier is more than enough for one person." },
        own: { title: "Your data stays yours", body: "Export a backup any time. Moving from local to cloud is an export and an import." },
      },
      localBrowser: "Stored in this browser only",
      exportFile: "deverdesk-backup.json",
      mapAlt: "World map: Cloudflare's network spans the globe",
      phoneAlt: "The DeverDesk Today view on a phone",
      laptopAlt: "The DeverDesk Week view on a laptop",
      tabletAlt: "The DeverDesk Insights view on a tablet",
    },

    openSource: {
      eyebrow: "Open source",
      title: "Every line is on GitHub",
      body: "The app, the cloud backend and even this website live in one open repository. It's released under AGPL-3.0: use it, change it and host it yourself — and if you offer a modified version as a service, share your source too.",
      points: ["No paid tier, nothing locked away", "Your financial data never passes through our servers", "Issues and pull requests welcome"],
      repoDescription: "The one-person company console for indie developers: tasks, time and side-project money in one place.",
      stars: "Stars",
      forks: "Forks",
      updated: "Last push {date}",
      terminal: "Terminal",
      terminalNote: "Local development runs the app and the API together; the passcode is printed in the terminal.",
      copy: "Copy commands",
      copied: "Copied",
      commitsTitle: "Recent commits",
      allCommits: "All commits",
      commitAria: "View commit {sha} on GitHub",
    },

    scenarios: {
      title: "Questions DeverDesk answers for you",
      subtitle: "Every indie developer has asked at least one of these.",
      cards: [
        { q: "The template store made $3,200 this month — but how many hours did it take?", a: "Projects: net income, hours and hourly rate side by side" },
        { q: "API relay or blog posts — which one deserves my weekend?", a: "Insights: hourly rate by project" },
        { q: "The client said end of the month. What's the date today?", a: "Ledger: pending payments on top, with late alerts" },
        { q: "Nine hours of work planned, five hours available.", a: "Today: the capacity bar shows the overflow" },
        { q: "What did I actually do last week?", a: "Review: a summary written for you every week" },
        { q: "I said 500 words a day. How long did that last?", a: "Routines: streaks and a check-in grid" },
        { q: "Is this idea worth a new project?", a: "Projects: park it under Idea and track the time first" },
        { q: "Ideas on my phone are gone by the time I sit down.", a: "Cloud edition: capture on the phone, plan on the computer" },
        { q: "Can my income data stay off someone else's server?", a: "Self-hosted: your data lives on your own Cloudflare" },
        { q: "The goal is $8,000 this month. Where am I?", a: "Today: this month's net income against the goal" },
      ],
    },

    faq: {
      title: "Frequently asked questions",
      subtitle: "Can't find an answer?",
      askLink: "Open an issue on GitHub",
      groups: {
        product: {
          title: "Product",
          items: [
            {
              q: "How much does DeverDesk cost?",
              a: "Nothing. DeverDesk is open source under AGPL-3.0. The local edition runs right in your browser, and the cloud edition runs on your own Cloudflare account within the free tier for personal use.",
            },
            {
              q: "What's the difference between the local and cloud editions?",
              a: "The local edition keeps data in this browser only — no sign-up and no sync. The cloud edition runs on your own Cloudflare, syncs your phone and computer, and works offline. Both are built from the same code.",
            },
            {
              q: "How is the hourly rate calculated?",
              a: "Income received minus expenses in a period gives the net income, which is divided by the time tracked in the same period. Pending payments count once they are received.",
            },
            {
              q: "Which languages and currencies are supported?",
              a: "The interface is in English and Chinese, picked from your browser language. The bookkeeping currency is a separate setting: CNY, USD, EUR, GBP, JPY, HKD, TWD, SGD, CAD or AUD.",
            },
          ],
        },
        deploy: {
          title: "Deployment",
          items: [
            {
              q: "What do I need to deploy the cloud edition?",
              a: "A Cloudflare account and a GitHub account. Click Deploy to Cloudflare: it copies the repository, creates the D1 database and asks you for a passcode.",
            },
            {
              q: "Is the Cloudflare free tier enough?",
              a: "For one person, yes. The cloud edition is a single Worker and a single D1 database, and everyday use stays well within the free tier.",
            },
            {
              q: "Can I use my own domain?",
              a: "Yes. Find the Worker in the Cloudflare dashboard and add a custom domain in its settings.",
            },
            {
              q: "How do I move from the local edition to the cloud edition?",
              a: "Choose Export backup from the avatar menu in the local edition, then Import backup in your cloud edition.",
            },
          ],
        },
        openSource: {
          title: "Open source",
          items: [
            {
              q: "What does AGPL-3.0 mean for me?",
              a: "Anyone can use, modify and self-host it for free, individuals and companies alike. Only if you offer a modified version to others as an online service do you need to publish your changes.",
            },
            {
              q: "Do you collect my data?",
              a: "No. Local-edition data stays in your browser and cloud-edition data stays in your own Cloudflare account. Neither passes through our servers.",
            },
            {
              q: "How can I contribute?",
              a: "Issues and pull requests on GitHub are welcome — have a look at the contributing guide before you start coding.",
            },
          ],
        },
      },
    },

    cta: {
      title: "Run your one-person company from one desk.",
      body: "Start with the live demo — your data stays in your browser. When you want sync across devices, deploy it to your own Cloudflare.",
      collageAlt: "Screenshots of several DeverDesk views",
    },
  },

  changelog: {
    title: "Changelog",
    subtitle: "Every DeverDesk release. Each entry links to its commits on GitHub.",
    releases: "{n} releases",
    lastUpdated: "Last updated {date}",
    watch: "Watch on GitHub",
    kinds: {
      new: "New",
      improved: "Improved",
      fixed: "Fixed",
    },
    commits: "Commits",
    commitAria: "View commit {sha} on GitHub",
    shotAlt: "Screenshot for {version}",
    subscribe: {
      title: "Never miss a release",
      body: "Watch the repository on GitHub and choose Releases to get notified when a new version ships.",
    },
  },

  blog: {
    title: "Blog",
    subtitle: "Notes on running a one-person company, pricing your time and self-hosting.",
    featured: "Featured",
    more: "More posts",
    searchLabel: "Search posts",
    searchPlaceholder: "Search posts",
    allTags: "All",
    count: "{n} posts",
    empty: "No posts match “{q}”.",
    clear: "Clear search",
    toc: "On this page",
    back: "All posts",
    published: "Published {date}",
    editPost: "Edit this post on GitHub",
    newer: "Newer",
    older: "Older",
    ctaTitle: "Ready to try it?",
    ctaBody: "The demo needs no sign-up, and your data stays in your browser.",
    tags: {
      product: "Product",
      guide: "Guide",
      "open-source": "Open source",
      method: "Method",
    },
  },

  notFound: {
    title: "Page not found",
    body: "Nothing lives at this address. It may have moved.",
    home: "Back to home",
  },
}
