/**
 * PDF 墨迹标注核心模块
 */
import{getDatabase}from'../database'
import type{Annotation}from'../database'

export interface InkPoint{x:number;y:number;pressure?:number}
export interface InkPath{points:InkPoint[];color:string;width:number;opacity:number}
export interface InkAnnotation{id:string;type:'ink';page:number;paths:InkPath[];timestamp:number;rect?:[number,number,number,number]}
export interface InkConfig{color:string;width:number;opacity:number;smoothing:boolean}

const getCoord=(e:MouseEvent|TouchEvent,r:DOMRect)=>({x:(e instanceof MouseEvent?e.clientX:e.touches[0].clientX)-r.left,y:(e instanceof MouseEvent?e.clientY:e.touches[0].clientY)-r.top})
const isValidRect=(r:any):r is[number,number,number,number]=>Array.isArray(r)&&r.length===4
const isValidPaths=(p:any):p is InkPath[]=>Array.isArray(p)&&p.length>0

/** 绘制墨迹到Canvas */
export const drawInk=(canvas:HTMLCanvasElement,paths:InkPath[],rect:[number,number,number,number])=>{
  const ctx=canvas.getContext('2d')
  if(!ctx||!isValidPaths(paths)||!isValidRect(rect))return
  const[x1,y1,x2,y2]=rect,w=x2-x1,h=y2-y1
  if(w<=0||h<=0)return
  ctx.clearRect(0,0,canvas.width,canvas.height)
  const s=Math.min(canvas.width/(w+10),canvas.height/(h+10)),ox=(canvas.width-w*s)/2-x1*s,oy=(canvas.height-h*s)/2-y1*s
  ctx.lineCap=ctx.lineJoin='round'
  paths.forEach(p=>{
    if(!p?.points?.length||p.points.length<2)return
    ctx.strokeStyle=p.color||'#000'
    ctx.globalAlpha=p.opacity??1
    ctx.lineWidth=(p.width||2)*s
    ctx.beginPath()
    ctx.moveTo(p.points[0].x*s+ox,p.points[0].y*s+oy)
    p.points.forEach(pt=>ctx.lineTo(pt.x*s+ox,pt.y*s+oy))
    ctx.stroke()
  })
}

/** 批量渲染墨迹Canvas */
export const renderInkCanvas=(list:any[],cache:Map<string,number>,draw=drawInk)=>{
  document.querySelectorAll('[data-page].sr-group-preview').forEach(el=>{
    const c=el as HTMLCanvasElement,p=+(c.dataset.page||0),k=`g${p}`
    if(cache.has(k))return
    const g=list.find(i=>i.type==='ink-group'&&i.page===p)
    if(!g?.inks)return
    let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity,paths:InkPath[]=[]
    g.inks.forEach((ink:any)=>{
      if(isValidRect(ink.rect)){
        const[a,b,c,d]=ink.rect
        x1=Math.min(x1,a);y1=Math.min(y1,b);x2=Math.max(x2,c);y2=Math.max(y2,d)
      }
      if(isValidPaths(ink.paths))paths.push(...ink.paths)
    })
    if(paths.length&&x1!==Infinity){draw(c,paths,[x1,y1,x2,y2]);cache.set(k,1)}
  })
  document.querySelectorAll('[data-ink-id]').forEach(el=>{
    const c=el as HTMLCanvasElement,id=c.dataset.inkId
    if(!id||cache.has(id))return
    const ink=list.find(i=>i.type==='ink-group'&&i.inks?.some((k:any)=>k.id===id))?.inks?.find((i:any)=>i.id===id)
    if(ink&&isValidPaths(ink.paths)&&isValidRect(ink.rect)){draw(c,ink.paths,ink.rect);cache.set(id,1)}
  })
}

/** 墨迹绘制器 */
export class InkDrawer{
  private ctx:CanvasRenderingContext2D
  private isDrawing=false
  private currentPath:InkPoint[]=[]
  private config:InkConfig

  constructor(private canvas:HTMLCanvasElement,config:InkConfig){
    this.ctx=canvas.getContext('2d')!
    this.config=config
    this.ctx.lineCap=this.ctx.lineJoin='round'
  }

