/** 快速添加识别出的标记怎么显示 */
export const quickAdd = {
  minutes: (n: number) => `${n} 分钟`,
  hours: (n: number) => `${n} 小时`,
  priority: { 2: "中优先", 3: "高优先", 4: "紧急" } as Record<2 | 3 | 4, string>,
}
