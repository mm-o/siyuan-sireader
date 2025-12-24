<template>
  <div class="sr-toc">
    <!-- 工具栏 -->
    <div class="sr-toolbar">
      <input v-model="keyword" :placeholder="placeholders[mode]">
      <div v-if="mode==='mark'" class="sr-select">
        <button class="b3-tooltips b3-tooltips__sw" @click="showColorMenu=!showColorMenu" :aria-label="filterColor||'全部'">
          <svg><use xlink:href="#lucide-palette"/></svg>
        </button>
        <Transition name="menu">
          <div v-if="showColorMenu" class="sr-menu" @click="showColorMenu=false">
            <div v-for="(c,i) in colorMenu" :key="i" :class="['sr-menu-item',{active:c.active}]" @click="filterColor=c.value">
              <span v-if="c.color" class="dot" :style="{background:c.color}"></span>{{ c.label }}
            </div>
          </div>
        </Transition>
      </div>
      <button v-if="mode==='toc'&&isPdfMode" class="b3-tooltips b3-tooltips__sw" @click="showThumbnail=!showThumbnail" :aria-label="showThumbnail?'目录':'缩略图'">
        <svg><use :xlink:href="showThumbnail?'#lucide-scroll-text':'#lucide-panels-top-left'"/></svg>
      </button>
      <button class="b3-tooltips b3-tooltips__sw" @click="isReverse=!isReverse" :aria-label="isReverse?'倒序':'正序'">
        <svg><use :xlink:href="isReverse?'#lucide-arrow-up-1-0':'#lucide-arrow-down-0-1'"/></svg>
      </button>
      <button class="b3-tooltips b3-tooltips__sw" @click="toggleScroll" :aria-label="isAtTop?'底部':'顶部'">
        <svg><use :xlink:href="isAtTop?'#lucide-panel-top-open':'#lucide-panel-top-close'"/></svg>
      </button>
    </div>

    <!-- 内容区 -->
    <div ref="contentRef" class="sr-content" @scroll="onScroll">
      <!-- 目录 -->
      <div v-show="mode==='toc'&&!showThumbnail" ref="tocRef"></div>
      
      <!-- PDF 缩略图（在目录模式内） -->
      <div v-show="mode==='toc'&&showThumbnail" ref="thumbContainer" class="sr-thumbnails">
        <div v-if="!isPdfMode" class="sr-empty">仅 PDF 支持缩略图</div>
        <div v-else v-for="i in pageCount" :key="i" :data-page="i" class="sr-thumb" @click="goToPage(i)">
          <img v-if="loadedThumbs[i]" :src="loadedThumbs[i]" :alt="`第 ${i} 页`">
          <div v-else class="sr-thumb-placeholder">{{ i }}</div>
          <div class="sr-thumb-label">{{ i }}</div>
        </div>
      </div>
      
      <Transition name="fade" mode="out-in">
        <!-- 书签 -->
        <div v-if="mode==='bookmark'" key="bookmark" class="sr-list">
          <div v-if="!list.length" class="sr-empty">{{ emptyText }}</div>
          <div v-else v-for="(item,i) in list" :key="item.id||i" class="sr-bookmark-item" @click="goTo(item)">
            {{ item.title||'无标题' }}
            <button class="sr-action-btn b3-tooltips b3-tooltips__nw" aria-label="删除书签" @click.stop="removeBookmark(item)">
              <svg><use xlink:href="#iconTrashcan"/></svg>
            </button>
          </div>
        </div>
        
        <!-- 标注/笔记 -->
        <div v-else-if="mode==='mark'||mode==='note'" :key="mode" class="sr-list">
          <div v-if="!list.length" class="sr-empty">{{ emptyText }}</div>
          <div v-else v-for="(item,i) in list" :key="item.groupId||item.id||item.page||i" class="sr-card" :class="{'sr-card-edit':isEditing(item)}">
            <span class="sr-bar" :style="{background:item.type==='ink-group'?'#ff9800':item.type==='shape-group'?'#2196f3':(colors[isEditing(item)?editColor:item.color]||'var(--b3-theme-primary)')}"></span>
            <div class="sr-main" @click="(item.type==='ink-group'||item.type==='shape-group')?null:(isEditing(item)?null:goTo(item))">
              <!-- 标题行 -->
              <div class="sr-head">
                <div v-if="isEditing(item)" class="sr-title" contenteditable @blur="e=>editText=e.target.textContent" v-html="editText"></div>
                <div v-else class="sr-title">{{ item.type==='ink-group'?'✏️':item.type==='shape-group'?'🔷':item.text||'无内容' }}<span v-if="item.type==='ink-group'||item.type==='shape-group'" class="sr-meta">第{{ item.page }}页 · {{ (item.inks||item.shapes).length }}项</span></div>
                <div v-if="!item.type||item.type==='highlight'||item.type==='note'" class="sr-time">{{ formatTime(item.timestamp||Date.now()) }}</div>
                <button v-if="item.type==='ink-group'||item.type==='shape-group'" @click.stop="toggleExpand(item)" class="sr-expand-btn b3-tooltips b3-tooltips__nw" :aria-label="isExpanded(item)?'收起':'展开'">
                  <svg><use :xlink:href="isExpanded(item)?'#iconUp':'#iconDown'"/></svg>
                </button>
              </div>
              <!-- 内容区 -->
              <textarea v-if="isEditing(item)" ref="editNoteRef" v-model="editNote" placeholder="添加笔记..." class="sr-note-input"/>
              <div v-else-if="item.note" class="sr-note">{{ item.note }}</div>
              <canvas v-if="item.type==='ink-group'" :data-page="item.page" class="sr-preview sr-group-preview" width="240" height="80"></canvas>
              <!-- 编辑选项 -->
              <template v-if="isEditing(item)&&showEditOptions(item)">
                <div class="sr-options">
                  <div class="sr-colors">
                    <button v-for="c in COLORS" :key="c.color" class="sr-color-btn" :class="{active:editColor===c.color}" :style="{background:c.bg}" @click.stop="editColor=c.color"/>
                  </div>
                  <div v-if="item.type==='shape'" class="sr-styles">
                    <button v-for="s in shapes" :key="s.type" class="sr-style-btn" :class="{active:editShapeType===s.type}" @click.stop="editShapeType=s.type" :title="s.label">
                      <svg style="width:16px;height:16px"><use :xlink:href="s.icon"/></svg>
                    </button>
                  </div>
                  <div v-else class="sr-styles">
                    <button v-for="s in STYLES" :key="s.type" class="sr-style-btn" :class="{active:editStyle===s.type}" @click.stop="editStyle=s.type">
                      <span class="sr-style-icon" :data-type="s.type">{{ s.text }}</span>
                    </button>
                  </div>
                </div>
                <div class="sr-actions">
                  <button @click.stop="saveEdit(item)" class="sr-btn-primary">保存</button>
                  <button @click.stop="cancelEdit" class="sr-btn-secondary">取消</button>
                </div>
              </template>
              <!-- 展开子项 -->
              <Transition name="expand">
                <div v-if="isExpanded(item)" class="sr-sub-list">
                  <div v-for="sub in (item.inks||item.shapes)" :key="sub.id" class="sr-sub-item" :class="{'sr-card-edit':isEditing(sub)}" @click.stop="isEditing(sub)?null:goTo(sub)">
                    <canvas v-if="item.type==='ink-group'" :data-ink-id="sub.id" class="sr-preview" width="240" height="40"></canvas>
                    <canvas v-else :data-shape-id="sub.id" class="sr-preview"></canvas>
                    <textarea v-if="isEditing(sub)" ref="editNoteRef" v-model="editNote" placeholder="添加笔记..." class="sr-note-input"/>
                    <div v-else-if="sub.note" class="sr-note">{{ sub.note }}</div>
                    <!-- 编辑选项 -->
                    <template v-if="isEditing(sub)">
                      <div class="sr-options">
                        <div class="sr-colors">
                          <button v-for="c in COLORS" :key="c.color" class="sr-color-btn" :class="{active:editColor===c.color}" :style="{background:c.bg}" @click.stop="editColor=c.color"/>
                        </div>
                        <div v-if="sub.type==='shape'" class="sr-styles">
                          <button v-for="s in shapes" :key="s.type" class="sr-style-btn" :class="{active:editShapeType===s.type}" @click.stop="editShapeType=s.type" :title="s.label">
                            <svg style="width:16px;height:16px"><use :xlink:href="s.icon"/></svg>
                          </button>
                        </div>
                      </div>
                      <div class="sr-actions">
                        <button @click.stop="saveEdit(sub)" class="sr-btn-primary">保存</button>
                        <button @click.stop="cancelEdit" class="sr-btn-secondary">取消</button>
                      </div>
                    </template>
                    <div v-else class="sr-btns">
                      <button v-if="item.type==='shape-group'" @click.stop="copyMark(sub)" class="b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.copy||'复制'"><svg><use xlink:href="#iconCopy"/></svg></button>
                      <button v-if="item.type==='shape-group'" @click.stop="startEdit(sub)" class="b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.edit||'编辑'"><svg><use xlink:href="#iconEdit"/></svg></button>
                      <button @click.stop="deleteMark(sub)" class="b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.delete||'删除'"><svg><use xlink:href="#iconTrashcan"/></svg></button>
                    </div>
                  </div>
                </div>
              </Transition>
              <!-- 操作按钮 -->
              <div v-if="!isEditing(item)&&(!item.type||item.type==='highlight'||item.type==='note')" class="sr-btns">
                <button @click.stop="copyMark(item)" class="b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.copy||'复制'"><svg><use xlink:href="#iconCopy"/></svg></button>
                <button @click.stop="startEdit(item)" class="b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.edit||'编辑'"><svg><use xlink:href="#iconEdit"/></svg></button>
                <button @click.stop="deleteMark(item)" class="b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.delete||'删除'"><svg><use xlink:href="#iconTrashcan"/></svg></button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 卡包 -->
        <div v-else-if="mode==='deck'" key="deck" class="sr-list">
          <div v-if="!list.length" class="sr-empty">{{ emptyText }}</div>
          <div v-else v-for="(item,i) in list" :key="item.id||i" class="sr-deck-card" @click="expandedDeck=expandedDeck===item.id?null:item.id">
            <div class="sr-deck-head">
              <div class="sr-word">{{ item.word }}</div>
              <div class="sr-deck-btns">
                <button @click.stop="goToDeckLocation(item)" class="b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.locate||'定位'"><svg><use xlink:href="#iconFocus"/></svg></button>
                <button @click.stop="removeDeckCard(item.id)" class="b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.delete||'删除'"><svg><use xlink:href="#iconTrashcan"/></svg></button>
              </div>
            </div>
            <div class="sr-deck-meta">
              <span class="sr-deck-dict">{{ getDictName(item.dictId) }}</span>
              <span class="sr-deck-time">{{ formatTime(item.timestamp) }}</span>
            </div>
            <Transition name="expand">
              <div v-if="expandedDeck===item.id" class="sr-deck-content" v-html="renderDictCard(item.data)"></div>
            </Transition>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { showMessage, Dialog } from 'siyuan'
