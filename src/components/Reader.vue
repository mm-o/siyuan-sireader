<template>
  <div ref="containerRef" class="reader-container" tabindex="0" @click="closeAllPopups($event)" @keydown="handleKeydown">
    <div v-if="loading" class="reader-loading"><div class="spinner"></div><div>{{ error || '加载中...' }}</div></div>
    
    <!-- PDF 工具栏 -->
    <PdfToolbar v-if="isPdfMode&&pdfViewer&&pdfSearcher" :viewer="pdfViewer" :searcher="pdfSearcher" :file-size="pdfSource?.byteLength" @print="handlePrint" @download="handleDownload" @export-images="handleExportImages" @ink-toggle="handleInkToggle" @ink-color="handleInkColor" @ink-width="handleInkWidth" @ink-undo="handleInkUndo" @ink-clear="handleInkClear" @ink-save="handleInkSave" @ink-eraser="handleInkEraser" @shape-toggle="handleShapeToggle" @shape-type="handleShapeType" @shape-color="handleShapeColor" @shape-width="handleShapeWidth" @shape-undo="handleShapeUndo" @shape-clear="handleShapeClear"/>
    
    <div ref="viewerContainerRef" class="viewer-container" :class="{'has-pdf-toolbar':isPdfMode}"></div>
    
    <!-- 搜索面板 -->
    <Transition name="search-slide">
      <div v-if="showSearch" class="reader-search" @click.stop>
        <input v-model="searchQuery" class="search-input" :placeholder="i18n.searchPlaceholder||'搜索...'" @keydown.enter="handleSearch" @keydown.esc="showSearch=false" ref="searchInputRef">
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click="handleSearch" aria-label="搜索"><svg><use xlink:href="#iconSearch"/></svg></button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click="handleSearchPrev" :disabled="!hasSearchResults" aria-label="上一个"><svg><use xlink:href="#iconUp"/></svg></button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click="handleSearchNext" :disabled="!hasSearchResults" aria-label="下一个"><svg><use xlink:href="#iconDown"/></svg></button>
        <span class="search-count">{{ searchCount }}</span>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click="handleSearchClear" aria-label="清除"><svg><use xlink:href="#iconClose"/></svg></button>
      </div>
    </Transition>
    
    <div class="reader-toolbar">
      <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="handlePrev" :aria-label="i18n.prevChapter||'上一章'"><svg><use xlink:href="#iconLeft"/></svg></button>
      <div v-if="isPdfMode" class="toolbar-page-nav" @click.stop>
        <input v-model.number="pageInput" @keydown.enter="handlePageJump" type="number" :min="1" :max="totalPages" class="toolbar-page-input">
        <span class="toolbar-page-total">/ {{totalPages}}</span>
      </div>
      <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="handleNext" :aria-label="i18n.nextChapter||'下一章'"><svg><use xlink:href="#iconRight"/></svg></button>
      <button class="toolbar-btn b3-tooltips b3-tooltips__n" :class="{active:hasBookmark}" @click.stop="toggleBookmark" :aria-label="hasBookmark?(i18n.removeBookmark||'删除书签'):(i18n.addBookmark||'添加书签')"><svg><use xlink:href="#iconBookmark"/></svg></button>
      <button class="toolbar-btn b3-tooltips b3-tooltips__n" :class="{active:showSearch}" @click.stop="toggleSearch" :aria-label="i18n.search||'搜索'"><svg><use xlink:href="#iconSearch"/></svg></button>
    </div>
  </div>
  
  <Teleport to="body">
      <!-- 选择菜单 -->
      <div v-if="showMenu" v-motion :initial="{opacity:0,scale:0.95}" :enter="{opacity:1,scale:1,transition:{type:'spring',stiffness:400,damping:25}}" class="sr-selection-menu" :style="menuStyle" @mousedown.stop @mouseup.stop @click.stop>
        <button class="sr-btn b3-tooltips b3-tooltips__s" @click="openAnnotationPanel" :aria-label="i18n.mark || '标注'"><svg><use xlink:href="#iconMark"/></svg></button>
        <button class="sr-btn b3-tooltips b3-tooltips__s" @click="copyText" :aria-label="i18n.copy || '复制'"><svg><use xlink:href="#iconCopy"/></svg></button>
        <button class="sr-btn b3-tooltips b3-tooltips__s" @click="openDict" :aria-label="i18n.dict || '词典'"><svg><use xlink:href="#iconLanguage"/></svg></button>
      </div>

      <!-- 统一标注卡片 -->
      <div v-if="showAnnotation" v-motion :initial="{opacity:0,y:5}" :enter="{opacity:1,y:0}" class="sr-card sr-popup" :style="annotationStyle" @click.stop>
        <span class="sr-bar" :style="{background:colors[selectedColor]||'var(--b3-theme-primary)'}"></span>
        <div class="sr-main">
          <!-- 标题/文本 -->
          <div class="sr-title" :contenteditable="isEditing" @blur="e=>currentText=e.target.textContent" v-html="currentText"></div>
          
          <!-- 笔记 -->
          <textarea v-if="isEditing||noteText" ref="noteInputRef" v-model="noteText" :readonly="!isEditing" :placeholder="isEditing?'添加笔记...':''" class="sr-note-input" :class="{readonly:!isEditing}"/>
          
          <!-- 编辑模式：颜色和形状/样式 -->
          <div v-if="isEditing" class="sr-options" @click.stop>
            <div class="sr-colors">
              <button v-for="c in COLORS" :key="c.color" class="sr-color-btn" :class="{active:selectedColor===c.color}" :style="{background:c.bg}" @click.stop="selectedColor=c.color"/>
            </div>
            <div class="sr-styles">
              <template v-if="currentMark?.type==='shape'">
                <button v-for="s in SHAPES" :key="s.type" class="sr-style-btn" :class="{active:selectedShapeType===s.type}" @click.stop="selectedShapeType=s.type">
                  <svg class="sr-style-icon"><use :xlink:href="s.icon"/></svg>
                </button>
              </template>
              <template v-else>
                <button v-for="s in STYLES" :key="s.type" class="sr-style-btn" :class="{active:selectedStyle===s.type}" @click.stop="selectedStyle=s.type">
                  <span class="sr-style-icon" :data-type="s.type">{{ s.text }}</span>
                </button>
              </template>
            </div>
          </div>
          
          <!-- 操作按钮 -->
          <div class="sr-actions">
            <button v-if="!isEditing" @click.stop="startEdit" class="sr-btn-icon"><svg><use xlink:href="#iconEdit"/></svg></button>
            <button v-if="!isEditing" @click.stop="deleteMark" class="sr-btn-icon"><svg><use xlink:href="#iconTrashcan"/></svg></button>
            <button v-if="isEditing" @click.stop="saveAnnotation" class="sr-btn-primary">保存</button>
            <button v-if="isEditing" @click.stop="cancelEdit" class="sr-btn-secondary">取消</button>
          </div>
        </div>
      </div>


    </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { showMessage } from 'siyuan'
