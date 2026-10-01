// 金额类数字的输出口径：收入、支出、净收入、时薪这些加减或相除之后的结果，
// 一律四舍五入到分再给 AI，避免 108.78999999999999 这种浮点尾数原样传出去。

/** 四舍五入到两位小数；-0 统一成 0 */
export function roundMoney(value: number): number {
  const rounded = Math.round(value * 100) / 100
  return rounded === 0 ? 0 : rounded
}
