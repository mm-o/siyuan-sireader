<template>
  <div class="sr-toc">
    <!-- 工具栏 -->
    <div class="sr-toolbar">
      <input v-model="keyword" :placeholder="placeholders[mode]" v-motion-fade>
      <div v-if="mode==='mark'" class="sr-select">
        <button class="b3-tooltips b3-tooltips__sw" @click="showColorMenu=!showColorMenu" :aria-label="filterColor||'全部'" v-motion-pop :delay="50">
          <svg><use xlink:href="#lucide-palette"/></svg>
        </button>
        <Transition name="menu">
          <div v-if="showColorMenu" class="sr-menu" @click="showColorMenu=false">
            <div v-for="(c,i) in colorMenu" :key="i" v-motion-pop :delay="i*20"
                 :class="['sr-menu-item',{active:c.active}]" @click="filterColor=c.value">
              <span v-if="c.color" class="dot" :style="{background:c.color}"></span>{{ c.label }}
            </div>
          </div>
        </Transition>
      </div>
      <button class="b3-tooltips b3-tooltips__sw" @click="isReverse=!isReverse" :aria-label="isReverse?'倒序':'正序'" v-motion-pop :delay="100">
        <svg><use :xlink:href="isReverse?'#lucide-arrow-up-1-0':'#lucide-arrow-down-0-1'"/></svg>
      </button>
      <button class="b3-tooltips b3-tooltips__sw" @click="toggleScroll" :aria-label="isAtTop?'底部':'顶部'" v-motion-pop :delay="150">
        <svg><use :xlink:href="isAtTop?'#lucide-panel-top-open':'#lucide-panel-top-close'"/></svg>
      </button>
    </div>

    <!-- 内容区 -->
    <div ref="contentRef" class="sr-content" @scroll="onScroll">
      <Transition name="fade" mode="out-in">
        <!-- 目录 -->
        <div v-if="mode==='toc'" key="toc" ref="tocRef"></div>
        
        <!-- 书签 -->
        <div v-else-if="mode==='bookmark'" key="bookmark" class="sr-list">
          <div v-if="!list.length" class="sr-empty">{{ emptyText }}</div>
          <div v-else v-for="(item,i) in list" :key="item.id||i" v-motion-slide-visible-once-bottom :delay="i*30"
               class="sr-item" @click="goTo(item)">
            <span class="sr-text">{{ item.title||'无标题' }}</span>
            <button class="sr-remove-btn b3-tooltips b3-tooltips__nw" aria-label="删除书签" @click.stop="removeBookmark(item)">
              <svg style="width:14px;height:14px"><use xlink:href="#iconTrashcan"/></svg>
            </button>
          </div>
        </div>
        
        <!-- 标注 -->
        <div v-else-if="mode==='mark'" key="mark" class="sr-list">
          <div v-if="!list.length" class="sr-empty">{{ emptyText }}</div>
          <div v-else v-for="(item,i) in list" :key="item.id||i" v-motion-slide-visible-once-bottom :delay="i*30"
               class="sr-item" @click="goTo(item)">
            <div class="sr-item-content">
              <div class="sr-text" :class="`sr-style-${item.style||'highlight'}`" :style="{['--mark-color']:colors[item.color]||'var(--b3-theme-primary)'}">{{ item.text||'无内容' }}</div>
              <div v-if="item.note" class="sr-note">{{ item.note }}</div>
            </div>
            <div class="sr-item-actions">
              <button class="sr-action-btn b3-tooltips b3-tooltips__nw" @click.stop="editMark(item,$event)" :aria-label="props.i18n?.edit||'编辑'"><svg><use xlink:href="#iconEdit"/></svg></button>
              <button class="sr-action-btn b3-tooltips b3-tooltips__nw" @click.stop="deleteMark(item)" :aria-label="props.i18n?.delete||'删除'"><svg><use xlink:href="#iconTrashcan"/></svg></button>
            </div>
          </div>
        </div>
        
        <!-- 笔记 -->
        <div v-else-if="mode==='note'" key="note" class="sr-list">
          <div v-if="!list.length" class="sr-empty">{{ emptyText }}</div>
          <div v-else v-for="(item,i) in list" :key="item.id||i" v-motion-slide-visible-once-bottom :delay="i*30"
               class="sr-item" @click="goTo(item)">
            <div class="sr-item-content">
              <div class="sr-text" :class="`sr-style-${item.style||'outline'}`" :style="{['--mark-color']:colors[item.color]||'var(--b3-theme-primary)'}">{{ item.text||'无内容' }}</div>
              <div class="sr-note">{{ item.note }}</div>
            </div>
            <div class="sr-item-actions">
              <button class="sr-action-btn" @click.stop="editMark(item,$event)" :aria-label="props.i18n?.edit||'编辑'"><svg><use xlink:href="#iconEdit"/></svg></button>
              <button class="sr-action-btn" @click.stop="deleteMark(item)" :aria-label="props.i18n?.delete||'删除'"><svg><use xlink:href="#iconTrashcan"/></svg></button>
            </div>
          </div>
        </div>
        
        <!-- 卡包 -->
        <div v-else-if="mode==='deck'" key="deck" class="sr-list">
          <div v-if="!list.length" class="sr-empty">{{ emptyText }}</div>
          <div v-else v-for="(item,i) in list" :key="item.id||i" v-motion-slide-visible-once-bottom :delay="i*30" class="sr-item deck-card">
            <div class="sr-item-content" @click="toggleDeckExpand(item.id)">
              <div class="sr-word">{{ item.word }}</div>
              <div class="deck-meta">
                <span class="deck-dict">{{ getDictName(item.dictId) }}</span>
                <span class="deck-time">{{ formatTime(item.timestamp) }}</span>
              </div>
            </div>
            <div class="sr-item-actions">
              <button class="sr-action-btn b3-tooltips b3-tooltips__nw" @click.stop="goToDeckLocation(item)" :aria-label="props.i18n?.locate||'定位'"><svg><use xlink:href="#iconFocus"/></svg></button>
              <button class="sr-action-btn b3-tooltips b3-tooltips__nw" @click.stop="removeDeckCard(item.id)" :aria-label="props.i18n?.delete||'删除'"><svg><use xlink:href="#iconTrashcan"/></svg></button>
            </div>
            <Transition name="expand">
              <div v-if="expandedDeck===item.id" class="deck-content" v-html="renderDictCard(item.data)"></div>
            </Transition>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useReaderState } from '@/core/foliate'
