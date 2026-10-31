<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    :width="width"
    append-to-body
    destroy-on-close
    @update:model-value="(value: boolean) => emit('update:modelValue', value)"
  >
    <LoginPanel @login-success="handleLoginSuccess" />
  </el-dialog>
</template>

<script setup lang="ts">
import LoginPanel from './LoginPanel.vue'

withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    width?: string
  }>(),
  {
    title: '登录',
    width: '420px',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'login-success'): void
}>()

function handleLoginSuccess() {
  emit('update:modelValue', false)
  emit('login-success')
}
</script>
