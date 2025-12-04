<template>
  <div class="reader" @click="closeMenu">
    <div ref="wrapRef" class="reader-wrap">
      <div ref="containerRef" class="reader-container" tabindex="0"></div>
    </div>
    <div v-if="loading" class="reader-loading"><div class="spinner"></div><div>{{ error || '加载中...' }}</div></div>
    <div class="reader-toolbar">
      <button class="toolbar-btn" @click.stop="reader?.prev()" title="上一章"><svg><use xlink:href="#iconLeft"/></svg></button>
      <button class="toolbar-btn" @click.stop="reader?.next()" title="下一章"><svg><use xlink:href="#iconRight"/></svg></button>
      <button class="toolbar-btn" @click.stop="addBookmark" title="添加书签"><svg><use xlink:href="#iconBookmark"/></svg></button>
      <button class="toolbar-btn" @click.stop="$emit('settings')" title="设置"><svg><use xlink:href="#iconSettings"/></svg></button>
    </div>
    <Teleport to="body">
      <div v-if="showMenu" v-motion :initial="{scale:0.95}" :enter="{scale:1,transition:{type:'spring',stiffness:400,damping:30}}" :leave="{scale:0.9,transition:{duration:100}}" class="selection-menu" :style="menuStyle" @mousedown.stop>
        <div class="menu-btn-wrapper">
          <div v-show="showColorPicker" class="color-picker" @click.stop>
            <button v-for="c in COLORS" :key="c.color" class="color-btn" :style="{background:c.bg}" :title="c.title" @click="mark(c.color)"/>
          </div>
          <button class="menu-btn" @click.stop="showColorPicker=!showColorPicker" title="选择颜色"><svg><use xlink:href="#iconMark"/></svg></button>
        </div>
        <button class="menu-btn" @click="note()" title="笔记"><svg><use xlink:href="#iconEdit"/></svg></button>
        <button class="menu-btn" @click="copy()" title="复制"><svg><use xlink:href="#iconCopy"/></svg></button>
        <button class="menu-btn" @click="dict()" title="词典"><svg><use xlink:href="#iconLanguage"/></svg></button>
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
import { ReaderCore, type ReaderFormat } from '@/core/reader'
import { ReaderAnnotation, COLORS, type HighlightColor } from '@/core/readerAnnotation'
import { useReaderState } from '@/composables/useReaderState'

const props = withDefaults(defineProps<{file?:File,plugin:Plugin,settings?:ReaderSettings,url?:string,blockId?:string,format?:ReaderFormat,bookInfo?:any,onReaderReady?:(r:ReaderCore)=>void}>(),{settings:()=>({enabled:true,openMode:'newTab'}),format:'auto'})
defineEmits<{settings:[]}>()
const [containerRef,wrapRef]=[ref<HTMLElement>(),ref<HTMLElement>()]
const loading=ref(true),error=ref('')
const showMenu=ref(false),menuX=ref(0),menuY=ref(0),menuText=ref(''),menuRange=ref<Range|null>(null),showColorPicker=ref(false)
const menuStyle=computed(()=>({left:`${menuX.value}px`,top:`${menuY.value}px`}))
const isMouseDown=ref(false)
let reader:ReaderCore|null=null,annotation:ReaderAnnotation|null=null
const { setActiveReader, clearActiveReader } = useReaderState()

const init=async()=>{
  if(!containerRef.value)return
  try{
    loading.value=true;error.value=''
    reader=new ReaderCore(containerRef.value,props.settings!)
    if(props.file)await reader.open(props.file,props.format)
    else if(props.bookInfo)await reader.openOnline(props.bookInfo)
    else if(props.url)await reader.openUrl(props.url,props.format)
    else throw new Error('未提供书籍')
    if(props.blockId){
      annotation=new ReaderAnnotation(reader,props.blockId,props.settings?.annotationMode||'notebook',props.settings?.notebookId,props.settings?.parentDoc)
      await annotation.init()
      const loc=await reader.restoreLocation(props.blockId)
      if(loc)await reader.goTo(loc)
      await annotation.restore()
    }
    reader.on('relocate',loc=>{closeMenu();props.blockId&&reader?.saveProgress(props.blockId,loc)})
    setActiveReader(reader, props.blockId || '')
    props.onReaderReady?.(reader)
  }catch(e){error.value=e instanceof Error?e.message:'加载失败';console.error('[Reader]',e)}
  finally{loading.value=false}
}

