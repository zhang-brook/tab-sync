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
