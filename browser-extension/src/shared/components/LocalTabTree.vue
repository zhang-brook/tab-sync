<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CaretRight, Close, Monitor } from '@element-plus/icons-vue'
import TabList from './TabList.vue'
import { flattenLocalWindows, type LocalTab, type LocalTabGroup, type LocalTabSegment, type LocalTabWindow } from '../services/local-tabs'
import type { TabListItem, TabListMenuEntry, TabListSortEvent, TabRowMeta } from '../types/tab-list'

const props = withDefaults(
  defineProps<{
    windows: LocalTabWindow[]
    selected: Set<number>
    activeTabId?: number | null
    collapsedWindows?: Set<number>
    collapsedGroups?: Set<number>
    menuItems?: TabListMenuEntry[]
    /** 行尾显示关闭按钮 */
    showClose?: boolean
    /** 分组标题前显示多选框 */
    showGroupCheckbox?: boolean
    /** 按场景补充行展示信息（来源工作组标签等） */
    metaForTab?: (tab: LocalTab) => TabRowMeta | undefined
  }>(),
  {
    activeTabId: null,
    collapsedWindows: () => new Set<number>(),
    collapsedGroups: () => new Set<number>(),
    menuItems: () => [],
    showClose: true,
    showGroupCheckbox: true,
  },
)

const emit = defineEmits<{
  (e: 'update:selected', ids: Array<string | number>): void
  (e: 'toggle-window', id: number): void
  (e: 'toggle-group', id: number): void
  (e: 'group-selection', group: LocalTabGroup, checked: boolean): void
  (e: 'activate', tab: LocalTab): void
  (e: 'close', tab: LocalTab): void
  (e: 'sort', payload: { segment: LocalTabSegment; orderedIds: number[]; movedId: number }): void
  (e: 'command', command: string, tab: LocalTab | undefined): void
}>()

const selectedArray = computed<Array<string | number>>(() => Array.from(props.selected))

const rootRef = ref<HTMLElement | null>(null)
let located = false

/** 列表首次渲染出激活行时滚入可视区；后续切换由操作方负责滚动，避免刷新数据时打断用户浏览 */
function locateActiveTab() {
  if (located || props.activeTabId == null) return
  nextTick(() => {
    const el = rootRef.value?.querySelector<HTMLElement>(`[data-tab-id="${props.activeTabId}"]`)
    if (!el) return
    located = true
    el.scrollIntoView({ block: 'center' })
  })
}

watch(() => [props.activeTabId, props.windows], locateActiveTab, { immediate: true })

const tabMap = computed(() => {
  const map = new Map<number, LocalTab>()
  for (const tab of flattenLocalWindows(props.windows)) map.set(tab.chromeTabId, tab)
  return map
})

function tabOf(item: TabListItem): LocalTab | undefined {
  return tabMap.value.get(Number(item.id))
}

function itemsFor(tabs: LocalTab[]): TabListItem[] {
  return tabs.map((tab) => {
    const meta = props.metaForTab?.(tab)
    return {
      id: tab.chromeTabId,
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      ...meta,
    }
  })
}

function groupState(group: LocalTabGroup) {
  const total = group.tabs.length
  const selected = group.tabs.filter((t) => props.selected.has(t.chromeTabId)).length
  return {
    checked: total > 0 && selected === total,
    indeterminate: selected > 0 && selected < total,
  }
}

function onSort(segment: LocalTabSegment, items: TabListItem[], evt: TabListSortEvent) {
  const moved = evt.moved?.element
  if (!moved) return
  emit('sort', {
    segment,
    orderedIds: items.map((i) => Number(i.id)),
    movedId: Number(moved.id),
  })
}

function onCommand(command: string, item: TabListItem) {
  emit('command', command, tabOf(item))
}

function onActivate(item: TabListItem) {
  const tab = tabOf(item)
  if (tab) emit('activate', tab)
}

function onClose(item: TabListItem) {
  const tab = tabOf(item)
  if (tab) emit('close', tab)
}
</script>

