import { sendMessage } from '../composables/useMessage'
import type { FetchFaviconData } from '../types/messages'

/**
 * 通过 Background Service Worker 代理抓取 favicon，返回 data URL。
 * - 走 SW 跨域 fetch（扩展声明了 <all_urls> 权限），避免直接依赖第三方跨域加载；
 * - 图片不落后端，不占存储/带宽。失败返回 null，由调用方回退到原始 URL。
 */
export async function fetchFavicon(url: string): Promise<string | null> {
  try {
    const res = await sendMessage<FetchFaviconData>({
      action: 'FETCH_FAVICON',
      payload: { url },
    })
    if (res.success && res.data?.dataUrl) return res.data.dataUrl
    return null
  } catch {
    return null
  }
}
