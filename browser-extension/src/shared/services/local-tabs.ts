import { chromeGroupColor } from '../constants/theme'
import { logger } from '../utils/logger'
import type { WorkspaceTabPayload } from '../types'

/** 本地浏览器标签页（Chrome tab 的稳定投影，供各端列表复用） */
export interface LocalTab {
  chromeTabId: number
  windowId: number
  /** Chrome 标签组 ID，未分组为 -1 */
  groupId: number
  index: number
  title: string
  url: string
  favIconUrl: string
  active: boolean
}

export interface LocalTabGroup {
  id: number
  title: string
  /** Chrome 颜色名（blue/red/...） */
  color: string
  colorHex: string
  tabs: LocalTab[]
}

/** 窗口内的连续片段：标签组整体，或一段连续未分组标签页 */
export type LocalTabSegment =
  | { kind: 'group'; key: string; group: LocalTabGroup }
  | { kind: 'tabs'; key: string; tabs: LocalTab[] }

export interface LocalTabWindow {
  id: number
  /** 展示序号（1-based） */
  order: number
  isCurrent: boolean
  segments: LocalTabSegment[]
  tabCount: number
}

export interface LocalTabFilter {
  keyword?: string
  /** 'all' 或具体窗口 ID */
  windowId?: number | 'all'
}

/** 可转换为云端标签页引用的最小字段集（LocalTab / chrome.tabs.Tab 均可适配） */
export interface TabPayloadSource {
  chromeTabId: number
  url?: string
  title?: string
  favIconUrl?: string
}

