<template>
  <div :class="listClass">
    <div v-if="!cards.length" class="sr-empty">{{emptyText}}</div>
    <div v-for="card in cards" :key="card.id" class="deck-card" :class="{expanded:exp===card.id,editing:edit===card.id}" @click="handleClick($event,card)">
      <span class="sr-bar" :style="{background:getMasteryColor(card)}"></span>
      <div class="deck-card-mastery">{{getMasteryIcon(card)}}</div>
      
      <!-- 编辑模式 -->
      <template v-if="editable&&edit===card.id">
        <slot name="edit" :card="card" :save="saveEdit" :cancel="cancelEdit">
          <div class="card-edit-panel">
            <div v-for="sec in editSections" :key="sec.k" class="edit-section">
              <div class="edit-header" @click="editState.sec[sec.k]=!editState.sec[sec.k]">
                <svg class="edit-arrow" :class="{open:editState.sec[sec.k]}"><use xlink:href="#iconDown"/></svg>
                <span class="edit-label">{{sec.l}}</span>
              </div>
              <Transition name="expand">
                <div v-if="editState.sec[sec.k]" class="edit-content">
                  <component :is="sec.t" v-model="editState.data[sec.k]" :class="`edit-${sec.t}`" :rows="sec.r" :placeholder="sec.p"/>
                </div>
              </Transition>
            </div>
            <div class="edit-actions">
              <button @click.stop="saveEdit(card.id)" class="b3-button b3-button--outline">保存</button>
              <button @click.stop="cancelEdit" class="b3-button b3-button--text">取消</button>
            </div>
          </div>
        </slot>
      </template>
      
      <!-- 显示模式 -->
      <template v-else>
        <div class="deck-card-title" v-html="extractAnkiTitle(card)" @click.capture="stopIfAudio"></div>
        <div class="deck-card-hint" v-html="extractAnkiHint(card)"></div>
        <div class="deck-card-source"><slot name="source" :card="card">{{card.model||'Anki'}} · 复习 {{card.learning?.reps||0}}次</slot></div>
        
        <Transition name="expand">
          <div v-if="exp===card.id" :class="backClass" v-html="renderAnki(card,`.${backClass}`)" @click.capture="stopIfAudio" @click.stop="handleContent"></div>
        </Transition>
        
        <!-- 操作按钮 -->
        <div v-if="editable&&del!==card.id" class="sr-btns">
          <button v-if="getSiyuanBlockId(card)" @click.stop="locateCard(card)" class="b3-tooltips b3-tooltips__nw" :aria-label="`定位 (${getSiyuanBlockId(card)})`"><svg><use xlink:href="#iconFocus"/></svg></button>
          <button @click.stop="startEdit(card)" class="b3-tooltips b3-tooltips__nw" aria-label="修改"><svg><use xlink:href="#iconEdit"/></svg></button>
          <button @click.stop="del=card.id" class="b3-tooltips b3-tooltips__nw" aria-label="删除"><svg><use xlink:href="#iconTrashcan"/></svg></button>
        </div>
        
        <Transition name="fade">
          <div v-if="editable&&del===card.id" class="sr-confirm" @click.stop>
            <button @click="del=null" class="b3-button b3-button--text">取消</button>
            <button @click="deleteCard(card.id)" class="b3-button b3-button--text btn-delete">删除</button>
          </div>
        </Transition>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref,watch,onMounted,onUnmounted,reactive,nextTick} from 'vue'
import {extractAnkiTitle,extractAnkiHint,playAudio,setupImageLazyLoad,renderAnki,setupInteractive,refreshCards,initMathJax,getMasteryColor,getMasteryIcon,stopIfAudio,stripHtml} from './utils'

const props=withDefaults(defineProps<{
  cards:any[]
  editable?:boolean
  emptyText?:string
  listClass?:string
  backClass?:string
}>(),{
  editable:false,
  emptyText:'暂无卡片',
  listClass:'stat-expand-list',
  backClass:'deck-card-content'
})

