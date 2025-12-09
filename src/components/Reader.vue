<template>
  <div class="reader" @click="hideMenu">
    <div class="reader-wrap">
      <div ref="containerRef" class="reader-container" tabindex="0"></div>
    </div>
    <div v-if="loading" class="reader-loading"><div class="spinner"></div><div>{{ error || '加载中...' }}</div></div>
    <div class="reader-toolbar">
      <button class="toolbar-btn" @click.stop="reader?.prev()" title="上一章"><svg><use xlink:href="#iconLeft"/></svg></button>
      <button class="toolbar-btn" @click.stop="reader?.next()" title="下一章"><svg><use xlink:href="#iconRight"/></svg></button>
      <button class="toolbar-btn" :class="{active:hasBookmark}" @click.stop="toggleBookmark" :title="hasBookmark?'删除书签':'添加书签'"><svg><use xlink:href="#iconBookmark"/></svg></button>
    </div>

    <Teleport to="body">
      <!-- 选择菜单 -->
      <div v-if="showMenu" v-motion :initial="{opacity:0,scale:0.9,y:-5}" :enter="{opacity:1,scale:1,y:0,transition:{type:'spring',stiffness:400,damping:25}}" class="sr-menu" :style="menuStyle" @mousedown.stop @click.stop>
        <button class="sr-btn" @click="openAnnotationPanel" title="标注"><svg><use xlink:href="#iconMark"/></svg></button>
        <button class="sr-btn" @click="copyText" title="复制"><svg><use xlink:href="#iconCopy"/></svg></button>
        <button class="sr-btn" @click="openDict" title="词典"><svg><use xlink:href="#iconLanguage"/></svg></button>
      </div>

      <!-- 统一标注面板 -->
      <div v-if="showAnnotationPanel" v-motion :initial="{opacity:0,scale:0.95,y:-10}" :enter="{opacity:1,scale:1,y:0,transition:{type:'spring',stiffness:350,damping:25}}" class="sr-panel" :style="panelStyle" @mousedown.stop @click.stop>
        <div class="sr-panel-section">
          <div class="sr-panel-label">颜色</div>
          <div class="sr-panel-colors">
            <button v-for="c in COLORS" :key="c.color" class="sr-panel-color" :class="{active:selectedColor===c.color}" :style="{background:c.bg}" :title="c.name" @click="selectedColor=c.color"/>
          </div>
        </div>
        <div class="sr-panel-section">
          <div class="sr-panel-label">样式</div>
          <div class="sr-panel-styles">
            <button v-for="s in STYLES" :key="s.type" class="sr-panel-style" :class="{active:selectedStyle===s.type}" :title="s.name" @click="selectedStyle=s.type">
              <span class="sr-style-icon" :data-type="s.type">{{ s.text }}</span>
            </button>
          </div>
        </div>
        <div class="sr-panel-section">
          <div class="sr-panel-label">笔记（可选）</div>
          <textarea ref="noteInputRef" v-model="noteText" placeholder="添加笔记..." class="sr-panel-textarea"/>
        </div>
        <div class="sr-panel-actions">
          <button @click="saveAnnotation" class="sr-panel-btn-primary">保存</button>
          <button @click="cancelAnnotation" class="sr-panel-btn-secondary">取消</button>
        </div>
      </div>

      <!-- 标注悬停提示 -->
      <div v-if="showTooltip" v-motion :initial="{opacity:0,y:5}" :enter="{opacity:1,y:0}" class="sr-tooltip" :style="tooltipStyle">
        <div class="sr-tooltip-text">{{ tooltipMark?.text }}</div>
        <div v-if="tooltipMark?.note" class="sr-tooltip-note">{{ tooltipMark.note }}</div>
        <div class="sr-tooltip-actions">
          <button @click="editMark" title="编辑"><svg><use xlink:href="#iconEdit"/></svg></button>
          <button @click="deleteMark" title="删除"><svg><use xlink:href="#iconTrashcan"/></svg></button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { showMessage } from 'siyuan'
import type { Plugin } from 'siyuan'
import type { ReaderSettings } from '@/composables/useSetting'
import { openDict as openDictDialog } from '@/core/dictionary'
import { createReader, type FoliateReader } from '@/core/foliate'
import { COLORS } from '@/core/foliate/mark'
import { useReaderState } from '@/composables/useReaderState'

