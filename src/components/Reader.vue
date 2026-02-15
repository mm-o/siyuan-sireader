<template>
  <div ref="containerRef" class="reader-container" tabindex="0" @keydown="handleKeydown">
    <div v-if="loading" class="reader-loading"><div class="spinner"></div><div>{{ error || '加载中...' }}</div></div>
    
    <!-- PDF 工具栏 -->
    <PdfToolbar v-if="isPdfMode&&pdfViewer&&pdfSearcher" :viewer="pdfViewer" :searcher="pdfSearcher" :file-size="pdfSource?.byteLength" :fixed="pdfToolbarFixed" @print="handlePrint" @download="handleDownload" @export-images="handleExportImages" @ink-toggle="handleInkToggle" @ink-color="handleInkColor" @ink-width="handleInkWidth" @ink-undo="handleInkUndo" @ink-clear="handleInkClear" @ink-save="handleInkSave" @ink-eraser="handleInkEraser" @shape-toggle="handleShapeToggle" @shape-type="handleShapeType" @shape-color="handleShapeColor" @shape-width="handleShapeWidth" @shape-filled="handleShapeFilled" @shape-undo="handleShapeUndo" @shape-clear="handleShapeClear"/>
    
    <div ref="viewerContainerRef" class="viewer-container" :class="{'has-pdf-toolbar':isPdfMode,'has-fixed-toolbar':isPdfMode&&pdfToolbarFixed}"></div>
    
    <!-- 目录弹窗 -->
    <Transition name="toc-popup">
      <div v-if="showToc&&!loading" class="reader-toc-popup" @click.stop>
        <ReaderToc v-model:mode="tocMode" :i18n="i18n" />
      </div>
    </Transition>
    
    <!-- 搜索面板 -->
    <Transition name="search-slide">
      <div v-if="showSearch&&!loading" class="reader-search" @click.stop>
        <input v-model="searchQuery" class="search-input" :placeholder="i18n.searchPlaceholder||'搜索...'" @keydown.enter="handleSearch" @keydown.esc="showSearch=false" ref="searchInputRef">
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click="handleSearch" aria-label="搜索"><svg><use xlink:href="#iconSearch"/></svg></button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click="handleSearchPrev" :disabled="!hasSearchResults" aria-label="上一个"><svg><use xlink:href="#iconUp"/></svg></button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click="handleSearchNext" :disabled="!hasSearchResults" aria-label="下一个"><svg><use xlink:href="#iconDown"/></svg></button>
        <span class="search-count">{{ searchCount }}</span>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click="handleSearchClear" aria-label="清除"><svg><use xlink:href="#iconClose"/></svg></button>
      </div>
    </Transition>
    
    <!-- 底部控制栏 - 始终显示 -->
    <div class="reader-toolbar">
      <button v-if="!loading" class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="handlePrev" :aria-label="i18n.prevChapter||'上一章'"><svg><use xlink:href="#iconLeft"/></svg></button>
      <div v-if="isPdfMode&&!loading" class="toolbar-page-nav" @click.stop>
        <input v-model.number="pageInput" @keydown.enter="handlePageJump" type="number" :min="1" :max="totalPages" class="toolbar-page-input">
        <span class="toolbar-page-total">/ {{totalPages}}</span>
      </div>
      <button v-if="!loading" class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="handleNext" :aria-label="i18n.nextChapter||'下一章'"><svg><use xlink:href="#iconRight"/></svg></button>
      <button v-if="!loading" class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="openToc" :aria-label="i18n.toc||'目录'"><svg><use xlink:href="#iconList"/></svg></button>
      <button v-if="!loading" class="toolbar-btn b3-tooltips b3-tooltips__n" :class="{active:hasBookmark}" @click.stop="toggleBookmark" :aria-label="hasBookmark?(i18n.removeBookmark||'删除书签'):(i18n.addBookmark||'添加书签')"><svg><use xlink:href="#iconBookmark"/></svg></button>
      <button v-if="!loading" class="toolbar-btn b3-tooltips b3-tooltips__n" :class="{active:showSearch}" @click.stop="toggleSearch" :aria-label="i18n.search||'搜索'"><svg><use xlink:href="#iconSearch"/></svg></button>
      <button v-if="isMobile()" class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="handleClose" aria-label="关闭"><svg><use xlink:href="#iconClose"/></svg></button>
    </div>
  </div>
  
  <!-- 统一标注弹窗 -->
  <MarkPanel ref="markPanelRef" :manager="markManager" :i18n="i18n" @copy="handleCopyText" @dict="handleOpenDict" @copy-mark="handleCopyMark" />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { showMessage } from 'siyuan'
