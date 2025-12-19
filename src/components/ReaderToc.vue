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
          <div v-else v-for="(item,i) in list" :key="item.id||item.page||i" class="sr-card" :class="{'sr-card-ink':item.type==='ink-group'||item.type==='shape-group'}">
            <span class="sr-bar" :style="{background:item.type==='ink-group'?'#ff9800':item.type==='shape-group'?'#2196f3':(colors[editingId===item.id?editColor:item.color]||'var(--b3-theme-primary)')}"></span>
            <div class="sr-main" @click="item.type==='ink-group'?goToPage(item.page):(editingId===item.id?null:goTo(item))">
              <!-- 墨迹组 -->
              <template v-if="item.type==='ink-group'">
                <div class="sr-head">
                  <div class="sr-title">✏️ 墨迹标注 · 第{{ item.page }}页 ({{ item.inks.length }})</div>
                  <button @click.stop="expandedInk=expandedInk===item.page?null:item.page" class="sr-expand-btn b3-tooltips b3-tooltips__nw" :aria-label="expandedInk===item.page?'收起':'展开'">
                    <svg><use :xlink:href="expandedInk===item.page?'#iconUp':'#iconDown'"/></svg>
                  </button>
                </div>
                <canvas :data-page="item.page" class="sr-preview sr-group-preview" width="240" height="80"></canvas>
                <Transition name="expand">
                  <div v-if="expandedInk===item.page" class="sr-sub-list">
                    <div v-for="ink in item.inks" :key="ink.id" class="sr-sub-item" @click.stop="goTo(ink)">
                      <canvas :data-ink-id="ink.id" class="sr-preview" width="240" height="40"></canvas>
                      <button @click.stop="deleteMark(ink)" class="sr-del-btn b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.delete||'删除'"><svg><use xlink:href="#iconTrashcan"/></svg></button>
                    </div>
                  </div>
                </Transition>
              </template>
              <!-- 形状组 -->
              <template v-else-if="item.type==='shape-group'">
                <div class="sr-head">
                  <div class="sr-title">🔷 形状标注 · 第{{ item.page }}页 ({{ item.shapes.length }})</div>
                  <button @click.stop="expandedShape===item.page?expandedShape=null:expandShape(item.page)" class="sr-expand-btn b3-tooltips b3-tooltips__nw" :aria-label="expandedShape===item.page?'收起':'展开'">
                    <svg><use :xlink:href="expandedShape===item.page?'#iconUp':'#iconDown'"/></svg>
                  </button>
                </div>
                <div v-for="shape in item.shapes" :key="shape.id" class="sr-shape-item">
                  <div class="sr-shape-head">
                    <div v-if="shape.note" class="sr-note" @click.stop="goTo(shape)">{{ shape.note }}</div>
                    <div class="sr-shape-btns">
                      <button @click.stop="copyMark(shape)" class="sr-shape-btn b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.copy||'复制'"><svg><use xlink:href="#iconCopy"/></svg></button>
                      <button @click.stop="deleteMark(shape)" class="sr-shape-btn b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.delete||'删除'"><svg><use xlink:href="#iconTrashcan"/></svg></button>
                    </div>
                  </div>
                  <Transition name="expand">
                    <canvas v-if="expandedShape===item.page" :data-shape-id="shape.id" class="sr-preview"></canvas>
                  </Transition>
                </div>
              </template>
              <!-- 普通标注 -->
              <template v-else-if="editingId!==item.id">
                <div class="sr-head">
                  <div class="sr-title">{{ item.text||'无内容' }}</div>
                  <div class="sr-time">{{ formatTime(item.timestamp||Date.now()) }}</div>
                </div>
                <div v-if="item.note" class="sr-note">{{ item.note }}</div>
                <div class="sr-btns">
                  <button @click.stop="copyMark(item)" class="b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.copy||'复制'"><svg><use xlink:href="#iconCopy"/></svg></button>
                  <button @click.stop="startEdit(item)" class="b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.edit||'编辑'"><svg><use xlink:href="#iconEdit"/></svg></button>
                  <button @click.stop="deleteMark(item)" class="b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.delete||'删除'"><svg><use xlink:href="#iconTrashcan"/></svg></button>
                </div>
              </template>
              <!-- 编辑模式 -->
              <template v-else>
                <div class="sr-title" contenteditable @blur="e=>editText=e.target.textContent" v-html="editText"></div>
                <textarea ref="editNoteRef" v-model="editNote" placeholder="添加笔记..." class="sr-note-input"/>
                <div class="sr-options">
                  <div class="sr-colors">
                    <button v-for="c in COLORS" :key="c.color" class="sr-color-btn" :class="{active:editColor===c.color}" :style="{background:c.bg}" @click.stop="editColor=c.color"/>
                  </div>
                  <div class="sr-styles">
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
import { useReaderState } from '@/core/foliate'
import { showMessage, Dialog } from 'siyuan'
import { loadDeckCards, getDeckCards, removeFromDeck, renderDictCard, getDictName } from '@/core/dictionary'
import { COLORS, STYLES, getColorMap } from '@/core/foliate/mark'

