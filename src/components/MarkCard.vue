<template>
  <div class="sr-main" @click="!editing && emit('go')">
    <div class="sr-head">
      <div class="sr-time">{{ time }}</div>
      <slot name="actions" />
    </div>

    <div v-if="editing || tags.length" class="sr-tag-list" :class="{ 'sr-tag-editor': editing }">
      <template v-if="editing">
        <input
          :value="tagInput"
          class="sr-tag-input-inline"
          :placeholder="props.i18n?.inputTags || 'Tags'"
          @click.stop
          @pointerdown.stop
          @input="emit('update:tagInput', ($event.target as HTMLInputElement).value)"
        />
        <div v-if="tagGroups.length" class="sr-tag-options">
          <template v-for="group in tagGroups" :key="group.name">
            <button
              class="sr-tag-group-title"
              :class="{ active: isGroupActive(group.tags) }"
              @click.stop="emit('toggle-tags', group.tags)"
            >{{ group.name }}</button>
            <button
              v-for="tag in group.tags"
              :key="tag"
              class="sr-tag-chip"
              :class="{ active: selectedTags.includes(tag) }"
              @click.stop="emit('toggle-tags', [tag])"
            >#{{ tag }}</button>
          </template>
        </div>
      </template>
      <span v-else v-for="tag in tags" :key="tag" class="sr-tag-chip">#{{ tag }}</span>
    </div>

    <div v-if="editing" class="sr-title-edit">
      <div v-if="colorOptions.length" class="sr-color-picker">
        <button
          v-for="color in colorOptions"
          :key="color.key"
          class="sr-color-swatch"
          :class="{ active: colorValue === color.value }"
          :style="{ background: color.bg }"
          @click.stop="emit('update:colorValue', color.value)"
        />
      </div>
      <div v-if="styleOptions.length" class="sr-style-picker">
        <button
          v-for="style in styleOptions"
          :key="style.value"
          class="sr-style-btn"
          :class="{ active: styleValue === style.value }"
          :title="style.label"
          @click.stop="emit('update:styleValue', style.value)"
        >
          <svg v-if="style.icon" class="sr-style-svg"><use :xlink:href="style.icon" /></svg>
          <span v-else class="sr-style-icon" :data-type="style.value">A</span>
        </button>
      </div>
      <div class="sr-title" :class="titleClass" :style="{ '--mark-color': markColor }">
        <div class="sr-title-text" :title="text">{{ text }}</div>
      </div>
    </div>
    <div v-else class="sr-title" :class="titleClass" :style="{ '--mark-color': markColor }">
      <div v-if="chapter" class="sr-inline-chapter" :title="chapter">{{ chapter }}</div>
      <div v-if="text" class="sr-title-text" :title="text">{{ text }}</div>
      <slot name="meta" />
    </div>

    <textarea
      :class="['b3-text-field', 'sr-note-edit', { 'sr-note-edit--hidden': !editing }]"
      ref="noteInput"
      :value="note"
      :tabindex="editing ? 0 : -1"
      :placeholder="props.i18n?.inputNote || props.i18n?.note || 'Note'"
      rows="4"
      @input="emit('update:note', ($event.target as HTMLTextAreaElement).value)"
      @keydown.ctrl.enter.prevent="emit('save')"
      @keydown.meta.enter.prevent="emit('save')"
    />
    <div v-if="!editing && note" class="sr-note" :title="note">{{ note }}</div>

    <slot name="extra" />

    <div v-if="editable" class="sr-card-foot">
      <template v-if="editing">
        <button class="sr-text-btn" @click.stop="emit('cancel')">{{ props.i18n?.cancel || 'Cancel' }}</button>
        <button class="sr-text-btn sr-text-btn--primary" @click.stop="emit('save')">{{ props.i18n?.save || 'Save' }}</button>
      </template>
      <template v-else>
        <button class="sr-text-btn" @pointerdown.stop.prevent="beginEdit" @click.stop="beginEdit">
          <svg><use xlink:href="#iconTags" /></svg>
          <span>{{ props.i18n?.inputTags || 'Tags' }}</span>
        </button>
        <button class="sr-text-btn sr-text-btn--primary" @pointerdown.stop.prevent="beginEdit" @click.stop="beginEdit">
          <svg><use xlink:href="#iconEdit" /></svg>
          <span>{{ props.i18n?.note || 'Note' }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
const normalizeMarkTags = (tags?: unknown[]) => Array.from(new Set((tags || []).map(tag => String(tag || '').trim()).filter(Boolean)))
export const parseMarkTags = (value = '') => normalizeMarkTags(value.split(/[#;\uFF1B,\uFF0C\u3001\n]/))
export const formatMarkTags = (tags?: unknown[]) => normalizeMarkTags(tags).join(', ')
export const getMarkTags = (item: any) => normalizeMarkTags(item?.tags || [])
export const collectMarkTags = (source: any[] | any = [], extra: unknown[] = []) => {
  const items = Array.isArray(source) ? source : source?.getAll?.() || []
  return [...new Set([...items.flatMap(getMarkTags), ...normalizeMarkTags(extra)])].sort((a, b) => a.localeCompare(b)).slice(0, 24)
}
export const toggleMarkTags = (tags: unknown[] = [], next: unknown[] = []) => {
  const base = normalizeMarkTags(tags), items = normalizeMarkTags(next)
  return normalizeMarkTags(items.every(tag => base.includes(tag)) ? base.filter(tag => !items.includes(tag)) : [...base, ...items])
}
export type MarkTagGroup = { name: string; tags: string[] }
const UNGROUPED_TAG_GROUP = '\u672A\u5206\u7EC4'
export const parseMarkTagPresets = (value = ''): MarkTagGroup[] => value.split('\n').map(line => {
  const [name, tags = ''] = line.split(/[:\uFF1A]/)
  return { name: name?.trim(), tags: parseMarkTags(tags) }
}).filter(group => group.name && (group.tags.length || group.name === UNGROUPED_TAG_GROUP))
export const collectMarkTagGroups = (source: any[] | any = [], extra: unknown[] = [], preset = (globalThis as any).window?.__sireader_settings?.annotationTagPresets || '') => {
  const presetGroups = parseMarkTagPresets(preset)
  const groups = presetGroups.filter(group => group.name !== UNGROUPED_TAG_GROUP), ungroupedPreset = presetGroups.find(group => group.name === UNGROUPED_TAG_GROUP)
  const used = collectMarkTags(source, extra)
  const presetTags = new Set(groups.flatMap(group => group.tags))
  const ungrouped = normalizeMarkTags([...(ungroupedPreset?.tags || []), ...used.filter(tag => !presetTags.has(tag))])
  return [...groups, { name: UNGROUPED_TAG_GROUP, tags: ungrouped }]
}
</script>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { focusMobileEditable } from '@/utils/mobile'

type ColorOption = { key: string; value: string; bg: string }
type StyleOption = { value: string; label: string; icon?: string }
type MarkKind = 'highlight' | 'note' | 'bookmark'

const props = withDefaults(defineProps<{
  time: string
  i18n?: any
  tags?: string[]
  tagGroups?: MarkTagGroup[]
  selectedTags?: string[]
  tagInput?: string
  editing?: boolean
  editable?: boolean
  text?: string
  chapter?: string
  note?: string
  markColor?: string
  colorValue?: string
  colorOptions?: ColorOption[]
  styleValue?: string
  styleOptions?: StyleOption[]
  kind?: MarkKind
}>(), {
  tags: () => [],
  tagGroups: () => [],
  selectedTags: () => [],
  tagInput: '',
  text: '',
  chapter: '',
  note: '',
  markColor: '#e0e0e0',
  colorValue: '',
  colorOptions: () => [],
  styleValue: 'highlight',
  styleOptions: () => [],
  kind: 'highlight',
})

const titleClass = computed(() => props.kind === 'note' ? 'sr-title--note' : 'sr-title--primary')
const noteInput = ref<HTMLTextAreaElement | null>(null)
const beginEdit = () => {
  if (props.editing || noteInput.value === document.activeElement) return
  noteInput.value?.focus({ preventScroll: true })
  emit('edit')
}
watch(() => props.editing, editing => {
  if (editing) nextTick(() => noteInput.value !== document.activeElement && focusMobileEditable(noteInput.value))
}, { immediate: true })
const isGroupActive = (tags: string[]) => !!tags.length && tags.every(tag => props.selectedTags.includes(tag))

const emit = defineEmits<{
  'update:tagInput': [value: string]
  'update:note': [value: string]
  'update:colorValue': [value: string]
  'update:styleValue': [value: string]
  'toggle-tags': [tags: string[]]
  edit: []
  cancel: []
  save: []
  go: []
}>()

</script>

<style scoped lang="scss">
.sr-main{display:flex;flex:1;flex-direction:column;gap:var(--sr-gap,4px)!important;min-width:0;padding-left:0;position:static;z-index:auto}
.sr-main>*{flex:0 0 auto;margin:0!important}
.sr-head{display:flex;align-items:center;justify-content:space-between;gap:var(--sr-gap,4px);min-height:18px}
.sr-time{font-size:12px;line-height:18px;color:var(--b3-theme-on-surface-variant);white-space:nowrap;flex-shrink:0}
.sr-tag-list{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sr-gap,4px);min-height:var(--sr-line,19px)}
.sr-tag-editor{flex-direction:column;align-items:stretch}
.sr-tag-options{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sr-gap,4px)}
.sr-tag-group-title{flex:0 0 auto;height:18px;padding:0 6px;border:1px dashed var(--b3-border-color);border-radius:2px;background:transparent;color:var(--b3-theme-on-surface-variant);font-size:11px;font-weight:500;line-height:16px;text-align:left;white-space:nowrap;cursor:pointer}
.sr-tag-group-title.active{border-color:var(--b3-theme-primary);color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest)}
.sr-tag-chip{display:inline-flex;align-items:center;height:18px;padding:0 6px;border:0;border-radius:2px;background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary);font-size:12px;line-height:18px;cursor:default}
button.sr-tag-chip{cursor:pointer;opacity:.58}
button.sr-tag-chip.active{opacity:1;background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary)}
.sr-tag-input-inline{width:100%;height:20px;padding:0 4px;border:0;border-bottom:1px solid var(--b3-border-color);background:transparent;color:var(--b3-theme-on-surface);font-size:12px;line-height:20px;outline:none;box-sizing:border-box}
.sr-title,.sr-note{flex:0 0 auto;min-height:var(--sr-line,19px);font-size:13px;line-height:var(--sr-line,19px);overflow:hidden}
.sr-title{position:relative;display:flex;flex-direction:column;gap:var(--sr-gap,4px);padding:0 0 0 9px;background:transparent;font-weight:500;cursor:pointer}
.sr-title::before{content:"";position:absolute;left:0;top:1px;bottom:1px;width:3px;border-radius:999px;background:var(--mark-color,#e0e0e0)}
.sr-title:focus,.sr-title:focus-visible{outline:none!important;box-shadow:none!important}
.sr-title--primary{color:var(--b3-theme-primary)}
.sr-title--note{color:var(--b3-theme-on-surface)}
.sr-title-text,.sr-inline-chapter{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-inline-chapter{color:var(--b3-theme-on-surface-variant);font-weight:500}
.sr-title-edit{display:flex;flex-direction:column;gap:var(--sr-gap,4px);min-width:0}
.sr-color-picker{display:flex;align-items:center;gap:var(--sr-gap,4px)}
.sr-color-swatch{width:18px;height:18px;padding:0;border:1px solid #0001;border-radius:5px;cursor:pointer;box-shadow:inset 0 0 0 1px #fff8}
.sr-color-swatch.active{border-color:var(--b3-theme-primary);box-shadow:0 0 0 1px var(--b3-theme-primary),inset 0 0 0 1px #fff}
.sr-style-picker{display:flex;align-items:center;gap:var(--sr-gap,4px)}
.sr-style-btn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:20px;padding:0;border:1px solid var(--b3-border-color);border-radius:5px;background:var(--b3-theme-surface);color:var(--b3-theme-on-surface-variant);cursor:pointer}
.sr-style-btn.active{border-color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary)}
.sr-style-svg{width:13px;height:13px}
.sr-style-icon{font-size:12px;font-weight:700;line-height:1}
.sr-style-icon[data-type="underline"]{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:3px}
.sr-style-icon[data-type="strikeout"]{text-decoration:line-through;text-decoration-thickness:2px}
.sr-style-icon[data-type="outline"]{padding:0 2px;border:1px solid currentColor;border-radius:2px}
.sr-style-icon[data-type="dotted"]{border-bottom:2px dotted currentColor}
.sr-style-icon[data-type="dashed"]{border-bottom:2px dashed currentColor}
.sr-style-icon[data-type="double"]{border-bottom:3px double currentColor}
.sr-style-icon[data-type="squiggly"]{text-decoration:underline wavy;text-decoration-thickness:1px;text-underline-offset:3px}
.sr-note{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;color:var(--b3-theme-on-surface);cursor:text;white-space:normal}
.sr-note-edit{width:100%;min-height:76px;resize:vertical;font-size:13px;line-height:1.5}
.sr-note-edit--hidden{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none}
.sr-card-foot{display:flex;align-items:center;justify-content:space-between;gap:var(--sr-gap,4px)}
.sr-text-btn{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0;border:none;background:transparent;color:var(--b3-theme-on-surface-variant);font-size:12px;line-height:1;cursor:pointer}
.sr-text-btn svg{width:14px;height:14px;flex-shrink:0}
.sr-text-btn--primary{height:22px;padding:0 5px;border:1px solid var(--b3-border-color);border-radius:5px;background:var(--b3-theme-surface);color:var(--b3-theme-on-surface)}
</style>