const props = withDefaults(defineProps<{ file?: File; plugin: Plugin; settings?: ReaderSettings; url?: string; blockId?: string; bookInfo?: any; onReaderReady?: (r: FoliateReader) => void }>(), { settings: () => ({ enabled: true, openMode: 'newTab' }) })
const containerRef = ref<HTMLElement>()
const noteInputRef = ref<HTMLTextAreaElement>()
const loading = ref(true)
const error = ref('')
const showMenu = ref(false)
const showAnnotationPanel = ref(false)
const showTooltip = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const noteText = ref('')
const hasBookmark = ref(false)
const selectedColor = ref<string>('yellow')
const selectedStyle = ref<'highlight'|'underline'|'outline'|'squiggly'>('highlight')
const tooltipMark = ref<any>(null)
let reader: FoliateReader | null = null
let currentSelection: { text: string; cfi: string } | null = null
const { setActiveReader, clearActiveReader } = useReaderState()

// 标注样式
const STYLES = [
  { type: 'highlight' as const, name: '高亮', text: 'A' },
  { type: 'underline' as const, name: '下划线', text: 'A' },
  { type: 'outline' as const, name: '边框', text: 'A' },
  { type: 'squiggly' as const, name: '波浪线', text: 'A' },
]

// 计算样式（防止溢出）
const menuStyle = computed(() => ({
  left: menuX.value + 'px',
  top: menuY.value + 'px'
}))
const panelStyle = computed(() => {
  const panelWidth = 340
  const panelHeight = 400
  let x = menuX.value
  let y = menuY.value + 50
  
  // 防止右侧溢出
  if (x + panelWidth > window.innerWidth) {
    x = window.innerWidth - panelWidth - 20
  }
  // 防止左侧溢出
  if (x < 20) x = 20
  
  // 防止底部溢出
  if (y + panelHeight > window.innerHeight) {
    y = window.innerHeight - panelHeight - 20
  }
  // 防止顶部溢出
  if (y < 20) y = 20
  
  return {
    left: x + 'px',
    top: y + 'px',
    transform: 'none' // 移除居中变换
  }
})
const tooltipStyle = computed(() => ({
  left: menuX.value + 'px',
  top: menuY.value + 'px'
}))

// ===== 初始化 =====
const init=async()=>{
  if(!containerRef.value)return
  try{
    loading.value=true
    const bookUrl=props.bookInfo?.bookUrl||props.url||(props.file?`file://${props.file.name}`:`book-${Date.now()}`)
    reader=createReader({container:containerRef.value,settings:props.settings!,bookUrl,plugin:props.plugin})
    
    // 打开书籍
    if(props.file)await reader.open(props.file)
    else if(props.url)await reader.open(props.url)
    else if(props.bookInfo?.isEpub&&props.bookInfo.epubPath){
      const ws=(window as any).siyuan?.config?.system?.workspaceDir
      const url=ws&&props.bookInfo.epubPath.startsWith('/')?`file://${ws}${props.bookInfo.epubPath}`:props.bookInfo.epubPath
      await reader.open(url)
      if(props.bookInfo.epubCfi)await reader.goTo(props.bookInfo.epubCfi)
      else if(props.bookInfo.durChapterIndex)await reader.goTo(props.bookInfo.durChapterIndex)
    }else throw new Error('未提供书籍或格式不支持')
    
    // 事件监听
    reader.on('relocate',()=>{hideMenu();updateBookmarkState()})
    reader.on('load',({doc}:any)=>doc.addEventListener('mouseup',()=>setTimeout(checkSelection,50)))
    setTimeout(()=>reader.getView().renderer?.getContents?.()?.forEach(({doc}:any)=>doc?.addEventListener('mouseup',()=>setTimeout(checkSelection,50))),500)
    setupAnnotationListeners()
    
    setActiveReader(reader.getView(),props.blockId||'',reader)
    props.onReaderReady?.(reader)
  }catch(e){error.value=e instanceof Error?e.message:'加载失败'}
  finally{loading.value=false}
}

// ===== 选择检测 =====
const calcPosition=(rect:DOMRect,doc:Document)=>{
  const iframe=Array.from(containerRef.value?.querySelectorAll('iframe')||[]).find(f=>f.contentDocument===doc)
  if(iframe){
    const ir=iframe.getBoundingClientRect()
    return{x:ir.left+rect.left+rect.width/2,y:ir.top+rect.top-10}
  }
  return{x:rect.left+rect.width/2,y:rect.top-10}
}

const checkSelection=()=>{
  if(!reader)return hideMenu()
  const contents=reader.getView().renderer?.getContents?.()
  if(!contents)return hideMenu()
  
  for(const{doc,index}of contents){
    const sel=doc.defaultView?.getSelection()
    if(!sel||sel.isCollapsed)continue
    const text=sel.toString().trim()
    if(!text)continue
    
    try{
      const range=sel.getRangeAt(0)
      const rect=range.getBoundingClientRect()
      if(rect.width===0||rect.height===0)continue
      
      currentSelection={text,cfi:reader.getView().getCFI(index,range)}
      const pos=calcPosition(rect,doc)
      menuX.value=pos.x
      menuY.value=pos.y
      showMenu.value=true
      return
    }catch{}
  }
  hideMenu()
}

