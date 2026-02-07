import type { Plugin } from 'siyuan'
import { showMessage } from 'siyuan'
import type { Pack } from './types'
import { getDatabase } from './database'
import { importApkg as ankiImportApkg, getMediaFromApkg as ankiGetMedia, createAnkiDatabase, getAnkiCardCount, clearAnkiDbCache, getAnkiDb } from './anki'

const DEF_STATS={total:0,new:0,learning:0,review:0,suspended:0},ANKI_PATH='/data/storage/petal/siyuan-sireader/anki'
const notifyAll=()=>{window.dispatchEvent(new Event('sireader:pack-updated'));window.dispatchEvent(new Event('sireader:deck-updated'))}
let packIdCounter=0

const getCollectionId=async(name:string)=>{
  const sanitized=name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g,'_').slice(0,50),db=await getDatabase(),existingCols=await db.getCollections()
  let cid=`col-${sanitized}`,counter=1
  while(existingCols.some((c:any)=>c.id===cid))cid=`col-${sanitized}-${counter++}`
  return cid
}

const ensureParent=async(name:string,cid?:string):Promise<string|undefined>=>{
  const parts=name.split('::')
  if(parts.length<=1)return
  const parentName=parts.slice(0,-1).join('::'),db=await getDatabase(),existing=(await db.getDecks()).find((d:any)=>d.name===parentName)
  if(existing)return existing.id
  return(await createPack(parentName,{desc:'自动创建',icon:'📁',color:'#667eea',collectionId:cid,parent:await ensureParent(parentName,cid),stats:DEF_STATS})).id
}

const createDecksFromList=async(deckList:any[],cid:string,mainDeckName:string,db:any)=>{
  deckList.sort((a,b)=>a.name.split('::').length-b.name.split('::').length)
  const existingNames=new Set((await db.getDecks()).map((d:any)=>d.name))
  let created=0
  for(const d of deckList){
    if(existingNames.has(d.name))continue
    const total=await getAnkiCardCount(cid,d.id)
    if(total===0&&!deckList.some((x:any)=>x.name.startsWith(d.name+'::')&&!existingNames.has(x.name)))continue
    await createPack(d.name==='Default'?mainDeckName:d.name,{desc:d.desc||'自动添加',icon:'📥',color:'#10b981',tags:['Anki'],collectionId:cid,ankiDeckId:d.id,stats:{total,new:total,learning:0,review:0,suspended:0}})
    existingNames.add(d.name==='Default'?mainDeckName:d.name)
    created++
  }
  return created
}

export const initPack=async(_p:Plugin)=>{
  const db=await getDatabase()
  await db.init()
  const{added,removed}=await syncDeckData()
  if(added>0||removed>0)showMessage(`已同步：添加 ${added} 个，清理 ${removed} 个`,3000,'info')
  const defaultDeck=(await db.getDecks()).find((d:any)=>d.id==='default'),cid='default-col'
  if(!defaultDeck){
    await createAnkiDatabase(cid,'默认集合')
    await db.saveDeck({id:'default',name:'默认卡组',desc:'未分类卡片',icon:'📦',color:'#667eea',collectionId:cid,ankiDeckId:1,stats:{...DEF_STATS},settings:{}as any,created:Date.now(),updated:Date.now()})
  }else if(defaultDeck.collectionId&&!(await getAnkiDb(defaultDeck.collectionId))){
    await createAnkiDatabase(cid,'默认集合')
    await db.saveDeck({...defaultDeck,collectionId:cid})
  }
}

export{getCards,getTodayDueCards,addCard,removeCard}from'./card'
export const getPack=async()=>(await getDatabase()).getDecks()
export const getCollection=async()=>(await getDatabase()).getCollections()

export const createPack=async(name:string,opts?:Partial<Pack>)=>{
  const db=await getDatabase(),packId=opts?.id||`pack-${Date.now()}-${packIdCounter++}`,cid=opts?.collectionId||await getCollectionId(name)
  if(!opts?.collectionId)await createAnkiDatabase(cid,name)
  const pack:Pack={id:packId,name,desc:opts?.desc,icon:opts?.icon||'📦',color:opts?.color||'#667eea',titleImg:opts?.titleImg,tags:opts?.tags||[],parent:opts?.parent!==undefined?opts.parent:await ensureParent(name,cid),collectionId:cid,ankiDeckId:opts?.ankiDeckId||1,settings:{}as any,stats:{...DEF_STATS,...opts?.stats},enabled:opts?.enabled||false,created:Date.now(),updated:Date.now()}
  await db.saveDeck(pack)
  notifyAll()
  return pack
}

