import type { zhCN } from "./zh-CN"

/** 词条的形状以中文为准；其它语言照着补齐，少一条、多一条或参数不对都会类型检查报错 */
export type Messages = typeof zhCN
