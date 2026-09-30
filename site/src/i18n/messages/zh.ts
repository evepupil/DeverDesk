/**
 * 中文词条：全站所有界面文字的基准。英文词条的类型从这里推出来，少一条、多一条都会类型检查报错；
 * 数组长度由 messages.test.ts 核对。带变量的写成 {n}、{date} 这种占位，用 fill() 填。
 * 页面和组件里不写死文字，一律从这里取。
 */
export const zh = {
  meta: {
    siteName: "DeverDesk",
    home: {
      title: "DeverDesk — 独立开发者的一人公司控制台",
      description: "任务、时间和副业收支放在一起，算出每个副业每小时到底赚多少。开源，可以部署在你自己的 Cloudflare 上。",
    },
    changelog: {
      title: "更新日志 — DeverDesk",
      description: "DeverDesk 的每一次更新，每一条都链到 GitHub 上对应的提交。",
    },
    blog: {
      title: "博客 — DeverDesk",
      description: "关于一人公司、副业时薪和自己部署的一些记录。",
    },
    postTitle: "{title} — DeverDesk 博客",
  },

  common: {
    tryDemo: "在线试用",
    deploy: "部署到 Cloudflare",
    viewOnGithub: "在 GitHub 上查看",
    star: "Star",
    githubAria: "DeverDesk 的 GitHub 仓库",
    githubStarsAria: "DeverDesk 的 GitHub 仓库，{n} 个 Star",
    newTab: "（新窗口打开）",
    openSourceBadge: "100% 开源 · AGPL-3.0",
    minutesRead: "{n} 分钟读完",
    readMore: "阅读全文",
    skipToContent: "跳到正文",
    chooseLanguage: "选择语言",
  },

  nav: {
    aria: "主导航",
    home: "DeverDesk 首页",
    features: "功能",
    openSource: "开源",
    blog: "博客",
    changelog: "更新日志",
    language: "语言",
    openMenu: "打开菜单",
    closeMenu: "关闭菜单",
  },

  footer: {
    tagline: "独立开发者的一人公司控制台：任务、时间和副业收支放在一起。",
    copyright: "© 2026 DeverDesk · 以 AGPL-3.0 开源",
    edit: "在 GitHub 上编辑此页",
    columns: {
      product: {
        title: "产品",
        features: "功能",
        tour: "产品导览",
        faq: "常见问题",
        demo: "在线试用",
      },
      openSource: {
        title: "开源",
        repo: "GitHub 仓库",
        license: "AGPL-3.0 许可证",
        issue: "提交问题",
        contributing: "参与贡献",
      },
      resources: {
        title: "资源",
        blog: "博客",
        changelog: "更新日志",
        deployGuide: "部署文档",
        oneClick: "一键部署",
      },
      language: {
        title: "语言",
      },
    },
  },

  home: {
    hero: {
      pill: "100% 开源 · AGPL-3.0",
      title: "看清每个副业，每小时到底赚多少。",
      lead: "任务、时间和收支放在一起。每段投入、每笔进账都记到副业名下，自动算出它的真实时薪。",
      secondary: "部署到自己的 Cloudflare",
      note: "不用注册，演示站的数据只存在你的浏览器里",
      frameUrl: "app.deverdesk.com",
      shotAlt: "DeverDesk 的「今天」页：今天的计划、时间线、例行和本月收支",
    },

    techStrip: {
      title: "站在开源项目的肩膀上",
      subtitle: "代码全部公开，用到的每一个项目也都是开源的。",
    },

    features: {
      title: "一人公司需要的，都在一张桌上",
      subtitle: "计划、计时、记账、复盘，全都连在一起。",
      today: {
        title: "拖一下，今天就排好了",
        body: "把任务拖进时间线，拖动改时间、拉下边改时长，或者一键自动排。",
        autoSchedule: "自动排",
        now: "现在",
        blocks: ["写周报", "修复划词弹窗位置", "回复商店评论"],
        dragging: "排查 Claude 接口超时",
        capacity: "已排 5h 30m / 可用 6h",
      },
      rate: {
        title: "每个副业的真实时薪",
        body: "净收入除以投入时间，哪个副业值得你的晚上，一眼就知道。",
        columns: ["本月净收入", "投入", "时薪"],
        rows: [
          { name: "模板商城", net: "¥3,200", hours: "26h", rate: "¥123/h" },
          { name: "接口中转", net: "¥1,860", hours: "9h", rate: "¥207/h" },
          { name: "技术博客", net: "¥420", hours: "14h", rate: "¥30/h" },
        ],
      },
      money: {
        title: "钱到没到账，一眼看清",
        body: "待到账单独放在最上面，过了约定日还没到，右上角会提醒你。",
        items: [
          { project: "模板商城", text: "¥3,200 待到账 · 10月5日" },
          { project: "接口中转", text: "已到账 +¥860" },
          { project: "付费咨询", text: "过了约定日 3 天还没到" },
        ],
        goalLabel: "本月净收入",
        goalValue: "¥5,480",
        goalTarget: "目标 ¥8,000",
        goalPercent: "68%",
      },
      quickAdd: {
        title: "一行字，记下一件事",
        body: "时长、副业、日期、优先级写在一行里自动识别，中英文写法都认。",
        input: "写周报 30m #技术博客 明天 !!",
        chips: ["30 分钟", "技术博客", "明天", "高优先级"],
        hint: "回车添加",
      },
      small: {
        review: { title: "每周自动写小结", body: "做完了什么、时间花在哪、进了多少钱，每周一段话。" },
        routines: { title: "例行事务打卡", body: "每天、每周、每月的例行，连续几期一目了然。" },
        backup: { title: "导出和导入备份", body: "一个文件带走全部数据，从本地版搬到在线版也靠它。" },
        search: { title: "Ctrl / ⌘ K 搜一切", body: "任务、副业、收支，一个搜索框全找得到。" },
        alerts: { title: "该提醒的时候提醒", body: "排超了、逾期了、钱没按时到，右上角都有提示。" },
        timer: { title: "计时和补记", body: "边做边计时，忘了也能事后补记，投入时间自动算进时薪。" },
      },
    },

    tour: {
      title: "八个页面，覆盖一人公司的一周",
      subtitle: "都是真实界面，样例数据和演示站里的一样。",
      tablist: "产品页面",
      shotAlt: "DeverDesk 的「{label}」页",
      items: {
        today: {
          label: "今天",
          title: "今天：计划、时间线、例行和收支",
          points: ["之前没做完的一键挪到今天", "时间线上拖动排期，点空白处直接排任务", "本月净收入对照目标，今天投入了多少"],
        },
        week: {
          label: "本周",
          title: "本周：哪天排满了，一眼看出",
          points: ["七天从上往下排，每天一个容量条", "任务在日子之间拖来拖去", "还没排日子的任务放在右边"],
        },
        tasks: {
          label: "任务",
          title: "任务：看板和列表随时切换",
          points: ["按状态、副业或优先级分组", "筛选和排序", "卡片拖到别的列，状态、副业或优先级跟着改"],
        },
        projects: {
          label: "副业",
          title: "副业：每个副业的钱和时间",
          points: ["按构思、搭建中、运营中排成看板", "本月净收入、投入、时薪和月目标进度", "详情里看 12 周走势和下个里程碑"],
        },
        ledger: {
          label: "收支",
          title: "收支：待到账永远在最上面",
          points: ["其余按月、副业或分类分组", "标记到账、退款", "导出表格"],
        },
        insights: {
          label: "概览",
          title: "概览：四个指标，一张走势图",
          points: ["净收入、投入时间、时薪、完成任务来回切换", "按副业、钱、时间拆开看", "和上一期对比"],
        },
        review: {
          label: "回顾",
          title: "回顾：每周自动写一段小结",
          points: ["完成的事、每天的投入、进出的钱", "三段复盘笔记", "往期回顾随时翻"],
        },
        routines: {
          label: "例行",
          title: "例行：连续几期，一格一格打卡",
          points: ["每天、每周、每月三种频率", "连续期数和完成率", "按天排的 12 周打卡格子"],
        },
      },
    },

    editions: {
      title: "手机、电脑、平板，同一份数据",
      subtitle: "在线版部署在你自己的 Cloudflare 上，改动按条同步，断网也能接着用。",
      devices: {
        phone: { title: "手机上随手记", body: "右下角一个圆钮，想到就记。" },
        laptop: { title: "电脑上排计划", body: "时间线、看板和快捷键，排一周只要几分钟。" },
        tablet: { title: "平板上看概览", body: "走势图和每周回顾，周末翻一翻。" },
      },
      cards: {
        local: { title: "本地版：打开就用", body: "不用注册，数据只存在这台设备的浏览器里，服务器上什么都不存。" },
        cloud: { title: "在线版：你自己的 Cloudflare", body: "一个 Worker 加一个 D1 数据库，免费额度一个人用不完。" },
        own: { title: "数据始终在你手里", body: "随时导出备份；从本地版搬到在线版，导出再导入就行。" },
      },
      localBrowser: "只存在这个浏览器里",
      exportFile: "deverdesk-备份.json",
      mapAlt: "世界地图：Cloudflare 的网络遍布全球",
      phoneAlt: "手机上的 DeverDesk「今天」页",
      laptopAlt: "电脑上的 DeverDesk「本周」页",
      tabletAlt: "平板上的 DeverDesk「概览」页",
    },

    openSource: {
      eyebrow: "开源",
      title: "代码全部公开",
      body: "产品、在线版后端，连这个官网，都在同一个开源仓库里。以 AGPL-3.0 发布：可以自由使用、修改、部署在自己的服务器上；改过的版本拿去对外提供服务，也要公开源代码。",
      points: ["没有付费版，也没有锁起来的功能", "你的财务数据不会经过我们的服务器", "欢迎提问题、提改进"],
      repoDescription: "独立开发者的一人公司控制台：任务、时间和副业收支放在一起。",
      stars: "Star",
      forks: "Fork",
      updated: "最近推送 {date}",
      terminal: "终端",
      terminalNote: "本地开发：页面和接口一起跑，访问口令会打印在终端里。",
      copy: "复制命令",
      copied: "已复制",
      commitsTitle: "最近的提交",
      allCommits: "查看全部提交",
      commitAria: "在 GitHub 上查看提交 {sha}",
    },

    scenarios: {
      title: "这些问题，DeverDesk 替你算好了",
      subtitle: "每个独立开发者都问过自己几次。",
      cards: [
        { q: "模板商城这个月进了 3200，可我到底花了多少小时？", a: "副业页：本月净收入、投入时间和时薪并排放" },
        { q: "接口中转和写博客，哪个更值得周末的时间？", a: "概览：按副业拆开比时薪" },
        { q: "客户说月底打款，今天几号了？", a: "收支：待到账固定在最上面，过期会提醒" },
        { q: "今天排了 9 小时的活，可我只有 5 小时。", a: "今天：容量条把超出的部分标出来" },
        { q: "上周到底干了些什么？", a: "回顾：每周自动写好一段小结" },
        { q: "说好每天写 500 字，坚持了几天？", a: "例行：连续期数和打卡格子" },
        { q: "这个想法，值得开个新副业吗？", a: "副业：先放进「构思」，记下投入再决定" },
        { q: "手机上想到的事，回到电脑前就忘了。", a: "在线版：手机随手记，电脑上接着排" },
        { q: "我的收入数据，能不能不放在别人的服务器上？", a: "自己部署：数据在你自己的 Cloudflare" },
        { q: "月目标 8000，现在走到哪了？", a: "今天：本月净收入对照目标" },
      ],
    },

    faq: {
      title: "常见问题",
      subtitle: "没找到答案？",
      askLink: "在 GitHub 上提个问题",
      groups: {
        product: {
          title: "产品",
          items: [
            {
              q: "DeverDesk 要钱吗？",
              a: "不要。DeverDesk 以 AGPL-3.0 开源，本地版打开就能用；在线版部署在你自己的 Cloudflare 账号上，个人用量在免费额度之内。",
            },
            {
              q: "本地版和在线版有什么区别？",
              a: "本地版的数据只存在这台设备的浏览器里，不用注册，也不能多设备同步；在线版部署在你自己的 Cloudflare 上，手机和电脑自动同步，断网也能用。两个版本是同一套代码。",
            },
            {
              q: "时薪是怎么算的？",
              a: "一段时间里已到账的收入减去支出，得到净收入，再除以同一段时间里记下的投入时间。待到账的钱先不算，到账以后才计入。",
            },
            {
              q: "支持哪些语言和货币？",
              a: "界面有中文和英文，第一次打开按浏览器语言选。记账币种单独设置，可选人民币、美元、欧元、英镑、日元、港币、新台币、新加坡元、加元和澳元。",
            },
          ],
        },
        deploy: {
          title: "部署",
          items: [
            {
              q: "部署在线版需要什么？",
              a: "一个 Cloudflare 账号和一个 GitHub 账号。点「部署到 Cloudflare」，授权以后 Cloudflare 会复制仓库、建好 D1 数据库，你设一个访问口令就能用。",
            },
            {
              q: "Cloudflare 的免费额度够用吗？",
              a: "够一个人用。在线版只有一个 Worker 和一个 D1 数据库，日常读写远低于免费额度。",
            },
            {
              q: "能用自己的域名吗？",
              a: "能。部署完在 Cloudflare 后台找到这个 Worker，在它的设置里加上自定义域名。",
            },
            {
              q: "怎么从本地版搬到在线版？",
              a: "在本地版的头像菜单里选「导出备份」，再到在线版里选「导入备份」。",
            },
          ],
        },
        openSource: {
          title: "开源与许可",
          items: [
            {
              q: "AGPL-3.0 对我意味着什么？",
              a: "个人和公司都可以免费使用、修改、自己部署。只有把改过的版本拿去给别人提供在线服务时，才需要把改动的源代码也公开。",
            },
            {
              q: "我的数据会被收集吗？",
              a: "不会。本地版的数据只在你的浏览器里，在线版的数据在你自己的 Cloudflare 账号里，都不经过我们的服务器。",
            },
            {
              q: "怎么参与？",
              a: "在 GitHub 上提问题、提改进都欢迎；动手改代码之前，先看一眼贡献指南。",
            },
          ],
        },
      },
    },

    cta: {
      title: "把你的一人公司，搬上一张桌子。",
      body: "先打开演示站用起来，数据只存在你的浏览器里；想多设备同步，就部署到你自己的 Cloudflare。",
      collageAlt: "DeverDesk 的几个页面截图",
    },
  },

  changelog: {
    title: "更新日志",
    subtitle: "DeverDesk 的每一次更新。每一条都能在 GitHub 上找到对应的提交。",
    releases: "{n} 个版本",
    lastUpdated: "最近更新 {date}",
    watch: "在 GitHub 上关注",
    kinds: {
      new: "新增",
      improved: "改进",
      fixed: "修复",
    },
    commits: "对应提交",
    commitAria: "在 GitHub 上查看提交 {sha}",
    shotAlt: "{version} 的界面截图",
    subscribe: {
      title: "第一时间知道更新",
      body: "在 GitHub 上 Watch 这个仓库、选「Releases」，发新版时会收到通知。",
    },
  },

  blog: {
    title: "博客",
    subtitle: "关于一人公司、副业时薪和自己部署的一些记录。",
    featured: "置顶",
    more: "更多文章",
    searchLabel: "搜索文章",
    searchPlaceholder: "搜索文章",
    allTags: "全部",
    count: "{n} 篇文章",
    empty: "没有找到和「{q}」有关的文章。",
    clear: "清除搜索",
    toc: "目录",
    back: "所有文章",
    published: "发布于 {date}",
    editPost: "在 GitHub 上编辑这篇文章",
    newer: "更新的一篇",
    older: "更早的一篇",
    ctaTitle: "看完了？直接用起来。",
    ctaBody: "演示站不用注册，数据只存在你的浏览器里。",
    tags: {
      product: "产品",
      guide: "教程",
      "open-source": "开源",
      method: "方法",
    },
  },

  notFound: {
    title: "页面不存在",
    body: "这个地址没有内容，可能已经换了地方。",
    home: "回到首页",
  },
}

export type Messages = typeof zh
