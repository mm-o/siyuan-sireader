<template>
  <div class="deck-pack">
    <div v-if="!packs.length&&!editing" class="sr-empty">暂无卡组</div>
    
    <div v-for="pack in displayTree" :key="pack.id" class="sr-card" :class="{'sr-card-edit':isEditing(pack),'sr-group':pack.isParent&&!isEditing(pack)}" :style="indent(pack)">
      <!-- 父卡组分组头 -->
      <template v-if="pack.isParent&&!isEditing(pack)">
        <div v-if="pack.titleImg" class="sr-card-overlay" :style="pack.titleImg"></div>
        <span class="sr-bar" :class="{collapsed:!expanded.has(pack.id)}" :style="{background:pack.color}" @click.stop="toggleExpand(pack.id)"></span>
        <div class="sr-group-content" @click.stop="toggleExpand(pack.id)">
          <span v-if="pack.icon">{{ pack.icon }}</span>
          <span class="sr-group-title">{{ pack.displayName||pack.name }}</span>
          <span class="sr-group-count">{{ pack.childEnabled }}/{{ pack.childTotal }}</span>
        </div>
      </template>
      
      <!-- 普通卡组或编辑模式 -->
      <template v-else>
        <div v-if="currentData(pack).titleImg" class="sr-card-overlay" :style="currentData(pack).titleImg"></div>
        <span class="sr-bar" :style="{background:currentData(pack).color}"></span>
        
        <!-- 编辑模式 -->
        <div v-if="isEditing(pack)" class="pack-editor">
          <div class="editor-title">
            <button v-if="form.icon" @click.stop="form.icon=''" class="icon-btn">{{ form.icon }}</button>
            <input v-model="form.name" placeholder="卡组名称（如：英语::单词::高频词）" class="title-input" @click.stop>
          </div>
          
          <div class="property-table">
            <div v-for="prop in propConfig" :key="prop.key" v-show="!prop.condition||prop.condition()" class="prop-row" :class="{expanded:expandedProp===prop.key}" @click.stop="toggleProp(prop.key)">
              <div class="prop-header">
                <span class="prop-label">{{ prop.label }}</span>
                <component :is="prop.preview" v-if="prop.preview"/>
              </div>
              <Transition name="expand">
                <div v-if="expandedProp===prop.key" class="prop-content" @click.stop>
                  <component :is="prop.content"/>
                </div>
              </Transition>
            </div>
          </div>
          
          <div class="editor-actions">
            <button @click.stop="togglePreview" class="btn-preview">
              <svg><use :xlink:href="showPreview?'#iconEyeoff':'#iconEye'"/></svg>
              {{ showPreview?'隐藏预览':'预览卡片' }}
            </button>
            <span class="flex-spacer"></span>
            <button @click.stop="cancel" class="btn-cancel">取消</button>
            <button @click.stop="save" class="btn-save" :disabled="!form.name.trim()">{{ editing==='new'?'创建':'保存' }}</button>
          </div>
          
          <div v-if="showPreview" class="preview-box">
            <div class="preview-tabs">
              <button :class="{active:previewSide==='front'}" @click="previewSide='front'">前面</button>
              <button :class="{active:previewSide==='back'}" @click="previewSide='back'">背面</button>
            </div>
            <div class="preview-card">
              <style v-if="form.modelCss">{{ form.modelCss }}</style>
              <div class="anki-card"><div class="card" v-html="renderPreview()"></div></div>
            </div>
          </div>
        </div>
        
        <!-- 显示模式 -->
        <div v-else class="sr-main">
          <div class="sr-head">
            <span v-if="pack.icon">{{ pack.icon }}</span>
            <div class="sr-chapter">{{ pack.displayName||pack.name }}</div>
          </div>
          <div class="sr-note" v-html="pack.desc||'暂无描述'"></div>
          <div class="sr-tags">
            <span v-if="!pack.tags?.length" class="sr-chip tag">#默认</span>
            <span v-else v-for="tag in pack.tags" :key="tag" class="sr-chip tag">#{{ tag }}</span>
          </div>
          <div class="sr-stats">
            <span class="sr-chip new">新{{ pack.stats.new }}</span>
            <span class="sr-chip learning">学{{ pack.stats.learning }}</span>
            <span class="sr-chip review">复{{ pack.stats.review }}</span>
            <span class="sr-chip total">共{{ pack.stats.total }}</span>
          </div>
        </div>
      </template>
      
      <!-- 统一按钮区 -->
      <Transition name="fade">
        <div v-if="removing===pack.id" class="sr-confirm" @click.stop>
          <button @click="removing=null">取消</button>
          <button @click="confirmDelete(pack.id)" class="btn-delete">删除{{ pack.isParent?'分组':'' }}</button>
        </div>
      </Transition>
      <div v-if="removing!==pack.id&&!isEditing(pack)" class="sr-btns">
        <button v-if="!pack.isParent" @click.stop="$emit('toggle',pack)" :class="{active:pack.enabled}" class="b3-tooltips b3-tooltips__nw" :aria-label="pack.enabled?'已启用':'启用'">
          <svg><use :xlink:href="pack.enabled?'#iconCheck':'#iconUncheck'"/></svg>
        </button>
        <button @click.stop="edit(pack)" class="b3-tooltips b3-tooltips__nw" aria-label="编辑">
          <svg><use xlink:href="#iconEdit"/></svg>
        </button>
        <button v-if="pack.id!=='default'" @click.stop="removing=pack.id" class="b3-tooltips b3-tooltips__nw" aria-label="删除">
          <svg><use xlink:href="#iconTrashcan"/></svg>
        </button>
      </div>
    </div>
    
    <div v-if="!editing" class="sr-action-btns">
      <button @click.stop="create" class="sr-btn">新建卡组</button>
      <button @click.stop="$emit('import')" class="sr-btn">导入 Anki</button>
      <button @click.stop="syncSiyuan" class="sr-btn" :disabled="syncing">{{ syncing ? '同步中...' : '同步思源' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h, watch } from 'vue'
import { fetchSyncPost, showMessage } from 'siyuan'
import type { Pack } from './types'
import { syncAllSiyuanDecks } from './siyuan-card'

const props = defineProps<{
  packs: Pack[]
  emojiCategories: Record<string, string[]>
  loadingEmojis: boolean
  allTags: string[]
  i18n?: any
}>()

const emit = defineEmits<{
  save: [data: any]
  delete: [id: string]
  toggle: [pack: Pack]
  import: []
  reload: []
}>()

// 常量
const DEFAULT_FORM = { name:'',desc:'',icon:'',color:'#667eea',titleImg:'',tags:[] as string[],fields:[] as string[],parent:undefined as string|undefined,modelCss:'',collectionId:'',ankiDeckId:0,qfmt:'',afmt:'' }
const COLORS = [{n:'紫',v:'#667eea'},{n:'蓝',v:'#42a5f5'},{n:'绿',v:'#66bb6a'},{n:'黄',v:'#ffeb3b'},{n:'橙',v:'#ff9800'},{n:'红',v:'#ef5350'},{n:'粉',v:'#ec407a'},{n:'灰',v:'#78909c'}]
const GRADIENTS = ["linear-gradient(to top,#a18cd1 0%,#fbc2eb 100%)","linear-gradient(to top,#fbc2eb 0%,#a6c1ee 100%)","linear-gradient(120deg,#a6c0fe 0%,#f68084 100%)","linear-gradient(120deg,#e0c3fc 0%,#8ec5fc 100%)","linear-gradient(to right,#fa709a 0%,#fee140 100%)","linear-gradient(135deg,#667eea 0%,#764ba2 100%)","linear-gradient(135deg,#f093fb 0%,#f5576c 100%)","linear-gradient(135deg,#4facfe 0%,#00f2fe 100%)","linear-gradient(135deg,#43e97b 0%,#38f9d7 100%)","linear-gradient(135deg,#fa8bff 0%,#2bd2ff 90%,#2bff88 100%)","linear-gradient(to top,#ff9a9e 0%,#fecfef 99%,#fecfef 100%)","linear-gradient(120deg,#f6d365 0%,#fda085 100%)","linear-gradient(to top,#fbc2eb 0%,#a6c1ee 100%)","linear-gradient(to top,#fdcbf1 0%,#fdcbf1 1%,#e6dee9 100%)","linear-gradient(120deg,#a1c4fd 0%,#c2e9fb 100%)","linear-gradient(120deg,#d4fc79 0%,#96e6a1 100%)","linear-gradient(120deg,#84fab0 0%,#8fd3f4 100%)","linear-gradient(to top,#cfd9df 0%,#e2ebf0 100%)","linear-gradient(to right,#eea2a2 0%,#bbc1bf 19%,#57c6e1 42%,#b49fda 79%,#7ac5d8 100%)","linear-gradient(-20deg,#e9defa 0%,#fbfcdb 100%)"]

// 状态
const editing = ref<string|null>(null), removing = ref<string|null>(null), expandedProp = ref<string|null>(null)
const tagInput = ref(''), fieldInput = ref(''), imgs = ref<any[]>([]), expanded = ref(new Set<string>())
const form = ref({...DEFAULT_FORM}), showPreview = ref(false), previewSide = ref<'front'|'back'>('front')
const templateInfo = ref<any>(null), loadingTemplate = ref(false), emojiLoadCount = ref(1), syncing = ref(false)

// 工具函数
const indent = (p: any) => ({ marginLeft: `${p.level*20}px` })
const isEditing = (p: any) => editing.value === p.id
const currentData = (p: any) => isEditing(p) ? form.value : p
const select = (k: string, v: any) => { form.value[k] = v; expandedProp.value = null }
const resetEditor = () => { showPreview.value = false; expandedProp.value = null; templateInfo.value = null }
const arrayOps = (k: 'tags'|'fields', input: typeof tagInput) => ({
  toggle: (v: string) => { const i = form.value[k].indexOf(v); i>-1 ? form.value[k].splice(i,1) : form.value[k].push(v) },
  remove: (v: string) => form.value[k].splice(form.value[k].indexOf(v),1),
  add: () => { const v = input.value.trim(); if(v&&!form.value[k].includes(v)) { form.value[k].push(v); input.value = '' } }
})

// Computed
const tagOps = computed(() => arrayOps('tags', tagInput))
const fieldOps = computed(() => arrayOps('fields', fieldInput))
const filteredTags = computed(() => tagInput.value ? props.allTags.filter(t => t.toLowerCase().includes(tagInput.value.toLowerCase())) : props.allTags)
const allEmojis = computed(() => Object.values(props.emojiCategories).flat())
const visibleEmojis = computed(() => allEmojis.value.slice(0, emojiLoadCount.value*50))
const hasMoreEmojis = computed(() => visibleEmojis.value.length < allEmojis.value.length)

// 属性配置
const propConfig = computed(() => [
  { key:'icon', label:'图标', preview:()=>h('span',{class:'prop-preview'},form.value.icon||'未设置'), content:()=>props.loadingEmojis?h('div',{class:'loading-hint'},'加载中...'):h('div',{class:'emoji-container',onScroll:(e:Event)=>{const el=e.target as HTMLElement;if(el.scrollHeight-el.scrollTop-el.clientHeight<100&&hasMoreEmojis.value)emojiLoadCount.value++}},[h('div',{class:'emoji-list'},visibleEmojis.value.map(e=>h('span',{class:'emoji-item',onClick:()=>select('icon',e)},e))),hasMoreEmojis.value?h('div',{class:'loading-hint'},'滚动加载更多...'):null]) },
  { key:'color', label:'颜色', preview:()=>h('span',{class:'prop-preview'},[h('span',{class:'color-dot',style:{background:form.value.color}})]), content:()=>h('div',{class:'color-grid'},COLORS.map(c=>h('button',{class:['color-btn',{active:form.value.color===c.v}],style:{background:c.v},title:c.n,onClick:()=>select('color',c.v)}))) },
  { key:'img', label:'题头图', preview:()=>h('span',{class:'prop-preview'},form.value.titleImg?'已设置':'未设置'), content:()=>!imgs.value.length?h('div',{class:'loading-hint'},'暂无题头图'):h('div',{class:'img-grid'},[...imgs.value.map(img=>h('div',{class:'img-item',style:img.titleImg,onClick:()=>select('titleImg',img.titleImg)})),form.value.titleImg?h('div',{class:'img-item clear',onClick:()=>select('titleImg','')},'清除'):null].filter(Boolean)) },
  { key:'tag', label:'标签', preview:()=>h('span',{class:'prop-preview'},form.value.tags.length?`${form.value.tags.length} 个`:'未设置'), content:()=>h('div',{},[h('input',{class:'prop-input',placeholder:'搜索或添加...',value:tagInput.value,onInput:(e:any)=>tagInput.value=e.target.value,onKeyup:(e:KeyboardEvent)=>e.key==='Enter'&&tagOps.value.add(),onClick:(e:Event)=>e.stopPropagation()}),form.value.tags.length?h('div',{class:'tag-chips'},form.value.tags.map(tag=>h('span',{class:'tag-chip',onClick:()=>tagOps.value.remove(tag)},`${tag} ×`))):null,filteredTags.value.length?h('div',{class:'tag-options'},filteredTags.value.map(tag=>h('div',{class:'tag-opt',onClick:()=>tagOps.value.toggle(tag)},[h('span',{},tag),form.value.tags.includes(tag)?h('span',{class:'check'},'✓'):null]))):null,tagInput.value&&!props.allTags.includes(tagInput.value)?h('div',{class:'tag-opt add',onClick:tagOps.value.add},`+ "${tagInput.value}"`):null].filter(Boolean)) },
  { key:'desc', label:'描述', preview:()=>h('span',{class:'prop-preview'},form.value.desc?'已设置':'未设置'), content:()=>h('textarea',{class:'prop-textarea',placeholder:'描述（可选）',value:form.value.desc,onInput:(e:any)=>form.value.desc=e.target.value}) },
  { key:'fields', label:'字段', preview:()=>h('span',{class:'prop-preview'},form.value.fields.length?`${form.value.fields.length} 个`:'未设置'), content:()=>h('div',{},[h('input',{class:'prop-input',placeholder:'搜索或添加字段...',value:fieldInput.value,onInput:(e:any)=>fieldInput.value=e.target.value,onKeyup:(e:KeyboardEvent)=>e.key==='Enter'&&fieldOps.value.add(),onClick:(e:Event)=>e.stopPropagation()}),form.value.fields.length?h('div',{class:'tag-chips'},form.value.fields.map(field=>h('span',{class:'tag-chip',onClick:()=>fieldOps.value.remove(field)},`${field} ×`))):null,fieldInput.value?h('div',{class:'tag-opt add',onClick:fieldOps.value.add},`+ "${fieldInput.value}"`):null].filter(Boolean)) },
  { key:'qfmt', label:'前面模板', condition:()=>form.value.collectionId&&form.value.ankiDeckId, content:()=>loadingTemplate.value?h('div',{class:'loading-hint'},'加载中...'):h('textarea',{class:'prop-textarea code',placeholder:'前面模板',value:form.value.qfmt,onInput:(e:any)=>form.value.qfmt=e.target.value}) },
  { key:'afmt', label:'背面模板', condition:()=>form.value.collectionId&&form.value.ankiDeckId, content:()=>loadingTemplate.value?h('div',{class:'loading-hint'},'加载中...'):h('textarea',{class:'prop-textarea code',placeholder:'背面模板',value:form.value.afmt,onInput:(e:any)=>form.value.afmt=e.target.value}) },
  { key:'css', label:'样式 CSS', content:()=>h('textarea',{class:'prop-textarea code',placeholder:'自定义卡片样式（可选）\n例如：.card { font-size: 20px; }',value:form.value.modelCss,onInput:(e:any)=>form.value.modelCss=e.target.value}) }
])

// 树形结构
const displayTree = computed(() => {
  if(!props.packs.length&&editing.value!=='new')return[]
  const map=new Map(),result=[]
  props.packs.forEach(p=>map.set(p.id,{...p,displayName:p.name.split('::').pop(),children:[]}))
  props.packs.forEach(p=>p.parent&&map.has(p.parent)&&map.get(p.parent).children.push(map.get(p.id)))
  const count=n=>n.children?.reduce((a,c)=>{const s=count(c);return{total:a.total+1+s.total,enabled:a.enabled+(c.enabled?1:0)+s.enabled}},{total:0,enabled:0})||{total:0,enabled:0}
  const flatten=(items,lv=0)=>items.forEach(item=>{
    const hasChild=item.children?.length>0,stat=hasChild?count(item):{total:0,enabled:0}
    result.push({...item,level:lv,isParent:hasChild,childTotal:stat.total,childEnabled:stat.enabled})
    hasChild&&expanded.value.has(item.id)&&flatten(item.children,lv+1)
  })
  flatten(props.packs.filter(p=>!p.parent).map(p=>map.get(p.id)))
  editing.value==='new'&&result.push({id:'new',name:'',displayName:'',level:0,isParent:false,childTotal:0,childEnabled:0,stats:{total:0,new:0,learning:0,review:0,suspended:0}})
  return result
})

// 方法
const toggleExpand = (id: string) => expanded.value.has(id)?expanded.value.delete(id):expanded.value.add(id)
const toggleProp = (prop: string) => {
  const isClosing = expandedProp.value===prop
  expandedProp.value = isClosing?null:prop
  if(prop==='icon')emojiLoadCount.value=1
  if(!isClosing&&['fields','qfmt','afmt','css'].includes(prop)&&!templateInfo.value&&!loadingTemplate.value&&form.value.collectionId&&form.value.ankiDeckId)loadTemplateInfo()
}
const togglePreview = () => {
  showPreview.value=!showPreview.value
  previewSide.value=expandedProp.value==='qfmt'?'front':expandedProp.value==='afmt'?'back':'front'
  if(showPreview.value&&!templateInfo.value&&!loadingTemplate.value&&form.value.collectionId&&form.value.ankiDeckId)loadTemplateInfo()
}

const loadTemplateInfo = async () => {
  if(!form.value.collectionId||!form.value.ankiDeckId)return
  loadingTemplate.value=true
  try{
    const{getAnkiDb}=await import('./anki'),ankiDb=await getAnkiDb(form.value.collectionId)
    if(!ankiDb)return
    const models=JSON.parse(ankiDb.exec('SELECT models FROM col')[0].values[0][0] as string)
    const result=ankiDb.exec(`SELECT DISTINCT n.mid FROM cards c JOIN notes n ON c.nid=n.id WHERE c.did=${form.value.ankiDeckId} LIMIT 1`)
    if(result?.[0]?.values?.[0]){
      const mid=result[0].values[0][0],model=models[mid]
      if(model&&model.tmpls?.[0]){
        templateInfo.value={fields:model.flds?.map((f:any)=>f.name)||[],qfmt:model.tmpls[0].qfmt||'',afmt:model.tmpls[0].afmt||'',css:model.css||''}
        if(!form.value.fields.length&&model.flds)form.value.fields=model.flds.map((f:any)=>f.name)
        if(!form.value.qfmt&&model.tmpls[0].qfmt)form.value.qfmt=model.tmpls[0].qfmt
        if(!form.value.afmt&&model.tmpls[0].afmt)form.value.afmt=model.tmpls[0].afmt
        if(!form.value.modelCss&&model.css)form.value.modelCss=model.css
      }
    }
  }catch(e){console.error('[Template]',e)}finally{loadingTemplate.value=false}
}

const renderPreview = () => {
  if(!form.value.fields.length)return'<div style="padding:40px;text-align:center;color:#999">请先添加字段</div>'
  const sampleData:Record<string,string>={}
  form.value.fields.forEach((field:string,idx:number)=>{sampleData[field]=idx===0?'<div style="font-size:24px;font-weight:600;margin:20px 0">示例问题</div>':idx===1?'<div style="font-size:18px;margin:20px 0">这是答案的示例内容</div>':`示例${field}`})
  const parse=(html:string):string=>html.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,(_,f,c)=>sampleData[f]?parse(c):'').replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,(_,f,c)=>!sampleData[f]?parse(c):'').replace(/\{\{(\w+):(\w+)\}\}/g,(_,filter,field)=>sampleData[field]||'').replace(/\{\{(\w+)\}\}/g,(m,f)=>f==='FrontSide'?m:(sampleData[f]||''))
  if(previewSide.value==='front')return parse(form.value.qfmt||'')
  return parse(form.value.afmt||'').replace(/\{\{FrontSide\}\}/g,parse(form.value.qfmt||''))
}

