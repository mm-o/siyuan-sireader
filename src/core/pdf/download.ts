/**
 * PDF 下载
 */
export const downloadPDF=(src:ArrayBuffer,name='document.pdf')=>{
  const url=URL.createObjectURL(new Blob([src],{type:'application/pdf'})),a=document.createElement('a')
  a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)
}

export const exportAsImages=async(pdf:any,fmt:'png'|'jpeg'='png')=>{
  const zip=await import('jszip').then(m=>new m.default())
  for(let i=1;i<=pdf.numPages;i++){
    const p=await pdf.getPage(i),vp=p.getViewport({scale:2}),c=document.createElement('canvas')
    c.width=vp.width;c.height=vp.height
    await p.render({canvasContext:c.getContext('2d')!,viewport:vp,canvas:c}).promise
    zip.file(`page-${i}.${fmt}`,await new Promise<Blob>(r=>c.toBlob(b=>r(b!),`image/${fmt}`)))
  }
  const url=URL.createObjectURL(await zip.generateAsync({type:'blob'})),a=document.createElement('a')
  a.href=url;a.download='pdf-images.zip';a.click();URL.revokeObjectURL(url)
}
