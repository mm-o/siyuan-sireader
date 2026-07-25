<template>
  <div ref="containerRef" class="reader-container" tabindex="0" :style="{'--toolbar-opacity':(1-((currentSettings?.toolbarOpacity??70)/100))*.55}">
    <ReaderSplash v-if="showOpeningSplash" ref="readerSplashRef" :book-info="props.bookInfo" :file-name="props.file?.name" status="opening" />
    <div v-if="loading" class="reader-loading"><div class="spinner"></div><div>{{ error || 'Loading...' }}</div></div>
    <div v-if="showToc&&!loading" class="reader-overlay" @click="closePanels"/>
    <EmbedPdfReader v-if="isEmbedPdfMode" :source="embedPdfSource" :book-url="currentBookUrl" :storage-key="props.bookInfo?.dataId || currentBookUrl" :settings="currentSettings" :theme="currentSettings?.theme" :custom-theme="currentSettings?.customTheme" :hide-annotations="embedPdfAnnotationsHidden" :i18n="i18n" class="viewer-container" @ready="handleEmbedPdfReady"/>
    <div v-else ref="viewerContainerRef" class="viewer-container"></div>
    <div v-if="!isEmbedPdfMode&&!loading" class="reader-progress" aria-hidden="true"><span :style="{transform:`scaleX(${readingProgress})`}"/></div>
    <Transition name="toc-popup">
      <div v-if="showToc&&!loading" class="reader-toc-popup" @click.stop>
        <DockShell :active-tab="tocMode" nav-position="top" :tabs="tocTabs" @update:activeTab="tocMode = $event as any">
          <component :is="tocPane" v-bind="tocPaneProps" />
        </DockShell>
      </div>
    </Transition>
    <div v-if="!loading" class="reader-toolbar-group">
      <div v-if="showSearch" class="reader-panel" @click.stop>
        <input v-model="searchQuery" class="search-input" :placeholder="i18n.searchPlaceholder||'搜索...'" @keydown.enter="handleSearch" @keydown.esc="showSearch=false" ref="searchInputRef">
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click="handleSearch" aria-label="搜索"><svg><use xlink:href="#iconSearch"/></svg></button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click="handleSearchPrev" :disabled="!hasSearchResults" aria-label="上一个"><svg><use xlink:href="#iconUp"/></svg></button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click="handleSearchNext" :disabled="!hasSearchResults" aria-label="下一个"><svg><use xlink:href="#iconDown"/></svg></button>
        <span class="search-count">{{ searchCount }}</span>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click="handleSearchClear" aria-label="清除"><svg><use xlink:href="#iconClose"/></svg></button>
      </div>
      <div v-if="showQuickMark" class="reader-panel" @click.stop>
        <div class="mark-colors">
          <button v-for="(c,i) in COLORS" :key="c.color" class="mark-color-btn" :class="{active:quickMarkColor===i}" :style="{background:c.bg}" @click="quickMarkColor=i"/>
        </div>
        <span class="panel-divider"/>
        <div class="mark-styles">
          <button v-for="s in STYLES.filter(s=>!s.epubOnly)" :key="s.type" class="mark-style-btn" :class="{active:quickMarkStyle===s.type}" @click="quickMarkStyle=s.type">
            <span :data-type="s.type">{{s.text}}</span>
          </button>
        </div>
      </div>
      <div v-if="!isEmbedPdfMode" class="reader-toolbar" :class="{'is-visible':toolbarVisible}">
        <button v-if="!isEmbedPdfMode" class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="handlePrev" :aria-label="i18n.prevChapter||'上一章'"><svg><use xlink:href="#iconLeft"/></svg></button>
                <button v-if="!isEmbedPdfMode" class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="handleNext" :aria-label="i18n.nextChapter||'下一章'"><svg><use xlink:href="#iconRight"/></svg></button>
        <button v-if="!isEmbedPdfMode" class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="openToc" :aria-label="i18n.toc||'目录'"><svg><use xlink:href="#iconList"/></svg></button>
        <button v-if="!isEmbedPdfMode" class="toolbar-btn b3-tooltips b3-tooltips__n" :class="{active:hasBookmark}" @click.stop="toggleBookmark" :aria-label="hasBookmark?(i18n.removeBookmark||'删除书签'):(i18n.addBookmark||'添加书签')"><svg><use xlink:href="#iconBookmark"/></svg></button>
        <button v-if="!isEmbedPdfMode" class="toolbar-btn b3-tooltips b3-tooltips__n" :class="{active:showSearch}" @click.stop="toggleSearch" :aria-label="i18n.search||'搜索'"><svg><use xlink:href="#iconSearch"/></svg></button>
        <button v-if="!isEmbedPdfMode" class="toolbar-btn toolbar-mark-btn b3-tooltips b3-tooltips__n" :class="{active:quickMarkMode}" @click.stop="toggleQuickMark" :aria-label="quickMarkMode?'退出快速标注':'快速标注'">
          <svg><use xlink:href="#iconMark"/></svg>
          <span class="mark-indicator" :style="{background:COLORS[quickMarkColor].bg}"></span>
        </button>
        <button v-if="ttsEnabled&&!isEmbedPdfMode" class="toolbar-btn b3-tooltips b3-tooltips__n" :class="{active:ttsPlaying}" @click.stop="toggleTTS" :aria-label="ttsPlaying?(i18n.ttsPause||'暂停朗读'):(i18n.ttsPlay||'开始朗读')"><svg><use :xlink:href="ttsPlaying?'#iconPause':'#iconPlay'"/></svg></button>
        <button v-if="isMobile()" class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="handleClose" aria-label="Close"><svg><use xlink:href="#iconClose"/></svg></button>
      </div>
    </div>
  </div>
  <MarkPanel v-if="!isEmbedPdfMode" ref="markPanelRef" :root="containerRef" :book-url="getBookUrl()" :manager="markManager" :reader="reader" :current-view="currentView" :read-only="false" :i18n="i18n" :tts-controller="ttsController" :tts-config="currentSettings?.tts" :quick-mark-mode="quickMarkMode" :quick-mark-color="COLORS[quickMarkColor].color" :quick-mark-style="quickMarkStyle" :can="can" :show-upgrade="showUpgrade" @copy="(text,sel)=>handleCopy({text,cfi:sel?.cfi,page:sel?.page,section:sel?.section,rects:sel?.rects,textOffset:sel?.textOffset})" @dict="handleOpenDict" @copy-mark-only="handleCopyToClipboard" />