// ===== 菜单控制 =====
const hideMenu=()=>{showMenu.value=showAnnotationPanel.value=showTooltip.value=false}
const openAnnotationPanel=()=>{if(currentSelection){showMenu.value=false;noteText.value='';showAnnotationPanel.value=true;setTimeout(()=>noteInputRef.value?.focus(),100)}}
const cancelAnnotation=()=>{showAnnotationPanel.value=false;noteText.value='';currentSelection=tooltipMark.value=null}
const copyText=()=>{currentSelection&&navigator.clipboard.writeText(currentSelection.text).then(()=>showMessage('已复制',1000));hideMenu()}
const openDict=()=>{currentSelection&&openDictDialog(currentSelection.text,menuX.value,menuY.value+50);hideMenu()}

// ===== 标注保存 =====
const notifyUpdate=()=>window.dispatchEvent(new Event('sireader:marks-updated'))

const saveAnnotation=async()=>{
  if(!reader||!currentSelection)return
  showAnnotationPanel.value=false
  const note=noteText.value.trim()
  try{
    if(tooltipMark.value){
      await reader.marks.updateMark(tooltipMark.value.cfi,{color:selectedColor.value as any,style:selectedStyle.value,note:note||undefined})
      showMessage('标注已更新')
    }else{
      note?await reader.marks.addNote(currentSelection.cfi,note,currentSelection.text,selectedColor.value as any,selectedStyle.value):await reader.marks.addHighlight(currentSelection.cfi,currentSelection.text,selectedColor.value as any,selectedStyle.value)
      showMessage(note?'笔记已保存':'标注已保存')
    }
    reader.getView().deselect()
    notifyUpdate()
  }catch{showMessage('保存失败',3000,'error')}
  currentSelection=tooltipMark.value=null
}

// ===== 标注监听（foliate-js 原生事件）=====
const setupAnnotationListeners=()=>{
  if(!reader)return
  reader.getView().addEventListener('show-annotation',((e:CustomEvent)=>{
    const {value,range}=e.detail
    const mark=reader.marks.getAll().find(m=>m.cfi===value)
    if(!mark)return
    
    try{
      const rect=range.getBoundingClientRect()
      const iframe=Array.from(containerRef.value?.querySelectorAll('iframe')||[]).find(f=>f.contentDocument?.contains(range.startContainer))
      if(iframe){
        const ir=iframe.getBoundingClientRect()
        menuX.value=ir.left+rect.left+rect.width/2
        menuY.value=ir.top+rect.top+rect.height+10
      }else{
        menuX.value=rect.left+rect.width/2
        menuY.value=rect.top+rect.height+10
      }
      tooltipMark.value=mark
      showTooltip.value=true
    }catch{}
  })as EventListener)
}

// ===== 标注编辑/删除 =====
const editMark=()=>{
  if(!tooltipMark.value)return
  showTooltip.value=false
  currentSelection={text:tooltipMark.value.text||'',cfi:tooltipMark.value.cfi}
  noteText.value=tooltipMark.value.note||''
  selectedColor.value=tooltipMark.value.color||'yellow'
  selectedStyle.value=tooltipMark.value.style||'highlight'
  showAnnotationPanel.value=true
  setTimeout(()=>noteInputRef.value?.focus(),50)
}

const deleteMark=async()=>{
  if(!tooltipMark.value||!reader)return
  try{
    await reader.marks.deleteMark(tooltipMark.value.cfi)
    showMessage('已删除',1500,'info')
    showTooltip.value=false
    tooltipMark.value=null
    notifyUpdate()
  }catch{showMessage('删除失败',3000,'error')}
}

// ===== 书签 =====
const updateBookmarkState=()=>hasBookmark.value=reader?.marks.hasBookmark()??false
const toggleBookmark=()=>{
  if(!reader)return
  try{const added=reader.marks.toggleBookmark();hasBookmark.value=added;showMessage(added?'书签已添加':'书签已删除',1500,'info')}
  catch(e:any){showMessage(e.message||'添加失败',2000,'error')}
}

// ===== 监听全局编辑事件 =====
const handleGlobalEdit=(e:Event)=>{
  const detail=(e as CustomEvent).detail
  if(!detail?.item)return
  
  // 设置位置（如果提供了位置信息）
  if(detail.position){
    menuX.value=detail.position.x
    menuY.value=detail.position.y
  }
  
  tooltipMark.value=detail.item
  editMark()
}

onMounted(()=>{
  init()
  containerRef.value?.focus()
  window.addEventListener('sireader:edit-mark',handleGlobalEdit)
})
onUnmounted(()=>{
  clearActiveReader()
  reader?.destroy()
  window.removeEventListener('sireader:edit-mark',handleGlobalEdit)
})
</script>

