<template>
  <div class="toc-item-wrap">
    <div 
      :class="['b3-list-item', 'toc-item', { 'toc-item-active': isItemActive }]" 
      :style="{ paddingLeft: (8 + level * 18) + 'px' }"
      @click="handleClick"
      v-motion-pop-visible>
      <span 
        v-if="item.subitems?.length" 
        class="toc-expand-btn" 
        @click.stop="handleToggleExpand">
        <svg 
          :style="{ 
            width: '14px', 
            height: '14px', 
            transition: 'transform .25s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
          }">
          <use xlink:href="#iconRight"/>
        </svg>
      </span>
      <span v-else :style="{ width: '20px', display: 'inline-block', flexShrink: 0 }"></span>
      <span class="b3-list-item__text fn__flex-1">{{ item.label }}</span>
      <span 
        v-if="!item.subitems?.length"
        class="toc-bookmark-btn b3-tooltips b3-tooltips__w" 
        :class="{ 'is-bookmarked': isBookmarked }"
        :aria-label="isBookmarked ? '移除书签' : '添加书签'"
        @click.stop="handleToggleBookmark">
        <svg :style="{ 
          width: '16px', 
          height: '16px', 
          color: isBookmarked ? '#f44336' : 'currentColor',
          transition: 'all .2s'
        }">
          <use xlink:href="#iconBookmark"/>
        </svg>
      </span>
    </div>
    <div v-if="item.subitems?.length && isExpanded" class="toc-subitems">
      <TocItem 
        v-for="(sub, idx) in item.subitems" 
        :key="idx"
        :item="sub"
        :level="level + 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'

const props = defineProps<{
  item: any
  level: number
}>()

// 注入上下文（reactive自动解包ref）
const ctx = inject('tocContext') as any

const itemId = computed(() => props.item.id || props.item.href || props.item.label)
const isExpanded = computed(() => {
  const exp = ctx.expanded?.value || ctx.expanded
  return exp?.get(itemId.value) ?? true
})
const isItemActive = computed(() => {
  const current = ctx.currentHref?.value ?? ctx.currentHref
  return props.item.href && current === props.item.href
})
const isBookmarked = computed(() => ctx.isBookmarked?.(props.item.label) || false)

const handleClick = () => !props.item.subitems?.length && ctx.goTo(props.item)
const handleToggleExpand = () => ctx.toggleExpand(itemId.value)
const handleToggleBookmark = () => ctx.toggleBookmark(props.item)
</script>
