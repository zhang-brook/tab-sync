<script lang="ts">
export type {
  TabListItem,
  TabListMenuEntry,
  TabListSortEvent,
  TabTagDisplay,
} from '../types/tab-list'
</script>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { MoreFilled } from '@element-plus/icons-vue'
import LazyFavicon from './LazyFavicon.vue'
import EntityTag from './EntityTag.vue'
import draggable from 'vuedraggable'
import { formatDateTime } from '../utils/format'
import type {
  TabListItem,
  TabListMenuEntry,
  TabListSortEvent,
} from '../types/tab-list'

const props = withDefaults(
  defineProps<{
    items: TabListItem[]
    /** 是否显示复选框（多选模式） */
    selectable?: boolean
    /** 是否支持拖拽排序（显示拖拽把手） */
    sortable?: boolean
    /** 选中的行 id 列表 */
    selected?: Array<string | number>
    /** 高亮行 id（如浏览器当前激活的标签页） */
    activeId?: string | number | null
    /** 行右键菜单与 ⋮ 菜单（同一份描述） */
    menuItems?: TabListMenuEntry[]
    /** 是否显示行尾 ⋮ 菜单按钮，默认显示（有菜单项时） */
    showMenuButton?: boolean
  }>(),
  {
    selectable: false,
    sortable: false,
    selected: () => [],
    activeId: null,
    menuItems: () => [],
    showMenuButton: true,
  },
)

const emit = defineEmits<{
  (e: 'update:selected', ids: Array<string | number>): void
  (e: 'click', item: TabListItem): void
  (e: 'sort', items: TabListItem[], evt: TabListSortEvent): void
  (e: 'command', command: string, item: TabListItem): void
}>()

/** 组件内可变列表：拖拽就地排序，父组件通过 sort 事件持久化 */
const localItems = ref<TabListItem[]>([])
watch(
  () => props.items,
  (v) => {
    localItems.value = v.slice()
  },
  { immediate: true },
)

const selectedSet = computed(() => new Set(props.selected))

function isSelected(id: string | number): boolean {
  return selectedSet.value.has(id)
}

function onToggle(id: string | number, checked: boolean) {
  const next = new Set(props.selected)
  if (checked) next.add(id)
  else next.delete(id)
  emit('update:selected', Array.from(next))
}

/** @change 才会携带 moved（含 element/oldIndex/newIndex）；@update 仅含原始索引，无 moved */
function onChange(evt: { moved?: { element: TabListItem; oldIndex: number; newIndex: number } }) {
  if (evt.moved) {
    emit('sort', localItems.value, { moved: evt.moved })
  }
}

/** 悬浮提示：重命名时展示「xx（原：yy）」 */
function titleAttr(item: TabListItem): string {
  return item.originalTitle ? `${item.title}（原：${item.originalTitle}）` : item.title
}

/** 多工作组色条：各段占满均分区间，仅在相邻色段间留窄过渡，避免混出奇怪的中间色 */
function savedAccent(colors: string[]): string {
  if (colors.length === 1) return colors[0]
  const step = 100 / colors.length
  const fade = Math.min(10, step * 0.3)
  const stops: string[] = []
  colors.forEach((color, i) => {
    const start = i * step
    stops.push(`${color} ${i === 0 ? 0 : start + fade / 2}%`)
    stops.push(`${color} ${i === colors.length - 1 ? 100 : start + step - fade / 2}%`)
  })
  return `linear-gradient(180deg, ${stops.join(', ')})`
}

/** 行首来源色条：单个工作组用纯色，多个工作组按顺序分段 */
function savedStyle(item: TabListItem) {
  if (!item.saved) return undefined
  const colors = item.savedColors?.filter(Boolean) ?? []
  if (colors.length === 0) return undefined
  return { '--tab-saved-accent': savedAccent(colors) }
}

/** 整个列表共用一个下拉菜单，避免每行各挂一套弹出层组件（大列表会撑爆渲染进程） */
const menuRef = ref<{ handleOpen: () => void; handleClose: () => void } | null>(null)
const menuVirtualRef = ref<{ getBoundingClientRect: () => DOMRect } | undefined>(undefined)
const menuTarget = ref<TabListItem | null>(null)

function virtualElAt(left: number, top: number) {
  const rect = {
    x: left,
    y: top,
    top,
    left,
    right: left,
    bottom: top,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  } as DOMRect
  return { getBoundingClientRect: () => rect }
}

function openMenu(left: number, top: number, item: TabListItem) {
  if (props.menuItems.length === 0) return
  menuTarget.value = item
  menuVirtualRef.value = virtualElAt(left, top)
  menuRef.value?.handleClose()
  nextTick(() => menuRef.value?.handleOpen())
}

/** 行右键：菜单定位到鼠标位置；无菜单项时保留浏览器默认菜单 */
function onRowContextMenu(event: MouseEvent, item: TabListItem) {
  if (props.menuItems.length === 0) return
  event.preventDefault()
  openMenu(event.clientX, event.clientY, item)
}

