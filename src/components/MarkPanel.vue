<template>
  <Teleport to="body">
    <!-- 全局点击监听 -->
    <div v-if="state.showMenu||state.showCard" class="mark-overlay" @click="handleOverlayClick"/>
    
    <!-- ========== 选择菜单 ========== -->
    <div v-if="state.showMenu" v-motion :initial="{opacity:0,scale:0.95}" :enter="{opacity:1,scale:1,transition:{type:'spring',stiffness:400,damping:25}}" class="mark-selection-menu" :style="menuPosition" @click.stop>
      <button class="mark-menu-btn b3-tooltips b3-tooltips__s" @click="handleMark" :aria-label="i18n.mark||'标注'"><svg><use xlink:href="#iconMark"/></svg></button>
      <button class="mark-menu-btn b3-tooltips b3-tooltips__s" @click="handleCopy" :aria-label="i18n.copy||'复制'"><svg><use xlink:href="#iconCopy"/></svg></button>
      <button class="mark-menu-btn b3-tooltips b3-tooltips__s" @click="handleDict" :aria-label="i18n.dict||'词典'"><svg><use xlink:href="#iconLanguage"/></svg></button>
    </div>

    <!-- ========== 标注卡片 ========== -->
    <div v-if="state.showCard" v-motion :initial="{opacity:0,y:5}" :enter="{opacity:1,y:0}" class="sr-card" :style="cardPosition" @click.stop>
      <div class="sr-main" :style="{borderLeftColor:currentColor}">
        <template v-if="!state.isEditing">
          <div class="sr-title" @click="goToMark">{{state.text||'无内容'}}</div>
          <div v-if="state.note" class="sr-note" @click.stop="handleEdit">{{state.note}}</div>
          <div class="sr-btns">
            <button @click.stop="handleCopyMark" class="b3-tooltips b3-tooltips__nw" :aria-label="i18n.copy||'复制'"><svg><use xlink:href="#iconCopy"/></svg></button>
            <button @click.stop="handleEdit" class="b3-tooltips b3-tooltips__nw" :aria-label="i18n.edit||'编辑'"><svg><use xlink:href="#iconEdit"/></svg></button>
            <button v-if="state.currentMark?.blockId" @click.stop="handleOpenBlock" @mouseenter="handleShowFloat" @mouseleave="handleHideFloat" class="b3-tooltips b3-tooltips__nw" aria-label="打开块"><svg><use xlink:href="#iconRef"/></svg></button>
            <button v-else @click.stop="handleImport" class="b3-tooltips b3-tooltips__nw" :aria-label="i18n.import||'导入'"><svg><use xlink:href="#iconDownload"/></svg></button>
            <button @click.stop="handleDelete" class="b3-tooltips b3-tooltips__nw" :aria-label="i18n.delete||'删除'"><svg><use xlink:href="#iconTrashcan"/></svg></button>
          </div>
        </template>
        <template v-else>
          <div v-if="state.currentMark?.type!=='shape'" class="sr-title" contenteditable @blur="handleTextBlur" v-html="state.text"></div>
          <div v-else class="sr-title">{{state.text}}</div>
          <textarea ref="noteRef" v-model="state.note" placeholder="添加笔记..." class="sr-note-input"/>
          <div class="sr-options">
            <div class="sr-colors">
              <button v-for="c in COLORS" :key="c.color" class="sr-color-btn" :class="{active:state.color===c.color}" :style="{background:c.bg}" @click.stop="handleColorChange(c.color)"/>
            </div>
            <div v-if="state.currentMark?.type==='shape'" class="sr-styles">
              <button v-for="s in SHAPES" :key="s.type" class="sr-style-btn" :class="{active:state.shapeType===s.type}" @click.stop="state.shapeType=s.type" :title="s.name">
                <svg style="width:16px;height:16px"><use :xlink:href="s.icon"/></svg>
              </button>
              <span class="toolbar-divider"/>
              <button class="sr-style-btn" :class="{active:state.shapeFilled}" @click.stop="state.shapeFilled=!state.shapeFilled" title="填充">
                <svg style="width:16px;height:16px"><use xlink:href="#lucide-paint-bucket"/></svg>
              </button>
            </div>
            <div v-else class="sr-styles">
              <button v-for="s in STYLES" v-show="(!s.pdfOnly&&!s.epubOnly)||(s.pdfOnly&&isPdf)||(s.epubOnly&&!isPdf)" :key="s.type" class="sr-style-btn" :class="{active:state.style===s.type}" @click.stop="state.style=s.type">
                <span class="sr-style-icon" :data-type="s.type">{{s.text}}</span>
              </button>
            </div>
          </div>
          <div class="sr-actions">
            <button @click.stop="handleCopyMark" class="sr-btn-secondary">复制</button>
            <button @click.stop="handleSave" class="sr-btn-primary">保存</button>
            <button @click.stop="handleCancel" class="sr-btn-secondary">取消</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick } from 'vue'