</template>
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Menu, showMessage } from 'siyuan'
import type { Plugin } from 'siyuan'
import type { ReaderSettings } from '@/composables/useSetting'
import { settingsManager } from '@/composables/useSetting'
import { openDict as openDictDialog } from '@/utils/dictionary'
import { createReader, type FoliateReader } from '@/core/epub/reader'
import { setActiveReader, clearActiveReader } from '@/core/epub/state'
import { COLORS, STYLES, createMarkManager, type MarkManager } from '@/core/MarkManager'
import { saveMobilePosition, isMobile } from '@/utils/mobile'
import EmbedPdfReader from './EmbedPdfReader.vue'
import MarkPanel from './MarkPanel.vue'
import ReaderToc from './ReaderToc.vue'
import ReaderMarks from './ReaderMarks.vue'
import Settings from './Settings.vue'
import ReaderSplash from './ui/ReaderSplash.vue'
import DockShell from './ui/DockShell.vue'
import { gotoEPUB, initJump, pdfPageFromCfi } from '@/utils/jump'
import { copyMark as copyMarkUtil } from '@/utils/copy'
import { capturePdfAnnotationImage, isPdfImageAnnotation, taskToPromise } from '@/utils/embedPdfActions'
import { isUserEmbedPdfAnnotation } from '@/core/dataMigration'
import { createKeyboardHandler, setupEpubKeyboard, shouldHandleReaderKeydown } from '@/utils/keyboard'
import { getTTSController } from '@/services/TTSPlayer'
import { useLicense } from '@/composables/useLicense'
const props = defineProps<{ file?: File; plugin: Plugin; settings?: ReaderSettings; url?: string; blockId?: string; bookInfo?: any; onReaderReady?: (r: FoliateReader) => void; i18n?: any }>()
const i18n = computed(() => props.i18n || {})
const { can, showUpgrade } = useLicense(i18n.value)
const currentSettings = ref(props.settings)
const getSettings = () => currentSettings.value || props.settings
const openingSplashKey = props.bookInfo?.url || props.url || props.file?.name || ''
const seenOpeningSplash = openingSplashKey ? sessionStorage.getItem(`sireader-opening:${openingSplashKey}`) === '1' : false
const isPdfBook = computed(() => props.file?.name.endsWith('.pdf') || props.url?.split('?')[0].endsWith('.pdf') || props.bookInfo?.format === 'pdf')
const showOpeningSplash = computed(() => {
  if (props.bookInfo?.temporary) return false
  if (isPdfBook.value || !currentSettings.value?.epubOpeningSplash) return false
  return !seenOpeningSplash && (!!props.file || !(props.bookInfo?.progress > 0 || props.bookInfo?.pos?.cfi || props.bookInfo?.pos?.page || props.bookInfo?.pos?.chapter))
})
const tocTabs = computed(() => [
  { id: 'toc', icon: 'lucide-scroll-text', tip: i18n.value.toc || 'TOC' },
  { id: 'mark', icon: 'lucide-square-pen', tip: i18n.value.annotation || i18n.value.mark || 'Marks' },
  { id: 'settings', icon: 'lucide-settings-2', tip: i18n.value.settings || 'Settings' },
])
const tocPane = computed(() => tocMode.value === 'toc' ? ReaderToc : tocMode.value === 'mark' ? ReaderMarks : Settings)
const readerContext = computed(() => ({
  activeView: currentView.value,
  activeReader: reader,
  bookUrl: getBookUrl(),
  settings: getSettings(),
  readOnlyMarks: false,
}))
const tocPaneProps = computed(() => tocMode.value === 'settings'
  ? { modelValue: currentSettings.value!, i18n: i18n.value, onSave: saveReaderSettings, 'onUpdate:modelValue': updateSettingsState }
  : { i18n: i18n.value, context: readerContext.value })
