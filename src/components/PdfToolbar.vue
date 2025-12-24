<template>
  <div ref="toolbarRef" v-motion :initial="{opacity:0,x:100}" :enter="{opacity:1,x:0}" class="pdf-toolbar" :style="{top:pos.y+'px',right:pos.x+'px'}">
    <div class="toolbar-row">
      <template v-if="expanded">
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" aria-label="缩小" @click.stop="zoomOut"><svg><use xlink:href="#lucide-zoom-out"/></svg></button>
        <select v-model="zoomMode" @change="handleZoomMode" @mousedown.stop>
          <option value="custom">{{ zoomPercent }}%</option>
          <option value="fit-width">适应宽度</option>
          <option value="fit-page">适应页面</option>
        </select>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" aria-label="放大" @click.stop="zoomIn"><svg><use xlink:href="#lucide-zoom-in"/></svg></button>
        <span class="toolbar-divider"/>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" aria-label="向左旋转" @click.stop="rotateLeft"><svg><use xlink:href="#lucide-rotate-ccw-square"/></svg></button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" aria-label="向右旋转" @click.stop="rotateRight"><svg><use xlink:href="#lucide-rotate-cw-square"/></svg></button>
        <span class="toolbar-divider"/>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" :class="{active:toolMode==='text'}" aria-label="文本选择" @click.stop="setToolMode('text')"><svg><use xlink:href="#lucide-square-mouse-pointer"/></svg></button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" :class="{active:toolMode==='hand'}" aria-label="手型工具" @click.stop="setToolMode('hand')"><svg><use xlink:href="#lucide-hand"/></svg></button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" :class="{active:inkActive}" aria-label="墨迹标注" @click.stop="toggleInk"><svg><use xlink:href="#lucide-brush"/></svg></button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" :class="{active:shapeActive}" aria-label="形状标注" @click.stop="toggleShape"><svg><use xlink:href="#iconShapes"/></svg></button>
        <span class="toolbar-divider"/>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" aria-label="更多" @click.stop="showMore=!showMore"><svg><use xlink:href="#iconMore"/></svg></button>
        <span class="toolbar-divider"/>
      </template>
      <button class="toolbar-btn b3-tooltips b3-tooltips__n" :aria-label="expanded?'收起':'展开'" @click.stop="expanded=!expanded" @mousedown="startDrag">
        <svg><use :xlink:href="expanded?'#iconClose':'#iconMenu'"></use></svg>
      </button>
    </div>
    <div v-if="expanded&&inkActive" v-motion :initial="{opacity:0,height:0}" :enter="{opacity:1,height:'auto'}" class="toolbar-row ink-row">
      <button v-for="c in colors" :key="c" class="ink-color b3-tooltips b3-tooltips__s" :class="{active:inkColor===c}" :style="{background:c}" :aria-label="`颜色 ${c}`" @click.stop="inkColor=c"/>
      <span class="toolbar-divider"/>
      <div class="ink-width-control">
        <input v-model.number="inkWidth" type="range" min="1" max="10" class="ink-slider" @mousedown.stop/>
        <span class="ink-width-value">{{ inkWidth }}</span>
      </div>
      <span class="toolbar-divider"/>
      <button class="toolbar-btn b3-tooltips b3-tooltips__s" :class="{active:inkEraser}" aria-label="橡皮擦" @click.stop="toggleEraser"><svg><use xlink:href="#lucide-eraser"/></svg></button>
      <button class="toolbar-btn b3-tooltips b3-tooltips__s" aria-label="撤销" @click.stop="inkUndo"><svg><use xlink:href="#lucide-undo-2"/></svg></button>
      <button class="toolbar-btn b3-tooltips b3-tooltips__s" aria-label="清空" @click.stop="inkClear"><svg><use xlink:href="#lucide-brush-cleaning"/></svg></button>
    </div>
    <div v-if="expanded&&shapeActive" v-motion :initial="{opacity:0,height:0}" :enter="{opacity:1,height:'auto'}" class="toolbar-row ink-row">
      <button v-for="s in shapes" :key="s.type" class="toolbar-btn b3-tooltips b3-tooltips__s" :class="{active:shapeType===s.type}" :aria-label="s.label" @click.stop="shapeType=s.type"><svg><use :xlink:href="s.icon"/></svg></button>
      <span class="toolbar-divider"/>
      <button v-for="c in colors" :key="c" class="ink-color b3-tooltips b3-tooltips__s" :class="{active:shapeColor===c}" :style="{background:c}" :aria-label="`颜色 ${c}`" @click.stop="shapeColor=c"/>
      <span class="toolbar-divider"/>
      <button class="toolbar-btn b3-tooltips b3-tooltips__s" :class="{active:shapeFilled}" aria-label="填充" @click.stop="shapeFilled=!shapeFilled"><svg><use xlink:href="#lucide-paint-bucket"/></svg></button>
      <div class="ink-width-control">
        <input v-model.number="shapeWidth" type="range" min="1" max="10" class="ink-slider" @mousedown.stop/>
        <span class="ink-width-value">{{ shapeWidth }}</span>
      </div>
      <span class="toolbar-divider"/>
      <button class="toolbar-btn b3-tooltips b3-tooltips__s" aria-label="撤销" @click.stop="shapeUndo"><svg><use xlink:href="#lucide-undo-2"/></svg></button>
      <button class="toolbar-btn b3-tooltips b3-tooltips__s" aria-label="清空" @click.stop="shapeClear"><svg><use xlink:href="#lucide-brush-cleaning"/></svg></button>
    </div>
  </div>
  
  <Transition name="fade">
    <div v-if="showMore" class="pdf-menu" @click="showMore=false">
      <button @click="print"><svg><use xlink:href="#iconFile"/></svg>打印</button>
      <button @click="download"><svg><use xlink:href="#iconDownload"/></svg>下载</button>
      <button @click="exportImages"><svg><use xlink:href="#iconImage"/></svg>导出图片</button>
      <button @click="showMetadata=true"><svg><use xlink:href="#iconInfo"/></svg>信息</button>
    </div>
  </Transition>
  
  <!-- 元数据对话框 -->
  <Teleport to="body">
    <div v-if="showMetadata" class="pdf-meta-overlay" @click="showMetadata=false">
      <div v-motion-pop class="pdf-meta-dialog" @click.stop>
        <div class="pdf-meta-header">
          <h3>文档信息</h3>
          <button @click="showMetadata=false"><svg><use xlink:href="#iconClose"/></svg></button>
        </div>
        <div class="pdf-meta-body">
          <div v-if="metadata" class="pdf-meta-grid">
            <div v-for="(item,i) in metaItems" :key="i" v-motion-slide-visible-once-left class="pdf-meta-item">
              <span class="label">{{ item.label }}</span>
              <span class="value">{{ item.value }}</span>
            </div>
          </div>
          <div v-else class="pdf-meta-loading">加载中...</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import{ref,computed,watch}from 'vue'