import type { Plugin } from 'siyuan'
import type { ReaderSettings } from '@/composables/useSetting'
import { PRESET_THEMES } from '@/composables/useSetting'
import { openDict as openDictDialog } from '@/utils/dictionary'
import { createReader, type FoliateReader, setActiveReader, clearActiveReader } from '@/core/epub'
import { createMarkManager, type MarkManager, getColorMap } from '@/core/MarkManager'
import { createInkToolManager, type InkToolManager } from '@/core/pdf/ink'
import { createShapeToolManager, type ShapeToolManager } from '@/core/pdf/shape'
import { saveMobilePosition, getMobilePosition, isMobile } from '@/utils/mobile'
import PdfToolbar from './PdfToolbar.vue'
import MarkPanel from './MarkPanel.vue'
import ReaderToc from './ReaderToc.vue'
import { gotoPDF, gotoEPUB, restorePosition as restorePos, initJump } from '@/utils/jump'
import { copyMark as copyMarkUtil } from '@/utils/copy'

const props = defineProps<{ file?: File; plugin: Plugin; settings?: ReaderSettings; url?: string; blockId?: string; bookInfo?: any; onReaderReady?: (r: FoliateReader) => void; i18n?: any }>()

const i18n = computed(() => props.i18n || {})
const currentSettings = ref(props.settings)
const pdfToolbarFixed = computed(() => currentSettings.value?.pdfToolbarStyle === 'fixed')

// 标注面板引用
const markPanelRef = ref()
const markManager = ref<MarkManager | null>(null)
const colors = getColorMap()

// 监听设置更新
const handleSettingsUpdate = async (e: Event) => {
  const settings = (e as CustomEvent).detail
  currentSettings.value = settings
  ;(window as any).__sireader_settings = settings
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
const loading = ref(true)
const error = ref('')
const hasBookmark = ref(false)

// 触摸滑动翻页
let touchStartX=0,touchStartY=0
const handleTouchStart=(e:TouchEvent)=>{if(!isMobile()||e.touches.length!==1)return;touchStartX=e.touches[0].clientX;touchStartY=e.touches[0].clientY}
const handleTouchEnd=(e:TouchEvent)=>{if(!isMobile()||!touchStartX)return;const dx=e.changedTouches[0].clientX-touchStartX,dy=e.changedTouches[0].clientY-touchStartY;if(Math.abs(dy)>Math.abs(dx)||Math.abs(dx)<50)return;dx>0?handlePrev():handleNext();touchStartX=0;touchStartY=0}

const pdfViewer = ref<any>(null)
const pdfSearcher = ref<any>(null)
const currentView = ref<any>(null)
const pageInput = ref(1)
const totalPages = ref(0)
const showSearch = ref(false)
const showToc = ref(false)
const tocMode = ref<'toc' | 'bookmark' | 'mark' | 'deck'>('toc')
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const searchCurrentIndex = ref(0)
let reader: FoliateReader | null = null
let currentSelection: { text: string; cfi?: string; section?: number; page?: number; rects?: any[]; textOffset?: number } | null = null
let pdfSource: ArrayBuffer | null = null
let inkToolManager: InkToolManager | null = null
let shapeToolManager: ShapeToolManager | null = null

// 工具函数 & Computed
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(v,max))
const getCoords=(rect:DOMRect,doc:Document)=>{const iframe=doc.defaultView?.frameElement as HTMLIFrameElement|null;if(!iframe)return{x:rect.left,y:rect.top};const ir=iframe.getBoundingClientRect();return{x:(rect.left>ir.width?rect.left%ir.width:rect.left)+ir.left,y:rect.top+ir.top}}
const marks=computed(()=>markManager.value)
const isPdfMode=computed(()=>!!pdfViewer.value)
const hasSearchResults=computed(()=>searchResults.value.length>0)
const searchCount=computed(()=>{
  if(isPdfMode.value){
    const total=searchResults.value.length
    return total>0?`${searchCurrentIndex.value+1}/${total}`:'0/0'
  }
  return searchResults.value.length>0?`${searchResults.value.length}`:'0'
});

