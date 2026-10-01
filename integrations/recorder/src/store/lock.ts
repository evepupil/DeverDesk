// 锁文件（wx 方式创建，超过 staleMs 当作残留）。规格见 docs/模块设计/本机记录器.md。
// 占位：由「记录器外壳」那一路实现。

/** 拿到锁就执行 fn 并释放；拿不到（别人持有且没过期）返回 null */
export async function withLock<T>(path: string, staleMs: number, fn: () => Promise<T>): Promise<{ value: T } | null> {
  void path
  void staleMs
  void fn
  throw new Error("withLock 还没实现")
}
