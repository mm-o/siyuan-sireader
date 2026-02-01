import type { Plugin } from 'siyuan'
import { getFile, putFile } from '@/api'

const BASE_URL='https://dictionary.cambridge.org'
const MXNZP_ID='guuhjloujpkfenn1',MXNZP_SECRET='izYrfPlqfRMxrXHUCf5vEbD4WSxnjSow'
const DICT_PATH='/data/storage/petal/siyuan-sireader/dictionaries/'
const CONFIG_PATH=`${DICT_PATH}config.json`

// ===== 类型定义 =====
export interface DictResult{word:string;phonetics:{ipa:string;audio:string;region:'us'|'uk'}[];parts:{part:string;means:string[]}[];examples:{en:string;zh:string}[]}
export interface OfflineDict{id:string;name:string;type:'stardict'|'dictd';enabled:boolean;files:{ifo?:string;dz?:string;idx?:string;syn?:string;index?:string}}
export interface OnlineDict{id:string;name:string;icon:string;enabled:boolean;url?:string;desc?:string}
export interface DictConfig{dicts:{id:string;name:string;type:string;enabled:boolean;files:any}[];online?:{id:string;enabled:boolean}[]}
export interface DictCardData{word:string;phonetic?:string;phonetics?:{text:string;audio?:string}[];badges?:{text:string;gradient:boolean}[];meanings?:{pos:string;text:string}[];defs?:string[];examples?:{en:string;zh:string}[];extras?:{label:string;text:string}[];meta?:string}

const DICT_NAMES:Record<string,string>={ai:'AI','ai-free':'AI(免费)',cambridge:'剑桥',youdao:'有道',haici:'海词',mxnzp:'汉字',ciyu:'词语',zdic:'汉典',offline:'离线',bing:'必应'}
export const getDictName=(id:string)=>DICT_NAMES[id]||id

export const POS_MAP:Record<string,{name:string;color:string}>={n:{name:'n.',color:'#2563eb'},noun:{name:'n.',color:'#2563eb'},v:{name:'v.',color:'#059669'},verb:{name:'v.',color:'#059669'},vt:{name:'vt.',color:'#047857'},vi:{name:'vi.',color:'#0d9488'},a:{name:'adj.',color:'#d97706'},adj:{name:'adj.',color:'#d97706'},adjective:{name:'adj.',color:'#d97706'},ad:{name:'adv.',color:'#ea580c'},adv:{name:'adv.',color:'#ea580c'},adverb:{name:'adv.',color:'#ea580c'},prep:{name:'prep.',color:'#7c3aed'},conj:{name:'conj.',color:'#9333ea'},pron:{name:'pron.',color:'#db2777'},int:{name:'int.',color:'#dc2626'},art:{name:'art.',color:'#4f46e5'}}

export const ONLINE_DICTS:OnlineDict[]=[{id:'ai-free',name:'AI翻译(免费)',icon:'#iconSparkles',enabled:true,desc:'免费AI翻译，无需配置'},{id:'ai',name:'AI翻译(思源)',icon:'#iconSparkles',enabled:true,desc:'使用思源AI智能翻译'},{id:'cambridge',name:'剑桥',icon:'#iconLanguage',enabled:true,desc:'英汉双解，支持发音'},{id:'youdao',name:'有道',icon:'https://shared.ydstatic.com/images/favicon.ico',enabled:true,desc:'英汉词典，简洁快速'},{id:'haici',name:'海词',icon:'https://dict.cn/favicon.ico',enabled:true,desc:'英汉词典，例句丰富'},{id:'mxnzp',name:'汉字',icon:'#iconA',enabled:true,desc:'汉字字典，详细解释'},{id:'ciyu',name:'词语',icon:'#iconFont',enabled:true,desc:'汉语词语，成语典故'},{id:'zdic',name:'汉典',icon:'https://www.zdic.net/favicon.ico',enabled:true,desc:'汉字词语查询'},{id:'bing',name:'必应',icon:'https://cn.bing.com/favicon.ico',enabled:true,url:'https://cn.bing.com/dict/search?q={{word}}',desc:'必应词典网页版'}]

let plugin:Plugin|null=null,onlineDicts=[...ONLINE_DICTS]

// ===== 离线词典管理器 =====
class OfflineDictManager{
  private dicts:OfflineDict[]=[]
  private loaded=new Map<string,any>()
  private loading=new Map<string,Promise<void>>()
  private initialized=false
  
  async init(p:Plugin){
    if(this.initialized)return
    plugin=p
    this.initialized=true
    try{
      await putFile(DICT_PATH,true,new File([],''))
      const config=await getFile(CONFIG_PATH)
      if(config?.dicts?.length){
        this.dicts=config.dicts.map(cfg=>({id:cfg.id,name:cfg.name,type:cfg.type as any,enabled:cfg.enabled,files:cfg.files}))
        this.preloadIndexes()
      }
    }catch(e){console.error('[Dict]',e)}
  }
  