// 初始化
const init=async()=>{
  if(!containerRef.value)return
  try{
    loading.value=true
    error.value=''
    const bookUrl=props.bookInfo?.url||props.url||(props.file?`file://${props.file.name}`:`book-${Date.now()}`)
    ;(window as any).__currentBookUrl=bookUrl
    const format=props.bookInfo?.format||(props.bookInfo?.isEpub?'epub':props.file?.name.endsWith('.txt')?'txt':props.file?.name.endsWith('.pdf')?'pdf':'online')
    const isTxt=format==='txt'||format==='online',isPdf=format==='pdf'
    
    const onProgress=async()=>{updateBookmarkState();const{bookshelfManager}=await import('@/core/bookshelf');await bookshelfManager.updateProgressAuto(bookUrl,reader,pdfViewer.value);updatePageInfo()}
    
    // 统一文件加载
    const loadFile=async()=>{
      if(props.file)return props.file
      const path=props.bookInfo?.path
      if(!path)return null
      
      // assets 文件 HTTP 访问，books 文件 API 访问
      const url=path.startsWith('assets/')?`/${path}`:'/api/file/getFile'
      const opts=path.startsWith('assets/')?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path})}
      const res=await fetch(url,opts)
      if(!res.ok)throw new Error(`文件读取失败: ${path}`)
      return new File([await res.arrayBuffer()],path.split('/').pop()||'book',{type:res.headers.get('content-type')||'application/octet-stream'})
    }
    
    if(isPdf){
      const{PDFViewer,PDFSearch}=await import('@/core/pdf')
      const showAnn=(a:any)=>{const el=document.querySelector(`[data-id="${a.id}"]`);if(el){const r=el.getBoundingClientRect();markPanelRef.value?.showCard(a,r.left+r.width/2,r.bottom,false)}}
      const viewer=new PDFViewer({container:viewerContainerRef.value!,scale:1.5,onPageChange:onProgress,onAnnotationClick:showAnn})
      props.settings&&viewer.applyTheme(props.settings)
      const searcher=new PDFSearch()
      const file=await loadFile()
      pdfSource=file?await file.arrayBuffer():null as any
      if(!pdfSource)throw new Error('未提供PDF文件')
      await viewer.open(pdfSource)
      await viewer.fitWidth()
      searcher.setPDF(viewer.getPDF()!)
      ;(window as any).__pdfDoc=viewer.getPDF()
      searcher.extractAllText().catch(()=>{})
      
      const view=await viewer.createView()
      
      markManager.value=createMarkManager({format:'pdf',plugin:props.plugin,bookUrl,bookName:props.bookInfo?.title||props.file?.name||'book',onAnnotationClick:showAnn,pdfViewer:viewer})
      await markManager.value.init()
      const{bookshelfManager}=await import('@/core/bookshelf')
      await bookshelfManager.restoreProgress(bookUrl,null,viewer)
      
      currentView.value={...view,isPdf:true,marks:markManager.value}
      pdfViewer.value=viewer
      pdfSearcher.value=searcher
      
      inkToolManager=createInkToolManager(viewerContainerRef.value!,props.plugin,bookUrl,props.bookInfo?.title||props.file?.name||'book',viewer)
      const handleShapeClick=(shape:any)=>{
        const el=document.querySelector(`.pdf-shape-layer[data-page="${shape.page}"]`)
        if(!el)return
        const r=el.getBoundingClientRect()
        const[x1,y1,x2,y2]=shape.rect
        markPanelRef.value?.showCard(shape,r.left+(x1+x2)/2,r.top+y2+10,false)
      }
      shapeToolManager=createShapeToolManager(viewerContainerRef.value!,props.plugin,bookUrl,props.bookInfo?.title||props.file?.name||'book',handleShapeClick,viewer)
      await inkToolManager.init()
      await shapeToolManager.init()
      ;(markManager.value as any).inkManager=inkToolManager
      ;(markManager.value as any).shapeManager=shapeToolManager
      updatePageInfo()
      setActiveReader(currentView.value,null,props.settings)
      const handleSel=(e:MouseEvent)=>setTimeout(()=>{
        const t=e.target as HTMLElement
        if(t.closest('.mark-card,.mark-selection-menu,[data-note-marker],.pdf-highlight'))return
        const sel=window.getSelection()
        if(!sel||sel.isCollapsed||!sel.toString().trim())return
        try{
          const range=sel.getRangeAt(0),rects=Array.from(range.getClientRects())
          if(!rects.length)return
          const pg=viewer.getCurrentPage(),pageEl=document.querySelector(`[data-page="${pg}"]`)
          if(!pageEl)return
          const page=viewer.getPages().get(pg)
          if(!page)return
          const pr=pageEl.getBoundingClientRect(),viewport=page.getViewport({scale:viewer.getScale(),rotation:viewer.getRotation()})
          const text=sel.toString().trim()
          const rectsData=rects.map(r=>{
            const[x1,y1]=viewport.convertToPdfPoint(r.left-pr.left,r.top-pr.top)
            const[x2,y2]=viewport.convertToPdfPoint(r.right-pr.left,r.bottom-pr.top)
            return{x:x1,y:y1,w:x2-x1,h:y2-y1}
          })
          currentSelection={text,page:pg,rects:rectsData}
          markPanelRef.value?.showMenu({text,location:{format:'pdf',page:pg,rects:rectsData}},rects[0].left+rects[0].width/2,rects[0].top)
        }catch{}
      },100)
      viewerContainerRef.value!.addEventListener('mouseup',handleSel as any)
      // 监听canvas层创建完成，自动渲染标注
      const handleLayerReady=(e:CustomEvent)=>{
        const p=e.detail.page
        markManager.value?.renderPdf(p)
        shapeToolManager?.render(p)
        inkToolManager?.render(p)
      }
      window.addEventListener('pdf:layer-ready',handleLayerReady as any)
      // 监听页面切换
      const origOnChange=viewer.onChange
      viewer.onChange=(p:number)=>{origOnChange?.(p);setTimeout(()=>handleLayerReady({detail:{page:p}}as any),50)}
      currentView.value.cleanup=()=>{
        viewerContainerRef.value?.removeEventListener('mouseup',handleSel)
        window.removeEventListener('pdf:layer-ready',handleLayerReady as any)
      }
    }else if(isTxt){
      const{createFoliateView,loadTxtBook}=await import('@/core/epub/reader')
      const view=createFoliateView(viewerContainerRef.value!)
      currentView.value=view
      
      if(format==='online'&&props.bookInfo){
        await loadTxtBook(view,'',props.bookInfo.toc||[],props.bookInfo,props.settings)
      }else{
        const file=await loadFile()
        if(!file)throw new Error('未提供TXT文件')
        await loadTxtBook(view,await file.arrayBuffer(),[],null,props.settings)
      }
      
      markManager.value=createMarkManager({format:'txt',view,plugin:props.plugin,bookUrl,bookName:props.bookInfo?.title||props.file?.name||'book',reader:null})
      await markManager.value.init()
      ;(view as any).marks=markManager.value
      const{bookshelfManager}=await import('@/core/bookshelf')
      await bookshelfManager.restoreProgress(bookUrl,null,null)
      
      view.addEventListener('relocate',()=>onProgress())
      setActiveReader(view,null,props.settings)
    }else{
      reader=createReader({container:viewerContainerRef.value!,settings:props.settings!,plugin:props.plugin})
      
      if(props.file){
        await reader.open(props.file)
      }else if(props.url){
        await reader.open(props.url)
      }else{
        const file=await loadFile()
        if(!file)throw new Error('未提供书籍')
        await reader.open(file)
      }
      
      markManager.value=createMarkManager({format:'epub',view:reader.getView(),plugin:props.plugin,bookUrl,bookName:props.bookInfo?.title||props.file?.name||'book',reader})
      await markManager.value.init()
      ;(reader.getView() as any).marks=markManager.value
      const{bookshelfManager}=await import('@/core/bookshelf')
      await bookshelfManager.restoreProgress(bookUrl,reader,null)
      
      reader.on('relocate',()=>onProgress())
      reader.on('load',({doc}:any)=>doc?.addEventListener?.('mouseup',(e:MouseEvent)=>setTimeout(()=>checkSelection(doc,e),50)))
      setTimeout(()=>reader.getView().renderer?.getContents?.()?.forEach(({doc}:any)=>doc?.addEventListener?.('mouseup',(e:MouseEvent)=>setTimeout(()=>checkSelection(doc,e),50))),500)
      setupAnnotationListeners()
      currentView.value=reader.getView()
      setActiveReader(currentView.value,reader,props.settings)
      props.onReaderReady?.(reader)
    }
  }catch(e){
    error.value=e instanceof Error?e.message:'加载失败'
    markPanelRef.value?.closeAll()
  }finally{
    loading.value=false
    await restorePos(getBookUrl(),reader,pdfViewer.value,getMobilePosition)
    // 初始化跳转
    if(props.bookInfo?.pos?.cfi)initJump(props.bookInfo.pos.cfi)
  }
}

