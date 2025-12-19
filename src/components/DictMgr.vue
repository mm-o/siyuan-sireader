<template>
  <div class="dict-mgr">
    <!-- 离线词典 -->
    <div v-motion-pop-visible class="dict-group">
      <div class="dict-header">
        <h3 class="dict-title">📚 离线词典</h3>
        <a href="https://github.com/mm-o/siyuan-sireader/blob/main/docs/离线词典使用说明.md" target="_blank" class="dict-help">
          <svg><use xlink:href="#iconHelp"/></svg>下载词典
        </a>
      </div>
      <div class="dict-tip">
        <svg><use xlink:href="#iconInfo"/></svg>
        支持 StarDict (.ifo/.idx/.dict.dz) 和 dictd (.index/.dict.dz) 格式
      </div>
      <input ref="fileInput" type="file" multiple accept=".ifo,.idx,.dz,.index,.syn" style="display:none" @change="handleUpload">
      <button class="b3-button b3-button--outline" :disabled="uploading" @click="fileInput?.click()">
        <svg><use xlink:href="#iconUpload"/></svg>
        {{ uploading ? '上传中...' : '添加词典' }}
      </button>
      
      <div v-if="loading" class="dict-loading">
        <div class="dict-loading-spinner"></div>
        <div class="dict-loading-text">加载中...</div>
      </div>
      
      <div v-else-if="!offlineDicts.length" class="dict-empty">
        <div class="dict-empty-icon">📖</div>
        <div class="dict-empty-text">暂无离线词典</div>
        <div class="dict-empty-hint">点击上方按钮添加词典文件</div>
      </div>
      
      <div v-else class="dict-list">
        <div v-for="(d,idx) in offlineDicts" :key="d.id" class="dict-item">
          <div class="dict-drag">
            <button class="b3-button b3-button--text" :disabled="idx===0" @click="moveOffline(idx,-1)">
              <svg><use xlink:href="#iconUp"/></svg>
            </button>
            <button class="b3-button b3-button--text" :disabled="idx===offlineDicts.length-1" @click="moveOffline(idx,1)">
              <svg><use xlink:href="#iconDown"/></svg>
            </button>
          </div>
          <div class="dict-info">
            <div class="dict-name">{{ d.name }}</div>
            <div class="dict-desc">{{ d.type === 'stardict' ? 'StarDict' : 'dictd' }} 格式</div>
          </div>
          <div class="dict-actions">
            <input type="checkbox" :checked="d.enabled" class="b3-switch" @change="toggleOffline(d.id)">
            <button class="b3-button b3-button--text" @click="remove(d.id)">
              <svg><use xlink:href="#iconTrashcan"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 在线词典 -->
    <div v-motion-pop-visible class="dict-group">
      <h3 class="dict-title">🌐 在线词典</h3>
      <div class="dict-desc">选中文本点击"词典"按钮查询</div>
      <div class="dict-list">
        <div v-for="(d,idx) in onlineDicts" :key="d.id" class="dict-item">
          <div class="dict-drag">
            <button class="b3-button b3-button--text" :disabled="idx===0" @click="moveOnline(idx,-1)">
              <svg><use xlink:href="#iconUp"/></svg>
            </button>
            <button class="b3-button b3-button--text" :disabled="idx===onlineDicts.length-1" @click="moveOnline(idx,1)">
              <svg><use xlink:href="#iconDown"/></svg>
            </button>
          </div>
          <div class="dict-info">
            <div class="dict-name">{{ d.name }}</div>
            <div class="dict-desc">{{ d.desc }}</div>
          </div>
          <input type="checkbox" :checked="d.enabled" class="b3-switch" @change="toggleOnline(d.id)">
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import{ref,onMounted,computed}from'vue'
import{showMessage}from'siyuan'
import{offlineDictManager,onlineDictManager,POS_MAP}from'@/core/dictionary'
import type{DictCardData}from'@/core/dictionary'
import{usePlugin}from'@/main'