  private async preloadIndexes(){
    const mod=await import('foliate-js/dict.js')
    await Promise.all(this.dicts.filter(d=>d.enabled).map(async dict=>{
      try{
        const instance=dict.type==='stardict'?new mod.StarDict():new mod.DictdDict()
        const files=dict.type==='stardict'?[dict.files.ifo,dict.files.idx,dict.files.syn]:[dict.files.index]
        const loaders={ifo:'loadIfo',idx:'loadIdx',syn:'loadSyn',index:'loadIndex'}
        await Promise.all(files.filter(Boolean).map(async f=>{
          const key=Object.keys(dict.files).find(k=>dict.files[k]===f)
          if(key&&loaders[key])await instance[loaders[key]](await this.loadFile(f!))
        }))
        this.loaded.set(dict.id,instance)
      }catch(e){console.error('[Dict] Preload:',dict.name,e)}
    }))
  }
  
  private dictDataLoaded=new Set<string>()
  
  private async loadDict(cfg:DictConfig['dicts'][0]){
    if(this.loading.has(cfg.id))return this.loading.get(cfg.id)
    const loadPromise=(async()=>{
      try{
        let dict=this.loaded.get(cfg.id)
        if(!dict){
          const mod=await import('foliate-js/dict.js')
          dict=cfg.type==='stardict'?new mod.StarDict():new mod.DictdDict()
          const loaders=[['ifo','loadIfo'],['idx','loadIdx'],['syn','loadSyn'],['index','loadIndex']]
          await Promise.all(loaders.map(async([key,method])=>cfg.files[key]&&dict[method](await this.loadFile(cfg.files[key]))))
          this.loaded.set(cfg.id,dict)
        }
        if(cfg.files.dz&&!this.dictDataLoaded.has(cfg.id)){
          await dict.loadDict(await this.loadFile(cfg.files.dz),this.inflate)
          this.dictDataLoaded.add(cfg.id)
        }
      }finally{this.loading.delete(cfg.id)}
    })()
    this.loading.set(cfg.id,loadPromise)
    return loadPromise
  }
  
