import type { InjectionKey } from 'vue'
import type { DashboardTarget } from '../utils/dashboard-links'

/** 实体芯片点击跳转：管理面板注入 router 实现，其他页面缺省打开管理面板标签页 */
export type EntityNavigation = (target: DashboardTarget) => void

export const ENTITY_NAVIGATION: InjectionKey<EntityNavigation> = Symbol('entity-navigation')