import { loadDeckCards, getDeckCards, removeFromDeck, renderDictCard, getDictName } from '@/core/dictionary'
import { COLORS, STYLES, getColorMap, formatTime } from '@/core/MarkManager'
import { useReaderState } from '@/core/foliate'
import { jump } from '@/utils/jump'
import { copyMark as copyMarkUtil } from '@/utils/copy'
import { drawInk, renderInkCanvas as renderInkUtil } from '@/core/pdf/ink'
import { drawShape as drawShapeUtil, renderShapeCanvas as renderShapeUtil } from '@/core/pdf/shape'

const props = withDefaults(defineProps<{ mode: 'toc'|'bookmark'|'mark'|'note'|'deck'; i18n?: any }>(), { i18n: () => ({}) })
const emit = defineEmits(['update:mode'])

// 响应式状态
const { activeView, activeReader } = useReaderState()
const goToLocation = async (location: string | number) => activeView.value?.goTo(location)

// ===== 状态 =====
const tocRef=ref<HTMLElement>(),contentRef=ref<HTMLElement>(),editNoteRef=ref<HTMLTextAreaElement>(),thumbContainer=ref<HTMLElement>()
const keyword=ref(''),filterColor=ref(''),showColorMenu=ref(false),showThumbnail=ref(false)
const isReverse=ref(false),isAtTop=ref(true),refreshKey=ref(0)
const deckCards=ref<any[]>([]),expandedDeck=ref<string|null>(null),expandedGroup=ref<number|null>(null)
const editingId=ref<string|null>(null),editText=ref(''),editNote=ref(''),editColor=ref('yellow')
const editStyle=ref<'highlight'|'underline'|'outline'|'squiggly'>('highlight')
const editShapeType=ref<'rect'|'circle'|'triangle'>('rect')
const shapes=[{type:'rect',label:'矩形',icon:'#iconSquareDashed'},{type:'circle',label:'圆形',icon:'#iconCircleDashed'},{type:'triangle',label:'三角形',icon:'#iconTriangleDashed'}]
const loadedThumbs=ref<Record<number,string>>({})
const shapePreviewCache=new Map<string,string>()