const checkSelection=(txtDoc?:Document,e?:MouseEvent)=>{
  if(e&&(e.target as HTMLElement).closest('.mark-card,.mark-selection-menu,[data-note-marker],[data-txt-mark]'))return
  const processSelection=(doc:Document,index?:number)=>{
    const sel=doc.defaultView?.getSelection()
    if(!sel||sel.isCollapsed||!sel.toString().trim())return false
    try{
      const range=sel.getRangeAt(0),rect=range.getBoundingClientRect(),{x,y}=getCoords(rect,doc),text=sel.toString().trim(),cfi=index!==undefined?reader!.getView().getCFI(index,range):undefined,section=index===undefined?currentView.value?.lastLocation?.section||0:undefined
      let textOffset:number|undefined
      if(section!==undefined&&!cfi){
        let o=0
        const w=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT)
        for(let n:Node|null;n=w.nextNode();){if(n===range.startContainer){textOffset=o+range.startOffset;break}o+=(n.textContent||'').length}
      }
      currentSelection={text,cfi,section,textOffset}
      markPanelRef.value?.showMenu({text,location:{format:isPdfMode.value?'pdf':'epub',cfi,section,textOffset}},x+(index===undefined?rect.width/2:0),y)
      return true
    }catch{return false}
  }
  if(reader){const c=reader.getView().renderer?.getContents?.();if(!c)return;for(const{doc,index}of c)if(processSelection(doc,index))return}
  else if(currentView.value&&txtDoc&&processSelection(txtDoc))return
}

