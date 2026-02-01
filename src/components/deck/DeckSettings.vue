<template>
  <div v-if="loading" class="sr-empty">加载中...</div>
  <div v-else-if="!form" class="sr-empty">
    <p>⚠️ 加载失败</p>
    <p class="hint">请先启用至少一个卡组</p>
    <button @click="loadSettings" class="sr-btn">重新加载</button>
  </div>
  <div v-else class="sr-list">
    <div class="ds-card">
      <h3>笔记本绑定</h3>
      <div class="ds-field">
        <label>目标笔记本</label>
        <select v-model="form.notebookId" class="b3-select">
          <option value="">未选择</option>
          <option v-for="nb in notebooks" :key="nb.id" :value="nb.id">
            {{ nb.icon ? String.fromCodePoint(parseInt(nb.icon, 16)) + ' ' : '' }}{{ nb.name }}
          </option>
        </select>
        <small>卡组文档将创建在此笔记本</small>
      </div>
    </div>
    
    <div class="ds-card">
      <h3>每日上限</h3>
      <div class="ds-field">
        <label>每日新卡片</label>
        <input type="number" v-model.number="form.newCardsPerDay" min="0" max="9999" class="b3-text-field">
      </div>
      <div class="ds-field">
        <label>每日复习上限</label>
        <input type="number" v-model.number="form.reviewsPerDay" min="0" max="9999" class="b3-text-field">
      </div>
    </div>
    
    <div class="ds-card">
      <h3>新卡片</h3>
      <div class="ds-field">
        <label>学习步骤</label>
        <input type="text" v-model="learningStepsText" placeholder="1 10" class="b3-text-field">
        <small>首次学习的复习间隔（分钟），空格分隔，如"1 10"表示1分钟后、10分钟后各复习一次</small>
      </div>
      <div class="ds-field">
        <label>首次复习间隔（天）</label>
        <input type="number" v-model.number="form.graduatingInterval" min="1" max="365" class="b3-text-field">
        <small>完成学习步骤后，首次进入复习的间隔天数</small>
      </div>
      <div class="ds-field">
        <label>简单卡片间隔（天）</label>
        <input type="number" v-model.number="form.easyInterval" min="1" max="365" class="b3-text-field">
        <small>点击"简单"后，直接进入复习的间隔天数</small>
      </div>
      <div class="ds-field">
        <label>新卡片顺序</label>
        <select v-model="form.newCardOrder" class="b3-select">
          <option value="random">随机</option>
          <option value="sequential">顺序</option>
        </select>
      </div>
      <div class="ds-field">
        <label>学习优先级</label>
        <select v-model="form.newReviewPriority" class="b3-select">
          <option value="mix">新卡片和复习混合</option>
          <option value="new-first">先学新卡片</option>
          <option value="review-first">先复习旧卡片</option>
        </select>
      </div>
    </div>
    
    <div class="ds-card">
      <h3>遗忘卡片</h3>
      <div class="ds-field">
        <label>重学步骤</label>
        <input type="text" v-model="relearningStepsText" placeholder="10" class="b3-text-field">
        <small>遗忘后重新学习的复习间隔（分钟），空格分隔</small>
      </div>
      <div class="ds-field">
        <label>最小复习间隔（天）</label>
        <input type="number" v-model.number="form.minimumInterval" min="1" max="365" class="b3-text-field">
        <small>遗忘后重新进入复习的最小间隔天数</small>
      </div>
      <div class="ds-field">
        <label>困难卡片阈值</label>
        <input type="number" v-model.number="form.leechThreshold" min="1" max="99" class="b3-text-field">
        <small>遗忘多少次后标记为困难卡片</small>
      </div>
    </div>
    
    <div class="ds-card">
      <h3>展示顺序</h3>
      <div class="ds-field">
        <label>新卡片抽取方式</label>
        <select v-model="form.newCardGatherPriority" class="b3-select">
          <option value="deck">按卡组顺序</option>
          <option value="position">按添加顺序</option>
          <option value="random">随机抽取</option>
        </select>
      </div>
      <div class="ds-field">
        <label>复习卡片排序</label>
        <select v-model="form.reviewSortOrder" class="b3-select">
          <option value="due">按到期时间</option>
          <option value="random">随机顺序</option>
          <option value="interval">按间隔长短</option>
        </select>
      </div>
    </div>
    
    <div class="ds-card">
      <h3>智能算法</h3>
      <div class="ds-field">
        <label>启用 FSRS 算法</label>
        <input type="checkbox" v-model="form.enableFsrs" class="b3-switch">
        <small>使用思源内置的智能间隔算法，根据记忆规律自动调整复习时间</small>
      </div>
      <div v-if="form.enableFsrs" class="ds-field">
        <label>目标记忆率：{{ (form.desiredRetention * 100).toFixed(0) }}%</label>
        <input type="range" v-model.number="form.desiredRetention" min="0.7" max="0.97" step="0.01" class="b3-slider" style="width:100%">
        <small>设置越高，复习越频繁，记得越牢</small>
      </div>
    </div>
    
    <div class="ds-card">
      <h3>暂时搁置</h3>
      <div class="ds-field">
        <label>搁置相关新卡片</label>
        <input type="checkbox" v-model="form.buryRelatedNew" class="b3-switch">
        <small>学习一张卡片后，同一笔记的其他新卡片今天不再出现</small>
      </div>
      <div class="ds-field">
        <label>搁置相关复习卡片</label>
        <input type="checkbox" v-model="form.buryRelatedReviews" class="b3-switch">
        <small>复习一张卡片后，同一笔记的其他复习卡片今天不再出现</small>
      </div>
    </div>
    
    <div class="ds-card ds-accordion" @click="expanded.advanced = !expanded.advanced">
      <h3>
        高级设置
        <svg class="ds-arrow" :class="{expanded: expanded.advanced}" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
      </h3>
      <Transition name="expand">
        <div v-if="expanded.advanced" @click.stop>
          <div class="ds-field">
            <label>最大复习间隔（天）</label>
            <input type="number" v-model.number="form.maxInterval" min="1" max="36500" class="b3-text-field">
            <small>复习间隔的上限，默认 36500 天（100 年）</small>
          </div>
          <div class="ds-field">
            <label>初始难度系数</label>
            <input type="number" v-model.number="form.startingEase" min="1.3" max="5.0" step="0.1" class="b3-text-field">
            <small>新卡片的初始难度，默认 2.5，越大间隔增长越快</small>
          </div>
          <div class="ds-field">
            <label>简单按钮加成</label>
            <input type="number" v-model.number="form.easyBonus" min="1.0" max="3.0" step="0.1" class="b3-text-field">
            <small>点击"简单"时的间隔倍数，默认 1.3</small>
          </div>
          <div class="ds-field">
            <label>间隔倍数</label>
            <input type="number" v-model.number="form.intervalModifier" min="0.5" max="2.0" step="0.05" class="b3-text-field">
            <small>全局调整复习间隔，默认 1.0，调大复习更少，调小复习更频繁</small>
          </div>
          <div class="ds-field">
            <label>困难按钮倍数</label>
            <input type="number" v-model.number="form.hardInterval" min="1.0" max="2.0" step="0.1" class="b3-text-field">
            <small>点击"困难"时的间隔倍数，默认 1.2</small>
          </div>
          <div class="ds-field">
            <label>遗忘后间隔比例</label>
            <input type="number" v-model.number="form.newInterval" min="0.0" max="1.0" step="0.05" class="b3-text-field">
            <small>遗忘后保留原间隔的比例，默认 0（从头开始）</small>
          </div>
        </div>
      </Transition>
    </div>
    
    <div class="ds-card ds-accordion" @click="expanded.other = !expanded.other">
      <h3>
        其他设置
        <svg class="ds-arrow" :class="{expanded: expanded.other}" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
      </h3>
      <Transition name="expand">
        <div v-if="expanded.other" @click.stop>
          <h4>音频播放</h4>
          <div class="ds-field">
            <label>自动播放问题音频</label>
            <input type="checkbox" v-model="form.autoPlayAudio" class="b3-switch">
            <small>显示卡片正面时自动播放音频</small>
          </div>
          <div class="ds-field">
            <label>自动播放答案音频</label>
            <input type="checkbox" v-model="form.playAnswerAudio" class="b3-switch">
            <small>显示卡片背面时自动播放音频</small>
          </div>
          
          <h4>答题计时</h4>
          <div class="ds-field">
            <label>显示计时器</label>
            <input type="checkbox" v-model="form.showTimer" class="b3-switch">
            <small>显示每张卡片的答题用时</small>
          </div>
          <div v-if="form.showTimer" class="ds-field">
            <label>最大答题时间（秒）</label>
            <input type="number" v-model.number="form.maxAnswerSeconds" min="5" max="600" class="b3-text-field">
            <small>超过此时间会有提示</small>
          </div>
          
          <h4>自动翻页</h4>
          <div class="ds-field">
            <label>自动显示答案</label>
            <input type="checkbox" v-model="form.autoShowAnswer" class="b3-switch">
            <small>显示问题后自动翻到答案</small>
          </div>
          <div v-if="form.autoShowAnswer" class="ds-field">
            <label>延迟时间（秒）</label>
            <input type="number" v-model.number="form.autoAnswerDelay" min="0" max="60" class="b3-text-field">
          </div>
          <div class="ds-field">
            <label>自动下一张</label>
            <input type="checkbox" v-model="form.autoNextCard" class="b3-switch">
            <small>评分后自动进入下一张卡片</small>
          </div>
          <div v-if="form.autoNextCard" class="ds-field">
            <label>延迟时间（秒）</label>
            <input type="number" v-model.number="form.autoNextDelay" min="0" max="60" class="b3-text-field">
          </div>
          
          <h4>休息日设置</h4>
          <div class="ds-field">
            <label>轻松日</label>
            <input type="text" v-model="easyDaysText" placeholder="0,6" class="b3-text-field">
            <small>这些日期不计入复习，0=周日，6=周六，用逗号分隔</small>
          </div>
        </div>
      </Transition>
    </div>
    
    <div class="sr-action-btns">
      <button @click="resetToDefault" class="sr-btn">重置为默认</button>
      <button @click="saveSettings" class="sr-btn sr-btn-gradient" :disabled="saving">{{ saving ? '保存中...' : '保存' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { showMessage, fetchSyncPost } from 'siyuan'
import { getSettingsManager } from './settings'
import { getDatabase } from './database'
import type { DeckSettings } from './types'

const loading = ref(true)
const saving = ref(false)
const form = ref<DeckSettings | null>(null)
const notebooks = ref<any[]>([])
const expanded = ref({ advanced: false, other: false })
const deckId = ref<string>('')
const deckName = ref<string>('')

const learningStepsText = computed({
  get: () => form.value?.learningSteps?.join(' ') || '',
  set: (v: string) => {
    if (form.value) {
      form.value.learningSteps = v.split(' ').map(Number).filter(n => !isNaN(n) && n > 0)
    }
  }
})

const relearningStepsText = computed({
  get: () => form.value?.relearningSteps?.join(' ') || '',
  set: (v: string) => {
    if (form.value) {
      form.value.relearningSteps = v.split(' ').map(Number).filter(n => !isNaN(n) && n > 0)
    }
  }
})

const easyDaysText = computed({
  get: () => form.value?.easyDays?.join(',') || '',
  set: (v: string) => {
    if (form.value) {
      form.value.easyDays = v.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 6)
    }
  }
})

const loadNotebooks = async () => {
  try {
    const { data } = await fetchSyncPost('/api/notebook/lsNotebooks', {})
    if (data?.notebooks) notebooks.value = data.notebooks
  } catch (e) {
    console.error('[DeckSettings] Load notebooks failed:', e)
  }
}

const loadSettings = async () => {
  loading.value = true
  try {
    const db = await getDatabase()
    const enabledDecks = await db.getEnabledDecks()
    
    if (enabledDecks.length === 0) {
      showMessage('请先启用至少一个卡组', 3000, 'info')
      loading.value = false
      return
    }
    
    // 使用第一个启用的卡组
    const firstDeck = enabledDecks[0]
    deckId.value = firstDeck.id
    deckName.value = firstDeck.name
    
    const manager = getSettingsManager()
    
    let settings = await manager.getSettings(deckId.value)
    if (!settings) {
      settings = manager.getDefaultSettings(deckId.value, deckName.value)
      await manager.saveSettings(settings)
    }
    
    form.value = { ...settings }
  } catch (e) {
    console.error('[DeckSettings] Load failed:', e)
    showMessage('加载设置失败', 3000, 'error')
  } finally {
    loading.value = false
  }
}

const saveSettings = async () => {
  if (!form.value) return
  
  saving.value = true
  try {
    await getSettingsManager().saveSettings(form.value)
    showMessage('设置已保存', 2000, 'info')
    // 触发卡片列表刷新
    window.dispatchEvent(new Event('sireader:deck-updated'))
  } catch (e) {
    console.error('[DeckSettings] Save failed:', e)
    showMessage('保存失败', 3000, 'error')
  } finally {
    saving.value = false
  }
}

const resetToDefault = async () => {
  if (!confirm('确定要重置为默认设置吗？')) return
  
  try {
    const manager = getSettingsManager()
    const defaults = manager.getDefaultSettings(deckId.value, deckName.value)
    form.value = { ...defaults }
    await manager.saveSettings(defaults)
    showMessage('已重置为默认设置', 2000, 'info')
    // 触发卡片列表刷新
    window.dispatchEvent(new Event('sireader:deck-updated'))
  } catch (e) {
    console.error('[DeckSettings] Reset failed:', e)
    showMessage('重置失败', 3000, 'error')
  }
}

onMounted(() => {
  loadNotebooks()
  loadSettings()
})
</script>

<style scoped lang="scss">
@use './deck.scss';
</style>
