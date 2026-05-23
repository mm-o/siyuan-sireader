<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { showMessage } from 'siyuan'
import type { CloudDriveAccount, ReaderSettings, FontFileInfo } from '@/composables/useSetting'
import { DEFAULT_NAV_ITEMS, LINK_FORMAT_PRESETS, NOTE_MODE_LABELS, NOTE_MODE_OPTIONS, NOTE_TARGET_OPTIONS, PRESET_THEMES, SectionTitle, SettingItem, SettingRows, SettingSection, UI_CONFIG, getLicenseMedia, setCustomBackgroundFromInput, settingSectionIcon, useSetting, useConfirm, useDocSearch, useNotebooks } from '@/composables/useSetting'
import { bookshelfManager } from '@/core/bookshelf'
import { offlineDictManager, onlineDictManager } from '@/utils/dictionary'
import { usePlugin } from '@/main'
import { useLicense } from '@/composables/useLicense'
import { focusMobileEditable } from '@/utils/mobile'

const props = defineProps<{modelValue:ReaderSettings;i18n:any;onSave:()=>Promise<void>}>()
const emit = defineEmits<{'update:modelValue':[value:ReaderSettings]}>()
// 基础状态
const settings = ref<ReaderSettings>(props.modelValue),
  openGroups = ref<Record<string, boolean>>({ license: true }),
  openSubs = ref<Record<string, boolean>>({}),
  licenseRef = ref<HTMLElement>()
const plugin = usePlugin()
const {customFonts,isLoadingFonts,loadCustomFonts,resetStyles:resetStylesRaw} = useSetting(plugin)
const {interfaceItems,customThemeItems,appearanceGroups,ttsItems,ttsOptions} = UI_CONFIG
const {confirming:resetConfirm,handleClick:handleReset} = useConfirm(() => {resetStylesRaw();save()})

// TTS
const ttsVoices = ref<any[]>([]), loadingTTS = ref(false)
const loadTTS = async () => {
  if (loadingTTS.value||ttsVoices.value.length) return
  loadingTTS.value = true
  try {
    const {loadOnlineVoices,loadLocalVoices} = await import('@/services/TTSEngine')
    const [local,online] = await Promise.allSettled([loadLocalVoices(),loadOnlineVoices()])
    ttsVoices.value = [...(local.status==='fulfilled'?local.value:[]),...(online.status==='fulfilled'?online.value:[])]
    if (!ttsVoices.value.length) showMessage(props.i18n.loadVoicesFailed||'加载失败',3000,'error')
  } catch (e:any) { showMessage(e.message||props.i18n.loadVoicesFailed||'加载失败',3000,'error') } finally { loadingTTS.value = false }
}
const selectVoice = (name:string,isLocal:boolean) => {
  if (!isLocal&&!can.value('tts-online')) return showUpgrade('在线语音')
  if (!settings.value.tts) return
  settings.value.tts.voice = name
  save()
}
const toggleFav = (voice:any) => {
  if (!settings.value.tts) return
  const fav = settings.value.tts.favoriteVoices||[]
  const idx = fav.findIndex(v => v.name===voice.name)
  idx>=0?fav.splice(idx,1):fav.push({name:voice.name,displayName:voice.displayName,locale:voice.locale,isLocal:voice.isLocal})
  settings.value.tts.favoriteVoices = fav; showMessage(idx>=0?(props.i18n.deleted||'已删除'):(props.i18n.ttsVoiceFavorited||'已收藏'),1500,'info'); save()
}
const isFav = (name:string) => (settings.value.tts?.favoriteVoices||[]).some(v => v.name===name)
const myVoices = computed(() => [...ttsVoices.value.filter(v => v.isLocal),...(settings.value.tts?.favoriteVoices||[]).filter(v => !v.isLocal)])
const onlineVoices = computed(() => ttsVoices.value.filter(v => !v.isLocal))
watch(() => props.modelValue,v => settings.value=v,{immediate:true})
// 词典与笔记插入
const offlineDicts = ref<any[]>([]),
  onlineDicts = ref<any[]>([]),
  fileInput = ref<HTMLInputElement>(),
  folderInput = ref<HTMLInputElement>(),
  bgInput = ref<HTMLInputElement>(),
  uploading = ref(false),
  loadingDict = ref(true),
  fontsLoaded = ref(false),
  removingDict = ref<string|null>(null)