// 复制文本处理
const handleCopyText=async(text:string)=>{
  const copy=(t:string,msg='已复制')=>navigator.clipboard.writeText(t).then(()=>showMessage(msg,1000))
  const bookUrl=(window as any).__currentBookUrl||props.bookInfo?.url||props.url||''
  if(!bookUrl||bookUrl.startsWith('file://'))return copy(text,'本地文件无法生成跳转链接，仅复制文本')
  if(!currentSelection)return copy(text)
  
  const{formatBookLink}=await import('@/composables/useSetting')
  const{formatAuthor,getChapterName}=await import('@/core/MarkManager')
  const isPdf=isPdfMode.value
  const book=isPdf?null:reader?.getBook()
  const loc=isPdf?null:reader?.getLocation()
  const toc=isPdf?pdfViewer.value?.getPDF?.()?.toc:book?.toc
  const page=currentSelection.page||(isPdf?pdfViewer.value?.getCurrentPage():loc?.page)
  const cfi=currentSelection.cfi||(isPdf&&page?`#page-${page}`:'')
  const chapter=getChapterName({cfi:currentSelection.cfi,page,isPdf,toc,location:loc})||'📒'
  const link=formatBookLink(bookUrl,book?.metadata?.title||props.bookInfo?.title||'',formatAuthor(book?.metadata?.author||props.bookInfo?.author),chapter,cfi,text,props.settings?.linkFormat||'> [!NOTE] 📑 书名\n> [章节](链接) 文本')
  copy(link)
}

// 复制标注处理
const handleCopyMark=(mark:any)=>copyMarkUtil(mark,{
  bookUrl:(window as any).__currentBookUrl||props.bookInfo?.url||props.url||'',
  bookInfo:props.bookInfo,
  settings:props.settings,
  reader,
  pdfViewer:pdfViewer.value,
  showMsg:(msg:string)=>showMessage(msg,1000)
})

// 词典查询处理
const handleOpenDict=(text:string,x:number,y:number)=>{
  if(currentSelection)openDictDialog(text,x,y,currentSelection)
}

