/**
 * PDF 搜索 - 带缓存优化
 */
import type{PDFDocumentProxy}from 'pdfjs-dist'

interface Match{page:number;index:number}

export class PDFSearch{
  private pdf:PDFDocumentProxy|null=null
  private matches:Match[]=[]
  private current=-1
  private query=''
  private pageMatches:Map<number,number[]>=new Map()
  private pageContents:Map<number,string>=new Map() // 缓存页面文本
  private extractPromises:Map<number,Promise<string>>=new Map() // 提取Promise
  
  setPDF(pdf:PDFDocumentProxy){
    this.pdf=pdf
    this.pageMatches.clear()
    // 保留缓存，不清除 pageContents
  }
  
  async extractAllText():Promise<void>{
    // 后台预提取所有文本（可选）
    if(!this.pdf)return
    for(let i=1;i<=this.pdf.numPages;i++){
      this.getPageText(i) // 触发提取但不等待
    }
  }
  
  private async getPageText(pageNum:number):Promise<string>{
    // 如果已缓存，直接返回
    if(this.pageContents.has(pageNum)){
      return this.pageContents.get(pageNum)!
    }
    
    // 如果正在提取，返回现有Promise
    if(this.extractPromises.has(pageNum)){
      return this.extractPromises.get(pageNum)!
    }
    
    // 开始提取
    const promise=(async()=>{
      try{
        // 优先从已渲染的文本层获取
        const layer=document.querySelector(`[data-page="${pageNum}"] .textLayer`)
        if(layer){
          const spans=layer.querySelectorAll('span')
          if(spans.length>0){
            const text=Array.from(spans).map(s=>s.textContent||'').join('')
            this.pageContents.set(pageNum,text)
            return text
          }
        }
        
        // 从 PDF 获取
        if(!this.pdf)return''
        const page=await this.pdf.getPage(pageNum)
        const textContent=await page.getTextContent()
        const text=textContent.items.map((it:any)=>it.str||'').join('')
        this.pageContents.set(pageNum,text)
        return text
      }catch(e){
        console.error(`提取页面 ${pageNum} 文本失败:`,e)
        return''
      }finally{
        this.extractPromises.delete(pageNum)
      }
    })()
    
    this.extractPromises.set(pageNum,promise)
    return promise
  }
  
  async search(q:string):Promise<Match[]>{
    console.time('[PDF搜索] 总耗时')
    this.clear()
    if(!q.trim()||!this.pdf)return[]
    this.query=q.toLowerCase()
    console.log('[PDF搜索] 开始搜索:', this.query, '页数:', this.pdf.numPages)
    
    // 快速搜索所有页面
    console.time('[PDF搜索] 搜索所有页面')
    const tasks=[]
    for(let i=1;i<=this.pdf.numPages;i++){
      tasks.push(this.searchPage(i))
    }
    await Promise.all(tasks)
    console.timeEnd('[PDF搜索] 搜索所有页面')
    
    // 构建匹配列表
    this.matches=[]
    for(let i=1;i<=this.pdf.numPages;i++){
      const indices=this.pageMatches.get(i)||[]
      indices.forEach(idx=>this.matches.push({page:i,index:idx}))
    }
    
    console.log('[PDF搜索] 找到匹配:', this.matches.length)
    
    if(this.matches.length>0){
      this.current=0
      await this.highlightPage(this.matches[0].page)
      this.scrollToMatch(this.matches[0])
    }
    
    console.timeEnd('[PDF搜索] 总耗时')
    return this.matches
  }

  private async searchPage(pageNum:number){
    try{
      const text=(await this.getPageText(pageNum)).toLowerCase()
      
      const indices:number[]=[]
      let pos=0
      while((pos=text.indexOf(this.query,pos))!==-1){
        indices.push(pos)
        pos+=this.query.length
      }
      
      if(indices.length>0)this.pageMatches.set(pageNum,indices)
    }catch(e){
      console.error(`搜索页面 ${pageNum} 失败:`,e)
    }
  }

