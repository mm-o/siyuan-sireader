/**
 * PDF 打印
 */
import type{PDFDocumentProxy}from 'pdfjs-dist'

export const printPDF=async(pdf:PDFDocumentProxy,pgs?:number[])=>{
  const w=window.open('','_blank')
  if(!w)return
  w.document.write('<html><head><title>打印</title><style>body{margin:0}img{display:block;page-break-after:always;width:100%}</style></head><body>')
  for(const n of pgs||Array.from({length:pdf.numPages},(_,i)=>i+1)){
    const p=await pdf.getPage(n),vp=p.getViewport({scale:2}),c=document.createElement('canvas')
    c.width=vp.width;c.height=vp.height
    await p.render({canvasContext:c.getContext('2d')!,viewport:vp,canvas:c}).promise
    w.document.write(`<img src="${c.toDataURL()}"/>`)
  }
  w.document.write('</body></html>')
  w.document.close()
  setTimeout(()=>{w.print();w.close()},500)
}