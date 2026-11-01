/** el-tree 内部节点（Element Plus 未公开 store 节点类型，这里只声明用到的成员） */
interface ElTreeStoreNode {
  expanded: boolean
  childNodes: ElTreeStoreNode[]
  expand: (callback?: (() => void) | null, expandParent?: boolean) => void
  collapse: () => void
}

/** el-tree 实例中用于遍历全部节点的最小结构 */
interface ElTreeLike {
  store?: {
    root?: ElTreeStoreNode
  }
}

/**
 * 展开或折叠 el-tree 的全部节点。
 * Element Plus 未提供全量展开/折叠的公开方法，这里遍历 store 中已渲染的节点逐个处理。
 */
export function setTreeNodesExpanded(tree: ElTreeLike | null | undefined, expanded: boolean): void {
  const root = tree?.store?.root
  if (!root) return
  const walk = (node: ElTreeStoreNode) => {
    for (const child of node.childNodes ?? []) {
      if (expanded) child.expand()
      else child.collapse()
      walk(child)
    }
  }
  walk(root)
}

/**
 * 是否所有可展开节点都处于展开态。
 * 没有任何可展开节点（空树/单层树）时返回 false，让切换按钮保持「全部展开」的动作语义。
 */
export function isTreeFullyExpanded(tree: ElTreeLike | null | undefined): boolean {
  const root = tree?.store?.root
  if (!root) return false
  let hasExpandable = false
  let allExpanded = true
  const walk = (node: ElTreeStoreNode) => {
    for (const child of node.childNodes ?? []) {
      if ((child.childNodes?.length ?? 0) > 0) {
        hasExpandable = true
        if (!child.expanded) allExpanded = false
      }
      walk(child)
    }
  }
  walk(root)
  return hasExpandable && allExpanded
}