import type{PDFViewer}from '@/core/pdf/viewer'
import type{PDFSearch}from '@/core/pdf/search'
import type{PDFMetadata}from '@/core/pdf'

const props=defineProps<{viewer:PDFViewer;searcher:PDFSearch;fileSize?:number}>()
const emit=defineEmits(['print','download','export-images','ink-toggle','ink-color','ink-width','ink-undo','ink-clear','ink-save','ink-eraser','shape-toggle','shape-type','shape-color','shape-width','shape-filled','shape-undo','shape-clear'])

const expanded=ref(false),scale=ref(props.viewer.getScale()),rotation=ref(0),zoomMode=ref<'custom'|'fit-width'|'fit-page'>('fit-width'),showMore=ref(false)
const toolMode=ref<'text'|'hand'>('text')
const colors=['#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff','#000000']
const inkActive=ref(false),inkEraser=ref(false),inkColor=ref('#ff0000'),inkWidth=ref(2)
const shapeActive=ref(false),shapeType=ref<'rect'|'circle'|'triangle'>('rect'),shapeColor=ref('#ff0000'),shapeWidth=ref(2),shapeFilled=ref(false)
const shapes=[{type:'rect',label:'矩形',icon:'#iconSquareDashed'},{type:'circle',label:'圆形',icon:'#iconCircleDashed'},{type:'triangle',label:'三角形',icon:'#iconTriangleDashed'}]
const showMetadata=ref(false),metadata=ref<PDFMetadata|null>(null)
const toolbarRef=ref<HTMLElement>(),pos=ref({x:16,y:52})

const startDrag=(e:MouseEvent)=>{
  e.preventDefault()
  const el=toolbarRef.value!,rect=el.getBoundingClientRect(),parent=el.offsetParent as HTMLElement
  const pr=parent.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,ox=pr.right-rect.right,oy=rect.top-pr.top
  const move=(e:MouseEvent)=>{
    const nx=ox-(e.clientX-sx),ny=oy+(e.clientY-sy)
    pos.value={x:Math.max(0,Math.min(pr.width-rect.width,nx)),y:Math.max(0,Math.min(pr.height-rect.height,ny))}
  }
  const up=()=>{document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up)}
  document.addEventListener('mousemove',move)
  document.addEventListener('mouseup',up)
}

