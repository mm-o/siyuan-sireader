/**
 * PDF 墨迹标注核心模块
 * 支持鼠标/触摸绘制、平滑曲线、撤销/清除等功�?
 */
import{loadBookData,saveBookData}from'../_deprecated/bookshelf'

// 类型定义
export interface InkPoint{x:number;y:number;pressure?:number}
export interface InkPath{points:InkPoint[];color:string;width:number;opacity:number}
export interface InkAnnotation{id:string;type:'ink';page:number;paths:InkPath[];timestamp:number;rect?:[number,number,number,number]}
export interface InkConfig{color:string;width:number;opacity:number;smoothing:boolean}

// 工具函数：获取鼠�?触摸坐标
const getCoord=(e:MouseEvent|TouchEvent,r:DOMRect)=>({x:(e instanceof MouseEvent?e.clientX:e.touches[0].clientX)-r.left,y:(e instanceof MouseEvent?e.clientY:e.touches[0].clientY)-r.top})

// ===== 渲染工具函数 =====

/** 绘制墨迹标注�?Canvas（用于预�?缩略图） */
export const drawInk=(canvas:HTMLCanvasElement,paths:InkPath[],rect:[number,number,number,number])=>{
  const ctx=canvas.getContext('2d')
  if(!ctx)return
  ctx.clearRect(0,0,canvas.width,canvas.height)
  const[x1,y1,x2,y2]=rect,w=x2-x1,h=y2-y1,s=Math.min(canvas.width/(w+10),canvas.height/(h+10))
  const ox=(canvas.width-w*s)/2-x1*s,oy=(canvas.height-h*s)/2-y1*s
  ctx.lineCap=ctx.lineJoin='round'
  paths.forEach(p=>{
    if(p.points.length<2)return
    ctx.strokeStyle=p.color
    ctx.globalAlpha=p.opacity
    ctx.lineWidth=p.width*s
    ctx.beginPath()
    ctx.moveTo(p.points[0].x*s+ox,p.points[0].y*s+oy)
    p.points.forEach(pt=>ctx.lineTo(pt.x*s+ox,pt.y*s+oy))
    ctx.stroke()
  })
}

/** 渲染墨迹 Canvas（批量渲染） */
export const renderInkCanvas=(list:any[],inkCache:Map<string,number>)=>{
  document.querySelectorAll('[data-page].sr-group-preview').forEach(el=>{
    const c=el as HTMLCanvasElement,p=+(c.dataset.page||0),k=`g${p}`
    if(inkCache.has(k))return
    const g=list.find((i:any)=>i.type==='ink-group'&&i.page===p)
    if(!g?.inks)return
    let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity,paths:InkPath[]=[]
    g.inks.forEach((ink:any)=>{
      const[a,b,c,d]=ink.rect||[0,0,0,0]
      x1=Math.min(x1,a);y1=Math.min(y1,b);x2=Math.max(x2,c);y2=Math.max(y2,d)
      paths.push(...ink.paths)
    })
    drawInk(c,paths,[x1,y1,x2,y2])
    inkCache.set(k,1)
  })
  document.querySelectorAll('[data-ink-id]').forEach(el=>{
    const c=el as HTMLCanvasElement,id=c.dataset.inkId
    if(!id||inkCache.has(id))return
    const g=list.find((i:any)=>i.type==='ink-group'&&i.inks?.some((ink:any)=>ink.id===id))
    const ink=g?.inks?.find((i:any)=>i.id===id)
    if(ink){
      drawInk(c,ink.paths,ink.rect)
      inkCache.set(id,1)
    }
  })
}

/** 墨迹绘制�?- 负责单个 Canvas 的绘制操�?*/
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

  /** 更新配置 */
  setConfig(c:Partial<InkConfig>){this.config={...this.config,...c}}

  /** 开始绘�?*/
  startDrawing(x:number,y:number,pressure=1){
    this.isDrawing=true
    this.currentPath=[{x,y,pressure}]
    this.ctx.beginPath()
    this.ctx.moveTo(x,y)
  }

  /** 绘制路径�?*/
  draw(x:number,y:number,pressure=1){
    if(!this.isDrawing)return
    const rx=Math.round(x),ry=Math.round(y)
    const len=this.currentPath.length
    // 抽稀：跳过距离太近的点（< 3px）或相同坐标
    if(len>0){
      const last=this.currentPath[len-1]
      if(last.x===rx&&last.y===ry)return
      const dist=Math.hypot(rx-last.x,ry-last.y)
      if(dist<3)return
    }
    this.currentPath.push({x:rx,y:ry,pressure})
    this.ctx.strokeStyle=this.config.color
    this.ctx.globalAlpha=this.config.opacity
    this.ctx.lineWidth=this.config.width*pressure
    if(this.config.smoothing&&len>1){
      const p1=this.currentPath[len-1],p2={x:rx,y:ry}
      this.ctx.quadraticCurveTo(p1.x,p1.y,(p1.x+p2.x)/2,(p1.y+p2.y)/2)
    }else{
      this.ctx.lineTo(rx,ry)
    }
    this.ctx.stroke()
  }

  /** 结束绘制，返回路�?*/
  endDrawing():InkPath|null{
    if(!this.isDrawing||this.currentPath.length<2){this.isDrawing=false;return null}
    this.isDrawing=false
    const path:InkPath={points:[...this.currentPath],color:this.config.color,width:this.config.width,opacity:this.config.opacity}
    this.currentPath=[]
    return path
  }

  /** 清空画布 */
  clear(){this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height)}

  /** 渲染标注 */
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

  /** 计算路径边界�?*/
  static calculateRect(paths:InkPath[]):[number,number,number,number]{
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
    paths.forEach(p=>p.points.forEach(pt=>{minX=Math.min(minX,pt.x);minY=Math.min(minY,pt.y);maxX=Math.max(maxX,pt.x);maxY=Math.max(maxY,pt.y)}))
    return[minX,minY,maxX,maxY]
  }
}

