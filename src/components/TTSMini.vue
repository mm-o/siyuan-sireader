<template>
  <Transition name="tts-fade">
    <section v-if="visible" ref="popupRef" class="tts-mini" :class="{ expanded }" role="status" :aria-label="tts.title.value || props.i18n?.ttsControl || 'Reading controls'" @click.stop>
      <div class="tts-mini-bar">
        <button class="tts-mini-main" :aria-expanded="expanded" :aria-label="props.i18n?.expandTts || 'Expand reading controls'" @click="expanded = !expanded">
          <span class="tts-mini-cover">
            <img v-if="coverUrl" :src="coverUrl" :alt="tts.title.value || props.i18n?.cover || 'Cover'" loading="lazy" decoding="async" @error="coverUrl = ''">
            <svg v-else aria-hidden="true"><use xlink:href="#lucide-volume-2" /></svg>
          </span>
          <span class="tts-mini-info">
            <strong>{{ tts.title.value || props.i18n?.ttsReadingTitle || 'Reading aloud' }}</strong>
            <span>{{ tts.currentText.value || (tts.paused.value ? (props.i18n?.ttsPaused || 'Paused') : (props.i18n?.ttsReading || 'Reading aloud')) }}</span>
          </span>
          <svg class="tts-mini-chevron" :class="{ rotated: expanded }" aria-hidden="true"><use xlink:href="#iconDown" /></svg>
        </button>
        <div class="tts-mini-tools">
          <button :aria-label="props.i18n?.previousSentence || 'Previous sentence'" @click="tts.jump(-1)"><svg><use xlink:href="#iconLeft" /></svg></button>
          <button class="primary" :aria-label="tts.isActive.value && !tts.paused.value ? (props.i18n?.pause || 'Pause') : (props.i18n?.play || 'Play')" @click="playOrPause"><svg><use :xlink:href="tts.isActive.value && !tts.paused.value ? '#iconPause' : '#iconPlay'" /></svg></button>
          <button :aria-label="props.i18n?.nextSentence || 'Next sentence'" @click="tts.jump(1)"><svg><use xlink:href="#iconRight" /></svg></button>
          <button :aria-label="props.i18n?.ttsStop || 'Stop reading'" @click="stop"><svg><use xlink:href="#iconClose" /></svg></button>
        </div>
      </div>

      <div v-if="expanded" class="tts-mini-panel">
        <div class="tts-mini-current">{{ tts.currentText.value || props.i18n?.readyToRead || 'Ready to read' }}</div>
        <details v-if="ttsSettings" class="tts-mini-settings">
          <summary>{{ props.i18n?.ttsSettings || 'Reading settings' }}</summary>
          <div class="tts-mini-fields">
            <label class="wide"><span>{{ props.i18n?.voice || 'Voice' }}</span><select class="b3-select" :value="ttsSettings.voice" @focus="loadVoices" @change="update('voice', ($event.target as HTMLSelectElement).value)"><option v-if="loadingVoices" disabled>{{ props.i18n?.loading || 'Loading...' }}</option><option v-for="voice in voiceOptions" :key="voice.name" :value="voice.name">{{ voice.displayName || voice.name }}</option></select></label>
            <label><span>{{ props.i18n?.ttsRate || 'Speech rate' }} <b>{{ Number(ttsSettings.rate || 1).toFixed(1) }}x</b></span><input class="b3-slider" type="range" min="0.5" max="2" step="0.1" :value="ttsSettings.rate || 1" @input="update('rate', Number(($event.target as HTMLInputElement).value))"></label>
            <label><span>{{ props.i18n?.ttsPitch || 'Pitch' }} <b>{{ Number(ttsSettings.pitch || 1).toFixed(1) }}</b></span><input class="b3-slider" type="range" min="0.5" max="1.5" step="0.1" :value="ttsSettings.pitch || 1" @input="update('pitch', Number(($event.target as HTMLInputElement).value))"></label>
            <label><span>{{ props.i18n?.ttsSentenceGap || 'Sentence gap' }} <b>{{ Number(ttsSettings.sentenceGap || 0).toFixed(1) }}s</b></span><input class="b3-slider" type="range" min="0" max="3" step="0.1" :value="ttsSettings.sentenceGap || 0" @input="update('sentenceGap', Number(($event.target as HTMLInputElement).value))"></label>
            <label><span>{{ props.i18n?.ttsParagraphGap || 'Paragraph gap' }} <b>{{ Number(ttsSettings.paragraphGap ?? 0.3).toFixed(1) }}s</b></span><input class="b3-slider" type="range" min="0" max="5" step="0.1" :value="ttsSettings.paragraphGap ?? 0.3" @input="update('paragraphGap', Number(($event.target as HTMLInputElement).value))"></label>
          </div>
        </details>
      </div>
    </section>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { settingsManager, type ReaderSettings } from '@/composables/useSetting'
