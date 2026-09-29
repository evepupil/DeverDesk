/** 时长全写、百分点 */
export const format = {
  minutes: (n: number) => `${n} 分钟`,
  hours: (n: number) => `${n} 小时`,
  hoursMinutes: (hours: number, minutes: number) => `${hours} 小时 ${minutes} 分钟`,
  flat: "持平",
  /** value 已带正负号，如 +0.4 */
  points: (value: string) => `${value} 个点`,
  /** 金额输入框标签里的单位：有习惯叫法的币种写叫法（人民币写「元」），没有的返回 null，改用货币符号 */
  currencyUnit: (code: string): string | null => (code === "CNY" ? "元" : null),
}
