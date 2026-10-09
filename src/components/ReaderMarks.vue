<template>
  <DockShell
    class="sr-marks"
    body-class="sr-body-pad-8"
    v-model:search-value="keyword"
    :search-placeholder="searchPlaceholder"
    :toolbar-menu-action="toolbarMenuAction"
    :toolbar-actions="toolbarActions"
    toolbar-tooltip-dir="sw"
    @click="showOrganize = false"
    @toolbar-action="handleToolbarAction"
  >
    <div class="sr-list" :class="{ 'is-empty': !list.length }" @scroll.passive="handleMarkListScroll">
      <div v-if="!list.length" class="sr-empty">{{ emptyText }}</div>
      <template v-else v-for="row in visibleMarkRows.rows" :key="row.key">
        <div v-if="row.type === 'group'" class="sr-card sr-group" @click="toggleGroup(row.item.key)">
          <span class="sr-bar" :class="{ collapsed: isCollapsed(row.item.key) }"></span>
          <div class="sr-group-content">
            <span class="sr-group-title">{{ row.item.title || row.item.key }}</span>
            <span class="sr-group-count">{{ row.item.count ?? row.item.items?.length ?? 0 }}</span>
          </div>
        </div>
        <div
          v-else
          class="sr-card"
          :class="{ 'sr-card-edit': isEditing(row.mark), 'sr-card-drag': canDragMarks, 'sr-card-child': row.mark.bookUrl, 'is-dragging': dragState.from === getDragKey(row.mark), 'is-drag-over': dragState.over === getDragKey(row.mark) }"
          :draggable="canDragMarks"
          @dragstart="startMarkDrag($event, row.mark)"
          @dragenter.prevent="dragState.over = getDragKey(row.mark)"
          @dragover.prevent
          @drop.prevent="dropMark(row.mark)"
          @dragend="endMarkDrag()"
        >
          <MarkCard
            :time="formatDateTime(row.mark.timestamp || Date.now())"
            :i18n="props.i18n"
            :tags="getMarkTags(row.mark)"
            :tag-groups="markTagGroups"
            :selected-tags="editTagList"
            :tag-input="editTags"
            :editing="isEditing(row.mark)"
            :editable="canEdit(row.mark)"
            :text="isEditing(row.mark) ? editText : mainText(row.mark)"
            :chapter="getMarkChapter(row.mark)"
            :note="isEditing(row.mark) ? editNote : row.mark.note"
            :mark-color="getBarColor(row.mark)"
            :color-value="editColor"
            :color-options="isEditing(row.mark) && showEditOptions(row.mark) ? getEditColorOptions() : []"
            :style-value="editStyle"
            :style-options="isEditing(row.mark) ? getMarkStyleOptions(row.mark) : []"
            :kind="row.mark.type === 'note' ? 'note' : row.mark.type === 'bookmark' ? 'bookmark' : 'highlight'"
            @update:tag-input="editTags = $event"
            @update:note="editNote = $event"
            @update:color-value="editColor = $event"
            @update:style-value="editStyle = $event"
            @toggle-tags="toggleEditTags"
            @go="showMark(row.mark)"
            @edit="startEdit(row.mark)"
            @cancel="cancelEdit"
            @save="saveEdit(row.mark)"
          >
            <template #actions>
              <div class="sr-head-actions">
                <button class="b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.copy || '复制'" @click.stop="copyMark(row.mark)"><svg><use xlink:href="#iconCopy" /></svg></button>
                <button v-if="row.mark.blockId && row.mark.type !== 'bookmark'" class="b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.openBlock || 'Open block'" @click.stop="openBlock(row.mark.blockId)" @mouseenter="onBlockEnter($event, row.mark.blockId)" @mouseleave="hideFloat"><svg><use xlink:href="#iconRef" /></svg></button>
                <button v-else-if="canImport(row.mark)" class="b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.import || '导入'" @click.stop="importMark(row.mark)"><svg><use xlink:href="#iconDownload" /></svg></button>
                <button v-if="canDelete(row.mark)" class="b3-tooltips b3-tooltips__nw" :aria-label="props.i18n?.delete || '删除'" @click.stop="deleteMark(row.mark)"><svg><use xlink:href="#iconTrashcan" /></svg></button>
              </div>
            </template>
            <template #extra>
              <img v-if="row.mark.image" class="sr-image-preview" :src="row.mark.image" :alt="mainText(row.mark)" @click.stop="showMark(row.mark)">
            </template>
          </MarkCard>
        </div>
      </template>
      <button v-if="visibleMarkRows.hasMore" class="sr-more" type="button" @click="loadMoreMarks">{{ props.i18n?.loadMore || 'Load more' }}</button>
    </div>

    <template #overlay>
      <Transition name="fade">
        <div v-if="showOrganize" class="sr-manage-panel" @click.stop>
          <header class="sr-modal__head">
            <span>{{ props.i18n?.filterAnnotations || 'Filter annotations' }}</span>
            <span class="block__icon block__icon--show sr-icon-btn" :aria-label="props.i18n?.close || 'Close'" @click="showOrganize = false"><svg><use xlink:href="#lucide-x" /></svg></span>
          </header>
          <div class="sr-modal__body">
            <label class="sr-form-item">
              <span class="ft__secondary">{{ props.i18n?.sort || 'Sort' }}</span>
              <div class="sr-chips">
                <button v-for="opt in markSortOptions" :key="opt.value" class="sr-chip" :class="{ 'is-active': markFilter.sort === opt.value }" type="button" @click="markFilter.sort = opt.value">
                  {{ opt.label }}
                </button>
              </div>
              <div class="sr-chips">
                <button class="sr-chip" :class="{ 'is-active': markReverse }" type="button" @click="markReverse = !markReverse">{{ props.i18n?.reverseSort || 'Reverse sort' }}</button>
              </div>
            </label>

            <label v-for="section in markFilterSections" :key="section.key" class="sr-form-item">
              <span class="ft__secondary">{{ section.label }}</span>
              <div class="sr-chips">
                <button
                  v-for="opt in section.options"
                  :key="`${section.key}-${opt.value}`"
                  class="sr-chip"
                  :class="{ 'is-active': isMarkFilterActive(section.key, opt.value) }"
                  type="button"
                  @click="toggleMarkFilterItem(section.key, opt.value)"
                >
                  {{ opt.label }}<template v-if="opt.count !== undefined"> ({{ opt.count }})</template>
                </button>
              </div>
            </label>

            <div class="sr-row sr-actions-end sr-section-line">
              <button class="b3-button b3-button--outline" type="button" @click="resetMarkOrganize">{{ props.i18n?.resetFilter || 'Reset filters' }}</button>
              <button class="b3-button b3-button--outline" type="button" @click="showOrganize = false">{{ props.i18n?.done || 'Done' }}</button>
            </div>
          </div>
        </div>
      </Transition>
    </template>
  </DockShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MarkCard from './MarkCard.vue'
