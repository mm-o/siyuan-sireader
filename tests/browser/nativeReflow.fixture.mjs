import fs from 'node:fs'; import path from 'node:path'; import {build} from 'vite'; import vue from '@vitejs/plugin-vue'; import * as m from 'mupdf';
const dir=path.resolve('tmp/native-browser');fs.mkdirSync(dir,{recursive:true});
const stubs={
  '@/core/bookshelf':`export const bookshelfManager={updateProgress:async(...args)=>{window.progress.push(args)}}`,
  '@/core/storage':`export const cloneStorageValue=structuredClone;export const trackPending=p=>p;export const readEmbedPdfProgress=async()=>null;export const readEmbedPdfAnnotations=async key=>{window.readKeys.push(key);return window.records[key]||[]};export const upsertEmbedPdfAnnotation=async(key,item)=>{const a=window.records[key]||=[];const i=a.findIndex(x=>x.annotation.id===item.annotation.id);if(i<0)a.push(item);else a[i]=item;window.writes.push(key)};export const deleteEmbedPdfAnnotation=async(key,id)=>{window.records[key]=(window.records[key]||[]).filter(x=>x.annotation.id!==id);window.writes.push(key)};export const writeEmbedPdfProgress=async()=>{};export const writeManagedFile=async(blob,url)=>{window.generatedFiles[url]=blob;return url};export const createLatestSaver=fn=>{let p;return{schedule:value=>{p=value},flush:async()=>{if(p){const a=p;p=null;await fn(a)}}}}`,
  '@/core/diagnostics':`export const diagnosticLog=(...a)=>{window.diagnostics.push(a)}`,
  '@/core/MarkManager':`export const createTooltip=()=>'';export const showTooltip=(element,x,y)=>Object.assign(element.style,{display:"block",left:x+"px",top:y+"px"})`,
  '@/core/dataMigration':`export const alignLegacyPdfAnnotations=async x=>x;export const needsLegacyPdfTextAlign=()=>false`,
  '@/core/license':`export const LicenseManager={can:()=>true,getLicense:async()=>null}`,
  '@/utils/copy':`export const copyMark=async()=>{};export const inlineLinkText=t=>t;export const sendMarkToDoc=async()=>{}`,
  '@/utils/mobile':`export const isMobile=()=>false`,
  '@/composables/useSetting':`export const PRESET_THEMES=[{id:'light',color:'#222',bg:'#fff'}];export const customFontUrl=file=>'/'+encodeURIComponent(file);export const settingsManager={patch:async()=>{}}`,
  '@/utils/dictionary':`export const openDict=()=>{}`,
  '@/api':`export const forwardProxy=async()=>{};export const putFile=async()=>{};export const removeFile=async()=>{}`,
  'siyuan':`export class Dialog{constructor({content}){this.element=document.createElement("div");this.element.innerHTML=content;document.body.append(this.element)}};export const showMessage=(...args)=>{window.messages.push(args);console.log('MESSAGE',...args)}`,
};
fs.writeFileSync(dir+'/index.html',`<html><body style="margin:0"><div id="app" style="width:min(900px,100vw);height:760px"></div><script type="module" src="/main.ts"></script></body></html>`);
fs.writeFileSync(dir+'/main.ts',`import {createApp,h,ref} from 'vue';import Reader from '../../src/components/EmbedPdfReader.vue';window.generatedFiles={};window.records={'original-record':[{annotation:{id:'legacy-highlight',type:9,pageIndex:0,rect:{origin:{x:42,y:42},size:{width:80,height:12}},contents:'Existing highlight'}}]};window.readKeys=[];window.writes=[];window.progress=[];window.diagnostics=[];window.messages=[];window.ready=[];const instance=ref(0),quickDocs=ref([]);window.setQuickDocs=docs=>quickDocs.value=docs;window.remountReader=()=>instance.value++;createApp({render:()=>h(Reader,{key:instance.value,source:'/source.pdf',bookUrl:'/source.pdf',storageKey:'original-record',settings:{theme:'light',quickSendDocs:quickDocs.value,textSettings:{fontSize:18,fontFamily:'serif'},paragraphSettings:{lineHeight:1.8},pdfAnnotationToolDefaults:{inkHighlighter:{type:15,strokeColor:'#ee8833',strokeWidth:3},lineArrow:{type:4,intent:'LineArrow',strokeColor:'#0088aa',strokeWidth:2,lineEndings:{start:0,end:4}},square:{type:5,color:'transparent',opacity:1,strokeWidth:1,strokeColor:'#FFFFFF',strokeStyle:2,strokeDashArray:[6,2],cloudyBorderIntensity:0}}},i18n:{pdfReflow:'Text reflow'},onReady:(registry,context)=>{window.registry=registry;window.ready.push(context)}})}).mount('#app');`);
const doc=new m.PDFDocument(),font=new m.Font('Helvetica'),res={Font:{F1:doc.addSimpleFont(font,'Latin')}};
for(let n=0;n<3;n++){let content='BT /F1 12 Tf 40 740 Td ';for(let k=0;k<30;k++)content+=(k?'0 -18 Td ':'')+'(Native reader paragraph '+n+' '+k+' continues with readable text.) Tj ';content+=' ET';doc.insertPage(-1,doc.addPage([0,0,600,800],0,res,content))}
const saved=doc.saveToBuffer('');fs.writeFileSync(dir+'/source.pdf',saved.asUint8Array());saved.destroy();doc.deletePage(2);doc.deletePage(1);const single=doc.saveToBuffer('');export const singlePagePdf=Buffer.from(single.asUint8Array());single.destroy();const locked=doc.saveToBuffer('encrypt=aes-256,user-password=fixture,owner-password=fixture-owner');export const lockedPdf=Buffer.from(locked.asUint8Array());locked.destroy();font.destroy();doc.destroy();
await build({configFile:false,root:dir,base:'/',plugins:[{name:'test-services',enforce:'pre',resolveId(id,importer){if(id.startsWith('\0stub:'))return id;if(id in stubs)return '\0stub:'+id;if(id==='./Translate.vue'&&importer?.includes('EmbedPdfReader.vue'))return '\0stub:translate'},load(id){if(id==='\0stub:translate')return 'export default {render:()=>null}';if(id.startsWith('\0stub:'))return stubs[id.slice(6)]}},vue()],resolve:{alias:[...Object.keys(stubs).map(find=>({find,replacement:'\0stub:'+find})),{find:'@',replacement:path.resolve('src')}]},build:{outDir:dir+'/build',emptyOutDir:true,minify:false}});

const cjkDoc = new m.PDFDocument()
const cjkFont = new m.Font('Helvetica')
const cjkText = [...'国标规范测试'].map(char => char.charCodeAt(0).toString(16).padStart(4, '0')).join('')
cjkDoc.insertPage(-1, cjkDoc.addPage([0, 0, 360, 180], 0, { Font: { F1: cjkDoc.addCJKFont(cjkFont, 'zh-Hans') } }, `BT /F1 26 Tf 20 120 Td <${cjkText}> Tj ET`))
const cjkBuffer = cjkDoc.saveToBuffer('')
export const cjkPdf = Buffer.from(cjkBuffer.asUint8Array())
cjkBuffer.destroy()
cjkFont.destroy()
cjkDoc.destroy()
