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
