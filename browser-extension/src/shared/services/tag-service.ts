import { callService } from './message'
import type { TagInfo, TagsData, TagTabsData, TagTabItem } from '../types'

export type TagScope = 'tab' | 'workspace'

export async function listTags(scope?: TagScope): Promise<TagInfo[]> {
  const data = await callService<TagsData>({
    action: 'GET_TAGS',
    payload: scope ? { scope } : undefined,
  })
  return data.tags
}

export async function createTag(payload: {
  name: string
  color?: string
  scope: TagScope
  description?: string
}): Promise<TagInfo> {
  return callService<TagInfo>({ action: 'CREATE_TAG', payload })
}

export async function updateTag(
  tagId: number,
  payload: { name?: string; color?: string; description?: string },
): Promise<TagInfo> {
  return callService<TagInfo>({ action: 'UPDATE_TAG', payload: { tagId, ...payload } })
}

export async function deleteTag(tagId: number): Promise<void> {
  await callService({ action: 'DELETE_TAG', payload: { tagId } })
}

export async function addTabTag(workspaceId: string, tabId: string, tagId: number): Promise<void> {
  await callService({ action: 'ADD_TAB_TAG', payload: { workspaceId, tabId, tagId } })
}

export async function removeTabTag(workspaceId: string, tabId: string, tagId: number): Promise<void> {
  await callService({ action: 'REMOVE_TAB_TAG', payload: { workspaceId, tabId, tagId } })
}

export async function addWorkspaceTag(workspaceId: string, tagId: number): Promise<void> {
  await callService({ action: 'ADD_WORKSPACE_TAG', payload: { workspaceId, tagId } })
}

export async function removeWorkspaceTag(workspaceId: string, tagId: number): Promise<void> {
  await callService({ action: 'REMOVE_WORKSPACE_TAG', payload: { workspaceId, tagId } })
}

export async function listTagTabs(tagId: number): Promise<TagTabItem[]> {
  const data = await callService<TagTabsData>({ action: 'GET_TAG_TABS', payload: { tagId } })
  return data.tabs
}