/** 墨迹管理�?- 管理单个页面的墨迹标�?*/
export class InkManager{
  private annotations=new Map<string,InkAnnotation>()
  private history:string[]=[]
  currentAnnotation:InkAnnotation|null=null

  constructor(private page:number){}

  startAnnotation(){this.currentAnnotation={id:`ink_${Date.now()}_${Math.random().toString(36).slice(2,11)}`,type:'ink',page:this.page,paths:[],timestamp:Date.now()}}
  addPath(path:InkPath){this.currentAnnotation?.paths.push(path)}
  endAnnotation():InkAnnotation|null{
    if(!this.currentAnnotation||!this.currentAnnotation.paths.length){this.currentAnnotation=null;return null}
    this.currentAnnotation.rect=InkDrawer.calculateRect(this.currentAnnotation.paths)
    this.annotations.set(this.currentAnnotation.id,this.currentAnnotation)
    this.history.push(this.currentAnnotation.id)
    const ann=this.currentAnnotation
    this.currentAnnotation=null
    return ann
  }
  undo():boolean{const id=this.history.pop();if(!id)return false;this.annotations.delete(id);return true}
  getAnnotations():InkAnnotation[]{return Array.from(this.annotations.values())}
  deleteAnnotation(id:string):boolean{return this.annotations.delete(id)}
  clear(){this.annotations.clear();this.history=[]}
  toJSON():InkAnnotation[]{return this.getAnnotations()}
  fromJSON(data:InkAnnotation[]){data.forEach(a=>{if(a.page===this.page)this.annotations.set(a.id,a)})}
}

/** 墨迹控制�?- 统一管理所有页面的墨迹标注 */
export class InkController{
  private managers=new Map<number,InkManager>()
  private drawers=new Map<number,InkDrawer>()
  private config:InkConfig={color:'#ff0000',width:2,opacity:1,smoothing:true}
  private currentPage=0
  private container?:HTMLElement
  private listeners:Array<{el:HTMLElement;type:string;handler:any}>=[]

  constructor(private onSave?:()=>Promise<void>){}

  /** 初始化容�?*/
  init(container:HTMLElement){this.container=container}

  /** 更新配置 */
  setConfig(c:Partial<InkConfig>){this.config={...this.config,...c};this.drawers.forEach(d=>d.setConfig(this.config))}

  /** 获取或创建绘制器 */
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

  /** 开始绘�?*/
  async startDrawing(e:MouseEvent|TouchEvent,canvas:HTMLCanvasElement,page:number){
    this.currentPage=page
    const{x,y}=getCoord(e,canvas.getBoundingClientRect())
    this.getDrawer(page,canvas).startDrawing(x,y)
  }

  /** 绘制�?*/
  draw(e:MouseEvent|TouchEvent){
    if(!this.currentPage)return
    const d=this.drawers.get(this.currentPage)
    const cv=document.querySelector(`.pdf-ink-layer[data-page="${this.currentPage}"]`)as HTMLCanvasElement
    if(!d||!cv)return
    const{x,y}=getCoord(e,cv.getBoundingClientRect())
    d.draw(x,y)
  }

  /** 结束绘制 */
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

  /** 渲染指定页面 */
  render(page:number,canvas:HTMLCanvasElement){
    const m=this.managers.get(page)
    if(!m)return
    const d=this.getDrawer(page,canvas)
    d.clear()
    m.getAnnotations().forEach(a=>d.renderAnnotation(a))
  }

  /** 撤销指定页面 */
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

  /** 清空指定页面 */
  clear(page:number){
    this.managers.get(page)?.clear()
    this.drawers.get(page)?.clear()
  }

  /** 导出所有标�?*/
  toJSON():InkAnnotation[]{const all:InkAnnotation[]=[];this.managers.forEach(m=>all.push(...m.toJSON()));return all}
  /** 导入标注 */
  fromJSON(data:InkAnnotation[]){data.forEach(ink=>this.getManager(ink.page).fromJSON([ink]))}