const props = withDefaults(defineProps<{ mode: 'toc'|'bookmark'|'mark'|'note'|'deck'; i18n?: any }>(), { i18n: () => ({}) })
const emit = defineEmits(['update:mode'])
const { activeView, activeReaderInstance, goToLocation } = useReaderState()

// ===== 状态 =====
const tocRef=ref<HTMLElement>(),contentRef=ref<HTMLElement>(),editNoteRef=ref<HTMLTextAreaElement>(),thumbContainer=ref<HTMLElement>()
const keyword=ref(''),filterColor=ref(''),showColorMenu=ref(false),showThumbnail=ref(false)
const isReverse=ref(false),isAtTop=ref(true),refreshKey=ref(0)
const deckCards=ref<any[]>([]),expandedDeck=ref<string|null>(null),expandedInk=ref<number|null>(null),expandedShape=ref<number|null>(null)
const editingId=ref<string|null>(null),editText=ref(''),editNote=ref(''),editColor=ref('yellow')
const editStyle=ref<'highlight'|'underline'|'outline'|'squiggly'>('highlight')
const loadedThumbs=ref<Record<number,string>>({})
const shapePreviewCache=new Map<string,string>()

// ===== 常量 =====
const colors=getColorMap()
const placeholders={toc:'搜索目录...',bookmark:'搜索书签...',mark:'搜索标注...',note:'搜索笔记...',deck:'搜索卡包...'}

// ===== Computed =====
const colorMenu=computed(()=>[{label:'全部',value:'',active:!filterColor.value},...Object.entries(colors).map(([k,v])=>({label:k,value:k,color:v,active:filterColor.value===k}))])
const marks=computed(()=>activeReaderInstance.value?.marks||(activeView.value as any)?.marks)
const isPdfMode=computed(()=>(activeView.value as any)?.isPdf||false)
const pageCount=computed(()=>(activeView.value as any)?.pageCount||0)
const data=computed(()=>{
  refreshKey.value
  if(!marks.value)return{bookmarks:[],marks:[],notes:[],deck:[],inks:[],shapes:[]}
  const inks=marks.value.getInkAnnotations?.()||[]
  const inksByPage=inks.reduce((acc:any,ink:any)=>{
    if(!acc[ink.page])acc[ink.page]={page:ink.page,type:'ink-group',inks:[],timestamp:ink.timestamp,text:`墨迹标注 - 第${ink.page}页`}
    acc[ink.page].inks.push(ink)
    acc[ink.page].timestamp=Math.max(acc[ink.page].timestamp,ink.timestamp)
    return acc
  },{})
  const inkGroups=Object.values(inksByPage)
  const shapes=marks.value.getShapeAnnotations?.()||[]
  const shapesByPage=shapes.reduce((acc:any,shape:any)=>{
    if(!acc[shape.page])acc[shape.page]={page:shape.page,type:'shape-group',shapes:[],timestamp:shape.timestamp,text:`形状标注 - 第${shape.page}页`}
    acc[shape.page].shapes.push(shape)
    acc[shape.page].timestamp=Math.max(acc[shape.page].timestamp,shape.timestamp)
    return acc
  },{})
  const shapeGroups=Object.values(shapesByPage)
  return{bookmarks:marks.value.getBookmarks(),marks:[...marks.value.getAnnotations(filterColor.value as any),...inkGroups,...shapeGroups],notes:marks.value.getNotes(),deck:deckCards.value,inks,shapes}
})
const list=computed(()=>{const kw=keyword.value.toLowerCase(),modeMap={bookmark:'bookmarks',mark:'marks',note:'notes',deck:'deck'},items=(data.value[modeMap[props.mode]]||[]).filter((item:any)=>!kw||(item.title||item.text||item.note||item.word||'').toLowerCase().includes(kw));return isReverse.value?[...items].reverse():items})
const emptyText=computed(()=>keyword.value?`未找到${placeholders[props.mode].replace(/搜索|\.\.\./g,'')}`:`暂无${placeholders[props.mode].replace(/搜索|\.\.\./g,'')}`)