import { showMessage, Dialog } from 'siyuan'
import { loadDeckCards, getDeckCards, removeFromDeck, renderDictCard, getDictName } from '@/core/dictionary'
import { COLORS } from '@/core/foliate/mark'

const props = withDefaults(defineProps<{ mode: 'toc'|'bookmark'|'mark'|'note'|'deck'; i18n?: any }>(), { i18n: () => ({}) })
const { activeView, activeReaderInstance, goToLocation } = useReaderState()

// ===== 状态 =====
const tocRef = ref<HTMLElement>()
const contentRef = ref<HTMLElement>()
const keyword = ref('')
const filterColor = ref('')
const showColorMenu = ref(false)
const isReverse = ref(false)
const isAtTop = ref(true)
const refreshKey = ref(0)
const deckCards = ref<any[]>([])
const expandedDeck = ref<string|null>(null)

// ===== 常量 =====
const colors=Object.fromEntries(COLORS.map(c=>[c.color,c.bg]))
const placeholders={toc:'搜索目录...',bookmark:'搜索书签...',mark:'搜索标注...',note:'搜索笔记...',deck:'搜索卡包...'}

// ===== Computed =====
const colorMenu=computed(()=>[
  {label:'全部',value:'',active:!filterColor.value},
  ...Object.entries(colors).map(([k,v])=>({label:k,value:k,color:v,active:filterColor.value===k}))
])

const marks=computed(()=>activeReaderInstance.value?.marks||(activeView.value as any)?.marks)
const data=computed(()=>{
  refreshKey.value
  if(!marks.value)return{bookmarks:[],marks:[],notes:[],deck:[]}
  return{
    bookmarks:marks.value.getBookmarks(),
    marks:marks.value.getAnnotations(filterColor.value as any),
    notes:marks.value.getNotes(),
    deck:deckCards.value
  }
})