import DockShell from './ui/DockShell.vue'
import { useReaderMarks } from '@/composables/useReaderMarks'

const props = withDefaults(defineProps<{ i18n?: any; context?: any }>(), { i18n: () => ({}) })

const {
  MARK_SORT_OPTIONS: markSortOptions,
  keyword,
  searchPlaceholder,
  toolbarMenuAction,
  toolbarActions,
  handleToolbarAction,
  showOrganize,
  list,
  emptyText,
  toggleGroup,
  isCollapsed,
  getMarkItems,
  canDragMarks,
  dragState,
  getDragKey,
  startMarkDrag,
  dropMark,
  endMarkDrag,
  getBarColor,
  isEditing,
  editText,
  editNote,
  editTags,
  editTagList,
  startEdit,
  cancelEdit,
  showEditOptions,
  getEditColorOptions,
  getEditStyleOptions,
  editColor,
  editStyle,
  markTagGroups,
  toggleEditTags,
  saveEdit,
  mainText,
  copyMark,
  canDelete,
  canEdit,
  openBlock,
  onBlockEnter,
  hideFloat,
  canImport,
  readOnly,
  importMark,
  deleteMark,
  markFilter,
  markReverse,
  markFilterSections,
  isMarkFilterActive,
  toggleMarkFilterItem,
  resetMarkOrganize,
  getMarkTags,
  showMark,
} = useReaderMarks(props.i18n, () => props.context)
const MARK_RENDER_STEP = 120
const markRenderLimit = ref(MARK_RENDER_STEP)
const rowKey = (item: any, fallback: string) => String(item?.key || item?.groupId || item?.id || item?.page || fallback)
const visibleMarkRows = computed(() => {
  const rows: any[] = []
  let total = 0, visible = 0
  list.value.forEach((item: any, itemIndex: number) => {
    if (item?.isGroup) rows.push({ type: 'group', key: `g-${rowKey(item, `${itemIndex}`)}`, item })
    const marks = getMarkItems(item)
    total += marks.length
    marks.slice(0, Math.max(0, markRenderLimit.value - visible)).forEach((mark: any, index: number) => {
      rows.push({ type: 'mark', key: `m-${rowKey(mark, `${itemIndex}-${index}`)}`, mark })
      visible++
    })
  })
  return { rows, hasMore: visible < total }
})
const loadMoreMarks = () => {
  if (visibleMarkRows.value.hasMore) markRenderLimit.value += MARK_RENDER_STEP
}
const handleMarkListScroll = (event: Event) => {
  const el = event.currentTarget as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) loadMoreMarks()
}
watch(list, () => { markRenderLimit.value = MARK_RENDER_STEP })
const formatDateTime = (ts: number) => new Date(ts).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
const getMarkChapter = (mark: any) => isEditing(mark) ? '' : [mark?.chapter || (mark?.page ? `第${mark.page}页` : '')].filter(Boolean).join(' ')
const getMarkStyleOptions = (mark: any) => (mark?.type === 'highlight' || mark?.type === 'note' || !mark?.type) ? getEditStyleOptions() : []
</script>