import { showMessage } from 'siyuan'
import type { AnnotationManager } from '@/core/annotation'
import type { Annotation } from '@/core/database'
import type { HighlightColor } from '@/core/annotation'
import { COLORS, STYLES, getColorMap } from '@/core/annotation'
import { openBlock, showFloat, hideFloat } from '@/utils/copy'
import { jump } from '@/utils/jump'

// ==================== 类型定义 ====================

interface MarkSelection {
  text: string
  location: {
    format: 'pdf' | 'epub' | 'txt'
    cfi?: string
    section?: number
    page?: number
    rects?: any[]
  }
}

// ==================== Props ====================

const props = defineProps<{
  manager: AnnotationManager | null
  i18n?: Record<string, string>
}>()

const emit = defineEmits<{
  copy: [text: string]
  dict: [text: string, x: number, y: number]
  copyMark: [mark: Annotation]
}>()

// ==================== 常量 ====================

const SHAPES = [
  { type: 'rect', name: '矩形', icon: '#iconSquareDashed' },
  { type: 'circle', name: '圆形', icon: '#iconCircleDashed' },
  { type: 'triangle', name: '三角形', icon: '#iconTriangleDashed' }
] as const

const colors = getColorMap()

// ==================== 状态 ====================

const noteRef = ref<HTMLTextAreaElement>()

const state = reactive({
  // 显示状态
  showMenu: false,
  showCard: false,
  isEditing: false,
  
  // 位置
  x: 0,
  y: 0,
  
  // 当前选择/标注
  selection: null as MarkSelection | null,
  currentMark: null as Annotation | null,
  
  // 编辑数据
  text: '',
  note: '',
  color: 'yellow' as HighlightColor,
  style: 'highlight' as 'highlight' | 'underline' | 'outline' | 'dotted' | 'dashed' | 'double' | 'squiggly',
  shapeType: 'rect' as 'rect' | 'circle' | 'triangle',
  shapeFilled: false,
  markType: 'text' as 'text' | 'shape'
})

// ==================== Computed ====================

const currentColor = computed(() => colors[state.color] || '#ffeb3b')
const isPdf = computed(() => (state.selection?.location.format || state.currentMark?.format) === 'pdf')

const menuPosition = computed(() => {
  const w=140,container=document.querySelector('.reader-container')
  const bounds=container?.getBoundingClientRect()||{left:0,top:0,right:window.innerWidth,bottom:window.innerHeight}
  const x=Math.max(bounds.left+w/2+10,Math.min(state.x,bounds.right-w/2-10))
  const y=Math.max(bounds.top+60,Math.min(state.y-54,bounds.bottom-60))
  return{left:`${x}px`,top:`${y}px`,transform:'translate(-50%, 0)'}
})

const cardPosition = computed(() => {
  const w=340,h=state.isEditing?420:180,container=document.querySelector('.reader-container')
  const bounds=container?.getBoundingClientRect()||{left:0,top:0,right:window.innerWidth,bottom:window.innerHeight}
  const x=Math.max(bounds.left+w/2+10,Math.min(state.x,bounds.right-w/2-10))
  let y=state.y+10
  if(y+h>bounds.bottom-20)y=Math.max(bounds.top+20,state.y-h-10)
  return{left:`${x}px`,top:`${y}px`,transform:'translate(-50%, 0)'}
})

// ==================== 公开方法 ====================

/**
 * 显示选择菜单
 */
const showMenu = (selection: MarkSelection, x: number, y: number) => {
  state.selection = selection
  state.x = x
  state.y = y
  state.showMenu = true
  state.showCard = false
}

/**
 * 显示标注卡片
 */
const showCard = (mark: Annotation, x: number, y: number, edit = false) => {
  state.currentMark = mark
  state.text = mark.text || (mark.type === 'shape' ? '形状标注' : '')
  state.note = mark.note || ''
  state.color = mark.color || 'yellow'
  state.style = mark.style || 'highlight'
  state.shapeType = mark.shapeType || 'rect'
  state.shapeFilled = mark.filled || false
  state.markType = mark.type === 'shape' ? 'shape' : 'text'
  
  state.x = x
  state.y = y
  state.isEditing = edit
  state.showMenu = false
  state.showCard = true
  
  if (edit) {
    nextTick(() => noteRef.value?.focus())
  }
}

