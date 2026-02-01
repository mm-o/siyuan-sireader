<template>
  <div class="deck-pack">
    <div v-if="!packs.length&&!editing" class="sr-empty">{{t('deckNoPacks','暂无卡组')}}</div>
    
    <!-- 卡组列表（包含新建） -->
    <div v-for="pack in displayPacks" :key="pack.id" class="sr-card" :class="{'sr-card-edit':editing===pack.id}">
      <div v-if="editing===pack.id?form.titleImg:pack.titleImg" class="sr-card-overlay" :style="editing===pack.id?form.titleImg:pack.titleImg"></div>
      <span class="sr-bar" :style="{background:editing===pack.id?form.color:pack.color}"></span>
      
      <!-- 编辑/新建模式 - Notion风格布局 -->
      <div v-if="editing===pack.id" class="pack-editor">
        <!-- 标题栏 -->
        <div class="editor-title">
          <button v-if="form.icon" @click.stop="form.icon=''" class="icon-btn">{{ form.icon }}</button>
          <input v-model="form.name" :placeholder="t('deckPackName','卡组名称')" class="title-input" @click.stop>
        </div>
        
        <!-- 属性网格 -->
        <div class="property-grid">
          <div class="property-row" @click.stop="togglePicker('emoji')">
            <label class="property-label">图标</label>
            <div class="property-value">
              <span v-if="form.icon">{{ form.icon }}</span>
              <span v-else class="placeholder">选择图标</span>
            </div>
          </div>
          
          <div class="property-row" @click.stop="togglePicker('color')">
            <label class="property-label">颜色</label>
            <div class="property-value">
              <span class="color-dot" :style="{background:form.color}"></span>
            </div>
          </div>
          
          <div class="property-row" @click.stop="togglePicker('img')">
            <label class="property-label">题头图</label>
            <div class="property-value">
              <span v-if="form.titleImg" class="has-value">已设置</span>
              <span v-else class="placeholder">选择题头图</span>
            </div>
          </div>
          
          <div class="property-row" @click.stop="togglePicker('tag')">
            <label class="property-label">标签</label>
            <div class="property-value">
              <span v-if="form.tags.length" class="has-value">{{ form.tags.length }} 个标签</span>
              <span v-else class="placeholder">添加标签</span>
            </div>
          </div>
        </div>
        
        <!-- 选择器弹窗 -->
        <Transition name="expand">
          <div v-if="picker" class="picker-panel" @click.stop>
            <template v-if="picker==='emoji'">
              <div v-if="loadingEmojis" class="sr-empty">{{t('deckLoading','加载中...')}}</div>
              <div v-else class="emoji-grid">
                <div v-for="(emojis,cat) in emojiCategories" :key="cat" class="emoji-category">
                  <div class="category-title">{{ cat }}</div>
                  <div class="emoji-list">
                    <button v-for="(e,i) in emojis" :key="i" @click="selectEmoji(e)" class="emoji-item">{{ e }}</button>
                  </div>
                </div>
              </div>
            </template>
            
            <template v-else-if="picker==='img'">
              <div v-if="!imgs.length" class="sr-empty">{{t('deckNoImages','暂无题头图')}}</div>
              <div v-else class="image-grid">
                <div v-for="img in imgs" :key="img.id" class="image-item" @click="selectImg(img.titleImg)">
                  <div class="image-preview" :style="img.titleImg"></div>
                  <span class="image-name">{{ img.content }}</span>
                </div>
                <div v-if="form.titleImg" class="image-item clear" @click="selectImg('')">{{t('deckClear','清除')}}</div>
              </div>
            </template>
            
            <template v-else-if="picker==='tag'">
              <input v-model="tagInput" :placeholder="t('deckSearchOrAdd','搜索或添加...')" class="tag-input" @click.stop @keyup.enter="addTag">
              <div v-if="form.tags.length" class="selected-tags">
                <span v-for="tag in form.tags" :key="tag" class="tag-chip" @click.stop="removeTag(tag)">{{ tag }} ×</span>
              </div>
              <div v-if="filteredTags.length" class="tag-list">
                <div v-for="tag in filteredTags" :key="tag" class="tag-option" @click="toggleTag(tag)">
                  <span>{{ tag }}</span>
                  <span v-if="form.tags.includes(tag)" class="check">✓</span>
                </div>
              </div>
              <div v-if="tagInput&&!allTags.includes(tagInput)" class="tag-option add" @click="addTag">+ "{{ tagInput }}"</div>
            </template>
            
            <div v-else-if="picker==='color'" class="color-palette">
              <button v-for="c in COLORS" :key="c.v" @click="selectColor(c.v)" class="color-option" :class="{active:form.color===c.v}" :style="{background:c.v}" :title="c.n"/>
            </div>
          </div>
        </Transition>
        
        <!-- 描述 -->
        <div class="property-section">
          <label class="section-label">描述</label>
          <textarea v-model="form.desc" :placeholder="t('deckDesc','描述（可选）')" class="desc-textarea" @click.stop></textarea>
        </div>
        
        <!-- 操作按钮 -->
        <div class="editor-actions">
          <button @click.stop="cancel" class="btn-cancel">{{t('deckCancel','取消')}}</button>
          <button @click.stop="save" class="btn-save" :disabled="!form.name.trim()">{{editing==='new'?t('deckCreate','创建'):t('deckSave','保存')}}</button>
        </div>
      </div>
      
      <!-- 显示模式 -->
      <div v-else class="sr-main">
        <div class="sr-head">
          <span v-if="pack.icon" style="font-size:24px">{{ pack.icon }}</span>
          <div class="sr-chapter" :style="{marginLeft:pack.icon?'2px':'0'}">{{ pack.name }}</div>
        </div>
        <div class="sr-note" v-html="pack.desc||'暂无描述'"></div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">
          <span v-if="!pack.tags?.length" class="b3-chip b3-chip--small" style="background:#e0e7ff;color:#4338ca">#默认</span>
          <span v-else v-for="tag in pack.tags" :key="tag" class="b3-chip b3-chip--small" style="background:#e0e7ff;color:#4338ca">#{{ tag }}</span>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <span class="b3-chip b3-chip--small" style="background:#dbeafe;color:#1e40af">新{{ pack.stats.new }}</span>
          <span class="b3-chip b3-chip--small" style="background:#fef3c7;color:#92400e">学{{ pack.stats.learning }}</span>
          <span class="b3-chip b3-chip--small" style="background:#dcfce7;color:#166534">复{{ pack.stats.review }}</span>
          <span class="b3-chip b3-chip--small">共{{ pack.stats.total }}</span>
        </div>
        <Transition name="fade">
          <div v-if="removing===pack.id" class="sr-confirm b3-chip b3-chip--middle" @click.stop>
            <button @click="removing=null" class="b3-button b3-button--text">取消</button>
            <button @click="confirmDelete(pack.id)" class="b3-button b3-button--text" style="color:var(--b3-theme-error)">删除</button>
          </div>
        </Transition>
        <div v-if="removing!==pack.id" class="sr-btns">
          <button @click.stop="$emit('toggle',pack)" :class="{active:pack.enabled}" class="b3-tooltips b3-tooltips__nw" :aria-label="pack.enabled?'已启用':'启用'">
            <svg><use :xlink:href="pack.enabled?'#iconCheck':'#iconUncheck'"/></svg>
          </button>
          <button disabled class="b3-tooltips b3-tooltips__nw" aria-label="导出（开发中）" style="opacity:0.3;cursor:not-allowed">
            <svg><use xlink:href="#iconDownload"/></svg>
          </button>
          <button disabled class="b3-tooltips b3-tooltips__nw" aria-label="同步（开发中）" style="opacity:0.3;cursor:not-allowed">
            <svg><use xlink:href="#iconRefresh"/></svg>
          </button>
          <button @click.stop="edit(pack)" class="b3-tooltips b3-tooltips__nw" aria-label="编辑">
            <svg><use xlink:href="#iconEdit"/></svg>
          </button>
          <button v-if="pack.id!=='default'" @click.stop="removing=pack.id" class="b3-tooltips b3-tooltips__nw" aria-label="删除">
            <svg><use xlink:href="#iconTrashcan"/></svg>
          </button>
        </div>
      </div>
    </div>
    
    <!-- 底部按钮 -->
    <div v-if="!editing" class="sr-action-btns">
      <button @click.stop="create" class="sr-btn">新建卡组</button>
      <button @click.stop="$emit('import')" class="sr-btn">导入 Anki</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fetchSyncPost, showMessage } from 'siyuan'