const list=computed(()=>{
  const kw=keyword.value.toLowerCase()
  const modeMap={bookmark:'bookmarks',mark:'marks',note:'notes',deck:'deck'}
  const items=(data.value[modeMap[props.mode]]||[]).filter((item:any)=>!kw||(item.title||item.text||item.note||item.word||'').toLowerCase().includes(kw))
  return isReverse.value?[...items].reverse():items
})

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
    relocateHandler=(e:any)=>tocView?.setCurrentHref?.(e.detail?.tocItem?.href)
    activeView.value.addEventListener('relocate',relocateHandler)
    requestAnimationFrame(()=>{tocView?.setCurrentHref?.(activeView.value?.lastLocation?.tocItem?.href);addBookmarkButtons()})
  }catch(e){console.error('[TOC]',e)}
}

const cleanupToc=()=>{
  relocateHandler&&activeView.value?.removeEventListener('relocate',relocateHandler)
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
const removeBookmark=(item:any)=>{
  if(!marks.value)return showMessage('书签功能未初始化',2000,'error')
  marks.value.deleteBookmark(item.cfi||`section-${item.section}`)
  showMessage('已删除',1500,'info')
  refreshKey.value++
}

const editMark=(item:any,event:MouseEvent)=>{
  const rect=(event.currentTarget as HTMLElement).closest('.sr-item')?.getBoundingClientRect()
  if(rect)window.dispatchEvent(new CustomEvent('sireader:edit-mark',{detail:{item,position:{x:rect.right+20,y:rect.top-10}}}))
}

const deleteMark=async(item:any)=>{
  if(!marks.value)return showMessage('标记系统未初始化',3000,'error')
  try{
    if(await marks.value.deleteMark(item.cfi||`section-${item.section}`)){
      showMessage('已删除',1500,'info')
      refreshKey.value++
    }else showMessage('删除失败',3000,'error')
  }catch{showMessage('删除失败',3000,'error')}
}

const goTo=(item:any)=>{
  if(marks.value)marks.value.goTo(item)
  else if(item.cfi)goToLocation(item.cfi)
  else if(item.section!==undefined)activeView.value?.goTo(item.section)
}

// ===== 卡包操作 =====
const formatTime=(ts:number)=>new Date(ts).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})
const toggleDeckExpand=(id:string)=>expandedDeck.value=expandedDeck.value===id?null:id
const goToDeckLocation=(item:any)=>{
  if(!item.cfi&&item.section===undefined)return showMessage('未保存位置信息',2000,'info')
  if(item.cfi)goToLocation(item.cfi)
  else activeView.value?.goTo(item.section)
}
const removeDeckCard=async(id:string)=>{
  await removeFromDeck(id)
  // removeFromDeck 触发 deck-updated → loadDeckAnnotations → marks-updated → refresh
  showMessage('已删除',1500,'info')
}

const toggleScroll=()=>{
  if(!contentRef.value)return
  const{scrollTop,scrollHeight}=contentRef.value
  contentRef.value.scrollTo({top:scrollTop<50?scrollHeight:0,behavior:'smooth'})
}

const onScroll=(e:Event)=>isAtTop.value=(e.target as HTMLElement).scrollTop<50

// ===== 生命周期 =====
const refresh=async()=>{
  refreshKey.value++
  if(props.mode==='deck')deckCards.value=await loadDeckCards()
}

watch(()=>activeView.value?.book,book=>book?.toc&&props.mode==='toc'?requestAnimationFrame(initToc):cleanupToc(),{immediate:true})
watch(()=>props.mode,async()=>{
  if(props.mode==='toc')requestAnimationFrame(initToc)
  else if(props.mode==='deck')deckCards.value=await loadDeckCards()
})

onMounted(async()=>{
  window.addEventListener('sireader:marks-updated',refresh)
  if(props.mode==='deck')deckCards.value=await loadDeckCards()
})
onUnmounted(()=>{cleanupToc();window.removeEventListener('sireader:marks-updated',refresh)})
</script>

<style scoped lang="scss">
.sr-toc{display:flex;flex-direction:column;height:100%;overflow:hidden}
.sr-toolbar{flex-shrink:0;display:flex;gap:4px;padding:8px;background:var(--b3-theme-background);border-bottom:1px solid var(--b3-border-color);
  input{flex:1;min-width:0;height:28px;padding:0 10px;border:none;border-bottom:1px solid var(--b3-border-color);background:transparent;font-size:12px;outline:none;color:var(--b3-theme-on-background);transition:border-color .2s;&:focus{border-color:var(--b3-theme-primary)}&::placeholder{color:var(--b3-theme-on-surface-variant);opacity:.6}}
  button{width:28px;height:28px;flex-shrink:0;border:none;background:none;cursor:pointer;transition:all .15s;color:var(--b3-theme-on-surface);svg{width:16px;height:16px}&:hover{color:var(--b3-theme-primary);transform:scale(1.08)}&:active{transform:scale(.92)}}}