const plugin=usePlugin()
const fileInput=ref<HTMLInputElement>()
const offlineDicts=ref<any[]>([])
const onlineDicts=ref<any[]>([])
const uploading=ref(false)
const loading=ref(true)

const handleUpload=async(e:Event)=>{
  const files=(e.target as HTMLInputElement).files
  if(!files?.length)return
  uploading.value=true
  try{
    await offlineDictManager.addDict(files)
    offlineDicts.value=offlineDictManager.getDicts()
    showMessage(`添加 ${files.length} 个词典文件`,2000,'info')
  }catch(e:any){
    showMessage(e.message||'添加失败',3000,'error')
  }finally{
    uploading.value=false
    if(fileInput.value)fileInput.value.value=''
  }
}

const toggleOffline=async(id:string)=>{await offlineDictManager.toggleDict(id);offlineDicts.value=offlineDictManager.getDicts()}
const toggleOnline=async(id:string)=>{await onlineDictManager.toggleDict(id);onlineDicts.value=onlineDictManager.getDicts()}
const remove=async(id:string)=>{if(!confirm('确定删除此词典？'))return;await offlineDictManager.removeDict(id);offlineDicts.value=offlineDictManager.getDicts();showMessage('已删除',1500,'info')}

// 通用排序函数
const moveItem=async(list:any[],manager:any,idx:number,dir:number)=>{
  const arr=[...list]
  const target=idx+dir
  if(target<0||target>=arr.length)return
  ;[arr[idx],arr[target]]=[arr[target],arr[idx]]
  await manager.sortDicts(arr.map((d:any)=>d.id))
  return arr
}

const moveOffline=async(idx:number,dir:number)=>{
  const result=await moveItem(offlineDicts.value,offlineDictManager,idx,dir)
  if(result)offlineDicts.value=result
}

const moveOnline=async(idx:number,dir:number)=>{
  const result=await moveItem(onlineDicts.value,onlineDictManager,idx,dir)
  if(result)onlineDicts.value=result
}

onMounted(async()=>{
  loading.value=true
  try{
    await Promise.all([offlineDictManager.init(plugin),onlineDictManager.init(plugin)])
    offlineDicts.value=offlineDictManager.getDicts()
    onlineDicts.value=onlineDictManager.getDicts()
  }finally{
    loading.value=false
  }
})
</script>

