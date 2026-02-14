/**
 * PDF 形状标注模块
 * 支持矩形、圆形、三角形等形状标注，可添加文字笔记
 */
import{getDatabase}from'../database'
import type{Annotation}from'../database'

// 类型定义
export type ShapeType='rect'|'circle'|'triangle'
export interface ShapeAnnotation{id:string;type:'shape';shapeType:ShapeType;page:number;rect:[number,number,number,number];color:string;width:number;opacity:number;filled?:boolean;text?:string;note?:string;timestamp:number;chapter?:string;blockId?:string}
export interface ShapeConfig{shapeType:ShapeType;color:string;width:number;opacity:number;filled:boolean}

const getCoord=(e:MouseEvent|TouchEvent,r:DOMRect)=>({x:(e instanceof MouseEvent?e.clientX:e.touches[0].clientX)-r.left,y:(e instanceof MouseEvent?e.clientY:e.touches[0].clientY)-r.top})

// ===== 渲染工具函数 =====

/** 绘制形状标注到 Canvas（用于预览/缩略图） */
export const drawShape=(
  canvas:HTMLCanvasElement,
  shape:ShapeAnnotation,
  activeView:any,
  shapeCache:Map<string,string>,
  preloadPage:(page:number)=>void,
  retry=0,
  highRes=false
)=>{
  if(!shape)return
  const ctx=canvas.getContext('2d')!,key=`${shape.id}_${shape.shapeType}${highRes?'_hd':''}`
  if(shapeCache.has(key)){
    const img=new Image()
    img.onload=()=>ctx.drawImage(img,0,0,canvas.width,canvas.height)
    img.src=shapeCache.get(key)!
    return
  }
  const pageEl=document.querySelector(`[data-page="${shape.page}"]`)
  const pdfCanvas=pageEl&&(Array.from(pageEl.querySelectorAll('canvas')).find(c=>!c.className)||pageEl.querySelector('canvas'))as HTMLCanvasElement
  if(!pdfCanvas){
    if(retry<3){
      preloadPage(shape.page)
      setTimeout(()=>drawShape(canvas,shape,activeView,shapeCache,preloadPage,retry+1,highRes),200)
    }
    return
  }
  const vp=activeView?.viewer?.getPages().get(shape.page)?.getViewport({scale:activeView.viewer.getScale(),rotation:activeView.viewer.getRotation()})
  if(!vp)return
  const[px1,py1,px2,py2]=shape.rect,[vx1,vy1]=vp.convertToViewportRectangle([px1,py1,px1,py1]),[vx2,vy2]=vp.convertToViewportRectangle([px2,py2,px2,py2])
  const w=Math.abs(vx2-vx1),h=Math.abs(vy2-vy1)
  if(w<10||h<10)return
  const maxW=highRes?1200:240
  canvas.width=maxW
  canvas.height=h*maxW/w
  const dpr=pdfCanvas.width/(parseFloat(pdfCanvas.style.width)||pdfCanvas.width)
  ctx.drawImage(pdfCanvas,Math.min(vx1,vx2)*dpr,Math.min(vy1,vy2)*dpr,w*dpr,h*dpr,0,0,canvas.width,canvas.height)
  ctx.globalAlpha=shape.opacity||0.8
  ctx.beginPath()
  if(shape.shapeType==='circle')ctx.arc(canvas.width/2,canvas.height/2,Math.min(canvas.width,canvas.height)/2,0,Math.PI*2)
  else if(shape.shapeType==='triangle'){ctx.moveTo(canvas.width/2,0);ctx.lineTo(canvas.width,canvas.height);ctx.lineTo(0,canvas.height);ctx.closePath()}
  else ctx.rect(0,0,canvas.width,canvas.height)
  if(shape.filled){
    ctx.fillStyle=shape.color||'#ff0000'
    ctx.fill()
  }else{
    ctx.strokeStyle=shape.color||'#ff0000'
    ctx.lineWidth=Math.max(highRes?4:2,shape.width||2)
    ctx.stroke()
  }
  shapeCache.set(key,canvas.toDataURL('image/png'))
}

/** 渲染形状 Canvas（批量渲染） */
export const renderShapeCanvas=(
  list:any[],
  activeView:any,
  shapeCache:Map<string,string>,
  preloadPage:(page:number)=>void
)=>{
  document.querySelectorAll('[data-shape-id]').forEach(el=>{
    const c=el as HTMLCanvasElement,id=c.dataset.shapeId
    const g=list.find((i:any)=>i.type==='shape-group'&&i.shapes?.some((s:any)=>s.id===id))
    const shape=g?.shapes?.find((s:any)=>s.id===id)
    if(shape)drawShape(c,shape,activeView,shapeCache,preloadPage)
  })
}

