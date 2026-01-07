export const copyMark=async(item:any,ctx:{bookUrl:string;bookInfo?:any;settings?:any;isPdf:boolean;reader?:any;pdfViewer?:any;shapeCache?:Map<string,string>;showMsg:(msg:string,type?:string)=>void})=>{
  const{bookUrl,bookInfo,settings,isPdf,reader,pdfViewer,shapeCache,showMsg}=ctx
  const copy=(t:string,msg='已复制')=>navigator.clipboard.writeText(t).then(()=>showMsg(msg))
  if(!bookUrl||bookUrl.startsWith('file://'))return copy(item.text||item.note||'','本地文件仅复制文本')
  const page=item.page||(isPdf?pdfViewer?.getCurrentPage():null)
  const cfi=item.cfi||(isPdf&&page?`#page-${page}`:item.section!==undefined?`#txt-${item.section}-${item.textOffset||0}`:'')
  if(!cfi)return copy(item.text||item.note||'','仅复制文本')
  const{formatBookLink}=await import('@/composables/useSetting'),{formatAuthor,getChapterName}=await import('@/core/MarkManager')
  const book=isPdf?null:reader?.getBook(),toc=isPdf?pdfViewer?.getPDF?.()?.toc:book?.toc
  const chapter=getChapterName({cfi:item.cfi,page,isPdf,toc,location:reader?.getLocation()})||'📒'
  let img=''
  if(item.shapeType&&isPdf&&pdfViewer){
    const hdKey=`${item.id}_${item.shapeType}_hd`
    if(shapeCache?.has(hdKey)){
      const blob=await fetch(shapeCache.get(hdKey)!).then(r=>r.blob()),file=new File([blob],`shape_${item.id}.png`,{type:'image/png'}),{upload}=await import('@/api'),res=await upload('/assets/',[file])
      img=res.succMap?.[file.name]?`![](${res.succMap[file.name]})`:''
    }else img=await generateShapeScreenshot(item,page,pdfViewer)
  }
  copy(formatBookLink(bookUrl,book?.metadata?.title||bookInfo?.name||'',formatAuthor(book?.metadata?.author||bookInfo?.author),chapter,cfi,item.text||'',settings?.linkFormat||'> [!NOTE] 📑 书名\n> [章节](链接) 文本\n> 截图\n> 笔记',item.note||'',img,item.id||''))
}

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