const zoomPercent=computed(()=>Math.round(scale.value*100))
const formatSize=(b:number)=>b<1024?`${b} B`:b<1048576?`${(b/1024).toFixed(2)} KB`:`${(b/1048576).toFixed(2)} MB`
const metaItems=computed(()=>{
  if(!metadata.value)return[]
  const m=metadata.value,d=(d:Date)=>d.toLocaleString('zh-CN')
  return[
    {label:'标题',value:m.title||'无'},{label:'作者',value:m.author||'无'},{label:'主题',value:m.subject||'无'},
    {label:'关键词',value:m.keywords||'无'},{label:'创建者',value:m.creator||'无'},{label:'生产者',value:m.producer||'无'},
    {label:'页数',value:m.pageCount},{label:'PDF版本',value:m.pdfVersion||'无'},
    m.fileSize&&{label:'文件大小',value:formatSize(m.fileSize)},
    m.creationDate&&{label:'创建日期',value:d(m.creationDate)},
    m.modificationDate&&{label:'修改日期',value:d(m.modificationDate)}
  ].filter(Boolean)
})

const zoomIn=async()=>{scale.value=Math.min(5,scale.value+.25);await props.viewer.setScale(scale.value);zoomMode.value='custom'}
const zoomOut=async()=>{scale.value=Math.max(.25,scale.value-.25);await props.viewer.setScale(scale.value);zoomMode.value='custom'}
const handleZoomMode=async()=>{
  if(zoomMode.value==='fit-width')await props.viewer.fitWidth()
  else if(zoomMode.value==='fit-page')await props.viewer.fitPage()
  scale.value=props.viewer.getScale()
}
const rotateLeft=async()=>{rotation.value=(rotation.value-90+360)%360;await props.viewer.setRotation(rotation.value as 0|90|180|270)}
const rotateRight=async()=>{rotation.value=(rotation.value+90)%360;await props.viewer.setRotation(rotation.value as 0|90|180|270)}
const print=()=>emit('print'),download=()=>emit('download'),exportImages=()=>emit('export-images')

let cleanup:Function|null=null
const setToolMode=(mode:'text'|'hand')=>{
  toolMode.value=mode;cleanup?.()
  const c=props.viewer['container']
  Object.assign(c.style,mode==='hand'?{cursor:'grab',userSelect:'none'}:{cursor:'text',userSelect:'text'})
  if(mode==='hand'){
    let drag=false,x=0,y=0,l=0,t=0
    const down=(e:MouseEvent)=>{if(e.button)return;drag=true;c.style.cursor='grabbing';x=e.pageX;y=e.pageY;l=c.scrollLeft;t=c.scrollTop;e.preventDefault()}
    const move=(e:MouseEvent)=>{if(!drag)return;c.scrollLeft=l-(e.pageX-x);c.scrollTop=t-(e.pageY-y)}
    const up=()=>{drag=false;toolMode.value==='hand'&&(c.style.cursor='grab')}
    c.addEventListener('mousedown',down);c.addEventListener('mousemove',move);c.addEventListener('mouseup',up);c.addEventListener('mouseleave',up)
    cleanup=()=>{c.removeEventListener('mousedown',down);c.removeEventListener('mousemove',move);c.removeEventListener('mouseup',up);c.removeEventListener('mouseleave',up)}
  }
}

const toggleInk=()=>{inkActive.value=!inkActive.value;shapeActive.value=false;emit('ink-toggle',inkActive.value)}
const toggleEraser=()=>{inkEraser.value=!inkEraser.value;emit('ink-eraser',inkEraser.value)}
const inkUndo=()=>emit('ink-undo'),inkClear=()=>emit('ink-clear'),inkSave=()=>{emit('ink-save');inkActive.value=false}

const toggleShape=()=>{shapeActive.value=!shapeActive.value;inkActive.value=false;emit('shape-toggle',shapeActive.value)}
const shapeUndo=()=>emit('shape-undo'),shapeClear=()=>emit('shape-clear')

watch(inkColor,v=>emit('ink-color',v))
watch(inkWidth,v=>emit('ink-width',v))
watch(shapeType,v=>emit('shape-type',v))
watch(shapeColor,v=>emit('shape-color',v))
watch(shapeWidth,v=>emit('shape-width',v))
watch(shapeFilled,v=>emit('shape-filled',v))
watch(expanded,v=>{if(!v){inkActive.value&&emit('ink-toggle',false);shapeActive.value&&emit('shape-toggle',false);inkActive.value=false;shapeActive.value=false}})
watch(showMetadata,async v=>{if(v&&!metadata.value){const{getMetadata}=await import('@/core/pdf');metadata.value=await getMetadata(props.viewer.getPDF()!,props.fileSize)}})
</script>