/** 形状绘制器 */
export class ShapeDrawer{
  private ctx:CanvasRenderingContext2D
  private config:ShapeConfig
  public canvas:HTMLCanvasElement

  constructor(canvas:HTMLCanvasElement,config:ShapeConfig){
    this.canvas=canvas
    this.ctx=canvas.getContext('2d')!
    this.config=config
  }

  setConfig(c:Partial<ShapeConfig>){this.config={...this.config,...c}}

  /** 绘制形状 */
  drawShape(shape:ShapeAnnotation,preview=false){
    const[x1,y1,x2,y2]=shape.rect
    const w=x2-x1,h=y2-y1
    this.ctx.globalAlpha=shape.opacity
    this.ctx.setLineDash(preview?[5,5]:[])
    this.ctx.beginPath()
    
    switch(shape.shapeType){
      case'rect':
        this.ctx.rect(x1,y1,w,h)
        break
      case'circle':
        const cx=x1+w/2,cy=y1+h/2,r=Math.min(Math.abs(w),Math.abs(h))/2
        this.ctx.arc(cx,cy,r,0,Math.PI*2)
        break
      case'triangle':
        this.ctx.moveTo(x1+w/2,y1)
        this.ctx.lineTo(x2,y2)
        this.ctx.lineTo(x1,y2)
        this.ctx.closePath()
        break
    }
    
    // 填充或描边
    if(shape.filled){
      this.ctx.fillStyle=shape.color
      this.ctx.fill()
    }else{
      this.ctx.strokeStyle=shape.color
      this.ctx.lineWidth=shape.width
      this.ctx.stroke()
    }
    this.ctx.setLineDash([])
    
    // 添加点击区域（不可见）
    if(!preview&&!shape.filled){
      this.ctx.fillStyle='rgba(0,0,0,0.01)'
      this.ctx.fill()
    }
  }

  clear(){this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height)}
}

/** 形状管理器 */
export class ShapeManager{
  private shapes=new Map<string,ShapeAnnotation>()
  private history:string[]=[]

  constructor(private page:number){}

  add(shape:ShapeAnnotation){this.shapes.set(shape.id,shape);this.history.push(shape.id)}
  get(id:string){return this.shapes.get(id)}
  delete(id:string){return this.shapes.delete(id)}
  undo(){const id=this.history.pop();if(id){this.shapes.delete(id);return true}return false}
  getAll():ShapeAnnotation[]{return Array.from(this.shapes.values())}
  clear(){this.shapes.clear();this.history=[]}
  toJSON():ShapeAnnotation[]{return this.getAll()}
  fromJSON(data:ShapeAnnotation[]){data.forEach(s=>{if(s.page===this.page)this.shapes.set(s.id,s)})}
}

/** 形状控制器 */
export class ShapeController{
  private managers=new Map<number,ShapeManager>()
  private drawers=new Map<number,ShapeDrawer>()
  private config:ShapeConfig={shapeType:'rect',color:'#ff0000',width:2,opacity:0.8,filled:false}
  private startPos:{x:number;y:number}|null=null
  private currentPage=0
  private previewShape:ShapeAnnotation|null=null
  private pdfViewer:any=null

  constructor(private onSave:()=>Promise<void>,private onShapeClick?:(shape:ShapeAnnotation)=>void){}

  setPdfViewer(viewer:any){this.pdfViewer=viewer}

  setConfig(c:Partial<ShapeConfig>){this.config={...this.config,...c};this.drawers.forEach(d=>d.setConfig(this.config))}

  private getDrawer(page:number,canvas:HTMLCanvasElement):ShapeDrawer{
    let d=this.drawers.get(page)
    // 检查canvas是否改变（缩放后会重新创建canvas）
    if(!d||d.canvas!==canvas){
      d=new ShapeDrawer(canvas,this.config)
      this.drawers.set(page,d)
    }
    return d
  }

  getManager(page:number):ShapeManager{
    let m=this.managers.get(page)
    if(!m){m=new ShapeManager(page);this.managers.set(page,m)}
    return m
  }