// ===== 常量 =====
const colors=getColorMap()
const placeholders={toc:'搜索目录...',bookmark:'搜索书签...',mark:'搜索标注...',note:'搜索笔记...',deck:'搜索卡包...'}

// ===== Computed =====
const colorMenu=computed(()=>[{label:'全部',value:'',active:!filterColor.value},...Object.entries(colors).map(([k,v])=>({label:k,value:k,color:v,active:filterColor.value===k}))])
const marks=computed(()=>activeReader.value?.marks||(activeView.value as any)?.marks)
const isPdfMode=computed(()=>(activeView.value as any)?.isPdf||false)
const pageCount=computed(()=>(activeView.value as any)?.pageCount||0)
const data=computed(()=>{
  refreshKey.value
  if(!marks.value)return{bookmarks:[],marks:[],notes:[],deck:[]}
  const inks=marks.value.getInkAnnotations?.()||[]
  const inksByPage=inks.reduce((acc:any,ink:any)=>{
    if(!acc[ink.page])acc[ink.page]={page:ink.page,type:'ink-group',inks:[],timestamp:ink.timestamp,text:`墨迹标注 - 第${ink.page}页`}
    acc[ink.page].inks.push(ink)
    acc[ink.page].timestamp=Math.max(acc[ink.page].timestamp,ink.timestamp)
    return acc
  },{})
  const inkGroups=Object.values(inksByPage).map((g:any)=>({...g,groupId:`ink-${g.page}`}))
  const shapes=marks.value.getShapeAnnotations?.()||[]
  const shapesByPage=shapes.reduce((acc:any,shape:any)=>{
    if(!acc[shape.page])acc[shape.page]={page:shape.page,type:'shape-group',shapes:[],timestamp:shape.timestamp,text:`形状标注 - 第${shape.page}页`}
    acc[shape.page].shapes.push({...shape})
    acc[shape.page].timestamp=Math.max(acc[shape.page].timestamp,shape.timestamp)
    return acc
  },{})
  const shapeGroups=Object.values(shapesByPage).map((g:any)=>({...g,groupId:`shape-${g.page}`,shapes:[...g.shapes]}))
  return{bookmarks:marks.value.getBookmarks(),marks:[...marks.value.getAnnotations(filterColor.value as any),...inkGroups,...shapeGroups],notes:marks.value.getNotes(),deck:deckCards.value}
})
const list=computed(()=>{const kw=keyword.value.toLowerCase(),modeMap={bookmark:'bookmarks',mark:'marks',note:'notes',deck:'deck'},items=(data.value[modeMap[props.mode]]||[]).filter((item:any)=>!kw||(item.title||item.text||item.note||item.word||'').toLowerCase().includes(kw));return isReverse.value?[...items].reverse():items})
const emptyText=computed(()=>keyword.value?`未找到${placeholders[props.mode].replace(/搜索|\.\.\./g,'')}`:`暂无${placeholders[props.mode].replace(/搜索|\.\.\./g,'')}`)

