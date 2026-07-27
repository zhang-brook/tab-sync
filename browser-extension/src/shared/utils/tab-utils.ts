/** 生成 UUID v4 */
export function generateUUID(): string {
  return crypto.randomUUID()
}

/** 获取当前时间的 ISO 字符串 */
export function nowISO(): string {
  return new Date().toISOString()
}

/**
 * 清洗 favIconUrl，过滤 data: URI 等内联图片数据
 * 避免 data:image/svg+xml 等超大内联数据撑大报文
 */
export function sanitizeFavIconUrl(url: string | undefined): string {
  if (!url) return ''
  // 过滤 data: URI（data:image/png、data:image/svg+xml 等）
  if (url.startsWith('data:')) return ''
  return url
}

/**
 * 在当前窗口的激活标签页之后打开一个新标签页。
 * 对应早期 tab-manager 的 openTab(url):
 *   chrome.tabs.create({ index: activeTab.index + 1, url })
 * 这样重新打开的标签页会紧跟在当前正在看的标签后面，而不是追加到窗口末尾。
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
