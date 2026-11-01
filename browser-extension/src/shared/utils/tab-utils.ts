import { logger } from './logger'

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

/** 将 hex 颜色映射为 Chrome 标签组颜色名称（取最接近的预设色） */
export function mapHexToTabGroupColor(hex: string): chrome.tabGroups.Color {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  // 计算与各 Chrome 预设颜色 (近似值) 的欧氏距离，取最接近的
  const presetColors: Array<{ name: chrome.tabGroups.Color; r: number; g: number; b: number }> = [
    { name: chrome.tabGroups.Color.GREY, r: 128, g: 128, b: 128 },
    { name: chrome.tabGroups.Color.BLUE, r: 66, g: 133, b: 244 },
    { name: chrome.tabGroups.Color.RED, r: 219, g: 68, b: 55 },
    { name: chrome.tabGroups.Color.YELLOW, r: 244, g: 180, b: 0 },
    { name: chrome.tabGroups.Color.GREEN, r: 15, g: 157, b: 88 },
    { name: chrome.tabGroups.Color.PINK, r: 233, g: 30, b: 99 },
    { name: chrome.tabGroups.Color.PURPLE, r: 154, g: 50, b: 211 },
    { name: chrome.tabGroups.Color.CYAN, r: 82, g: 196, b: 196 },
    { name: chrome.tabGroups.Color.ORANGE, r: 251, g: 140, b: 0 },
  ]

  let minDist = Infinity
  let closest: chrome.tabGroups.Color = chrome.tabGroups.Color.BLUE
  for (const preset of presetColors) {
    const dr = r - preset.r
    const dg = g - preset.g
    const db = b - preset.b
    const dist = dr * dr + dg * dg + db * db
    if (dist < minDist) {
      minDist = dist
      closest = preset.name
    }
  }
  return closest
}

export interface OpenTabUrlsOptions {
  /** 在新窗口中打开；否则追加到当前窗口的激活标签之后 */
  newWindow?: boolean
  /** 全部打开后归入同一个标签组 */
  asTabGroup?: boolean
  /** 标签组标题（asTabGroup 时生效） */
  groupTitle?: string
  /** 标签组颜色（asTabGroup 时生效，默认蓝色） */
  groupColor?: chrome.tabGroups.Color
}

/**
 * 打开一组 URL：「打开工作组」与域名树使用同一套行为——
 * 当前窗口追加到激活标签之后 / 新窗口按顺序创建 / 可整体归入标签组。
 * @returns 成功打开的标签页数量
 */
export async function openTabUrls(
  urls: string[],
  options: OpenTabUrlsOptions = {},
): Promise<number> {
  const { newWindow, asTabGroup, groupTitle, groupColor } = options
  if (urls.length === 0) return 0

  const tabIds: number[] = []
  let windowId: number | undefined
  let opened = 0

  if (newWindow) {
    // 先用第一个标签页创建窗口，其余在该窗口中依次创建，保证打开顺序
    const win = await chrome.windows.create({ url: urls[0] })
    opened++
    if (win?.tabs?.[0]?.id != null) tabIds.push(win.tabs[0].id)
    windowId = win?.id
    for (let i = 1; i < urls.length; i++) {
      const tab = await chrome.tabs.create({ url: urls[i], windowId: win?.id })
      opened++
      if (tab?.id != null) tabIds.push(tab.id)
    }
  } else {
    const tabs = await openTabsAfterActive(urls)
    opened = tabs.length
    windowId = tabs[0]?.windowId
    for (const tab of tabs) {
      if (tab.id != null) tabIds.push(tab.id)
    }
  }

  if (asTabGroup && tabIds.length > 1) {
    try {
      const groupOptions: chrome.tabs.GroupOptions = { tabIds: tabIds as [number, ...number[]] }
      if (windowId != null) groupOptions.createProperties = { windowId }
      const groupId = await chrome.tabs.group(groupOptions)
      await chrome.tabGroups.update(groupId, {
        ...(groupTitle ? { title: groupTitle } : {}),
        color: groupColor ?? chrome.tabGroups.Color.BLUE,
        collapsed: false,
      })
    } catch (e) {
      // 分组失败不影响整体操作
      logger.warn('Failed to create tab group:', e)
    }
  }

  return opened
}