  private async highlightPage(pageNum:number){
    // 清除所有高亮
    document.querySelectorAll('.textLayer mark').forEach(el=>el.replaceWith(...el.childNodes))
    
    if(!this.query)return
    
    const layer=document.querySelector(`[data-page="${pageNum}"] .textLayer`)
    if(!layer)return
    
    // 获取整个文本层的文本
    const spans=Array.from(layer.querySelectorAll('span'))
    const fullText=(await this.getPageText(pageNum)).toLowerCase()
    
    // 找到所有匹配位置
    const matches:number[]=[]
    let pos=0
    while((pos=fullText.indexOf(this.query,pos))!==-1){
      matches.push(pos)
      pos+=this.query.length
    }
    
    if(matches.length===0)return
    
    // 计算每个 span 的起始位置
    const spanPositions:Array<{span:HTMLElement;start:number;end:number}>=[]
    let currentPos=0
    spans.forEach(span=>{
      const text=span.textContent||''
      spanPositions.push({span,start:currentPos,end:currentPos+text.length})
      currentPos+=text.length
    })
    
    // 高亮每个匹配
    matches.forEach(matchPos=>{
      const matchEnd=matchPos+this.query.length
      
      spanPositions.forEach(({span,start,end})=>{
        if(matchEnd<=start||matchPos>=end)return
        
        const text=span.textContent||''
        const relStart=Math.max(0,matchPos-start)
        const relEnd=Math.min(text.length,matchEnd-start)
        
        if(relStart>=relEnd)return
        
        const frag=document.createDocumentFragment()
        if(relStart>0)frag.appendChild(document.createTextNode(text.substring(0,relStart)))
        
        const mark=document.createElement('mark')
        mark.className='pdf-search-hl'
        mark.textContent=text.substring(relStart,relEnd)
        frag.appendChild(mark)
        
        if(relEnd<text.length)frag.appendChild(document.createTextNode(text.substring(relEnd)))
        
        span.textContent=''
        span.appendChild(frag)
      })
    })
    
    this.highlightCurrent()
  }

  private highlightCurrent(){
    document.querySelectorAll('.pdf-search-hl').forEach(el=>el.classList.remove('pdf-search-current'))
    
    if(this.current<0||this.current>=this.matches.length)return
    
    const match=this.matches[this.current]
    const layer=document.querySelector(`[data-page="${match.page}"] .textLayer`)
    if(!layer)return
    
    const marks=layer.querySelectorAll('mark.pdf-search-hl')
    const pageIndices=this.pageMatches.get(match.page)||[]
    const localIdx=pageIndices.indexOf(match.index)
    
    if(localIdx>=0&&localIdx<marks.length){
      marks[localIdx].classList.add('pdf-search-current')
    }
  }

  private scrollToMatch(match:Match){
    const pageEl=document.querySelector(`[data-page="${match.page}"]`)as HTMLElement
    if(!pageEl)return
    pageEl.scrollIntoView({behavior:'smooth',block:'center'})
  }
  
  next(){
    if(!this.matches.length)return null
    
    const oldPage=this.current>=0?this.matches[this.current].page:0
    this.current=(this.current+1)%this.matches.length
    const newMatch=this.matches[this.current]
    
    if(oldPage!==newMatch.page)this.highlightPage(newMatch.page)
    else this.highlightCurrent()
    
    this.scrollToMatch(newMatch)
    return newMatch
  }
  
  prev(){
    if(!this.matches.length)return null
    
    const oldPage=this.current>=0?this.matches[this.current].page:0
    this.current=(this.current-1+this.matches.length)%this.matches.length
    const newMatch=this.matches[this.current]
    
    if(oldPage!==newMatch.page)this.highlightPage(newMatch.page)
    else this.highlightCurrent()
    
    this.scrollToMatch(newMatch)
    return newMatch
  }
  
  getCurrent=()=>this.current>=0?this.matches[this.current]:null
  getCurrentIndex=()=>this.current
  getResults=()=>this.matches
  
  clear(){
    document.querySelectorAll('.textLayer mark').forEach(el=>el.replaceWith(...el.childNodes))
    this.matches=[]
    this.current=-1
    this.query=''
    this.pageMatches.clear()
    // 不清除 pageContents 缓存
  }
}