  private async loadFile(path:string):Promise<File>{
    const res=await fetch('/api/file/getFile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path})})
    if(!res.ok)throw new Error('File not found')
    const blob=await res.blob()
    return new File([blob],path.split('/').pop()||'file')
  }
  
  private inflate=async(data:Uint8Array):Promise<Uint8Array>=>{
    const{inflate}=await import('fflate')
    return new Promise((resolve,reject)=>{inflate(data,(err,result)=>err?reject(err):resolve(result))})
  }
  
  async lookup(word:string):Promise<any[]|null>{
    for(const dict of this.dicts.filter(d=>d.enabled)){
      try{
        await this.loadDict(dict)
        const instance=this.loaded.get(dict.id)
        if(!instance)continue
        const results=await instance.lookup(word)
        if(!results?.length)continue
        for(const r of results)if(Array.isArray(r.data))for(const item of r.data)if(item[1]instanceof Promise)item[1]=await item[1]
        return results
      }catch(e){console.error('[Dict] Lookup:',dict.name,e)}
    }
    return null
  }
  
  getDicts=()=>this.dicts
  
  async sortDicts(order:string[]){
    const map=new Map(this.dicts.map(d=>[d.id,d]))
    this.dicts=order.map(id=>map.get(id)).filter(Boolean)as OfflineDict[]
    await this.saveConfig()
  }
  
  async addDict(files:FileList){
    if(!plugin||!files.length)return
    const groups=new Map<string,{ifo?:File;dz?:File;idx?:File;syn?:File;index?:File}>(),extMap={ifo:'ifo','dict.dz':'dz',dz:'dz',idx:'idx',index:'index',syn:'syn'}
    Array.from(files).forEach(file=>{
      const baseName=file.name.replace(/\.(ifo|dict\.dz|dz|idx|index|syn)$/i,''),ext=file.name.match(/\.(ifo|dict\.dz|dz|idx|index|syn)$/i)?.[1].toLowerCase()
      if(ext&&extMap[ext]){
        if(!groups.has(baseName))groups.set(baseName,{})
        groups.get(baseName)![extMap[ext]]=file
      }
    })
    for(const[baseName,group]of groups){
      try{
        const id=`dict_${Date.now()}_${Math.random().toString(36).slice(2,9)}`,dictPath=`${DICT_PATH}${id}/`,savedFiles:OfflineDict['files']={}
        await fetch('/api/file/putFile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:dictPath,isDir:true,file:''})})
        for(const[key,file]of Object.entries(group)){
          if(file){
            const filePath=`${dictPath}${file.name}`,formData=new FormData()
            formData.append('path',filePath)
            formData.append('file',file)
            formData.append('isDir','false')
            await fetch('/api/file/putFile',{method:'POST',body:formData})
            savedFiles[key as keyof typeof savedFiles]=filePath
          }
        }
        this.dicts.push({id,name:baseName,type:(group.ifo||group.idx)?'stardict':'dictd',enabled:true,files:savedFiles})
        await this.saveConfig()
      }catch(e){console.error('[Dict] Add:',baseName,e);throw e}
    }
  }
  
  async removeDict(id:string){
    const idx=this.dicts.findIndex(d=>d.id===id)
    if(idx>=0){
      await fetch('/api/file/removeFile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:`${DICT_PATH}${id}/`})}).catch(()=>{})
      this.dicts.splice(idx,1)
      this.loaded.delete(id)
      await this.saveConfig()
    }
  }
  
  async toggleDict(id:string){
    const dict=this.dicts.find(d=>d.id===id)
    if(dict){dict.enabled=!dict.enabled;await this.saveConfig()}
  }
  
  private async saveConfig(){
    if(!plugin)return
    try{
      await putFile(CONFIG_PATH,false,new File([JSON.stringify({dicts:this.dicts.map(({id,name,type,enabled,files})=>({id,name,type,enabled,files}))},null,2)],'config.json',{type:'application/json'}))
    }catch(e){console.error('[Dict]',e)}
  }
}

export const offlineDictManager=new OfflineDictManager()

// ===== 在线词典管理器 =====
class OnlineDictManager{
  async init(p:Plugin){
    plugin=p
    try{
      const config=await getFile(CONFIG_PATH)
      config?.online?.forEach(o=>{const d=onlineDicts.find(d=>d.id===o.id);if(d)d.enabled=o.enabled})
    }catch{}
  }
  
  getDicts=()=>onlineDicts
  
  async sortDicts(order:string[]){
    const map=new Map(onlineDicts.map(d=>[d.id,d]))
    onlineDicts=order.map(id=>map.get(id)).filter(Boolean)as OnlineDict[]
    await this.saveConfig()
  }
  
  async toggleDict(id:string){
    const dict=onlineDicts.find(d=>d.id===id)
    if(dict){dict.enabled=!dict.enabled;await this.saveConfig()}
  }
  
  private async saveConfig(){
    if(!plugin)return
    try{
      let config:DictConfig={dicts:[]}
      try{const data=await getFile(CONFIG_PATH);if(data)config=data}catch{}
      config.online=onlineDicts.map(d=>({id:d.id,enabled:d.enabled}))
      await putFile(CONFIG_PATH,false,new File([JSON.stringify(config,null,2)],'config.json',{type:'application/json'}))
    }catch(e){console.error('[Dict]',e)}
  }
}

export const onlineDictManager=new OnlineDictManager()
export function initDictModule(p:Plugin){
  plugin=p
  Promise.all([offlineDictManager.init(p),onlineDictManager.init(p)]).catch(e=>console.error('[Dict] Init error:',e))
}

// ===== 查询函数 =====
const fetchHTML=async(url:string)=>new DOMParser().parseFromString(await(await fetch(url)).text(),'text/html')
const getTexts=(doc:Document,selector:string)=>Array.from(doc.querySelectorAll(selector)).map(el=>el.textContent?.trim()).filter(Boolean)

// 智能解析文本，自动提取词性、标签、注释等信息并分类
const parseText=(text:string):{pos:string;text:string;extras:{label:string;text:string}[]}=>{
  const extras:{label:string;text:string}[]=[],bracketPatterns=[/【([^】]+)】/g,/\[([^\]]+)\]/g,/（([^）]+)）/g,/<([^>]+)>/g]
  let cleanText=text
  
  // 提取括号标签
  bracketPatterns.forEach(regex=>Array.from(text.matchAll(regex)).forEach(match=>{
    const content=match[1].trim()
    if(content&&content.length<=20){
      const label=/^(复|单|口|旧|俗|书|文|方|古)$/.test(content)?'用法':/^(语|数|计|医|化|物|生|史|地|政|经|法|哲|文|理|工|农|商)$/.test(content)||content.includes('、')?'领域':'注释'
      extras.push({label,text:content})
      cleanText=cleanText.replace(match[0],'')
    }
  }))
  
  // 提取冒号标签
  const colonMatch=cleanText.match(/^([^：:，。；]+)[：:]\s*(.+)/)
  colonMatch&&colonMatch[1].trim().length<=10&&(extras.push({label:'说明',text:`${colonMatch[1].trim()}：${colonMatch[2]}`}),cleanText=colonMatch[2])
  
  // 提取词性
  cleanText=cleanText.trim()
  const posMatch=cleanText.match(/^([a-z]{1,4})\.\s*(.+)/i)
  return posMatch?{pos:posMatch[1],text:posMatch[2].trim(),extras}:{pos:'',text:cleanText,extras}
}

// 合并多个解析结果的 extras，自动去重
const mergeExtras=(extrasArray:{label:string;text:string}[][])=>{
  const map=new Map<string,Set<string>>()
  extrasArray.forEach(extras=>extras.forEach(({label,text})=>(map.has(label)||map.set(label,new Set()),map.get(label)!.add(text))))
  return Array.from(map).map(([label,texts])=>({label,text:Array.from(texts).join('、')}))
}

const AI_PROMPT=`你是专业翻译人员，母语为{{to}}。任务：将输入文本翻译成标准、地道的{{to}}。执行前先判断输入语言。规则：1.如文本包含{{to}}句子或段落，仅{{to}}部分原样输出（含标点、空白符），不翻译、润色或改写。其他非{{to}}部分翻译成自然流畅的{{to}}。2.多语言混合段落，把所有文本看做整体，仅{{to}}部分原样保留，剩余非{{to}}继续翻译。3.严格保留原文段落数量、空格（含行首空格）、空白符、缩进、换行符、标点符号等格式，必须与原文完全一致。4.保留HTML标签结构并保证语义通顺。5.不翻译专有名词、代码。输出：1.不输出任何说明、解释或注释（如"翻译如下："、"（注：xxx)"等）。2.直接返回译文文本，不用JSON格式。3.保留所有原始格式，若原文行首有空格，译文也必须有相同数量空格。4.换行符、标点符号、空白符必须与原文一致。5.不参考历史对话，仅按上述规则执行。现在翻译：{{text}}`

// AI 查询通用函数
const queryAICommon=async(word:string,isLong:boolean,url:string,bodyFn:(prompt:string)=>any,errorMsgs:{config:string;fail:string;timeout:string;unavailable:string})=>{
  try{
    const isChinese=/[\u4e00-\u9fa5]/.test(word)
    const toLang=isChinese?'us-en':'zh-cn'
    const prompt=isLong?AI_PROMPT.replace(/\{\{to\}\}/g,toLang).replace('{{text}}',word):(isChinese?`翻译成英文并简要解释：${word}`:`翻译成中文并简要解释：${word}`)
    const controller=new AbortController()
    const timeoutId=setTimeout(()=>controller.abort(),60000)
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(bodyFn(prompt)),signal:controller.signal}).finally(()=>clearTimeout(timeoutId))
    if(!res.ok)return errorMsgs.config?{word,defs:[errorMsgs.config]}:null
    const data=await res.json()
    if(data.code!==0||!data.data)return{word,defs:[errorMsgs.fail]}
    const text=(data.data||await res.text()).trim().replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    return{word,defs:text.split('\n').filter((l:string)=>l.trim())}
  }catch(e:any){
    if(e.name==='AbortError')return{word,defs:[errorMsgs.timeout]}
    return{word,defs:[errorMsgs.unavailable]}
  }
}