export const updatePack=async(id:string,updates:Partial<Pack>)=>{
  const db=await getDatabase(),pack=await db.getDeck(id)
  if(!pack)return false
  Object.assign(pack,updates,{updated:Date.now()})
  await db.saveDeck(pack)
  notifyAll()
  return true
}

export const deletePack=async(id:string)=>{
  if(id==='default')return false
  const db=await getDatabase(),pack=await db.getDeck(id)
  if(!pack)return false
  const allDecks=await db.getDecks()
  for(const child of allDecks.filter((d:any)=>d.parent===id))await deletePack(child.id)
  await db.deleteDeck(id)
  const remainingDecks=await db.getDecks()
  if(pack.collectionId&&!remainingDecks.some((d:any)=>d.collectionId===pack.collectionId)){
    await db.deleteCollection(pack.collectionId)
    await fetch('/api/file/removeFile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:`${ANKI_PATH}/${pack.collectionId}`})}).catch(()=>{})
  }
  notifyAll()
  return true
}

export const updatePackStats=async(id:string)=>{await(await getDatabase()).updateDeckStats(id);notifyAll();return true}
export const addCollection=async(col:any)=>{await(await getDatabase()).saveCollection(col);return col}
export const exportApkg=async(_id:string)=>showMessage('导出功能开发中...',2000,'info')
export const getMediaFromApkg=ankiGetMedia

export const importApkg=async(file:File)=>{
  try{
    const db=await getDatabase(),name=file.name.replace('.apkg','')
    if((await db.getCollections()).find((c:any)=>c.name===name))return showMessage('该卡组已存在',3000,'info')
    const result=await ankiImportApkg(file)
    if(!result)return showMessage('导入失败',3000,'error')
    const created=await createDecksFromList(result.decks,result.collectionId,result.name,db)
    showMessage(`已导入 ${created} 个卡组`,2000,'info')
    notifyAll()
    clearAnkiDbCache()
    return result
  }catch(e){
    showMessage('导入失败: '+(e as Error).message,3000,'error')
  }
}

export const syncDeckData=async(silent=false)=>{
  try{
    const db=await getDatabase()
    let added=0,removed=0
    for(const col of await db.getCollections()){
      if(col.id==='default-col'||await getAnkiDb(col.id))continue
      for(const deck of(await db.getDecks()).filter((d:any)=>d.collectionId===col.id&&d.id!=='default'))await db.deleteDeck(deck.id)
      await db.deleteCollection(col.id)
      await fetch('/api/file/removeFile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:`${ANKI_PATH}/${col.id}`})}).catch(()=>{})
      removed++
    }
    try{
      const res=await fetch('/api/file/readDir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:ANKI_PATH})})
      if(!res.ok)return silent?{added:0,removed:0}:{added,removed}
      const data=await res.json()
      if(data.code!==0||!data.data)return silent?{added:0,removed:0}:{added,removed}
      const existingColIds=new Set((await db.getCollections()).map((c:any)=>c.id))
      for(const folder of data.data.filter((item:any)=>item.isDir&&item.name.startsWith('col-')&&!existingColIds.has(item.name))){
        const cid=folder.name,ankiDb=await getAnkiDb(cid)
        if(!ankiDb)continue
        const deckList=await(await import('./anki')).getDecks(ankiDb)
        if(!deckList.length)continue
        const mainDeckName=deckList.find((d:any)=>d.name!=='Default')?.name.split('::')[0]||deckList[0].name
        await db.saveCollection({id:cid,name:mainDeckName,path:`${ANKI_PATH}/${cid}/collection.anki21`,imported:Date.now(),apkgPath:`${ANKI_PATH}/${cid}/source.apkg`})
        await createDecksFromList(deckList,cid,mainDeckName,db)
        added++
      }
    }catch(e){console.error('[Sync]',e)}
    clearAnkiDbCache()
    return silent?{added:0,removed:0}:{added,removed}
  }catch{return{added:0,removed:0}}
}