import { bookshelfManager } from '@/core/bookshelf'
import { getTTSController } from '@/services/TTSPlayer'
import type { TTSVoice } from '@/services/TTSEngine'

const props = defineProps<{ i18n?: any }>()
const tts = getTTSController()
const visible = ref(false)
const expanded = ref(false)
const popupRef = ref<HTMLElement>()
const settings = ref<ReaderSettings | null>((window as any).__sireader_settings || null)
const coverUrl = ref('')
const voices = ref<TTSVoice[]>([])
const loadingVoices = ref(false)
let saveTimer: number | undefined

const ttsSettings = computed(() => settings.value?.tts || null)
const voiceOptions = computed(() => {
  const current = ttsSettings.value?.voice
  const favorites = settings.value?.tts?.favoriteVoices || []
  const list = [...voices.value.filter(v => v.isLocal), ...favorites.filter(v => !voices.value.some(local => local.name === v.name))]
  return current && !list.some(v => v.name === current) ? [{ name: current, displayName: current, locale: '', isLocal: false }, ...list] : list
})

const position = () => nextTick(() => {
  const btn = document.querySelector('#tts-btn') as HTMLElement | null
  if (!btn || !popupRef.value) return
  const rect = btn.getBoundingClientRect()
  popupRef.value.style.right = `${window.innerWidth - rect.right}px`
  popupRef.value.style.bottom = `${window.innerHeight - rect.top + 8}px`
})
const syncSettings = (e?: Event) => { settings.value = (e as CustomEvent)?.detail || (window as any).__sireader_settings || settings.value }
const loadCover = async () => {
  const info = (window as any).__sireader_bookInfo
  if (info?.cover) { coverUrl.value = bookshelfManager.getCoverUrl(info); return }
  const url = (window as any).__currentBookUrl
  if (!url) return
  try { const book = await bookshelfManager.getBook(url); if (book) coverUrl.value = bookshelfManager.getCoverUrl(book) } catch {}
}
const toggle = (event?: Event) => {
  const open = (event as CustomEvent)?.detail?.open
  visible.value = open === true ? true : !visible.value
  if (visible.value) { syncSettings(); loadCover(); position() }
}
const clickOut = (e: MouseEvent) => { const target = e.target as HTMLElement | null; if (!target?.closest('#tts-btn,.tts-mini')) { visible.value = false; expanded.value = false } }
const stop = () => { tts.destroy(); visible.value = false; expanded.value = false }
const playOrPause = () => tts.isActive.value ? tts.togglePause() : window.dispatchEvent(new CustomEvent('tts:start-reader'))
const loadVoices = async () => {
  if (loadingVoices.value || voices.value.length) return
  loadingVoices.value = true
  try { const { loadLocalVoices, loadOnlineVoices } = await import('@/services/TTSEngine'); voices.value = [...await loadLocalVoices(), ...await loadOnlineVoices()] } finally { loadingVoices.value = false }
}
const saveSettings = () => { if (!settings.value) return; clearTimeout(saveTimer); saveTimer = window.setTimeout(() => settings.value && settingsManager.save(settings.value).catch(() => {}), 200) }
const update = (key: string, value: unknown) => { if (!settings.value?.tts) return; (settings.value.tts as any)[key] = value; tts.updateConfig(settings.value.tts); saveSettings() }

