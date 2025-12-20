/**
 * 统一标注管理器 - PDF/EPUB/TXT 三合一
 */
import type{Plugin}from'siyuan'
import{Overlayer}from'foliate-js/overlayer.js'

type Format='pdf'|'epub'|'txt'
type HighlightColor='yellow'|'red'|'green'|'blue'|'purple'|'orange'|'pink'
type MarkStyle='highlight'|'underline'|'outline'|'squiggly'
type MarkType='bookmark'|'highlight'|'note'|'vocab'

interface Mark{id:string;type:MarkType;format:Format;cfi?:string;section?:number;page?:number;rects?:any[];text?:string;color?:HighlightColor;style?:MarkStyle;note?:string;title?:string;timestamp:number;progress?:number}

export const COLORS=[{name:'黄色',color:'yellow'as const,bg:'#ffeb3b'},{name:'红色',color:'red'as const,bg:'#ef5350'},{name:'绿色',color:'green'as const,bg:'#66bb6a'},{name:'蓝色',color:'blue'as const,bg:'#42a5f5'},{name:'紫色',color:'purple'as const,bg:'#ab47bc'},{name:'橙色',color:'orange'as const,bg:'#ff9800'},{name:'粉色',color:'pink'as const,bg:'#ec407a'}]
export const STYLES=[{type:'highlight'as const,name:'高亮',text:'A'},{type:'underline'as const,name:'下划线',text:'A'},{type:'outline'as const,name:'边框',text:'A'},{type:'squiggly'as const,name:'波浪线',text:'A'}]
export const getColorMap=()=>Object.fromEntries(COLORS.map(c=>[c.color,c.bg]))

// 工具函数
export const getNoteIcon=(color?:string)=>color==='purple'?'🌐':'📒'
export const getNoteColor=(color?:string)=>color==='purple'?'#ab47bc':'#2196f3'

// 统一 tooltip 创建和显示函数
export const createTooltip=(config:{icon:string;iconColor:string;title:string;content:string;id?:string})=>{
  const{icon,iconColor,title,content,id}=config
  const header=`<div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-left:4px solid ${iconColor};background:linear-gradient(135deg,var(--b3-theme-surface) 0%,var(--b3-theme-background-light) 100%)"><svg style="width:16px;height:16px;color:${iconColor};flex-shrink:0;filter:drop-shadow(0 1px 2px ${iconColor}4d)"><use xlink:href="${icon}"/></svg><span style="font-size:13px;font-weight:600;color:var(--b3-theme-on-surface);text-shadow:0 1px 2px rgba(0,0,0,.05)">${title}</span>${id?`<span style="font-size:10px;color:var(--b3-theme-on-surface-variant);margin-left:auto;opacity:0.6;font-weight:400">${id}</span>`:''}</div>`
  return header+content
}

export const showTooltip=(tooltip:HTMLElement,x:number,y:number)=>{
  Object.assign(tooltip.style,{opacity:'0',transform:'translateY(-8px)',display:'block',left:x+'px',top:y+'px'})
  requestAnimationFrame(()=>{
    const{width:w,height:h}=tooltip.getBoundingClientRect()
    Object.assign(tooltip.style,{left:Math.max(10,Math.min(window.innerWidth-w-10,x))+'px',top:Math.max(10,Math.min(window.innerHeight-h-10,y))+'px',opacity:'1',transform:'translateY(0)'})
  })
}

export const hideTooltip=(tooltip:HTMLElement,delay=200)=>{
  tooltip.style.opacity='0'
  tooltip.style.transform='translateY(-8px)'
  setTimeout(()=>tooltip.style.display='none',delay)
}

export const formatAuthor=(a:any):string=>Array.isArray(a)?a.map(c=>typeof c==='string'?c:c?.name).filter(Boolean).join(', '):typeof a==='string'?a:a?.name||''
export const getChapterName=(params:{cfi?:string;page?:number;isPdf?:boolean;toc?:any[];location?:any}):string=>{
  const{cfi,page,isPdf,toc,location}=params
  if(cfi&&(location?.tocItem?.label||location?.tocItem?.title))return location.tocItem.label||location.tocItem.title
  if(isPdf&&page&&toc)for(let i=toc.length-1;i>=0;i--)if(toc[i].pageNumber&&toc[i].pageNumber<=page)return toc[i].label
  return''
}