import type { Plugin } from 'siyuan'
import type { ReaderSettings } from '@/composables/useSetting'
import { PRESET_THEMES } from '@/composables/useSetting'
import { openDict as openDictDialog } from '@/core/dictionary'
import { createReader, type FoliateReader, setActiveReader, clearActiveReader } from '@/core/foliate'
import { COLORS, STYLES, getColorMap } from '@/core/foliate/mark'
import { createAnnotationManager, type UnifiedAnnotationManager } from '@/core/annotation'
import { createInkToolManager, type InkToolManager } from '@/core/pdf/ink'
import { createShapeToolManager, type ShapeToolManager } from '@/core/pdf/shape'
import PdfToolbar from './PdfToolbar.vue'

const props = defineProps<{ file?: File; plugin: Plugin; settings?: ReaderSettings; url?: string; blockId?: string; bookInfo?: any; onReaderReady?: (r: FoliateReader) => void; i18n?: any }>()

const i18n = computed(() => props.i18n || {})
const colors = getColorMap()

// 监听设置更新
const handleSettingsUpdate = async (e: Event) => {
  const settings = (e as CustomEvent).detail
  reader?.updateSettings?.(settings)
  currentView.value && applyTxtSettings(currentView.value, settings)
  // PDF主题和视图模式更新（统一在updateTheme中处理）
  pdfViewer.value && await pdfViewer.value.updateTheme(settings)
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
const viewerContainerRef = ref<HTMLElement>()
const noteInputRef = ref<HTMLTextAreaElement>()
const loading = ref(true)
const error = ref('')
const showMenu = ref(false)
const showAnnotation = ref(false)
const isEditing = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const noteText = ref('')
const currentText = ref('')
const hasBookmark = ref(false)
const selectedColor = ref<string>('yellow')
const selectedStyle = ref<'highlight'|'underline'|'outline'|'squiggly'>('highlight')
const selectedShapeType = ref<'rect'|'circle'|'triangle'>('rect')
const currentMark = ref<any>(null)
const SHAPES=[{type:'rect',icon:'#iconSquareDashed'},{type:'circle',icon:'#iconCircleDashed'},{type:'triangle',icon:'#iconTriangleDashed'}]as const

const pdfViewer = ref<any>(null)
const pdfSearcher = ref<any>(null)
const currentView = ref<any>(null)
const pageInput = ref(1)
const totalPages = ref(0)
const showSearch = ref(false)
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const searchCurrentIndex = ref(0)
let reader: FoliateReader | null = null
let currentSelection: { text: string; cfi?: string; section?: number } | null = null
let pdfSource: ArrayBuffer | null = null
let annotationManager: UnifiedAnnotationManager | null = null
let inkToolManager: InkToolManager | null = null
let shapeToolManager: ShapeToolManager | null = null
let justOpenedPopup = false

// 工具函数 & Computed
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(v,max))
const getCoords=(rect:DOMRect,doc:Document)=>{const iframe=doc.defaultView?.frameElement as HTMLIFrameElement|null;if(!iframe)return{x:rect.left,y:rect.top};const ir=iframe.getBoundingClientRect();return{x:(rect.left>ir.width?rect.left%ir.width:rect.left)+ir.left,y:rect.top+ir.top}}
const marks=computed(()=>reader?.marks||currentView.value?.marks)
const isPdfMode=computed(()=>!!pdfViewer.value)
const hasSearchResults=computed(()=>searchResults.value.length>0)
const searchCount=computed(()=>{
  if(isPdfMode.value){
    const total=searchResults.value.length
    return total>0?`${searchCurrentIndex.value+1}/${total}`:'0/0'
  }
  return searchResults.value.length>0?`${searchResults.value.length}`:'0'
})