  /** 开始绘制 */
  startDrawing(e:MouseEvent|TouchEvent,canvas:HTMLCanvasElement,page:number){
    this.currentPage=page
    const{x,y}=getCoord(e,canvas.getBoundingClientRect())
    this.startPos={x,y}
  }

  /** 转换PDF坐标到屏幕坐标 */
  private toScreenRect(rect:[number,number,number,number],viewport:any):[number,number,number,number]{
    const[x1,y1,x2,y2]=rect
    const b1=viewport.convertToViewportRectangle([x1,y1,x1,y1])
    const b2=viewport.convertToViewportRectangle([x2,y2,x2,y2])
    return[b1[0],b1[1],b2[0],b2[1]]
  }

  /** 绘制中（预览） */
  draw(e:MouseEvent|TouchEvent){
    if(!this.currentPage||!this.startPos)return
    const cv=document.querySelector(`.pdf-shape-layer[data-page="${this.currentPage}"]`)as HTMLCanvasElement
    if(!cv)return
    const{x,y}=getCoord(e,cv.getBoundingClientRect())
    const d=this.getDrawer(this.currentPage,cv)
    d.clear()
    
    // 重新渲染已有形状
    const viewport=this.pdfViewer?.getPages().get(this.currentPage)?.getViewport({scale:this.pdfViewer.getScale(),rotation:this.pdfViewer.getRotation()})
    this.getManager(this.currentPage).getAll().forEach(s=>d.drawShape({...s,rect:viewport?this.toScreenRect(s.rect,viewport):s.rect}))
    
    // 绘制预览
    this.previewShape={id:'preview',type:'shape',shapeType:this.config.shapeType,page:this.currentPage,rect:[this.startPos.x,this.startPos.y,x,y],color:this.config.color,width:this.config.width,opacity:this.config.opacity,timestamp:Date.now()}
    d.drawShape(this.previewShape,true)
  }

  /** 结束绘制 */
  async endDrawing(pdfViewer?:any){
    if(!this.currentPage||!this.startPos||!this.previewShape)return
    const[x1,y1,x2,y2]=this.previewShape.rect
    if(Math.abs(x2-x1)<10||Math.abs(y2-y1)<10){
      this.startPos=this.previewShape=null
      this.currentPage=0
      return
    }
    
    // 转换 PDF 坐标
    let rect:[number,number,number,number]=[x1,y1,x2,y2]
    const viewport=pdfViewer?.getPages().get(this.currentPage)?.getViewport({scale:pdfViewer.getScale(),rotation:pdfViewer.getRotation()})
    if(viewport){
      const[px1,py1]=viewport.convertToPdfPoint(x1,y1),[px2,py2]=viewport.convertToPdfPoint(x2,y2)
      rect=[px1,py1,px2,py2]
    }
    
    // 获取章节
    const{getChapterName}=await import('@/core/MarkManager'),view=pdfViewer?.getPDF?.()
    const chapter=getChapterName({page:this.currentPage,isPdf:true,toc:view?.flatToc||view?.toc})||`第${this.currentPage}页`
    
    const shape:ShapeAnnotation={...this.previewShape,id:`shape_${Date.now()}_${Math.random().toString(36).slice(2,9)}`,rect,filled:this.config.filled,chapter}
    this.getManager(this.currentPage).add(shape)
    await this.onSave()
    const cv=document.querySelector(`.pdf-shape-layer[data-page="${this.currentPage}"]`)as HTMLCanvasElement
    if(cv)this.render(this.currentPage,cv,pdfViewer)
    
    // 弹出编辑窗口
    if(this.onShapeClick&&cv){
      const r=cv.getBoundingClientRect()
      setTimeout(()=>window.dispatchEvent(new CustomEvent('shape-created',{detail:{shape,x:r.left+(x1+x2)/2,y:r.top+Math.max(y1,y2)+10,edit:true}})),50)
    }
    
    this.startPos=this.previewShape=null
    this.currentPage=0
  }

  /** 渲染页面 */
  render(page:number,canvas:HTMLCanvasElement,pdfViewer?:any){
    const shapes=this.managers.get(page)?.getAll()
    if(!shapes?.length)return
    
    const d=this.getDrawer(page,canvas)
    d.clear()
    canvas.parentElement?.querySelectorAll('[data-shape-note-marker],[data-shape-note-tooltip]').forEach(el=>el.remove())
    
    const viewport=pdfViewer?.getPages().get(page)?.getViewport({scale:pdfViewer.getScale(),rotation:pdfViewer.getRotation()})
    shapes.forEach(s=>{
      const rect=viewport?this.toScreenRect(s.rect,viewport):s.rect
      d.drawShape({...s,rect})
      if(s.note)this.renderNoteMarker({...s,rect},canvas)
    })
  }
  
