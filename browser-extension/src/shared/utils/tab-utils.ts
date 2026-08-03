/** 生成 UUID v4 */
export function generateUUID(): string {
  return crypto.randomUUID()
}

/**
 * 在当前窗口的激活标签页之后打开一个新标签页，
 * 使重新打开的标签页紧跟在当前正在看的标签后面，而不是追加到窗口末尾。
 * @param offset 偏移量，0 = 紧跟激活标签之后；批量打开时递增以在激活标签后保持顺序
 * @returns 新建的标签页；若无法获取激活标签则回退为默认（追加到末尾）
 */
export async function openTabAfterActive(url: string, offset = 0): Promise<chrome.tabs.Tab | undefined> {
  let index: number | undefined
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (active && typeof active.index === 'number') {
      index = active.index + 1 + offset
    }
  } catch {
    index = undefined
  }
  return chrome.tabs.create(index != null ? { url, index } : { url })
}

/**
 * 批量在当前窗口的激活标签页之后打开多个新标签页。
 * 创建时不激活新标签（保持原激活标签不变），逐个在激活标签之后指定位置创建，
 * 避免创建过程中激活状态变化导致的索引漂移；全部创建完成后再激活。
 * @param urls 要打开的 URL 列表，按顺序在激活标签之后依次创建
 * @returns 所有新建的标签页
 */
export async function openTabsAfterActive(urls: string[]): Promise<chrome.tabs.Tab[]> {
  if (urls.length === 0) return []

  // 只查询一次激活标签索引
  let baseIndex: number | undefined
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (active && typeof active.index === 'number') {
      baseIndex = active.index
    }
  } catch {
    baseIndex = undefined
  }

  // 创建时不激活（active: false），保持原激活标签不变，逐个在激活标签之后指定位置创建
  const tabs: chrome.tabs.Tab[] = []
  for (let i = 0; i < urls.length; i++) {
    const index = baseIndex != null ? baseIndex + 1 + i : undefined
    const tab = await chrome.tabs.create(
      index != null ? { url: urls[i], index, active: false } : { url: urls[i], active: false },
    )
    tabs.push(tab)
  }

  // 全部创建完成后，激活最后打开的标签页
  const last = tabs[tabs.length - 1]
  if (last?.id != null) {
    await chrome.tabs.update(last.id, { active: true })
  }

  return tabs
}