const closeMenu=()=>{showMenu.value=false;showColorPicker.value=false}
const checkSelection=()=>{
  if(isMouseDown.value)return
  const sel=window.getSelection()
  if(!sel||!sel.rangeCount||sel.isCollapsed)return closeMenu()
  const text=sel.toString().trim()
  if(!text)return closeMenu()
  try{
    const range=sel.getRangeAt(0),rect=range.getBoundingClientRect()
    if(rect.width===0||rect.height===0)return closeMenu()
    const menuWidth=140
    menuText.value=text;menuRange.value=range
    menuX.value=Math.max(10,Math.min(window.innerWidth-menuWidth-10,rect.left+rect.width/2-menuWidth/2))
    menuY.value=Math.max(10,rect.top+window.scrollY-50)
    showMenu.value=true
  }catch{closeMenu()}
}
const handleMouseDown=()=>{isMouseDown.value=true;closeMenu()}
const handleMouseUp=()=>{
  isMouseDown.value=false
  setTimeout(checkSelection,50)
}

const mark=async(color:HighlightColor)=>{
  showColorPicker.value=false;closeMenu()
  if(!annotation||!menuRange.value||!menuText.value)return
  try{await annotation.addHighlight(menuRange.value,color,menuText.value);showMessage('标注已保存')}catch{showMessage('标注失败',3000,'error')}
}
const note=()=>{
  closeMenu()
  if(!annotation||!menuRange.value||!menuText.value)return
  const input=document.createElement('textarea')
  input.className='reader-note-input';input.placeholder='输入笔记...'
  input.style.cssText=`position:fixed;left:${menuX.value}px;top:${menuY.value+20}px;z-index:10000;width:300px;min-height:80px;padding:8px;border:1px solid var(--b3-border-color);border-radius:4px;background:var(--b3-theme-surface);color:var(--b3-theme-on-surface)`
  const save=async()=>{const val=input.value.trim();input.remove();if(val)try{await annotation!.addNote(menuRange.value!,val,menuText.value);showMessage('笔记已保存')}catch{showMessage('笔记失败',3000,'error')}}
  input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();save()}else if(e.key==='Escape')input.remove()}
  input.onblur=save;document.body.append(input);setTimeout(()=>input.focus(),10)
}
const copy=()=>{closeMenu();if(menuText.value)navigator.clipboard.writeText(menuText.value).then(()=>showMessage('已复制',1000))}
const dict=()=>{closeMenu();if(menuText.value)openDictDialog(menuText.value,menuX.value,menuY.value+50)}
const addBookmark=async()=>{
  if(!reader)return
  try{await reader.addBookmark();showMessage('书签已保存',1500,'info')}
  catch(e:any){showMessage(e.message||'添加失败',2000,'error')}
}

onMounted(()=>{
  init()
  containerRef.value?.focus()
  document.addEventListener('mousedown',handleMouseDown,{passive:true})
  document.addEventListener('mouseup',handleMouseUp,{passive:true})
})
onUnmounted(async()=>{
  if(props.blockId&&reader){const loc=reader.getLocation();loc&&await reader.saveProgress(props.blockId,loc)}
  document.removeEventListener('mousedown',handleMouseDown)
  document.removeEventListener('mouseup',handleMouseUp)
  clearActiveReader()
  reader?.destroy();annotation?.destroy()
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
.selection-menu{position:fixed;z-index:1000;display:flex;gap:4px;padding:6px;background:var(--b3-theme-surface);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.2)}
.menu-btn-wrapper{position:relative}
.color-picker{position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);display:flex;gap:5px;padding:6px;background:var(--b3-theme-surface);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.25)}
.color-btn{width:26px;height:26px;border:2px solid rgba(255,255,255,.15);border-radius:4px;cursor:pointer;transition:transform .1s ease;&:hover{border-color:rgba(255,255,255,.4);transform:scale(1.2)}}
.menu-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:6px;cursor:pointer;transition:background .1s ease;svg{width:16px;height:16px}&:hover{background:var(--b3-list-hover)}}
</style>
