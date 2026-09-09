import type { Plugin } from 'siyuan'
import { getFile, putFile, removeFile } from '@/api'

const BASE_URL='https://dictionary.cambridge.org'
const MXNZP_ID='guuhjloujpkfenn1',MXNZP_SECRET='izYrfPlqfRMxrXHUCf5vEbD4WSxnjSow'
const DICT_PUBLIC_ROOT='/public/siyuan-sireader/dictionaries'
const CONFIG_PATH=`${DICT_PUBLIC_ROOT}/config.json`

// ===== 类型定义 =====
export interface DictResult{word:string;phonetics:{ipa:string;audio:string;region:'us'|'uk'}[];parts:{part:string;means:string[]}[];examples:{en:string;zh:string}[]}
type OfflineDictFileKey='ifo'|'dz'|'dict'|'idx'|'syn'|'index'
export interface OfflineDict{id:string;name:string;type:'stardict'|'dictd';enabled:boolean;files:Partial<Record<OfflineDictFileKey,string>>}
export interface OnlineDict{id:string;name:string;icon:string;enabled:boolean;url?:string;desc?:string}
export interface DictConfig{dicts:{id:string;name:string;type:string;enabled:boolean;files:any}[];online?:{id:string;enabled:boolean}[]}
export interface DictCardData{word:string;phonetic?:string;phonetics?:{text:string;audio?:string}[];badges?:{text:string;gradient:boolean}[];meanings?:{pos:string;text:string}[];defs?:string[];examples?:{en:string;zh:string}[];extras?:{label:string;text:string}[];meta?:string}

const DICT_NAMES:Record<string,string>={cambridge:'剑桥',youdao:'有道',haici:'海词',mxnzp:'汉字',ciyu:'词语',zdic:'汉典',offline:'离线',bing:'必应'}
export const getDictName=(id:string)=>DICT_NAMES[id]||id

export const POS_MAP:Record<string,{name:string;color:string}>={n:{name:'n.',color:'#2563eb'},noun:{name:'n.',color:'#2563eb'},v:{name:'v.',color:'#059669'},verb:{name:'v.',color:'#059669'},vt:{name:'vt.',color:'#047857'},vi:{name:'vi.',color:'#0d9488'},a:{name:'adj.',color:'#d97706'},adj:{name:'adj.',color:'#d97706'},adjective:{name:'adj.',color:'#d97706'},ad:{name:'adv.',color:'#ea580c'},adv:{name:'adv.',color:'#ea580c'},adverb:{name:'adv.',color:'#ea580c'},prep:{name:'prep.',color:'#7c3aed'},conj:{name:'conj.',color:'#9333ea'},pron:{name:'pron.',color:'#db2777'},int:{name:'int.',color:'#dc2626'},art:{name:'art.',color:'#4f46e5'}}

export const ONLINE_DICTS:OnlineDict[]=[{id:'youdao',name:'有道',icon:'https://shared.ydstatic.com/images/favicon.ico',enabled:true,desc:'英汉词典，简洁快速'},{id:'bing',name:'必应',icon:'https://cn.bing.com/favicon.ico',enabled:true,url:'https://cn.bing.com/dict/search?q={{word}}',desc:'必应词典网页版'},{id:'cambridge',name:'剑桥',icon:'#iconLanguage',enabled:true,desc:'英汉双解，支持发音'},{id:'haici',name:'海词',icon:'https://dict.cn/favicon.ico',enabled:true,desc:'英汉词典，例句丰富'},{id:'mxnzp',name:'汉字',icon:'#iconA',enabled:true,desc:'汉字字典，详细解释'},{id:'ciyu',name:'词语',icon:'#iconFont',enabled:true,desc:'汉语词语，成语典故'},{id:'zdic',name:'汉典',icon:'https://www.zdic.net/favicon.ico',enabled:true,desc:'汉字词语查询'}]