async function queryAIFree(word:string,isLong=false){
  const isChinese=/[\u4e00-\u9fa5]/.test(word)
  return queryAICommon(word,isLong,'https://ai.bingal.com/api/v1/translate',prompt=>({text:prompt,lang:isChinese?'us-en':'zh-cn'}),{config:'',fail:'',timeout:'',unavailable:''}).catch(()=>null)
}

export async function queryAI(word:string,isLong=false){
  // 拦截并移除思源AI的全屏加载进度条
  const checkAndRemove=()=>{const el=document.querySelector('#progress:has(.b3-dialog__loading)');if(el)el.remove();else requestAnimationFrame(checkAndRemove)}
  checkAndRemove()
  return queryAICommon(word,isLong,'/api/ai/chatGPT',prompt=>({msg:prompt}),{
    config:'思源AI 翻译功能需要配置\n请在思源笔记 设置 → AI 中配置 OpenAI API 或其他 AI 服务\n\n💡 提示：可使用"AI翻译(免费)"选项，无需配置',
    fail:'思源AI 翻译失败，请检查 AI 配置\n\n💡 提示：可使用"AI翻译(免费)"选项',
    timeout:'思源AI 翻译超时\n请稍后重试或减少文本长度\n\n💡 提示：可使用"AI翻译(免费)"选项',
    unavailable:'思源AI 翻译服务不可用\n可能原因：\n• 未配置思源 AI 服务\n• API 密钥无效或额度不足\n• 网络连接问题\n\n💡 提示：可使用"AI翻译(免费)"选项'
  })
}

// 通用查询函数：自动解析文本并提取标签
const queryWithParse=async(word:string,fetchFn:()=>Promise<{entry:string;phonetic?:string;audio?:string;rawDefs:string[]}|null>,source:string)=>{
  try{
    const data=await fetchFn()
    if(!data)return null
    const allExtras=data.rawDefs.map(d=>parseText(d).extras)
    const meanings=data.rawDefs.map(d=>{const p=parseText(d);return{pos:p.pos,text:p.text}})
    const phonetics=data.audio&&data.phonetic?[{text:data.phonetic,audio:data.audio}]:undefined
    return{word:data.entry,phonetic:data.phonetic||'',phonetics,meanings,extras:[...mergeExtras(allExtras),{label:'来源',text:source}]}
  }catch{return null}
}