// 标注监听器
const setupAnnotationListeners=()=>{if(!reader||!markManager.value)return;reader.getView().addEventListener('show-annotation',((e:CustomEvent)=>{const{value,range}=e.detail,mark=markManager.value?.getAll().find(m=>m.cfi===value);if(!mark)return;try{const rect=range.getBoundingClientRect(),{x,y}=getCoords(rect,range.startContainer.ownerDocument);markPanelRef.value?.showCard(mark,x,y+rect.height+10,false)}catch{}})as EventListener)}

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
    if(searchResults.value.length>0)pdfViewer.value?.goToPage(pdfSearcher.value.getCurrent().page)
  }else if(reader?.searchManager){
    searchResults.value=[]
    for await(const r of reader.search(searchQuery.value))searchResults.value.push(r)
    searchCurrentIndex.value=searchResults.value.length>0?0:-1
  }
}
const handleSearchNext=()=>{
  if(isPdfMode.value&&pdfSearcher.value){const r=pdfSearcher.value.next();if(r){searchCurrentIndex.value=pdfSearcher.value.getCurrentIndex();pdfViewer.value?.goToPage(r.page)}}
  else if(reader?.searchManager){const r=reader.nextSearchResult();if(r)searchCurrentIndex.value=reader.searchManager.getCurrentIndex()}
}
const handleSearchPrev=()=>{
  if(isPdfMode.value&&pdfSearcher.value){const r=pdfSearcher.value.prev();if(r){searchCurrentIndex.value=pdfSearcher.value.getCurrentIndex();pdfViewer.value?.goToPage(r.page)}}
  else if(reader?.searchManager){const r=reader.prevSearchResult();if(r)searchCurrentIndex.value=reader.searchManager.getCurrentIndex()}
}
const handleSearchClear=()=>{searchQuery.value='';searchResults.value=[];searchCurrentIndex.value=0;pdfSearcher.value?.clear();reader?.clearSearch();showSearch.value=false}

// PDF 工具栏
const handlePrint=async()=>{if(!pdfViewer.value)return;const{printPDF}=await import('@/core/pdf');await printPDF(pdfViewer.value.getPDF()!)}
const handleDownload=async()=>{if(!pdfSource)return;const{downloadPDF}=await import('@/core/pdf');await downloadPDF(pdfSource,props.file?.name||props.bookInfo?.title||'document.pdf')}
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
const handleShapeFilled=async(f:boolean)=>await shapeToolManager?.setConfig({filled:f})
const handleShapeUndo=async()=>{const p=pdfViewer.value?.getCurrentPage();if(p)await shapeToolManager?.undo(p)}
const handleShapeClear=async()=>{const p=pdfViewer.value?.getCurrentPage();if(p)await shapeToolManager?.clear(p)}

// 进度保存 & 书签
const updateBookmarkState=()=>hasBookmark.value=!!markManager.value?.hasBookmark?.()
const toggleBookmark=()=>{try{hasBookmark.value=marks.value?.toggleBookmark?.()}catch(e:any){showMessage(e.message||'操作失败',2000,'error')}}

// 位置管理
const getBookUrl=()=>(window as any).__currentBookUrl||props.bookInfo?.url||props.url||''
const getCurrentPosition=()=>isPdfMode.value?{page:pdfViewer.value?.getCurrentPage()}:{cfi:reader?.getLocation()?.cfi}
const savePosition=()=>{if(!isMobile())return;const url=getBookUrl();if(url)saveMobilePosition(url,getCurrentPosition())}

// 打开目录
const openToc = () => { showToc.value = !showToc.value }

// 关闭
const handleClose=()=>{savePosition();window.dispatchEvent(new CustomEvent('reader:close'))}

// 事件处理
const handleGlobalEdit=(e:Event)=>{const d=(e as CustomEvent).detail;d?.item&&markPanelRef.value?.showCard(d.item,d.position?.x,d.position?.y,true)}
const handleTxtSelection=(e:Event)=>{const d=(e as CustomEvent).detail;setTimeout(()=>checkSelection(d?.doc,d?.event),50)}
const handleTxtAnnotationClick=(e:Event)=>{const{mark,x,y}=(e as CustomEvent).detail;markPanelRef.value?.showCard(mark,x,y,false)}

// 快捷键处理
const handlePdfZoomIn=()=>pdfViewer.value?.setScale(pdfViewer.value.getScale()+.25)
const handlePdfZoomOut=()=>pdfViewer.value?.setScale(pdfViewer.value.getScale()-.25)
const handlePdfZoomReset=()=>pdfViewer.value?.setScale(1.5)
const handlePdfRotate=()=>pdfViewer.value?.setRotation(((pdfViewer.value.getRotation()+90)%360)as 0|90|180|270)
const handlePdfSearch=()=>window.dispatchEvent(new CustomEvent('pdf:toggle-search'))
const handlePdfFirstPage=()=>pdfViewer.value?.goToPage(1)
const handlePdfLastPage=()=>pdfViewer.value?.goToPage(pdfViewer.value.getPageCount())
const handlePdfPageUp=()=>handlePrev()
const handlePdfPageDown=()=>handleNext()

