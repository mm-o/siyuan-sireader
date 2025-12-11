<template>
  <div class="reader" @click="closeAllPopups">
    <div class="reader-wrap">
      <div ref="containerRef" class="reader-container" tabindex="0"></div>
    </div>
    <div v-if="loading" class="reader-loading"><div class="spinner"></div><div>{{ error || '加载中...' }}</div></div>
    <div class="reader-toolbar">
      <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="handlePrev" :aria-label="i18n.prevChapter || '上一章'"><svg><use xlink:href="#iconLeft"/></svg></button>
      <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="handleNext" :aria-label="i18n.nextChapter || '下一章'"><svg><use xlink:href="#iconRight"/></svg></button>
      <button class="toolbar-btn b3-tooltips b3-tooltips__n" :class="{active:hasBookmark}" @click.stop="toggleBookmark" :aria-label="hasBookmark?(i18n.removeBookmark || '删除书签'):(i18n.addBookmark || '添加书签')"><svg><use xlink:href="#iconBookmark"/></svg></button>
    </div>

    <Teleport to="body">
      <!-- 选择菜单 -->
      <div v-if="showMenu" v-motion :initial="{opacity:0,scale:0.95}" :enter="{opacity:1,scale:1,transition:{type:'spring',stiffness:400,damping:25}}" class="sr-menu" :style="menuStyle" @mousedown.stop @click.stop>
        <button class="sr-btn b3-tooltips b3-tooltips__s" @click="openAnnotationPanel" :aria-label="i18n.mark || '标注'"><svg><use xlink:href="#iconMark"/></svg></button>
        <button class="sr-btn b3-tooltips b3-tooltips__s" @click="copyText" :aria-label="i18n.copy || '复制'"><svg><use xlink:href="#iconCopy"/></svg></button>
        <button class="sr-btn b3-tooltips b3-tooltips__s" @click="openDict" :aria-label="i18n.dict || '词典'"><svg><use xlink:href="#iconLanguage"/></svg></button>
      </div>

      <!-- 统一标注面板 -->
      <div v-if="showAnnotationPanel" v-motion :initial="{opacity:0,scale:0.95,y:-10}" :enter="{opacity:1,scale:1,y:0,transition:{type:'spring',stiffness:350,damping:25}}" class="sr-panel" :style="panelStyle" @mousedown.stop @click.stop>
        <div class="sr-panel-section">
          <div class="sr-panel-label">颜色</div>
          <div class="sr-panel-colors">
            <button v-for="c in COLORS" :key="c.color" class="sr-panel-color" :class="{active:selectedColor===c.color}" :style="{background:c.bg}" :aria-label="c.name" @click="selectedColor=c.color"/>
          </div>
        </div>
        <div class="sr-panel-section">
          <div class="sr-panel-label">样式</div>
          <div class="sr-panel-styles">
            <button v-for="s in STYLES" :key="s.type" class="sr-panel-style" :class="{active:selectedStyle===s.type}" :aria-label="s.name" @click="selectedStyle=s.type">
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
      <div v-if="showTooltip" v-motion :initial="{opacity:0,y:5}" :enter="{opacity:1,y:0}" class="sr-tooltip" :style="tooltipStyle" @mousedown.stop @click.stop>
        <div class="sr-tooltip-text">{{ tooltipMark?.text }}</div>
        <div v-if="tooltipMark?.note" class="sr-tooltip-note">{{ tooltipMark.note }}</div>
        <div class="sr-tooltip-actions">
          <button class="b3-tooltips b3-tooltips__n" @click="editMark" :aria-label="i18n.edit || '编辑'"><svg><use xlink:href="#iconEdit"/></svg></button>
          <button class="b3-tooltips b3-tooltips__n" @click="deleteMark" :aria-label="i18n.delete || '删除'"><svg><use xlink:href="#iconTrashcan"/></svg></button>
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
import { PRESET_THEMES } from '@/composables/useSetting'
import { openDict as openDictDialog } from '@/core/dictionary'
import { createReader, type FoliateReader, setActiveReader, clearActiveReader } from '@/core/foliate'
import { COLORS } from '@/core/foliate/mark'

const props = defineProps<{ file?: File; plugin: Plugin; settings?: ReaderSettings; url?: string; blockId?: string; bookInfo?: any; onReaderReady?: (r: FoliateReader) => void; i18n?: any }>()