export async function queryYoudao(word:string){
  const{data}=await(await fetch(`https://dict.youdao.com/suggest?q=${encodeURIComponent(word)}&le=en&num=5&doctype=json`)).json().catch(()=>({data:null}))
  const entries=data?.entries||[]
  if(!entries.length)return null
  const allExtras:{label:string;text:string}[][]=[]
  const meanings=entries.slice(0,5).flatMap((e:any)=>e.explain.split(/;\s*/).map((p:string)=>{const parsed=parseText(p);allExtras.push(parsed.extras);return{pos:parsed.pos,text:e.entry===word?parsed.text:`${e.entry} - ${parsed.text}`}}))
  return{word:entries[0].entry,meanings,extras:[...mergeExtras(allExtras),{label:'来源',text:'有道词典'}]}
}

export const queryHaici=(word:string)=>queryWithParse(word,async()=>{
  const doc=await fetchHTML(`https://dict.cn/${encodeURIComponent(word)}`)
  const entry=doc.querySelector('.keyword')?.textContent?.trim()
  const phonetic=doc.querySelector('.phonetic')?.textContent?.trim()?.replace(/\s+/g,' ')
  const audio=doc.querySelector('.audio-btn')?.getAttribute('data-src')
  const rawDefs=getTexts(doc,'.layout.basic li, .layout li, .dict-basic-ul li').filter(d=>d.length<200).slice(0,10)
  return entry&&rawDefs.length?{entry,phonetic,audio,rawDefs}:null
},'海词词典')

export async function queryMxnzp(word:string){
  try{
    const json=await(await fetch(`https://www.mxnzp.com/api/convert/dictionary?content=${encodeURIComponent(word)}&app_id=${MXNZP_ID}&app_secret=${MXNZP_SECRET}`)).json()
    if(json.code!==1||!json.data?.length)return null
    const d=json.data[0],meanings=d.explanation?d.explanation.split('\n').filter((s:string)=>s.trim()).slice(0,10).map((text:string)=>({pos:'',text})):[]
    return{word:d.word+(d.traditional!==d.word?`（繁：${d.traditional}）`:''),phonetic:d.pinyin||'',badges:[d.radicals?{text:`部首: ${d.radicals}`,gradient:false}:null,d.strokes?{text:`笔画: ${d.strokes}画`,gradient:false}:null].filter(Boolean)as any,meanings,extras:[{label:'来源',text:'汉字词典'}]}
  }catch{return null}
}

// 构建 extras 数组的辅助函数
const buildExtras=(origin?:string,synonyms:string[]=[],antonyms:string[]=[],source='词语词典')=>[
  {label:'来源',text:source},
  ...(origin?[{label:'出处',text:origin}]:[]),
  ...(synonyms.length?[{label:'近义',text:synonyms.join('、')}]:[]),
  ...(antonyms.length?[{label:'反义',text:antonyms.join('、')}]:[])
]

export async function queryCiyu(word:string){
  try{
    const doc=await fetchHTML(`https://hanyu.dict.cn/${encodeURIComponent(word)}`),entry=doc.querySelector('.keyword')?.textContent?.trim()||word,phonetic=doc.querySelector('.phonetic')?.textContent?.trim()?.replace(/\s+/g,' ')
    const basicDefs=getTexts(doc,'.basic-info .info-list li').filter(t=>!t.startsWith('【')).slice(0,8),detailDefs=getTexts(doc,'.detail-info .info-mod p, .content-info p').slice(0,6)
    const exampleTexts=getTexts(doc,'.example-list li, .sent-item').slice(0,4),origin=doc.querySelector('.origin-info, .source-info')?.textContent?.trim()
    const synonyms=getTexts(doc,'.synonym-list a, .near-word a').slice(0,8),antonyms=getTexts(doc,'.antonym-list a, .anti-word a').slice(0,8)
    let meanings=[...basicDefs,...detailDefs].map(text=>({pos:'',text})),examples=exampleTexts.map(text=>({en:text,zh:''}))
    if(!meanings.length){
      const doc2=await fetchHTML(`https://dict.cn/${encodeURIComponent(word)}`),basicDefs2=getTexts(doc2,'.layout.cn ul li a').slice(0,5),refDefs2=getTexts(doc2,'.layout.ref dd ul li div').slice(0,4)
      const examples2=Array.from(doc2.querySelectorAll('.layout.sort ol li')).slice(0,3).map(li=>{const parts=li.innerHTML.split('<br>');return parts.length===2?{en:parts[0].trim(),zh:parts[1].trim()}:null}).filter(Boolean)as any
      const allWords=getTexts(doc2,'.layout.nfo ul li a'),mid=Math.floor(allWords.length/2)
      meanings=[...basicDefs2.map(t=>({pos:'',text:`英译: ${t}`})),...refDefs2.map(t=>({pos:'',text:t}))]
      return{word:doc2.querySelector('.keyword')?.textContent?.trim()||word,phonetic:doc2.querySelector('.phonetic')?.textContent?.trim()?.replace(/\s+/g,' ')||phonetic||'',meanings,examples:examples2,extras:buildExtras(undefined,allWords.slice(0,mid),allWords.slice(mid))}
    }
    return{word:entry,phonetic:phonetic||'',meanings,examples,extras:buildExtras(origin,synonyms,antonyms)}
  }catch{return null}
}