let plugin:Plugin|null=null,onlineDicts=[...ONLINE_DICTS]
const apiPath=(path='')=>path.startsWith('/public/')?path.replace('/public/','/data/public/'):path
const safePathPart=(name='dict')=>name.replace(/[\\/:*?"<>|#%{}^~[\]`]/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'')||'dict'
const getRelativePath=(file:File)=>((file as any).webkitRelativePath||file.name).replace(/\\/g,'/')
const getDictFileKey=(name:string):OfflineDictFileKey|null=>{
  const lower=name.toLowerCase()
  if(lower.endsWith('.dict.dz')||lower.endsWith('.dz'))return'dz'
  if(lower.endsWith('.idx.gz'))return'idx'
  if(lower.endsWith('.syn.gz'))return'syn'
  if(lower.endsWith('.dict'))return'dict'
  const ext=lower.split('.').pop()
  return ext==='ifo'||ext==='idx'||ext==='syn'||ext==='index'?ext:null
}
const stripDictExt=(name:string)=>name.replace(/\.(ifo|idx\.gz|idx|syn\.gz|syn|index|dict|dict\.dz|dz)$/i,'')
const groupKeyForFile=(file:File)=>{
  const rel=getRelativePath(file),parts=rel.split('/'),fileName=parts.pop()||file.name,dir=parts.join('/')
  const base=stripDictExt(fileName)
  return dir?`${dir}/${base}`:base
}
const displayNameForGroup=(key:string,files:File[])=>key.split('/').filter(Boolean).pop()||stripDictExt(files[0]?.name||'dict')
const detectDictType=(files:Partial<Record<OfflineDictFileKey,File|string>>)=>files.index&&!files.ifo&&!files.idx?'dictd':'stardict'
const isUsableDictGroup=(files:Partial<Record<OfflineDictFileKey,File>>)=>detectDictType(files)==='dictd'?!!(files.index&&files.dz):!!((files.ifo||files.idx)&&files.idx&&files.dz)
const decodeDictionaryText=(data:ArrayBuffer|Uint8Array)=>{
  const bytes=data instanceof Uint8Array?data:new Uint8Array(data)
  const decode=(encoding:string,fatal=false)=>new TextDecoder(encoding,{fatal}).decode(bytes)
  try{return decode('utf-8',true)}catch{}
  try{return decode('gb18030')}catch{}
  return decode('utf-8')
}
const readDictionaryFileText=async(file:File)=>decodeDictionaryText(await file.arrayBuffer())
const extractIfoName=(text:string)=>text.match(/^bookname=(.+)$/m)?.[1]?.trim()||''
const escapeHTML=(text:string)=>text.replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!))
const zhPairs='学學 汉漢 语語 词詞 书書 读讀 说說 话話 国國 号號 见見 听聽 写寫 体體 后後 发發 复復 台臺 万萬 与與 专專 业業 东東 严嚴 个個 为為 举舉 义義 乐樂 习習 乡鄉 买買 乱亂 争爭 云雲 亚亞 产產 亲親 亿億 仅僅 从從 仓倉 仪儀 们們 众眾 优優 会會 传傳 伤傷 伦倫 侧側 侨僑 俭儉 债債 倾傾 偿償 储儲 儿兒 党黨 兰蘭 关關 兴興 养養 内內 军軍 农農 冲沖 决決 况況 冻凍 净淨 准準 几幾 凤鳳 凭憑 凯凱 击擊 划劃 刘劉 则則 刚剛 创創 删刪 别別 剂劑 剑劍 剧劇 劝勸 办辦 务務 动動 励勵 劳勞 势勢 区區 医醫 华華 协協 单單 卖賣 卫衛 厂廠 厅廳 历歷 压壓 厌厭 县縣 参參 双雙 变變 叶葉 吗嗎 启啟 吴吳 员員 咏詠 响響 哑啞 哗嘩 唤喚 啸嘯 喷噴 噜嚕 团團 园園 围圍 图圖 圆圓 圣聖 场場 坏壞 块塊 坚堅 坛壇 坝壩 坟墳 坠墜 垄壟 垒壘 垦墾 垫墊 墙牆 壮壯 声聲 壳殼 备備 头頭 夹夾 夺奪 奋奮 奖獎 奥奧 妆妝 妇婦 妈媽 娇嬌 娱娛 婴嬰 婵嬋 孙孫 宁寧 宝寶 实實 宠寵 审審 宪憲 宫宮 宽寬 宾賓 寝寢 对對 寻尋 导導 寿壽 将將 尔爾 尘塵 尝嘗 尽盡 层層 属屬 岁歲 岛島 岭嶺 巩鞏 币幣 帅帥 师師 帐帳 帘簾 带帶 帮幫 干幹 并並 广廣 庄莊 庆慶 庐廬 库庫 应應 庙廟 庞龐 废廢 开開 异異 弃棄 张張 弥彌 弯彎 弹彈 强強 归歸 当當 录錄 径徑 忆憶 忧憂 怀懷 态態 怜憐 总總 恋戀 恳懇 恶惡 恼惱 惊驚 惧懼 惨慘 惩懲 惯慣 愤憤 愿願 懒懶 戏戲 战戰 户戶 扑撲 执執 扩擴 扫掃 扬揚 扰擾 抚撫 抛拋 抢搶 护護 报報 担擔 拟擬 拢攏 拣揀 拥擁 拦攔 拧擰 拨撥 择擇 挂掛 挚摯 挠撓 挡擋 挣掙 挤擠 挥揮 捞撈 损損 捡撿 换換 捣搗 据據 掳擄 掷擲 掺摻 揽攬 搀攙 搁擱 搂摟 搅攪 携攜 摄攝 摆擺 摇搖 摊攤 撑撐 攒攢 敌敵 敛斂 数數 断斷 无無 旧舊 时時 旷曠 昼晝 显顯 晒曬 晓曉 晕暈 暂暫 术術 机機 杀殺 杂雜 权權 条條 来來 杨楊 杰傑 极極 构構 枢樞 枣棗 枪槍 枫楓 柜櫃 树樹 样樣 桥橋 桦樺 档檔 梦夢 检檢 楼樓 榄欖 横橫 樱櫻 欢歡 欧歐 残殘 殡殯 毁毀 毕畢 毙斃 气氣 汇匯 汤湯 沟溝 没沒 沪滬 泪淚 泷瀧 泸瀘 泻瀉 泼潑 泽澤 洁潔 洒灑 浅淺 浆漿 浇澆 浊濁 测測 济濟 浑渾 浓濃 涛濤 涝澇 涟漣 涡渦 涣渙 涤滌 润潤 涧澗 涨漲 涩澀 渊淵 渔漁 渗滲 温溫 湾灣 湿濕 溃潰 溅濺 滚滾 滞滯 满滿 滤濾 滥濫 滦灤 滨濱 滩灘 潇瀟 潜潛 澜瀾 灭滅 灯燈 灵靈 灾災 灿燦 炉爐 炖燉 点點 炼煉 烁爍 烂爛 烛燭 烟煙 烦煩 烧燒 烫燙 热熱 爱愛 爷爺 牵牽 状狀 犹猶 独獨 狭狹 狮獅 猎獵 猪豬 猫貓 献獻 现現 环環 画畫 疗療 疮瘡 疯瘋 痈癰 瘫癱 癣癬 皱皺 盏盞 盐鹽 监監 盖蓋 盘盤 着著 睁睜 矿礦 码碼 砖磚 确確 礼禮 祸禍 禄祿 禅禪 离離 种種 积積 称稱 稳穩 穷窮 窃竊 窍竅 窑窯 窜竄 窝窩 窥窺 笔筆 笺箋 笼籠 筹籌 签簽 简簡 篮籃 篱籬 类類 粮糧 紧緊 红紅 约約 级級 纪紀 纯純 纱紗 纲綱 纳納 纵縱 纷紛 纸紙 纹紋 线線 练練 组組 细細 织織 终終 经經 绑綁 结結 绕繞 绘繪 给給 络絡 绝絕 统統 继繼 绩績 绪緒 续續 绳繩 维維 绵綿 综綜 绿綠 缀綴 缅緬 缆纜 缉緝 缓緩 缔締 缕縷 编編 缘緣 缚縛 缝縫 缠纏 缩縮 缴繳 网網 罗羅 罚罰 罢罷 习習 耻恥 聂聶 聋聾 职職 联聯 聪聰 肃肅 肠腸 肤膚 肾腎 肿腫 胀脹 胁脅 胆膽 胜勝 胶膠 脉脈 脏髒 脑腦 脚腳 脱脫 脸臉 腊臘 腾騰 舆輿 舰艦 舱艙 艰艱 艳艷 艺藝 节節 芜蕪 芦蘆 苏蘇 苹蘋 范範 荐薦 荡蕩 荣榮 药藥 莲蓮 获獲 营營 萧蕭 萨薩 葱蔥 蒋蔣 蓝藍 蕴蘊 虏虜 虑慮 虚虛 虫蟲 虽雖 虾蝦 蚁蟻 蚂螞 蚕蠶 蛮蠻 蝉蟬 补補 表錶 衬襯 袜襪 袭襲 装裝 裤褲 观觀 规規 视視 览覽 觉覺 誉譽 认認 计計 订訂 讥譏 讨討 让讓 训訓 议議 讯訊 记記 讲講 讳諱 讶訝 许許 论論 讼訟 设設 访訪 证證 识識 诈詐 诉訴 诊診 诏詔 译譯 试試 诗詩 诚誠 诛誅 话話 诞誕 诡詭 询詢 该該 详詳 诬誣 误誤 诱誘 诲誨 请請 诸諸 诺諾 课課 谁誰 调調 谈談 谊誼 谋謀 谎謊 谐諧 谓謂 谕諭 谗讒 谚諺 谜謎 谢謝 谣謠 谦謙 谨謹 谱譜 谴譴 谷穀 贝貝 负負 财財 责責 贤賢 败敗 账賬 货貨 质質 贩販 贪貪 贫貧 购購 贮貯 贯貫 贱賤 贴貼 贵貴 贷貸 贸貿 费費 贺賀 贼賊 贾賈 贿賄 资資 赋賦 赌賭 赏賞 赐賜 赔賠 赖賴 赚賺 赛賽 赞贊 赠贈 赢贏 赵趙 赶趕 趋趨 跃躍 践踐 踪蹤 车車 轨軌 轩軒 转轉 轮輪 软軟 轰轟 轴軸 轻輕 载載 轿轎 较較 辅輔 辆輛 辈輩 辉輝 辑輯 输輸 辞辭 边邊 辽遼 达達 迁遷 过過 迈邁 运運 还還 这這 进進 远遠 违違 连連 迟遲 适適 选選 递遞 遗遺 遥遙 邻鄰 郁鬱 郑鄭 酝醞 酱醬 释釋 里裏 针針 钉釘 钓釣 钙鈣 钝鈍 钞鈔 钟鐘 钢鋼 钥鑰 钦欽 钧鈞 钩鉤 钮鈕 钱錢 钻鑽 铁鐵 铃鈴 铅鉛 铆鉚 铜銅 铝鋁 铠鎧 铲鏟 银銀 铸鑄 铺鋪 链鏈 销銷 锁鎖 锅鍋 锋鋒 锐銳 错錯 锚錨 锡錫 锣鑼 锤錘 锦錦 键鍵 锯鋸 锻鍛 镜鏡 长長 门門 闪閃 闭閉 问問 闯闖 闲閒 间間 闷悶 闸閘 闹鬧 闻聞 阅閱 阔闊 队隊 阳陽 阴陰 阵陣 阶階 际際 陆陸 陈陳 陕陝 险險 随隨 隐隱 难難 雾霧 静靜 面麵 顶頂 项項 顺順 须須 顾顧 顿頓 预預 领領 颇頗 颗顆 题題 颜顏 额額 颠顛 风風 飘飄 飞飛 饭飯 饮飲 饰飾 饱飽 饲飼 馆館 马馬 驱驅 驳駁 驴驢 驶駛 驻駐 驼駝 驾駕 骂罵 骄驕 验驗 骑騎 骗騙 骚騷 鱼魚 鲁魯 鲜鮮 鸟鳥 鸡雞 鸣鳴 鸭鴨 鹅鵝 鹏鵬 麦麥 黄黃 齐齊 齿齒 龙龍 龟龜'.split(/\s+/).filter(Boolean)
const s2t=new Map(zhPairs.map(p=>[p[0],p.slice(1)])),t2s=new Map(zhPairs.map(p=>[p.slice(1),p[0]]))
const mapChinese=(word:string,map:Map<string,string>)=>Array.from(word).map(c=>map.get(c)||c).join('')
const lookupCandidates=(word:string)=>Array.from(new Set([word,mapChinese(word,s2t),mapChinese(word,t2s)].filter(Boolean)))
const inflateChunk=async(data:Uint8Array):Promise<Uint8Array>=>{
  const DS=(globalThis as any).DecompressionStream
  const errors:string[]=[]
  if(DS){
    for(const format of ['deflate-raw','deflate']){
      try{
        const bytes=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)
        const stream=new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DS(format))
        return new Uint8Array(await new Response(stream).arrayBuffer())
      }catch(e){errors.push(`${format}: ${(e as Error)?.message||e}`)}
    }
  }
  const{Inflate}=await import('fflate')
  return new Promise((resolve,reject)=>{
    const inflate=new Inflate(chunk=>resolve(chunk))
    try{inflate.push(data)}catch(e){reject(new Error(`Unable to inflate dictzip chunk (${errors.join('; ') || 'no native inflate'}; fflate: ${(e as Error)?.message||e})`))}
  })
}
const decompressFile=async(file:File,format='gzip')=>{
  const DS=(globalThis as any).DecompressionStream
  if(!DS)return file
  const stream=file.stream().pipeThrough(new DS(format))
  return new File([await new Response(stream).blob()],file.name.replace(/\.gz$/i,''),{type:'application/octet-stream'})
}
const readIfoName=async(file?:File)=>file?extractIfoName(await readDictionaryFileText(file).catch(()=>'')):''
const readDictConfig=async():Promise<DictConfig>=>await getFile(apiPath(CONFIG_PATH)).catch(()=>null)||{dicts:[]}
const writeDictConfig=(config:DictConfig)=>putFile(apiPath(CONFIG_PATH),false,new File([JSON.stringify(config,null,2)],'config.json',{type:'application/json'}))

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
      await putFile(apiPath(DICT_PUBLIC_ROOT),true,new File([],''))
      const config=await getFile(apiPath(CONFIG_PATH))
      if(config?.dicts?.length){
        this.dicts=config.dicts.map(cfg=>({id:cfg.id,name:cfg.name,type:cfg.type as any,enabled:cfg.enabled,files:cfg.files||{}}))
        await this.refreshNames()
      }
    }catch{}
  }
  private async refreshNames(){
    let changed=false
    await Promise.all(this.dicts.map(async dict=>{
      if(!dict.files.ifo)return
      const name=extractIfoName(await this.loadFile(dict.files.ifo).then(readDictionaryFileText).catch(()=>''))
      if(name&&name!==dict.name){dict.name=name;changed=true}
    }))
    if(changed)await this.saveConfig()
  }

  private dictDataLoaded=new Set<string>()
  
  private async loadDict(cfg:OfflineDict){
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
        const dataFile=cfg.files.dz
        if(dataFile&&!this.dictDataLoaded.has(cfg.id)){
          await dict.loadDict(await this.loadFile(dataFile),inflateChunk)
          this.dictDataLoaded.add(cfg.id)
        }
      }finally{this.loading.delete(cfg.id)}
    })()
    this.loading.set(cfg.id,loadPromise)
    return loadPromise
  }
  
  private async loadFile(path:string):Promise<File>{
    const res=path.startsWith('/public/')?await fetch(path):await fetch('/api/file/getFile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path})})
    if(!res.ok)throw new Error('File not found')
    const blob=await res.blob()
    const file=new File([blob],path.split('/').pop()||'file')
    return /\.idx\.gz$|\.syn\.gz$/i.test(path)?await decompressFile(file):file
  }
  private async lookupOne(dict:OfflineDict,word:string):Promise<any[]|null>{
    await this.loadDict(dict)
    const instance=this.loaded.get(dict.id)
    if(!instance)return null
    let results:any[]|null=null
    for(const candidate of lookupCandidates(word)){
      const found=await instance.lookup(candidate)
      if(found?.length){results=found;break}
    }
    if(!results?.length)return null
    for(const r of results)if(Array.isArray(r.data))for(const item of r.data)if(item[1]instanceof Promise)item[1]=await item[1]
    return results
  }
  
  async lookup(word:string):Promise<any[]|null>{
    for(const dict of this.dicts.filter(d=>d.enabled)){
      try{
        const results=await this.lookupOne(dict,word)
        if(!results?.length)continue
        return results
      }catch{}
    }
    return null
  }
  async lookupById(id:string,word:string):Promise<any[]|null>{
    const dict=this.dicts.find(d=>d.id===id&&d.enabled)
    if(!dict)return null
    return await this.lookupOne(dict,word)
  }
  
  getDicts=()=>this.dicts
  
  async sortDicts(order:string[]){
    const map=new Map(this.dicts.map(d=>[d.id,d]))
    this.dicts=order.map(id=>map.get(id)).filter(Boolean)as OfflineDict[]
    await this.saveConfig()
  }
  
  async addDict(files:FileList){
    if(!plugin||!files.length)return
    const groups=new Map<string,Partial<Record<OfflineDictFileKey,File>>>()
    Array.from(files).forEach(file=>{
      const key=getDictFileKey(file.name)
      if(key){
        const groupKey=groupKeyForFile(file)
        if(!groups.has(groupKey))groups.set(groupKey,{})
        groups.get(groupKey)![key]=file
      }
    })
    let added=0
    for(const[groupKey,group]of groups){
      if(!isUsableDictGroup(group))continue
      try{
        const id=`dict_${Date.now()}_${Math.random().toString(36).slice(2,9)}`,dictPath=`${DICT_PUBLIC_ROOT}/${id}`,savedFiles:OfflineDict['files']={}
        await putFile(apiPath(dictPath),true,new File([],''))
        for(const[key,file]of Object.entries(group)){
          if(file){
            const publicPath=`${dictPath}/${safePathPart(file.name)}`
            await putFile(apiPath(publicPath),false,file)
            savedFiles[key as OfflineDictFileKey]=publicPath
          }
        }
        const name=await readIfoName(group.ifo)||displayNameForGroup(groupKey,Object.values(group).filter(Boolean) as File[])
        this.dicts.push({id,name,type:detectDictType(group),enabled:true,files:savedFiles})
        added++
        await this.saveConfig()
      }catch(e){throw e}
    }
    if(!added)throw new Error('No complete dictionary group found')
  }
  
  async removeDict(id:string){
    const idx=this.dicts.findIndex(d=>d.id===id)
    if(idx>=0){
      await removeFile(apiPath(`${DICT_PUBLIC_ROOT}/${id}`)).catch(()=>{})
      this.dicts.splice(idx,1)
      this.loaded.delete(id)
      this.dictDataLoaded.delete(id)
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
      const config=await readDictConfig()
      config.dicts=this.dicts.map(({id,name,type,enabled,files})=>({id,name,type,enabled,files}))
      await writeDictConfig(config)
    }catch{}
  }
}