// ===== 目录（foliate-js 原生 API）=====
let tocView:any=null
let relocateHandler:any=null

const initToc=async()=>{
  if(props.mode!=='toc'||!tocRef.value)return
  cleanupToc()
  
  const view=activeView.value
  // PDF 无大纲时自动切换到缩略图
  if(!view?.book?.toc||view.book.toc.length===0){
    if(isPdfMode.value)showThumbnail.value=true
    return
  }
  
  try{
    const{createTOCView}=await import('foliate-js/ui/tree.js')
    tocView=createTOCView(view.book.toc,goToLocation)
    tocRef.value.innerHTML=''
    tocRef.value.appendChild(tocView.element)
    if(view&&typeof view.addEventListener==='function'){
      relocateHandler=(e:any)=>tocView?.setCurrentHref?.(e.detail?.tocItem?.href)
      view.addEventListener('relocate',relocateHandler)
    }
    requestAnimationFrame(()=>{tocView?.setCurrentHref?.(view?.lastLocation?.tocItem?.href);addBookmarkButtons()})
  }catch(e){console.error('[TOC]',e)}
}

const cleanupToc=()=>{
  const view=activeView.value
  if(relocateHandler&&view&&typeof view.removeEventListener==='function'){
    view.removeEventListener('relocate',relocateHandler)
  }
  relocateHandler=null
  if(tocRef.value)tocRef.value.innerHTML=''
  tocView=null
}

