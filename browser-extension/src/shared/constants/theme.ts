// 工作组/标签默认色与调色板（避免魔法字符串散落在多组件）

export const DEFAULT_WORKSPACE_COLOR = '#409EFF'

export const TAG_COLOR_PALETTE = [
  '#409EFF',
  '#67C23A',
  '#E6A23C',
  '#F56C6C',
  '#909399',
  '#9B59B6',
  '#16A085',
  '#E84393',
] as const

/** 浏览器标签组颜色名 → 展示色 */
export const CHROME_GROUP_COLORS: Record<string, string> = {
  grey: '#5F6368',
  blue: '#1A73E8',
  red: '#D93025',
  yellow: '#F9AB00',
  green: '#188038',
  pink: '#D01884',
  purple: '#9334E6',
  cyan: '#007B83',
  orange: '#FA903E',
}

/** 浏览器标签组颜色名 → 展开口径的色值（取不到时回退灰） */
export function chromeGroupColor(color?: string): string {
  return (color && CHROME_GROUP_COLORS[color]) || CHROME_GROUP_COLORS.grey
}

/** 统一色值格式：后端历史数据可能不带 `#` 前缀，缺失时回退灰 */
export function normalizeColor(color?: string, fallback = '#909399'): string {
  if (!color) return fallback
  return color.startsWith('#') ? color : `#${color}`
}

