/**
 * PDF 元数据
 */
import type{PDFDocumentProxy}from 'pdfjs-dist'

export interface PDFMetadata{
  title?:string;author?:string;subject?:string;keywords?:string;creator?:string;producer?:string
  creationDate?:Date;modificationDate?:Date;pageCount:number;fileSize?:number;pdfVersion?:string
}

export const getMetadata=async(pdf:PDFDocumentProxy,size?:number):Promise<PDFMetadata>=>{
  const m=await pdf.getMetadata(),i=m.info as any
  return{
    title:i.Title||'',author:i.Author||'',subject:i.Subject||'',keywords:i.Keywords||'',
    creator:i.Creator||'',producer:i.Producer||'',
    creationDate:i.CreationDate?new Date(i.CreationDate):undefined,
    modificationDate:i.ModDate?new Date(i.ModDate):undefined,
    pageCount:pdf.numPages,fileSize:size,pdfVersion:i.PDFFormatVersion
  }
}