  setConfig(c:Partial<InkConfig>){this.config={...this.config,...c}}

  startDrawing(x:number,y:number,pressure=1){
    this.isDrawing=true
    this.currentPath=[{x,y,pressure}]
    this.ctx.beginPath()
    this.ctx.moveTo(x,y)
  }

  draw(x:number,y:number,pressure=1){
    if(!this.isDrawing)return
    const rx=Math.round(x),ry=Math.round(y),len=this.currentPath.length
    if(len>0){
      const last=this.currentPath[len-1]
      if(last.x===rx&&last.y===ry||Math.hypot(rx-last.x,ry-last.y)<3)return
    }
    this.currentPath.push({x:rx,y:ry,pressure})
    this.ctx.strokeStyle=this.config.color
    this.ctx.globalAlpha=this.config.opacity
    this.ctx.lineWidth=this.config.width*pressure
    if(this.config.smoothing&&len>1){
      const p1=this.currentPath[len-1]
      this.ctx.quadraticCurveTo(p1.x,p1.y,(p1.x+rx)/2,(p1.y+ry)/2)
    }else{
      this.ctx.lineTo(rx,ry)
    }
    this.ctx.stroke()
  }

  endDrawing():InkPath|null{
    if(!this.isDrawing||this.currentPath.length<2){this.isDrawing=false;return null}
    this.isDrawing=false
    const path:InkPath={points:[...this.currentPath],color:this.config.color,width:this.config.width,opacity:this.config.opacity}
    this.currentPath=[]
    return path
  }

  clear(){this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height)}

  renderAnnotation(ann:InkAnnotation){ann.paths.forEach(p=>this.renderPath(p))}

  private renderPath(p:InkPath){
    if(p.points.length<2)return
    this.ctx.strokeStyle=p.color
    this.ctx.globalAlpha=p.opacity
    this.ctx.lineWidth=p.width
    this.ctx.beginPath()
    this.ctx.moveTo(p.points[0].x,p.points[0].y)
    if(this.config.smoothing&&p.points.length>2){
      for(let i=1;i<p.points.length-1;i++){
        const p1=p.points[i],p2=p.points[i+1]
        this.ctx.quadraticCurveTo(p1.x,p1.y,(p1.x+p2.x)/2,(p1.y+p2.y)/2)
      }
    }else{
      p.points.forEach(pt=>this.ctx.lineTo(pt.x,pt.y))
    }
    this.ctx.stroke()
  }

  static calculateRect(paths:InkPath[]):[number,number,number,number]{
    let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity
    paths.forEach(p=>p.points.forEach(pt=>{x1=Math.min(x1,pt.x);y1=Math.min(y1,pt.y);x2=Math.max(x2,pt.x);y2=Math.max(y2,pt.y)}))
    return[x1,y1,x2,y2]
  }
}

/** 墨迹管理器 */
export class InkManager{
  private annotations=new Map<string,InkAnnotation>()
  private history:string[]=[]
  currentAnnotation:InkAnnotation|null=null

  constructor(private page:number){}

  startAnnotation(){this.currentAnnotation={id:`ink_${Date.now()}_${Math.random().toString(36).slice(2,11)}`,type:'ink',page:this.page,paths:[],timestamp:Date.now()}}
  addPath(path:InkPath){this.currentAnnotation?.paths.push(path)}
  endAnnotation():InkAnnotation|null{
    if(!this.currentAnnotation?.paths.length){this.currentAnnotation=null;return null}
    this.currentAnnotation.rect=InkDrawer.calculateRect(this.currentAnnotation.paths)
    this.annotations.set(this.currentAnnotation.id,this.currentAnnotation)
    this.history.push(this.currentAnnotation.id)
    const ann=this.currentAnnotation
    this.currentAnnotation=null
    return ann
  }
  undo():boolean{const id=this.history.pop();return id?this.annotations.delete(id):false}
  getAnnotations():InkAnnotation[]{return Array.from(this.annotations.values())}
  deleteAnnotation(id:string):boolean{return this.annotations.delete(id)}
  clear(){this.annotations.clear();this.history=[]}
  toJSON():InkAnnotation[]{return this.getAnnotations()}
  fromJSON(data:InkAnnotation[]){data.forEach(a=>{if(a.page===this.page)this.annotations.set(a.id,a)})}
}

