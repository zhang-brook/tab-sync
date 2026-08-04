<script setup lang="ts">
import { ref, computed, watch, useSlots } from 'vue'
import LazyFavicon from './LazyFavicon.vue'
import ContextMenu from './ContextMenu.vue'
import draggable from 'vuedraggable'

/** 标签页列表项：各页面将自身数据结构映射为统一结构后传入 */
export interface TabListItem {
  /** 行唯一标识（选择与渲染 key 用），跨分组来源需组合保证唯一 */
  id: string | number
  title: string
  url: string
  favIconUrl?: string
  /** 重命名后的原始标题（用于悬浮提示「xx（原：yy）」） */
  originalTitle?: string
  /** 行尾徽标（来源工作组等） */
  badgeText?: string
  badgeColor?: string
}

/** 拖拽排序事件（vuedraggable update 事件的简化形态） */
export interface TabListSortEvent {
  moved?: { element: TabListItem; oldIndex: number; newIndex: number }
}

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
  }>(),
  { selectable: false, sortable: false, selected: () => [], activeId: null },
)

const emit = defineEmits<{
  (e: 'update:selected', ids: Array<string | number>): void
  (e: 'click', item: TabListItem): void
  (e: 'sort', items: TabListItem[], evt: TabListSortEvent): void
  (e: 'command', command: string, item: TabListItem): void
}>()

const slots = useSlots()
const hasContextMenu = computed(() => !!slots['context-menu'])

/** 组件内可变列表：拖拽就地排序，父组件通过 sort 事件持久化 */
const localItems = ref<TabListItem[]>([])
watch(
  () => props.items,
  (v) => {
    localItems.value = v.slice()
  },
  { immediate: true },
)

function isSelected(id: string | number): boolean {
  return props.selected.includes(id)
}

function onToggle(id: string | number, checked: boolean) {
  const next = new Set(props.selected)
  if (checked) next.add(id)
  else next.delete(id)
  emit('update:selected', Array.from(next))
}

function onClick(item: TabListItem) {
  emit('click', item)
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
      <ContextMenu
        v-if="hasContextMenu"
        @command="(cmd: string) => emit('command', cmd, element)"
      >
        <div
          class="tab-item"
          :class="{ 'is-active': element.id === activeId }"
          :data-tab-id="element.id"
          @click="onClick(element)"
        >
          <span v-if="sortable" class="tab-drag-handle" title="拖拽排序">⋮⋮</span>
          <el-checkbox
            v-if="selectable"
            :model-value="isSelected(element.id)"
            @change="(v: any) => onToggle(element.id, Boolean(v))"
            @click.stop
          />
          <LazyFavicon :favIconUrl="element.favIconUrl" :size="16" class="tab-favicon" />
          <div class="tab-info">
            <div class="tab-title" :title="titleAttr(element)">{{ element.title || '(无标题)' }}</div>
            <div class="tab-url" :title="element.url">{{ element.url }}</div>
            <div v-if="slots.extra" class="tab-extra">
              <slot name="extra" :item="element" />
            </div>
          </div>
          <el-tag
            v-if="element.badgeText"
            size="small"
            effect="plain"
            class="tab-badge"
            :style="element.badgeColor ? { borderColor: element.badgeColor, color: element.badgeColor } : {}"
          >{{ element.badgeText }}</el-tag>
          <div class="tab-actions" @click.stop>
            <slot name="actions" :item="element" />
          </div>
        </div>
        <template #menu>
          <slot name="context-menu" :item="element" />
        </template>
      </ContextMenu>

      <div
        v-else
        class="tab-item"
        :class="{ 'is-active': element.id === activeId }"
        :data-tab-id="element.id"
        @click="onClick(element)"
      >
        <span v-if="sortable" class="tab-drag-handle" title="拖拽排序">⋮⋮</span>
        <el-checkbox
          v-if="selectable"
          :model-value="isSelected(element.id)"
          @change="(v: any) => onToggle(element.id, Boolean(v))"
          @click.stop
        />
        <LazyFavicon :favIconUrl="element.favIconUrl" :size="16" class="tab-favicon" />
        <div class="tab-info">
          <div class="tab-title" :title="titleAttr(element)">{{ element.title || '(无标题)' }}</div>
          <div class="tab-url" :title="element.url">{{ element.url }}</div>
          <div v-if="slots.extra" class="tab-extra">
            <slot name="extra" :item="element" />
          </div>
        </div>
        <el-tag
          v-if="element.badgeText"
          size="small"
          effect="plain"
          class="tab-badge"
          :style="element.badgeColor ? { borderColor: element.badgeColor, color: element.badgeColor } : {}"
        >{{ element.badgeText }}</el-tag>
        <div class="tab-actions" @click.stop>
          <slot name="actions" :item="element" />
        </div>
      </div>
    </template>
  </draggable>
</template>

<style scoped>
.tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;
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
  margin-top: 4px;
}

.tab-badge {
  flex-shrink: 0;
}

.tab-actions {
  margin-left: auto;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.tab-item:hover .tab-actions {
  opacity: 1;
}

.tab-ghost {
  opacity: 0.4;
  background: #e6f7ff;
  border: 1px dashed #409eff;
}
</style>