  /** 处理点击 */
  handleClick(e:MouseEvent|TouchEvent,canvas:HTMLCanvasElement,page:number,pdfViewer?:any):boolean{
    const{x,y}=getCoord(e,canvas.getBoundingClientRect())
    const viewport=pdfViewer?.getPages().get(page)?.getViewport({scale:pdfViewer.getScale(),rotation:pdfViewer.getRotation()})
    
    for(const s of this.getManager(page).getAll()){
      const rect=viewport?this.toScreenRect(s.rect,viewport):s.rect
      if(this.isPointInShape(x,y,{...s,rect})){
        this.onShapeClick?.(s)
        return true
      }
    }
    return false
  }
  
  /** 渲染笔记标记 */
  private renderNoteMarker(shape:ShapeAnnotation,canvas:HTMLCanvasElement){
    const[x1,y1,x2,y2]=shape.rect,icon='📝',marker=document.createElement('span')
    marker.setAttribute('data-shape-note-marker','true')
    marker.textContent=icon
    const left=Math.max(x1,x2)+5,top=Math.min(y1,y2)-5
    marker.style.cssText=`position:absolute;left:${left}px;top:${top}px;font-size:14px;cursor:pointer;user-select:none;opacity:0.85;transition:opacity .2s;pointer-events:auto;z-index:12`
    
    const tooltip=document.createElement('div')
    tooltip.setAttribute('data-shape-note-tooltip','true')
    const cleanNote=shape.note.split('\n').map(l=>l.trim()).filter(Boolean).join('\n')
    tooltip.innerHTML=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,.1)"><span style="font-size:18px">${icon}</span><span style="font-size:12px;font-weight:600;color:#ff9800;text-transform:uppercase;letter-spacing:.5px">形状笔记</span></div><div style="font-size:14px;line-height:1.8;color:#333;white-space:pre-wrap;max-height:300px;overflow-y:auto">${cleanNote}</div>`
    tooltip.style.cssText='position:fixed;display:none;min-width:280px;max-width:420px;padding:16px;background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.12);z-index:99999;pointer-events:none;word-wrap:break-word'
    document.body.appendChild(tooltip)
    
    marker.onmouseenter=()=>{
      marker.style.opacity='1'
      const r=marker.getBoundingClientRect()
      tooltip.style.display='block'
      tooltip.style.left=r.left+'px'
      tooltip.style.top=(r.bottom+5)+'px'
      requestAnimationFrame(()=>{
        const tr=tooltip.getBoundingClientRect()
        if(tr.right>window.innerWidth)tooltip.style.left=(window.innerWidth-tr.width-10)+'px'
        if(tr.bottom>window.innerHeight)tooltip.style.top=(r.top-tr.height-5)+'px'
      })
    }
    marker.onmouseleave=()=>{marker.style.opacity='0.85';tooltip.style.display='none'}
    marker.onclick=(e)=>{e.stopPropagation();this.onShapeClick?.(shape)}
    