// ===== 书签按钮 =====
const addBookmarkButtons=()=>{
  if(!tocRef.value||!marks.value)return
  const bookmarks=data.value.bookmarks
  tocRef.value.querySelectorAll('a[href]').forEach((link:Element)=>{
    const parent=link.parentElement
    if(!parent||parent.querySelector('.toc-bookmark-btn'))return
    const href=link.getAttribute('href')
    if(!href)return
    const label=link.textContent?.trim()||''
    const hasBookmark=bookmarks.some((b:any)=>b.title===label)
    const btn=document.createElement('button')
    btn.className='toc-bookmark-btn b3-tooltips b3-tooltips__w'
    btn.setAttribute('aria-label',hasBookmark?'移除书签':'添加书签')
    btn.innerHTML='<svg style="width:14px;height:14px"><use xlink:href="#iconBookmark"/></svg>'
    if(hasBookmark){btn.style.opacity='1';btn.classList.add('has-bookmark')}
    btn.onclick=e=>{e.stopPropagation();e.preventDefault();toggleBookmark(btn,href,label)}
    parent.appendChild(btn)
  })
}

const toggleBookmark=async(btn:HTMLButtonElement,href:string,label:string)=>{
  const view=activeView.value
  if(!marks.value||!view)return showMessage('书签功能未初始化',2000,'error')
  try{
    btn.style.transform='translateY(-50%) scale(1.3)'
    await view.goTo(href)
    await new Promise(resolve=>setTimeout(resolve,200))
    const added=marks.value.toggleBookmark(undefined,undefined,label)
    btn.classList.toggle('has-bookmark',added)
    btn.style.opacity=added?'1':'0'
    btn.setAttribute('aria-label',added?'移除书签':'添加书签')
    btn.style.transform=`translateY(-50%) scale(${added?1.2:0.8})`
    setTimeout(()=>btn.style.transform='translateY(-50%) scale(1)',150)
    showMessage(added?'已添加':'已删除',1500,'info')
  }catch(e:any){
    btn.style.transform='translateY(-50%) scale(1)'
    showMessage(e.message||'操作失败',2000,'error')
  }
}

// ===== 操作 =====
const getKey=(item:any)=>item.id||item.cfi||(item.page?`${item.page}`:`section-${item.section}`)
const isEditing=(item:any)=>editingId.value===getKey(item)
const showEditOptions=(item:any)=>item.type==='shape'||item.type==='highlight'||item.type==='note'||!item.type
const showMsg=(msg:string,type='info')=>showMessage(msg,type==='error'?3000:1500,type as any)
const removeBookmark=(item:any)=>{marks.value?.deleteBookmark?.(getKey(item));showMsg('已删除');refreshKey.value++}
const startEdit=(item:any)=>{editingId.value=getKey(item);editText.value=item.text||'';editNote.value=item.note||'';editColor.value=item.color||'yellow';editStyle.value=item.style||'highlight';editShapeType.value=item.shapeType||'rect';nextTick(()=>editNoteRef.value?.focus?.())}
const cancelEdit=()=>editingId.value=null
const saveEdit=async(item:any)=>{if(!marks.value)return showMsg('标记系统未初始化','error');if(item.type==='shape-group'||item.type==='ink-group')return showMsg('请编辑具体的标注项','error');try{const updates:any={color:editColor.value,note:editNote.value.trim()||undefined};if(item.type==='shape')updates.shapeType=editShapeType.value;else{updates.text=editText.value.trim();updates.style=editStyle.value}await marks.value.updateMark(item,updates);showMsg('已更新');editingId.value=null;refreshKey.value++}catch(e){console.error(e);showMsg('保存失败','error')}}
const deleteMark=async(item:any)=>{if(!marks.value)return showMsg('标记系统未初始化','error');try{if(item.type==='shape-group'){for(const s of item.shapes||[])await marks.value.deleteMark(s);showMsg('已删除');refreshKey.value++;return}if(item.type==='ink-group'){for(const i of item.inks||[])await marks.value.deleteMark(i);showMsg('已删除');refreshKey.value++;return}if(await marks.value.deleteMark(item)){showMsg('已删除');refreshKey.value++}}catch{showMsg('删除失败','error')}}

// 统一跳转 - 完全由jump.ts负责
const goTo=(item:any)=>jump(item,activeView.value,activeReader.value,marks.value)
const goToPage=(page:number)=>jump(page,activeView.value,activeReader.value,marks.value)
const goToDeckLocation=(item:any)=>item.page||item.cfi||item.section!==undefined?goTo(item):showMsg('未保存位置信息')
const preloadPage=(page:number)=>{const viewer=(activeView.value as any)?.viewer;if(viewer?.renderPage)viewer.renderPage(page)}
const toggleExpand=(item:any)=>{const id=item.groupId;expandedGroup.value=expandedGroup.value===id?null:id;if(expandedGroup.value){preloadPage(item.page);setTimeout(()=>{renderInkCanvas();renderShapeCanvas()},100)}}
const isExpanded=(item:any)=>expandedGroup.value===item.groupId
const removeDeckCard=async(id:string)=>{await removeFromDeck(id);showMsg('已删除')}
const toggleScroll=()=>contentRef.value?.scrollTo({top:contentRef.value.scrollTop<50?contentRef.value.scrollHeight:0,behavior:'smooth'})
const onScroll=(e:Event)=>isAtTop.value=(e.target as HTMLElement).scrollTop<50