/**
 * 关闭所有弹窗
 */
const closeAll = () => {
  state.showMenu = false
  state.showCard = false
  state.isEditing = false
  state.selection = null
  state.currentMark = null
}

// 暴露给父组件
defineExpose({
  showMenu,
  showCard,
  closeAll
})

// ==================== 事件处理 ====================

// 选择菜单
const handleMark = () => {
  if (!state.selection) return
  
  state.currentMark = null
  state.text = state.selection.text
  state.note = ''
  state.isEditing = true
  state.showMenu = false
  state.showCard = true
  
  nextTick(() => noteRef.value?.focus())
}

const handleCopy = () => {
  if (!state.selection) return
  emit('copy', state.selection.text)
  closeAll()
}

const handleDict = () => {
  if (!state.selection) return
  emit('dict', state.selection.text, state.x, state.y + 50)
  closeAll()
}

// 标注卡片
const handleTextBlur = (e: FocusEvent) => {
  state.text = (e.target as HTMLElement).textContent || ''
}

const handleColorChange = (color: HighlightColor) => {
  state.color = color
}

const handleEdit = () => {
  state.isEditing = true
  nextTick(() => noteRef.value?.focus())
}

const handleSave = async () => {
  if (!props.manager) return
  try {
    if (state.currentMark) {
      // 更新现有标注
      const updates: any = {
        note: state.note.trim() || undefined,
        color: state.color
      }
      // 形状标注更新 shapeType
      if (state.currentMark.type === 'shape') {
        updates.shapeType = state.shapeType
        updates.filled = state.shapeFilled
      } else {
        updates.text = state.text.trim()
        updates.style = state.style
      }
      const{saveMarkEdit}=await import('@/utils/copy')
      await saveMarkEdit(state.currentMark,updates,{marks:props.manager,bookUrl:(window as any).__currentBookUrl||'',isPdf:isPdf.value,reader:(window as any).__activeReader,pdfViewer:(window as any).__activeView?.viewer,shapeCache:new Map()})
      showMessage(props.i18n?.saved || '已保存', 1000)
      state.isEditing = false
    } else if (state.selection) {
      // 创建新标注
      const loc = state.selection.location
      const position = loc?.cfi || loc?.page || loc?.section
      if (position === undefined) {
        showMessage('无法获取位置信息', 2000, 'error')
        return
      }
      if (state.note.trim()) {
        await props.manager.addNote(position, state.note.trim(), state.text.trim(), state.color, state.style, loc.rects, loc.textOffset)
      } else {
        await props.manager.addHighlight(position, state.text.trim(), state.color, state.style, loc.rects, loc.textOffset)
      }
      showMessage(props.i18n?.created || '已创建', 1000)
      closeAll()
    }
  } catch (e) {
    console.error('[MarkPanel] Save error:', e)
    showMessage(props.i18n?.saveError || '保存失败', 2000, 'error')
  }
}

const handleDelete = async () => {
  if (!props.manager || !state.currentMark) return
  try {
    const result=await props.manager.deleteMark(state.currentMark)
    if(result){
      showMessage(props.i18n?.deleted || '已删除', 1000)
      closeAll()
    }else{
      showMessage('删除失败：未找到标注', 2000, 'error')
    }
  } catch (e) {
    console.error('[MarkPanel] Delete error:', e)
    showMessage(props.i18n?.deleteError || '删除失败', 2000, 'error')
  }
}

const handleCancel = () => {
  if (state.currentMark) {
    state.text = state.currentMark.text || ''
    state.note = state.currentMark.note || ''
    state.color = state.currentMark.color || 'yellow'
    state.style = state.currentMark.style || 'highlight'
    state.isEditing = false
  } else {
    closeAll()
  }
}

const handleCopyMark = () => {
  state.currentMark?emit('copyMark',state.currentMark):emit('copy',state.text)
}

const handleImport = async () => {
  if (!state.currentMark) return
  const { importMark } = await import('@/utils/copy')
  await importMark(state.currentMark, { bookUrl: (window as any).__currentBookUrl || '', isPdf: isPdf.value, showMsg: (m: string, t?: string) => showMessage(m, t === 'error' ? 2000 : 1500, t as any), i18n: props.i18n, marks: props.manager })
}