// 提供默认 i18n 对象
const i18n = computed(() => props.i18n || {})

// 监听设置更新
const handleSettingsUpdate = (e: Event) => {
  const settings = (e as CustomEvent).detail
  reader?.updateSettings?.(settings)
  currentView && applyTxtSettings(currentView, settings)
}

// 应用 TXT 设置
const applyTxtSettings = (view: any, settings: ReaderSettings) => {
  if (!view?.iframe?.contentDocument) return
  const doc = view.iframe.contentDocument
  doc.querySelectorAll('style[data-sireader]').forEach((s: Element) => s.remove())
  const { textSettings: t, paragraphSettings: p, layoutSettings: l, visualSettings: v, theme, customTheme } = settings
  const th = theme === 'custom' ? customTheme : (theme && PRESET_THEMES[theme]) || PRESET_THEMES.default
  const filters = [v.brightness !== 1 && `brightness(${v.brightness})`, v.contrast !== 1 && `contrast(${v.contrast})`, v.sepia > 0 && `sepia(${v.sepia})`, v.saturate !== 1 && `saturate(${v.saturate})`, v.invert && 'invert(1) hue-rotate(180deg)'].filter(Boolean).join(' ')
  const isCustomFont = t.fontFamily === 'custom' && t.customFont.fontFamily
  const font = isCustomFont ? `"${t.customFont.fontFamily}", sans-serif` : (t.fontFamily || 'inherit')
  const fontFace = isCustomFont ? `@font-face{font-family:"${t.customFont.fontFamily}";src:url("/plugins/custom-fonts/${t.customFont.fontFile}")}` : ''
  const bgStyle = th.bgImg ? `background:url("${th.bgImg}") center/cover no-repeat` : `background:${th.bg}`
  const css = `${fontFace}body{${bgStyle}!important;color:${th.color}!important;font-family:${font}!important;font-size:${t.fontSize}px!important;letter-spacing:${t.letterSpacing}em!important;padding:${l.marginVertical}px ${l.marginHorizontal}px!important${filters ? `;filter:${filters}` : ''}}p{line-height:${p.lineHeight}!important;margin:${p.paragraphSpacing}em 0!important;text-indent:${p.textIndent}em!important}`
  const style = doc.createElement('style')
  style.setAttribute('data-sireader', 'true')
  style.textContent = css
  doc.head.appendChild(style)
  // 应用整体主题到容器
  const iframe = view.iframe as HTMLIFrameElement
  if (iframe) Object.assign(iframe.style, { background: th.bgImg ? `url("${th.bgImg}") center/cover no-repeat` : th.bg })
}

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
let currentView: any = null
let currentSelection: { text: string; cfi?: string; section?: number } | null = null

const STYLES = [
  { type: 'highlight' as const, name: '高亮', text: 'A' },
  { type: 'underline' as const, name: '下划线', text: 'A' },
  { type: 'outline' as const, name: '边框', text: 'A' },
  { type: 'squiggly' as const, name: '波浪线', text: 'A' }
]

// ===== 工具函数 =====
const clamp = (v:number,min:number,max:number) => Math.max(min,Math.min(v,max))
const getCoords=(rect:DOMRect,doc:Document)=>{
  const iframe=doc.defaultView?.frameElement as HTMLIFrameElement|null
  if(!iframe)return {x:rect.left,y:rect.top}
  const ir=iframe.getBoundingClientRect()
  return {x:(rect.left>ir.width?rect.left%ir.width:rect.left)+ir.left,y:rect.top+ir.top}
}

// ===== Computed =====
const marks = computed(() => reader?.marks || (currentView as any)?.marks)

const menuStyle = computed(() => ({
  left:clamp(menuX.value,60,window.innerWidth-60)+'px',
  top:clamp(menuY.value-54,60,window.innerHeight-60)+'px',
  transform:'translate(-50%,0)'
}))
const panelStyle = computed(() => ({
  left:clamp(menuX.value,20,window.innerWidth-360)+'px',
  top:clamp(menuY.value+50,20,window.innerHeight-420)+'px'
}))
const tooltipStyle = computed(() => ({
  left:clamp(menuX.value,110,window.innerWidth-110)+'px',
  top:clamp(menuY.value-90,100,window.innerHeight-100)+'px',
  transform:'translate(-50%,0)'
}))

