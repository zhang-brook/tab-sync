import { ref, shallowRef } from 'vue'

const SHOW_DELAY = 300

/** 当前展示提示的芯片元素及其类型文案，由全页唯一的提示宿主消费 */
const trigger = shallowRef<HTMLElement | null>(null)
const content = ref('')
const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

/** 悬浮到实体芯片：延迟展示，避免大列表里快速划过时连续弹提示 */
export function showEntityTooltip(element: HTMLElement, text: string): void {
  clearTimeout(timer)
  timer = setTimeout(() => {
    trigger.value = element
    content.value = text
    visible.value = true
  }, SHOW_DELAY)
}

export function hideEntityTooltip(): void {
  clearTimeout(timer)
  visible.value = false
}

export function useEntityTooltip() {
  return { trigger, content, visible }
}
