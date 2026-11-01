/** 常见两级公共后缀：命中时根域名再多取一级（example.co.uk 不拆成 co.uk） */
const TWO_LEVEL_SUFFIXES = new Set([
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
  'com.hk', 'com.tw', 'com.mo', 'com.sg', 'com.br', 'com.mx', 'com.tr',
  'com.au', 'net.au', 'org.au', 'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'co.jp', 'ne.jp', 'or.jp', 'co.kr', 'or.kr', 'co.nz', 'co.in', 'co.za',
])

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/

/**
 * 计算主机名所属的根域名：
 * - IP、单标签主机名（如 localhost）原样返回
 * - 常规域名取最后两级（www.deepseek.com → deepseek.com）
 * - 命中常见两级公共后缀时多取一级（a.example.co.uk → example.co.uk）
 */
export function rootDomainOf(host: string): string {
  const value = host.trim().toLowerCase().replace(/\.$/, '')
  if (!value) return ''
  if (value.includes(':') || IPV4_RE.test(value)) return value
  const parts = value.split('.')
  if (parts.length <= 2) return value
  const lastTwo = parts.slice(-2).join('.')
  if (TWO_LEVEL_SUFFIXES.has(lastTwo) && parts.length >= 3) return parts.slice(-3).join('.')
  return lastTwo
}