    canvas.parentElement?.appendChild(marker)
  }

  /** 撤销 */
  undo(page:number):boolean{
    const m=this.managers.get(page)
    if(!m||!m.undo())return false
    const cv=document.querySelector(`.pdf-shape-layer[data-page="${page}"]`)as HTMLCanvasElement
    if(cv)this.render(page,cv,this.pdfViewer)
    return true
  }

  clear(page:number){this.managers.get(page)?.clear();this.drawers.get(page)?.clear()}

  /** 切换绘制模式 */
  async toggle(active:boolean,container:HTMLElement){
    container.style.userSelect=active?'none':'text'
    container.style.cursor=active?'crosshair':'default'
    document.querySelectorAll('.pdf-shape-layer').forEach(el=>{const c=el as HTMLCanvasElement;c.style.pointerEvents=active?'auto':'none';c.style.cursor=active?'crosshair':'default'})
    active?(this.bindEvents(container),this.unbindContainerClick()):(this.unbindEvents(),this.bindContainerClick(container))
  }

  private listeners:Array<{el:HTMLElement;type:string;handler:any}>=[]
  private containerClickHandler:((e:MouseEvent)=>void)|null=null
  
  private bindEvents(c:HTMLElement){
    const start=(e:MouseEvent|TouchEvent)=>{const t=e.target as HTMLElement;if(!t.classList.contains('pdf-shape-layer'))return;const cv=t as HTMLCanvasElement,p=+(cv.dataset.page||0);if(!p)return;this.startDrawing(e,cv,p);e.preventDefault()}
    const move=(e:MouseEvent|TouchEvent)=>{this.draw(e);e.preventDefault()}
    const end=async()=>await this.endDrawing(this.pdfViewer)
    c.addEventListener('mousedown',start);c.addEventListener('mousemove',move);c.addEventListener('mouseup',end)
    c.addEventListener('touchstart',start);c.addEventListener('touchmove',move);c.addEventListener('touchend',end)
    this.listeners=[{el:c,type:'mousedown',handler:start},{el:c,type:'mousemove',handler:move},{el:c,type:'mouseup',handler:end},{el:c,type:'touchstart',handler:start},{el:c,type:'touchmove',handler:move},{el:c,type:'touchend',handler:end}]
  }
  

  
  /** 判断点是否在形状内 */
  private isPointInShape(x:number,y:number,shape:ShapeAnnotation):boolean{
    const[x1,y1,x2,y2]=shape.rect,minX=Math.min(x1,x2),maxX=Math.max(x1,x2),minY=Math.min(y1,y2),maxY=Math.max(y1,y2)
    if(x<minX||x>maxX||y<minY||y>maxY)return false
    switch(shape.shapeType){
      case'rect':return true
      case'circle':const cx=(x1+x2)/2,cy=(y1+y2)/2,r=Math.min(Math.abs(x2-x1),Math.abs(y2-y1))/2;return Math.hypot(x-cx,y-cy)<=r
      case'triangle':const sign=(p1x:number,p1y:number,p2x:number,p2y:number,p3x:number,p3y:number)=>(p1x-p3x)*(p2y-p3y)-(p2x-p3x)*(p1y-p3y),d1=sign(x,y,x1+((x2-x1)/2),y1,x2,y2),d2=sign(x,y,x2,y2,x1,y2),d3=sign(x,y,x1,y2,x1+((x2-x1)/2),y1);return!(((d1<0)||(d2<0)||(d3<0))&&((d1>0)||(d2>0)||(d3>0)))
      default:return false
    }
  }

  private unbindEvents(){this.listeners.forEach(({el,type,handler})=>el.removeEventListener(type,handler));this.listeners=[]}
  
  private bindContainerClick(container:HTMLElement){
    this.unbindContainerClick()
    this.containerClickHandler=(e:MouseEvent)=>{
      const target=e.target as HTMLElement
      // 检查是否点击了笔记标记
      if(target.closest('[data-shape-note-marker]'))return
      // 检查是否点击了PDF页面
      const pageEl=target.closest('[data-page]') as HTMLElement
      if(!pageEl)return
      const page=+(pageEl.dataset.page||0)
      if(!page)return
      // 查找该页面的canvas
      const canvas=pageEl.querySelector('.pdf-shape-layer') as HTMLCanvasElement
      if(!canvas)return
      // 使用新的handleClick方法
      if(this.handleClick(e,canvas,page,this.pdfViewer)){
        e.stopPropagation()
        e.preventDefault()
      }
    }
    container.addEventListener('click',this.containerClickHandler)
    // 非绘制模式下，canvas不拦截事件
    document.querySelectorAll('.pdf-shape-layer').forEach(el=>(el as HTMLCanvasElement).style.pointerEvents='none')
  }
  
  private unbindContainerClick(){
    if(this.containerClickHandler){document.querySelectorAll('.viewer-container').forEach(el=>el.removeEventListener('click',this.containerClickHandler!));this.containerClickHandler=null}
  }
  ensureClickEvents(container:HTMLElement){this.bindContainerClick(container)}
  toJSON():ShapeAnnotation[]{const all:ShapeAnnotation[]=[];this.managers.forEach(m=>all.push(...m.toJSON()));return all}
  fromJSON(data:ShapeAnnotation[]){data.forEach(s=>this.getManager(s.page).fromJSON([s]))}
  destroy(){this.unbindEvents();this.unbindContainerClick();this.managers.clear();this.drawers.clear()}
}

/** 形状工具管理器 */
export class ShapeToolManager{
  private controller?:ShapeController
  private bookUrl:string
  private bookName:string
  private initialized=false
  private pdfViewer:any

