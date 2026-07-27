<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { fetchFavicon } from '../api/favicon'

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
const useProxy = ref(true)
const root = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function boxStyle() {
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    borderRadius: `${props.radius}px`,
  }
}

async function load() {
  failed.value = false
  const url = props.favIconUrl
  if (!url) {
    failed.value = true
    return
  }
  // 内联 data URL 直接显示，无需代理
  if (url.startsWith('data:')) {
    imgSrc.value = url
    return
  }
  if (useProxy.value) {
    const dataUrl = await fetchFavicon(url)
    if (dataUrl) {
      imgSrc.value = dataUrl
      return
    }
    // 代理失败：回退到直接加载原始 URL（浏览器可跨域加载图片用于展示）
    useProxy.value = false
  }
  imgSrc.value = url
}

function onError() {
  if (useProxy.value && props.favIconUrl && !props.favIconUrl.startsWith('data:')) {
    useProxy.value = false
    imgSrc.value = props.favIconUrl
  } else {
    failed.value = true
  }
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
  () => {
    useProxy.value = true
    load()
  },
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
    <span v-else class="lazy-favicon-placeholder" :style="boxStyle()" />
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
  display: inline-block;
  background: var(--el-fill-color-light, #f0f0f0);
}
</style>