const hash=(s:string)=>{let h=0;for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return Math.abs(h).toString(36)}
const sanitize=(n:string)=>(n||'book').replace(/[<>:"/\\|?*\x00-\x1f《》【】「」『』（）()[\]{}]/g,'').replace(/\s+/g,'_').replace(/[._-]+/g,'_').replace(/^[._-]+|[._-]+$/g,'').slice(0,50)||'book'

export interface MarkManagerConfig{format:Format;view?:any;plugin:Plugin;bookUrl:string;bookName?:string;onAnnotationClick?:(mark:Mark)=>void;pdfViewer?:any;reader?:any}

export class MarkManager{
  private format:Format
  private view:any
  private plugin:Plugin
  private bookUrl:string
  private bookName:string
  private marks:Mark[]=[]
  private marksMap=new Map<string,Mark>()
  private saveTimer:any
  private autoSaveTimer:any
  private currentPage=1
  private currentProgress=0
  private outline:any[]=[]
  private onAnnotationClick?:(mark:Mark)=>void
  private pdfViewer:any
  private reader:any

  constructor(cfg:MarkManagerConfig){
    this.format=cfg.format
    this.view=cfg.view
    this.plugin=cfg.plugin
    this.bookUrl=cfg.bookUrl
    this.bookName=sanitize(cfg.bookName||cfg.bookUrl.split('/').pop()?.split('.')[0]||'book')
    this.onAnnotationClick=cfg.onAnnotationClick
    this.pdfViewer=cfg.pdfViewer
    this.reader=cfg.reader
    if(this.view)this.setupListeners()
    this.startAutoSave()
  }

  async init(){
    await this.load()
    if(this.format!=='pdf')await this.loadCalibre()
    await this.loadDeck()
    window.addEventListener('sireader:deck-updated',()=>this.loadDeck())
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden)this.updateProgress()
    })
  }

  async restoreProgress(bookInfo?:any){
    if(!bookInfo)return
    if(this.format==='pdf'&&this.pdfViewer){
      const page=bookInfo.durChapterIndex||0
      const total=this.pdfViewer.getPageCount()
      if(page>=1&&page<=total){
        this.pdfViewer.goToPage(page)
      }else if(bookInfo.epubCfi?.startsWith('#page-')){
        const p=parseInt(bookInfo.epubCfi.replace('#page-',''))
        if(p>=1&&p<=total)this.pdfViewer.goToPage(p)
      }
    }else if(this.reader){
      if(bookInfo.epubCfi)await this.reader.goTo(bookInfo.epubCfi)
      else if(bookInfo.durChapterIndex!==undefined)await this.reader.goTo(bookInfo.durChapterIndex)
    }else if(this.view?.goTo&&bookInfo.durChapterIndex!==undefined){
      await this.view.goTo(bookInfo.durChapterIndex)
    }
  }

  private async load(){
    try{
      const{bookshelfManager}=await import('@/core/bookshelf')
      const book=await bookshelfManager.getBook(this.bookUrl)
      if(book?.name)this.bookName=book.name
      const data=await this.plugin.loadData(`books/${sanitize(this.bookName)}_${hash(this.bookUrl)}.json`)
      if(!data)return
      
      this.marks=[]
      const addBookmarks=(list:any[],fmt:Format)=>{
        for(const b of list||[]){
          const key=b.cfi||b.page||`s${b.section}`
          if(!this.marksMap.has(key))this.add({type:'bookmark',format:fmt,cfi:b.cfi,section:b.section,page:b.page,title:b.title,timestamp:b.time||Date.now(),progress:b.progress})
        }
      }
      addBookmarks(data.epubBookmarks,'epub')
      addBookmarks(data.txtBookmarks,'txt')
      if(this.format==='pdf'&&data.annotations)data.annotations.forEach((a:any)=>this.add({type:a.note?'note':'highlight',format:'pdf',page:a.page,rects:a.rects,text:a.text,color:a.color,style:a.style,note:a.note,timestamp:a.timestamp||Date.now()}))
      else if(data.annotations)data.annotations.forEach((a:any)=>this.add({type:a.note?'note':'highlight',format:this.format,cfi:a.cfi||a.value,section:a.section,text:a.text,color:a.color,style:a.style,note:a.note,timestamp:a.timestamp||Date.now()}))
      if(data.inkAnnotations)data.inkAnnotations.forEach((i:any)=>this.add({type:'note',format:'pdf',page:i.page,text:`墨迹-${i.page}`,timestamp:i.timestamp||Date.now()}))
      if(data.shapeAnnotations)data.shapeAnnotations.forEach((s:any)=>this.add({type:'note',format:'pdf',page:s.page,text:s.text||`形状-${s.page}`,timestamp:s.timestamp||Date.now()}))
      if(data.durChapterIndex)this.currentPage=data.durChapterIndex
    }catch(e){console.error('[Mark]',e)}
  }

  private save(){clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.saveNow(),300)}
  
  private startAutoSave(){
    this.autoSaveTimer=setInterval(()=>{
      this.updateProgress()
    },30000)
  }
  
  private async saveNow(){
    try{
      const fileName=`${sanitize(this.bookName)}_${hash(this.bookUrl)}.json`
      const data=await this.plugin.loadData(`books/${fileName}`)||{}
      
      const bookmarks=this.marks.filter(m=>m.type==='bookmark')
      const annotations=this.marks.filter(m=>m.type==='highlight'||m.type==='note')
      
      const saveData={
        epubBookmarks:bookmarks.filter(m=>m.cfi).map(m=>({cfi:m.cfi,title:m.title,progress:m.progress,time:m.timestamp})),
        txtBookmarks:bookmarks.filter(m=>m.section!==undefined).map(m=>({section:m.section,page:m.page,title:m.title,progress:m.progress,time:m.timestamp})),
        annotations:this.format==='pdf'?annotations.map(m=>({id:m.id,page:m.page,type:m.type,rects:m.rects,text:m.text,color:m.color,style:m.style,note:m.note,timestamp:m.timestamp})):annotations.map(m=>({value:m.cfi,cfi:m.cfi,section:m.section,text:m.text,color:m.color,style:m.style,note:m.note,timestamp:m.timestamp})),
        durChapterIndex:this.currentPage,
        epubProgress:this.currentProgress
      }
      
      Object.assign(data,saveData)
      await this.plugin.saveData(`books/${fileName}`,data)
      window.dispatchEvent(new Event('sireader:marks-updated'))
    }catch(e){console.error('[Mark]',e)}
  }

  private add(m:Partial<Mark>):Mark{
    const mark:Mark={id:`${m.type}-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,format:this.format,type:m.type!,timestamp:Date.now(),...m}as Mark
    this.marks.push(mark)
    const key=mark.cfi||mark.page||`s${mark.section}`
    this.marksMap.set(key,mark)
    return mark
  }

  private del(key:string):boolean{
    const idx=this.marks.findIndex(m=>(m.cfi||m.page||`s${m.section}`)===key)
    if(idx<0)return false
    this.marks.splice(idx,1)
    this.marksMap.delete(key)
    return true
  }

  private async loadCalibre(){
    try{
      const calibre=await this.view?.book?.getCalibreBookmarks?.()
      if(!calibre)return
      for(const obj of calibre){
        if(obj.type==='bookmark'&&obj.start_cfi&&!this.marksMap.has(obj.start_cfi))this.add({type:'bookmark',format:'epub',cfi:obj.start_cfi,title:obj.title||obj.notes||'书签'})
        else if(obj.type==='highlight'){
          const{fromCalibreHighlight}=await import('foliate-js/epubcfi.js')as any
          const cfi=fromCalibreHighlight(obj)
          if(!this.marksMap.has(cfi))this.add({type:obj.notes?'note':'highlight',format:'epub',cfi,color:obj.style?.which||'yellow',note:obj.notes})
        }
      }
      this.save()
    }catch(e){console.error('[Mark]',e)}
  }

  private async loadDeck(){
    try{
      const{loadDeckCards}=await import('@/core/dictionary')
      const cards=(await loadDeckCards()).filter(c=>c.bookUrl===this.bookUrl)
      this.marks.filter(m=>m.type==='vocab').forEach(v=>this.del(String(v.cfi||v.page||`s${v.section}`)))
      for(const c of cards){
        const note=`${c.word}\n${c.data.phonetic?`/${c.data.phonetic}/`:''}\n${c.data.meanings?.map((m:any)=>`${m.pos} ${m.text}`).join('\n')||''}`
        const m=this.add({type:'vocab',format:this.format,cfi:c.cfi,section:c.section,text:c.word,note:note.trim(),color:'purple',style:'highlight',timestamp:c.timestamp})
        if(this.format==='pdf')this.renderPdf(m.page!)
        else if(this.format==='txt')this.refreshTxt()
        else if(m.cfi)await this.view?.addAnnotation?.({value:m.cfi,color:'purple',note:m.note}).catch(()=>{})
      }
      this.save()
      window.dispatchEvent(new Event('sireader:marks-updated'))
    }catch(e){console.error('[Mark]',e)}
  }

  private setupListeners(){
    if(this.format==='pdf')return
    this.view.addEventListener('create-overlay',((e:CustomEvent)=>{
      const{index}=e.detail
      this.marks.forEach(m=>{if(m.type!=='bookmark'&&m.cfi)try{if(this.view.resolveCFI(m.cfi).index===index)this.view.addAnnotation({value:m.cfi,color:m.color,note:m.note}).catch(()=>{})}catch{}})
    })as EventListener)
    this.view.addEventListener('draw-annotation',((e:CustomEvent)=>{
      const{draw,annotation,range}=e.detail
      const m=this.marksMap.get(annotation.value)
      const color=COLORS.find(c=>c.color===(m?.color||'yellow'))?.bg||'#ffeb3b'
      const style=m?.style||'highlight'
      const styles={underline:[Overlayer.underline,{color,width:2}],outline:[Overlayer.outline,{color,width:3}],squiggly:[Overlayer.squiggly,{color,width:2}],highlight:[Overlayer.highlight,{color}]}
      const[fn,opts]=styles[style]||styles.highlight
      draw(fn,opts)
      if(m?.note&&range)this.renderNote(range,m)
    })as EventListener)
  }

  private renderNote(range:Range,mark:Mark){
    try{
      const doc=range.startContainer.ownerDocument
      const icon=getNoteIcon(mark.color),themeColor=getNoteColor(mark.color)
      const isVocab=mark.color==='purple'
      const marker=doc.createElement('span')
      marker.setAttribute('data-note-marker','true')
      if(isVocab)marker.setAttribute('data-vocab','true')
      marker.setAttribute('data-mark-id',mark.id)
      marker.textContent=icon
      marker.style.cssText='position:relative;top:-0.5em;font-size:1.1em;margin-left:3px;cursor:pointer;user-select:none;opacity:0.85'
      const tooltip=window.document.createElement('div')
      tooltip.setAttribute('data-note-tooltip','true')
      if(isVocab)tooltip.setAttribute('data-vocab','true')
      tooltip.setAttribute('data-mark-id',mark.id)
      tooltip.style.cssText='position:fixed;display:none;width:340px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12),0 4px 8px rgba(0,0,0,.08),0 0 1px rgba(0,0,0,.1);z-index:99999;pointer-events:auto;overflow:hidden;backdrop-filter:blur(10px);transform:translateY(0);transition:transform .2s cubic-bezier(.4,0,.2,1),opacity .2s cubic-bezier(.4,0,.2,1)'
      const formatText=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')
      const quoteText=mark.text?`<div style="padding:8px 14px;background:var(--b3-theme-background-light);border-bottom:1px solid var(--b3-border-color);font-size:12px;color:var(--b3-theme-on-surface-variant);font-style:italic;line-height:1.5">"${formatText(mark.text)}"</div>`:''
      const noteContent=`<div style="padding:14px;font-size:13px;line-height:1.7;color:var(--b3-theme-on-surface);max-height:300px;overflow-y:auto;word-wrap:break-word;word-break:break-word;background:var(--b3-theme-surface)">${formatText(mark.note||'')}</div>`
      const timestamp=new Date(mark.timestamp).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})
      tooltip.innerHTML=createTooltip({icon:isVocab?'#iconLanguage':'#iconEdit',iconColor:themeColor,title:isVocab?'词典':'笔记',content:quoteText+noteContent,id:timestamp})
      window.document.body.appendChild(tooltip)
      let timer:any
      marker.onmouseenter=()=>{clearTimeout(timer);marker.style.opacity='1';const r=marker.getBoundingClientRect(),iframe=doc.defaultView?.frameElement as HTMLIFrameElement,ir=iframe?.getBoundingClientRect();showTooltip(tooltip,(ir?.left||0)+r.left,(ir?.top||0)+r.bottom+8)}
      marker.onmouseleave=()=>{timer=setTimeout(()=>{marker.style.opacity='0.85';hideTooltip(tooltip)},100)}
      tooltip.onmouseenter=()=>clearTimeout(timer)
      tooltip.onmouseleave=()=>{marker.style.opacity='0.85';hideTooltip(tooltip)}
      const ec=range.endContainer,eo=range.endOffset
      if(ec.nodeType===3){const tn=ec as Text;eo===tn.length?tn.parentNode?.insertBefore(marker,tn.nextSibling):tn.parentNode?.insertBefore(marker,tn.splitText(eo))}
      else{const nn=ec.childNodes[eo];nn?ec.insertBefore(marker,nn):ec.appendChild(marker)}
    }catch(e){console.error('[Mark]',e)}
  }

  // PDF 渲染
  renderPdf(page:number){
    if(this.format!=='pdf')return
    const layer=document.querySelector(`[data-page="${page}"] .pdf-annotation-layer`)
    if(!layer)return
    layer.querySelectorAll('[data-note-marker],[data-note-tooltip],.pdf-highlight').forEach(el=>el.remove())
    this.marks.filter(m=>m.page===page&&(m.type==='highlight'||m.type==='note')).forEach(m=>{
      const bg=COLORS.find(c=>c.color===m.color)?.bg||'#ffeb3b'
      const style=m.style||'highlight'
      m.rects?.forEach((r,idx)=>{
        const div=document.createElement('div')
        div.className=`pdf-highlight pdf-${style}`
        div.dataset.id=m.id
        const base=`position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;pointer-events:auto;cursor:pointer`
        if(style==='highlight')div.style.cssText=`${base};background:${bg};opacity:0.3`
        else if(style==='underline')div.style.cssText=`${base};border-bottom:2px solid ${bg};opacity:0.8`
        else if(style==='outline')div.style.cssText=`${base};border:2px solid ${bg};opacity:0.8`
        else div.style.cssText=`${base};border-bottom:2px wavy ${bg};opacity:0.8`
        div.onclick=()=>this.onAnnotationClick?.(m)
        layer.appendChild(div)
        if(m.note&&idx===m.rects!.length-1){
          const icon=getNoteIcon(m.color)
          const marker=document.createElement('span')
          marker.setAttribute('data-note-marker','true')
          marker.textContent=icon
          marker.style.cssText=`position:absolute;left:${r.x+r.w+3}px;top:${r.y-5}px;font-size:14px;cursor:pointer;opacity:0.85;pointer-events:auto`
          marker.onclick=()=>this.onAnnotationClick?.(m)
          layer.appendChild(marker)
        }
      })
    })
  }

  // TXT 渲染
  renderTxt(doc:Document,section:number){
    if(this.format!=='txt'||!doc||!doc.body)return
    try{
      doc.querySelectorAll('[data-txt-mark],[data-note-marker]').forEach(el=>el.remove())
      this.marks.filter(m=>m.section===section&&m.type!=='bookmark').forEach(m=>{
        const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT)
        let node:Node|null
        while((node=walker.nextNode())){
          const text=node.textContent||''
          const idx=text.indexOf(m.text||'')
          if(idx!==-1&&text.length>10){
            const range=doc.createRange()
            range.setStart(node,idx)
            range.setEnd(node,idx+(m.text?.length||0))
            const span=doc.createElement('span')
            span.setAttribute('data-txt-mark','true')
            const color=COLORS.find(c=>c.color===m.color)?.bg||'#ffeb3b'
            const style=m.style||'highlight'
            if(style==='highlight')span.style.backgroundColor=color
            else if(style==='underline')Object.assign(span.style,{borderBottom:`2px solid ${color}`,paddingBottom:'2px'})
            else if(style==='outline')Object.assign(span.style,{border:`2px solid ${color}`,padding:'0 2px',borderRadius:'2px'})
            else Object.assign(span.style,{textDecoration:'underline wavy',textDecorationColor:color})
            span.style.cursor='pointer'
            span.onclick=(e)=>{e.stopPropagation();const r=span.getBoundingClientRect(),iframe=doc.defaultView?.frameElement as HTMLIFrameElement,ir=iframe?.getBoundingClientRect();window.dispatchEvent(new CustomEvent('txt-annotation-click',{detail:{mark:m,x:(ir?.left||0)+r.left+r.width/2,y:(ir?.top||0)+r.top+r.height}}))}
            range.surroundContents(span)
            break
          }
        }
      })
    }catch(e){console.error('[Mark] renderTxt:',e)}
  }

  bindTxtDocEvents(doc:Document,section:number){
    if(!doc||!doc.body||(doc as any).__txtEventsBound)return
    try{
      doc.addEventListener('mouseup',(e:MouseEvent)=>window.dispatchEvent(new CustomEvent('txt-selection',{detail:{doc,event:e}})))
      this.renderTxt(doc,section)
      ;(doc as any).__txtEventsBound=true
    }catch(e){console.error('[Mark] bindTxtDocEvents:',e)}
  }

  private refreshTxt(){
    const contents=this.view?.renderer?.getContents?.()
    if(!contents)return
    const section=this.view?.lastLocation?.section||0
    contents.forEach(({doc}:any)=>{if(doc)this.renderTxt(doc,section)})
  }

  // 公共 API
  async addHighlight(loc:string|number,text:string,color:HighlightColor,style:MarkStyle='highlight',rects?:any[]):Promise<Mark>{
    const m=this.add({type:'highlight',[typeof loc==='string'?'cfi':this.format==='pdf'?'page':'section']:loc,text:text.substring(0,200),color,style,rects})
    if(this.format==='pdf')this.renderPdf(m.page!)
    else if(this.format==='txt')this.refreshTxt()
    else if(m.cfi)await this.view?.addAnnotation?.({value:m.cfi,color:m.color}).catch(()=>{})
    this.save()
    window.dispatchEvent(new Event('sireader:marks-updated'))
    return m
  }

  async addNote(loc:string|number,note:string,text:string,color:HighlightColor='blue',style:MarkStyle='outline',rects?:any[]):Promise<Mark>{
    const m=this.add({type:'note',[typeof loc==='string'?'cfi':this.format==='pdf'?'page':'section']:loc,text:text.substring(0,200),note,color,style,rects})
    if(this.format==='pdf')this.renderPdf(m.page!)
    else if(this.format==='txt')this.refreshTxt()
    else if(m.cfi)await this.view?.addAnnotation?.({value:m.cfi,color:m.color,note:m.note}).catch(()=>{})
    this.save()
    window.dispatchEvent(new Event('sireader:marks-updated'))
    return m
  }

  async updateMark(keyOrMark:string|any,updates?:Partial<Mark>):Promise<boolean>{
    if(typeof keyOrMark==='object'&&keyOrMark?.type){
      const{type,id}=keyOrMark
      if(type==='shape'){
        const result=await this.getManager('shape')?.updateShape?.(id,updates)
        if(result)window.dispatchEvent(new Event('sireader:marks-updated'))
        return result||false
      }
      if(type==='ink')return false
      keyOrMark=keyOrMark.cfi||keyOrMark.page||`s${keyOrMark.section}`
    }
    const m=this.marksMap.get(keyOrMark)
    if(!m)return false
    Object.assign(m,updates)
    if(this.format==='pdf')this.renderPdf(m.page!)
    else if(this.format==='txt')this.refreshTxt()
    else if(m.cfi){
      await this.view?.deleteAnnotation?.({value:keyOrMark}).catch(()=>{})
      await this.view?.addAnnotation?.({value:keyOrMark,color:m.color,note:m.note}).catch(()=>{})
    }
    this.save()
    window.dispatchEvent(new Event('sireader:marks-updated'))
    return true
  }

  private getManager(type:'ink'|'shape'){return(this as any)[`${type}Manager`]}
  
  private async callManager(type:'ink'|'shape',method:string,id:string):Promise<boolean>{
    const manager=this.getManager(type)
    if(!manager?.toJSON?.().some((i:any)=>i.id===id))return false
    const result=await manager[method]?.(id)
    if(result)window.dispatchEvent(new Event('sireader:marks-updated'))
    return result
  }

  async deleteMark(idOrKey:string|any):Promise<boolean>{
    if(typeof idOrKey==='object'&&idOrKey?.type){
      const{type,id}=idOrKey
      if(type==='shape'||type==='ink')return this.callManager(type,'delete'+type.charAt(0).toUpperCase()+type.slice(1),id)
      idOrKey=id
    }
    if(await this.callManager('ink','deleteInk',idOrKey))return true
    if(await this.callManager('shape','deleteShape',idOrKey))return true
    const m=this.marks.find(mark=>mark.id===idOrKey)||this.marksMap.get(idOrKey)
    const key=m?(m.cfi||m.page||`s${m.section}`):idOrKey
    if(!this.del(String(key)))return false
    if(m?.type==='vocab'&&m.text){
      try{
        const{getDeckCards,removeFromDeck}=await import('@/core/dictionary')
        const card=getDeckCards().find(c=>c.word===m.text&&c.cfi===m.cfi&&c.section===m.section)
        if(card)await removeFromDeck(card.id)
      }catch(e){console.error('[Mark]',e)}
    }
    if(m){
      if(this.format==='pdf')this.renderPdf(m.page!)
      else if(this.format==='txt')this.refreshTxt()
      else{
        if(m.cfi)await this.view?.deleteAnnotation?.({value:m.cfi}).catch(()=>{})
        document.querySelectorAll(`[data-mark-id="${m.id}"]`).forEach(el=>el.remove())
        const contents=this.view?.renderer?.getContents?.()
        contents?.forEach(({doc}:any)=>doc?.querySelectorAll(`[data-mark-id="${m.id}"]`).forEach((el:Element)=>el.remove()))
      }
    }
    this.save()
    window.dispatchEvent(new Event('sireader:marks-updated'))
    return true
  }

  // 书签
  addBookmark(loc?:string|number,title?:string):Mark{
    const l=this.view?.lastLocation
    const useLoc=loc||(this.format==='pdf'?this.currentPage:l?.cfi||l?.section)
    const key=typeof useLoc==='string'?useLoc:useLoc
    if(this.marksMap.has(String(key)))throw new Error('已有书签')
    const m=this.add({type:'bookmark',format:this.format,[typeof useLoc==='string'?'cfi':this.format==='pdf'?'page':'section']:useLoc,title:title||l?.tocItem?.label||`第${(useLoc||0)+1}章`,progress:Math.round((l?.fraction||0)*100)})
    this.save()
    window.dispatchEvent(new Event('sireader:marks-updated'))
    return m
  }

  deleteBookmark(key:string):boolean{if(!this.del(key))return false;this.save();window.dispatchEvent(new Event('sireader:marks-updated'));return true}
  
  toggleBookmark(loc?:string|number,title?:string):boolean{
    const l=this.view?.lastLocation
    const useLoc=loc||(this.format==='pdf'?this.currentPage:l?.cfi||l?.section)
    const key=String(typeof useLoc==='string'?useLoc:useLoc)
    if(this.marks.find(m=>m.type==='bookmark'&&String(m.cfi||m.page||`s${m.section}`)===key)){this.deleteBookmark(key);return false}
    this.addBookmark(useLoc,title)
    return true
  }

  hasBookmark(loc?:string|number):boolean{
    const l=this.view?.lastLocation
    const useLoc=loc||(this.format==='pdf'?this.currentPage:l?.cfi||l?.section)
    const key=String(typeof useLoc==='string'?useLoc:useLoc)
    return this.marks.some(m=>m.type==='bookmark'&&String(m.cfi||m.page||`s${m.section}`)===key)
  }
  
  getBookmarks=()=>this.marks.filter(m=>m.type==='bookmark').sort((a,b)=>(a.progress||0)-(b.progress||0))
  getAnnotations=(color?:HighlightColor)=>{const m=this.marks.filter(m=>m.type==='highlight'||m.type==='note');return color?m.filter(m=>m.color===color):m}
  getNotes=()=>this.marks.filter(m=>m.type==='note')
  getAll=()=>[...this.marks]
  getInkAnnotations=()=>this.getManager('ink')?.toJSON?.()||[]
  getShapeAnnotations=()=>this.getManager('shape')?.toJSON?.()||[]
  
  async goTo(m:Mark){
    if(this.format==='pdf'&&m.page)document.querySelector(`[data-page="${m.page}"]`)?.scrollIntoView({behavior:'smooth'})
    else await this.view?.goTo?.(m.cfi||m.section!)
  }

  updateProgress(){
    if(this.format==='pdf'){
      const page=this.pdfViewer?.getCurrentPage()||1
      const total=this.pdfViewer?.getPageCount()||1
      this.currentPage=page
      this.saveProgress({page,total})
    }else{
      const loc=this.reader?this.reader.getView().lastLocation:(this.view?.getLocation?.()||this.view?.lastLocation)
      this.saveProgress(loc)
    }
  }

  saveProgress(loc:any){
    if(this.format==='pdf'){
      if(typeof loc==='number')this.currentPage=loc
      else if(typeof loc==='object'&&loc.page){
        this.currentPage=loc.page
        if(loc.total)this.currentProgress=Math.round((loc.page/loc.total)*100)
      }
    }else{
      if(loc?.section?.current!==undefined)this.currentPage=loc.section.current
      else if(typeof loc?.section==='number')this.currentPage=loc.section
      if(loc?.fraction!==undefined)this.currentProgress=Math.round(loc.fraction*100)
    }
    this.save()
    this.syncToBookshelf()
  }

  setOutline=(outline:any[])=>this.outline=outline
  setCurrentPage=(page:number)=>{this.currentPage=page;this.save()}
  
  async destroy(){
    clearTimeout(this.saveTimer)
    clearInterval(this.autoSaveTimer)
    await this.saveNow()
    await this.syncToBookshelf()
    this.marks=[]
    this.marksMap.clear()
  }

  private async syncToBookshelf(){
    try{
      const{bookshelfManager}=await import('@/core/bookshelf')
      const book=await bookshelfManager.getBook(this.bookUrl)
      if(book){
        book.durChapterIndex=this.currentPage
        book.durChapterTime=Date.now()
        book.epubProgress=this.currentProgress
        await bookshelfManager.saveBook(book)
        window.dispatchEvent(new Event('sireader:bookshelf-updated'))
      }
    }catch(e){console.error('[Mark] Sync:',e)}
  }
}

export const createMarkManager=(cfg:MarkManagerConfig)=>new MarkManager(cfg)
export type{Mark,MarkManagerConfig,HighlightColor,MarkStyle,MarkType}
