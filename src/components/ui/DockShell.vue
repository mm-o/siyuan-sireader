<template>
  <div class="sr-shell" :class="`nav-${props.navPosition || 'left'}`">
    <nav v-if="props.tabs?.length" class="sr-nav">
      <button
        v-for="tab in props.tabs"
        :key="tab.id"
        class="sr-nav-tab ariaLabel"
        :class="{ 'sr-nav-tab--active': props.activeTab === tab.id }"
        :data-position="props.tooltipDir || 'north'"
        data-tooltip-encoding="none"
        :aria-label="tab.tip"
        @click="$emit('update:activeTab', tab.id)"
      >
        <svg><use :xlink:href="'#' + tab.icon" /></svg>
      </button>
    </nav>
    <main class="sr-content">
      <div v-if="hasToolbar" class="sr-toolbar">
        <div v-if="props.toolbarStartActions?.length || $slots['toolbar-start']" class="sr-toolbar-group">
          <button
            v-for="action in props.toolbarStartActions || []"
            v-show="action.show !== false"
            :key="action.id"
            type="button"
            class="sr-toolbar-btn ariaLabel"
            :class="{ 'is-active': action.active, 'is-warning': action.warning }"
            :data-position="action.tooltipDir || props.toolbarTooltipDir || 'south'"
            data-tooltip-encoding="none"
            :aria-label="action.label"
            @click.stop="$emit('toolbar-action', action.id, $event)"
          >
            <svg><use :xlink:href="action.icon" /></svg>
          </button>
          <slot name="toolbar-start" />
        </div>
        <input
          ref="searchInput"
          v-if="props.searchValue !== undefined"
          :value="props.searchValue"
          :placeholder="props.searchPlaceholder"
          :disabled="props.searchDisabled"
          @input="$emit('update:searchValue', ($event.target as HTMLInputElement).value)"
          @keyup.enter="$emit('search-enter')"
        >
        <slot name="toolbar" />
        <div v-if="props.toolbarMenuAction || props.toolbarActions?.length || $slots['toolbar-end']" class="sr-toolbar-group">
          <div v-if="props.toolbarMenuAction?.show !== false && props.toolbarMenuAction" class="sr-toolbar-menu">
            <button
              type="button"
              class="sr-toolbar-btn ariaLabel"
              :class="{ 'is-active': props.toolbarMenuAction.active, 'is-warning': props.toolbarMenuAction.warning }"
              :data-position="props.toolbarMenuAction.tooltipDir || props.toolbarTooltipDir || 'south'"
              data-tooltip-encoding="none"
              :aria-label="props.toolbarMenuAction.label"
              @click.stop="$emit('toolbar-action', props.toolbarMenuAction.id, $event)"
            >
              <svg><use :xlink:href="props.toolbarMenuAction.icon" /></svg>
            </button>
            <slot name="toolbar-menu" />
          </div>
          <button
            v-for="action in props.toolbarActions || []"
            v-show="action.show !== false"
            :key="action.id"
            type="button"
            class="sr-toolbar-btn ariaLabel"
            :class="{ 'is-active': action.active, 'is-warning': action.warning }"
            :data-position="action.tooltipDir || props.toolbarTooltipDir || 'south'"
            data-tooltip-encoding="none"
            :aria-label="action.label"
            @click.stop="$emit('toolbar-action', action.id, $event)"
          >
            <svg><use :xlink:href="action.icon" /></svg>
          </button>
          <slot name="toolbar-end" />
        </div>
      </div>
      <div class="sr-body" :class="props.bodyClass">
        <slot />
      </div>
      <slot name="overlay" />
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent, h } from 'vue'

export const FileTree = defineComponent({
  props: { dense: Boolean },
  setup(props, { slots }) {
    return () => h('div', { class: ['fn__flex-1 fn__flex-column file-tree sy__file bs-view bs-tree-view', { 'bs-tree-view--dense': props.dense }] }, [
      h('div', {
        class: 'fn__flex-1 fn__hidescrollbar',
        onMouseover: (event: MouseEvent) => (event.target as HTMLElement).hasAttribute('data-playlist-item') && event.stopPropagation(),
        onClickCapture: (event: MouseEvent) => {
          if ((event.target as HTMLElement).closest('[role="button"][aria-disabled="true"]')) { event.preventDefault(); event.stopPropagation() }
        },
        onKeydown: (event: KeyboardEvent) => {
          const target = event.target as HTMLElement
          if ((event.key === 'Enter' || event.key === ' ') && target.getAttribute('role') === 'button') { event.preventDefault(); target.click() }
        },
      }, slots.default?.()),
    ])
  },
})
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'

const searchInput = ref<HTMLInputElement>()
defineExpose({ focusSearch: () => searchInput.value?.focus() })

const slots = defineSlots<{
  default?: () => any
  overlay?: () => any
  toolbar?: () => any
  'toolbar-start'?: () => any
  'toolbar-menu'?: () => any
  'toolbar-end'?: () => any
}>()

const props = defineProps<{
  activeTab?: string
  navPosition?: string
  tooltipDir?: string
  tabs?: Array<{ id: string; icon: string; tip: string }>
  bodyClass?: string
  searchValue?: string
  searchPlaceholder?: string
  searchDisabled?: boolean
  toolbarTooltipDir?: string
  toolbarStartActions?: Array<{ id: string; icon: string; label: string; active?: boolean; warning?: boolean; show?: boolean; tooltipDir?: string }>
  toolbarMenuAction?: { id: string; icon: string; label: string; active?: boolean; warning?: boolean; show?: boolean; tooltipDir?: string } | null
  toolbarActions?: Array<{ id: string; icon: string; label: string; active?: boolean; warning?: boolean; show?: boolean; tooltipDir?: string }>
}>()

