/**
 * PDF 形状标注模块
 * 支持矩形、圆形、三角形等形状标注，可添加文字笔记
 */
import{loadBookData,saveBookData}from'../bookshelf'

// 类型定义
export type ShapeType='rect'|'circle'|'triangle'
export interface ShapeAnnotation{id:string;type:'shape';shapeType:ShapeType;page:number;rect:[number,number,number,number];color:string;width:number;opacity:number;text?:string;note?:string;timestamp:number}
export interface ShapeConfig{shapeType:ShapeType;color:string;width:number;opacity:number}

const getCoord=(e:MouseEvent|TouchEvent,r:DOMRect)=>({x:(e instanceof MouseEvent?e.clientX:e.touches[0].clientX)-r.left,y:(e instanceof MouseEvent?e.clientY:e.touches[0].clientY)-r.top})

/** 形状绘制器 */
export class ShapeDrawer{
  private ctx:CanvasRenderingContext2D
  private config:ShapeConfig

  constructor(private canvas:HTMLCanvasElement,config:ShapeConfig){
    this.ctx=canvas.getContext('2d')!
    this.config=config
  }

  setConfig(c:Partial<ShapeConfig>){this.config={...this.config,...c}}

  /** 绘制形状 */
  drawShape(shape:ShapeAnnotation,preview=false){
    const[x1,y1,x2,y2]=shape.rect
    const w=x2-x1,h=y2-y1
    this.ctx.strokeStyle=shape.color
    this.ctx.globalAlpha=shape.opacity
    this.ctx.lineWidth=shape.width
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
    this.ctx.stroke()
    this.ctx.setLineDash([])
    
    // 添加点击区域（不可见）
    if(!preview){
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
  private config:ShapeConfig={shapeType:'rect',color:'#ff0000',width:2,opacity:0.8}
  private startPos:{x:number;y:number}|null=null
  private currentPage=0
  private previewShape:ShapeAnnotation|null=null

  constructor(private onSave:()=>Promise<void>,private onShapeClick?:(shape:ShapeAnnotation)=>void){}

  setConfig(c:Partial<ShapeConfig>){this.config={...this.config,...c};this.drawers.forEach(d=>d.setConfig(this.config))}

  private getDrawer(page:number,canvas:HTMLCanvasElement):ShapeDrawer{
    let d=this.drawers.get(page)
    if(!d){d=new ShapeDrawer(canvas,this.config);this.drawers.set(page,d)}
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

  /** 绘制中（预览） */
  draw(e:MouseEvent|TouchEvent){
    if(!this.currentPage||!this.startPos)return
    const cv=document.querySelector(`.pdf-shape-layer[data-page="${this.currentPage}"]`)as HTMLCanvasElement
    if(!cv)return
    const{x,y}=getCoord(e,cv.getBoundingClientRect()),d=this.getDrawer(this.currentPage,cv)
    d.clear()
    this.getManager(this.currentPage).getAll().forEach(s=>d.drawShape(s))
    this.previewShape={id:'preview',type:'shape',shapeType:this.config.shapeType,page:this.currentPage,rect:[this.startPos.x,this.startPos.y,x,y],color:this.config.color,width:this.config.width,opacity:this.config.opacity,timestamp:Date.now()}
    d.drawShape(this.previewShape,true)
  }

  /** 结束绘制 */
  async endDrawing(){
    if(!this.currentPage||!this.startPos||!this.previewShape)return
    const[x1,y1,x2,y2]=this.previewShape.rect
    if(Math.abs(x2-x1)<10||Math.abs(y2-y1)<10){this.startPos=this.previewShape=null;this.currentPage=0;return}
    const shape:ShapeAnnotation={...this.previewShape,id:`shape_${Date.now()}_${Math.random().toString(36).slice(2,9)}`}
    const page=this.currentPage
    this.getManager(page).add(shape)
    await this.onSave()
    const cv=document.querySelector(`.pdf-shape-layer[data-page="${page}"]`)as HTMLCanvasElement
    if(cv)this.render(page,cv)
    this.startPos=this.previewShape=null
    this.currentPage=0
  }

  /** 渲染页面 */
  render(page:number,canvas:HTMLCanvasElement){
    const m=this.managers.get(page)
    if(!m)return
    const d=this.getDrawer(page,canvas)
    d.clear()
    // 清除旧的笔记标记
    canvas.parentElement?.querySelectorAll('[data-shape-note-marker],[data-shape-note-tooltip]').forEach(el=>el.remove())
    m.getAll().forEach(s=>{
      d.drawShape(s)
      if(s.note)this.renderNoteMarker(s,canvas)
    })
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
    if(cv)this.render(page,cv)
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
    const end=async()=>await this.endDrawing()
    c.addEventListener('mousedown',start);c.addEventListener('mousemove',move);c.addEventListener('mouseup',end)
    c.addEventListener('touchstart',start);c.addEventListener('touchmove',move);c.addEventListener('touchend',end)
    this.listeners=[{el:c,type:'mousedown',handler:start},{el:c,type:'mousemove',handler:move},{el:c,type:'mouseup',handler:end},{el:c,type:'touchstart',handler:start},{el:c,type:'touchmove',handler:move},{el:c,type:'touchend',handler:end}]
  }
  

  
  /** 处理点击（检测是否点击了形状） */
  private handleClick(e:MouseEvent|TouchEvent,canvas:HTMLCanvasElement,page:number):boolean{
    const{x,y}=getCoord(e,canvas.getBoundingClientRect())
    const shapes=this.getManager(page).getAll()
    for(const shape of shapes){
      if(this.isPointInShape(x,y,shape)){
        this.onShapeClick?.(shape)
        return true
      }
    }
    return false
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
      // 计算相对于canvas的坐标
      const rect=canvas.getBoundingClientRect()
      const x=e.clientX-rect.left
      const y=e.clientY-rect.top
      // 检查是否点击了形状
      const shapes=this.getManager(page).getAll()
      for(const shape of shapes){
        if(this.isPointInShape(x,y,shape)){
          this.onShapeClick?.(shape)
          e.stopPropagation()
          e.preventDefault()
          return
        }
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
  private plugin:any
  private bookUrl:string
  private bookName:string
  private initialized=false

  constructor(private container:HTMLElement,plugin:any,bookUrl:string,bookName:string,private onShapeClick?:(shape:ShapeAnnotation)=>void){
    this.plugin=plugin
    this.bookUrl=bookUrl
    this.bookName=bookName||'book'
  }

  private async loadData(){
    const data=await loadBookData(this.bookUrl,this.bookName)
    return data?.shapeAnnotations||[]
  }

  private async saveData(shapeAnnotations:any[]){
    if(!this.initialized)return
    await saveBookData(this.bookUrl,{shapeAnnotations},this.bookName)
  }

  async init(){
    if(this.controller)return this.controller
    this.controller=new ShapeController(async()=>await this.saveData(this.controller!.toJSON()),this.onShapeClick)
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

  async deleteShape(id:string):Promise<boolean>{
    if(!this.controller)return false
    const data=await this.loadData()
    const shape=data.find((s:any)=>s.id===id)
    if(!shape)return false
    data.splice(data.indexOf(shape),1)
    await this.saveData(data)
    this.controller.getManager(shape.page).delete(id)
    this.render(shape.page)
    return true
  }

  render(page:number){
    if(!this.controller)return
    const c=document.querySelector(`.pdf-shape-layer[data-page="${page}"]`)as HTMLCanvasElement
    if(c)this.controller.render(page,c)
  }

  async toggle(active:boolean){await(await this.init()).toggle(active,this.container)}
  async setConfig(config:any){(await this.init()).setConfig(config)}
  async save(){if(this.controller)await this.saveData(this.controller.toJSON())}
  toJSON(){return this.controller?.toJSON()||[]}
  async undo(page:number){if(!this.controller)return false;const s=this.controller.undo(page);if(s)await this.save();return s}
  async clear(page:number){if(!this.controller)return;this.controller.clear(page);await this.save()}
  destroy(){this.controller?.destroy()}
}

export const createShapeToolManager=(container:HTMLElement,plugin:any,bookUrl:string,bookName:string,onShapeClick?:(shape:ShapeAnnotation)=>void):ShapeToolManager=>new ShapeToolManager(container,plugin,bookUrl,bookName,onShapeClick)