const updateSettingsState=(settings:ReaderSettings)=>{
  currentSettings.value=settings
  ;(window as any).__sireader_settings=settings
}
const saveReaderSettings=async()=>{const settings=currentSettings.value||props.settings;settings&&await settingsManager.save(settings)}
const closePanels=()=>{showToc.value=false}
const hasSettingChanged=(prev:any,next:any,keys:string[])=>keys.some(key=>JSON.stringify(prev?.[key])!==JSON.stringify(next?.[key]))
const getBookName=()=>props.bookInfo?.title||props.file?.name||props.url?.split('/').pop()?.split('?')[0]||'book'
const markPanelRef = ref()
const markManager = ref<MarkManager | null>(null)
const handleSettingsUpdate=async(e:Event)=>{
  const s=(e as CustomEvent).detail
  const prev=currentSettings.value
  updateSettingsState(s)
  hasSettingChanged(prev,s,['theme','customTheme','textSettings','paragraphSettings','layoutSettings','visualSettings','viewMode','pageAnimation'])&&reader?.updateSettings?.(s)
    JSON.stringify(prev?.tts)!==JSON.stringify(s?.tts)&&await syncTTS()
}
const containerRef = ref<HTMLElement>()
const viewerContainerRef = ref<HTMLElement>()
const readerSplashRef = ref<{ dismiss: () => void; cleanup: () => void; isVisible: () => boolean } | null>(null)
const loading = ref(true)
const error = ref('')
const readingProgress = ref(0)
const hasBookmark = ref(false)
const currentBookUrl = ref('')
let readerFocused = false
let touchStartX=0,touchStartY=0
const touchTargets = new Set<EventTarget>()
const canHandleTouchPaging=()=>false
const resetTouch=()=>{touchStartX=0;touchStartY=0}
const isTouchActionTarget=(target:EventTarget|null)=>target instanceof HTMLElement&&!!target.closest('.reader-toolbar-group,.reader-toc-popup,.mark-menu,.sr-popup-panel,input,textarea,button,select,a,[contenteditable="true"]')
const toggleMobileToolbar=()=>isMobile()&&(mobileToolbarVisible.value=!mobileToolbarVisible.value)
const handleTapZone=(x:number)=>{if(!isMobile()||getSettings()?.viewMode==='scroll')return;const third=(containerRef.value?.clientWidth||window.innerWidth)/3;if(x<third)return handlePrev();if(x>third*2)return handleNext();toggleMobileToolbar()}
const handleTouchStart=(e:TouchEvent)=>{if(canHandleTouchPaging()&&e.touches.length===1){touchStartX=e.touches[0].clientX;touchStartY=e.touches[0].clientY}}
const handleTouchEnd=(e:TouchEvent)=>{if(!canHandleTouchPaging()||!touchStartX)return;const{clientX:x,clientY:y}=e.changedTouches[0],dx=x-touchStartX,dy=y-touchStartY;resetTouch();if(isTouchActionTarget(e.target))return;if(Math.abs(dx)>=50&&Math.abs(dx)>Math.abs(dy))return dx>0?handlePrev():handleNext();if(Math.abs(dx)<=30&&Math.abs(dy)<=30)handleTapZone(x)}
const touchPagingEvents:[string,EventListener,AddEventListenerOptions?][]=[['touchstart',handleTouchStart as EventListener,{capture:true,passive:true}],['touchend',handleTouchEnd as EventListener,{capture:true,passive:true}]]
const bindTouchPaging=(target:EventTarget|null|undefined)=>{if(!isMobile()||!target||touchTargets.has(target))return;touchTargets.add(target);touchPagingEvents.forEach(([type,handler,options])=>target.addEventListener(type,handler,options))}
const unbindTouchPaging=()=>{touchTargets.forEach(target=>touchPagingEvents.forEach(([type,handler])=>target.removeEventListener(type,handler,true)));touchTargets.clear()}
const embedPdfSource = ref<File | string | null>(null)
const embedPdfPages = ref<any>(null)
const embedPdfAnnotations = ref<any>(null)
const embedPdfMarks = ref<any[]>([])
let embedPdfNativeIds = new Set<string>()
const embedPdfAnnotationsHidden = ref(false)
const currentView = ref<any>(null)
let cleanupEmbedPdfEvents: (()=>void) | null = null
const showSearch = ref(false)
const showToc = ref(false)
const showQuickMark = ref(false)
const mobileToolbarVisible = ref(false)
const toolbarVisible = computed(() => mobileToolbarVisible.value || showSearch.value || showToc.value || showQuickMark.value)
const quickMarkMode = ref(false)
const quickMarkColor = ref(0)
const quickMarkStyle = ref<'highlight'|'underline'|'outline'|'dotted'|'dashed'|'double'|'squiggly'>('highlight')
const tocMode = ref<'toc' | 'mark' | 'settings'>('toc')
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const searchCurrentIndex = ref(0)
let reader: FoliateReader | null = null
const ttsController = getTTSController()
const ttsEnabled = computed(() => currentSettings.value?.tts?.enabled || false)
const ttsPlaying = computed(() => ttsController.isActive.value && !ttsController.paused.value)
const clearReadingSelection=()=>{try{reader?.getView?.()?.renderer?.getContents?.()?.forEach(({doc}:any)=>doc.defaultView?.getSelection()?.removeAllRanges());document.getSelection()?.removeAllRanges()}catch{}}
const syncReadingProgress=(detail?:any)=>{const f=detail?.fraction??reader?.getLocation?.()?.fraction??currentView.value?.lastLocation?.fraction;readingProgress.value=Number.isFinite(f)?Math.max(0,Math.min(1,f)):0}
const toggleTTS = () => {if (!can.value('tts')) return showUpgrade('TTS朗读'); clearReadingSelection(); ttsController.toggle(() => reader, currentSettings.value?.tts, undefined, getBookName())}
const syncTTS = async () => ttsController.sync(currentSettings.value?.tts?.enabled || false)
const marks=computed(()=>markManager.value)
const isEmbedPdfMode=computed(()=>currentView.value?.engine==='embedpdf')
const hasSearchResults=computed(()=>searchResults.value.length>0)
const searchCount=computed(()=>searchResults.value.length?`${searchResults.value.length}`:'0')
const browserSource=(path='')=>path.startsWith('/data/public/')?path.replace('/data/public/','/public/'):path.startsWith('/public/')||path.startsWith('/assets/')||/^https?:\/\//.test(path)?path:path.startsWith('public/')||path.startsWith('assets/')?`/${path}`:''
const PDF_MARKUP_TYPES:Record<string,number>={highlight:9,underline:10,squiggly:11,strikeout:12}
const PDF_REDACT_TYPE=28
const embedPdfColor=(color='')=>(COLORS.find(item=>item.color===color)?.bg||color).toLowerCase()
const embedPdfStyle=(type:number,custom?:any)=>type===PDF_REDACT_TYPE?'redaction':custom?.style||Object.entries(PDF_MARKUP_TYPES).find(([,value])=>value===type)?.[0]||'highlight'
const embedPdfMark=(item:any)=>{
  const a=item?.annotation||item, page=(a.pageIndex??0)+1, bookmark=a.custom?.type==='bookmark', redaction=a.type===PDF_REDACT_TYPE
  const text=a.custom?.title||a.custom?.text||a.contents||(redaction?'遮蔽':i18n.value.annotation||i18n.value.mark||'Annotation')
  const color=[a.strokeColor,a.color,a.fontColor,a.backgroundColor].map(embedPdfColor).find(c=>c&&c!=='transparent')||'#ffcd45'
  return Object.assign(item,{id:a.id,type:bookmark?'bookmark':redaction?'redaction':a.type===1||a.type===3?'note':'highlight',format:'pdf',readOnly:embedPdfNativeIds.has(a.id)||a.flags?.includes('readOnly'),page,cfi:`#page-${page}`,title:bookmark?text:a.custom?.title,text:bookmark?text:a.custom?.text||a.contents||text,note:bookmark||redaction?'':a.custom?.note||a.contents||'',tags:a.custom?.tags||[],blockId:a.custom?.blockId,blockIds:a.custom?.blockIds,color,style:embedPdfStyle(a.type,a.custom),timestamp:new Date(a.created||a.modified||Date.now()).getTime(),chapter:bookmark?'':a.custom?.chapter||`${i18n.value.page||'Page '}${page}${i18n.value.pageSuffix||''}`,customOrder:a.custom?.customOrder})
}
const uniquePdfItems=(items:any[]=[])=>[...new Map(items.map((item:any)=>[(item.annotation||item)?.id,item]).filter(([id])=>id)).values()]
const compact=(value:Record<string,any>)=>Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined))
const readEmbedPdfMarkItems=async(scope:any)=>scope?.getAnnotations?.()?.map((item:any)=>({annotation:item.object})).filter((item:any)=>item.annotation)||await scope?.exportAnnotations?.().toPromise().catch(()=>[])||[]
const loadEmbedPdfMarks=async()=>{
  if(!embedPdfAnnotations.value)return
  embedPdfMarks.value=uniquePdfItems(await readEmbedPdfMarkItems(embedPdfAnnotations.value)).filter(isUserEmbedPdfAnnotation).map(embedPdfMark)
}
const nextFrame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
const latestPdfAnnotation=(item:any)=>embedPdfAnnotations.value?.getAnnotations?.().find((x:any)=>x.object?.id===item.id)?.object||item.annotation||item
const imageEmbedPdfMark=async(item:any)=>{
  for(let i=0;!item.image&&i<8;i++){
    const a=latestPdfAnnotation(item)
    if(!isPdfImageAnnotation(a))return item
    item={...item,annotation:a,image:await capturePdfAnnotationImage(currentView.value?.render,a)}
    await nextFrame()
  }
  return item
}
const syncEmbedPdfEvent=async(event:any)=>{
  const a=event?.annotation, mark=a&&(embedPdfMarks.value.find((item:any)=>item.id===a.id)||embedPdfMark({annotation:a}))
  if(!mark)return
  try{const m=await import('@/utils/copy');event?.type==='delete'?await m.syncMarkOnDelete(mark):await m.syncMarkOnCreate(await imageEmbedPdfMark(mark),{bookUrl:getBookUrl(),isPdf:true,marks:currentView.value?.marks,maxAgeMs:15000})}catch(e){console.error('[PdfSync]',e)}
}
const updateEmbedPdfMark=async(item:any,updates:any)=>{
  const a=item.annotation||item
  a.custom={...(a.custom||{}),...compact({text:updates.text,title:updates.title,note:updates.note,tags:updates.tags,style:updates.style,blockId:updates.blockId,blockIds:updates.blockIds})}
  a.contents=updates.note??updates.text??a.contents
  if(updates.style)a.type=PDF_MARKUP_TYPES[updates.style]||a.type
  if(updates.color)a.strokeColor=a.color=updates.color
  Object.assign(item,updates,{style:embedPdfStyle(a.type,a.custom),color:embedPdfColor(a.strokeColor||a.color||'')})
  await embedPdfAnnotations.value.updateAnnotation(a.pageIndex,a.id,compact({type:a.type,contents:a.contents,custom:a.custom,strokeColor:a.strokeColor,color:a.color}))
  await loadEmbedPdfMarks()
}
const deleteEmbedPdfMark=async(item:any)=>{const a=item.annotation||item;await embedPdfAnnotations.value.deleteAnnotation(a.pageIndex,a.id);await loadEmbedPdfMarks();return true}
const toggleEmbedPdfBookmark=async(loc:any,title?:string)=>{
  const page=typeof loc==='string'?pdfPageFromCfi(loc):Number(loc||0), found=embedPdfMarks.value.find(item=>item.type==='bookmark'&&item.page===page)
  if(!page)return false
  if(found)return await deleteEmbedPdfMark(found),false
  const text=title||`第${page}页`, now=new Date()
  embedPdfAnnotations.value.createAnnotation(page-1,{id:`bookmark-${Date.now()}`,type:1,pageIndex:page-1,rect:{origin:{x:0,y:0},size:{width:1,height:1}},contents:text,created:now,modified:now,flags:['hidden','noView'],custom:{type:'bookmark',title:text}})
  await loadEmbedPdfMarks()
  return true
}
const initEmbedPdfMode=async(loadSource:()=>Promise<File|string|null>)=>{
  const file=await loadSource()
  if(!file)throw new Error('PDF file is missing')
  embedPdfSource.value=file
  embedPdfNativeIds=new Set()
  embedPdfMarks.value=[]
  embedPdfAnnotationsHidden.value=false
  markManager.value=null
  currentView.value={engine:'embedpdf',isPdf:true,annotationsHidden:embedPdfAnnotationsHidden,marks:{getAnnotations:()=>embedPdfMarks.value.filter((item:any)=>item.type!=='bookmark'),getBookmarks:()=>embedPdfMarks.value.filter((item:any)=>item.type==='bookmark'),updateMark:updateEmbedPdfMark,deleteMark:deleteEmbedPdfMark,toggleBookmark:toggleEmbedPdfBookmark,imageMark:imageEmbedPdfMark},goTo:(page:any,id?:string)=>{const pageNumber=Number(page)||1;embedPdfPages.value?.scrollToPage({pageNumber,behavior:'smooth'});if(id)requestAnimationFrame(()=>embedPdfAnnotations.value?.selectAnnotation?.(pageNumber-1,id))},getCurrentPage:()=>embedPdfPages.value?.getCurrentPage?.()||1,toggleAnnotationsHidden:()=>embedPdfAnnotationsHidden.value=!embedPdfAnnotationsHidden.value,cleanup:()=>{cleanupEmbedPdfEvents?.();cleanupEmbedPdfEvents=null;embedPdfSource.value=null;embedPdfPages.value=null;embedPdfAnnotations.value=null;embedPdfNativeIds=new Set();embedPdfMarks.value=[];embedPdfAnnotationsHidden.value=false}}
  setActiveReader(currentView.value,null,getSettings())
}
const handleEmbedPdfReady=(registry:any)=>{
  const documentId='sireader-document'
  const scroll=registry.getPlugin('scroll').provides()
  embedPdfPages.value=scroll.forDocument(documentId)
  embedPdfAnnotations.value=registry.getPlugin('annotation').provides().forDocument(documentId)
  currentView.value.render=registry.getPlugin('render')?.provides?.().forDocument(documentId)
  const emitPage=(page:number)=>window.dispatchEvent(new CustomEvent('sireader:pdf-page',{detail:{bookUrl:getBookUrl(),page}}))
  const offPage=scroll.onPageChange?.((event:any)=>event.documentId===documentId&&emitPage(event.pageNumber))
  const rememberNative=()=>embedPdfNativeIds=new Set(embedPdfAnnotations.value?.getAnnotations?.().map((item:any)=>item.object?.id).filter(Boolean)||[])
  const offAnno=embedPdfAnnotations.value.onAnnotationEvent?.((event:any)=>{if(event?.type==='loaded')rememberNative();if(event?.type==='create'||event?.type==='delete')void syncEmbedPdfEvent(event);if(['loaded','create','update','delete'].includes(event?.type))void loadEmbedPdfMarks()})
  cleanupEmbedPdfEvents?.()
  cleanupEmbedPdfEvents=()=>{offPage?.();offAnno?.()}
  emitPage(embedPdfPages.value?.getCurrentPage?.()||1)
  rememberNative()
  void loadEmbedPdfMarks()
  const pageTextCache=new Map<number,Promise<string>>()
  currentView.value.getPageText=(page:number)=>{
    const pageNumber=Number(page)||1
    if(!pageTextCache.has(pageNumber))pageTextCache.set(pageNumber,(async()=>{
      const doc=registry.getPlugin('document-manager')?.provides?.().getDocument(documentId)
      return doc ? await registry.getEngine().extractText(doc,[pageNumber-1]).toPromise() : ''
    })())
    return pageTextCache.get(pageNumber)!
  }
  currentView.value.getBookmarks=()=>taskToPromise<any>(registry.getPlugin('bookmark')?.provides?.()?.forDocument?.(documentId)?.getBookmarks?.()).then((result:any)=>result?.bookmarks||[])
  window.dispatchEvent(new CustomEvent('sireader:tab-switched'))
}
const loadViewer=()=>document.getElementById('protyleViewerScript')?Promise.resolve():new Promise<void>((resolve,reject)=>{
  const s=document.createElement('script')
  s.id='protyleViewerScript';s.src='/stage/protyle/js/viewerjs/viewer.js?v=1.11.7';s.onload=()=>resolve();s.onerror=()=>reject(new Error('viewer.js load failed'));document.head.appendChild(s)
})
let activeMediaMenu:any=null
const closeMediaMenu=()=>{activeMediaMenu?.element?.remove?.();activeMediaMenu=null}
const openMediaMenu=(x:number,y:number,setup:(m:Menu)=>void)=>{closeMediaMenu();const m=new Menu('sireader-media-menu',()=>activeMediaMenu=null);setup(m);activeMediaMenu=m;m.open({x,y})}
const openImageMenu = ({ item, x, y }: any) => openMediaMenu(x, y, m => {
  m.addItem({ icon: 'iconCopy', label: '复制图片', click: () => handleCopyToClipboard(item) })
  m.addItem({ icon: 'iconUpload', label: '导出图片', click: () => handleCopy(item) })
  m.addItem({ icon: 'iconMark', label: '标注图片', click: async () => markPanelRef.value?.showCard(await (markManager.value as any)?.addImageMark(item.image, item.text, item.cfi), x, y, true) })
})
const openImageViewer=async({item}:any)=>{
  if(!item?.image)return
  await loadViewer().catch(()=>{})
  if(!(window as any).Viewer)return window.open(item.image,'_blank')
  const root=document.createElement('ul')
  const mediaSrc=(el:any,doc:any)=>{if(el.localName==='img')return el.currentSrc||el.src;const image=el.querySelector?.('image');const href=image?.getAttribute('href')||image?.getAttributeNS?.('http://www.w3.org/1999/xlink','href');return href&&(/^data:|^blob:|^[a-z]+:/i.test(href)?href:new URL(href,doc.baseURI).href)}
  const images=[...new Set([...(reader?.getView?.()?.renderer?.getContents?.()?.flatMap(({doc}:any)=>Array.from(doc.querySelectorAll('img, svg')).map((el:any)=>mediaSrc(el,doc)))||[]),item.image].filter(Boolean))]
  images.forEach((src:any)=>{const li=document.createElement('li');li.appendChild(Object.assign(document.createElement('img'),{src,alt:item.text||''}));root.appendChild(li)})
  const initialViewIndex=Math.max(0,images.indexOf(item.image))
  ;(window as any).siyuan ||= {}
  const viewer=(window as any).siyuan.viewer=new (window as any).Viewer(root,{button:false,initialViewIndex,transition:false,hidden(){viewer.destroy()},toolbar:{close(){viewer.destroy()},flipHorizontal:true,flipVertical:true,next:true,oneToOne:true,play:true,prev:true,reset:true,rotateLeft:true,rotateRight:true,zoomIn:true,zoomOut:true}})
  viewer.show();viewer.view(initialViewIndex)
}
const openTableMenu = ({ item, x, y }: any) => openMediaMenu(x, y, m => {
  m.addItem({ icon: 'iconCopy', label: '复制表格', click: () => navigator.clipboard.writeText(item.html || item.text || '') })
  m.addItem({ icon: 'iconRef', label: '定位表格', click: () => item.cfi && reader?.goTo(item.cfi) })
})
const init=async()=>{
  if(!containerRef.value)return
  try{
    loading.value=true
    error.value=''
    currentSettings.value = await settingsManager.get().catch(() => currentSettings.value || props.settings)
    const bookUrl=props.bookInfo?.url||props.url||(props.file?`file://${props.file.name}`:`book-${Date.now()}`)
    currentBookUrl.value=bookUrl
    ;(window as any).__currentBookUrl=bookUrl
    const isPdf=isPdfBook.value
    const isTemporary=!!props.bookInfo?.temporary
    const{bookshelfManager}=await import('@/core/bookshelf')
    const onProgress=async(detail?:any)=>{syncReadingProgress(detail);updateBookmarkState();!isTemporary&&await bookshelfManager.updateProgressAuto(bookUrl,reader,currentView.value)}
    const loadSource=async()=>{
      if(props.file)return props.file
      if(props.url)return props.url
      const path=props.bookInfo?.path
      if(!path)return null
      const direct=isPdf?browserSource(path):''
      if(direct)return direct
      return bookshelfManager.loadFile(path)
    }
    if(isPdf){
      await initEmbedPdfMode(loadSource)
    }else{
      reader=createReader({container:viewerContainerRef.value!,settings:getSettings()!,plugin:props.plugin})
      await reader.open(async()=>await loadSource()||await Promise.reject(new Error('未提供书籍')),props.bookInfo?.format)
      const view=reader.getView()
      markManager.value=createMarkManager({format:'epub',view,plugin:props.plugin,bookUrl,bookName:getBookName(),reader})
      !isTemporary&&await markManager.value.init()
      ;(view as any).marks=markManager.value
      reader.on('image-open', openImageViewer)
      reader.on('image-menu', openImageMenu)
      reader.on('table-menu', openTableMenu)
      reader.on('table-open', openTableMenu)
      reader.on('content-interaction', closeMediaMenu)
      !isTemporary&&bookshelfManager.restoreProgress(bookUrl,reader).catch(()=>{})
      reader.on('relocate',onProgress)
      setupEpubKeyboard(
        reader,
        handleKeydown,
        (doc,e)=>markPanelRef.value?.checkSelection(doc,e),
        x=>handleTapZone(x),
        ()=>reader?.goLeft(),
        ()=>reader?.goRight()
      )
      currentView.value=view
      syncReadingProgress()
      setActiveReader(view,reader,getSettings())
      props.onReaderReady?.(reader)
    }
    await syncTTS()
    markPanelRef.value?.setupAnnotationListeners()
    if (!isTemporary && openingSplashKey) sessionStorage.setItem(`sireader-opening:${openingSplashKey}`, '1')
  }catch(e){
    error.value=e instanceof Error?e.message:'加载失败'
    markPanelRef.value?.closeAll()
  }finally{
    loading.value=false
    setTimeout(()=>readerSplashRef.value?.dismiss(),300)
        !props.bookInfo?.temporary&&!isEmbedPdfMode.value&&props.bookInfo?.pos?.cfi&&initJump(props.bookInfo.pos.cfi,currentBookUrl.value)
  }
}
const copyReaderMark=(item:any,clipboard=false)=>{
  if(typeof item==='string'||(!item.id&&item.text&&!item.image)){const loc=reader?.getLocation();item={text:item.text||item,cfi:item.cfi,page:item.page,chapter:loc?.tocItem?.label||loc?.tocItem?.title,id:''}}
  copyMarkUtil(item,{bookUrl:getBookUrl(),bookInfo:props.bookInfo,settings:clipboard?{...(getSettings()||{}),noteInsertTarget:'clipboard'}:getSettings(),reader,showMsg:(msg:string)=>showMessage(msg,1000)})
}
const handleCopy=(item:any)=>copyReaderMark(item)
const handleCopyToClipboard=(item:any)=>copyReaderMark(item,true)
const handleOpenDict=(text:string,x:number,y:number,selection:any)=>selection&&openDictDialog(text,x,y,selection)
const isEpubScrollMode=()=>getSettings()?.viewMode==='scroll'
const flipPage=async(dir:'prev'|'next')=>{
  if(dir==='next'&&readerSplashRef.value?.isVisible())return readerSplashRef.value.dismiss()
  if(props.bookInfo?.temporary&&typeof props.bookInfo?.webpageTurn==='function')return props.bookInfo.webpageTurn(dir)
  if(isEmbedPdfMode.value)return embedPdfPages.value?.[dir==='prev'?'scrollToPreviousPage':'scrollToNextPage']('smooth')
    if(reader)return isEpubScrollMode() ? reader[dir]() : reader[dir==='prev'?'goLeft':'goRight']()
  return currentView.value?.[dir]?.()||currentView.value?.[dir==='prev'?'goLeft':'goRight']?.()
}
const handlePrev=()=>flipPage('prev')
const handleNext=()=>flipPage('next')
const searchInputRef=ref<HTMLInputElement>()
const toggleSearch=()=>{showSearch.value=!showSearch.value;showSearch.value&&(showQuickMark.value=quickMarkMode.value=false,setTimeout(()=>searchInputRef.value?.focus(),100))}
const toggleQuickMark=()=>{if(!can.value('quick-mark'))return showUpgrade('快速标注');showQuickMark.value=!showQuickMark.value;showQuickMark.value&&(showSearch.value=false);quickMarkMode.value=showQuickMark.value}
const syncSearchNav=(r:any)=>{if(r)searchCurrentIndex.value=reader.searchManager.getCurrentIndex()}
const handleSearch=async()=>{
  if(!searchQuery.value.trim())return
  if(reader?.searchManager){
    searchResults.value=[]
    for await(const r of reader.search(searchQuery.value))searchResults.value.push(r)
    searchCurrentIndex.value=searchResults.value.length?0:-1
  }
}
const moveSearch=(dir:'next'|'prev')=>syncSearchNav(reader?.[dir==='next'?'nextSearchResult':'prevSearchResult']())
const handleSearchNext=()=>moveSearch('next')
const handleSearchPrev=()=>moveSearch('prev')
const handleSearchClear=()=>{searchQuery.value='';searchResults.value=[];searchCurrentIndex.value=0;reader?.clearSearch();showSearch.value=false}
const updateBookmarkState=()=>hasBookmark.value=!!markManager.value?.hasBookmark?.()
const toggleBookmark=async()=>{if(isEmbedPdfMode.value)return;try{hasBookmark.value=await marks.value?.toggleBookmark?.();window.dispatchEvent(new CustomEvent('sireader:marks-updated'))}catch(e:any){showMessage(e.message||'操作失败',2000,'error')}}
const getBookUrl=()=>currentBookUrl.value||props.bookInfo?.url||props.url||''
const savePosition=()=>isMobile()&&getBookUrl()&&reader&&saveMobilePosition(getBookUrl(),{cfi:reader.getLocation()?.cfi})
const syncReaderFocus=(focused:boolean)=>{const bookUrl=getBookUrl();if(!bookUrl||readerFocused===focused)return;readerFocused=focused;window.dispatchEvent(new CustomEvent(focused?'reader:focus':'reader:blur',{detail:{bookUrl}}))}
const hasReaderFocus=()=>!!containerRef.value&&containerRef.value.contains(document.activeElement)
const handleFocusIn=()=>syncReaderFocus(true)
const handleFocusOut=()=>setTimeout(()=>syncReaderFocus(hasReaderFocus()),0)
const handleWindowBlur=()=>syncReaderFocus(false)
const handleWindowFocus=()=>syncReaderFocus(hasReaderFocus())
const handleVisibilityChange=()=>syncReaderFocus(!document.hidden&&hasReaderFocus())
const openToc=()=>{showToc.value=!showToc.value}
const handleClose=()=>{savePosition();window.dispatchEvent(new CustomEvent('reader:mobile-close'))}
const isThisActiveReader=()=>!(window as any).__sireader_active_view||(window as any).__sireader_active_view===currentView.value
const activeOnly=<T extends any[]>(fn:(...args:T)=>any)=>(...args:T)=>isThisActiveReader()?fn(...args):undefined
const handleGoto=(e:CustomEvent)=>{
  const{cfi,id,bookUrl}=e.detail
  if(bookUrl&&bookUrl!==currentBookUrl.value)return
  if(!cfi)return
  const pdfPage=pdfPageFromCfi(cfi)
  if(isEmbedPdfMode.value&&pdfPage){
    currentView.value?.goTo?.(pdfPage,id)
    return
  }
  void gotoEPUB(cfi,id,reader,markManager.value)
}
const handleUndo=()=>markManager.value?.undo?.()
const refreshEmbedPdfMarks=()=>{if(isEmbedPdfMode.value)void loadEmbedPdfMarks()}
const keyboardHandler=createKeyboardHandler({handlePrev,handleNext,handleUndo})
const handleKeydown=(e:KeyboardEvent)=>shouldHandleReaderKeydown(isEmbedPdfMode.value,isThisActiveReader())&&keyboardHandler(e)
const events=[
  ['sireaderSettingsUpdated',handleSettingsUpdate],
  ['sireader:goto',handleGoto],
  ['sireader:marks-updated',refreshEmbedPdfMarks],
  ['sireader:close-reader-panels',closePanels],
  ['sireader:togglePdfToc',activeOnly(openToc)],
  ['sireader:toggleBookmark',activeOnly(toggleBookmark)],
  ['sireader:quickNote',async()=>{try{if(isEmbedPdfMode.value||!currentView.value||!containerRef.value?.isConnected||!isThisActiveReader())return;const { openNoteTargetFloat } = await import('@/utils/copy');await openNoteTargetFloat(getBookUrl(),getSettings(),containerRef.value!)}catch(e:any){showMessage(e?.message||'Failed',2000,'error')}}],
  ['sireader:prevPage',activeOnly(handlePrev)],
  ['sireader:nextPage',activeOnly(handleNext)],
]as const
const suppressError=(e:PromiseRejectionEvent)=>/createTreeWalker|destroy/.test(e.reason?.message||'')&&e.preventDefault()
const setupTabObserver=()=>{if(isMobile())return;let el=containerRef.value?.parentElement;while(el){if(el.hasAttribute('data-id')){const h=document.querySelector(`li[data-type="tab-header"][data-id="${el.getAttribute('data-id')}"]`);if(h){const obs=new MutationObserver(ms=>ms.forEach(m=>{if(m.type!=='attributes'||m.attributeName!=='class')return;const focused=(m.target as HTMLElement).classList.contains('item--focus');focused&&setActiveReader(currentView.value,reader,getSettings());focused&&window.dispatchEvent(new CustomEvent('sireader:tab-switched'));syncReaderFocus(focused&&hasReaderFocus())}));obs.observe(h,{attributes:true,attributeFilter:['class']});(containerRef.value as any).__observer=obs;break}}el=el.parentElement}}
const resize=()=>reader?.resize?.()
defineExpose({ resize })
onMounted(()=>{init();containerRef.value?.focus();events.forEach(([e,h])=>window.addEventListener(e,h as any));window.addEventListener('keydown',handleKeydown);window.addEventListener('unhandledrejection',suppressError);window.addEventListener('blur',handleWindowBlur);window.addEventListener('focus',handleWindowFocus);document.addEventListener('visibilitychange',handleVisibilityChange);setupTabObserver();const c=containerRef.value;c&&(c.addEventListener('focusin',handleFocusIn),c.addEventListener('focusout',handleFocusOut));bindTouchPaging(c);bindTouchPaging(viewerContainerRef.value);window.dispatchEvent(new CustomEvent('reader:open',{detail:{bookUrl:getBookUrl()}}));syncReaderFocus(true)})
onUnmounted(async()=>{
  const view=currentView.value,c=containerRef.value
  syncReaderFocus(false);window.dispatchEvent(new CustomEvent('reader:close'));savePosition();readerSplashRef.value?.cleanup();clearActiveReader(view);closeMediaMenu()
  events.forEach(([e,h])=>window.removeEventListener(e,h as any));window.removeEventListener('keydown',handleKeydown);window.removeEventListener('unhandledrejection',suppressError);window.removeEventListener('blur',handleWindowBlur);window.removeEventListener('focus',handleWindowFocus);document.removeEventListener('visibilitychange',handleVisibilityChange);(c as any)?.__observer?.disconnect();c&&(c.removeEventListener('focusin',handleFocusIn),c.removeEventListener('focusout',handleFocusOut));unbindTouchPaging()
  try{await reader?.destroy();view?.cleanup?.()}catch{}
  await markManager.value?.destroy()
  const{bookshelfManager}=await import('@/core/bookshelf');bookshelfManager.cleanup();await bookshelfManager.flush()
  setTimeout(()=>viewerContainerRef.value&&(viewerContainerRef.value.innerHTML=''),50)
})
</script>
<style scoped lang="scss">
.reader-container{position:relative;width:100%;height:100%;outline:none;user-select:text;-webkit-user-select:text;isolation:isolate;display:flex;flex-direction:column;background:var(--b3-theme-background)}
.reader-overlay{position:absolute;inset:0;z-index:999;background:transparent}
.viewer-container{flex:1;position:relative;overflow:auto;background:var(--b3-theme-background)}
.reader-progress{position:absolute;left:0;right:0;bottom:0;height:2px;z-index:1000;pointer-events:none;background:color-mix(in srgb,var(--b3-theme-primary) 14%,transparent);overflow:hidden;span{display:block;width:100%;height:100%;transform-origin:left center;background:var(--b3-theme-primary);transition:transform .18s ease-out}}
.reader-loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:16px;color:var(--b3-theme-on-background);z-index:10;pointer-events:none}
.spinner{width:48px;height:48px;border:4px solid var(--b3-theme-primary-lighter);border-top-color:var(--b3-theme-primary);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.reader-toolbar-group{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;z-index:1001;opacity:var(--toolbar-opacity);transition:opacity .2s;&:hover{opacity:1}}
.reader-toolbar,.reader-panel{display:flex;align-items:center;gap:2px;padding:3px 4px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:6px;box-shadow:0 2px 8px #0002;transition:opacity .2s}
.toolbar-btn{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:4px;cursor:pointer;transition:all .15s;svg{width:14px;height:14px}&:hover{background:var(--b3-list-hover)}&.active{background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary)}}
.toolbar-mark-btn{position:relative;.mark-indicator{position:absolute;right:2px;bottom:2px;width:8px;height:8px;border-radius:50%;border:1.5px solid var(--b3-theme-surface);box-shadow:0 0 0 .5px var(--b3-border-color)}}
.search-input{width:160px;height:22px;padding:0 6px;border:none;background:var(--b3-theme-background-light);color:var(--b3-theme-on-surface);font-size:11px;border-radius:3px;transition:background .15s;&:focus{outline:none;background:var(--b3-theme-background)}}
.search-count{font-size:11px;color:var(--b3-theme-on-surface-variant);min-width:40px;text-align:center;opacity:.7}
.panel-divider{width:1px;height:20px;background:var(--b3-border-color)}
.mark-colors,.mark-styles{display:flex;gap:3px}
.mark-color-btn{width:24px;height:24px;border:2px solid transparent;border-radius:50%;cursor:pointer;transition:all .15s;padding:0;&.active{border-color:var(--b3-theme-on-surface);transform:scale(1.1)}&:hover{transform:scale(1.05)}}
.mark-style-btn{width:28px;height:24px;display:flex;align-items:center;justify-content:center;border:1px solid var(--b3-border-color);background:transparent;border-radius:4px;cursor:pointer;transition:all .15s;color:var(--b3-theme-on-surface);font-size:12px;font-weight:600;&.active{background:var(--b3-theme-primary-lightest);border-color:var(--b3-theme-primary);color:var(--b3-theme-primary)}&:hover{background:var(--b3-list-hover)}span[data-type="underline"]{text-decoration:underline}span[data-type="outline"]{border:1px solid currentColor;padding:0 2px}span[data-type="dotted"]{border-bottom:2px dotted currentColor}span[data-type="dashed"]{border-bottom:2px dashed currentColor}span[data-type="double"]{border-bottom:3px double currentColor}span[data-type="squiggly"]{text-decoration:underline wavy}}
.reader-toc-popup{position:absolute;bottom:60px;left:50%;transform:translateX(-50%);width:min(420px,92vw);height:min(520px,72vh);background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:8px;box-shadow:0 4px 20px #0003;z-index:1002;overflow:hidden}
.toc-popup-enter-active,.toc-popup-leave-active{transition:all .2s}
.toc-popup-enter-from,.toc-popup-leave-to{opacity:0;transform:translate(-50%,10px)}
</style>
