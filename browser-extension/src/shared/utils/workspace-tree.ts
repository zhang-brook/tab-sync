import type { Workspace } from '../types'

/** 工作组树节点 */
export interface WorkspaceTreeNode {
  id: string
  parentId: string
  name: string
  color: string
  icon?: string
  /** 当前工作组直接包含的标签页数量 */
  tabCount: number
  /** 原始工作组对象 */
  workspace: Workspace
  children: WorkspaceTreeNode[]
}

/**
 * 将扁平的工作组列表构建为树结构。
 * 约定：parentId 为空字符串 / undefined / 指向不存在的节点，均视为根级。
 */
export function buildWorkspaceTree(workspaces: Workspace[]): WorkspaceTreeNode[] {
  const nodeMap = new Map<string, WorkspaceTreeNode>()

  for (const ws of workspaces) {
    nodeMap.set(ws.id, {
      id: ws.id,
      parentId: ws.parentId || '',
      name: ws.name,
      color: ws.color,
      icon: ws.icon,
      tabCount: ws.tabs?.length ?? 0,
      workspace: ws,
      children: [],
    })
  }

  const roots: WorkspaceTreeNode[] = []
  for (const node of nodeMap.values()) {
    const parent = node.parentId ? nodeMap.get(node.parentId) : undefined
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // 按名称稳定排序
  const sortNodes = (nodes: WorkspaceTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    nodes.forEach((n) => sortNodes(n.children))
  }
  sortNodes(roots)

  return roots
}

/**
 * 收集某个工作组的所有后代 id（不含自身）。
 */
export function collectDescendantIds(workspaces: Workspace[], rootId: string): string[] {
  const childrenMap = new Map<string, string[]>()
  for (const ws of workspaces) {
    const pid = ws.parentId || ''
    if (!childrenMap.has(pid)) childrenMap.set(pid, [])
    childrenMap.get(pid)!.push(ws.id)
  }

  const result: string[] = []
  const stack = [...(childrenMap.get(rootId) ?? [])]
  while (stack.length) {
    const id = stack.pop()!
    result.push(id)
    const children = childrenMap.get(id)
    if (children) stack.push(...children)
  }
  return result
}