// ===== Canvas渲染 =====
const inkCache=new Map(),shapeCache=shapePreviewCache
const drawShape=(c:HTMLCanvasElement,shape:any,retry=0,highRes=false)=>drawShapeUtil(c,shape,activeView.value,shapeCache,preloadPage,retry,highRes)
const copyMark=(item:any)=>copyMarkUtil(item,{
  bookUrl:(window as any).__currentBookUrl||'',
  isPdf:(activeView.value as any)?.isPdf||false,
  reader:activeReader.value,
  pdfViewer:(activeView.value as any)?.viewer,
  settings:activeView.value?.settings,
  shapeCache,
  showMsg
})
const renderInkCanvas=()=>nextTick(()=>renderInkUtil(list.value,inkCache,drawInk))
const renderShapeCanvas=()=>nextTick(()=>renderShapeUtil(list.value,activeView.value,shapeCache,preloadPage))
watch([list,expandedGroup],()=>{inkCache.clear();renderInkCanvas();renderShapeCanvas()},{immediate:true})

// ===== 缩略图懒加载 =====
let obs:IntersectionObserver
watch(showThumbnail,v=>v&&nextTick(()=>{
  obs?.disconnect()
  obs=new IntersectionObserver(es=>es.forEach(async e=>{
    if(e.isIntersecting){
      const p=+(e.target as HTMLElement).dataset.page!
      const getThumbnail=(activeView.value as any)?.getThumbnail
      if(getThumbnail&&!loadedThumbs.value[p])loadedThumbs.value[p]=await getThumbnail(p)
    }
  }),{root:contentRef.value,rootMargin:'200px'})
  thumbContainer.value?.querySelectorAll('.sr-thumb').forEach(el=>obs.observe(el))
}))

// ===== 生命周期 =====
const refresh=()=>{refreshKey.value++;props.mode==='deck'&&loadDeckCards().then(v=>deckCards.value=v)}
const handleSwitch=()=>{props.mode==='toc'?requestAnimationFrame(initToc):refresh()}
watch(()=>activeView.value?.book,book=>book?.toc&&props.mode==='toc'?requestAnimationFrame(initToc):cleanupToc(),{immediate:true})
watch(()=>props.mode,handleSwitch)
onMounted(()=>{['sireader:marks-updated','sireader:tab-switched'].forEach(e=>window.addEventListener(e,handleSwitch));props.mode==='deck'&&refresh()})
onUnmounted(()=>{cleanupToc();obs?.disconnect();['sireader:marks-updated','sireader:tab-switched'].forEach(e=>window.removeEventListener(e,handleSwitch))})
</script>

<style scoped lang="scss">
.sr-toc{display:flex;flex-direction:column;height:100%;overflow:hidden}
.dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
.menu-enter-active,.menu-leave-active{transition:all .2s cubic-bezier(.4,0,.2,1)}
.menu-enter-from{opacity:0;transform:translateY(-8px) scale(.95)}
.menu-leave-to{opacity:0;transform:translateY(-4px) scale(.98)}
.fade-enter-active,.fade-leave-active{transition:opacity .2s}
.fade-enter-from,.fade-leave-to{opacity:0}
.sr-content{flex:1;overflow-y:auto;padding:8px;min-height:0;
  :deep(ol){list-style:none;padding:0;margin:0}
  :deep(li){margin:0;position:relative}
  :deep(a),:deep(span[role="treeitem"]){display:block;padding:10px 48px 10px 12px;margin:2px 4px;color:var(--b3-theme-on-background);text-decoration:none;border-radius:6px;cursor:pointer;transition:all .25s cubic-bezier(.4,0,.2,1);border-left:3px solid transparent;
    &:hover{background:var(--b3-list-hover);transform:translateX(2px);box-shadow:0 1px 3px rgba(0,0,0,.06)}
    &[aria-current="page"]{background:linear-gradient(to right,rgba(25,118,210,.12),rgba(25,118,210,.02));border-left-color:var(--b3-theme-primary);border-left-width:4px;box-shadow:0 2px 8px rgba(25,118,210,.15);font-weight:600;color:var(--b3-theme-primary)}}
  :deep(svg){width:12px;height:12px;margin-right:6px;fill:currentColor;transition:transform .2s;cursor:pointer}
  :deep([aria-expanded="true"]>svg){transform:rotate(0deg)}
  :deep([aria-expanded="false"]>svg){transform:rotate(-90deg)}
  :deep([role="group"]){display:none}
  :deep([aria-expanded="true"]+[role="group"]){display:block}
  :deep(.toc-bookmark-btn){position:absolute;right:12px;top:50%;transform:translateY(-50%);width:26px;height:26px;padding:0;margin:0;border:none!important;background:transparent!important;outline:none!important;box-shadow:none!important;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:all .3s cubic-bezier(.4,0,.2,1);border-radius:50%;
    svg{width:14px;height:14px;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.1));color:var(--b3-theme-on-surface);transition:all .3s cubic-bezier(.4,0,.2,1)}
    &:hover{opacity:1!important;transform:translateY(-50%) scale(1.2) rotate(10deg);background:rgba(244,67,54,.15)!important}
    &:active{transform:translateY(-50%) scale(.9) rotate(-5deg)}
    &.has-bookmark{opacity:1!important;background:rgba(244,67,54,.08)!important;
      svg{color:var(--b3-theme-error)}
      &:hover{background:rgba(244,67,54,.18)!important}}}
  :deep(li:hover .toc-bookmark-btn){opacity:.5!important}}