<style scoped lang="scss">
.dict-mgr{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:20px}
.dict-group{background:var(--b3-theme-surface);border-radius:8px;padding:18px;box-shadow:0 1px 3px #0000000d}
.dict-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.dict-title{font-size:15px;font-weight:600;color:var(--b3-theme-primary);margin:0}
.dict-help{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--b3-theme-primary);text-decoration:none;padding:4px 8px;border-radius:4px;transition:all .2s;svg{width:14px;height:14px}&:hover{background:var(--b3-theme-primary-lightest)}}
.dict-tip{padding:10px 12px;margin-bottom:12px;border-radius:6px;background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary);font-size:12px;display:flex;align-items:center;gap:6px;svg{width:14px;height:14px;flex-shrink:0}}
.dict-desc{font-size:12px;color:var(--b3-theme-on-surface-variant);opacity:.7;margin-bottom:12px}
.dict-loading{padding:40px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px}
.dict-loading-spinner{width:32px;height:32px;border:3px solid var(--b3-theme-primary-lightest);border-top-color:var(--b3-theme-primary);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.dict-loading-text{font-size:13px;opacity:.7}
.dict-empty{padding:40px 20px;text-align:center}
.dict-empty-icon{font-size:48px;margin-bottom:12px}
.dict-empty-text{font-size:14px;opacity:.7}
.dict-empty-hint{font-size:12px;opacity:.5;margin-top:8px}
.dict-list{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.dict-item{display:flex;align-items:center;gap:8px;padding:12px;border-radius:6px;background:var(--b3-theme-background);border:1px solid var(--b3-border-color);transition:all .2s;&:hover{border-color:var(--b3-theme-primary-light);box-shadow:0 2px 6px rgba(0,0,0,.08)}}
.dict-drag{display:flex;flex-direction:column;gap:2px;flex-shrink:0;button{padding:2px;svg{width:12px;height:12px}}}
.dict-info{flex:1;min-width:0}
.dict-name{font-weight:500;margin-bottom:4px}
.dict-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
</style>

<style>
.dict-card{padding:20px;background:var(--b3-theme-surface);border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.dict-card-header{display:flex;align-items:baseline;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.dict-word{margin:0;font-size:28px;font-weight:700;color:var(--b3-theme-primary);letter-spacing:-.5px}
.dict-phonetic{color:var(--b3-theme-on-surface);font-size:16px;opacity:.8}
.dict-audio-btn{padding:4px 8px;border:none;background:transparent;cursor:pointer;font-size:16px;transition:transform .2s;&:hover{transform:scale(1.2)}}
.dict-badges{display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap}
.dict-badge{padding:4px 12px;background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary);border-radius:20px;font-size:11px;font-weight:600;&.gradient{background:var(--b3-theme-primary);color:var(--b3-theme-on-primary);letter-spacing:.5px}}
.dict-meanings{display:flex;flex-direction:column;gap:12px}
.dict-meaning{display:flex;gap:12px;padding:14px;background:var(--b3-theme-background);border-radius:8px}
.dict-pos{flex-shrink:0;padding:4px 10px;color:white;border-radius:6px;font-size:13px;font-weight:600;height:fit-content}
.dict-text{flex:1;line-height:1.8;font-size:15px;color:var(--b3-theme-on-surface)}
.dict-defs{display:flex;flex-direction:column;gap:12px}
.dict-def{padding:14px;background:var(--b3-theme-background);border-radius:8px;line-height:1.8;font-size:15px;color:var(--b3-theme-on-surface);strong{font-weight:600;color:var(--b3-theme-primary)}}
.dict-section-title{margin-top:20px;margin-bottom:12px;font-size:14px;font-weight:600;color:var(--b3-theme-on-surface);opacity:.8}
.dict-examples{display:flex;flex-direction:column;gap:10px}
.dict-example{padding:12px;background:var(--b3-theme-background);border-radius:8px;border-left:2px solid var(--b3-theme-on-surface-variant)}
.dict-example-en{font-style:italic;margin-bottom:6px;font-size:14px;line-height:1.6;color:var(--b3-theme-on-surface)}
.dict-example-zh{color:var(--b3-theme-on-surface-light);font-size:13px;opacity:.8}
.dict-extras{margin-top:16px;display:flex;flex-direction:column;gap:10px}
.dict-extra{padding:12px;background:var(--b3-theme-background);border-radius:8px;border-left:2px solid var(--b3-theme-on-surface-variant)}
.dict-extra-label{display:inline-block;padding:2px 8px;background:var(--b3-theme-primary);color:var(--b3-theme-on-primary);border-radius:4px;font-size:11px;font-weight:600;margin-right:10px}
.dict-extra-text{font-size:14px;line-height:1.6;color:var(--b3-theme-on-surface)}
.dict-html{padding:16px;background:var(--b3-theme-surface);border-radius:8px}
.dict-plain{padding:16px;background:var(--b3-theme-background);border-radius:8px;line-height:1.8;white-space:pre-wrap;font-size:14px}
.dict-divider{margin:24px 0;height:2px;background:linear-gradient(90deg,transparent,var(--b3-border-color),transparent)}
.dict-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;gap:16px}
.dict-loading-spinner{width:40px;height:40px;border:3px solid var(--b3-theme-primary-lightest);border-top-color:var(--b3-theme-primary);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.dict-loading-text{color:var(--b3-theme-on-surface);font-size:14px}
</style>