/** 墨迹控制器 */
export class InkController{
  private managers=new Map<number,InkManager>()
  private drawers=new Map<number,InkDrawer>()
  private config:InkConfig={color:'#ff0000',width:2,opacity:1,smoothing:true}
  private currentPage=0
  private container?:HTMLElement
  private listeners:Array<{el:HTMLElement;type:string;handler:any}>=[]

  constructor(private onSave?:()=>Promise<void>){}

  init(container:HTMLElement){this.container=container}
  setConfig(c:Partial<InkConfig>){this.config={...this.config,...c};this.drawers.forEach(d=>d.setConfig(this.config))}

  private getDrawer(page:number,canvas:HTMLCanvasElement):InkDrawer{
    let d=this.drawers.get(page)
    if(!d){d=new InkDrawer(canvas,this.config);this.drawers.set(page,d)}else{d.setConfig(this.config)}
    return d
  }

  getManager(page:number):InkManager{
    let m=this.managers.get(page)
    if(!m){m=new InkManager(page);this.managers.set(page,m)}
    return m
  }

  async startDrawing(e:MouseEvent|TouchEvent,canvas:HTMLCanvasElement,page:number){
    this.currentPage=page
    const{x,y}=getCoord(e,canvas.getBoundingClientRect())
    this.getDrawer(page,canvas).startDrawing(x,y)
  }

  draw(e:MouseEvent|TouchEvent){
    if(!this.currentPage)return
    const d=this.drawers.get(this.currentPage),cv=document.querySelector(`.pdf-ink-layer[data-page="${this.currentPage}"]`)as HTMLCanvasElement
    if(!d||!cv)return
    const{x,y}=getCoord(e,cv.getBoundingClientRect())
    d.draw(x,y)
  }

  async endDrawing(){
    if(!this.currentPage)return
    const path=this.drawers.get(this.currentPage)?.endDrawing()
    if(path){
      const m=this.getManager(this.currentPage)
      if(!m.currentAnnotation)m.startAnnotation()
      m.addPath(path)
      m.endAnnotation()
      await this.onSave?.()
    }
    this.currentPage=0
  }

  render(page:number,canvas:HTMLCanvasElement){
    const m=this.managers.get(page)
    if(!m)return
    const d=this.getDrawer(page,canvas)
    d.clear()
    m.getAnnotations().forEach(a=>d.renderAnnotation(a))
  }

  undo(page:number):boolean{
    const m=this.managers.get(page)
    if(!m)return false
    const success=m.undo()
    if(success){
      const cv=document.querySelector(`.pdf-ink-layer[data-page="${page}"]`)as HTMLCanvasElement
      if(cv)this.render(page,cv)
    }
    return success
  }

  clear(page:number){this.managers.get(page)?.clear();this.drawers.get(page)?.clear()}
  toJSON():InkAnnotation[]{const all:InkAnnotation[]=[];this.managers.forEach(m=>all.push(...m.toJSON()));return all}
  fromJSON(data:InkAnnotation[]){data.forEach(ink=>this.getManager(ink.page).fromJSON([ink]))}

  async toggle(active:boolean){
    if(!this.container)return
    this.container.style.userSelect=active?'none':'text'
    this.container.style.cursor=active?'crosshair':'default'
    document.querySelectorAll('.pdf-ink-layer').forEach(el=>{const c=el as HTMLCanvasElement;c.style.pointerEvents=active?'auto':'none';c.style.cursor=active?'crosshair':'default'})
    active?this.bindEvents():this.unbindEvents()
  }