const emit=defineEmits<{
  save:[id:string,data:any]
  delete:[id:string]
}>()

const exp=ref<string|null>(null)
const edit=ref<string|null>(null)
const del=ref<string|null>(null)
const editState=reactive({data:{front:'',back:'',tags:''},sec:{front:true,back:true,tags:false}})
const editSections=[
  {k:'front',l:'Front',t:'textarea',r:4},
  {k:'back',l:'Back',t:'textarea',r:6},
  {k:'tags',l:'标签',t:'input',p:'标签（空格分隔）'}
] as const

let obs:IntersectionObserver|null=null

const INTERACT=['button','a','input','textarea','select','label','.b3-button','.sr-btns','.sr-confirm','.card-edit-panel',`.${props.backClass} a`,`.${props.backClass} button`,`.${props.backClass} input`,`.${props.backClass} textarea`,`.${props.backClass} select`,'.hint']

const refresh=()=>refreshCards(`.${props.backClass}`,obs)

const handleClick=(e:Event,card:any)=>{
  if(edit.value||INTERACT.some(sel=>(e.target as HTMLElement).closest(sel)))return
  const was=exp.value===card.id
  exp.value=was?null:card.id
  if(!was)refresh()
}

const handleContent=(e:Event)=>{
  const t=e.target as HTMLElement
  if(t.tagName==='A'||t.closest('a')){e.preventDefault();e.stopPropagation();return}
  if(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(t.tagName)){e.stopPropagation();return}
  if(INTERACT.some(sel=>t.matches(sel)||t.closest(sel)))e.stopPropagation()
}

const startEdit=async(card:any)=>{
  edit.value=card.id
  exp.value=null
  
  let front = stripHtml(card.front || '')
  let back = stripHtml(card.back || '')
  
  try {
    if (card.metadata?.collectionId && card.ankiNoteId) {
      const { getAnkiDb } = await import('./anki')
      const ankiDb = await getAnkiDb(card.metadata.collectionId)
      if (ankiDb) {
        const result = ankiDb.exec(`SELECT flds FROM notes WHERE id = ${card.ankiNoteId}`)
        if (result?.[0]?.values[0]?.[0]) {
          const fields = (result[0].values[0][0] as string).split('\x1f')
          front = fields[0] || front
          back = fields[1] || back
        }
      }
    }
  } catch {}
  
  const tags = Array.isArray(card.tags) ? card.tags.join(' ') : ''
  Object.assign(editState.data, {front, back, tags})
  await nextTick()
  Object.assign(editState.sec,{front:true,back:true,tags:false})
}

const saveEdit=(id:string)=>{
  emit('save',id,{
    front:editState.data.front,
    back:editState.data.back,
    tags:editState.data.tags.split(/\s+/).filter(Boolean)
  })
  edit.value=null
}

const cancelEdit=()=>{
  edit.value=null
  editState.data={front:'',back:'',tags:''}
}

const deleteCard=(id:string)=>{
  del.value=null
  emit('delete',id)
}

const getSiyuanBlockId=(card:any):string|null=>{
  const tag=card.tags?.find((t:string)=>t.startsWith('siyuan-block-'))
  return tag?tag.replace('siyuan-block-',''):null
}

const locateCard=async(card:any)=>{
  const blockId=getSiyuanBlockId(card)
  if(!blockId)return
  const{locateSiyuanCard}=await import('./siyuan-card')
  locateSiyuanCard(blockId)
}

onMounted(()=>{
  obs=setupImageLazyLoad()
  document.addEventListener('click',playAudio,true)
  initMathJax()
})

onUnmounted(()=>{
  obs?.disconnect()
  document.removeEventListener('click',playAudio,true)
})

watch(()=>props.cards,refresh,{flush:'post'})
watch(exp,v=>v&&refresh())
</script>

<style scoped lang="scss">
@use './deck.scss';
</style>
