import { STORAGE_KEYS } from './keys'
import type { TabRecord, TabEvent, Workspace, AuthUser, SyncState } from '../types'

/** chrome.storage.local 数据结构映射 */
interface StorageSchema {
  [STORAGE_KEYS.AUTH_TOKEN]: string | null
  [STORAGE_KEYS.AUTH_USER]: AuthUser | null
  [STORAGE_KEYS.DEVICE_ID]: string | null
  [STORAGE_KEYS.DEVICE_NAME]: string | null
  [STORAGE_KEYS.TAB_RECORDS]: Record<string, TabRecord>
  [STORAGE_KEYS.TAB_ID_MAP]: Record<number, string>
  [STORAGE_KEYS.SYNC_STATE]: SyncState
  [STORAGE_KEYS.PENDING_EVENTS]: TabEvent[]
  [STORAGE_KEYS.WORKSPACES]: Workspace[]
  [STORAGE_KEYS.API_BASE_URL]: string
  [STORAGE_KEYS.SYNC_INTERVAL]: number
}

/** 默认值 */
const DEFAULTS: StorageSchema = {
  [STORAGE_KEYS.AUTH_TOKEN]: null,
  [STORAGE_KEYS.AUTH_USER]: null,
  [STORAGE_KEYS.DEVICE_ID]: null,
  [STORAGE_KEYS.DEVICE_NAME]: null,
  [STORAGE_KEYS.TAB_RECORDS]: {},
  [STORAGE_KEYS.TAB_ID_MAP]: {},
  [STORAGE_KEYS.SYNC_STATE]: {
    lastSyncAt: null,
    pendingEvents: [],
    status: 'idle',
  },
  [STORAGE_KEYS.PENDING_EVENTS]: [],
  [STORAGE_KEYS.WORKSPACES]: [],
  [STORAGE_KEYS.API_BASE_URL]: '',
  [STORAGE_KEYS.SYNC_INTERVAL]: 5,
}

/**
 * 类型安全的 chrome.storage.local 封装
 */
export const storage = {
  /** 获取单个值 */
  async get<K extends keyof StorageSchema>(key: K): Promise<StorageSchema[K]> {
    const result = await chrome.storage.local.get(key)
    return (result[key] ?? DEFAULTS[key]) as StorageSchema[K]
  },

  /** 设置单个值 */
  async set<K extends keyof StorageSchema>(key: K, value: StorageSchema[K]): Promise<void> {
    await chrome.storage.local.set({ [key]: value })
  },

  /** 批量获取 */
  async getMultiple<K extends keyof StorageSchema>(keys: K[]): Promise<Pick<StorageSchema, K>> {
    const result = await chrome.storage.local.get(keys)
    const output = {} as Pick<StorageSchema, K>
    for (const key of keys) {
      (output as Record<string, unknown>)[key] = result[key] ?? DEFAULTS[key]
    }
    return output
  },

  /** 批量设置 */
  async setMultiple(items: Partial<StorageSchema>): Promise<void> {
    await chrome.storage.local.set(items)
  },

  /** 移除单个值 */
  async remove(key: keyof StorageSchema): Promise<void> {
    await chrome.storage.local.remove(key)
  },

  /** 清除所有数据 */
  async clear(): Promise<void> {
    await chrome.storage.local.clear()
  },

  /** 监听存储变化 */
  onChange(callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        callback(changes)
      }
    })
  },
}