const hasToolbar = computed(() => props.searchValue !== undefined || !!props.toolbarStartActions?.length || !!props.toolbarMenuAction || !!props.toolbarActions?.length || !!slots.toolbar || !!slots['toolbar-start'] || !!slots['toolbar-menu'] || !!slots['toolbar-end'])

defineEmits<{ 'update:activeTab': [tab: string]; 'update:searchValue': [value: string]; 'search-enter': []; 'toolbar-action': [id: string, event: MouseEvent] }>()
</script>

<style scoped lang="scss">
.sr-shell{position:relative;display:flex;height:100%;overflow:hidden;background:var(--b3-theme-background);&.nav-left{flex-direction:row}&.nav-right{flex-direction:row-reverse}&.nav-top{flex-direction:column}&.nav-bottom{flex-direction:column-reverse}}
.sr-nav{background:var(--b3-theme-background);display:flex;flex-shrink:0;.nav-left &,.nav-right &{width:42px;flex-direction:column;border-right:1px solid var(--b3-theme-background-light);padding:8px 0}.nav-top &,.nav-bottom &{height:42px;border-bottom:1px solid var(--b3-theme-background-light);padding:0 8px}.nav-right &{border-right:0;border-left:1px solid var(--b3-theme-background-light)}.nav-bottom &{border-bottom:0;border-top:1px solid var(--b3-theme-background-light)}}
.sr-nav-tab{display:flex;align-items:center;justify-content:center;padding:10px 8px;border:none;background:transparent;cursor:pointer;transition:var(--b3-transition);color:var(--b3-theme-on-surface);svg{width:16px;height:16px}&:hover{color:var(--b3-theme-on-background)}&--active{color:var(--b3-theme-primary)}}
.sr-content{flex:1;overflow:hidden;display:flex;flex-direction:column}
.sr-body{flex:1;min-height:0;overflow:hidden}
.sr-body-scroll{min-height:0;overflow:auto}
.sr-body-pad-8{padding:8px;box-sizing:border-box}
.sr-body-pad-12{padding:12px 8px;box-sizing:border-box}
.sr-body-stack-8{display:flex;flex-direction:column;gap:8px}
.sr-body-stack-12{display:flex;flex-direction:column;gap:12px}
.sr-toolbar{display:flex;gap:6px;padding:6px 8px;align-items:center;border-bottom:1px solid var(--b3-border-color);flex-shrink:0}
.sr-toolbar input{flex:1;min-width:0;height:28px;padding:0 10px 2px;border:none;border-bottom:1px solid var(--b3-border-color);background:transparent;font-size:12px;outline:none;color:var(--b3-theme-on-background);transition:border-color .2s;box-sizing:border-box}
.sr-toolbar input:focus{border-color:var(--b3-theme-primary)}
.sr-toolbar input::placeholder{color:var(--b3-theme-on-surface-variant);opacity:.6}
.sr-toolbar-group{display:flex;align-items:center;gap:2px;flex:0 0 auto}
.sr-toolbar-menu{position:relative;display:flex;flex:0 0 auto}
.sr-toolbar-menu :deep(.sr-toolbar-popover){position:absolute;top:34px;right:0;min-width:180px;padding:6px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:8px;box-shadow:0 8px 24px #0002;z-index:20}
.sr-toolbar-menu :deep(.sr-toolbar-popover-section){padding:6px 12px;font-size:11px;font-weight:600;color:var(--b3-theme-on-surface-variant);text-transform:uppercase;letter-spacing:.5px}
.sr-toolbar-menu :deep(.sr-toolbar-popover-divider){height:1px;background:var(--b3-border-color);margin:4px 0}
.sr-toolbar-menu :deep(.sr-toolbar-popover-item){padding:8px 10px;border-radius:6px;cursor:pointer;font-size:12px}
.sr-toolbar-menu :deep(.sr-toolbar-popover-item:hover),
.sr-toolbar-menu :deep(.sr-toolbar-popover-item.active){background:var(--b3-list-hover);color:var(--b3-theme-primary)}
.sr-toolbar-btn{display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:4px;background:transparent;color:var(--b3-theme-on-surface);opacity:.5;cursor:pointer;transition:var(--b3-transition);svg{width:14px;height:14px}&:hover{opacity:1;background:var(--b3-theme-surface)}&:active,&.is-active{opacity:1;color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest)}&.is-warning{color:var(--b3-theme-error)}}
:deep(.sr-body-scroll){min-height:0;overflow:auto}
:deep(.sr-body-pad-8){padding:8px;box-sizing:border-box}
:deep(.sr-body-pad-12){padding:12px 8px;box-sizing:border-box}
:deep(.sr-body-pad-16){padding:16px;box-sizing:border-box}
:deep(.sr-body-stack-8){display:flex;flex-direction:column;gap:8px}
:deep(.sr-body-stack-12){display:flex;flex-direction:column;gap:12px}
@media (max-width:640px){.sr-shell{flex-direction:column !important}.sr-nav{width:100% !important;height:42px !important;flex-direction:row !important;padding:0 4px !important}}
</style>

<style>
.bs-view.bs-tree-view{min-height:0;height:100%;padding:8px 0 0;box-sizing:border-box}
.bs-view.bs-tree-view--dense{padding-top:2px}
.bs-tree-view .b3-list{padding:0;margin:0}
.bs-tree-view--dense .b3-list-item{padding-right:4px}
.bs-tree-view .bs-tree-leaf-mark{fill:currentColor;opacity:.7}
</style>