export async function queryZdic(word:string){
  try{
    const doc=await fetchHTML(`https://www.zdic.net/hans/${encodeURIComponent(word)}`),entry=doc.querySelector('.z_title h1')?.textContent?.trim()||word,defTexts=getTexts(doc,'.jnr p').slice(0,8)
    if(!entry||!defTexts.length)return null
    const phonetic=doc.querySelector('.z_title .z_pyth')?.textContent?.trim()?.replace(/\s+/g,' ')||(defTexts[0]?.match(/[a-z̀-ͯ\s]+/i)?.[0]?.trim())||''
    const info1=doc.querySelector('.z_info span:nth-child(2)')?.textContent?.trim(),info2=doc.querySelector('.z_info span:nth-child(4)')?.textContent?.trim()
    return{word:entry,phonetic,badges:[info1?{text:info1,gradient:false}:null,info2?{text:info2,gradient:false}:null].filter(Boolean)as any,meanings:defTexts.map(text=>({pos:'',text})),extras:[{label:'来源',text:'汉典'}]}
  }catch{return null}
}

export async function queryCambridge(w:string):Promise<DictResult|null>{
  try{
    const parseHTML=(html:string):DictResult|null=>{
      const doc=new DOMParser().parseFromString(html,'text/html'),word=doc.querySelector('.headword')?.textContent?.trim()
      if(!word)return null
      const makePhonetic=(block:Element|null,region:'us'|'uk')=>({ipa:block?.querySelector('.pron .ipa')?.textContent?.trim()||'',audio:block?.querySelector('[type="audio/mpeg"]')?.getAttribute('src')||'',region})
      const phonetics=[makePhonetic(doc.querySelector('.us'),'us'),makePhonetic(doc.querySelector('.uk'),'uk')].filter(p=>p.ipa)
      const partMap=new Map<string,string[]>(),examples:{en:string;zh:string}[]=[]
      doc.querySelectorAll('.entry-body__el').forEach(el=>{
        const part=el.querySelector('.posgram')?.textContent?.trim()||'unknown'
        el.querySelectorAll('.dsense').forEach(dsense=>dsense.querySelectorAll('.def-block').forEach(defBlock=>{
          const cn=defBlock.querySelector('.ddef_b')?.firstElementChild?.textContent?.trim()
          cn&&(partMap.has(part)?partMap.get(part)!.push(cn):partMap.set(part,[cn]))
          if(examples.length<3){
            const en=defBlock.querySelector('.examp .eg')?.textContent?.trim()||'',zh=defBlock.querySelector('.examp .eg')?.nextElementSibling?.textContent?.trim()||''
            en&&examples.push({en,zh})
          }
        }))
      })
      return{word,phonetics,parts:Array.from(partMap).map(([part,means])=>({part,means})),examples}
    }
    const fetchDict=async(path:string)=>{try{const res=await fetch(`${BASE_URL}/${path}/${w.split(' ').join('-')}`);return res.ok?parseHTML(await res.text()):null}catch{return null}}
    return await fetchDict('dictionary/english-chinese-simplified')||await fetchDict('dictionary/english')
  }catch{return null}
}


// ===== 渲染函数 =====

// 词典卡片默认样式
const DICT_CARD_CSS = `
.card{font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#333;padding:20px;background:#fff}
.word{font-size:24px;font-weight:700;margin-bottom:8px;color:#2c3e50}
.phonetic{color:#7f8c8d;font-size:14px;margin-bottom:16px}
.badge{display:inline-block;padding:2px 8px;margin:2px;background:#ecf0f1;border-radius:3px;font-size:12px;color:#7f8c8d}
.meaning{margin:12px 0;line-height:1.8}
.pos{display:inline-block;padding:2px 6px;margin-right:6px;background:#3498db;color:#fff;border-radius:3px;font-size:12px;font-weight:600}
.example{margin:8px 0 8px 20px;color:#555;font-style:italic}
.example-zh{margin-top:4px;color:#7f8c8d;font-size:14px}
.extra{margin:8px 0;font-size:14px;color:#555}
.extra-label{font-weight:600;color:#2c3e50;margin-right:4px}
b{color:#2c3e50;font-weight:600}
i{color:#7f8c8d}
hr{border:none;border-top:1px solid #ecf0f1;margin:16px 0}
`

export function renderDictCard(data:DictCardData):string{
  const{word,phonetic,phonetics,badges,meanings,defs,examples,extras}=data
  
  const phoneticText=phonetic?`/${phonetic}/`:phonetics?.map(p=>p.text).join(' ')||''
  const badgesText=badges?.map(b=>b.text).join(' · ')||''
  const meaningsText=meanings?.map(m=>`<div class="meaning">${m.pos?`<span class="pos">${m.pos}</span>`:''}${m.text}</div>`).join('')||''
  const examplesText=examples?.length?`<hr>${examples.map(ex=>`<div class="example">${ex.en}${ex.zh?`<div class="example-zh">${ex.zh}</div>`:''}</div>`).join('')}`:''
  const extrasText=extras?.length?`<hr>${extras.map(e=>`<div class="extra"><span class="extra-label">${e.label}：</span>${e.text}</div>`).join('')}`:''
  const defsText=defs?.length?`<hr>${defs.join('<br>')}`:''
  
  return`<div class="word">${word}</div>${phoneticText?`<div class="phonetic">${phoneticText}</div>`:''}${badgesText?`<div class="phonetic">${badgesText}</div>`:''}${meaningsText}${examplesText}${extrasText}${defsText}`
}