<style scoped lang="scss">
.pdf-toolbar{
  position:absolute;
  display:inline-flex;flex-direction:column;gap:4px;
  padding:4px;
  background:var(--b3-theme-surface);
  border:1px solid var(--b3-border-color);
  border-radius:6px;
  box-shadow:0 2px 8px #0002;
  z-index:1000;
  user-select:none;
}

.toolbar-row{
  display:flex;align-items:center;gap:4px;
  
  select{
    height:28px;padding:0 8px;
    border:1px solid var(--b3-border-color);
    border-radius:4px;
    background:var(--b3-theme-background);
    color:var(--b3-theme-on-surface);
    font-size:12px;cursor:pointer;
    &:focus{outline:none;border-color:var(--b3-theme-primary)}
  }
}

.ink-row{
  border-top:1px solid var(--b3-border-color);
  padding-top:6px;margin-top:0;
}

.ink-color{
  width:16px;height:16px;padding:0;
  border:2px solid transparent;
  border-radius:50%;
  cursor:pointer;
  transition:all .15s;
  flex-shrink:0;
  &:hover{transform:scale(1.1);box-shadow:0 2px 4px #0003}
  &.active{border-color:var(--b3-theme-on-surface);transform:scale(1.15);box-shadow:0 0 0 2px var(--b3-theme-surface),0 2px 6px #0004}
}

.ink-width-control{
  display:flex;align-items:center;gap:6px;
}

.ink-slider{
  width:80px;height:4px;
  -webkit-appearance:none;
  background:var(--b3-border-color);
  border-radius:2px;
  outline:none;
  &::-webkit-slider-thumb{
    -webkit-appearance:none;
    width:14px;height:14px;
    background:var(--b3-theme-primary);
    border-radius:50%;
    cursor:pointer;
    box-shadow:0 1px 3px #0003;
    transition:all .15s;
    &:hover{transform:scale(1.2);box-shadow:0 2px 6px #0004}
  }
  &::-moz-range-thumb{
    width:14px;height:14px;
    background:var(--b3-theme-primary);
    border-radius:50%;
    cursor:pointer;
    border:none;
    box-shadow:0 1px 3px #0003;
  }
}

.ink-width-value{
  font-size:11px;
  font-weight:600;
  color:var(--b3-theme-on-surface);
  min-width:16px;
  text-align:center;
}



.pdf-menu{
  position:absolute;top:56px;right:16px;
  min-width:140px;
  background:var(--b3-theme-surface);
  border:1px solid var(--b3-border-color);
  border-radius:6px;
  box-shadow:0 2px 8px #0002;
  padding:4px;z-index:100;
  button{
    width:100%;
    display:flex;align-items:center;gap:6px;
    padding:6px 10px;
    border:none;background:transparent;
    border-radius:4px;
    cursor:pointer;text-align:left;
    color:var(--b3-theme-on-surface);
    font-size:12px;
    transition:all .15s;
    svg{width:14px;height:14px}
    &:hover{background:var(--b3-list-hover)}
  }
}

// 元数据对话框
.pdf-meta-overlay{position:fixed;inset:0;background:#0008;display:flex;align-items:center;justify-content:center;z-index:10000;backdrop-filter:blur(2px)}
.pdf-meta-dialog{background:var(--b3-theme-surface);border-radius:8px;box-shadow:0 8px 32px #0003;max-width:560px;width:90%;max-height:80vh;display:flex;flex-direction:column}
.pdf-meta-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--b3-border-color);h3{margin:0;font-size:15px;font-weight:600}button{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:4px;cursor:pointer;transition:all .15s;svg{width:14px;height:14px}&:hover{background:var(--b3-list-hover);transform:scale(1.1)}&:active{transform:scale(.95)}}}
.pdf-meta-body{padding:18px;overflow-y:auto}
.pdf-meta-grid{display:grid;gap:10px}
.pdf-meta-item{display:flex;gap:10px;padding:8px;border-radius:4px;transition:background .15s;&:hover{background:var(--b3-list-hover)}.label{min-width:75px;font-weight:500;font-size:13px;color:var(--b3-theme-on-surface-variant)}.value{flex:1;font-size:13px;color:var(--b3-theme-on-surface);word-break:break-all}}
.pdf-meta-loading{text-align:center;padding:40px;color:var(--b3-theme-on-surface-variant);font-size:13px}

.toolbar-enter-active,.toolbar-leave-active{transition:all .2s}
.toolbar-enter-from,.toolbar-leave-to{opacity:0;transform:translateY(-6px)}
.slide-enter-active,.slide-leave-active{transition:all .2s}
.slide-enter-from,.slide-leave-to{opacity:0;transform:translateY(-6px)}
.fade-enter-active,.fade-leave-active{transition:opacity .15s}
.fade-enter-from,.fade-leave-to{opacity:0}
</style>
