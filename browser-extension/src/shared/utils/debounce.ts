/**
 * 创建一个防抖函数，对每个 key 独立防抖
 * 用于标签页事件：每个 tabId 独立防抖，互不影响
 */
export function createKeyedDebounce<T>(
  handler: (key: string, value: T) => void,
  delay: number,
) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  return (key: string, value: T) => {
    const existing = timers.get(key)
    if (existing != null) {
      clearTimeout(existing)
    }
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key)
        handler(key, value)
      }, delay),
    )
  }
}