.sr-list{padding:8px}
.sr-deck-card{padding:10px 12px;margin-bottom:8px;background:var(--b3-theme-surface);border-radius:4px;border:1px solid var(--b3-border-color);cursor:pointer;transition:background .15s;&:hover{background:var(--b3-theme-surface-light);.sr-deck-btns{opacity:1}}}
.sr-deck-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.sr-word{flex:1;font-size:16px;font-weight:600;color:var(--b3-theme-primary)}
.sr-deck-btns{display:flex;gap:4px;opacity:0;transition:opacity .15s;button{width:20px;height:20px;padding:0;border:none;background:none;cursor:pointer;color:var(--b3-theme-on-surface-variant);transition:color .15s;svg{width:14px;height:14px}&:hover{color:var(--b3-theme-primary)}&:active{transform:scale(.9)}}}
.sr-deck-meta{display:flex;align-items:center;gap:8px;font-size:12px;opacity:.7}
.sr-deck-dict{padding:2px 8px;background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary);border-radius:4px}
.sr-deck-time{color:var(--b3-theme-on-surface-variant)}
.sr-deck-content{margin-top:12px;max-height:500px;overflow-y:auto;
  :deep(.dict-card){padding:16px;box-shadow:none}
  :deep(.dict-word){font-size:22px}
  :deep(.dict-card-header){margin-bottom:12px}
  :deep(.dict-badges){margin-bottom:16px}
  :deep(.dict-meaning){padding:10px}
  :deep(.dict-def){padding:10px}
  :deep(.dict-example){padding:10px}
  :deep(.b3-button){display:none}}
.expand-enter-active,.expand-leave-active{transition:all .3s ease}
.expand-enter-from,.expand-leave-to{max-height:0;opacity:0;margin-top:0;padding-top:0;padding-bottom:0}
.expand-enter-to,.expand-leave-from{max-height:400px;opacity:1}
// 书签项复用目录链接样式
.sr-bookmark-item{display:block;padding:10px 48px 10px 12px;margin:2px 4px;color:var(--b3-theme-on-background);border-radius:6px;cursor:pointer;transition:all .25s cubic-bezier(.4,0,.2,1);border-left:3px solid transparent;position:relative;
  &:hover{background:var(--b3-list-hover);transform:translateX(2px);box-shadow:0 1px 3px rgba(0,0,0,.06);.sr-action-btn{opacity:.5}}}
// 统一操作按钮样式（书签删除、目录书签）
.sr-action-btn{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:26px;height:26px;padding:0;margin:0;border:none!important;background:transparent!important;outline:none!important;box-shadow:none!important;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:all .3s cubic-bezier(.4,0,.2,1);border-radius:50%;
  svg{width:14px;height:14px;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.1));color:var(--b3-theme-error)}
  &:hover{opacity:1!important;transform:translateY(-50%) scale(1.2) rotate(-10deg);background:rgba(244,67,54,.15)!important}
  &:active{transform:translateY(-50%) scale(.9)}}

// 统一标注卡片样式
.sr-card{position:relative;padding:12px;margin-bottom:8px;background:var(--b3-theme-surface);border-radius:4px;border:1px solid var(--b3-border-color);transition:background .15s;cursor:pointer;
  &:hover{background:var(--b3-theme-surface-light);.sr-btns,.sr-expand-btn{opacity:1}}}
