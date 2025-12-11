/**
 * 统一标记系统 - 书签、标注、笔记、词汇
 */

import type { Plugin } from 'siyuan'
import type { FoliateView, HighlightColor } from './types'
import { Overlayer } from 'foliate-js/overlayer.js'

export interface Mark {
  id: string
  type: 'bookmark' | 'highlight' | 'note' | 'vocab'
  cfi?: string
  section?: number
  page?: number
  text?: string
  color?: HighlightColor
  style?: 'highlight' | 'underline' | 'outline' | 'squiggly'
  note?: string
  title?: string
  timestamp: number
  progress?: number
  chapter?: string
}

export const COLORS = [
  { name: '黄色', color: 'yellow' as const, bg: '#ffeb3b' },
  { name: '红色', color: 'red' as const, bg: '#ef5350' },
  { name: '绿色', color: 'green' as const, bg: '#66bb6a' },
  { name: '蓝色', color: 'blue' as const, bg: '#42a5f5' },
  { name: '紫色', color: 'purple' as const, bg: '#ab47bc' },
  { name: '橙色', color: 'orange' as const, bg: '#ff9800' },
  { name: '粉色', color: 'pink' as const, bg: '#ec407a' },
]

const getHash=(url:string)=>{let h=0;for(let i=0;i<url.length;i++)h=((h<<5)-h+url.charCodeAt(i))|0;return Math.abs(h).toString(36)}
const sanitizeName=(n:string|undefined|null)=>(n||'book').replace(/[<>:"/\\|?*\x00-\x1f《》【】「」『』（）()[\]{}]/g,'').replace(/\s+/g,'_').replace(/[._-]+/g,'_').replace(/^[._-]+|[._-]+$/g,'').slice(0,50)||'book'
const getFileName=(n:string|undefined|null,h:string)=>`${sanitizeName(n)}_${h}.json`

export class MarkManager {
  private view: FoliateView
  private bookUrl: string
  private plugin: Plugin
  private marks: Mark[] = []
  private marksByCfi = new Map<string, Mark>()
  private bookName: string
  private saveTimer: any = null
  private progressData: any = null
  private deckUpdateHandler = () => this.loadDeckAnnotations()

  constructor(view: FoliateView, bookUrl: string, plugin: Plugin) {
    this.view = view
    this.bookUrl = bookUrl
    this.plugin = plugin
    this.bookName = bookUrl?.split('/').pop()?.split('.')[0] || 'book'
    this.setupListeners()
  }

  async init() {
    await this.load()
    await this.loadCalibre()
    await this.loadDeckAnnotations()
    window.addEventListener('sireader:deck-updated', this.deckUpdateHandler)
  }

  private async load(){
    try{
      const{bookshelfManager}=await import('@/core/bookshelf')
      const book=await bookshelfManager.getBook(this.bookUrl)
      if(book?.name)this.bookName=book.name
      const data=await this.plugin.loadData(`books/${getFileName(this.bookName,getHash(this.bookUrl))}`)
      if(!data)return
      
      this.marks=[]
      const mapBookmark=(b:any):Mark=>({id:`bookmark-${b.time}`,type:'bookmark',cfi:b.cfi,section:b.section,page:b.page,title:b.title,timestamp:b.time,progress:b.progress,chapter:b.title})
      const mapAnnotation=(a:any):Mark=>({id:`${a.note?'note':'highlight'}-${a.timestamp||Date.now()}`,type:a.note?'note':'highlight',cfi:a.value||a.cfi,section:a.section,page:a.page,text:a.text,color:a.color,style:a.style||'highlight',note:a.note,timestamp:a.timestamp||Date.now(),chapter:a.chapter})
      
      const bookmarkKeys=new Set<string>()
      const addBookmarks=(list:any[])=>{
        for(const b of list||[]){
          const key=b.cfi||`section-${b.section}`
          if(!bookmarkKeys.has(key)){this.marks.push(mapBookmark(b));bookmarkKeys.add(key)}
        }
      }
      addBookmarks(data.epubBookmarks)
      addBookmarks(data.txtBookmarks)
      if(data.annotations)this.marks.push(...data.annotations.map(mapAnnotation))
      this.rebuildIndex()
    }catch(e){console.error('[Mark] Load:',e)}
  }

  private save(){clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.saveNow(),300)}
  
  private async saveNow(){
    try{
      if(!this.bookName)return
      const fileName=getFileName(this.bookName,getHash(this.bookUrl))
      const data=await this.plugin.loadData(`books/${fileName}`)||{}
      if(this.progressData)Object.assign(data,this.progressData)
      
      const bookmarks=this.marks.filter(m=>m.type==='bookmark')
      Object.assign(data,{
        epubBookmarks:bookmarks.filter(m=>m.cfi).map(m=>({cfi:m.cfi,title:m.title||'',progress:m.progress||0,time:m.timestamp})),
        txtBookmarks:bookmarks.filter(m=>!m.cfi&&m.section!==undefined).map(m=>({section:m.section,page:m.page,title:m.title||'',progress:m.progress||0,time:m.timestamp})),
        annotations:this.marks.filter(m=>m.type==='highlight'||m.type==='note').map(m=>({value:m.cfi,cfi:m.cfi,section:m.section,page:m.page,color:m.color,style:m.style,text:m.text,note:m.note,timestamp:m.timestamp,chapter:m.chapter})),
        chapters:[]
      })
      
      await this.plugin.saveData(`books/${fileName}`,data)
      
      if(this.progressData?.epubProgress!==undefined||this.progressData?.durChapterTime){
        const{bookshelfManager}=await import('@/core/bookshelf')
        const books=bookshelfManager.getBooks()
        const idx=books.findIndex(b=>b.bookUrl===this.bookUrl)
        if(idx>=0){
          if(this.progressData.epubProgress!==undefined)books[idx].epubProgress=this.progressData.epubProgress
          if(this.progressData.durChapterTime)books[idx].durChapterTime=this.progressData.durChapterTime
          await bookshelfManager.sortBooks('time')
        }
      }
      this.progressData=null
    }catch(e){console.error('[Mark] Save:',e)}
  }
  
  saveProgress(loc:any){
    if(!loc)return
    if(loc.cfi)this.progressData={epubCfi:loc.cfi,epubProgress:Math.round((loc.fraction||0)*100),durChapterTime:Date.now()}
    else if(loc.section!==undefined){
      const total=(this.view as any).book?.sections?.length||1
      this.progressData={durChapterIndex:loc.section,durChapterPos:0,durChapterTime:Date.now(),durChapterTitle:loc.label||loc.tocItem?.label,epubProgress:Math.round(((loc.section+1)/total)*100)}
    }
    this.save()
  }

  private rebuildIndex(){this.marksByCfi.clear();this.marks.forEach(m=>this.marksByCfi.set(m.cfi||`section-${m.section}`,m))}

  async loadDeckAnnotations(){
    try{
      const{loadDeckCards}=await import('@/core/dictionary')
      const deckCards=(await loadDeckCards()).filter(c=>c.bookUrl===this.bookUrl)
      
      this.marks.filter(m=>m.type==='vocab').forEach(v=>{
        this.deleteMark_(v.cfi||`section-${v.section}`)
        if(v.cfi)this.view.deleteAnnotation({value:v.cfi}).catch(()=>{})
      })
      
      this.cleanupVocabMarkers()
      
      for(const card of deckCards){
        if(!card.cfi&&card.section===undefined)continue
        const note=`${card.word}\n${card.data.phonetic?`/${card.data.phonetic}/`:''}\n${card.data.meanings?.map((m:any)=>`${m.pos} ${m.text}`).join('\n')||card.data.defs?.slice(0,3).join('\n')||''}`
        const mark=this.addMark({type:'vocab',cfi:card.cfi,section:card.section,text:card.word,note:note.trim(),color:'purple',style:'highlight',timestamp:card.timestamp})
        if(mark.cfi)await this.view.addAnnotation({value:mark.cfi,color:'purple',note:mark.note}).catch(()=>{})
      }
      
      if(deckCards.some(c=>c.section!==undefined))this.refreshTxtAnnotations()
      window.dispatchEvent(new Event('sireader:marks-updated'))
    }catch(e){console.error('[Mark] Load deck:',e)}
  }
  
  private cleanupVocabMarkers(){
    try{
      const contents=(this.view as any).renderer?.getContents?.()
      if(!contents)return
      for(const{doc}of contents){
        if(!doc)continue
        doc.querySelectorAll('[data-note-marker]').forEach((m:Element)=>{if(m.textContent==='🌐')m.remove()})
        window.document.querySelectorAll('[data-note-tooltip]').forEach((t:Element)=>{if(t.textContent?.includes('词典'))t.remove()})
      }
    }catch(e){console.error('[Mark] Cleanup:',e)}
  }

  private async loadCalibre(){
    try{
      const calibre=await this.view.book?.getCalibreBookmarks?.()
      if(!calibre)return
      let count=0
      for(const obj of calibre){
        if(obj.type==='bookmark'&&obj.start_cfi&&!this.marksByCfi.has(obj.start_cfi)){
          this.addMark({type:'bookmark',cfi:obj.start_cfi,title:obj.title||obj.notes||'书签'})
          count++
        }else if(obj.type==='highlight'){
          const{fromCalibreHighlight}=await import('foliate-js/epubcfi.js')as any
          const cfi=fromCalibreHighlight(obj)
          if(!this.marksByCfi.has(cfi)){
            this.addMark({type:obj.notes?'note':'highlight',cfi,color:(obj.style?.which||'yellow')as HighlightColor,note:obj.notes})
            count++
          }
        }
      }
      if(count)this.save()
    }catch(e){console.error('[Mark] Calibre:',e)}
  }

  private setupListeners(){
    this.view.addEventListener('create-overlay',((e:CustomEvent)=>{
      const{index}=e.detail
      this.marks.forEach(m=>{
        if(m.type!=='bookmark'&&m.cfi)try{if(this.view.resolveCFI(m.cfi).index===index)this.view.addAnnotation({value:m.cfi,color:m.color,note:m.note}).catch(()=>{})}catch{}
      })
    })as EventListener)

    this.view.addEventListener('draw-annotation',((e:CustomEvent)=>{
      const{draw,annotation,range}=e.detail
      const mark=this.marksByCfi.get(annotation.value)
      const color=COLORS.find(c=>c.color===(mark?.color||annotation.color||'yellow'))?.bg||'#ffeb3b'
      const style=mark?.style||'highlight'
      const styles={underline:[Overlayer.underline,{color,width:2}],outline:[Overlayer.outline,{color,width:3}],squiggly:[Overlayer.squiggly,{color,width:2}],highlight:[Overlayer.highlight,{color}]}
      const[fn,opts]=styles[style]||styles.highlight
      draw(fn,opts)
      if(mark?.note&&range)this.renderNoteMarker(range,mark.note,mark.color)
    })as EventListener)
  }

  private addMark(partial:Partial<Mark>):Mark{
    const mark:Mark={id:`${partial.type}-${Date.now()}`,type:partial.type!,timestamp:partial.timestamp||Date.now(),...partial}as Mark
    this.marks.push(mark)
    this.marksByCfi.set(mark.cfi||`section-${mark.section}`,mark)
    return mark
  }
  private deleteMark_(key:string):boolean{
    const idx=this.marks.findIndex(m=>(m.cfi||`section-${m.section}`)===key)
    if(idx<0)return false
    this.marks.splice(idx,1)
    this.marksByCfi.delete(key)
    return true
  }

  addBookmark(cfi?:string,section?:number,title?:string):Mark{
    const loc=(this.view as any).getLocation?.()||this.view.lastLocation
    if(!loc||(!loc.cfi&&loc.section===undefined))throw new Error('无法获取位置')
    const useCfi=cfi||loc.cfi
    const useSection=useCfi?undefined:(section??loc.section)
    const key=useCfi||`section-${useSection}`
    if(this.marksByCfi.has(key))throw new Error('该位置已有书签')
    const mark=this.addMark({type:'bookmark',cfi:useCfi,section:useSection,title:title||loc.tocItem?.label||loc.label||`第${(useSection||0)+1}章`,progress:Math.round((loc.fraction||0)*100)})
    this.save()
    window.dispatchEvent(new Event('sireader:marks-updated'))
    return mark
  }
  deleteBookmark(key:string):boolean{if(!this.deleteMark_(key))return false;this.save();window.dispatchEvent(new Event('sireader:marks-updated'));return true}
  toggleBookmark(cfi?:string,section?:number,title?:string):boolean{
    const loc=(this.view as any).getLocation?.()||this.view.lastLocation
    if(!loc)return false
    const key=(cfi||loc.cfi)||`section-${(section??(loc.section||0))}`
    if(this.marks.find(m=>m.type==='bookmark'&&(m.cfi||`section-${m.section}`)===key)){this.deleteBookmark(key);return false}
    this.addBookmark(cfi,section,title)
    return true
  }
  hasBookmark(cfi?:string,section?:number):boolean{
    const loc=(this.view as any).getLocation?.()||this.view.lastLocation
    const key=(cfi||loc?.cfi)||`section-${(section??(loc?.section||0))}`
    return this.marks.some(m=>m.type==='bookmark'&&(m.cfi||`section-${m.section}`)===key)
  }
  getBookmarks():Mark[]{return this.marks.filter(m=>m.type==='bookmark').sort((a,b)=>(a.progress||0)-(b.progress||0))}

  private async saveAndRefresh(mark:Mark,action:'add'|'update'|'delete',key?:string){
    this.save()
    if(mark.cfi){
      if(action==='delete')await this.view.deleteAnnotation({value:key||mark.cfi})
      else if(action==='update'){await this.view.deleteAnnotation({value:key!});await this.view.addAnnotation({value:key!,color:mark.color,note:mark.note})}
      else await this.view.addAnnotation({value:mark.cfi,color:mark.color,note:mark.note})
    }else if(mark.section!==undefined)this.refreshTxtAnnotations()
    window.dispatchEvent(new Event('sireader:marks-updated'))
  }

  async addHighlight(cfi:string,text:string,color:HighlightColor,style?:Mark['style']):Promise<Mark>
  async addHighlight(section:number,text:string,color:HighlightColor,style?:Mark['style']):Promise<Mark>
  async addHighlight(cfiOrSection:string|number,text:string,color:HighlightColor,style:Mark['style']='highlight'):Promise<Mark>{
    const mark=this.addMark({type:'highlight',[typeof cfiOrSection==='string'?'cfi':'section']:cfiOrSection,text:text?.substring(0,200),color,style})
    await this.saveAndRefresh(mark,'add')
    return mark
  }
  async addNote(cfi:string,note:string,text:string,color?:HighlightColor,style?:Mark['style']):Promise<Mark>
  async addNote(section:number,note:string,text:string,color?:HighlightColor,style?:Mark['style']):Promise<Mark>
  async addNote(cfiOrSection:string|number,note:string,text:string,color:HighlightColor='blue',style:Mark['style']='outline'):Promise<Mark>{
    const mark=this.addMark({type:'note',[typeof cfiOrSection==='string'?'cfi':'section']:cfiOrSection,text:text?.substring(0,200),note,color,style})
    await this.saveAndRefresh(mark,'add')
    return mark
  }
  async updateMark(key:string,updates:Partial<Mark>):Promise<boolean>{
    const mark=this.marksByCfi.get(key)
    if(!mark)return false
    Object.assign(mark,updates)
    await this.saveAndRefresh(mark,'update',key)
    return true
  }
  async deleteMark(key:string):Promise<boolean>{
    const mark=this.marksByCfi.get(key)
    if(!this.deleteMark_(key))return false
    if(mark)await this.saveAndRefresh(mark,'delete',key)
    return true
  }
  getAnnotations(color?:HighlightColor):Mark[]{const m=this.marks.filter(m=>m.type==='highlight'||m.type==='note');return color?m.filter(m=>m.color===color):m}
  getNotes():Mark[]{return this.marks.filter(m=>m.type==='note')}
  getVocabulary():Mark[]{return this.marks.filter(m=>m.type==='vocab').sort((a,b)=>b.timestamp-a.timestamp)}

  renderNoteMarker(range:Range,note:string,color?:HighlightColor){
    try{
      const doc=range.startContainer.ownerDocument
      if(!doc)return
      
      const container=range.commonAncestorContainer
      const parent=container.nodeType===3?container.parentElement:container as HTMLElement
      parent?.querySelectorAll('[data-note-marker]').forEach(m=>m.remove())
      
      const isPurple=color==='purple',icon=isPurple?'🌐':'📒',themeColor=isPurple?'#ab47bc':'#2196f3'
      const marker=doc.createElement('span')
      marker.setAttribute('data-note-marker','true')
      marker.textContent=icon
      marker.style.cssText='position:relative;top:-0.5em;font-size:1.1em;margin-left:3px;cursor:pointer;user-select:none;opacity:0.85;transition:opacity .2s'
      
      const mainDoc=window.document,tooltip=mainDoc.createElement('div')
      tooltip.setAttribute('data-note-tooltip','true')
      const cleanNote=note.split('\n').map(l=>l.trim()).filter(Boolean).join('\n')
      tooltip.innerHTML=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,.1)"><span style="font-size:18px">${icon}</span><span style="font-size:12px;font-weight:600;color:${themeColor};text-transform:uppercase;letter-spacing:.5px">${isPurple?'词典':'笔记'}</span></div><div style="font-size:14px;line-height:1.8;color:#333;white-space:pre-wrap;max-height:300px;overflow-y:auto">${cleanNote}</div>`
      tooltip.style.cssText='position:fixed;display:none;min-width:280px;max-width:420px;padding:16px;background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.12);z-index:99999;pointer-events:none;word-wrap:break-word'
      
      if(!mainDoc.getElementById('foliate-tooltip-style')){const s=mainDoc.createElement('style');s.id='foliate-tooltip-style';s.textContent='@keyframes tooltipFadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}';mainDoc.head.appendChild(s)}
      mainDoc.body.appendChild(tooltip)
      
      marker.onmouseenter=()=>{
        marker.style.opacity='1'
        const r=marker.getBoundingClientRect(),iframe=doc.defaultView?.frameElement as HTMLIFrameElement,ir=iframe?.getBoundingClientRect(),left=(ir?.left||0)+r.left,top=(ir?.top||0)+r.bottom+5
        tooltip.style.display='block';tooltip.style.left=left+'px';tooltip.style.top=top+'px'
        requestAnimationFrame(()=>{const tr=tooltip.getBoundingClientRect();if(tr.right>window.innerWidth)tooltip.style.left=(window.innerWidth-tr.width-10)+'px';if(tr.bottom>window.innerHeight)tooltip.style.top=(top-tr.height-r.height-10)+'px'})
      }
      marker.onmouseleave=()=>{marker.style.opacity='0.85';tooltip.style.display='none'}
      marker.addEventListener('DOMNodeRemoved',()=>tooltip.remove())
      
      const ec=range.endContainer,eo=range.endOffset
      if(ec.nodeType===3){const tn=ec as Text;eo===tn.length?tn.parentNode?.insertBefore(marker,tn.nextSibling):tn.parentNode?.insertBefore(marker,tn.splitText(eo))}
      else{const nn=ec.childNodes[eo];nn?ec.insertBefore(marker,nn):ec.appendChild(marker)}
    }catch(e){console.error('[Mark] Render:',e)}
  }

  private applyMarkStyle(el:HTMLElement,color:string,style:Mark['style']='highlight'){
    const styles={highlight:()=>el.style.backgroundColor=color,underline:()=>Object.assign(el.style,{borderBottom:`2px solid ${color}`,paddingBottom:'2px'}),outline:()=>Object.assign(el.style,{border:`2px solid ${color}`,padding:'0 2px',borderRadius:'2px'}),squiggly:()=>Object.assign(el.style,{textDecoration:'underline wavy',textDecorationColor:color,textDecorationThickness:'2px',textUnderlineOffset:'2px'})}
    ;(styles[style]||styles.highlight)()
  }

  renderTxtAnnotations(doc:Document,section:number,force=false){
    if(!force&&(doc as any).__txtMarksRendered)return
    doc.querySelectorAll('[data-txt-mark],[data-note-marker],[data-note-tooltip]').forEach(el=>{
      if(el.hasAttribute('data-txt-mark')){const p=el.parentNode;while(el.firstChild)p?.insertBefore(el.firstChild,el)}
      el.remove()
    })
    this.marks.forEach(m=>{if(m.section===section&&m.type!=='bookmark')this.renderSingleMark(doc,m)})
    ;(doc as any).__txtMarksRendered=true
  }

  private renderSingleMark(doc:Document,mark:Mark){
    try{
      const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT)
      let node:Node|null
      while((node=walker.nextNode())){
        const text=node.textContent||''
        const idx=text.indexOf(mark.text||'')
        if(idx!==-1&&text.length>10){
          const range=doc.createRange()
          range.setStart(node,idx)
          range.setEnd(node,idx+(mark.text?.length||0))
          const span=doc.createElement('span')
          span.setAttribute('data-txt-mark','true')
          
          const color=COLORS.find(c=>c.color===(mark.color||'yellow'))?.bg||'#ffeb3b'
          this.applyMarkStyle(span,color,mark.style)
          span.style.cursor='pointer'
          span.onclick=()=>{
            const rect=span.getBoundingClientRect()
            const iframe=doc.defaultView?.frameElement as HTMLIFrameElement
            const ir=iframe?.getBoundingClientRect()
            window.dispatchEvent(new CustomEvent('txt-annotation-click',{detail:{mark,x:(ir?.left||0)+rect.left+rect.width/2,y:(ir?.top||0)+rect.top+rect.height}}))
          }
          
          range.surroundContents(span)
          if(mark.note){const m=doc.createElement('span');m.setAttribute('data-note-marker','true');m.textContent=mark.color==='purple'?'🌐':'📒';m.style.cssText='position:relative;top:-0.5em;font-size:1.1em;margin-left:3px;cursor:pointer;user-select:none;opacity:0.85';m.title=mark.note;span.parentNode?.insertBefore(m,span.nextSibling)}
          break
        }
      }
    }catch(e){console.error('[Mark] Render:',e)}
  }

  private refreshTxtAnnotations(section?:number){
    const contents=(this.view as any).renderer?.getContents?.()
    if(!contents)return
    const targetSection=section??((this.view as any).lastLocation?.section||0)
    contents.forEach(({doc})=>{if(doc){(doc as any).__txtMarksRendered=false;this.renderTxtAnnotations(doc,targetSection,true)}})
  }

  bindTxtDocEvents(doc:Document,section:number){
    if((doc as any).__txtEventsBound)return
    doc.addEventListener('mouseup',()=>window.dispatchEvent(new CustomEvent('txt-selection',{detail:{doc}})))
    this.renderTxtAnnotations(doc,section)
    ;(doc as any).__txtEventsBound=true
  }

  getAll():Mark[]{return[...this.marks]}
  getByType(type:Mark['type']):Mark[]{return this.marks.filter(m=>m.type===type)}
  async goTo(mark:Mark){await this.view.goTo(mark.cfi||mark.section!)}
  exportJSON():string{return JSON.stringify(this.marks,null,2)}
  async importJSON(json:string):Promise<number>{
    try{
      const imported:Mark[]=JSON.parse(json)
      let count=0
      imported.forEach(m=>{if(!this.marksByCfi.has(m.cfi)){this.marks.push(m);this.marksByCfi.set(m.cfi,m);count++}})
      if(count)this.save()
      return count
    }catch(e){console.error('[Mark] Import:',e);return 0}
  }
  async destroy(){
    clearTimeout(this.saveTimer)
    window.removeEventListener('sireader:deck-updated',this.deckUpdateHandler)
    await this.saveNow()
    this.marks=[]
    this.marksByCfi.clear()
  }
}
