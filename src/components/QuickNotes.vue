<template>
  <DockShell ref="shell" body-class="fn__flex-column" :search-value="state.mode === 'document' ? undefined : state.keyword" :search-placeholder="state.placeholder" :search-disabled="state.searching" :toolbar-start-actions="state.startActions" :toolbar-actions="state.actions" @update:search-value="panel?.setKeyword($event)" @search-enter="panel?.action('search')" @toolbar-action="(id, event) => panel?.action(id, event)">
    <div ref="host" class="fn__flex-1 fn__flex-column" style="min-height:0;overflow:hidden"></div>
  </DockShell>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { Plugin } from 'siyuan'
import DockShell from '@/components/ui/DockShell.vue'
import { createQuickNotesPanel, type NotesToolbar } from '@/utils/quickNotesWindow'

const props = defineProps<{ plugin: Plugin }>()
const host = ref<HTMLElement>()
const shell = ref<InstanceType<typeof DockShell>>()
const state = shallowRef<NotesToolbar>({ mode: 'list', keyword: '', placeholder: '', searching: false, startActions: [], actions: [] })
let panel: ReturnType<typeof createQuickNotesPanel> | undefined
onMounted(() => { panel = createQuickNotesPanel(host.value!, props.plugin, { onChange: value => {
  const focus = value.mode === 'search' && state.value.mode !== 'search'
  state.value = value
  if (focus) void nextTick(() => shell.value?.focusSearch())
} }) })
onBeforeUnmount(() => panel?.destroy())
</script>
