export const copyMark=async(item:any,ctx:{bookUrl:string;bookInfo?:any;settings?:any;isPdf:boolean;reader?:any;pdfViewer?:any;shapeCache?:Map<string,string>;showMsg:(msg:string,type?:string)=>void})=>{
  const{bookUrl,bookInfo,settings,isPdf,reader,pdfViewer,shapeCache,showMsg}=ctx
  const copy=(t:string,msg='已复制')=>navigator.clipboard.writeText(t).then(()=>showMsg(msg))
  if(!bookUrl||bookUrl.startsWith('file://'))return copy(item.text||item.note||'','本地文件仅复制文本')
  const page=item.page||(isPdf?pdfViewer?.getCurrentPage():null)
  const cfi=item.cfi||(isPdf&&page?`#page-${page}`:item.section!==undefined?`#txt-${item.section}-${item.textOffset||0}`:'')
  if(!cfi)return copy(item.text||item.note||'','仅复制文本')
  const{formatBookLink}=await import('@/composables/useSetting'),{formatAuthor}=await import('@/core/MarkManager')
  const book=reader?.getBook?.()
  const title=book?.metadata?.title||bookInfo?.name||''
  const author=formatAuthor(book?.metadata?.author||bookInfo?.author||'')
  let img=''
  if(item.shapeType&&isPdf&&pdfViewer){
    const hdKey=`${item.id}_${item.shapeType}_hd`
    if(shapeCache?.has(hdKey)){
      const blob=await fetch(shapeCache.get(hdKey)!).then(r=>r.blob()),file=new File([blob],`shape_${item.id}.png`,{type:'image/png'}),{upload}=await import('@/api'),res=await upload('/assets/',[file])
      img=res.succMap?.[file.name]?`![](${res.succMap[file.name]})`:''
    }else img=await generateShapeScreenshot(item,page,pdfViewer)
  }
  copy(formatBookLink(bookUrl,title,author,item.chapter||'',cfi,item.text||'',settings?.linkFormat||'> [!NOTE] 📑 书名\n> [章节](链接) 文本\n> 截图\n> 笔记',item.note||'',img,item.id||''))
}

export const importMark=async(item:any,ctx:any)=>{
  try{
    const{bookshelfManager}=await import('@/core/bookshelf'),{appendBlock}=await import('@/api'),book=await bookshelfManager.getBook(ctx.bookUrl)
    if(!book?.bindDocId)return ctx.showMsg?.(ctx.i18n?.noBindDoc||'未绑定文档','error')
    let md='',orig=navigator.clipboard.writeText
    navigator.clipboard.writeText=async(t:string)=>{md=t;return Promise.resolve()}
    await copyMark(item,{...ctx,showMsg:()=>{}})
    navigator.clipboard.writeText=orig
    if(!md)return ctx.showMsg?.('生成失败','error')
    const res=await appendBlock('markdown',md,book.bindDocId)
    const blockId=res?.[0]?.doOperations?.[0]?.id
    if(blockId&&ctx.marks){
      await ctx.marks.updateMark(item,{blockId})
      ctx.showMsg?.(ctx.i18n?.imported||'已导入')
    }else ctx.showMsg?.(blockId?'已导入':'导入失败','error')
  }catch(e){console.error(e);ctx.showMsg?.(ctx.i18n?.importFailed||'导入失败','error')}
}

// 检查标注是否已导入
const _cache=new Map<string,Set<string>>()
export const isMarkImported=async(item:any,docId:string):Promise<boolean>=>{
  if(item.blockId)return true
  try{
    if(!_cache.has(docId)){
      const{getChildBlocks}=await import('@/api'),blocks=await getChildBlocks(docId),ids=new Set<string>()
      blocks.forEach((b:any)=>b.content?.match(/data-mark-id="([^"]+)"/g)?.forEach((m:string)=>{const id=m.match(/"([^"]+)"/)?.[1];if(id)ids.add(id)}))
      _cache.set(docId,ids)
      setTimeout(()=>_cache.delete(docId),30000)
    }
    return _cache.get(docId)?.has(item.id)||false
  }catch{return false}
}