const menuStyle = computed(() => ({left:`${clamp(menuX.value,60,window.innerWidth-60)}px`,top:`${clamp(menuY.value-54,60,window.innerHeight-60)}px`,transform:'translate(-50%,0)'}))
const annotationStyle = computed(() => ({left:`${clamp(menuX.value,170,window.innerWidth-170)}px`,top:`${clamp(menuY.value+20,20,window.innerHeight-(isEditing.value?300:150))}px`,transform:'translate(-50%,0)'}))

// 初始化
const init=async()=>{
  if(!containerRef.value)return
  try{
    loading.value=true
    error.value=''
    const bookUrl=props.bookInfo?.bookUrl||props.url||(props.file?`file://${props.file.name}`:`book-${Date.now()}`)
    ;(window as any).__currentBookUrl=bookUrl
    const format=props.bookInfo?.format||(props.bookInfo?.isEpub?'epub':props.file?.name.endsWith('.txt')?'txt':props.file?.name.endsWith('.pdf')?'pdf':'online')
    const isTxt=format==='txt'||format==='online',isPdf=format==='pdf'
    
    const onProgress=()=>{updateBookmarkState();saveProgress();updatePageInfo()}
    
    if(isPdf){
      const{PDFViewer,PDFAnnotator,PDFSearch}=await import('@/core/pdf')
      const showAnn=(a:any)=>{const el=document.querySelector(`[data-id="${a.id}"]`);if(el){const r=el.getBoundingClientRect();showMarkCard(a,r.left+r.width/2,r.bottom,false)}}
      const viewer=new PDFViewer({container:viewerContainerRef.value!,scale:1.5,onPageChange:onProgress,onAnnotationClick:showAnn})
      props.settings&&viewer.applyTheme(props.settings)
      const annotator=new PDFAnnotator(props.plugin,bookUrl,props.bookInfo?.name||props.file?.name||'book',showAnn)
      const searcher=new PDFSearch()
      pdfSource=props.file?await props.file.arrayBuffer():props.bookInfo?.filePath?await(await(await fetch('/api/file/getFile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:props.bookInfo.filePath})})).blob()).arrayBuffer():null as any
      await viewer.open(pdfSource)
      await viewer.fitWidth()
      searcher.setPDF(viewer.getPDF()!)
      ;(window as any).__pdfDoc=viewer.getPDF()
      searcher.extractAllText().catch(()=>{})
      // 跳转到指定页面
      if(props.bookInfo?.epubCfi?.startsWith('#page-')){
        const page=parseInt(props.bookInfo.epubCfi.replace('#page-',''))
        if(page&&page>=1&&page<=viewer.getPageCount())viewer.goToPage(page)
      }
      await annotator.init()
      const view=await viewer.createView()
      annotator.setOutline(view.book?.toc||[])
      annotator.setViewer(viewer)
      currentView.value={...view,annotator,isPdf:true,marks:{
        getBookmarks:()=>annotator.getBookmarks().map(b=>({...b,type:'bookmark'})),
        getAnnotations:(color?:string)=>annotator.getAll().filter(a=>!color||a.color===color),
        getNotes:()=>annotator.getAll().filter(a=>a.type==='note'),
        getInkAnnotations:()=>annotator.getData().inkAnnotations.map((ink:any)=>({...ink,type:'ink',text:`墨迹标注 - 第${ink.page}页`})),
        getShapeAnnotations:()=>annotator.getData().shapeAnnotations.map((shape:any)=>({...shape,type:'shape',text:shape.text||`${shape.shapeType==='rect'?'矩形':shape.shapeType==='circle'?'圆形':'三角形'}标注 - 第${shape.page}页`})),
        goTo:(item:any)=>annotator.goTo(item),
        toggleBookmark:(cfi?:string,progress?:number,title?:string)=>annotator.toggleBookmark(cfi,progress,title),
        hasBookmark:()=>annotator.hasBookmark(),
        updateMark:async(key:string,updates:any)=>{
          if(key.startsWith('shape_')){
            const result=await annotator.updateShape(key,updates)
            if(result)window.dispatchEvent(new Event('sireader:marks-updated'))
            return result
          }
          return await annotator.update(key,updates)
        },
        deleteMark:async(key:string)=>{
          if(key.startsWith('shape_')){
            const result=await annotator.deleteShape(key)
            if(result){shapeToolManager?.render(pdfViewer.value?.getCurrentPage()||1);window.dispatchEvent(new Event('sireader:marks-updated'))}
            return result
          }
          return await annotator.delete(key)
        },
        deleteBookmark:(key:string)=>annotator.deleteBookmark(key),
        deleteInk:async(id:string)=>{
          const data=annotator.getData()
          const idx=data.inkAnnotations.findIndex((i:any)=>i.id===id)
          if(idx>=0){
            const page=data.inkAnnotations[idx].page
            data.inkAnnotations.splice(idx,1)
            await annotator.saveInk(data.inkAnnotations)
            inkToolManager?.render(page)
            window.dispatchEvent(new Event('sireader:marks-updated'))
            return true
          }
          return false
        }
      }}
      pdfViewer.value=viewer
      pdfSearcher.value=searcher
      annotationManager=createAnnotationManager(true,annotator,undefined)
      inkToolManager=createInkToolManager(viewerContainerRef.value!,annotator,viewer)
      const handleShapeClick=(shape:any)=>{
        const el=document.querySelector(`.pdf-shape-layer[data-page="${shape.page}"]`)
        if(!el)return
        const r=el.getBoundingClientRect()
        const[x1,y1,x2,y2]=shape.rect
        showMarkCard(shape,r.left+(x1+x2)/2,r.top+y2+10,false)
      }
      shapeToolManager=createShapeToolManager(viewerContainerRef.value!,annotator,handleShapeClick)
      await inkToolManager.init()
      await shapeToolManager.init()
      updatePageInfo()
      setActiveReader(currentView.value,null)
      ;(window as any).__sireader_active_reader=currentView.value.nav
      const handleSel=(e:MouseEvent)=>setTimeout(()=>{
        const t=e.target as HTMLElement
        if(t.closest('.sr-card,.sr-selection-menu,[data-note-marker],.pdf-highlight'))return
        const sel=window.getSelection()
        if(!sel||sel.isCollapsed||!sel.toString().trim()){
          // 不要关闭已打开的标注弹窗
          if(showAnnotation.value)return
          return closeAllPopups()
        }
        try{
          const range=sel.getRangeAt(0),rects=Array.from(range.getClientRects())
          if(!rects.length)return
          const pg=viewer.getCurrentPage(),pageEl=document.querySelector(`[data-page="${pg}"]`)
          if(!pageEl)return
          const pr=pageEl.getBoundingClientRect()
          currentSelection={text:sel.toString().trim(),page:pg,rects:rects.map(r=>({left:r.left-pr.left,top:r.top-pr.top,width:r.width,height:r.height}))}
          menuX.value=rects[0].left+rects[0].width/2
          menuY.value=rects[0].top
          showMenu.value=true
        }catch{}
      },100)
      document.addEventListener('mouseup',handleSel as any)
      const origOnChange=viewer.onChange
      viewer.onChange=(p:number)=>{origOnChange?.(p);setTimeout(()=>{inkToolManager?.render(p);shapeToolManager?.render(p);annotator.renderPage(p)},100)}
      setTimeout(()=>{const p=viewer.getCurrentPage();inkToolManager?.render(p);shapeToolManager?.render(p);annotator.renderPage(p)},500)
      currentView.value.cleanup=()=>document.removeEventListener('mouseup',handleSel)
    }else if(isTxt){
      // TXT/在线书籍
      const{createFoliateView,loadTxtBook}=await import('@/core/foliate/reader')
      const{MarkManager}=await import('@/core/foliate/mark')
      
      const view=createFoliateView(viewerContainerRef.value!)
      currentView.value=view
      
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
      annotationManager=createAnnotationManager(false,undefined,marks)
      view.addEventListener('relocate',()=>{closeAllPopups();onProgress()})
      setActiveReader(view,null)
    }else{
      // EPUB/PDF/MOBI 等
      reader=createReader({container:viewerContainerRef.value!,settings:props.settings!,bookUrl,plugin:props.plugin})
      if(props.file)await reader.open(props.file)
      else if(props.url)await reader.open(props.url)
      else if(props.bookInfo?.filePath){
        const res=await fetch('/api/file/getFile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:props.bookInfo.filePath})})
        if(!res.ok)throw new Error('文件读取失败')
        const file=new File([await res.blob()],props.bookInfo.filePath.split('/').pop()||'book',{type:res.headers.get('content-type')||''})
        await reader.open(file)
        if(props.bookInfo.epubCfi)await reader.goTo(props.bookInfo.epubCfi)
        else if(props.bookInfo.durChapterIndex!==undefined)await reader.goTo(props.bookInfo.durChapterIndex)
      }else throw new Error('未提供书籍')
      reader.on('relocate',()=>{closeAllPopups();onProgress()})
      reader.on('load',({doc}:any)=>doc?.addEventListener?.('mouseup',(e:MouseEvent)=>setTimeout(()=>checkSelection(doc,e),50)))
      setTimeout(()=>reader.getView().renderer?.getContents?.()?.forEach(({doc}:any)=>doc?.addEventListener?.('mouseup',(e:MouseEvent)=>setTimeout(()=>checkSelection(doc,e),50))),500)
      setupAnnotationListeners()
      currentView.value=reader.getView()
      annotationManager=createAnnotationManager(false,undefined,reader.marks)
      setActiveReader(currentView.value,reader)
      props.onReaderReady?.(reader)
    }
  }catch(e){
    error.value=e instanceof Error?e.message:'加载失败'
  }finally{loading.value=false}
}

const checkSelection=(txtDoc?:Document,e?:MouseEvent)=>{
  if(e&&(e.target as HTMLElement).closest('.sr-card,.sr-selection-menu,[data-note-marker],[data-txt-mark]'))return
  const processSelection=(doc:Document,index?:number)=>{
    const sel=doc.defaultView?.getSelection()
    if(!sel||sel.isCollapsed||!sel.toString().trim())return false
    try{
      const range=sel.getRangeAt(0)
      const rect=range.getBoundingClientRect()
      const {x,y}=getCoords(rect,doc)
      currentSelection={text:sel.toString().trim(),...(index!==undefined?{cfi:reader!.getView().getCFI(index,range)}:{section:currentView.value?.lastLocation?.section||0})}
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
  }else if(currentView.value&&txtDoc&&processSelection(txtDoc))return
  closeAllPopups()
}

// 弹窗控制
const closeAllPopups=(e?:MouseEvent)=>{
  if(justOpenedPopup)return
  if(e){
    const t=e.target as HTMLElement
    // 不关闭：点击弹窗内部、选择菜单、标注元素、形状图层
    if(t.closest('.sr-card,.sr-popup,.sr-selection-menu,[data-note-marker],[data-shape-note-marker],[data-shape-note-tooltip],.pdf-highlight,.pdf-shape-layer,[data-txt-mark]'))return
  }
  showMenu.value=showAnnotation.value=isEditing.value=false
}
const openAnnotationPanel=()=>{if(!currentSelection)return;showMenu.value=false;currentMark.value=null;currentText.value=currentSelection.text;noteText.value='';isEditing.value=showAnnotation.value=true;setTimeout(()=>noteInputRef.value?.focus(),100)}
const startEdit=()=>{isEditing.value=true;currentText.value=currentMark.value?.text||'';noteText.value=currentMark.value?.note||'';selectedShapeType.value=currentMark.value?.shapeType||'rect';setTimeout(()=>noteInputRef.value?.focus(),50)}
const cancelEdit=()=>currentMark.value?(isEditing.value=false,currentText.value=currentMark.value.text,noteText.value=currentMark.value.note||'',selectedShapeType.value=currentMark.value.shapeType||'rect'):(showAnnotation.value=isEditing.value=false,noteText.value='',currentSelection=currentMark.value=null)
const copyText=async()=>{
  if(!currentSelection)return
  const copy=(text:string,msg='已复制')=>navigator.clipboard.writeText(text).then(()=>showMessage(msg,1000))
  
  if(!reader){
    copy(currentSelection.text)
    return closeAllPopups()
  }
  
  const bookUrl=(window as any).__currentBookUrl||props.bookInfo?.bookUrl||props.url||''
  if(!bookUrl||bookUrl.startsWith('file://')){
    copy(currentSelection.text,'本地文件无法生成跳转链接，仅复制文本')
    return closeAllPopups()
  }
  
  const{formatBookLink}=await import('@/composables/useSetting')
  const book=reader.getBook(),loc=reader.getLocation(),view=reader.getView()
  const formatAuthor=a=>Array.isArray(a)?a.map(c=>typeof c==='string'?c:c?.name).filter(Boolean).join(', '):typeof a==='string'?a:a?.name||''
  const chapter=(()=>{
    if(loc?.tocItem?.label||loc?.tocItem?.title)return loc.tocItem.label||loc.tocItem.title
    if(view?.lastLocation?.tocItem?.label)return view.lastLocation.tocItem.label
    if((view as any)?.isPdf&&loc?.page){const toc=book?.toc||[];for(let i=toc.length-1;i>=0;i--)if(toc[i].pageNumber&&toc[i].pageNumber<=loc.page)return toc[i].label}
    return''
  })()||'📒'
  const link=formatBookLink(bookUrl,book?.metadata?.title||props.bookInfo?.name||'',formatAuthor(book?.metadata?.author||props.bookInfo?.author),chapter,currentSelection.cfi||'',currentSelection.text||'',props.settings?.linkFormat||'> [!NOTE] 📑 书名\n> [章节](链接) 文本')
  copy(link)
  closeAllPopups()
}
const openDict=()=>{if(currentSelection){openDictDialog(currentSelection.text,menuX.value,menuY.value+50,currentSelection);closeAllPopups()}}

// 标注保存/删除
const saveAnnotation=async()=>{
  if(!annotationManager)return
  try{
    if(currentMark.value?.type==='shape'){
      // 形状标注：更新文本、颜色、形状类型和笔记
      await marks.value?.updateMark(currentMark.value.id,{text:currentText.value.trim(),color:selectedColor.value,shapeType:selectedShapeType.value,note:noteText.value.trim()||undefined})
      Object.assign(currentMark.value,{text:currentText.value.trim(),color:selectedColor.value,shapeType:selectedShapeType.value,note:noteText.value.trim()||undefined})
      // 重新渲染形状
      shapeToolManager?.render(currentMark.value.page)
      isEditing.value=false
    }else{
      // 文本标注
      await annotationManager.save(currentSelection,currentMark.value,currentText.value.trim(),noteText.value.trim(),selectedColor.value as any,selectedStyle.value)
      if(currentMark.value){Object.assign(currentMark.value,{text:currentText.value.trim(),color:selectedColor.value,style:selectedStyle.value,note:noteText.value.trim()||undefined});isEditing.value=false}
      else{showAnnotation.value=isEditing.value=false;currentSelection=currentMark.value=null}
      !isPdfMode.value&&reader?.getView().deselect()
    }
  }catch(e){console.error(e)}
}
const deleteMark=async()=>{if(!currentMark.value||!annotationManager)return;try{const page=currentMark.value.page;await annotationManager.delete(currentMark.value);showAnnotation.value=isEditing.value=false;currentMark.value=null;isPdfMode.value&&page&&currentView.value?.annotator?.renderPage(page)}catch(e){console.error(e)}}
const setupAnnotationListeners=()=>{if(!reader)return;reader.getView().addEventListener('show-annotation',((e:CustomEvent)=>{const{value,range}=e.detail,mark=reader.marks.getAll().find(m=>m.cfi===value);if(!mark)return;try{const rect=range.getBoundingClientRect(),{x,y}=getCoords(rect,range.startContainer.ownerDocument);showMarkCard(mark,x,y+rect.height+10,false)}catch{}})as EventListener)}

// 导航
const handlePrev=()=>pdfViewer.value?pdfViewer.value.goToPage(Math.max(1,pdfViewer.value.getCurrentPage()-1)):reader?reader.prev():currentView.value?.prev?.()
const handleNext=()=>pdfViewer.value?pdfViewer.value.goToPage(Math.min(totalPages.value,pdfViewer.value.getCurrentPage()+1)):reader?reader.next():currentView.value?.next?.()
const handlePageJump=()=>{const p=Math.max(1,Math.min(totalPages.value,pageInput.value||1));pageInput.value=p;pdfViewer.value?.goToPage(p)}
const updatePageInfo=()=>{if(!pdfViewer.value)return;totalPages.value=pdfViewer.value.getPageCount();pageInput.value=pdfViewer.value.getCurrentPage()}

// 搜索
const searchInputRef=ref<HTMLInputElement>()
const toggleSearch=()=>{showSearch.value=!showSearch.value;showSearch.value&&setTimeout(()=>searchInputRef.value?.focus(),100)}
const handleSearch=async()=>{
  if(!searchQuery.value.trim())return
  if(isPdfMode.value&&pdfSearcher.value){
    searchResults.value=await pdfSearcher.value.search(searchQuery.value)
    searchCurrentIndex.value=0
    if(searchResults.value.length>0){
      pdfViewer.value?.goToPage(pdfSearcher.value.getCurrent().page)
    }
  }
  // TODO: EPUB/TXT 搜索
}
const handleSearchNext=()=>{if(isPdfMode.value&&pdfSearcher.value){const r=pdfSearcher.value.next();if(r){searchCurrentIndex.value=pdfSearcher.value.getCurrentIndex();pdfViewer.value?.goToPage(r.page)}}}
const handleSearchPrev=()=>{if(isPdfMode.value&&pdfSearcher.value){const r=pdfSearcher.value.prev();if(r){searchCurrentIndex.value=pdfSearcher.value.getCurrentIndex();pdfViewer.value?.goToPage(r.page)}}}
const handleSearchClear=()=>{searchQuery.value='';searchResults.value=[];searchCurrentIndex.value=0;pdfSearcher.value?.clear();showSearch.value=false}

// PDF 工具栏
const handlePrint=async()=>{if(!pdfViewer.value)return;const{printPDF}=await import('@/core/pdf');await printPDF(pdfViewer.value.getPDF()!)}
const handleDownload=async()=>{if(!pdfSource)return;const{downloadPDF}=await import('@/core/pdf');await downloadPDF(pdfSource,props.file?.name||props.bookInfo?.name||'document.pdf')}
const handleExportImages=async()=>{if(!pdfViewer.value)return;const{exportAsImages}=await import('@/core/pdf');await exportAsImages(pdfViewer.value.getPDF()!)}

// 墨迹工具
const handleInkToggle=async(a:boolean)=>{if(a)await shapeToolManager?.toggle(false);await inkToolManager?.toggle(a)}
const handleInkColor=async(c:string)=>await inkToolManager?.setConfig({color:c})
const handleInkWidth=async(w:number)=>await inkToolManager?.setConfig({width:w})
const handleInkEraser=async(a:boolean)=>await inkToolManager?.setConfig(a?{color:'#fff',width:20}:{color:'#f00',width:2})
const handleInkUndo=async()=>await inkToolManager?.undo()
const handleInkClear=async()=>await inkToolManager?.clear()
const handleInkSave=()=>{}

// 形状工具
const handleShapeToggle=async(a:boolean)=>{if(a)await inkToolManager?.toggle(false);await shapeToolManager?.toggle(a)}
const handleShapeType=async(t:string)=>await shapeToolManager?.setConfig({shapeType:t})
const handleShapeColor=async(c:string)=>await shapeToolManager?.setConfig({color:c})
const handleShapeWidth=async(w:number)=>await shapeToolManager?.setConfig({width:w})
const handleShapeUndo=async()=>{const p=pdfViewer.value?.getCurrentPage();if(p)await shapeToolManager?.undo(p)}
const handleShapeClear=async()=>{const p=pdfViewer.value?.getCurrentPage();if(p)await shapeToolManager?.clear(p)}

// 进度保存 & 书签
const saveProgress=()=>{isPdfMode.value?currentView.value?.annotator?.saveProgress(pdfViewer.value?.getCurrentPage()||1):marks.value?.saveProgress(reader?reader.getView().lastLocation:(currentView.value?.getLocation?.()||currentView.value?.lastLocation))}
const updateBookmarkState=()=>{if(isPdfMode.value){const p=pdfViewer.value?.getCurrentPage()||1;currentView.value?.annotator?.setCurrentPage(p)}hasBookmark.value=!!marks.value?.hasBookmark?.()}
const toggleBookmark=()=>{try{hasBookmark.value=marks.value?.toggleBookmark?.()}catch(e:any){showMessage(e.message||'操作失败',2000,'error')}}

// 事件处理
const showMarkCard=(m:any,x:number,y:number,edit=false)=>{
  justOpenedPopup=true
  menuX.value=x;menuY.value=y;currentMark.value=m;currentText.value=m.text||'';noteText.value=m.note||'';selectedColor.value=m.color||'yellow';selectedStyle.value=m.style||'highlight';selectedShapeType.value=m.shapeType||'rect';isEditing.value=edit;showAnnotation.value=true
  setTimeout(()=>{justOpenedPopup=false;edit&&noteInputRef.value?.focus()},100)
}
const handleGlobalEdit=(e:Event)=>{const d=(e as CustomEvent).detail;d?.item&&showMarkCard(d.item,d.position?.x||menuX.value,d.position?.y||menuY.value,true)}
const handleTxtSelection=(e:Event)=>{const d=(e as CustomEvent).detail;setTimeout(()=>checkSelection(d?.doc,d?.event),50)}
const handleTxtAnnotationClick=(e:Event)=>{const{mark,x,y}=(e as CustomEvent).detail;showMarkCard(mark,x,y,false)}

// 快捷键处理
const handlePdfZoomIn=()=>pdfViewer.value&&pdfViewer.value.setScale(pdfViewer.value.getScale()+.25)
const handlePdfZoomOut=()=>pdfViewer.value&&pdfViewer.value.setScale(pdfViewer.value.getScale()-.25)
const handlePdfZoomReset=()=>pdfViewer.value?.setScale(1.5)
const handlePdfRotate=()=>pdfViewer.value&&pdfViewer.value.setRotation(((pdfViewer.value.getRotation()+90)%360)as 0|90|180|270)
const handlePdfSearch=()=>window.dispatchEvent(new CustomEvent('pdf:toggle-search'))
const handlePdfFirstPage=()=>pdfViewer.value?.goToPage(1)
const handlePdfLastPage=()=>pdfViewer.value?.goToPage(pdfViewer.value.getPageCount())
const handlePdfPageUp=()=>handlePrev()
const handlePdfPageDown=()=>handleNext()

const handleGoto=(e:CustomEvent)=>{
  if(!e.detail.cfi)return
  if(isPdfMode.value&&e.detail.cfi.startsWith('#page-')){
    const page=parseInt(e.detail.cfi.replace('#page-',''))
    if(page&&pdfViewer.value)return pdfViewer.value.goToPage(page)
  }
  reader&&requestAnimationFrame(()=>reader.goTo(e.detail.cfi))
}

// 快捷键
const handleKeydown=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;if(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)return;const k=e.key,c=e.ctrlKey||e.metaKey;if(['ArrowLeft','ArrowUp'].includes(k)||k===' '&&e.shiftKey){handlePrev();e.preventDefault();return}if(['ArrowRight','ArrowDown',' '].includes(k)){handleNext();e.preventDefault();return}if(!pdfViewer.value)return;const m={'Home':handlePdfFirstPage,'End':handlePdfLastPage,'PageUp':handlePdfPageUp,'PageDown':handlePdfPageDown,'r':handlePdfRotate,'R':handlePdfRotate};if(m[k]){m[k]();e.preventDefault()}else if(c){if(k==='+'||k==='=')handlePdfZoomIn(),e.preventDefault();else if(k==='-')handlePdfZoomOut(),e.preventDefault();else if(k==='0')handlePdfZoomReset(),e.preventDefault();else if(k==='f')handlePdfSearch(),e.preventDefault();else if(k==='p')handlePrint(),e.preventDefault()}}

// 生命周期
const events=[['sireader:edit-mark',handleGlobalEdit],['txt-selection',handleTxtSelection],['txt-annotation-click',handleTxtAnnotationClick],['sireaderSettingsUpdated',handleSettingsUpdate],['sireader:goto',handleGoto],['sireader:toggleBookmark',toggleBookmark],['sireader:prevPage',handlePrev],['sireader:nextPage',handleNext],['sireader:pdfZoomIn',handlePdfZoomIn],['sireader:pdfZoomOut',handlePdfZoomOut],['sireader:pdfZoomReset',handlePdfZoomReset],['sireader:pdfRotate',handlePdfRotate],['sireader:pdfSearch',handlePdfSearch],['sireader:pdfPrint',handlePrint],['sireader:pdfFirstPage',handlePdfFirstPage],['sireader:pdfLastPage',handlePdfLastPage],['sireader:pdfPageUp',handlePdfPageUp],['sireader:pdfPageDown',handlePdfPageDown]]as const
onMounted(()=>{init();containerRef.value?.focus();events.forEach(([e,h])=>window.addEventListener(e,h as any))})
onUnmounted(()=>{clearActiveReader();reader?.destroy();currentView.value?.cleanup?.();currentView.value?.viewer?.destroy();currentView.value?.annotator?.destroy();inkToolManager?.destroy();shapeToolManager?.destroy();events.forEach(([e,h])=>window.removeEventListener(e,h as any))})
</script>

<style scoped lang="scss">
.reader-container{position:relative;width:100%;height:100%;outline:none;user-select:text;-webkit-user-select:text;isolation:isolate;display:flex;flex-direction:column}
.viewer-container{position:absolute;inset:0;overflow:auto;}
.reader-loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:16px;color:var(--b3-theme-on-background);z-index:10}
.spinner{width:48px;height:48px;border:4px solid var(--b3-theme-primary-lighter);border-top-color:var(--b3-theme-primary);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.reader-toolbar{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:2px;padding:3px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:6px;box-shadow:0 2px 8px #0002;z-index:1000;opacity:.3;transition:opacity .2s;&:hover{opacity:1}}
.toolbar-btn{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:4px;cursor:pointer;transition:all .15s;svg{width:14px;height:14px}&:hover{background:var(--b3-list-hover)}}
.toolbar-page-nav{display:flex;align-items:center;gap:3px;padding:0 4px;font-size:11px;color:var(--b3-theme-on-surface)}
.toolbar-page-input{width:36px;height:22px;padding:0 3px;border:none;background:var(--b3-theme-background-light);color:var(--b3-theme-on-surface);font-size:11px;text-align:center;border-radius:3px;transition:background .15s;&:focus{outline:none;background:var(--b3-theme-background)}&::-webkit-inner-spin-button,&::-webkit-outer-spin-button{display:none}}
.toolbar-page-total{opacity:.7}
.toolbar-btn.active{background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary)}
.reader-search{position:absolute;bottom:56px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:2px;padding:3px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:6px;box-shadow:0 2px 8px #0002;z-index:1000}
.search-input{width:160px;height:22px;padding:0 6px;border:none;background:var(--b3-theme-background-light);color:var(--b3-theme-on-surface);font-size:11px;border-radius:3px;transition:background .15s;&:focus{outline:none;background:var(--b3-theme-background)}}
.search-count{font-size:11px;color:var(--b3-theme-on-surface-variant);min-width:40px;text-align:center;opacity:.7}
.search-slide-enter-active,.search-slide-leave-active{transition:all .2s}
.search-slide-enter-from,.search-slide-leave-to{opacity:0;transform:translate(-50%,-10px)}
.sr-selection-menu{position:fixed;z-index:10000;display:flex;gap:4px;padding:6px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:8px;box-shadow:0 4px 16px #0003}
.sr-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:6px;cursor:pointer;transition:all .15s;color:var(--b3-theme-on-surface);svg{width:16px;height:16px}&:hover{background:var(--b3-list-hover);color:var(--b3-theme-primary)}}
</style>

<style>
/* PDF 搜索高亮 */
.textLayer mark.pdf-search-hl{background:#ff06;border-radius:2px;color:inherit}

/* PDF 标注样式 */
.pdf-highlight{pointer-events:auto!important}
.pdf-underline{pointer-events:auto!important;background:transparent!important}
.pdf-outline{pointer-events:auto!important;background:transparent!important}
.pdf-squiggly{pointer-events:auto!important;background:transparent!important;border-bottom-style:wavy!important}
</style>