.sr-card-edit{cursor:default;.sr-main{cursor:default}}
.sr-bar{position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:4px 0 0 4px}
.sr-main{padding-left:8px}
.sr-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.sr-title{flex:1;font-size:14px;font-weight:500;color:var(--b3-theme-on-surface);line-height:1.4;outline:none;&[contenteditable]{padding:4px;border-radius:4px;&:focus{background:var(--b3-theme-background-light)}}}
.sr-meta,.sr-time{font-size:12px;color:var(--b3-theme-on-surface-variant);white-space:nowrap}
.sr-note{font-size:12px;color:var(--b3-theme-on-surface-variant);line-height:1.5;margin-top:4px}
.sr-note-input{width:100%;min-height:60px;padding:8px;margin-top:8px;border:1px solid var(--b3-border-color);border-radius:4px;background:var(--b3-theme-background);resize:vertical;font-size:12px;line-height:1.5;outline:none;&:focus{border-color:var(--b3-theme-primary)}}
.sr-options{margin-top:8px;.sr-colors{display:flex;gap:6px;margin-bottom:8px}.sr-color-btn{width:28px;height:28px;border:2px solid transparent;border-radius:50%;cursor:pointer;transition:all .15s;padding:0;&.active{border-color:var(--b3-theme-on-surface);transform:scale(1.1);box-shadow:0 2px 8px rgba(0,0,0,.2)}&:hover{transform:scale(1.05)}}.sr-styles{display:flex;gap:4px}.sr-style-btn{width:36px;height:32px;display:flex;align-items:center;justify-content:center;border:1px solid var(--b3-border-color);background:transparent;border-radius:4px;cursor:pointer;transition:all .15s;color:var(--b3-theme-on-surface);&.active{background:var(--b3-theme-primary-lightest);border-color:var(--b3-theme-primary);color:var(--b3-theme-primary)}&:hover{background:var(--b3-list-hover)}}}
.sr-actions{display:flex;gap:8px;margin-top:8px;button{flex:1;padding:8px 16px;border:none;border-radius:4px;cursor:pointer;transition:all .15s;font-size:13px;font-weight:500}&.sr-btn-primary{background:var(--b3-theme-primary);color:white;&:hover{background:var(--b3-theme-primary-light)}&:active{background:var(--b3-theme-primary-dark)}}&.sr-btn-secondary{background:var(--b3-theme-background);color:var(--b3-theme-on-surface);border:1px solid var(--b3-border-color);&:hover{background:var(--b3-list-hover)}}}
.sr-btn-primary{background:var(--b3-theme-primary);color:white;&:hover{background:var(--b3-theme-primary-light)}&:active{background:var(--b3-theme-primary-dark)}}
.sr-btn-secondary{background:var(--b3-theme-background);color:var(--b3-theme-on-surface);border:1px solid var(--b3-border-color);&:hover{background:var(--b3-list-hover)}}
// 统一按钮样式
.sr-btns{position:absolute;right:4px;top:50%;transform:translateY(-50%);display:flex;gap:4px;opacity:0;transition:opacity .2s;z-index:10;
  button{width:20px;height:20px;padding:0;border:none;background:transparent;cursor:pointer;transition:all .2s;border-radius:50%;pointer-events:auto;
    svg{width:12px;height:12px;color:var(--b3-theme-on-surface-variant);pointer-events:none}
    &:hover{background:rgba(0,0,0,.05);transform:scale(1.1);svg{color:var(--b3-theme-on-surface)}}
    &:last-child svg{color:var(--b3-theme-error)}
    &:last-child:hover{background:rgba(244,67,54,.15)}}}
.sr-expand-btn{position:absolute;right:8px;top:8px;width:24px;height:24px;padding:0;border:none!important;background:transparent!important;outline:none!important;box-shadow:none!important;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;opacity:.4;transition:all .2s;border-radius:50%;
  svg{width:14px;height:14px;color:var(--b3-theme-on-surface)}
  &:hover{opacity:1!important;transform:scale(1.15);background:rgba(0,0,0,.05)!important}}
.sr-sub-list{margin-top:8px;padding-top:8px;border-top:1px solid var(--b3-border-color)}
.sr-sub-item{position:relative;padding:8px;margin:4px 0;border-radius:4px;cursor:pointer;transition:background .15s;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);
  &:hover{background:var(--b3-theme-background-light);.sr-btns{opacity:1}}}
.sr-preview{width:100%;height:auto;border-radius:4px;background:var(--b3-theme-background);display:block;opacity:.85}
.sr-group-preview{height:80px;margin:6px 0}


</style>