<style scoped lang="scss">
.sr-marks{display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--b3-theme-background)}
.sr-list{height:100%;overflow:auto}
.sr-list.is-empty{overflow:hidden}
.sr-empty{display:flex;align-items:center;justify-content:center;height:100%;font-size:14px;opacity:.5}
.sr-manage-panel{position:absolute;top:44px;left:8px;right:8px;z-index:20;max-height:calc(100% - 56px);overflow:auto;padding:12px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:10px;box-shadow:0 8px 24px #0002;box-sizing:border-box}
.sr-modal__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--b3-border-color);font-size:13px;font-weight:600}
.sr-modal__body{display:flex;flex-direction:column;gap:12px;padding-top:12px;box-sizing:border-box}
.sr-form-item{display:flex;flex-direction:column;gap:4px;padding-bottom:12px;border-bottom:1px solid var(--b3-border-color);font-size:12px}
.sr-form-item:last-child{border-bottom:none}
.sr-chips{display:flex;flex-wrap:wrap;gap:6px}
.sr-chip{display:inline-flex;align-items:center;justify-content:center;padding:3px 8px;border:1px solid var(--b3-border-color);border-radius:999px;background:var(--b3-theme-background);color:var(--b3-theme-on-surface);font-size:11px;font-weight:600;line-height:1.2;white-space:nowrap;cursor:pointer}
.sr-chip:hover{background:var(--b3-list-hover)}
.sr-chip.is-active{border-color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary)}
.sr-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.sr-actions-end{justify-content:flex-end}
.sr-section-line{padding-top:12px;border-top:1px solid var(--b3-border-color)}
.sr-card{--sr-gap:4px;--sr-line:19px;display:flex;gap:var(--sr-gap);padding:6px;margin-bottom:6px;border:1px solid color-mix(in srgb,var(--b3-border-color) 92%,transparent);border-radius:8px;background:linear-gradient(180deg,color-mix(in srgb,var(--b3-theme-background) 96%,white),var(--b3-theme-background));color:var(--b3-theme-on-surface);position:relative;transform:none!important;box-shadow:none!important;transition:border-color .15s;content-visibility:auto;contain-intrinsic-size:96px}
.sr-card:hover{border-color:var(--b3-theme-primary);transform:none!important;box-shadow:none!important}
.sr-card-drag{cursor:grab}
.sr-card.is-dragging{opacity:.45}
.sr-card.is-drag-over{border-color:var(--b3-theme-primary);box-shadow:0 0 0 1px var(--b3-theme-primary) inset}
.sr-group{align-items:center;cursor:pointer;border-radius:10px;background:transparent}
.sr-card-child{margin-left:14px}
.sr-group-content{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:1;min-width:0}
.sr-group-title,.sr-group-count{font-size:15px;line-height:1.35;font-weight:600}
.sr-group-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-group-count{opacity:.6}
.sr-bar{width:4px;border-radius:999px;background:var(--b3-theme-primary);flex-shrink:0}
.sr-bar.collapsed{opacity:.4}
.sr-head-actions{display:flex;align-items:center;gap:4px;flex-shrink:0}
.sr-head-actions button{display:flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:none;background:transparent;border-radius:4px;line-height:1;cursor:pointer;color:var(--b3-theme-on-surface-variant)}
.sr-head-actions button:hover{background:var(--b3-list-hover);color:var(--b3-theme-primary)}
.sr-head-actions svg{width:14px;height:14px}
.sr-more{display:block;width:100%;margin:4px 0 8px;padding:6px;border:1px solid var(--b3-border-color);border-radius:8px;background:var(--b3-theme-background);color:var(--b3-theme-on-surface-variant);font-size:12px;cursor:pointer}
.sr-more:hover{border-color:var(--b3-theme-primary);color:var(--b3-theme-primary)}
.sr-preview{width:100%;background:var(--b3-theme-background)}
.sr-image-preview{display:block;max-width:100%;max-height:180px;object-fit:contain;border-radius:6px;background:var(--b3-theme-background);cursor:pointer}
.fade-enter-active,.fade-leave-active{transition:opacity .2s}
.fade-enter-from,.fade-leave-to{opacity:0}
</style>