/** 仅 http(s)/file 页面可收藏，浏览器内置页面不支持 */
export function isSavableUrl(url?: string): boolean {
  if (!url) return false
  try {
    return ['http:', 'https:', 'file:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

/** chrome.tabs.Tab → 保存载荷来源（无 id 的标签页按 0 处理，后续过滤仍按 URL 协议） */
export function fromChromeTabs(tabs: readonly chrome.tabs.Tab[]): TabPayloadSource[] {
  return tabs.map((tab) => ({
    chromeTabId: tab.id ?? 0,
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
  }))
}

/** 本地标签页 → 后端标签页载荷；不可收藏的页面返回 null */
export function toWorkspaceTabPayload(tab: TabPayloadSource): WorkspaceTabPayload | null {
  if (!isSavableUrl(tab.url)) return null
  return {
    url: tab.url ?? '',
    title: tab.title || tab.url || '',
    favIconUrl: tab.favIconUrl ?? '',
    chromeTabId: tab.chromeTabId,
  }
}

function toLocalTab(tab: chrome.tabs.Tab, windowId: number): LocalTab | null {
  if (tab.id == null) return null
  return {
    chromeTabId: tab.id,
    windowId,
    groupId: tab.groupId ?? -1,
    index: tab.index ?? 0,
    title: tab.title ?? '',
    url: tab.url || tab.pendingUrl || '',
    favIconUrl: tab.favIconUrl ?? '',
    active: !!tab.active,
  }
}

function buildSegments(
  windowId: number,
  tabs: LocalTab[],
  groupMap: Map<number, chrome.tabGroups.TabGroup>,
): LocalTabSegment[] {
  const segments: LocalTabSegment[] = []
  let current: LocalTabSegment | null = null

  for (const tab of tabs) {
    const grouped = tab.groupId > 0
    if (grouped) {
      if (current?.kind === 'group' && current.group.id === tab.groupId) {
        current.group.tabs.push(tab)
        continue
      }
      const info = groupMap.get(tab.groupId)
      current = {
        kind: 'group',
        key: `g-${windowId}-${tab.groupId}-${tab.chromeTabId}`,
        group: {
          id: tab.groupId,
          title: info?.title ?? '',
          color: info?.color ?? 'grey',
          colorHex: chromeGroupColor(info?.color),
          tabs: [tab],
        },
      }
      segments.push(current)
    } else {
      if (current?.kind === 'tabs') {
        current.tabs.push(tab)
        continue
      }
      current = { kind: 'tabs', key: `t-${windowId}-${tab.chromeTabId}`, tabs: [tab] }
      segments.push(current)
    }
  }

  return segments
}

function countTabs(segments: LocalTabSegment[]): number {
  return segments.reduce(
    (sum, seg) => sum + (seg.kind === 'group' ? seg.group.tabs.length : seg.tabs.length),
    0,
  )
}

/** 查询所有普通窗口的标签页，组装成「窗口 → 连续片段（分组/未分组）」结构 */
export async function queryLocalWindows(): Promise<{
  windows: LocalTabWindow[]
  currentWindowId: number | null
}> {
  const [chromeWindows, groups, current] = await Promise.all([
    chrome.windows.getAll({ populate: true, windowTypes: ['normal'] }),
    chrome.tabGroups.query({}),
    chrome.windows.getCurrent().catch(() => null),
  ])

  const groupMap = new Map(groups.map((g) => [g.id, g]))
  const currentWindowId = current?.id ?? null

  const windows: LocalTabWindow[] = []
  chromeWindows.forEach((win, idx) => {
    if (win.id == null) return
    const tabs = (win.tabs ?? [])
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((t) => toLocalTab(t, win.id!))
      .filter((t): t is LocalTab => t != null)
    const segments = buildSegments(win.id, tabs, groupMap)
    windows.push({
      id: win.id,
      order: idx + 1,
      isCurrent: win.id === currentWindowId,
      segments,
      tabCount: countTabs(segments),
    })
  })

  return { windows, currentWindowId }
}

/** 应用窗口筛选与关键字过滤；过滤后为空的片段/窗口会被移除 */
export function filterLocalWindows(
  windows: LocalTabWindow[],
  filter: LocalTabFilter = {},
): LocalTabWindow[] {
  const kw = (filter.keyword ?? '').trim().toLowerCase()
  const windowId = filter.windowId ?? 'all'
  const match = (tab: LocalTab) =>
    !kw || tab.title.toLowerCase().includes(kw) || tab.url.toLowerCase().includes(kw)

  const result: LocalTabWindow[] = []
  for (const win of windows) {
    if (windowId !== 'all' && win.id !== windowId) continue
    if (!kw) {
      result.push(win)
      continue
    }
    const segments: LocalTabSegment[] = []
    for (const seg of win.segments) {
      if (seg.kind === 'tabs') {
        const tabs = seg.tabs.filter(match)
        if (tabs.length) segments.push({ ...seg, tabs })
      } else {
        const tabs = seg.group.tabs.filter(match)
        if (tabs.length) segments.push({ ...seg, group: { ...seg.group, tabs } })
      }
    }
    if (segments.length) {
      result.push({ ...win, segments, tabCount: countTabs(segments) })
    }
  }
  return result
}

export function flattenLocalWindows(windows: LocalTabWindow[]): LocalTab[] {
  const tabs: LocalTab[] = []
  for (const win of windows) {
    for (const seg of win.segments) {
      if (seg.kind === 'group') tabs.push(...seg.group.tabs)
      else tabs.push(...seg.tabs)
    }
  }
  return tabs
}

export function segmentTabs(segment: LocalTabSegment): LocalTab[] {
  return segment.kind === 'group' ? segment.group.tabs : segment.tabs
}

export function findLocalTab(windows: LocalTabWindow[], chromeTabId: number): LocalTab | null {
  for (const win of windows) {
    for (const seg of win.segments) {
      const tabs = seg.kind === 'group' ? seg.group.tabs : seg.tabs
      const found = tabs.find((t) => t.chromeTabId === chromeTabId)
      if (found) return found
    }
  }
  return null
}

/** 激活标签页并聚焦其窗口 */
export async function activateLocalTab(tab: LocalTab): Promise<void> {
  try {
    await chrome.tabs.update(tab.chromeTabId, { active: true })
    await chrome.windows.update(tab.windowId, { focused: true })
  } catch (err) {
    logger.debug('激活标签页失败（可能已关闭）:', err)
  }
}

/** 关闭标签页；已关闭的忽略 */
export async function closeLocalTabs(ids: readonly number[]): Promise<void> {
  if (ids.length === 0) return
  try {
    await chrome.tabs.remove([...ids])
  } catch (err) {
    logger.debug('关闭标签页失败（可能已关闭）:', err)
  }
}

/** 移动标签页到窗口内绝对索引 */
export async function moveLocalTab(chromeTabId: number, index: number): Promise<void> {
  try {
    await chrome.tabs.move(chromeTabId, { index })
  } catch (err) {
    logger.debug('移动标签页失败（可能已关闭）:', err)
  }
}

/** 片段内拖拽排序：以片段首个标签页的绝对索引为基准换算目标索引 */
export async function moveTabWithinSegment(
  segment: LocalTabSegment,
  orderedIds: readonly number[],
  movedId: number,
): Promise<void> {
  const tabs = segmentTabs(segment)
  if (tabs.length === 0) return
  const base = Math.min(...tabs.map((t) => t.index))
  const rel = orderedIds.indexOf(movedId)
  if (rel < 0) return
  await moveLocalTab(movedId, base + rel)
}

/** 当前窗口激活的标签页 */
export async function getActiveLocalTab(): Promise<LocalTab | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    return tab ? toLocalTab(tab, tab.windowId) : null
  } catch {
    return null
  }
}

/** 订阅标签页/分组/窗口变化，返回取消订阅函数 */
export function watchLocalTabs(onChange: () => void): () => void {
  type ChromeEvent = {
    // chrome 事件回调签名各不相同，统一为非空参的回调容器
    addListener: (cb: (...args: any[]) => void) => void
    removeListener: (cb: (...args: any[]) => void) => void
  }
  const disposers: Array<() => void> = []
  const add = (ev: ChromeEvent | undefined) => {
    if (!ev) return
    const cb = () => onChange()
    ev.addListener(cb)
    disposers.push(() => ev.removeListener(cb))
  }

  add(chrome.tabs.onCreated)
  add(chrome.tabs.onRemoved)
  add(chrome.tabs.onUpdated)
  add(chrome.tabs.onMoved)
  add(chrome.tabs.onAttached)
  add(chrome.tabs.onDetached)
  add(chrome.tabs.onReplaced)
  add(chrome.tabGroups?.onCreated)
  add(chrome.tabGroups?.onUpdated)
  add(chrome.tabGroups?.onRemoved)
  add(chrome.tabGroups?.onMoved)
  add(chrome.windows.onCreated)
  add(chrome.windows.onRemoved)
  add(chrome.windows.onFocusChanged)

  return () => {
    for (const off of disposers) off()
  }
}
