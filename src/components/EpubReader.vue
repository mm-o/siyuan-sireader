<template>
  <div class="epub-reader" @click="handleClick">
    <div ref="container" class="epub-container"></div>
    
    <div v-if="loading" class="epub-loading">
      <div class="loading-spinner"></div>
      <div>加载中...</div>
    </div>
    
    <div class="epub-toolbar" :class="{ show }" @mouseenter="onToolbar = true" @mouseleave="leave">
      <button class="toolbar-btn" @click.stop title="目录">
        <svg><use xlink:href="#iconList"></use></svg>
      </button>
      <button class="toolbar-btn" @click.stop="rendition?.prev()" title="上一页">
        <svg><use xlink:href="#iconLeft"></use></svg>
      </button>
      <button class="toolbar-btn" @click.stop="rendition?.next()" title="下一页">
        <svg><use xlink:href="#iconRight"></use></svg>
      </button>
      <button class="toolbar-btn" @click.stop title="设置">
        <svg><use xlink:href="#iconSettings"></use></svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import ePub from 'epubjs'

const props = defineProps<{ file: File; plugin: any }>()

const container = ref<HTMLElement>()
const loading = ref(false)
const show = ref(false)
let book: any, rendition: any, timer = 0, onToolbar = false

const openBook = async () => {
  if (!props.file || !container.value) return
  try {
    loading.value = true
    book = ePub(await props.file.arrayBuffer())
    await book.ready
    rendition = book.renderTo(container.value, { width: '100%', height: '100%', flow: 'paginated', allowScriptedContent: true })
    rendition.hooks.content.register((c: any) => {
      const iframe = c.document?.defaultView?.frameElement
      if (iframe?.hasAttribute('sandbox')) iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts')
    })
    await rendition.display()
  } catch (e) {
    console.error('[MReader]', e)
  } finally {
    loading.value = false
  }
}

const hide = (delay = 1000) => {
  clearTimeout(timer)
  timer = window.setTimeout(() => show.value = false, delay)
}

const leave = () => {
  onToolbar = false
  hide()
}

const handleClick = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('.epub-toolbar')) return
  const rect = container.value?.getBoundingClientRect()
  if (!rect) return
  const x = e.clientX - rect.left
  x < rect.width / 3 ? rendition?.prev() : x > rect.width * 2 / 3 ? rendition?.next() : (show.value = true)
}

const handleMove = (e: MouseEvent) => {
  clearTimeout(timer)
  e.clientY > window.innerHeight - 120 ? show.value = true : !onToolbar && hide(500)
}

const handleKey = (e: KeyboardEvent) => {
  if (e.key === 'ArrowLeft') rendition?.prev()
  else if (e.key === 'ArrowRight') rendition?.next()
  else if (e.key === 'Escape') show.value = false
}

onMounted(() => {
  window.addEventListener('keydown', handleKey)
  document.addEventListener('mousemove', handleMove)
  openBook()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKey)
  document.removeEventListener('mousemove', handleMove)
  clearTimeout(timer)
  rendition?.destroy()
  book?.destroy()
})
</script>
