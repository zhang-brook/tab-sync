<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { hideEntityTooltip, useEntityTooltip } from '../composables/entity-tooltip'

const { trigger, content, visible } = useEntityTooltip()

/** 滚动后芯片可能已离开视口，直接收起避免提示停在错误位置 */
onMounted(() => window.addEventListener('scroll', hideEntityTooltip, true))
onBeforeUnmount(() => window.removeEventListener('scroll', hideEntityTooltip, true))
</script>

<template>
  <el-tooltip
    :visible="visible"
    :virtual-ref="trigger ?? undefined"
    virtual-triggering
    :content="content"
    placement="top"
    :persistent="false"
  />
</template>
