<template>
  <div class="sr-list">
    <CardList :cards="displayCards" :editable="true" :empty-text="keyword?t('deckNoMatch','未找到匹配的卡片'):t('deckNoCards','暂无卡片')" list-class="sr-list-inner" back-class="deck-card-back" @save="handleSave" @delete="handleDelete"/>
    <div v-if="hasMore" class="sr-action-btns">
      <button @click="$emit('load-more')" class="sr-btn">加载更多 ({{Math.min(8,allCards.length-cards.length)}}张)</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import CardList from './CardList.vue'
import {showMessage} from 'siyuan'
import {removeCard,updateCard} from './card'

const props=defineProps<{
  keyword:string
  cards:any[]
  allCards:any[]
  displayCards:any[]
  hasMore:boolean
  i18n?:any
}>()

const emit=defineEmits<{'reload':[];'load-more':[]}>()
const t=(k:string,f:string)=>props.i18n?.[k]||f

const handleSave=async(id:string,data:any)=>{
  const ok=await updateCard(id,data)
  showMessage(ok?'已保存':'保存失败',1500,ok?'info':'error')
  if(ok)emit('reload')
}

const handleDelete=async(id:string)=>{
  await removeCard(id)
  emit('reload')
  showMessage('已删除',1500,'info')
}
</script>

<style scoped lang="scss">
@use './deck.scss';
</style>