<style scoped lang="scss">
.reader{position:relative;width:100%;height:100%;overflow:hidden;background:var(--b3-theme-background);isolation:isolate}
.reader-wrap{width:100%;height:100%;overflow-y:auto;overflow-x:hidden}
.reader-container{width:100%;height:100%;outline:none;user-select:text;-webkit-user-select:text;position:relative;z-index:1}
.reader-loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:16px;color:var(--b3-theme-on-background)}
.spinner{width:48px;height:48px;border:4px solid var(--b3-theme-primary-lighter);border-top-color:var(--b3-theme-primary);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.reader-toolbar{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:2px;padding:3px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.12);z-index:1000;opacity:0.3;transition:opacity .2s;&:hover{opacity:1}}
.toolbar-btn{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:4px;cursor:pointer;transition:all .15s;svg{width:14px;height:14px}&:hover{background:var(--b3-list-hover)}}
.sr-menu{position:fixed;z-index:10000;display:flex;gap:4px;padding:6px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.2)}
.sr-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:6px;cursor:pointer;transition:background .1s;svg{width:16px;height:16px}&:hover{background:var(--b3-list-hover)}}
.sr-panel{position:fixed;z-index:10001;width:340px;padding:16px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.15);box-sizing:border-box}
.sr-panel-section{margin-bottom:16px;&:last-of-type{margin-bottom:0}}
.sr-panel-label{font-size:12px;font-weight:600;color:var(--b3-theme-on-surface-variant);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}
.sr-panel-colors{display:flex;gap:8px;flex-wrap:wrap}
.sr-panel-color{width:32px;height:32px;border:3px solid transparent;border-radius:50%;cursor:pointer;transition:all .2s;flex-shrink:0;&:hover{transform:scale(1.15)}&.active{border-color:var(--b3-theme-on-surface);box-shadow:0 0 0 2px var(--b3-theme-surface),0 0 0 4px var(--b3-theme-primary)}}
.sr-panel-styles{display:flex;gap:6px}
.sr-panel-style{flex:1;height:40px;border:2px solid var(--b3-border-color);background:transparent;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;&:hover{border-color:var(--b3-theme-primary-light);background:var(--b3-theme-primary-lightest)}&.active{border-color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest);box-shadow:0 0 0 2px rgba(33,150,243,.1)}}
.sr-style-icon{display:block;font-size:18px;font-weight:600;line-height:1;&[data-type="highlight"]{background:linear-gradient(transparent 60%,#ffeb3b 60%)}&[data-type="underline"]{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:2px}&[data-type="outline"]{border:2px solid currentColor;padding:2px 4px;border-radius:2px}&[data-type="squiggly"]{text-decoration:underline wavy;text-decoration-thickness:2px;text-underline-offset:2px}}
.sr-panel-textarea{width:100%;min-height:80px;padding:10px;border:1px solid var(--b3-border-color);border-radius:8px;background:var(--b3-theme-background);color:var(--b3-theme-on-surface);resize:vertical;font-family:inherit;font-size:14px;line-height:1.6;box-sizing:border-box;&:focus{outline:none;border-color:var(--b3-theme-primary);box-shadow:0 0 0 3px rgba(33,150,243,.1)}&::placeholder{color:var(--b3-theme-on-surface-variant);opacity:.5}}
.sr-panel-actions{display:flex;gap:8px;margin-top:16px}
.sr-panel-btn-primary,.sr-panel-btn-secondary{flex:1;padding:10px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;transition:all .2s}
.sr-panel-btn-primary{background:var(--b3-theme-primary);color:white;&:hover{opacity:.9;transform:translateY(-1px);box-shadow:0 4px 12px rgba(33,150,243,.3)}}
.sr-panel-btn-secondary{background:var(--b3-theme-background);color:var(--b3-theme-on-surface);&:hover{background:var(--b3-list-hover)}}
.sr-tooltip{position:fixed;z-index:10002!important;max-width:320px;padding:12px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.2);transform:translateX(-50%);box-sizing:border-box;pointer-events:auto}
.sr-tooltip-text{font-size:14px;line-height:1.6;color:var(--b3-theme-on-surface);margin-bottom:8px;font-weight:500}
.sr-tooltip-note{font-size:13px;line-height:1.6;color:var(--b3-theme-on-surface-variant);padding:8px;background:var(--b3-theme-background);border-radius:4px;margin-bottom:8px}
.sr-tooltip-actions{display:flex;gap:6px;justify-content:flex-end;button{width:28px;height:28px;border:none;background:transparent;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;svg{width:14px;height:14px}&:hover{background:var(--b3-list-hover);transform:scale(1.1)}}}
</style>
