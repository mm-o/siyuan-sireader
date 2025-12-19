/**
 * PDF 搜索 - 后台提取+快速搜索
 */
import type{PDFDocumentProxy}from 'pdfjs-dist'

interface Match{page:number;matchIndex:number}

export class PDFSearch{
  private pdf:PDFDocumentProxy|null=null
  private matches:Match[]=[]
  private current=0
  private query=''
  private pageContents:string[]=[]
  private extracting=false
  
  setPDF(pdf:PDFDocumentProxy){
    this.pdf=pdf
    this.pageContents=[]
    this.extracting=false
  }
  
  async extractAllText():Promise<void>{
    if(!this.pdf||this.extracting)return
    this.extracting=true
    
    for(let i=0;i<this.pdf.numPages;i++){
      try{
        const layer=document.querySelector(`[data-page="${i+1}"] .textLayer`)
        if(layer){
          this.pageContents[i]=Array.from(layer.querySelectorAll('span')).map(s=>s.textContent||'').join('')
        }else{
          const page=await this.pdf.getPage(i+1)
          const content=await page.getTextContent({disableNormalization:true})
          this.pageContents[i]=content.items.map((it:any)=>it.str||'').join('')
        }
      }catch{
        this.pageContents[i]=''
      }
    }
    
    this.extracting=false
  }
  
  async search(q:string):Promise<Match[]>{
    this.clear()
    if(!q.trim()||!this.pdf)return[]
    this.query=q.toLowerCase()
    
    // 等待文本提取完成
    while(this.extracting)await new Promise(r=>setTimeout(r,100))
    
    // 搜索所有页面
    for(let i=0;i<this.pdf.numPages;i++){
      const text=(this.pageContents[i]||'').toLowerCase()
      let pos=0,idx=0
      while((pos=text.indexOf(this.query,pos))!==-1){
        this.matches.push({page:i+1,matchIndex:idx++})
        pos+=this.query.length
      }
    }
    
    this.current=0
    return this.matches
  }

  private highlightCurrent(){
    document.querySelectorAll('.textLayer mark').forEach(el=>{
      const p=el.parentNode
      p&&(p.replaceChild(document.createTextNode(el.textContent||''),el),p.normalize())
    })
    
    if(!this.query||!this.matches.length)return
    
    requestAnimationFrame(()=>{
      const layer=document.querySelector(`[data-page="${this.matches[this.current].page}"] .textLayer`)
      if(!layer)return
      
      layer.querySelectorAll('span').forEach(span=>{
        const text=span.textContent||'',lower=text.toLowerCase()
        let idx=lower.indexOf(this.query)
        if(idx===-1)return
        
        const parts:Array<{text:string,hl:boolean}>=[]
        let last=0
        while(idx!==-1){
          idx>last&&parts.push({text:text.substring(last,idx),hl:false})
          parts.push({text:text.substring(idx,idx+this.query.length),hl:true})
          last=idx+this.query.length
          idx=lower.indexOf(this.query,last)
        }
        last<text.length&&parts.push({text:text.substring(last),hl:false})
        
        span.textContent=''
        parts.forEach(p=>{
          if(p.hl){
            const m=document.createElement('mark')
            m.className='pdf-search-hl'
            m.textContent=p.text
            span.appendChild(m)
          }else span.appendChild(document.createTextNode(p.text))
        })
      })
    })
  }
  
  next(){
    if(!this.matches.length)return null
    this.current=(this.current+1)%this.matches.length
    this.highlightCurrent()
    return this.matches[this.current]
  }
  
  prev(){
    if(!this.matches.length)return null
    this.current=(this.current-1+this.matches.length)%this.matches.length
    this.highlightCurrent()
    return this.matches[this.current]
  }
  
  getCurrent=()=>this.matches[this.current]
  getCurrentIndex=()=>this.current
  getResults=()=>this.matches
  clear(){
    document.querySelectorAll('.textLayer mark').forEach(el=>{
      const p=el.parentNode
      p&&(p.replaceChild(document.createTextNode(el.textContent||''),el),p.normalize())
    })
    this.matches=[]
    this.current=0
    this.query=''
  }
}
 