// ===== 初始化 =====
const init=async()=>{
  if(!containerRef.value)return
  try{
    loading.value=true
    error.value=''
    const bookUrl=props.bookInfo?.bookUrl||props.url||(props.file?`file://${props.file.name}`:`book-${Date.now()}`)
    // 设置全局当前书籍 URL，供 dictionary 模块使用
    ;(window as any).__currentBookUrl=bookUrl
    const format=props.bookInfo?.format||(props.bookInfo?.isEpub?'epub':props.file?.name.endsWith('.txt')?'txt':'online')
    const isTxt=format==='txt'||format==='online'
    
    if(isTxt){
      // TXT/在线书籍
      const{createFoliateView,loadTxtBook}=await import('@/core/foliate/reader')
      const{MarkManager}=await import('@/core/foliate/mark')
      
      const view=createFoliateView(containerRef.value)
      currentView=view
      
      if(props.file&&format==='txt'){
        await loadTxtBook(view,await props.file.text(),[],null,props.settings)
      }else if(props.bookInfo&&format==='online'){
        await loadTxtBook(view,'',props.bookInfo.chapters||[],props.bookInfo,props.settings)
        if(props.bookInfo.durChapterIndex!==undefined)await view.goTo(props.bookInfo.durChapterIndex)
      }else if(props.bookInfo?.filePath){
        const res=await fetch('/api/file/getFile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:props.bookInfo.filePath})})
        await loadTxtBook(view,await(await res.blob()).text(),[],null,props.settings)
        if(props.bookInfo.durChapterIndex!==undefined)await view.goTo(props.bookInfo.durChapterIndex)
      }
      
      const marks=new MarkManager(view,bookUrl,props.plugin)
      await marks.init()
      ;(view as any).marks=marks
      
      view.addEventListener('relocate',()=>{closeAllPopups();updateBookmarkState();saveProgress()})
      
      setActiveReader(view,null)
    }else{
      // EPUB/PDF/MOBI 等
      reader=createReader({container:containerRef.value,settings:props.settings!,bookUrl,plugin:props.plugin})
      
      if(props.file){
        await reader.open(props.file)
      }else if(props.url){
        await reader.open(props.url)
      }else if(props.bookInfo?.filePath){
        const res=await fetch('/api/file/getFile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:props.bookInfo.filePath})})
        if(!res.ok)throw new Error('文件读取失败')
        const file=new File([await res.blob()],props.bookInfo.filePath.split('/').pop()||'book',{type:res.headers.get('content-type')||''})
        await reader.open(file)
        if(props.bookInfo.epubCfi)await reader.goTo(props.bookInfo.epubCfi)
        else if(props.bookInfo.durChapterIndex!==undefined)await reader.goTo(props.bookInfo.durChapterIndex)
      }else throw new Error('未提供书籍')
      
      reader.on('relocate',()=>{closeAllPopups();updateBookmarkState();saveProgress()})
      reader.on('load',({doc}:any)=>doc?.addEventListener?.('mouseup',()=>setTimeout(checkSelection,50)))
      setTimeout(()=>reader.getView().renderer?.getContents?.()?.forEach(({doc}:any)=>doc?.addEventListener?.('mouseup',()=>setTimeout(checkSelection,50))),500)
      setupAnnotationListeners()
      
      currentView=reader.getView()
      setActiveReader(currentView,reader)
      props.onReaderReady?.(reader)
    }
  }catch(e){
    error.value=e instanceof Error?e.message:'加载失败'
  }finally{loading.value=false}
}

const checkSelection=(txtDoc?:Document)=>{
  const processSelection=(doc:Document,index?:number)=>{
    const sel=doc.defaultView?.getSelection()
    if(!sel||sel.isCollapsed||!sel.toString().trim())return false
    try{
      const range=sel.getRangeAt(0)
      const rect=range.getBoundingClientRect()
      const {x,y}=getCoords(rect,doc)
      currentSelection={text:sel.toString().trim(),...(index!==undefined?{cfi:reader!.getView().getCFI(index,range)}:{section:(currentView as any).lastLocation?.section||0})}
      menuX.value=x+(index===undefined?rect.width/2:0)
      menuY.value=y
      showMenu.value=true
      return true
    }catch{return false}
  }
  
  if(reader){
    const contents=reader.getView().renderer?.getContents?.()
    if(!contents)return closeAllPopups()
    for(const{doc,index}of contents)if(processSelection(doc,index))return
  }else if(currentView&&txtDoc&&processSelection(txtDoc))return
  
  closeAllPopups()
}

// ===== 弹窗控制 =====
const closeAllPopups=()=>{showMenu.value=showAnnotationPanel.value=showTooltip.value=false}
const openAnnotationPanel=()=>{
  if(!currentSelection)return
  showMenu.value=showTooltip.value=false
  noteText.value=''
  showAnnotationPanel.value=true
  setTimeout(()=>noteInputRef.value?.focus(),100)
}
const cancelAnnotation=()=>{showAnnotationPanel.value=false;noteText.value='';currentSelection=tooltipMark.value=null}
const copyText=async()=>{
  if(!currentSelection)return
  if(!reader){
    navigator.clipboard.writeText(currentSelection.text).then(()=>showMessage('已复制',1000))
    closeAllPopups()
    return
  }
  const{formatBookLink}=await import('@/composables/useSetting')
  const book=reader.getBook(),loc=reader.getLocation()
  const bookUrl=(window as any).__currentBookUrl||props.bookInfo?.bookUrl||props.url||''
  if(!bookUrl||bookUrl.startsWith('file://')){
    showMessage('本地文件无法生成跳转链接，仅复制文本',2000,'info')
    navigator.clipboard.writeText(currentSelection.text).then(()=>showMessage('已复制',1000))
    closeAllPopups()
    return
  }
  const formatAuthor=a=>Array.isArray(a)?a.map(c=>typeof c==='string'?c:c?.name).filter(Boolean).join(', '):typeof a==='string'?a:a?.name||''
  const title=book?.metadata?.title||props.bookInfo?.name||''
  const author=formatAuthor(book?.metadata?.author||props.bookInfo?.author)
  const chapter=loc?.tocItem?.label||loc?.tocItem?.title||reader.getView()?.lastLocation?.tocItem?.label||''
  const link=formatBookLink(bookUrl,title,author,chapter,currentSelection.cfi||'',currentSelection.text||'',props.settings?.linkFormat||'> [!NOTE] 📑 书名\n> [章节](链接) 文本')
  navigator.clipboard.writeText(link).then(()=>showMessage('已复制',1000))
  closeAllPopups()
}
const openDict=()=>{if(currentSelection){openDictDialog(currentSelection.text,menuX.value,menuY.value+50,currentSelection);closeAllPopups()}}

// ===== 标注保存 =====
const saveAnnotation=async()=>{
  if(!currentSelection)return
  showAnnotationPanel.value=false
  const note=noteText.value.trim()
  if(!marks.value)return showMessage('标记系统未初始化',3000,'error')
  try{
    const key=tooltipMark.value?(tooltipMark.value.cfi||`section-${tooltipMark.value.section}`):(currentSelection.cfi||currentSelection.section)
    if(key===undefined)return
    
    if(tooltipMark.value){
      await marks.value.updateMark(key,{color:selectedColor.value as any,style:selectedStyle.value,note:note||undefined})
      showMessage('标注已更新')
    }else{
      note?await marks.value.addNote(key,note,currentSelection.text,selectedColor.value as any,selectedStyle.value):await marks.value.addHighlight(key,currentSelection.text,selectedColor.value as any,selectedStyle.value)
      showMessage(note?'笔记已保存':'标注已保存')
    }
    
    reader?.getView().deselect()
  }catch{
    showMessage('保存失败',3000,'error')
  }
  currentSelection=tooltipMark.value=null
}

// 标注监听
const setupAnnotationListeners=()=>{
  if(!reader)return
  reader.getView().addEventListener('show-annotation',((e:CustomEvent)=>{
    const {value,range}=e.detail
    const mark=reader.marks.getAll().find(m=>m.cfi===value)
    if(!mark)return
    try{
      const rect=range.getBoundingClientRect()
      const {x,y}=getCoords(rect,range.startContainer.ownerDocument)
      menuX.value=x
      menuY.value=y+rect.height+10
      tooltipMark.value=mark
      // 延迟显示，避免被 hideMenu 立即隐藏
      setTimeout(()=>showTooltip.value=true,50)
    }catch{}
  })as EventListener)
}

// ===== 标注编辑/删除 =====
const editMark=()=>{
  if(!tooltipMark.value)return
  showTooltip.value=false
  currentSelection={text:tooltipMark.value.text||'',cfi:tooltipMark.value.cfi,section:tooltipMark.value.section}
  Object.assign({noteText,selectedColor,selectedStyle},{noteText:tooltipMark.value.note||'',selectedColor:tooltipMark.value.color||'yellow',selectedStyle:tooltipMark.value.style||'highlight'})
  showAnnotationPanel.value=true
  setTimeout(()=>noteInputRef.value?.focus(),50)
}
const deleteMark=async()=>{
  if(!tooltipMark.value)return
  if(!marks.value)return showMessage('标记系统未初始化',3000,'error')
  try{
    const success=await marks.value.deleteMark(tooltipMark.value.cfi||`section-${tooltipMark.value.section}`)
    if(success){
      showMessage('已删除',1500,'info')
      showTooltip.value=false
      tooltipMark.value=null
    }else showMessage('删除失败',3000,'error')
  }catch{showMessage('删除失败',3000,'error')}
}

// 导航
const handlePrev=()=>reader?reader.prev():currentView?.goLeft?.()
const handleNext=()=>reader?reader.next():currentView?.goRight?.()

// ===== 进度保存 =====
const saveProgress=()=>{
  if(!marks.value)return
  const loc=reader?reader.getView().lastLocation:((currentView as any)?.getLocation?.()||currentView?.lastLocation)
  marks.value.saveProgress(loc)
}

// ===== 书签 =====
const updateBookmarkState=()=>{hasBookmark.value=!!marks.value?.hasBookmark()}
const toggleBookmark=()=>{
  if(!marks.value)return
  try{
    hasBookmark.value=marks.value.toggleBookmark()
    showMessage(hasBookmark.value?'已添加':'已删除',1500,'info')
  }catch(e:any){showMessage(e.message||'操作失败',2000,'error')}
}

// 全局编辑事件
const handleGlobalEdit=(e:Event)=>{
  const {item,position}=(e as CustomEvent).detail||{}
  if(!item)return
  if(position){menuX.value=position.x;menuY.value=position.y}
  tooltipMark.value=item
  editMark()
}

// TXT 选中事件
const handleTxtSelection=(e:Event)=>{
  const doc=(e as CustomEvent).detail?.doc
  setTimeout(()=>checkSelection(doc),50)
}

// TXT 标注点击事件
const handleTxtAnnotationClick=(e:Event)=>{
  const{mark,x,y}=(e as CustomEvent).detail
  menuX.value=x
  menuY.value=y
  tooltipMark.value=mark
  setTimeout(()=>showTooltip.value=true,50)
}

// 键盘快捷键
const handleKeydown=(e:KeyboardEvent)=>{
  const t=e.target as HTMLElement
  if(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)return
  if(!reader&&!currentView)return
  const k=e.key
  if(k==='ArrowLeft'||k==='ArrowUp'||k==='PageUp')(reader?reader.prev():currentView?.goLeft?.()),e.preventDefault()
  else if(k==='ArrowRight'||k==='ArrowDown'||k==='PageDown'||k===' ')(reader?reader.next():currentView?.goRight?.()),e.preventDefault()
}

const handleGoto=(e:CustomEvent)=>{
  const {cfi}=e.detail
  if(!cfi||!reader)return
  // 使用 requestAnimationFrame 确保动画流畅
  requestAnimationFrame(()=>reader.goTo(cfi))
}

const handleToggleBookmark=()=>toggleBookmark()

onMounted(()=>{init();containerRef.value?.focus();(window as any).__sireader_active_reader=reader||currentView;window.addEventListener('sireader:edit-mark',handleGlobalEdit);window.addEventListener('txt-selection',handleTxtSelection);window.addEventListener('txt-annotation-click',handleTxtAnnotationClick);window.addEventListener('sireaderSettingsUpdated',handleSettingsUpdate);window.addEventListener('keydown',handleKeydown);window.addEventListener('sireader:goto',handleGoto as any);window.addEventListener('sireader:toggleBookmark',handleToggleBookmark)})
onUnmounted(()=>{
  clearActiveReader()
  reader?.destroy()
  ;(window as any).__sireader_active_reader=null
  window.removeEventListener('sireader:edit-mark',handleGlobalEdit)
  window.removeEventListener('txt-selection',handleTxtSelection)
  window.removeEventListener('txt-annotation-click',handleTxtAnnotationClick)
  window.removeEventListener('sireaderSettingsUpdated',handleSettingsUpdate)
  window.removeEventListener('keydown',handleKeydown)
  window.removeEventListener('sireader:goto',handleGoto as any)
  window.removeEventListener('sireader:toggleBookmark',handleToggleBookmark)
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
.sr-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:6px;cursor:pointer;transition:all .15s;color:var(--b3-theme-on-surface);svg{width:16px;height:16px}&:hover{background:var(--b3-list-hover);color:var(--b3-theme-primary)}}
.sr-panel{position:fixed;z-index:10001;width:340px;padding:16px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.15);box-sizing:border-box}
.sr-panel-section{margin-bottom:16px;&:last-of-type{margin-bottom:0}}
.sr-panel-label{font-size:12px;font-weight:600;color:var(--b3-theme-on-surface-variant);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}
.sr-panel-colors{display:flex;gap:8px;flex-wrap:wrap}
.sr-panel-color{width:32px;height:32px;border:3px solid transparent;border-radius:50%;cursor:pointer;transition:all .2s;flex-shrink:0;&:hover{transform:scale(1.15)}&.active{border-color:var(--b3-theme-on-surface);box-shadow:0 0 0 2px var(--b3-theme-surface),0 0 0 4px var(--b3-theme-primary)}}
.sr-panel-styles{display:flex;gap:6px}
.sr-panel-style{flex:1;height:40px;border:2px solid var(--b3-border-color);background:transparent;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;&:hover{border-color:var(--b3-theme-primary-light);background:var(--b3-theme-primary-lightest)}&.active{border-color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest);box-shadow:0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 10%, transparent)}}
.sr-style-icon{display:block;font-size:18px;font-weight:600;line-height:1;&[data-type="highlight"]{background:linear-gradient(transparent 60%,var(--b3-theme-primary-lightest) 60%)}&[data-type="underline"]{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:2px}&[data-type="outline"]{border:2px solid currentColor;padding:2px 4px;border-radius:2px}&[data-type="squiggly"]{text-decoration:underline wavy;text-decoration-thickness:2px;text-underline-offset:2px}}
.sr-panel-textarea{width:100%;min-height:80px;padding:10px;border:1px solid var(--b3-border-color);border-radius:8px;background:var(--b3-theme-background);color:var(--b3-theme-on-surface);resize:vertical;font-family:inherit;font-size:14px;line-height:1.6;box-sizing:border-box;&:focus{outline:none;border-color:var(--b3-theme-primary);box-shadow:0 0 0 3px color-mix(in srgb, var(--b3-theme-primary) 10%, transparent)}&::placeholder{color:var(--b3-theme-on-surface-variant);opacity:.5}}
.sr-panel-actions{display:flex;gap:8px;margin-top:16px}
.sr-panel-btn-primary,.sr-panel-btn-secondary{flex:1;padding:10px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;transition:all .2s}
.sr-panel-btn-primary{background:var(--b3-theme-primary);color:white;&:hover{opacity:.9;transform:translateY(-1px);box-shadow:0 4px 12px rgba(33,150,243,.3)}}
.sr-panel-btn-secondary{background:var(--b3-theme-background);color:var(--b3-theme-on-surface);&:hover{background:var(--b3-list-hover)}}
.sr-tooltip{position:fixed;z-index:10002!important;max-width:320px;padding:12px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.2);transform:translateX(-50%);box-sizing:border-box;pointer-events:auto}
.sr-tooltip-text{font-size:14px;line-height:1.6;color:var(--b3-theme-on-surface);margin-bottom:8px;font-weight:500}
.sr-tooltip-note{font-size:13px;line-height:1.6;color:var(--b3-theme-on-surface-variant);padding:8px;background:var(--b3-theme-background);border-radius:4px;margin-bottom:8px}
.sr-tooltip-actions{display:flex;gap:6px;justify-content:flex-end;button{width:28px;height:28px;border:none;background:transparent;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;svg{width:14px;height:14px}&:hover{background:var(--b3-list-hover);transform:scale(1.1)}}}
</style>