export const offlineDictManager=new OfflineDictManager()

// ===== 在线词典管理器 =====
class OnlineDictManager{
  async init(p:Plugin){
    plugin=p
    try{
      const config=await readDictConfig()
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
      const config=await readDictConfig()
      config.online=onlineDicts.map(d=>({id:d.id,enabled:d.enabled}))
      await writeDictConfig(config)
    }catch{}
  }
}

export const onlineDictManager=new OnlineDictManager()
export function initDictModule(p:Plugin){
  plugin=p
  Promise.all([offlineDictManager.init(p),onlineDictManager.init(p)]).catch(()=>{})
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



// 通用查询函数：自动解析文本并提取标签
const queryWithParse=async(fetchFn:()=>Promise<{entry:string;phonetic?:string;audio?:string;rawDefs:string[]}|null>,source:string)=>{
  try{
    const data=await fetchFn()
    if(!data)return null
    const parsed=data.rawDefs.map(parseText)
    const meanings=parsed.map(({pos,text})=>({pos,text}))
    const phonetics=data.audio&&data.phonetic?[{text:data.phonetic,audio:data.audio}]:undefined
    return{word:data.entry,phonetic:data.phonetic||'',phonetics,meanings,extras:[...mergeExtras(parsed.map(p=>p.extras)),{label:'来源',text:source}]}
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

export const queryHaici=(word:string)=>queryWithParse(async()=>{
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
.dict-raw,.dict-plain{white-space:pre-wrap;font:inherit;line-height:1.7;margin:8px 0;color:#333}
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
    const text=decodeDictionaryText(d).trim()
    if(type==='m'){
      if(text)defs.push('<pre class="dict-raw">'+escapeHTML(text)+'</pre>')
      text.split('\n').map(l=>l.trim()).filter(Boolean).forEach(line=>{
        if(line.startsWith('*['))phonetic=line.match(/^\*\[([^\]]+)\]/)?.[1]||''
        else if(line.match(/^\([\d-]+\/\d+\)$/)){const m=line.match(/\((\d+)\/(\d+)\)/);m?(rank=m[1],freq=m[2]):freq=line.match(/\d+/)?.[0]||''}
        else if(line.startsWith('[??]')||line.startsWith('[??]'))tense=line.replace(/^\[[^\]]+\]\s*/,'')
        else if(line.match(/^[a-z]{1,4}\.\s/)){const m=line.match(/^([a-z]{1,4})\.\s+(.+)/);m&&meanings.push({pos:m[1],text:m[2]})}
        else if(line.startsWith('[')&&line.includes(']')){const m=line.match(/^\[([^\]]+)\]\s*(.+)/);m&&extras.push({label:m[1],text:m[2]})}
      })
    }else defs.push('<div class="dict-'+(type==='h'||type==='x'?'html':'plain')+'">'+(type==='h'||type==='x'?text:escapeHTML(text))+'</div>')
  })
  
  return{word:r.word,phonetic,badges:[rank&&rank!=='-'?{text:'rank '+rank,gradient:true}:null,freq?{text:'freq '+freq,gradient:false}:null].filter(Boolean)as any,meanings,extras:[tense?{label:'variant',text:tense}:null,...extras].filter(Boolean)as any,defs}
}