const create=()=>{form.value={...DEFAULT_FORM};resetEditor();editing.value='new'}
const edit=(pack:Pack)=>{form.value={name:pack.name||'',desc:pack.desc||'',icon:pack.icon||'',color:pack.color||'#667eea',titleImg:pack.titleImg||'',tags:pack.tags||[],fields:(pack as any).fields||[],parent:pack.parent,modelCss:pack.modelCss||'',collectionId:pack.collectionId||'',ankiDeckId:pack.ankiDeckId||0,qfmt:(pack as any).qfmt||'',afmt:(pack as any).afmt||''};resetEditor();editing.value=pack.id}
const cancel=()=>{editing.value=null;resetEditor()}
const save=()=>{if(!form.value.name.trim())return showMessage('请输入卡组名称',3000,'error');emit('save',{id:editing.value!=='new'?editing.value:undefined,...form.value});cancel()}
const confirmDelete=(id:string)=>{emit('delete',id);removing.value=null}

const syncSiyuan = async () => {
  if (syncing.value) return
  syncing.value = true
  await syncAllSiyuanDecks(() => emit('reload'))
  syncing.value = false
}

watch(editing, (val) => { if (val) syncing.value = false })

const loadImgs=async()=>{
  try{
    const res=await fetchSyncPost('/api/query/sql',{stmt:`SELECT DISTINCT b.id, b.content, a.value as titleImg FROM blocks b JOIN attributes a ON b.id = a.block_id WHERE a.name = 'title-img' AND b.type = 'd' ORDER BY b.updated DESC LIMIT 50`})
    const user=res?.data?.map((item:any)=>{let url=item.titleImg;const m=url?.match(/url\(["']?([^"')]+)["']?\)/);if(m)url=`background-image:url("${m[1]}")`;return{id:item.id,content:item.content||'无标题',titleImg:url}}).filter((item:any)=>item.titleImg)||[]
    imgs.value=[...GRADIENTS.map((bg,i)=>({id:`g${i}`,content:`内置 ${i+1}`,titleImg:`background-image:${bg}`})),...user]
  }catch{}
}

onMounted(() => {
  loadImgs()
})
</script>

<style lang="scss">
@use './deck.scss';
</style>
