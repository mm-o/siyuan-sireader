// 跳转和闪烁工具函数

// 获取跳转所需的上下文参数
const getJumpContext=(activeView:any,activeReader:any,marks:any)=>{
  const isPdf=(activeView as any)?.isPdf
  return{
    isPdf,
    pdfViewer:(activeView as any)?.viewer,
    reader:activeReader,
    markManager:marks,
    shapeManager:(marks as any)?.shapeManager,
    view:activeView
  }
}

// CSS闪烁（用于DOM元素）
const flashElement=(el:HTMLElement,className:string,duration=1200)=>{
  el.classList.add(className)
  setTimeout(()=>el.classList.remove(className),duration)
}

// 滚动到中心并闪烁
const scrollAndFlash=(el:HTMLElement,className:string,container?:Element|null)=>{
  const c=container||document.querySelector('.viewer-container')
  if(c){
    const r=el.getBoundingClientRect(),cr=c.getBoundingClientRect()
    c.scrollTop+=r.top-cr.top-(cr.height-r.height)/2
  }
  flashElement(el,className)
}

// JS闪烁（用于SVG元素）- 1次闪烁
const flashSVG=(el:SVGElement)=>{
  const orig=el.style.opacity||'1'
  el.style.opacity='1'
  setTimeout(()=>{
    el.style.opacity='0.3'
    setTimeout(()=>el.style.opacity=orig,300)
  },300)
}

// 确保样式存在
const ensureStyle=(doc:Document,id:string,css:string)=>{
  if(!doc.querySelector(`#${id}`)){
    const s=doc.createElement('style')
    s.id=id
    s.textContent=css
    doc.head.appendChild(s)
  }
}

// PDF跳转并高亮
export const gotoPDF=(page:number,id:string|undefined,pdfViewer:any,markManager:any,shapeToolManager:any)=>{
  if(!pdfViewer)return
  pdfViewer.goToPage(page)
  
  setTimeout(()=>{
    markManager?.renderPdf(page)
    shapeToolManager?.render(page)
    
    if(id){
      const hl=document.querySelector(`[data-page="${page}"] [data-id="${id}"]`)as HTMLElement
      if(hl)return scrollAndFlash(hl,'pdf-highlight--flash')
      
      const shape=shapeToolManager?.controller?.getManager(page)?.getAll()?.find((s:any)=>s.id===id)
      if(shape){
        const cv=document.querySelector(`[data-page="${page}"] .pdf-shape-layer`)as HTMLCanvasElement
        const vp=pdfViewer.getPages().get(page)?.getViewport({scale:pdfViewer.getScale(),rotation:pdfViewer.getRotation()})
        if(cv&&vp){
          const[x1,y1,x2,y2]=shape.rect,[,b1y]=vp.convertToViewportRectangle([x1,y1,x1,y1]),[,b2y]=vp.convertToViewportRectangle([x2,y2,x2,y2])
          const c=document.querySelector('.viewer-container')
          if(c){
            const pr=cv.getBoundingClientRect(),cr=c.getBoundingClientRect()
            c.scrollTop+=pr.top+(b1y+b2y)/2-cr.top-cr.height/2
          }
          flashElement(cv,'pdf-shape--flash')
        }
        return
      }
    }
    
    const hl=document.querySelector(`[data-page="${page}"] .pdf-highlight`)as HTMLElement
    if(hl)scrollAndFlash(hl,'pdf-highlight--flash')
  },100)
}