function parseOfflineDict(results:any[]):DictCardData{
  const r=results[0],data=Array.isArray(r.data)?r.data:[[r.data[0],r.data[1]]]
  let phonetic='',rank='',freq='',tense=''
  const meanings:{pos:string;text:string}[]=[],extras:{label:string;text:string}[]=[],defs:string[]=[]
  
  data.forEach(([type,d])=>{
    if(type==='m'){
      new TextDecoder().decode(d).trim().split('\n').map(l=>l.trim()).filter(Boolean).forEach(line=>{
        if(line.startsWith('*['))phonetic=line.match(/^\*\[([^\]]+)\]/)?.[1]||''
        else if(line.match(/^\([\d-]+\/\d+\)$/)){const m=line.match(/\((\d+)\/(\d+)\)/);m?(rank=m[1],freq=m[2]):freq=line.match(/\d+/)?.[0]||''}
        else if(line.startsWith('[时态]')||line.startsWith('[变形]'))tense=line.replace(/^\[[^\]]+\]\s*/,'')
        else if(line.match(/^[a-z]{1,3}\.\s/)){const m=line.match(/^([a-z]{1,3})\.\s+(.+)/);m&&meanings.push({pos:m[1],text:m[2]})}
        else if(line.startsWith('[')&&line.includes(']')){const m=line.match(/^\[([^\]]+)\]\s*(.+)/);m&&extras.push({label:m[1],text:m[2]})}
      })
    }else defs.push(`<div class="dict-${type==='h'||type==='x'?'html':'plain'}">${new TextDecoder().decode(d)}</div>`)
  })
  
  return{word:r.word,phonetic,badges:[rank&&rank!=='-'?{text:`排名 ${rank}`,gradient:true}:null,freq?{text:`词频 ${freq}`,gradient:false}:null].filter(Boolean)as any,meanings,extras:[tense?{label:'变形',text:tense}:null,...extras].filter(Boolean)as any,defs}
}

// ===== 查询窗口 =====
import{Dialog,showMessage}from'siyuan'

let dialog:Dialog|null=null
let state:{word:string;dictId:string;data?:DictCardData}={word:'',dictId:''}
let selectionInfo:{cfi?:string;section?:number;page?:number;rects?:any[];text:string}|null=null
let lastSelectedDeckId='default'

export async function openDict(word:string,_x?:number,_y?:number,selection?:{cfi?:string;section?:number;page?:number;rects?:any[];text:string}){
  state={word,dictId:'',data:undefined}
  selectionInfo=selection||null
  dialog?.destroy()
  
  const offlineDicts=offlineDictManager.getDicts().filter(d=>d.enabled)
  const allDicts=[...(offlineDicts.length?[{id:'offline',name:`离线(${offlineDicts.length})`,icon:'#iconDatabase'}]:[]),...onlineDicts.filter(d=>d.enabled)]
  const makeIcon=(icon:string)=>icon.startsWith('#')?`<svg style="width:14px;height:14px"><use xlink:href="${icon}"/></svg>`:`<img src="${icon}" style="width:14px;height:14px">`
  
  let deckSelector=''
  if(selectionInfo){
    const{getPack}=await import('@/components/deck')
    const decks=await getPack()
    deckSelector=`<select id="dict-deck-select" class="b3-select" style="padding:4px 8px;font-size:12px;margin-left:8px">${decks.map(d=>`<option value="${d.id}" ${d.id===lastSelectedDeckId?'selected':''}>${d.name}</option>`).join('')}</select><button class="b3-button b3-button--outline" id="dict-deck-btn" style="padding:4px 12px;font-size:12px;margin-left:4px"><svg style="width:14px;height:14px"><use xlink:href="#iconAdd"/></svg> 加入卡包</button>`
  }
  
  const tabs=allDicts.map(d=>`<button class="b3-button b3-button--outline" data-id="${d.id}" style="padding:4px 8px;font-size:12px">${makeIcon(d.icon)} ${d.name}</button>`).join('')
  dialog=new Dialog({title:'📖 词典',content:`<style>${DICT_CARD_CSS}</style><div class="b3-dialog__content" style="display:flex;flex-direction:column;gap:8px;height:100%"><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">${tabs}${deckSelector}</div><div class="dict-body fn__flex-1" style="overflow-y:auto;padding:8px"></div></div>`,width:'540px',height:'600px'})
  
  dialog.element.querySelectorAll('[data-id]').forEach(btn=>btn.addEventListener('click',()=>switchDict((btn as HTMLElement).dataset.id!)))
  
  if(selectionInfo){
    dialog.element.querySelector('#dict-deck-btn')?.addEventListener('click',async()=>{
      if(!state.data)return
      const deckSelect=dialog?.element.querySelector('#dict-deck-select')as HTMLSelectElement
      const deckId=deckSelect?.value||'default'
      lastSelectedDeckId=deckId
      
      const{addCard}=await import('@/components/deck')
      const phoneticText=state.data.phonetic?` /${state.data.phonetic}/`:state.data.phonetics?.map(p=>p.text).join(' ')||''
      const success=await addCard(deckId,
        `${state.word}${phoneticText}`,
        renderDictCard(state.data),
        {
          tags:[state.dictId],
          source:'dict',
          position:{cfi:selectionInfo.cfi,section:selectionInfo.section,page:selectionInfo.page,rects:selectionInfo.rects},
          bookUrl:(window as any).__currentBookUrl||'',
          bookTitle:(window as any).__currentBookTitle||'',
          modelCss:DICT_CARD_CSS
        }
      )
      if(success){
        const btn=dialog?.element.querySelector('#dict-deck-btn')as HTMLButtonElement
        if(btn){
          btn.innerHTML='<svg style="width:14px;height:14px"><use xlink:href="#iconCheck"/></svg> 已加入'
          btn.disabled=true
          btn.style.opacity='0.6'
        }
        showMessage(`已加入「${deckSelect?.selectedOptions[0]?.text||'默认卡组'}」`,1500,'info')
      }else showMessage('加入失败',2000,'error')
    })
  }
  
  switchDict(allDicts[0]?.id||'ai')
}