// 自动同步标注
export const autoSyncMark=async(item:any,ctx:any)=>{
  try{
    const{bookshelfManager}=await import('@/core/bookshelf'),book=await bookshelfManager.getBook(ctx.bookUrl)
    if(!book?.bindDocId||!book?.autoSync||await isMarkImported(item,book.bindDocId))return
    await importMark(item,{...ctx,showMsg:()=>{}})
  }catch(e){console.error('[AutoSync]',e)}
}

// ===== 块操作统一接口 =====
let _plugin:any,_floatTimer=0
export const setPlugin=(p:any)=>_plugin=p
export const openBlock=(id:string)=>{hideFloat();window.open(`siyuan://blocks/${id}`)}
export const showFloat=(id:string,el:HTMLElement)=>{hideFloat();_floatTimer=window.setTimeout(()=>_plugin?.addFloatLayer?.({refDefs:[{refID:id}],targetElement:el,isBacklink:false}),620)}
export const hideFloat=()=>{_floatTimer&&clearTimeout(_floatTimer);_floatTimer=0}

// 生成形状标注截图（通用方法）
export const generateShapeScreenshot=async(shape:any,page:number,pdfViewer:any):Promise<string>=>{
  const pageEl=document.querySelector(`[data-page="${page}"]`)
  const pdfCanvas=pageEl&&(Array.from(pageEl.querySelectorAll('canvas')).find(c=>!c.className)||pageEl.querySelector('canvas'))as HTMLCanvasElement
  if(!pdfCanvas)return''
  
  const vp=pdfViewer.getPages().get(page)?.getViewport({scale:pdfViewer.getScale(),rotation:pdfViewer.getRotation()})
  if(!vp)return''
  
  const[px1,py1,px2,py2]=shape.rect,[vx1,vy1]=vp.convertToViewportRectangle([px1,py1,px1,py1]),[vx2,vy2]=vp.convertToViewportRectangle([px2,py2,px2,py2])
  const w=Math.abs(vx2-vx1),h=Math.abs(vy2-vy1)
  if(w<10||h<10)return''
  
  const c=document.createElement('canvas')
  c.width=1200;c.height=h*1200/w
  const ctx=c.getContext('2d')!,dpr=pdfCanvas.width/(parseFloat(pdfCanvas.style.width)||pdfCanvas.width)
  ctx.drawImage(pdfCanvas,Math.min(vx1,vx2)*dpr,Math.min(vy1,vy2)*dpr,w*dpr,h*dpr,0,0,c.width,c.height)
  ctx.globalAlpha=shape.opacity||0.8
  if(shape.filled){
    ctx.fillStyle=shape.color||'#ff0000'
    ctx.beginPath()
    if(shape.shapeType==='circle')ctx.arc(c.width/2,c.height/2,Math.min(c.width,c.height)/2,0,Math.PI*2)
    else if(shape.shapeType==='triangle'){ctx.moveTo(c.width/2,0);ctx.lineTo(c.width,c.height);ctx.lineTo(0,c.height);ctx.closePath()}
    else ctx.rect(0,0,c.width,c.height)
    ctx.fill()
  }else{
    ctx.strokeStyle=shape.color||'#ff0000';ctx.lineWidth=4
    ctx.beginPath()
    if(shape.shapeType==='circle')ctx.arc(c.width/2,c.height/2,Math.min(c.width,c.height)/2,0,Math.PI*2)
    else if(shape.shapeType==='triangle'){ctx.moveTo(c.width/2,0);ctx.lineTo(c.width,c.height);ctx.lineTo(0,c.height);ctx.closePath()}
    else ctx.rect(0,0,c.width,c.height)
    ctx.stroke()
  }
  
  const blob=await fetch(c.toDataURL('image/png')).then(r=>r.blob())
  const file=new File([blob],`shape_${shape.id}.png`,{type:'image/png'})
  const{upload}=await import('@/api')
  const res=await upload('/assets/',[file])
  return res.succMap?.[file.name]?`![](${res.succMap[file.name]})`:''
}