// ===== 目录（foliate-js 原生 API）=====
let tocView:any=null
let relocateHandler:any=null

const initToc=async()=>{
  if(props.mode!=='toc'||!tocRef.value||!activeView.value?.book?.toc)return
  cleanupToc()
  try{
    const{createTOCView}=await import('foliate-js/ui/tree.js')
    tocView=createTOCView(activeView.value.book.toc,goToLocation)
    tocRef.value.innerHTML=''
    tocRef.value.appendChild(tocView.element)
    if(activeView.value&&typeof activeView.value.addEventListener==='function'){
      relocateHandler=(e:any)=>tocView?.setCurrentHref?.(e.detail?.tocItem?.href)
      activeView.value.addEventListener('relocate',relocateHandler)
    }
    requestAnimationFrame(()=>{tocView?.setCurrentHref?.(activeView.value?.lastLocation?.tocItem?.href);addBookmarkButtons()})
  }catch(e){console.error('[TOC]',e)}
}

const cleanupToc=()=>{
  if(relocateHandler&&activeView.value&&typeof activeView.value.removeEventListener==='function'){
    activeView.value.removeEventListener('relocate',relocateHandler)
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
  if(!marks.value||!activeView.value)return showMessage('书签功能未初始化',2000,'error')
  try{
    btn.style.transform='translateY(-50%) scale(1.3)'
    await activeView.value.goTo(href)
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
const showMsg=(msg:string,type='info')=>showMessage(msg,type==='error'?3000:1500,type as any)
const removeBookmark=(item:any)=>{marks.value?.deleteBookmark?.(getKey(item));showMsg('已删除');refreshKey.value++}
const startEdit=(item:any)=>{editingId.value=getKey(item);editText.value=item.text||'';editNote.value=item.note||'';editColor.value=item.color||'yellow';editStyle.value=item.style||'highlight';nextTick(()=>editNoteRef.value?.focus?.())}
const cancelEdit=()=>editingId.value=null
const saveEdit=async(item:any)=>{if(!marks.value)return showMsg('标记系统未初始化','error');try{await marks.value.updateMark(getKey(item),{text:editText.value.trim(),color:editColor.value as any,style:editStyle.value,note:editNote.value.trim()||undefined});showMsg('已更新');editingId.value=null;refreshKey.value++}catch{showMsg('保存失败','error')}}
const deleteMark=async(item:any)=>{if(!marks.value)return showMsg('标记系统未初始化','error');try{const result=item.type==='ink'?await marks.value.deleteInk?.(item.id):await marks.value.deleteMark(getKey(item));if(result){showMsg('已删除');refreshKey.value++}}catch{showMsg('删除失败','error')}}
const goTo=(item:any)=>{
  const isPdf=(activeView.value as any)?.isPdf
  if(isPdf&&item.page)return goToPage(item.page)
  if(marks.value?.goTo)return marks.value.goTo(item)
  if(isPdf&&activeView.value?.goTo)return activeView.value.goTo(item.page||item)
  if(item.cfi)return goToLocation(item.cfi)
  if(item.section!==undefined)return activeView.value?.goTo(item.section)
}
const goToPage=(page:number)=>(activeView.value as any)?.viewer?.goToPage(page)
const preloadPage=(page:number)=>{const viewer=(activeView.value as any)?.viewer;if(viewer?.renderPage)viewer.renderPage(page)}
const expandShape=(page:number)=>{expandedShape.value=page;preloadPage(page);setTimeout(renderShapeCanvas,100)}
const formatTime=(ts:number)=>{const d=new Date(ts);return`${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`}
const copyMark=async(item:any)=>{
  const copy=(text:string,msg='已复制')=>navigator.clipboard.writeText(text).then(()=>showMsg(msg))
  const reader=activeReaderInstance.value,book=reader?.getBook()
  const bookUrl=(window as any).__currentBookUrl||''
  if(!bookUrl||bookUrl.startsWith('file://')){copy(item.text||item.note||'','本地文件仅复制文本');return}
  const isPdf=(activeView.value as any)?.isPdf,page=item.page||(item.section!==undefined?(activeView.value as any)?.viewer?.getCurrentPage():null)
  const cfi=item.cfi||(isPdf&&page?`#page-${page}`:'')
  if(!cfi){copy(item.text||item.note||'','仅复制文本');return}
  const{formatBookLink}=await import('@/composables/useSetting')
  const formatAuthor=a=>Array.isArray(a)?a.map(c=>typeof c==='string'?c:c?.name).filter(Boolean).join(', '):typeof a==='string'?a:a?.name||''
  const chapter=(()=>{
    if(item.cfi){const loc=reader?.getLocation();return loc?.tocItem?.label||loc?.tocItem?.title||''}
    if(isPdf&&page){const toc=book?.toc||[];for(let i=toc.length-1;i>=0;i--)if(toc[i].pageNumber&&toc[i].pageNumber<=page)return toc[i].label}
    return''
  })()||'📒'
  const tpl=activeView.value?.settings?.linkFormat||'> [!NOTE] 📑 书名\n> [章节](链接) 文本\n> 截图\n> 笔记'
  let img=''
  if(item.shapeType){
    const hdKey=`${item.id}_hd`
    if(!shapeCache.has(hdKey)){preloadPage(page);await new Promise(r=>setTimeout(r,300));const c=document.createElement('canvas');drawShape(c,item,0,true);await new Promise(r=>setTimeout(r,100))}
    if(shapeCache.has(hdKey)){
      const base64=shapeCache.get(hdKey)!
      const blob=await fetch(base64).then(r=>r.blob())
      const file=new File([blob],`shape_${item.id}.png`,{type:'image/png'})
      const{upload}=await import('@/api')
      const res=await upload('/assets/',[file])
      img=res.succMap?.[file.name]?`![](${res.succMap[file.name]})`:''
    }
  }
  const link=formatBookLink(bookUrl,book?.metadata?.title||'',formatAuthor(book?.metadata?.author),chapter,cfi,item.text||'',tpl,item.note||'',img)
  copy(link)
}

const goToDeckLocation=(item:any)=>item.cfi||item.section!==undefined?(item.cfi?goToLocation(item.cfi):activeView.value?.goTo(item.section)):showMsg('未保存位置信息')
const removeDeckCard=async(id:string)=>{await removeFromDeck(id);showMsg('已删除')}
const toggleScroll=()=>contentRef.value?.scrollTo({top:contentRef.value.scrollTop<50?contentRef.value.scrollHeight:0,behavior:'smooth'})
const onScroll=(e:Event)=>isAtTop.value=(e.target as HTMLElement).scrollTop<50

// ===== Canvas渲染 =====
const inkCache=new Map(),shapeCache=shapePreviewCache
const drawCanvas=(c:HTMLCanvasElement,draw:()=>void)=>{const ctx=c.getContext('2d');if(ctx){ctx.clearRect(0,0,c.width,c.height);draw()}}
const drawInk=(c:HTMLCanvasElement,paths:any[],rect:any)=>drawCanvas(c,()=>{
  const ctx=c.getContext('2d')!,[x1,y1,x2,y2]=rect,w=x2-x1,h=y2-y1,s=Math.min(c.width/(w+10),c.height/(h+10)),ox=(c.width-w*s)/2-x1*s,oy=(c.height-h*s)/2-y1*s
  ctx.lineCap=ctx.lineJoin='round'
  paths.forEach(p=>{if(p.points.length<2)return;ctx.strokeStyle=p.color;ctx.globalAlpha=p.opacity;ctx.lineWidth=p.width*s;ctx.beginPath();ctx.moveTo(p.points[0].x*s+ox,p.points[0].y*s+oy);p.points.forEach(pt=>ctx.lineTo(pt.x*s+ox,pt.y*s+oy));ctx.stroke()})
})
const drawShape=(c:HTMLCanvasElement,shape:any,retry=0,highRes=false)=>{
  if(!shape)return
  const ctx=c.getContext('2d')!
  const cacheKey=highRes?`${shape.id}_hd`:shape.id
  if(shapeCache.has(cacheKey)){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,c.width,c.height);img.src=shapeCache.get(cacheKey)!;return}
  const[x1,y1,x2,y2]=shape.rect,w=Math.abs(x2-x1),h=Math.abs(y2-y1)
  if(w<10||h<10)return
  const maxW=highRes?1200:240,scale=maxW/w;c.width=maxW;c.height=h*scale
  const pageEl=document.querySelector(`[data-page="${shape.page}"]`)
  const pdfCanvas=pageEl&&(Array.from(pageEl.querySelectorAll('canvas')).find(c=>!c.className)||pageEl.querySelector('canvas'))as HTMLCanvasElement
  if(!pdfCanvas){if(retry<3){preloadPage(shape.page);setTimeout(()=>drawShape(c,shape,retry+1,highRes),200)}return}
  const dpr=pdfCanvas.width/(parseFloat(pdfCanvas.style.width)||pdfCanvas.width)
  ctx.drawImage(pdfCanvas,Math.min(x1,x2)*dpr,Math.min(y1,y2)*dpr,w*dpr,h*dpr,0,0,c.width,c.height)
  ctx.strokeStyle=shape.color||'#ff0000';ctx.lineWidth=Math.max(highRes?4:2,shape.width||2);ctx.globalAlpha=shape.opacity||0.8;ctx.beginPath()
  if(shape.shapeType==='circle')ctx.arc(c.width/2,c.height/2,Math.min(c.width,c.height)/2,0,Math.PI*2)
  else if(shape.shapeType==='triangle'){ctx.moveTo(c.width/2,0);ctx.lineTo(c.width,c.height);ctx.lineTo(0,c.height);ctx.closePath()}
  else ctx.rect(0,0,c.width,c.height)
  ctx.stroke();shapeCache.set(cacheKey,c.toDataURL('image/png'))
}

const renderInkCanvas=()=>nextTick(()=>{
  document.querySelectorAll('[data-page].sr-group-preview').forEach(el=>{
    const c=el as HTMLCanvasElement,p=+(c.dataset.page||0),k=`g${p}`
    if(inkCache.has(k))return
    const g=list.value.find((i:any)=>i.type==='ink-group'&&i.page===p)
    if(!g?.inks)return
    let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity,paths:any[]=[]
    g.inks.forEach((ink:any)=>{const[a,b,c,d]=ink.rect||[0,0,0,0];x1=Math.min(x1,a);y1=Math.min(y1,b);x2=Math.max(x2,c);y2=Math.max(y2,d);paths.push(...ink.paths)})
    drawInk(c,paths,[x1,y1,x2,y2]);inkCache.set(k,1)
  })
  document.querySelectorAll('[data-ink-id]').forEach(el=>{
    const c=el as HTMLCanvasElement,id=c.dataset.inkId
    if(!id||inkCache.has(id))return
    const ink=data.value.inks.find((i:any)=>i.id===id)
    if(ink){drawInk(c,ink.paths,ink.rect);inkCache.set(id,1)}
  })
})
const renderShapeCanvas=()=>nextTick(()=>document.querySelectorAll('[data-shape-id]').forEach(el=>drawShape(el as HTMLCanvasElement,data.value.shapes.find((s:any)=>s.id===(el as HTMLCanvasElement).dataset.shapeId))))
watch([list,expandedInk],()=>{inkCache.clear();renderInkCanvas()},{immediate:true})
watch(expandedShape,v=>v!==null&&renderShapeCanvas())

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
const refresh=async()=>{refreshKey.value++;props.mode==='deck'&&(deckCards.value=await loadDeckCards())}
watch(()=>activeView.value?.book,book=>book?.toc&&props.mode==='toc'?requestAnimationFrame(initToc):cleanupToc(),{immediate:true})
watch(()=>props.mode,()=>props.mode==='toc'?requestAnimationFrame(initToc):props.mode==='deck'&&loadDeckCards().then(v=>deckCards.value=v))
onMounted(()=>{window.addEventListener('sireader:marks-updated',refresh);props.mode==='deck'&&loadDeckCards().then(v=>deckCards.value=v)})
onUnmounted(()=>{cleanupToc();obs?.disconnect();window.removeEventListener('sireader:marks-updated',refresh)})
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

// 墨迹标注和形状标注组（统一样式）
.sr-card-ink{position:relative;
  .sr-main{cursor:pointer;&:hover{background:var(--b3-list-hover);border-radius:4px}}
  .sr-title{font-style:italic;opacity:.9}
  &:hover .sr-expand-btn{opacity:.6}}
.sr-expand-btn{position:absolute;right:8px;top:8px;width:24px;height:24px;padding:0;border:none!important;background:transparent!important;outline:none!important;box-shadow:none!important;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:all .2s;border-radius:50%;
  svg{width:14px;height:14px;color:var(--b3-theme-on-surface)}
  &:hover{opacity:1!important;transform:scale(1.15);background:rgba(0,0,0,.05)!important}}
.sr-sub-list{margin-top:8px;padding-top:8px;border-top:1px solid var(--b3-border-color)}
.sr-sub-item{position:relative;padding:8px;margin:4px 0;border-radius:4px;cursor:pointer;transition:background .15s;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);
  &:hover{background:var(--b3-theme-background-light);.sr-del-btn{opacity:.6}}}
.sr-preview{width:100%;height:auto;border-radius:4px;background:var(--b3-theme-background);display:block;opacity:.85}
.sr-group-preview{height:80px;margin:6px 0}
.sr-shape-item{position:relative;margin:4px 0}
.sr-shape-head{display:flex;align-items:center;gap:8px;
  .sr-note{flex:1;margin:0}
  &:hover .sr-shape-btns{opacity:1}}
.sr-shape-btns{display:flex;gap:4px;opacity:0;transition:opacity .2s}
.sr-shape-btn{width:20px;height:20px;padding:0;border:none;background:transparent;cursor:pointer;transition:all .2s;border-radius:50%;
  svg{width:12px;height:12px;color:var(--b3-theme-on-surface)}
  &:hover{background:rgba(0,0,0,.05);transform:scale(1.1)}}
.sr-text{font-size:13px;font-weight:500;color:var(--b3-theme-on-surface)}
.sr-note{font-size:12px;color:var(--b3-theme-on-surface-variant);line-height:1.5;margin-top:4px;cursor:pointer}
.sr-del-btn{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:20px;height:20px;padding:0;border:none;background:transparent;cursor:pointer;opacity:0;transition:all .2s;border-radius:50%;
  svg{width:12px;height:12px;color:var(--b3-theme-error)}
  &:hover{opacity:1!important;background:rgba(244,67,54,.15);transform:translateY(-50%) scale(1.1)}}

</style>