import type {
  Cadence,
  Channel,
  EntryStatus,
  ExpenseCategory,
  IncomeCategory,
  Priority,
  ProjectStage,
  TaskStatus,
} from "../../../domain/types"

/** 状态、分类、渠道等固定叫法 */
export const catalog = {
  taskStatus: {
    backlog: "想法",
    todo: "待办",
    doing: "进行中",
    done: "已完成",
    dropped: "已搁置",
  } satisfies Record<TaskStatus, string>,
  priority: { 0: "无优先级", 1: "低", 2: "中", 3: "高", 4: "紧急" } satisfies Record<Priority, string>,
  priorityShort: { 0: "无", 1: "低", 2: "中", 3: "高", 4: "紧急" } satisfies Record<Priority, string>,
  projectStage: {
    idea: "构思",
    building: "搭建中",
    running: "运营中",
    paused: "暂停",
    ended: "已结束",
  } satisfies Record<ProjectStage, string>,
  cadence: { daily: "每天", weekdays: "工作日", weekly: "每周", monthly: "每月" } satisfies Record<Cadence, string>,
  /** 例行的「这一期」怎么说 */
  cadencePeriod: { daily: "今天", weekdays: "今天", weekly: "本周", monthly: "本月" } satisfies Record<Cadence, string>,
  channel: {
    alipay: "支付宝",
    wechat: "微信",
    bank: "银行转账",
    platform: "平台结算",
    card: "信用卡",
  } satisfies Record<Channel, string>,
  income: {
    sales: "销售",
    subscription: "订阅",
    sponsor: "赞助",
    consulting: "咨询",
    ads: "广告",
    "other-income": "其他收入",
  } satisfies Record<IncomeCategory, string>,
  expense: {
    server: "服务器",
    domain: "域名",
    ai: "模型接口",
    tools: "工具订阅",
    design: "设计素材",
    marketing: "推广",
    "other-expense": "其他支出",
  } satisfies Record<ExpenseCategory, string>,
  entryStatus: { pending: "待到账", received: "已到账", refunded: "已退款" } satisfies Record<EntryStatus, string>,
  /** 记账币种的名字，键是 ISO 4217 代码 */
  currency: {
    CNY: "人民币",
    USD: "美元",
    EUR: "欧元",
    GBP: "英镑",
    JPY: "日元",
    HKD: "港币",
    TWD: "新台币",
    SGD: "新加坡元",
    CAD: "加元",
    AUD: "澳元",
  },
}