// ===== 查询窗口 =====
import{Dialog,showMessage}from'siyuan'

let dialog:Dialog|null=null
let state:{word:string;dictId:string;data?:DictCardData}={word:'',dictId:''}
let selectionInfo:{cfi?:string;section?:number;page?:number;rects?:any[];text:string}|null=null
export async function openDict(word:string,_x?:number,_y?:number,selection?:{cfi?:string;section?:number;page?:number;rects?:any[];text:string}){
  state={word,dictId:'',data:undefined}
  selectionInfo=selection||null
  dialog?.destroy()
  
  const offlineDicts=offlineDictManager.getDicts().filter(d=>d.enabled)
  const allDicts=[...offlineDicts.map(d=>({id:`offline:${d.id}`,name:d.name,icon:'#iconDatabase'})),...onlineDicts.filter(d=>d.enabled)]
  const makeIcon=(icon:string)=>icon.startsWith('#')?`<svg style="width:14px;height:14px"><use xlink:href="${icon}"/></svg>`:`<img src="${icon}" style="width:14px;height:14px">`
  
  const tabs=allDicts.map(d=>`<button class="b3-button b3-button--outline" data-id="${d.id}" style="padding:4px 8px;font-size:12px">${makeIcon(d.icon)} ${d.name}</button>`).join('')
  dialog=new Dialog({title:'📖 词典',content:`<style>${DICT_CARD_CSS}</style><div class="b3-dialog__content" style="display:flex;flex-direction:column;gap:8px;height:100%"><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">${tabs}</div><div class="dict-body fn__flex-1" style="overflow-y:auto;padding:8px"></div></div>`,width:'540px',height:'600px'})
  
  dialog.element.querySelectorAll('[data-id]').forEach(btn=>btn.addEventListener('click',()=>switchDict((btn as HTMLElement).dataset.id!)))
  
  switchDict(allDicts[0]?.id||'youdao')
}