import type { Pack } from './types'

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
  export: [pack: Pack]
  sync: [pack: Pack]
  import: []
}>()

const t = (key: string, fallback: string) => props.i18n?.[key] || fallback

const editing = ref<string | null>(null)
const removing = ref<string | null>(null)
const picker = ref<'emoji'|'img'|'tag'|'color'|null>(null)
const tagInput = ref('')
const imgs = ref<any[]>([])
const form = ref({ name: '', desc: '', icon: '', color: '#667eea', titleImg: '', tags: [] as string[] })
const COLORS = [
  {n:'紫',v:'#667eea'},{n:'蓝',v:'#42a5f5'},{n:'绿',v:'#66bb6a'},{n:'黄',v:'#ffeb3b'},
  {n:'橙',v:'#ff9800'},{n:'红',v:'#ef5350'},{n:'粉',v:'#ec407a'},{n:'灰',v:'#78909c'}
]

const GRADIENTS = [
  "background-image:linear-gradient(to top, #a18cd1 0%, #fbc2eb 100%)",
  "background-image:linear-gradient(to top, #fbc2eb 0%, #a6c1ee 100%)",
  "background-image:linear-gradient(120deg, #a6c0fe 0%, #f68084 100%)",
  "background-image:linear-gradient(120deg, #e0c3fc 0%, #8ec5fc 100%)",
  "background-image:linear-gradient(to right, #fa709a 0%, #fee140 100%)",
  "background-image:linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "background-image:linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "background-image:linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "background-image:linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "background-image:linear-gradient(135deg, #fa8bff 0%, #2bd2ff 90%, #2bff88 100%)",
  "background-image:linear-gradient(to top, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)",
  "background-image:linear-gradient(120deg, #f6d365 0%, #fda085 100%)",
  "background-image:linear-gradient(to top, #fbc2eb 0%, #a6c1ee 100%)",
  "background-image:linear-gradient(to top, #fdcbf1 0%, #fdcbf1 1%, #e6dee9 100%)",
  "background-image:linear-gradient(120deg, #a1c4fd 0%, #c2e9fb 100%)",
  "background-image:linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)",
  "background-image:linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)",
  "background-image:linear-gradient(to top, #cfd9df 0%, #e2ebf0 100%)",
  "background-image:linear-gradient(to right, #eea2a2 0%, #bbc1bf 19%, #57c6e1 42%, #b49fda 79%, #7ac5d8 100%)",
  "background-image:linear-gradient(-20deg, #e9defa 0%, #fbfcdb 100%)"
]