const handleOpenBlock = () => state.currentMark?.blockId && openBlock(state.currentMark.blockId)
const handleShowFloat = (e: MouseEvent) => state.currentMark?.blockId && showFloat(state.currentMark.blockId, e.target as HTMLElement)
const handleHideFloat = hideFloat

// 跳转到标注位置
const goToMark = () => {
  if (!state.currentMark) return
  const activeView = (window as any).__activeView
  const activeReader = (window as any).__activeReader
  jump(state.currentMark, activeView, activeReader, props.manager)
}

// 处理遮罩层点击
const handleOverlayClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (target.closest('[data-note-marker],[data-note-tooltip],.pdf-highlight,[data-txt-mark]')) return
  closeAll()
}

</script>

<style scoped lang="scss">
@import './deck/deck.scss';
.mark-overlay{position:fixed;inset:0;z-index:900;background:transparent}
.mark-selection-menu{position:fixed;z-index:950;display:flex;gap:4px;padding:6px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:8px;box-shadow:0 4px 16px #0002}
.mark-menu-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:8px;cursor:pointer;transition:all .15s;color:var(--b3-theme-on-surface);svg{width:16px;height:16px}&:hover{background:var(--b3-list-hover);color:var(--b3-theme-primary)}}
.sr-card{position:fixed;z-index:950;width:340px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1)}
.sr-main{padding:12px;border-left:4px solid;border-radius:8px}
.sr-title{font-size:13px;font-weight:500;line-height:1.6;color:var(--b3-theme-on-surface);margin-bottom:8px;cursor:pointer;&[contenteditable="true"]{font-size:15px;font-weight:600}}
.sr-note{font-size:12px;color:var(--b3-theme-on-surface-variant);line-height:1.5;margin-bottom:8px;cursor:text}
.sr-btns{display:flex;gap:8px;button{width:32px;height:32px;padding:0;border:none;background:transparent;border:1px solid var(--b3-border-color);border-radius:4px;cursor:pointer;transition:all .15s;color:var(--b3-theme-on-surface);display:flex;align-items:center;justify-content:center;svg{width:14px;height:14px}&:hover{background:var(--b3-list-hover);border-color:var(--b3-theme-primary);color:var(--b3-theme-primary)}}}
.sr-note-input{width:100%;min-height:60px;padding:8px;border:1px solid var(--b3-border-color);border-radius:4px;font-size:12px;line-height:1.5;resize:vertical;background:var(--b3-theme-background);color:var(--b3-theme-on-surface-variant);margin-bottom:8px;&:focus{outline:1px solid var(--b3-theme-primary);border-color:var(--b3-theme-primary)}}
.sr-options{margin-bottom:12px}
.sr-colors{display:flex;gap:6px;margin-bottom:8px}
.sr-color-btn{width:28px;height:28px;border:2px solid transparent;border-radius:50%;cursor:pointer;transition:all .15s;padding:0;&.active{border-color:var(--b3-theme-on-surface);transform:scale(1.1);box-shadow:0 2px 8px rgba(0,0,0,.2)}&:hover{transform:scale(1.05)}}
.sr-styles{display:flex;gap:4px;.toolbar-divider{width:1px;height:24px;background:var(--b3-border-color);margin:0 4px}}
.sr-style-btn{width:36px;height:32px;display:flex;align-items:center;justify-content:center;border:1px solid var(--b3-border-color);background:transparent;border-radius:4px;cursor:pointer;transition:all .15s;color:var(--b3-theme-on-surface);.sr-style-icon{display:inline-block;font-size:14px;font-weight:500;line-height:1.4;padding:4px 0;min-width:16px;text-align:center;&[data-type="highlight"]{background:#ffeb3b;padding:2px 4px}&[data-type="underline"]{border-bottom:2px solid currentColor;padding-bottom:2px}&[data-type="outline"]{border:2px solid currentColor;padding:2px 4px}&[data-type="dotted"]{border-bottom:2px dotted currentColor;padding-bottom:2px}&[data-type="dashed"]{border-bottom:2px dashed currentColor;padding-bottom:2px}&[data-type="double"]{border-bottom:4px double currentColor;padding-bottom:1px}&[data-type="squiggly"]{text-decoration:underline wavy;text-decoration-thickness:2px;text-underline-offset:2px}}&.active{background:var(--b3-theme-primary-lightest);border-color:var(--b3-theme-primary);color:var(--b3-theme-primary)}&:hover{background:var(--b3-list-hover)}}

</style>