const handleGoto=(e:CustomEvent)=>{
  const{cfi,id,section,textOffset,text}=e.detail
  if(isPdfMode.value&&cfi?.startsWith('#page-'))gotoPDF(parseInt(cfi.slice(6)),id,pdfViewer.value,markManager.value,shapeToolManager)
  else if(section!==undefined||cfi?.startsWith('#txt-')){
    const m=cfi?.match(/#txt-(\d+)-(\d+)/)
    const s=section!==undefined?section:m?parseInt(m[1]):0
    const o=textOffset!==undefined?textOffset:m?parseInt(m[2]):undefined
    import('@/utils/jump').then(({gotoTXT})=>gotoTXT(s,o,text,id,currentView.value))
  }else if(cfi)gotoEPUB(cfi,id,reader,markManager.value)
}

// 快捷键
const handleKeydown=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;if(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)return;const k=e.key,c=e.ctrlKey||e.metaKey;if(['ArrowLeft','ArrowUp'].includes(k)||k===' '&&e.shiftKey){handlePrev();e.preventDefault();return}if(['ArrowRight','ArrowDown',' '].includes(k)){handleNext();e.preventDefault();return}if(!pdfViewer.value)return;const m={'Home':handlePdfFirstPage,'End':handlePdfLastPage,'PageUp':handlePdfPageUp,'PageDown':handlePdfPageDown,'r':handlePdfRotate,'R':handlePdfRotate};if(m[k]){m[k]();e.preventDefault()}else if(c){if(k==='+'||k==='=')handlePdfZoomIn(),e.preventDefault();else if(k==='-')handlePdfZoomOut(),e.preventDefault();else if(k==='0')handlePdfZoomReset(),e.preventDefault();else if(k==='f')handlePdfSearch(),e.preventDefault();else if(k==='p')handlePrint(),e.preventDefault()}}

// 生命周期
const events=[['sireader:edit-mark',handleGlobalEdit],['txt-selection',handleTxtSelection],['txt-annotation-click',handleTxtAnnotationClick],['sireaderSettingsUpdated',handleSettingsUpdate],['sireader:goto',handleGoto],['sireader:toggleBookmark',toggleBookmark],['sireader:prevPage',handlePrev],['sireader:nextPage',handleNext],['sireader:pdfZoomIn',handlePdfZoomIn],['sireader:pdfZoomOut',handlePdfZoomOut],['sireader:pdfZoomReset',handlePdfZoomReset],['sireader:pdfRotate',handlePdfRotate],['sireader:pdfSearch',handlePdfSearch],['sireader:pdfPrint',handlePrint],['sireader:pdfFirstPage',handlePdfFirstPage],['sireader:pdfLastPage',handlePdfLastPage],['sireader:pdfPageUp',handlePdfPageUp],['sireader:pdfPageDown',handlePdfPageDown]]as const

const suppressError=(e:PromiseRejectionEvent)=>/createTreeWalker|destroy/.test(e.reason?.message||'')&&e.preventDefault()

const setupTabObserver=()=>{if(isMobile())return;let el=containerRef.value?.parentElement;while(el){if(el.hasAttribute('data-id')){const h=document.querySelector(`li[data-type="tab-header"][data-id="${el.getAttribute('data-id')}"]`);if(h){const obs=new MutationObserver(ms=>ms.forEach(m=>m.type==='attributes'&&m.attributeName==='class'&&(m.target as HTMLElement).classList.contains('item--focus')&&(setActiveReader(currentView.value,reader,props.settings),window.dispatchEvent(new CustomEvent('sireader:tab-switched')))));obs.observe(h,{attributes:true,attributeFilter:['class']});(containerRef.value as any).__observer=obs}break}el=el.parentElement}}

// 形状创建后自动显示编辑窗口
const handleShapeCreated=(e:CustomEvent)=>{
  const{shape,x,y,edit}=e.detail
  if(markPanelRef.value&&edit){
    markPanelRef.value.showCard(shape,x,y,true)
  }
}