.sr-select{position:relative;flex-shrink:0}
.sr-menu{position:absolute;top:calc(100% + 4px);right:0;background:var(--b3-theme-surface);border-radius:6px;box-shadow:0 4px 12px #0003;min-width:100px;padding:4px;z-index:100}
.sr-menu-item{padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;transition:background .15s;display:flex;align-items:center;gap:8px;&:hover{background:var(--b3-list-hover)}&.active{background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary);font-weight:600}}
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
    svg{pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.1));color:var(--b3-theme-on-surface);transition:all .3s cubic-bezier(.4,0,.2,1)}
    &:hover{opacity:1!important;transform:translateY(-50%) scale(1.2) rotate(10deg);background:rgba(244,67,54,.15)!important}
    &:active{transform:translateY(-50%) scale(.9) rotate(-5deg)}
    &.has-bookmark{opacity:1!important;background:rgba(244,67,54,.08)!important;
      svg{color:var(--b3-theme-error)}
      &:hover{background:rgba(244,67,54,.18)!important}}}
  :deep(li:hover .toc-bookmark-btn){opacity:.5!important}}
.sr-list{padding:6px 4px}
.sr-item{position:relative;padding:10px 12px;margin:2px 4px;border-radius:6px;cursor:pointer;transition:all .25s cubic-bezier(.4,0,.2,1);background:var(--b3-theme-surface);display:flex;align-items:flex-start;gap:8px;
  &:hover{background:var(--b3-list-hover);transform:translateX(2px);box-shadow:0 2px 6px rgba(0,0,0,.08);
    .sr-item-actions{opacity:1}}}
.sr-item-content{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.sr-text{font-size:14px;line-height:1.8;color:var(--b3-theme-on-background);font-weight:500;padding:2px 0;
  &.sr-style-highlight{background:linear-gradient(transparent 60%,var(--mark-color) 60%)}
  &.sr-style-underline{text-decoration:underline;text-decoration-color:var(--mark-color);text-decoration-thickness:2px;text-underline-offset:2px}
  &.sr-style-outline{border:2px solid var(--mark-color);padding:2px 6px;border-radius:4px}
  &.sr-style-squiggly{text-decoration:underline wavy;text-decoration-color:var(--mark-color);text-decoration-thickness:2px;text-underline-offset:2px}}
.sr-note{font-size:12px;color:var(--b3-theme-on-surface-variant);opacity:.8;line-height:1.6}
.sr-item-actions{display:flex;gap:4px;opacity:0;transition:opacity .2s;flex-shrink:0}
.sr-action-btn{width:28px;height:28px;padding:0;border:none;background:transparent;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;svg{width:14px;height:14px}&:hover{background:var(--b3-list-hover);transform:scale(1.1)}&:active{transform:scale(.95)}}
.sr-word{font-size:16px;font-weight:600;color:var(--b3-theme-primary)}
.sr-trans{font-size:13px;color:var(--b3-theme-on-surface-variant)}
.deck-card{flex-direction:column;align-items:stretch;
  .sr-item-content{flex:1;cursor:pointer}
  .sr-action-btn{opacity:0;transition:opacity .2s}
  &:hover{.sr-action-btn{opacity:1};.sr-item-actions{opacity:1}}}
.deck-meta{display:flex;align-items:center;gap:8px;margin-top:4px;font-size:12px;opacity:.7}
.deck-dict{padding:2px 8px;background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary);border-radius:4px}
.deck-content{margin-top:12px;max-height:500px;overflow-y:auto;
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
.sr-remove-btn{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:26px;height:26px;padding:0;margin:0;border:none!important;background:transparent!important;outline:none!important;box-shadow:none!important;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:all .3s cubic-bezier(.4,0,.2,1);border-radius:50%;
  svg{pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.1));color:var(--b3-theme-error)}
  &:hover{opacity:1!important;transform:translateY(-50%) scale(1.2) rotate(-10deg);background:rgba(244,67,54,.15)!important}
  &:active{transform:translateY(-50%) scale(.9)}}
.sr-empty{padding:60px 20px;text-align:center;color:var(--b3-theme-on-surface-variant);opacity:.5;font-size:14px;line-height:1.8}
</style>