  /** 切换绘制模式 */
  async toggle(active:boolean){
    if(!this.container)return
    this.container.style.userSelect=active?'none':'text'
    this.container.style.cursor=active?'crosshair':'default'
    document.querySelectorAll('.pdf-ink-layer').forEach(el=>{const c=el as HTMLCanvasElement;c.style.pointerEvents=active?'auto':'none';c.style.cursor=active?'crosshair':'default'})
    active?this.bindEvents():this.unbindEvents()
  }

  /** 绑定事件 */
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

  /** 解绑事件 */
  private unbindEvents(){this.listeners.forEach(({el,type,handler})=>el.removeEventListener(type,handler));this.listeners=[]}

  /** 销�?*/
  destroy(){this.unbindEvents();this.managers.clear();this.drawers.clear()}
}

/** 墨迹工具管理�?- 对外统一接口 */
export class InkToolManager{
  private controller?:InkController
  private plugin:any
  private bookUrl:string
  private bookName:string
  private initialized=false

  constructor(private container:HTMLElement,plugin:any,bookUrl:string,bookName:string,private viewer:any){
    this.plugin=plugin
    this.bookUrl=bookUrl
    this.bookName=bookName||'book'
  }

  private async loadData(){
    try{
      // 尝试从数据库加载
      const{getDatabase}=await import('../database')
      const db=await getDatabase()
      await db.init()
      
      const annotations=await db.getAnnotations(this.bookUrl)
      const inks=annotations
        .filter(a=>a.type==='ink')
        .map(a=>({
          id:a.id,
          type:'ink'as const,
          page:a.page||0,
          paths:a.paths||[],
          timestamp:a.timestamp,
          rect:a.rects?.[0] as [number,number,number,number]|undefined
        }))
      
      return inks
    }catch(e){
      console.warn('[Ink] Load from DB failed, fallback to JSON:',e)
      // 降级：从 JSON 加载
      const data=await loadBookData(this.bookUrl,this.bookName)
      return data?.inkAnnotations||[]
    }
  }

  private async saveData(inkAnnotations:any[]){
    if(!this.initialized)return
    try{
      // 尝试保存到数据库
      const{getDatabase}=await import('../database')
      const db=await getDatabase()
      
      for(const ink of inkAnnotations){
        await db.addAnnotation({
          id:ink.id,
          type:'ink',
          book:this.bookUrl,
          format:'pdf',
          page:ink.page,
          paths:ink.paths,
          rects:ink.rect?[ink.rect]:undefined,
          color:ink.paths?.[0]?.color||'#000000',
          timestamp:ink.timestamp
        })
      }
      
    }catch(e){
      console.warn('[Ink] Save to DB failed, fallback to JSON:',e)
      // 降级：保存到 JSON
      await saveBookData(this.bookUrl,{inkAnnotations})
    }
  }

  /** 初始化控制器 */
  async init(){
    if(this.controller)return this.controller
    this.controller=new InkController(async()=>await this.saveData(this.controller!.toJSON()))
    this.controller.init(this.container)
    const data=await this.loadData()
    if(data.length)this.controller.fromJSON(data)
    this.initialized=true
    return this.controller
  }

  /** 渲染页面 */
  render(page:number){
    const canvas=document.querySelector(`.pdf-ink-layer[data-page="${page}"]`)as HTMLCanvasElement
    if(canvas&&this.controller)this.controller.render(page,canvas)
  }

  /** 切换绘制模式 */
  async toggle(active:boolean){await(await this.init()).toggle(active)}
  /** 设置配置 */
  async setConfig(config:any){(await this.init()).setConfig(config)}
  /** 保存 */
  async save(){if(this.controller)await this.saveData(this.controller.toJSON())}
  /** 获取所有标�?*/
  toJSON(){return this.controller?.toJSON()||[]}
  /** 删除墨迹标注 */
  async deleteInk(id:string):Promise<boolean>{
    if(!this.controller)return false
    const data=await this.loadData()
    const ink=data.find((i:any)=>i.id===id)
    if(!ink)return false
    data.splice(data.indexOf(ink),1)
    await this.saveData(data)
    this.controller.getManager(ink.page).deleteAnnotation(id)
    this.render(ink.page)
    return true
  }
  /** 撤销 */
  async undo(){
    if(!this.controller)return false
    const page=this.viewer?.getCurrentPage()
    if(!page)return false
    const success=this.controller.undo(page)
    if(success)await this.saveData(this.controller.toJSON())
    return success
  }
  /** 清空当前�?*/
  async clear(){
    if(!this.controller)return
    const page=this.viewer?.getCurrentPage()
    if(!page)return
    this.controller.clear(page)
    await this.saveData(this.controller.toJSON())
  }
  /** 销�?*/
  destroy(){this.controller?.destroy()}
}

/** 创建墨迹工具管理�?*/
export const createInkToolManager=(container:HTMLElement,plugin:any,bookUrl:string,bookName:string,viewer:any):InkToolManager=>new InkToolManager(container,plugin,bookUrl,bookName,viewer)