function switchDict(dictId:string){
  if(!dialog)return
  state.dictId=dictId
  const baseStyle='padding:4px 8px;font-size:12px'
  dialog.element.querySelectorAll('[data-id]').forEach(btn=>{
    const el=btn as HTMLElement,isActive=el.dataset.id===dictId
    btn.classList.toggle('b3-button--cancel',isActive)
    el.style.cssText=isActive?`${baseStyle};background:var(--b3-theme-primary);color:var(--b3-theme-on-primary);box-shadow:0 2px 4px rgba(0,0,0,0.2)`:baseStyle
  })
  const dict=onlineDicts.find(d=>d.id===dictId)
  if(dict?.url)return setBody(`<iframe src="${dict.url.replace('{{word}}',state.word)}" style="width:100%;height:100%;border:none"/>`)
  
  dictId!=='ai'&&dictId!=='ai-free'&&setBody('<div style="text-align:center;padding:20px;color:var(--b3-theme-on-surface-light)">查询中...</div>')
  
  const isLongText=state.word.length>50||state.word.split(/[。！？.!?]/).length>2
  const loading=(type:string)=>`<div class="dict-loading"><div class="dict-loading-spinner"></div><div class="dict-loading-text">${type} 正在${isLongText?'翻译':'思考'}...</div></div>`
  
  const queries:Record<string,()=>Promise<DictCardData|null>>={
    offline:async()=>{const r=await offlineDictManager.lookup(state.word);return r?parseOfflineDict(r):null},
    'ai-free':async()=>{setBody(loading('免费AI'));const r=await queryAIFree(state.word,isLongText);return r?{word:isLongText?'译文':r.word,defs:r.defs}:null},
    ai:async()=>{setBody(loading('思源AI'));const r=await queryAI(state.word,isLongText);return r?{word:isLongText?'译文':r.word,defs:r.defs}:null},
    cambridge:async()=>{const r=await queryCambridge(state.word);return r?{word:r.word,phonetics:r.phonetics.map(p=>({text:`${p.region==='us'?'美':'英'} /${p.ipa}/`,audio:'https://dictionary.cambridge.org'+p.audio})),meanings:r.parts.flatMap(p=>p.means.map(m=>({pos:p.part,text:m}))),examples:r.examples,extras:[{label:'来源',text:'剑桥词典'}]}:null},
    youdao:()=>queryYoudao(state.word),
    haici:()=>queryHaici(state.word),
    mxnzp:()=>queryMxnzp(state.word),
    ciyu:()=>queryCiyu(state.word),
    zdic:()=>queryZdic(state.word)
  }
  queries[dictId]?.().then(data=>{
    if(data){
      state.data=data
      setBody(renderDictCard(data))
      dictId==='cambridge'&&(dialog?.element.querySelector('.dict-body button[onclick*="Audio"]')as HTMLButtonElement)?.click()
    }else setBody('<div style="text-align:center;padding:20px;color:var(--b3-theme-error)">未找到释义</div>')
  }).catch(()=>setBody('<div style="text-align:center;padding:20px;color:var(--b3-theme-error)">查询失败</div>'))
}

const setBody=(html:string)=>dialog&&((dialog.element.querySelector('.dict-body')as HTMLElement).innerHTML=html)