watch(tts.isActive, active => { if (!active) { visible.value = false; expanded.value = false } })
onMounted(() => {
  !settings.value && settingsManager.get().then(v => settings.value = v).catch(() => {})
  window.addEventListener('tts:toggle-mini', toggle)
  window.addEventListener('sireaderSettingsUpdated', syncSettings)
  window.addEventListener('resize', position)
  document.addEventListener('click', clickOut)
})
onUnmounted(() => { clearTimeout(saveTimer); window.removeEventListener('tts:toggle-mini', toggle); window.removeEventListener('sireaderSettingsUpdated', syncSettings); window.removeEventListener('resize', position); document.removeEventListener('click', clickOut) })
</script>

<style scoped>
.tts-mini{position:fixed;z-index:99999;width:min(336px,calc(100vw - 16px));overflow:hidden;border:1px solid var(--b3-border-color);border-radius:12px;background:var(--b3-theme-surface);box-shadow:0 8px 24px #0003;color:var(--b3-theme-on-surface);backdrop-filter:blur(14px)}
.tts-mini-bar{display:flex;align-items:center;gap:2px;padding:4px 5px}.tts-mini-main{display:flex;min-width:0;flex:1;align-items:center;gap:7px;border:0;background:none;color:inherit;text-align:left;cursor:pointer}.tts-mini-cover{display:flex;width:30px;height:30px;flex:none;align-items:center;justify-content:center;overflow:hidden;border-radius:7px;background:var(--b3-theme-background-light);color:var(--b3-theme-primary)}.tts-mini-cover img{width:100%;height:100%;object-fit:cover}.tts-mini-cover svg{width:16px;height:16px}.tts-mini-info{display:flex;min-width:0;flex:1;flex-direction:column;gap:1px}.tts-mini-info strong,.tts-mini-info span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tts-mini-info strong{font-size:12px}.tts-mini-info span{font-size:10px;color:var(--b3-theme-on-surface-variant)}.tts-mini-chevron{width:14px;height:14px;color:var(--b3-theme-on-surface-variant);transition:transform .18s}.tts-mini-chevron.rotated{transform:rotate(180deg)}
.tts-mini-tools{display:flex;flex:none;align-items:center}.tts-mini-tools button{display:flex;width:27px;height:27px;align-items:center;justify-content:center;border:0;border-radius:50%;background:transparent;color:var(--b3-theme-on-surface-variant);cursor:pointer}.tts-mini-tools button:hover{background:var(--b3-theme-background-light);color:var(--b3-theme-primary)}.tts-mini-tools button.primary{background:var(--b3-theme-primary);color:var(--b3-theme-on-primary)}.tts-mini-tools svg{width:15px;height:15px}
.tts-mini-panel{border-top:1px solid var(--b3-border-color);padding:8px 10px}.tts-mini-current{max-height:48px;overflow:auto;font-size:12px;line-height:1.5;color:var(--b3-theme-on-surface-variant)}.tts-mini-settings{margin-top:7px;border-top:1px solid var(--b3-border-color)}.tts-mini-settings summary{padding:7px 0 3px;cursor:pointer;font-size:11px}.tts-mini-fields{display:grid;grid-template-columns:1fr 1fr;gap:7px}.tts-mini-fields label{display:grid;gap:3px;font-size:10px;color:var(--b3-theme-on-surface-variant)}.tts-mini-fields label.wide{grid-column:1/-1;display:flex;align-items:center;gap:8px}.tts-mini-fields .wide select{min-width:0;flex:1;height:26px}.tts-mini-fields label span{display:flex;justify-content:space-between}.tts-mini-fields b{font-weight:500;color:var(--b3-theme-on-surface)}.tts-fade-enter-active,.tts-fade-leave-active{transition:opacity .15s,transform .15s}.tts-fade-enter-from,.tts-fade-leave-to{opacity:0;transform:translateY(5px)}
@media(max-width:380px){.tts-mini-fields{grid-template-columns:1fr}.tts-mini-fields label.wide{grid-column:auto}}
</style>