/** 行尾 ⋮：菜单定位到按钮下方 */
function onMenuButtonClick(event: MouseEvent, item: TabListItem) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  openMenu(rect.left, rect.bottom, item)
}

function onSharedMenuCommand(command: string) {
  if (menuTarget.value) emit('command', command, menuTarget.value)
}
</script>

<template>
  <draggable
    v-model="localItems"
    item-key="id"
    handle=".tab-drag-handle"
    ghost-class="tab-ghost"
    :animation="200"
    :sortable="sortable"
    @change="onChange"
  >
    <template #item="{ element }">
      <div
        class="tab-item"
        :class="{ 'is-active': element.id === activeId, 'is-saved': element.saved }"
        :style="savedStyle(element)"
        :data-tab-id="element.id"
        @click="emit('click', element)"
        @contextmenu="onRowContextMenu($event, element)"
      >
        <span v-if="sortable" class="tab-drag-handle" title="拖拽排序">⋮⋮</span>
        <el-checkbox
          v-if="selectable"
          :model-value="isSelected(element.id)"
          @change="(v: string | number | boolean) => onToggle(element.id, Boolean(v))"
          @click.stop
        />
        <LazyFavicon :favIconUrl="element.favIconUrl" :size="16" class="tab-favicon" />
        <div class="tab-info">
          <div class="tab-title" :title="titleAttr(element)">{{ element.title || '(无标题)' }}</div>
          <div class="tab-url" :title="element.url">{{ element.url }}</div>
          <div
            v-if="element.description || element.tags?.length || element.addedAt || $slots.extra"
            class="tab-extra"
          >
            <EntityTag
              v-for="tag in element.tags"
              :key="tag.id ?? tag.name"
              :tag="tag"
              class="tab-tag"
            />
            <span v-if="element.addedAt" class="tab-time">{{ formatDateTime(element.addedAt) }}</span>
            <span v-if="element.description" class="tab-desc" :title="element.description">{{ element.description }}</span>
            <slot name="extra" :item="element" />
          </div>
        </div>
        <EntityTag
          v-if="element.badgeText"
          class="tab-badge"
          :tag="{ name: element.badgeText, color: element.badgeColor, key: element.badgeKey, kind: 'workspace' }"
        />
        <div class="tab-actions" @click.stop>
          <slot name="actions" :item="element" />
          <button
            v-if="showMenuButton && menuItems.length > 0"
            type="button"
            class="tab-menu-trigger"
            title="更多操作"
            @click.stop="onMenuButtonClick($event, element)"
          >
            <MoreFilled />
          </button>
        </div>
      </div>
    </template>
  </draggable>

  <el-dropdown
    v-if="menuItems.length > 0"
    ref="menuRef"
    :virtual-ref="menuVirtualRef"
    virtual-triggering
    trigger="click"
    @command="onSharedMenuCommand"
  >
    <span style="display: none"></span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="entry in menuItems"
          :key="entry.command"
          :command="entry.command"
          :icon="entry.icon"
          :divided="entry.divided"
          :disabled="entry.disabled"
          :class="{ 'danger-dropdown-item': entry.danger }"
          :style="entry.danger ? 'color: var(--el-color-danger)' : undefined"
        >{{ entry.label }}</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.tab-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.tab-item.is-saved::before {
  content: '';
  position: absolute;
  left: 0;
  top: 5px;
  bottom: 5px;
  width: 3px;
  border-radius: 3px;
  background: var(--tab-saved-accent, var(--el-color-success));
  pointer-events: none;
}

.tab-item:hover {
  background-color: #f5f7fa;
}

.tab-item.is-active {
  background-color: #ecf5ff;
}

.tab-drag-handle {
  cursor: grab;
  color: #c0c4cc;
  font-size: 14px;
  line-height: 1;
  user-select: none;
  flex-shrink: 0;
  padding: 0 2px;
  transition: color 0.15s;
}

.tab-drag-handle:hover {
  color: #909399;
}

.tab-drag-handle:active {
  cursor: grabbing;
}

.tab-favicon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 2px;
}

.tab-info {
  flex: 1;
  min-width: 0;
}

.tab-title {
  font-size: 13px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-url {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.tab-extra {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.tab-tag {
  flex-shrink: 0;
}

.tab-extra .tab-tag {
  height: 18px;
  padding: 0 5px;
  font-size: 11px;
  line-height: 16px;
}

.tab-time,
.tab-desc {
  font-size: 11px;
  color: #c0c4cc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-desc {
  color: #909399;
}

.tab-badge {
  flex-shrink: 0;
}

.tab-actions {
  margin-left: auto;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.tab-item:hover .tab-actions {
  opacity: 1;
}

.tab-menu-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #909399;
  cursor: pointer;
  font-size: 14px;
}

.tab-menu-trigger:hover {
  color: #409eff;
  background: #ecf5ff;
}

.tab-ghost {
  opacity: 0.4;
  background: #e6f7ff;
  border: 1px dashed #409eff;
}
</style>