// EPUB跳转并高亮
export const gotoEPUB=(cfi:string,id:string|undefined,reader:any,markManager:any)=>{
  reader?.goTo(cfi)
  
  const tryFlash=()=>{
    let targetCfi=cfi
    if(id){
      const mark=markManager?.getAll()?.find((m:any)=>m.id===id)
      if(mark?.cfi)targetCfi=mark.cfi
    }
    
    reader?.getView()?.renderer?.getContents?.()?.forEach(({doc,overlayer}:any)=>{
      if(!overlayer)return
      
      const iframe=doc.defaultView?.frameElement as HTMLIFrameElement
      const svg=iframe?.parentElement?.querySelector('svg')
      if(!svg)return
      
      const groups=Array.from(svg.querySelectorAll('g[fill]:not([fill="none"])'))as SVGGElement[]
      if(!groups.length)return
      
      let target=null
      if(targetCfi){
        try{
          const resolved=reader.getView().resolveCFI(targetCfi)
          if(resolved?.anchor){
            const range=resolved.anchor(doc)
            if(range){
              const rects=range.getClientRects()
              if(rects.length>0){
                const rect=rects[0]
                const ir=iframe.getBoundingClientRect()
                const vx=rect.left+ir.left,vy=rect.top+ir.top
                const[key]=overlayer.hitTest({x:rect.left+rect.width/2,y:rect.top+rect.height/2})
                if(key===targetCfi){
                  target=groups.find(g=>{const r=g.getBoundingClientRect();return Math.abs(r.left-vx)<20&&Math.abs(r.top-vy)<20})
                }
              }
            }
          }
        }catch{}
      }
      
      (target?[target]:groups).forEach(g=>flashSVG(g))
      
      const m=doc.querySelectorAll('[data-note-marker]')[0]
      if(m){
        ensureStyle(doc,'epub-flash-style','@keyframes epub-flash{0%,100%{opacity:1}50%{opacity:.3}}.epub-flash{animation:epub-flash 1.2s ease-in-out 1!important}')
        flashElement(m,'epub-flash')
      }
    })
  }
  
  setTimeout(tryFlash,300)
  setTimeout(tryFlash,800)
}

// TXT跳转并高亮
export const gotoTXT=(s:number,o:number|undefined,t:string|undefined,id:string|undefined,v:any)=>{
  v?.goTo(s)
  setTimeout(()=>v?.renderer?.getContents?.()?.forEach(({doc}:any)=>{
    const target=id?doc?.querySelector(`[data-mark-id="${id}"]`):o!==undefined&&t?(()=>{
      let off=0,r:HTMLElement|null=null
      const w=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT)
      for(let n:Node|null;n=w.nextNode();)if(off+=(n.textContent||'').length,off>o&&(n.textContent||'').includes(t)){r=n.parentElement?.closest('[data-txt-mark]');break}
      return r
    })():null
    target&&(target.scrollIntoView({block:'center'}),flashElement(target,'epub-highlight--flash'))
  }),300)
}

// 统一跳转入口 - 自动判断类型并跳转闪烁
export const jump=(item:any,activeView:any,activeReader:any,marks:any)=>{
  const ctx=getJumpContext(activeView,activeReader,marks)
  if(ctx.isPdf&&item.page)gotoPDF(item.page,item.id,ctx.pdfViewer,ctx.markManager,ctx.shapeManager)
  else if(item.cfi)gotoEPUB(item.cfi,item.id,ctx.reader,ctx.markManager)
  else if(item.section!==undefined)gotoTXT(item.section,item.textOffset,item.text,item.id,ctx.view)
  else if(typeof item==='number'&&ctx.isPdf)gotoPDF(item,undefined,ctx.pdfViewer,ctx.markManager,ctx.shapeManager)
}
export const restorePosition=async(bookUrl:string,reader:any,pdfViewer:any,getMobilePosition:any)=>{
  if(!bookUrl)return
  const pos=await getMobilePosition(bookUrl)
  if(!pos)return
  if(pos.cfi&&reader)reader.goTo(pos.cfi)
  else if(pos.page&&pdfViewer)pdfViewer.goToPage(pos.page)
}

export const initJump=(cfi:string)=>{
  if(!cfi)return
  const m=cfi.match(/#txt-(\d+)-(\d+)/)
  setTimeout(()=>window.dispatchEvent(new CustomEvent('sireader:goto',{detail:m?{section:parseInt(m[1]),textOffset:parseInt(m[2])}:{cfi}})),500)
}