onMounted(()=>{init();containerRef.value?.focus();events.forEach(([e,h])=>window.addEventListener(e,h as any));window.addEventListener('unhandledrejection',suppressError);window.addEventListener('shape-created',handleShapeCreated as any);setupTabObserver();if(isMobile()&&containerRef.value){containerRef.value.addEventListener('touchstart',handleTouchStart);containerRef.value.addEventListener('touchend',handleTouchEnd)}})

onUnmounted(async()=>{savePosition();clearActiveReader();await markManager.value?.destroy();try{reader?.destroy();currentView.value?.cleanup?.();currentView.value?.viewer?.destroy?.()}catch{};inkToolManager?.destroy?.();shapeToolManager?.destroy?.();setTimeout(()=>viewerContainerRef.value&&(viewerContainerRef.value.innerHTML=''),50);events.forEach(([e,h])=>window.removeEventListener(e,h as any));window.removeEventListener('unhandledrejection',suppressError);window.removeEventListener('shape-created',handleShapeCreated as any);containerRef.value&&(containerRef.value as any).__observer?.disconnect();if(isMobile()&&containerRef.value){containerRef.value.removeEventListener('touchstart',handleTouchStart);containerRef.value.removeEventListener('touchend',handleTouchEnd)}})
</script>

<style scoped lang="scss">
.reader-container{position:relative;width:100%;height:100%;outline:none;user-select:text;-webkit-user-select:text;isolation:isolate;display:flex;flex-direction:column}
.viewer-container{flex:1;position:relative;overflow:auto;
  &.has-fixed-toolbar{padding-top:40px}
}
.reader-loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:16px;color:var(--b3-theme-on-background);z-index:10;pointer-events:none}
.spinner{width:48px;height:48px;border:4px solid var(--b3-theme-primary-lighter);border-top-color:var(--b3-theme-primary);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.reader-toolbar{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:2px;padding:3px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:6px;box-shadow:0 2px 8px #0002;z-index:1001;opacity:.3;transition:opacity .2s;&:hover{opacity:1}}
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
.reader-toc-popup{position:absolute;bottom:60px;left:50%;transform:translateX(-50%);width:min(360px,90vw);max-height:min(480px,70vh);background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:8px;box-shadow:0 4px 20px #0003;z-index:1002;overflow:hidden;display:flex;flex-direction:column}
.toc-popup-enter-active,.toc-popup-leave-active{transition:all .2s}
.toc-popup-enter-from,.toc-popup-leave-to{opacity:0;transform:translate(-50%,10px)}
.sr-selection-menu{position:fixed;z-index:10000;display:flex;gap:4px;padding:6px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:8px;box-shadow:0 4px 16px #0003}
.sr-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:8px;cursor:pointer;transition:all .15s;color:var(--b3-theme-on-surface);svg{width:16px;height:16px}&:hover{background:var(--b3-list-hover);color:var(--b3-theme-primary)}}
</style>

<style>
/* PDF 文本层 */
.textLayer{position:absolute;inset:0;line-height:1}
.textLayer span{color:transparent;cursor:text}
.textLayer::selection{background:#0064ff4d}

/* PDF 搜索高亮 */
.textLayer mark.pdf-search-hl{background:#ff06;border-radius:2px}
.textLayer mark.pdf-search-current{background:#ff9800;color:#fff;box-shadow:0 0 0 2px #ff9800}

/* 标注样式 */
.pdf-highlight,.pdf-underline,.pdf-outline,.pdf-dotted,.pdf-dashed,.pdf-double{pointer-events:auto!important}
.pdf-underline,.pdf-outline,.pdf-dotted,.pdf-dashed,.pdf-double{background:transparent!important}

/* 闪烁动画 - 2次闪烁 */
.pdf-highlight--flash,.epub-highlight--flash{animation:flash 1.2s ease-in-out 1}
.pdf-shape--flash{animation:flash-shape 1.2s ease-in-out 1}
@keyframes flash{
  0%,100%{opacity:1;transform:scale(1);box-shadow:0 0 0 transparent}
  50%{opacity:.3;transform:scale(1.1);box-shadow:0 0 20px currentColor}
}
@keyframes flash-shape{
  0%,100%{opacity:1;filter:drop-shadow(0 0 0 transparent)}
  50%{opacity:.4;filter:drop-shadow(0 0 20px rgba(255,0,0,.8))}
}
</style>