// 显示列表：如果正在新建，在末尾添加虚拟卡组
const displayPacks = computed(() => {
  if (editing.value === 'new') {
    return [...props.packs, { id: 'new', name: '', desc: '', icon: '', color: '#667eea', titleImg: '', tags: [], stats: { new: 0, learning: 0, review: 0, total: 0 } } as Pack]
  }
  return props.packs
})

const filteredTags = computed(() => {
  const q = tagInput.value.toLowerCase()
  return q ? props.allTags.filter(t => t.toLowerCase().includes(q)) : props.allTags
})

const loadImgs = async () => {
  try {
    const res = await fetchSyncPost('/api/query/sql', { 
      stmt: `SELECT DISTINCT b.id, b.content, a.value as titleImg FROM blocks b 
             JOIN attributes a ON b.id = a.block_id WHERE a.name = 'title-img' AND b.type = 'd' 
             ORDER BY b.updated DESC LIMIT 50` 
    })
    const user = res?.data?.map((item: any) => {
      let url = item.titleImg
      const m = url?.match(/url\(["']?([^"')]+)["']?\)/)
      if (m) url = `background-image:url("${m[1]}")`
      return { id: item.id, content: item.content || '无标题', titleImg: url }
    }).filter((item: any) => item.titleImg) || []
    
    imgs.value = [...GRADIENTS.map((bg, i) => ({ id: `g${i}`, content: `内置 ${i+1}`, titleImg: bg })), ...user]
  } catch {}
}

const togglePicker = (type: typeof picker.value) => picker.value = picker.value === type ? null : type
const selectEmoji = (e: string) => { form.value.icon = e; picker.value = null }
const selectImg = (img: string) => { form.value.titleImg = img; picker.value = null }
const selectColor = (c: string) => { form.value.color = c; picker.value = null }

const toggleTag = (tag: string) => {
  const idx = form.value.tags.indexOf(tag)
  idx > -1 ? form.value.tags.splice(idx, 1) : form.value.tags.push(tag)
}

const removeTag = (tag: string) => form.value.tags.splice(form.value.tags.indexOf(tag), 1)

const addTag = () => {
  const tag = tagInput.value.trim()
  if (tag && !form.value.tags.includes(tag)) {
    form.value.tags.push(tag)
    tagInput.value = ''
  }
}

const create = () => {
  form.value = { name: '', desc: '', icon: '', color: '#667eea', titleImg: '', tags: [] }
  editing.value = 'new'
}

const edit = (pack: Pack) => {
  form.value = {
    name: pack.name || '',
    desc: pack.desc || '',
    icon: pack.icon || '',
    color: pack.color || '#667eea',
    titleImg: pack.titleImg || '',
    tags: pack.tags || []
  }
  editing.value = pack.id
}

const cancel = () => {
  editing.value = null
  picker.value = null
}

const save = () => {
  if (!form.value.name.trim()) return showMessage('请输入卡组名称', 3000, 'error')
  emit('save', { id: editing.value !== 'new' ? editing.value : undefined, ...form.value })
  cancel()
}

const confirmDelete = (id: string) => {
  emit('delete', id)
  removing.value = null
}

onMounted(() => loadImgs())
</script>

<style scoped lang="scss">
@use './deck.scss';

.sr-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}
</style>