  constructor(private container:HTMLElement,_plugin:any,bookUrl:string,bookName:string,private onShapeClick?:(shape:ShapeAnnotation)=>void,pdfViewer?:any){
    this.bookUrl=bookUrl
    this.bookName=bookName||'book'
    this.pdfViewer=pdfViewer
  }

  setPdfViewer(viewer:any){
    this.pdfViewer=viewer
    if(this.controller)this.controller.setPdfViewer(viewer)
  }

  /** 从数据库加载形状标注 */
  private async loadData(){
    const db=await getDatabase()
    const annotations=await db.getAnnotations(this.bookUrl)
    return annotations.filter(a=>a.type==='shape').map(a=>({
      id:a.id,
      type:'shape',
      page:a.data?.page||0,
      shapeType:a.data?.shapeType||'rect',
      rect:a.data?.rect||[0,0,0,0],
      color:a.color,
      filled:a.data?.filled||false,
      note:a.note,
      timestamp:a.created
    }))
  }

  /** 保存形状标注到数据库 */
  private async saveData(shapeAnnotations:any[]){
    if(!this.initialized)return
    const db=await getDatabase()
    for(const shape of shapeAnnotations){
      const ann:Annotation={
        id:shape.id,
        book:this.bookUrl,
        type:'shape',
        loc:`page-${shape.page}`,
        text:'',
        note:shape.note||'',
        color:shape.color||'red',
        data:{format:'pdf',page:shape.page,shapeType:shape.shapeType,rect:shape.rect,filled:shape.filled},
        created:shape.timestamp||Date.now(),
        updated:Date.now(),
        chapter:'',
        block:''
      }
      await db.saveAnnotation(ann)
    }
  }

  async init(){
    if(this.controller)return this.controller
    this.controller=new ShapeController(async()=>{
      await this.saveData(this.controller!.toJSON())
      const shapes=this.controller!.toJSON()
      if(shapes.length)try{
        const{autoSyncMark}=await import('@/utils/copy')
        await autoSyncMark(shapes[shapes.length-1],{bookUrl:this.bookUrl,isPdf:true,pdfViewer:this.pdfViewer,shapeManager:this})
      }catch{}
    },this.onShapeClick)
    if(this.pdfViewer)this.controller.setPdfViewer(this.pdfViewer)
    const data=await this.loadData()
    if(data.length)this.controller.fromJSON(data)
    this.controller.ensureClickEvents(this.container)
    this.initialized=true
    return this.controller
  }

  async updateShape(id:string,updates:any):Promise<boolean>{
    if(!this.controller)return false
    const data=await this.loadData()
    const shape=data.find((s:any)=>s.id===id)
    if(!shape)return false
    Object.assign(shape,updates)
    await this.saveData(data)
    this.controller.getManager(shape.page).delete(id)
    this.controller.getManager(shape.page).add(shape)
    this.render(shape.page)
    return true
  }

  /** 删除形状标注 */
  async deleteShape(id:string):Promise<boolean>{
    if(!this.controller)return false
    const data=await this.loadData()
    const shape=data.find((s:any)=>s.id===id)
    if(!shape)return false
    // 从数据库删除
    const db=await getDatabase()
    await db.deleteAnnotation(id)
    // 从内存删除
    this.controller.getManager(shape.page).delete(id)
    this.render(shape.page)
    return true
  }

  render(page:number){
    if(!this.controller)return
    const c=document.querySelector(`.pdf-shape-layer[data-page="${page}"]`)as HTMLCanvasElement
    if(c)this.controller.render(page,c,this.pdfViewer)
  }

  async toggle(active:boolean){await(await this.init()).toggle(active,this.container)}
  async setConfig(config:any){(await this.init()).setConfig(config)}
  async save(){if(this.controller)await this.saveData(this.controller.toJSON())}
  toJSON(){return this.controller?.toJSON()||[]}
  async undo(page:number){if(!this.controller)return false;const s=this.controller.undo(page);if(s)await this.save();return s}
  async clear(page:number){if(!this.controller)return;this.controller.clear(page);await this.save()}
  destroy(){this.controller?.destroy()}
}

export const createShapeToolManager=(container:HTMLElement,plugin:any,bookUrl:string,bookName:string,onShapeClick?:(shape:ShapeAnnotation)=>void,pdfViewer?:any):ShapeToolManager=>new ShapeToolManager(container,plugin,bookUrl,bookName,onShapeClick,pdfViewer)