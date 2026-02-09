<template>
  <div :class="listClass">
    <div v-if="!cards.length" class="sr-empty">{{emptyText}}</div>
    <div v-for="card in cards" :key="card.id" class="deck-card" :class="{expanded:exp===card.id,editing:edit===card.id}" @click="handleClick($event,card)">
      <span class="sr-bar" :style="{background:getMasteryColor(card)}"></span>
      <div class="deck-card-mastery">{{getMasteryIcon(card)}}</div>
      
      <!-- 编辑模式 -->
      <div v-if="editable&&edit===card.id" class="pack-editor">
        <div class="property-table">
          <div v-for="p in editProps" :key="p.k" class="prop-row" :class="{expanded:sec[p.k]}" @click.stop="sec[p.k]=!sec[p.k]">
            <div class="prop-header">
              <span class="prop-label">{{p.l}}</span>
              <span class="prop-preview">{{p.prev()}}</span>
            </div>
            <Transition name="expand">
              <div v-if="sec[p.k]" class="prop-content" @click.stop>
                <textarea v-if="p.k!=='tags'" v-model="data[p.k]" class="prop-textarea" :rows="p.r" :placeholder="p.p"/>
                <div v-else>
                  <input v-model="tagInput" class="prop-input" placeholder="添加标签..." @keyup.enter="addTag" @click.stop/>
                  <div v-if="data.tags.length" class="tag-chips">
                    <span v-for="tag in data.tags" :key="tag" class="tag-chip" @click="data.tags.splice(data.tags.indexOf(tag),1)">{{tag}} ×</span>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </div>
        <div class="editor-actions">
          <span class="flex-spacer"></span>
          <button @click.stop="edit=null" class="btn-cancel">取消</button>
          <button @click.stop="saveEdit(card.id)" class="btn-save">保存</button>
        </div>
      </div>
      
      <!-- 显示模式 -->
      <template v-else>
        <div class="deck-card-title" v-html="extractAnkiTitle(card)" @click.capture="stopIfAudio"></div>
        <div class="deck-card-hint" v-html="extractAnkiHint(card)"></div>
        <div class="deck-card-source"><slot name="source" :card="card">{{card.model||'Anki'}} · 复习 {{card.learning?.reps||0}}次</slot></div>
        <Transition name="expand">
          <div v-if="exp===card.id" :class="backClass" v-html="renderAnki(card,`.${backClass}`)" @click.capture="stopIfAudio" @click.stop="handleContent"></div>
        </Transition>
        <div v-if="editable&&del!==card.id" class="sr-btns">
          <button v-if="getSiyuanBlockId(card)" @click.stop="locateCard(card)" class="b3-tooltips b3-tooltips__nw" :aria-label="`定位 (${getSiyuanBlockId(card)})`"><svg><use xlink:href="#iconFocus"/></svg></button>
          <button @click.stop="startEdit(card)" class="b3-tooltips b3-tooltips__nw" aria-label="修改"><svg><use xlink:href="#iconEdit"/></svg></button>
          <button @click.stop="del=card.id" class="b3-tooltips b3-tooltips__nw" aria-label="删除"><svg><use xlink:href="#iconTrashcan"/></svg></button>
        </div>
        <Transition name="fade">
          <div v-if="editable&&del===card.id" class="sr-confirm" @click.stop>
            <button @click="del=null">取消</button>
            <button @click="emit('delete',card.id);del=null" class="btn-delete">删除</button>
          </div>
        </Transition>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref,watch,onMounted,onUnmounted,reactive,nextTick} from 'vue'
import {extractAnkiTitle,extractAnkiHint,playAudio,setupImageLazyLoad,renderAnki,refreshCards,initMathJax,getMasteryColor,getMasteryIcon,stopIfAudio} from './utils'

const props=withDefaults(defineProps<{cards:any[];editable?:boolean;emptyText?:string;listClass?:string;backClass?:string}>(),{editable:false,emptyText:'暂无卡片',listClass:'stat-expand-list',backClass:'deck-card-content'})
const emit=defineEmits<{save:[id:string,data:any];delete:[id:string]}>()

const exp=ref<string|null>(null),edit=ref<string|null>(null),del=ref<string|null>(null),tagInput=ref('')
const data=reactive({front:'',back:'',tags:[] as string[]}),sec=reactive({front:true,back:true,tags:false})
const editProps=[{k:'front' as const,l:'Front',r:4,p:'卡片正面内容',prev:()=>data.front?'已设置':'未设置'},{k:'back' as const,l:'Back',r:6,p:'卡片背面内容',prev:()=>data.back?'已设置':'未设置'},{k:'tags' as const,l:'标签',prev:()=>data.tags.length?`${data.tags.length} 个`:'未设置'}]

let obs:IntersectionObserver|null=null
const INTERACT=['button','a','input','textarea','select','.b3-button','.sr-btns','.sr-confirm',`.${props.backClass} a`,`.${props.backClass} button`,`.${props.backClass} input`,`.${props.backClass} textarea`,`.${props.backClass} select`,'.hint']
const refresh=()=>refreshCards(`.${props.backClass}`,obs)
const handleClick=(e:Event,card:any)=>{if(edit.value||INTERACT.some(sel=>(e.target as HTMLElement).closest(sel)))return;const was=exp.value===card.id;exp.value=was?null:card.id;if(!was)refresh()}
const handleContent=(e:Event)=>{const t=e.target as HTMLElement;if(t.tagName==='A'||t.closest('a')){e.preventDefault();e.stopPropagation();return}if(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(t.tagName)||INTERACT.some(sel=>t.matches(sel)||t.closest(sel)))e.stopPropagation()}

const startEdit=async(card:any)=>{edit.value=card.id;exp.value=null;Object.assign(data,{front:card.front||'',back:card.back||'',tags:Array.isArray(card.tags)?card.tags:[]});tagInput.value='';await nextTick();Object.assign(sec,{front:true,back:true,tags:false})}
const saveEdit=(id:string)=>{const toAnki=(h:string)=>h.replace(/<img[^>]*?data-file=["']([^"']+)["'][^>]*?>/gi,(_,f)=>`<img src="${f}">`).replace(/<svg class="anki-audio"[^>]*?data-file=["']([^"']+)["'][^>]*?>.*?<\/svg>/gi,(_,f)=>`[sound:${f}]`);emit('save',id,{front:toAnki(data.front),back:toAnki(data.back),tags:data.tags});edit.value=null}
const addTag=()=>{const v=tagInput.value.trim();if(v&&!data.tags.includes(v)){data.tags.push(v);tagInput.value=''}}
const getSiyuanBlockId=(card:any)=>card.tags?.find((t:string)=>t.startsWith('siyuan-block-'))?.replace('siyuan-block-','')||null
const locateCard=async(card:any)=>{const blockId=getSiyuanBlockId(card);if(blockId)(await import('./siyuan-card')).locateSiyuanCard(blockId)}

onMounted(()=>{obs=setupImageLazyLoad();document.addEventListener('click',playAudio,true);initMathJax()})
onUnmounted(()=>{obs?.disconnect();document.removeEventListener('click',playAudio,true)})
watch(()=>props.cards,refresh,{flush:'post'})
watch(exp,v=>v&&refresh())
</script>

<style scoped lang="scss">
@use './deck.scss';
</style>