<template>
  <div ref="rootRef" class="local-tab-tree">
    <div v-for="win in windows" :key="win.id" class="window-node">
      <div class="node-header window-header" @click="emit('toggle-window', win.id)">
        <el-icon class="expand-icon" :class="{ 'is-expanded': !collapsedWindows.has(win.id) }">
          <CaretRight />
        </el-icon>
        <el-icon class="window-icon"><Monitor /></el-icon>
        <span class="node-title">窗口 {{ win.order }}{{ win.isCurrent ? '（当前）' : '' }}</span>
        <span class="node-count">{{ win.tabCount }}</span>
      </div>

      <div v-show="!collapsedWindows.has(win.id)" class="window-body">
        <template v-for="seg in win.segments" :key="seg.key">
          <div v-if="seg.kind === 'group'" class="group-node">
            <div class="node-header group-header">
              <el-checkbox
                v-if="showGroupCheckbox"
                :model-value="groupState(seg.group).checked"
                :indeterminate="groupState(seg.group).indeterminate"
                @change="(v: string | number | boolean) => emit('group-selection', seg.group, Boolean(v))"
                @click.stop
              />
              <el-icon
                class="expand-icon"
                :class="{ 'is-expanded': !collapsedGroups.has(seg.group.id) }"
                @click="emit('toggle-group', seg.group.id)"
              >
                <CaretRight />
              </el-icon>
              <span class="group-dot" :style="{ backgroundColor: seg.group.colorHex }" />
              <span class="node-title">{{ seg.group.title || '未命名分组' }}</span>
              <span class="node-count">{{ seg.group.tabs.length }}</span>
            </div>
            <div v-show="!collapsedGroups.has(seg.group.id)" class="group-body">
              <TabList
                :items="itemsFor(seg.group.tabs)"
                :selected="selectedArray"
                :active-id="activeTabId"
                :menu-items="menuItems"
                selectable
                sortable
                @update:selected="(ids) => emit('update:selected', ids)"
                @click="onActivate"
                @sort="(items, evt) => onSort(seg, items, evt)"
                @command="onCommand"
              >
                <template #actions="{ item }">
                  <slot name="actions" :item="item" :tab="tabOf(item)" />
                  <el-button v-if="showClose" size="small" text circle title="关闭" @click="onClose(item)">
                    <el-icon><Close /></el-icon>
                  </el-button>
                </template>
              </TabList>
            </div>
          </div>

          <TabList
            v-else
            :items="itemsFor(seg.tabs)"
            :selected="selectedArray"
            :active-id="activeTabId"
            :menu-items="menuItems"
            selectable
            sortable
            @update:selected="(ids) => emit('update:selected', ids)"
            @click="onActivate"
            @sort="(items, evt) => onSort(seg, items, evt)"
            @command="onCommand"
          >
            <template #actions="{ item }">
              <slot name="actions" :item="item" :tab="tabOf(item)" />
              <el-button v-if="showClose" size="small" text circle title="关闭" @click="onClose(item)">
                <el-icon><Close /></el-icon>
              </el-button>
            </template>
          </TabList>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.window-node {
  margin-bottom: 4px;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px;
  border-radius: 6px;
  font-size: 13px;
  color: #303133;
}

.node-header:hover {
  background: #f5f7fa;
}

.window-header {
  cursor: pointer;
  font-weight: 600;
}

.window-icon {
  color: #909399;
}

.node-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expand-icon {
  transition: transform 0.15s;
  color: #909399;
  font-size: 12px;
  cursor: pointer;
}

.expand-icon.is-expanded {
  transform: rotate(90deg);
}

.node-count {
  font-size: 11px;
  color: #909399;
  background: #f0f2f5;
  border-radius: 8px;
  padding: 0 6px;
}

.group-node {
  margin: 2px 0;
}

.group-header {
  font-size: 12px;
}

.group-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.group-body {
  padding-left: 18px;
}

.window-body {
  padding-left: 2px;
}
</style>
