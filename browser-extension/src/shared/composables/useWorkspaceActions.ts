import { ElMessage, ElMessageBox } from 'element-plus'
import { sendMessage } from './useMessage'
import type { Workspace } from '../types'
import { getDeleteImpact } from '../utils/workspace-tree'

/**
 * 工作组相关操作的统一封装，避免删除逻辑（确认弹窗 + 影响统计 + 调用 + 提示）
 * 在多个视图中重复实现。
 */
export function useWorkspaceActions() {
  /**
   * 删除工作组（含整棵子树）。统一处理：默认分组拦截、影响范围统计、确认弹窗、调用后端、结果提示。
   * @returns 是否删除成功（成功时调用方自行刷新列表，如 loadWorkspaces）。
   */
  async function confirmDeleteWorkspace(
    workspaces: Workspace[],
    ws: Workspace,
    defaultWorkspaceId: string,
  ): Promise<boolean> {
    // 默认分组不可删除，请先更改默认分组
    if (ws.id === defaultWorkspaceId) {
      ElMessage.warning('默认分组不可删除，请先更改默认分组')
      return false
    }

    const { childCount, tabCount } = getDeleteImpact(workspaces, ws.id)
    try {
      await ElMessageBox.confirm(
        `确定要删除工作组「${ws.name}」吗？其 ${childCount} 个子工作组及全部 ${tabCount} 个标签页将一并删除，且不可恢复。`,
        '删除工作组',
        { type: 'warning' },
      )
    } catch {
      return false
    }

    const res = await sendMessage({
      action: 'DELETE_WORKSPACE',
      payload: { id: ws.id, defaultWorkspaceId },
    })
    if (res.success) {
      ElMessage.success('工作组已删除')
      return true
    }
    ElMessage.error(res.error || '删除失败')
    return false
  }

  return { confirmDeleteWorkspace }
}