  private bindEvents(){
    if(!this.container)return
    const start=async(e:MouseEvent|TouchEvent)=>{const t=e.target as HTMLElement;if(!t.classList.contains('pdf-ink-layer'))return;const cv=t as HTMLCanvasElement,p=+(cv.dataset.page||0);if(!p)return;await this.startDrawing(e,cv,p);e.preventDefault()}
    const move=(e:MouseEvent|TouchEvent)=>{this.draw(e);e.preventDefault()}
    const end=async()=>await this.endDrawing()
    const c=this.container
    c.addEventListener('mousedown',start);c.addEventListener('mousemove',move);c.addEventListener('mouseup',end)
    c.addEventListener('touchstart',start);c.addEventListener('touchmove',move);c.addEventListener('touchend',end)
    this.listeners=[{el:c,type:'mousedown',handler:start},{el:c,type:'mousemove',handler:move},{el:c,type:'mouseup',handler:end},{el:c,type:'touchstart',handler:start},{el:c,type:'touchmove',handler:move},{el:c,type:'touchend',handler:end}]
  }

  private unbindEvents(){this.listeners.forEach(({el,type,handler})=>el.removeEventListener(type,handler));this.listeners=[]}
  destroy(){this.unbindEvents();this.managers.clear();this.drawers.clear()}
}

/** 墨迹工具管理器 */
export class InkToolManager{
  private controller?:InkController
  private initialized=false

  constructor(private container:HTMLElement,private plugin:any,private bookUrl:string,private bookName:string,private viewer:any){}

  private async loadData(){
    const db=await getDatabase(),annotations=await db.getAnnotations(this.bookUrl)
    return annotations.filter(a=>a.type==='ink').map(a=>{
      const ink:any={id:a.id,type:'ink',page:a.data?.page||0,paths:a.data?.paths||[],timestamp:a.created}
      ink.rect=isValidRect(a.data?.rect)?a.data.rect:isValidPaths(ink.paths)?InkDrawer.calculateRect(ink.paths):undefined
      return ink
    })
  }

  private async saveData(inkAnnotations:any[]){
    if(!this.initialized)return
    const db=await getDatabase()
    for(const ink of inkAnnotations){
      await db.saveAnnotation({
        id:ink.id,book:this.bookUrl,type:'ink',loc:`page-${ink.page}`,text:'',note:'',color:'black',
        data:{format:'pdf',page:ink.page,paths:ink.paths,rect:ink.rect},
        created:ink.timestamp||Date.now(),updated:Date.now(),chapter:'',block:''
      })
    }
  }

  async init(){
    if(this.controller)return this.controller
    this.controller=new InkController(async()=>await this.saveData(this.controller!.toJSON()))
    this.controller.init(this.container)
    const data=await this.loadData()
    if(data.length)this.controller.fromJSON(data)
    this.initialized=true
    return this.controller
  }

  render(page:number){
    const canvas=document.querySelector(`.pdf-ink-layer[data-page="${page}"]`)as HTMLCanvasElement
    if(canvas&&this.controller)this.controller.render(page,canvas)
  }

  async toggle(active:boolean){await(await this.init()).toggle(active)}
  async setConfig(config:any){(await this.init()).setConfig(config)}
  async save(){if(this.controller)await this.saveData(this.controller.toJSON())}
  toJSON(){return this.controller?.toJSON()||[]}
  
  async deleteInk(id:string):Promise<boolean>{
    if(!this.controller)return false
    const data=await this.loadData(),ink=data.find((i:any)=>i.id===id)
    if(!ink)return false
    const db=await getDatabase()
    await db.deleteAnnotation(id)
    this.controller.getManager(ink.page).deleteAnnotation(id)
    this.render(ink.page)
    return true
  }
  
  async undo(){
    if(!this.controller)return false
    const page=this.viewer?.getCurrentPage()
    if(!page)return false
    const success=this.controller.undo(page)
    if(success)await this.saveData(this.controller.toJSON())
    return success
  }
  
  async clear(){
    if(!this.controller)return
    const page=this.viewer?.getCurrentPage()
    if(!page)return
    this.controller.clear(page)
    await this.saveData(this.controller.toJSON())
  }
  
  destroy(){this.controller?.destroy()}
}

export const createInkToolManager=(container:HTMLElement,plugin:any,bookUrl:string,bookName:string,viewer:any):InkToolManager=>new InkToolManager(container,plugin,bookUrl,bookName,viewer)