const quickDoc = useDocSearch(), insertDoc = useDocSearch()
const {notebooks,load:loadNotebooks} = useNotebooks()
const {license,userAvatar,code:activationCode,loading:loadingLicense,processing,load:loadLicense,activate:activateLicense,recover:recoverLicense,clear:clearLicense,can,showUpgrade} = useLicense(props.i18n)
const licenseMedia = computed(() => getLicenseMedia(license.value, userAvatar.value, props.i18n))
const ttsFields = computed(() => [...ttsItems, ...ttsOptions.map(item => ({ ...item, desc: ttsI18nKey(item.key,'Desc') }))])
const linkFormatPresetOptions = Object.keys(LINK_FORMAT_PRESETS) as (keyof typeof LINK_FORMAT_PRESETS)[]
const themeItems = computed(() => customThemeItems.filter(item => item.key !== 'bgImg'))
const presetThemeItem = computed(() => ({
  key: 'theme',
  opts: [...Object.keys(PRESET_THEMES), 'custom'],
  labels: [...Object.values(PRESET_THEMES).map(theme => theme.name), 'custom']
}))
const selectField = (key:string, label:string, value:string, options:any[], set:(value:string)=>void, show=true, empty='') => ({ key, type: 'select', label, value, options, set, show, empty })
const checkboxField = (key:string, label:string, value:boolean, set:(value:boolean)=>void, show=true, hint='') => ({ key, type: 'checkbox', label, value, set, show, hint })
const searchField = (key:string, label:string, docs:any[], input:string, results:any[], setInput:(value:string)=>void, search:()=>void, select:(doc:any)=>void, remove:(doc:any,i:number)=>void, show=true, hint='', drag?:'quickDoc') => ({ key, type: 'search', label, docs, input, results, setInput, search, select, remove, show, hint, drag })
const dictSections = computed(() => [
  {
    key: 'offlineDict', title: props.i18n.offlineDict||'离线词典', items: offlineDicts.value, empty: props.i18n.noDicts||'暂无离线词典',
    extra: true, manager: offlineDictManager, desc: (d:any) => d.type==='stardict'?'StarDict':'dictd', drop: (e:DragEvent,i:number) => dragDrop(e,i,'dict',offlineDicts,offlineDictManager)
  },
  {
    key: 'onlineDict', title: props.i18n.onlineDict||'在线词典', items: onlineDicts.value, empty: '', manager: onlineDictManager, desc: (d:any) => d.desc, drop: (e:DragEvent,i:number) => dragDrop(e,i,'dict',onlineDicts,onlineDictManager)
  }
])
const cloudAccounts = computed(() => settings.value.cloudAccounts || (settings.value.cloudAccounts = []))
const cloudAccountTitle = (account: CloudDriveAccount, index: number) => account.name || account.server || `${props.i18n.cloudAccount || '云盘账号'} ${index + 1}`
const createCloudAccount = (): CloudDriveAccount => ({
  id: `cloud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: '',
  server: '',
  pathPrefix: '',
  username: '',
  password: ''
})
const addCloudAccount = () => {
  cloudAccounts.value.push(createCloudAccount())
  openGroups.value.cloud = true
  save()
}
const removeCloudAccount = (id:string) => {
  settings.value.cloudAccounts = cloudAccounts.value.filter(account => account.id !== id)
  save()
}
const updateCloudAccount = (account: CloudDriveAccount, key: keyof CloudDriveAccount, value: string) => {
  account[key] = value
  debouncedSave()
}
const voiceSections = computed(() => [
  {
    key: 'ttsFavorites', title: props.i18n.ttsFavoriteVoices||'我的语音', hint: `${props.i18n.ttsCurrentVoice||'当前'}: ${settings.value.tts?.voice||''}`,
    rows: myVoices.value.map((v:any) => ({ key: v.name, text: v.displayName, meta: v.isLocal ? (props.i18n.localVoice || '本地') : v.locale, active: settings.value.tts?.voice === v.name, pick: () => selectVoice(v.name,v.isLocal), action: v.isLocal ? undefined : () => toggleFav(v), actionTitle: props.i18n.delete || '删除' })),
    empty: props.i18n.ttsNoFavorites||'暂无，请点击下方加载'
  },
  {
    key: 'ttsVoices', title: props.i18n.ttsVoiceList||'在线语音', hint: props.i18n.ttsOnlineHint||'点击语音名称选择，点击星号收藏',
    rows: onlineVoices.value.map((v:any) => ({ key: v.name, text: v.displayName, meta: v.locale, active: settings.value.tts?.voice === v.name, pick: () => selectVoice(v.name,false), action: () => toggleFav(v), actionTitle: isFav(v.name)?'取消收藏':'收藏' })),
    empty: props.i18n.ttsNoVoices||'暂无语音', loadLabel: props.i18n.ttsLoadVoices || '加载语音'
  }
])
const noteFields = computed(() => [
  checkboxField('annotationSyncOnAdd', props.i18n.annotationSyncOnAdd || '添加时同步', settings.value.annotationSyncOnAdd, value => (settings.value.annotationSyncOnAdd = value, save()), true, props.i18n.annotationSyncOnAddDesc || '新增标注时自动同步到已绑定文档'),
  checkboxField('annotationSyncOnDelete', props.i18n.annotationSyncOnDelete || '删除时同步', settings.value.annotationSyncOnDelete, value => (settings.value.annotationSyncOnDelete = value, save()), true, props.i18n.annotationSyncOnDeleteDesc || '删除标注时同步删除已绑定块'),
  selectField('noteInsertTarget', props.i18n.noteInsertTarget || '插入位置', settings.value.noteInsertTarget, NOTE_TARGET_OPTIONS.map(value => ({ value, label: props.i18n[`noteInsertTarget${value.charAt(0).toUpperCase()}${value.slice(1)}`] || value })), value => (settings.value.noteInsertTarget = value as any, save())),
  selectField('noteInsertMode', props.i18n.noteInsertMode || '插入方式', settings.value.noteInsertMode, NOTE_MODE_OPTIONS.map(value => ({ value, label: props.i18n[NOTE_MODE_LABELS[value]] || value })), value => (settings.value.noteInsertMode = value as any, save()), settings.value.noteInsertTarget === 'current'),
  selectField('notebookId', props.i18n.notebookId || props.i18n.notebook || '笔记本', settings.value.notebookId || '', notebooks.value.map((nb:any) => ({ value: nb.id, label: nb.name })), value => (settings.value.notebookId = value, save()), ['notebook', 'dailynote'].includes(settings.value.noteInsertTarget), props.i18n.notSelected || '未选择'),
  selectField('linkFormatPreset', props.i18n.linkFormatPreset || '模板预设', '', linkFormatPresetOptions.map(value => ({ value, label: props.i18n[`linkFormatPreset${value.charAt(0).toUpperCase()}${value.slice(1)}`] || value })), applyLinkFormatPreset, true, props.i18n.selectPreset || '请选择'),
  { key: 'linkFormat', type: 'textarea', label: props.i18n.linkFormat || '链接格式', value: settings.value.linkFormat, hint: props.i18n.linkFormatDesc || '可用变量：书名 作者 章节 位置 链接 文本 笔记 截图' },
  searchField('parentDoc', props.i18n.parentDoc || '父文档', settings.value.parentDoc ? [settings.value.parentDoc] : [], insertDoc.state.value.input, insertDoc.state.value.results, value => (insertDoc.state.value.input = value, !value.trim() && (insertDoc.state.value.results = [])), insertDoc.search, doc => insertDoc.select(doc, selectInsertDoc), () => clearInsertDoc(), settings.value.noteInsertTarget === 'document'),
  searchField('quickSendDocs', props.i18n.quickSendDocs || '快捷发送文档', settings.value.quickSendDocs || [], quickDoc.state.value.input, quickDoc.state.value.results, value => (quickDoc.state.value.input = value, !value.trim() && (quickDoc.state.value.results = [])), quickDoc.search, doc => quickDoc.select(doc, addQuickDoc), (_doc:any, i:number) => removeQuickDoc(i), true, props.i18n.quickSendDocsDesc || '用于快速发送标注', 'quickDoc')
].filter((item:any) => item.show !== false))

// 交互方法
const isOpen = (key:string) => !!openGroups.value[key]
const isSubOpen = (key:string) => !!openSubs.value[key]
const toggleAccordion = (key:string) => openGroups.value[key] = !openGroups.value[key]
const toggleSub = async (key:string) => {
  openSubs.value[key] = !openSubs.value[key]
  if (key === 'customFont' && !fontsLoaded.value && openSubs.value[key]) return await loadCustomFonts(), void (fontsLoaded.value = true)
  if (['ttsFavorites','ttsVoices'].includes(key) && openSubs.value[key] && !ttsVoices.value.length) await loadTTS()
}
watch(openGroups, groups => groups.other && loadNotebooks(), { deep: true })
const handleUpload = async (e:Event) => {
  const files = (e.target as HTMLInputElement).files
  if (!files?.length) return
  uploading.value = true
  try {
    await offlineDictManager.addDict(files)
    refreshDicts()
    showMessage(`${props.i18n.addedDict || '添加'} ${files.length} ${props.i18n.dictFiles || '个词典文件'}`, 2000, 'info')
  } catch (e:any) { showMessage(e.message || props.i18n.addFailed || '添加失败', 3000, 'error') } finally { uploading.value = false; if (fileInput.value) fileInput.value.value = ''; if (folderInput.value) folderInput.value.value = '' }
}
const removeDict = async (id:string) => {
  await offlineDictManager.removeDict(id)
  refreshDicts()
  removingDict.value = null
  showMessage(props.i18n.deleted || '已删除', 1500, 'info')
}
const refreshDicts = () => (offlineDicts.value = offlineDictManager.getDicts(), onlineDicts.value = onlineDictManager.getDicts())
const toggleDict = async (manager:any, id:string) => { await manager.toggleDict(id); refreshDicts() }
const addQuickDoc = (doc:any) => {
  if (!settings.value.quickSendDocs) settings.value.quickSendDocs = []
  if (settings.value.quickSendDocs.some(d => d.id === doc.id)) return showMessage(props.i18n.alreadyExists || '已存在', 2000, 'error')
  settings.value.quickSendDocs.push(doc)
  save()
}
const removeQuickDoc = (i:number) => { settings.value.quickSendDocs.splice(i, 1); save() }
const selectInsertDoc = (doc:any) => { settings.value.parentDoc = doc; settings.value.notebookId = doc.notebook; save() }
const clearInsertDoc = () => { settings.value.parentDoc = undefined; insertDoc.reset(); save() }
const uploadBgImage = async (e:Event) => {
  if (!can.value('reader-theme')) return showUpgrade('reader-theme')
  try { await setCustomBackgroundFromInput(settings.value, e) && save() }
  catch (e:any) { showMessage(e.message || props.i18n.uploadFailed || '上传失败', 3000, 'error') }
}
const clearBgImage = () => (settings.value.customTheme.bgImg = '', save())
const bgImageRows = computed(() => [{
  key: 'bgImg',
  text: props.i18n.bgImage || '背景图片',
  hint: settings.value.customTheme.bgImg || props.i18n.bgImageDesc || '',
  checkbox: !!settings.value.customTheme.bgImg,
  onCheck: (value:boolean) => value ? bgInput.value?.click() : clearBgImage(),
  action: () => bgInput.value?.click(),
  actionTitle: props.i18n.select || props.i18n.upload || '选择',
  actionIcon: '#iconUpload'
}])
const applyLinkFormatPreset = (preset:string) => {
  const format = LINK_FORMAT_PRESETS[preset as keyof typeof LINK_FORMAT_PRESETS]
// 拖拽排序
  if (!format) return
  settings.value.linkFormat = format
  save()
}
let dragFrom = -1
const dragStart = (e:DragEvent, i:number) => { dragFrom = i; (e.target as HTMLElement).style.opacity = '0.4' }
const dragEnd = (e:DragEvent) => { (e.target as HTMLElement).style.opacity = '1'; dragFrom = -1 }
const dragOver = (e:DragEvent) => e.preventDefault()
const dragDrop = async (e:DragEvent, to:number, type:'nav'|'dict'|'quickDoc', ref?:any, mgr?:any) => {
  e.preventDefault()
  if (dragFrom === -1 || dragFrom === to) return
  if (type === 'nav') { const arr = [...navItems.value]; arr.splice(to, 0, ...arr.splice(dragFrom, 1)); arr.forEach((v, i) => v.order = i); settings.value.navItems = arr; save() }
  else if (type === 'quickDoc') { const arr = [...settings.value.quickSendDocs]; arr.splice(to, 0, ...arr.splice(dragFrom, 1)); settings.value.quickSendDocs = arr; save() }
  else { const arr = [...ref.value]; arr.splice(to, 0, ...arr.splice(dragFrom, 1)); await mgr.sortDicts(arr.map((d:any) => d.id)); ref.value = arr }
}
const ttsI18nKey = (key:string, suffix='') => `tts${key.charAt(0).toUpperCase()}${key.slice(1)}${suffix}`

// 计算属性
const navItems = computed(() => (settings.value.navItems || DEFAULT_NAV_ITEMS).filter(item => item.id !== 'dictionary').sort((a, b) => a.order - b.order))
const docRows = (field:any) => (field.docs || []).map((doc:any, i:number) => ({
  key: doc.id,
  text: doc.name,
  graphic: field.drag ? '⋮⋮' : undefined,
  draggable: !!field.drag,
  dragstart: (e:DragEvent) => field.drag && dragStart(e, i),
  dragend: (e:DragEvent) => field.drag && dragEnd(e),
  dragover: (e:DragEvent) => field.drag && dragOver(e),
  drop: (e:DragEvent) => field.drag && dragDrop(e, i, field.drag),
  action: () => field.remove(doc, i),
  actionTitle: props.i18n.delete || '删除',
  actionIcon: '#iconTrashcan'
}))
const docResultRows = (field:any) => (field.results || []).map((doc:any) => ({ key: doc.id, text: doc.hPath || doc.content || '无标题', pick: () => field.select(doc) }))
const navRows = computed(() => navItems.value.map((item, idx) => ({
  key: item.id,
  text: props.i18n[item.tip] || item.tip,
  graphic: '⋮⋮',
  draggable: true,
  dragstart: (e:DragEvent) => dragStart(e, idx),
  dragend: dragEnd,
  dragover: dragOver,
  drop: (e:DragEvent) => dragDrop(e, idx, 'nav'),
  checkbox: item.enabled,
  disabled: item.id === 'appearance',
  onCheck: (value:boolean) => (item.enabled = value, save())
})))
const fontGuideRows = computed(() => [{
  key: 'custom-fonts',
  text: 'data/plugins/custom-fonts/',
  hint: isLoadingFonts.value ? (props.i18n.loadingFonts || '正在加载字体') : '',
  alwaysShowActions: true,
  action: () => loadCustomFonts(true),
  actionTitle: props.i18n.refresh || '刷新',
  actionIcon: '#lucide-refresh-cw'
}])
const fontRows = computed(() => customFonts.value.map(f => ({
  key: f.name,
  text: f.displayName,
  hint: f.name,
  textStyle: { fontFamily: f.displayName },
  active: settings.value.textSettings.customFont.fontFile === f.name,
  pick: () => setFont(f),
  checkbox: settings.value.textSettings.customFont.fontFile === f.name,
  onCheck: (value:boolean) => value ? setFont(f) : setFont()
})))
const dictAddRows = computed(() => [{
  key: 'add-dict',
  text: uploading.value ? (props.i18n.uploading || '上传中') : (props.i18n.addDict || '添加词典'),
  alwaysShowActions: true,
  actions: [
    { key: 'help', title: props.i18n.dictFormatHint || '支持 StarDict 和 dictd 格式', icon: '#iconHelp', onClick: () => openPage(dictHelpUrl) },
    { key: 'file', title: props.i18n.addDict || '添加词典', icon: '#iconUpload', onClick: () => !uploading.value && (can.value('dict-offline') ? fileInput.value?.click() : showUpgrade('dict-offline')) },
    { key: 'folder', title: props.i18n.importFolder || 'Import folder', icon: '#iconFolder', onClick: () => !uploading.value && (can.value('dict-offline') ? folderInput.value?.click() : showUpgrade('dict-offline')) }
  ]
}])
const confirmDeleteHint = (text:string, id:string) => removingDict.value === id ? `${text} · ${props.i18n.confirmDelete || '再次点击删除'}` : text
const dictRows = (section:any) => section.items.map((d:any, idx:number) => ({
  key: d.id,
  text: d.name,
  hint: confirmDeleteHint(section.desc(d), d.id),
  graphic: '⋮⋮',
  draggable: true,
  dragstart: (e:DragEvent) => dragStart(e, idx),
  dragend: dragEnd,
  dragover: dragOver,
  drop: (e:DragEvent) => section.drop(e, idx),
  checkbox: d.enabled,
  onCheck: () => toggleDict(section.manager, d.id),
  action: section.extra ? () => removingDict.value === d.id ? removeDict(d.id) : (removingDict.value = d.id) : undefined,
  actionTitle: removingDict.value === d.id ? (props.i18n.confirm || '确认') : (props.i18n.delete || '删除'),
  actionIcon: removingDict.value === d.id ? '#lucide-trash-2' : '#iconTrashcan'
}))
// 保存
const save = async () => (emit('update:modelValue',settings.value),await props.onSave())
const debouncedSave = (() => {let t:any;return () => (clearTimeout(t),t=setTimeout(save,300))})()
const setFont = (f?:FontFileInfo) => (settings.value.textSettings.fontFamily=f?'custom':'inherit',settings.value.textSettings.customFont=f?{fontFamily:f.displayName,fontFile:f.name}:{fontFamily:'',fontFile:''},f?debouncedSave():save())
const saveTheme = () => { if (!can.value('reader-theme')) return settings.value.theme='default', showUpgrade('主题配色'); save() }
const openPage = (url:string) => window.open(url,'_blank')
const dictHelpUrl = `https://github.com/mm-o/siyuan-sireader/blob/main/docs/${encodeURIComponent('离线词典使用说明.md')}`
const openPurchasePage = () => openPage('https://pay.ldxp.cn/shop/J7MJJ8YR/lillyt')
const openMembershipInfo = () => openPage('https://sireader.745201.xyz')

// 打开授权面板
;(window as any)._openLicenseContent = () => {
  openGroups.value.license = true
  setTimeout(() => {
    licenseRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    licenseRef.value?.classList.add('license-highlight')
    setTimeout(() => licenseRef.value?.classList.remove('license-highlight'), 2000)
  }, 50)
}

// 生命周期
onMounted(() => {
  bookshelfManager.init()
  loadingDict.value = true
  offlineDictManager.init(plugin).then(refreshDicts).finally(() => loadingDict.value=false)
  loadLicense()
})
</script>

<template>
  <div class="fn__flex-1 fn__flex-column bs-view bs-tree">
    <div class="fn__flex-1 bs-tree__scroll" @pointerdown.stop @click.stop @input.stop @change.stop @contextmenu.prevent.stop>
        <ul ref="licenseRef" class="b3-list b3-list--background" data-name="license">
          <SectionTitle :title="i18n.membership || '会员订阅'" :icon="settingSectionIcon('root', 'license')" :open="isOpen('license')" @toggle="toggleAccordion('license')">
            <span class="fn__space"></span>
            <span class="b3-list-item__action b3-tooltips b3-tooltips__w" :aria-label="i18n.usageTitle || '使用说明'" @click.stop="openMembershipInfo"><svg><use xlink:href="#iconHelp"></use></svg></span>
          </SectionTitle>
          <template v-if="isOpen('license')">
            <SettingRows v-if="loadingLicense" :rows="[]" :loading="true" :i18n="i18n" />
            <li v-else class="b3-list-item b3-list-item--hide-action">
              <span class="b3-list-item__toggle fn__hidden"></span>
              <div class="fn__flex-1 fn__flex" style="gap:12px;align-items:flex-start">
                <div class="fn__flex-center">
                  <div style="position:relative;width:48px;height:48px;display:inline-block;overflow:visible">
                    <img v-if="licenseMedia.avatar" :src="licenseMedia.avatar" loading="lazy" style="width:48px;height:48px;border-radius:50%;object-fit:cover;display:block">
                    <svg v-else style="width:48px;height:48px"><use :xlink:href="licenseMedia.icon"></use></svg>
                    <svg style="position:absolute;right:-2px;bottom:-2px;width:18px;height:18px"><use :xlink:href="licenseMedia.icon"></use></svg>
                  </div>
                </div>
                <div class="fn__flex-1 fn__flex-column">
                  <div class="fn__flex-1">
                    {{ license?.userName || i18n.membership || '会员订阅' }}
                    <div v-for="line in licenseMedia.lines" :key="line" class="ft__smaller ft__on-surface">{{ line }}</div>
                    <input
                      v-if="!license"
                      v-model="activationCode"
                      type="text"
                      class="b3-text-field"
                      :placeholder="i18n.enterActivationCode || '激活码'"
                      :disabled="processing"
                      @mousedown.stop
                      @pointerdown.stop
                      @touchend.stop="focusMobileEditable($event.target)"
                    >
                  </div>
                  <div class="fn__flex fn__flex-end">
                    <template v-if="license">
                      <span class="b3-list-item__action b3-tooltips b3-tooltips__nw" :aria-label="i18n.logout || '退出'" @click.stop="clearLicense"><svg><use xlink:href="#lucide-x"></use></svg></span>
                      <span class="b3-list-item__action b3-tooltips b3-tooltips__nw" :aria-label="i18n.purchase || '购买'" @click.stop="openPurchasePage"><svg><use xlink:href="#lucide-shopping-bag"></use></svg></span>
                    </template>
                    <template v-else>
                      <button class="b3-button b3-button--outline" :disabled="processing || !activationCode.trim()" @click.stop="activateLicense">{{ processing ? (i18n.processing || '处理中') : (i18n.activate || '激活') }}</button>
                      <button class="b3-button b3-button--text" :disabled="processing" @click.stop="recoverLicense">{{ i18n.recover || '恢复' }}</button>
                      <span class="b3-list-item__action b3-tooltips b3-tooltips__nw" :aria-label="i18n.purchase || '购买'" @click.stop="openPurchasePage"><svg><use xlink:href="#lucide-shopping-bag"></use></svg></span>
                    </template>
                  </div>
                </div>
              </div>
            </li>
          </template>
        </ul>

        <SettingSection :title="i18n.interfaceLayout || '界面布局'" :icon="settingSectionIcon('root', 'interface')" :open="isOpen('interface')" @toggle="toggleAccordion('interface')">
            <SettingItem
              v-for="item in interfaceItems"
              :key="item.key"
              :item="item"
              :model-value="settings[item.key]"
              :label="i18n[item.key] || item.key"
              :hint="i18n[item.key + 'Desc'] || ''"
              :i18n="i18n"
              @change="value => (settings[item.key] = value, save())"
              @input="value => (settings[item.key] = value, debouncedSave())"
            />
            <SectionTitle :title="i18n.navConfig || '导航配置'" :icon="settingSectionIcon('sub', 'navItems')" :open="isSubOpen('navItems')" @toggle="toggleSub('navItems')" />
            <template v-if="isSubOpen('navItems')">
              <SettingRows :rows="navRows" :i18n="i18n" />
            </template>
        </SettingSection>

        <ul class="b3-list b3-list--background" data-name="cloud">
          <SectionTitle :title="i18n.cloudAccounts || '云盘账号'" :icon="settingSectionIcon('root', 'cloud')" :open="isOpen('cloud')" @toggle="toggleAccordion('cloud')">
            <span class="fn__space"></span>
            <span class="b3-list-item__action b3-tooltips b3-tooltips__w" :aria-label="i18n.addCloudAccount || '添加云盘账号'" @click.stop="addCloudAccount"><svg><use xlink:href="#lucide-plus"></use></svg></span>
          </SectionTitle>
          <template v-if="isOpen('cloud')">
            <li v-if="!cloudAccounts.length" class="b3-list-item b3-list-item--hide-action">
              <span class="b3-list-item__toggle fn__hidden"></span>
              <span class="b3-list-item__text ft__secondary">{{ i18n.noCloudAccounts || '暂无云盘账号，点击右上角添加' }}</span>
            </li>
            <template v-for="(account, index) in cloudAccounts" :key="account.id">
              <li class="b3-list-item b3-list-item--hide-action sr-cloud-account-title">
                <span class="b3-list-item__toggle fn__hidden"></span>
                <span class="b3-list-item__text">{{ cloudAccountTitle(account, index) }}</span>
                <span class="fn__space"></span>
                <span class="b3-list-item__action b3-tooltips b3-tooltips__w" :aria-label="i18n.delete || '删除'" @click.stop="removeCloudAccount(account.id)"><svg><use xlink:href="#lucide-trash-2"></use></svg></span>
              </li>
              <li class="b3-list-item b3-list-item--hide-action">
                <span class="b3-list-item__toggle fn__hidden"></span>
                <span class="b3-list-item__text">{{ i18n.cloudAccountName || '自定义名称' }}</span>
                <span class="fn__space"></span>
                <input :value="account.name" type="text" class="b3-text-field sr-cloud-input" :placeholder="i18n.optional || '可选'" @input="updateCloudAccount(account, 'name', ($event.target as HTMLInputElement).value)">
              </li>
              <li class="b3-list-item b3-list-item--hide-action">
                <span class="b3-list-item__toggle fn__hidden"></span>
                <span class="b3-list-item__text">{{ i18n.cloudServer || '服务器' }}</span>
                <span class="fn__space"></span>
                <input :value="account.server" type="url" class="b3-text-field sr-cloud-input" placeholder="https://openlist.example.com" @input="updateCloudAccount(account, 'server', ($event.target as HTMLInputElement).value)">
              </li>
              <li class="b3-list-item b3-list-item--hide-action">
                <span class="b3-list-item__toggle fn__hidden"></span>
                <span class="b3-list-item__text ariaLabel" :aria-label="i18n.cloudPathPrefixDesc || '可选，仅部署在子路径时填写，例如 openlist'">{{ i18n.cloudPathPrefix || '路径前缀' }}</span>
                <span class="fn__space"></span>
                <input :value="account.pathPrefix" type="text" class="b3-text-field sr-cloud-input" :placeholder="i18n.cloudPathPrefixPlaceholder || '可选，仅部署在子路径时填写，例如 openlist'" @input="updateCloudAccount(account, 'pathPrefix', ($event.target as HTMLInputElement).value)">
              </li>
              <li class="b3-list-item b3-list-item--hide-action">
                <span class="b3-list-item__toggle fn__hidden"></span>
                <span class="b3-list-item__text">{{ i18n.username || '用户' }}</span>
                <span class="fn__space"></span>
                <input :value="account.username" type="text" class="b3-text-field sr-cloud-input" autocomplete="username" @input="updateCloudAccount(account, 'username', ($event.target as HTMLInputElement).value)">
              </li>
              <li class="b3-list-item b3-list-item--hide-action">
                <span class="b3-list-item__toggle fn__hidden"></span>
                <span class="b3-list-item__text">{{ i18n.password || '密码' }}</span>
                <span class="fn__space"></span>
                <input :value="account.password" type="password" class="b3-text-field sr-cloud-input" autocomplete="current-password" @input="updateCloudAccount(account, 'password', ($event.target as HTMLInputElement).value)">
              </li>
            </template>
          </template>
        </ul>

        <SettingSection :title="i18n.readingTheme || '阅读主题'" :icon="settingSectionIcon('root', 'theme')" :open="isOpen('theme')" @toggle="toggleAccordion('theme')">
            <SettingItem :item="presetThemeItem" :model-value="settings.theme" :label="i18n.presetTheme || '预设主题'" :hint="i18n.presetThemeDesc || ''" :i18n="i18n" @change="value => (settings.theme = value, saveTheme())" />
            <template v-if="settings.theme === 'custom'">
              <SettingItem
                v-for="item in themeItems"
                :key="item.key"
                :item="item"
                :model-value="settings.customTheme[item.key]"
                :label="i18n[item.label] || item.label"
                :hint="i18n[item.label + 'Desc'] || i18n[item.key + 'Desc'] || ''"
                :i18n="i18n"
                @change="value => (settings.customTheme[item.key] = value, can('reader-theme') ? save() : showUpgrade('reader-theme'))"
              />
              <input ref="bgInput" type="file" accept="image/*" class="fn__none" @change="uploadBgImage">
              <SettingRows :rows="bgImageRows" :i18n="i18n" />
            </template>
        </SettingSection>

        <SettingSection v-for="group in appearanceGroups" :key="group.title" :title="i18n[group.title] || group.title" :icon="settingSectionIcon('appearance', group.title)" :open="isOpen(group.title)" @toggle="toggleAccordion(group.title)">
            <SettingItem
              v-for="item in group.items"
              :key="item.key"
              :item="item"
              :model-value="settings[group.title][item.key]"
              :label="i18n[item.key] || item.key"
              :hint="i18n[item.key + 'Desc'] || ''"
              :i18n="i18n"
              @change="value => (settings[group.title][item.key] = value, item.type === 'checkbox' ? save() : debouncedSave())"
              @input="value => (settings[group.title][item.key] = value, debouncedSave())"
            />
            <template v-if="group.title === 'textSettings'">
              <SectionTitle :title="i18n.customFont || '自定义字体'" :icon="settingSectionIcon('sub', 'customFont')" :open="isSubOpen('customFont')" @toggle="toggleSub('customFont')" />
              <template v-if="isSubOpen('customFont')">
                <SettingRows :rows="fontGuideRows" :i18n="i18n" />
                <SettingRows :rows="fontRows" :loading="isLoadingFonts" :empty="i18n.noCustomFonts || '暂无自定义字体'" :i18n="i18n" />
              </template>
            </template>
        </SettingSection>

        <SettingSection :title="i18n.dictionaryTools || '词典工具'" :icon="settingSectionIcon('root', 'dictionary')" :open="isOpen('dictionary')" @toggle="toggleAccordion('dictionary')">
            <input ref="fileInput" type="file" multiple accept=".ifo,.idx,.dict,.dict.dz,.dz,.index,.syn" class="fn__none" @change="handleUpload">
            <input ref="folderInput" type="file" multiple webkitdirectory directory accept=".ifo,.idx,.dict,.dict.dz,.dz,.index,.syn" class="fn__none" @change="handleUpload">
            <SettingRows v-if="loadingDict" :rows="[]" :loading="true" :i18n="i18n" />
            <template v-else>
              <template v-for="section in dictSections" :key="section.key">
                <SectionTitle :title="section.title" :icon="settingSectionIcon('dictionary', section.key)" :open="isSubOpen(section.key)" @toggle="toggleSub(section.key)" />
                <template v-if="isSubOpen(section.key)">
                  <SettingRows v-if="section.extra" :rows="dictAddRows" :i18n="i18n" />
                  <SettingRows v-if="section.items.length || section.empty" :rows="dictRows(section)" :empty="section.empty" :i18n="i18n" />
                </template>
              </template>
            </template>
        </SettingSection>

        <SettingSection :title="i18n.noteInsert || '笔记插入'" :icon="settingSectionIcon('root', 'other')" :open="isOpen('other')" @toggle="toggleAccordion('other')">
            <li v-for="field in noteFields" :key="field.key" class="b3-list-item b3-list-item--hide-action">
              <span class="b3-list-item__toggle fn__hidden"></span>
              <div class="fn__flex-1">
                <div class="fn__flex">
                  <span class="b3-list-item__text ariaLabel" :aria-label="field.hint || ''">{{ field.label }}</span>
                  <span class="fn__space"></span>
                  <select v-if="field.type === 'select'" :value="field.value" class="b3-select sr-control" @change="field.set(($event.target as HTMLSelectElement).value)">
                    <option v-if="field.empty" value="">{{ field.empty }}</option>
                    <option v-for="opt in (field.options || [])" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <label v-else-if="field.type === 'checkbox'" class="fn__flex-center"><input :checked="field.value" type="checkbox" class="b3-switch" @change="field.set(($event.target as HTMLInputElement).checked)"></label>
                </div>
                <textarea v-if="field.type === 'textarea'" v-model="settings.linkFormat" class="b3-text-field" rows="3" @input="debouncedSave"></textarea>
                <template v-else-if="field.type === 'search'">
                  <SettingRows v-if="field.docs?.length" :rows="docRows(field)" :i18n="i18n" />
                  <div>
                    <input :value="field.input" class="b3-text-field" :placeholder="i18n?.searchDocPlaceholder || '搜索文档'" @input="field.setInput(($event.target as HTMLInputElement).value); ($event.target as HTMLInputElement).value.trim() && field.search()" @keyup.enter="field.search()">
                    <SettingRows v-if="field.results?.length" :rows="docResultRows(field)" :i18n="i18n" />
                  </div>
                </template>
              </div>
            </li>
        </SettingSection>

        <SettingSection :title="i18n.ttsSettings || '语音朗读'" :icon="settingSectionIcon('root', 'tts')" :open="isOpen('tts')" @toggle="toggleAccordion('tts')">
            <template v-if="settings.tts">
              <SettingItem
                v-for="item in ttsFields"
                :key="item.key"
                :item="item"
                :model-value="settings.tts[item.key]"
                :label="i18n[ttsI18nKey(item.key)] || item.key"
                :hint="item.desc && i18n[item.desc] ? i18n[item.desc] : ''"
                :i18n="i18n"
                @change="value => (settings.tts[item.key] = value, save())"
                @input="value => (settings.tts[item.key] = value, debouncedSave())"
              />
              <template v-for="section in voiceSections" :key="section.key">
                <SectionTitle :title="section.title" :icon="settingSectionIcon('voice', section.key)" :open="isSubOpen(section.key)" :aria-label="section.hint || ''" @toggle="toggleSub(section.key)" />
                <template v-if="isSubOpen(section.key)">
                  <SettingRows :rows="section.rows" :empty="section.empty" :load-label="section.loadLabel" :loading="loadingTTS" :i18n="i18n" @load="!loadingTTS && loadTTS()" />
                </template>
              </template>
            </template>
            <SettingRows v-else :rows="[]" :empty="i18n.ttsNotConfigured || '语音未配置'" :i18n="i18n" />
        </SettingSection>

      <div class="sr-settings-actions">
        <template v-if="resetConfirm">
          <button class="b3-button b3-button--cancel" @click="resetConfirm = false">{{ i18n.cancel || '取消' }}</button>
          <button class="b3-button" @click="handleReset">{{ i18n.confirm || '确认' }}</button>
        </template>
        <button v-else class="b3-button" @click="handleReset">{{ i18n.resetDefault || '恢复默认' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use './deck/deck.scss';

.bs-view{min-height:0;height:100%;padding:0;box-sizing:border-box}
.bs-tree{overflow:hidden;--bs-tree-border:color-mix(in srgb,var(--b3-theme-on-surface-light) 30%,transparent);--b3-list-hover:color-mix(in srgb,var(--b3-theme-primary) 12%,transparent)}
.bs-tree__scroll{display:flex;flex-direction:column;gap:6px;min-height:0;overflow:auto;scrollbar-gutter:stable;padding:8px 0 8px 8px;box-sizing:border-box}
.bs-tree :deep(ul){padding:0;list-style:none}
.bs-tree :deep(.b3-list){margin:0;background:transparent}
.bs-tree :deep(.b3-list-item){overflow:visible}
.bs-tree :deep(.sr-section-title){margin:0;border-radius:var(--b3-border-radius)}
.bs-tree :deep(.b3-list-item--hide-action + .b3-list-item--hide-action){border-top:1px solid var(--b3-border-color)}
.bs-tree :deep(.b3-list-item--hide-action:last-child){padding-bottom:6px}
.bs-tree :deep(.b3-list-item__text),.bs-tree :deep(.b3-text-field){min-width:0}
.bs-tree :deep(.b3-list-item__meta){min-width:0;max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bs-tree :deep(.b3-text-field){width:100%;max-width:100%;box-sizing:border-box}
.bs-tree :deep(ul.b3-list.b3-list--background){border:1px solid var(--bs-tree-border);border-radius:var(--b3-border-radius)}
.bs-tree :deep(.sr-section-title > svg.b3-list-item__graphic){width:14px;height:14px;flex:0 0 14px;color:var(--b3-theme-on-surface);opacity:.86;stroke-width:1.8;shape-rendering:geometricPrecision}
.bs-tree :deep(.sr-section-title:hover > svg.b3-list-item__graphic){color:inherit;opacity:1}
.sr-control{width:80px}
.sr-cloud-input{flex:1 1 280px;max-width:520px}
.sr-cloud-account-title{background:color-mix(in srgb,var(--b3-theme-surface) 70%,transparent)}
.sr-settings-actions{display:flex;justify-content:center;align-items:center;gap:8px;padding:8px 0 0}
.bs-tree :deep(input[type="color"].sr-control){height:24px;padding:0;border:none;background:transparent}
.license-highlight{animation:license-pulse 2s ease}
@keyframes license-pulse {
  0%,100%{box-shadow:0 0 0 0 transparent}
  50%{box-shadow:0 0 0 4px var(--b3-theme-primary-light)}
}
</style>
