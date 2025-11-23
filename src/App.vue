<template>
  <div class="plugin-app-main">
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { usePlugin } from '@/main'
import { useSetting } from '@/composables/useSetting'
import { useStats } from '@/composables/useStats'
import { registerEpubTab, createEpubLinkHandler } from '@/core/epub'
import { initEpubBlockMenu, renderAllEpubBlocks } from '@/core/epubView'

const plugin = usePlugin()
const { settings, open: openSetting } = useSetting(plugin)

registerEpubTab(plugin)
plugin.addTopBar({ icon: '<svg viewBox="0 0 1696 1536"><path d="M1671 350q40 57 18 129l-275 906q-19 64-76.5 107.5T1215 1536H292q-77 0-148.5-53.5T44 1351q-24-67-2-127q0-4 3-27t4-37q1-8-3-21.5t-3-19.5q2-11 8-21t16.5-23.5T84 1051q23-38 45-91.5t30-91.5q3-10 .5-30t-.5-28q3-11 17-28t17-23q21-36 42-92t25-90q1-9-2.5-32t.5-28q4-13 22-30.5t22-22.5q19-26 42.5-84.5T372 283q1-8-3-25.5t-2-26.5q2-8 9-18t18-23t17-21q8-12 16.5-30.5t15-35t16-36t19.5-32T504.5 12t36-11.5T588 6l-1 3q38-9 51-9h761q74 0 114 56t18 130l-274 906q-36 119-71.5 153.5T1057 1280H188q-27 0-38 15q-11 16-1 43q24 70 144 70h923q29 0 56-15.5t35-41.5l300-987q7-22 5-57q38 15 59 43m-1064 2q-4 13 2 22.5t20 9.5h608q13 0 25.5-9.5T1279 352l21-64q4-13-2-22.5t-20-9.5H670q-13 0-25.5 9.5T628 288zm-83 256q-4 13 2 22.5t20 9.5h608q13 0 25.5-9.5T1196 608l21-64q4-13-2-22.5t-20-9.5H587q-13 0-25.5 9.5T545 544z"></path></svg>', title: 'M阅读', callback: openSetting })
useStats(plugin).init()

let epubLinkHandler: ((e: MouseEvent) => Promise<void>) | null = null
let cleanupEpubMenu: (() => void) | null = null

onMounted(() => {
  epubLinkHandler = createEpubLinkHandler(plugin, () => settings.value)
  window.addEventListener('click', epubLinkHandler, true)
  cleanupEpubMenu = initEpubBlockMenu(plugin, () => settings.value)
  renderAllEpubBlocks()
})

onUnmounted(() => {
  epubLinkHandler && window.removeEventListener('click', epubLinkHandler, true)
  cleanupEpubMenu?.()
})
</script>

<style lang="scss" scoped>
.plugin-app-main {
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>