async function switchDict(dictId:string){
  if(!dialog)return
  state.dictId=dictId
  const baseStyle='padding:4px 8px;font-size:12px'
  dialog.element.querySelectorAll('[data-id]').forEach(btn=>{
    const el=btn as HTMLElement,isActive=el.dataset.id===dictId
    btn.classList.toggle('b3-button--cancel',isActive)
    el.style.cssText=isActive?`${baseStyle};background:var(--b3-theme-primary);color:var(--b3-theme-on-primary);box-shadow:0 2px 4px rgba(0,0,0,0.2)`:baseStyle
  })
  
  const license=await(await import('@/core/license')).LicenseManager.getLicense()
  const freeDicts=['youdao','bing']
  const offlineId=dictId.startsWith('offline:')?dictId.slice(8):''
  if(offlineId&&!(await import('@/core/license')).LicenseManager.can('dict-offline',license))return setBody('<div style="text-align:center;padding:40px 20px"><div style="font-size:16px;margin-bottom:12px">📖 离线词典</div><div style="font-size:14px;color:var(--b3-theme-on-surface-variant);margin-bottom:16px">需要体验会员</div><button class="b3-button b3-button--outline" onclick="window._openLicense && window._openLicense()" style="padding:6px 16px">去激活</button></div>')
  if(!offlineId&&!freeDicts.includes(dictId)&&!(await import('@/core/license')).LicenseManager.can('dict-advanced',license))return setBody('<div style="text-align:center;padding:40px 20px"><div style="font-size:16px;margin-bottom:12px">📖 高级词典</div><div style="font-size:14px;color:var(--b3-theme-on-surface-variant);margin-bottom:16px">需要体验会员<br>免费版可用：有道、必应</div><button class="b3-button b3-button--outline" onclick="window._openLicense && window._openLicense()" style="padding:6px 16px">去激活</button></div>')
  
  const dict=onlineDicts.find(d=>d.id===dictId)
  if(dict?.url)return setBody(`<iframe src="${dict.url.replace('{{word}}',state.word)}" style="width:100%;height:100%;border:none"/>`)
  
  setBody('<div style="text-align:center;padding:20px;color:var(--b3-theme-on-surface-light)">查询中...</div>')
  const queries:Record<string,()=>Promise<DictCardData|null>>={
    ...(offlineId?{[dictId]:async()=>{const r=await offlineDictManager.lookupById(offlineId,state.word);return r?parseOfflineDict(r):null}}:{}),
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
  }).catch(e=>{
    const message=(e as Error)?.message||String(e)
    setBody(`<div style="text-align:center;padding:20px;color:var(--b3-theme-error)">查询失败<br><span style="font-size:12px;color:var(--b3-theme-on-surface-light)">${escapeHTML(message)}</span></div>`)
  })
}

const setBody=(html:string)=>dialog&&((dialog.element.querySelector('.dict-body')as HTMLElement).innerHTML=html)
