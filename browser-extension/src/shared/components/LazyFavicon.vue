<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 真实 favicon URL（也可直接传 data: URL） */
    favIconUrl?: string
    size?: number
    radius?: number
  }>(),
  { size: 16, radius: 3 },
)

const imgSrc = ref('')
const failed = ref(false)
const root = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function boxStyle() {
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    borderRadius: `${props.radius}px`,
  }
}

function load() {
  failed.value = false
  const url = props.favIconUrl
  if (!url) {
    failed.value = true
    return
  }
  // 直接用 URL 加载（无跨域问题），是否真正发起请求由 IntersectionObserver 懒加载控制
  imgSrc.value = url
}

function onError() {
  // 直连失败（URL 失效等）：显示默认占位图标
  failed.value = true
}

onMounted(() => {
  if (typeof IntersectionObserver !== 'undefined' && root.value) {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          load()
          observer?.disconnect()
        }
      },
      { rootMargin: '120px' },
    )
    observer.observe(root.value)
  } else {
    load()
  }
})

onBeforeUnmount(() => observer?.disconnect())

watch(
  () => props.favIconUrl,
  () => load(),
)
</script>

<template>
  <span ref="root" class="lazy-favicon" :style="boxStyle()">
    <img
      v-if="imgSrc && !failed"
      :src="imgSrc"
      :style="boxStyle()"
      class="lazy-favicon-img"
      alt=""
      @error="onError"
    />
    <span v-else class="lazy-favicon-placeholder" :style="boxStyle()">
      <!-- 默认占位图标：无 favicon / 加载失败时展示 -->
      <svg class="lazy-favicon-default" viewBox="0 0 24 24" :width="size" :height="size" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6" />
        <ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" stroke-width="1.2" />
        <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="1.2" />
      </svg>
    </span>
  </span>
</template>

<style scoped>
.lazy-favicon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.lazy-favicon-img {
  display: block;
  object-fit: contain;
}
.lazy-favicon-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light, #f0f0f0);
}
.lazy-favicon-default {
  color: var(--el-text-color-secondary, #909399);
}
</style>
