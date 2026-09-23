<template>
  <Transition name="fade">
    <div v-if="visible" ref="popupRef" :class="['popup',{expanded:showDetail}]">
      <!-- 简洁视图 -->
      <template v-if="!showDetail">
        <div class="popup-title">📊 今日阅读</div>
        <div class="popup-item">本次: <span>{{fmt(sessionTime)}}</span></div>
        <div class="popup-item">今日: <span>{{fmt(todayTime)}}</span></div>
        <div class="popup-item">累计: <span>{{fmt(totalTime)}}</span></div>
        <div class="popup-divider"></div>
        <button class="popup-btn" @click.stop="handleViewDetail">查看详情 →</button>
      </template>

      <!-- 详细视图 -->
      <template v-else>
        <div class="panel-body">
          <!-- 头部 -->
          <div class="header">
            <!-- 每日一句 -->
            <div class="quote-section">
              <div class="quote-text" :style="{opacity:quoteVisible?1:0}">{{quote.content}}</div>
              <div class="quote-note" :style="{opacity:quoteVisible?1:0}">{{quote.note}}</div>
            </div>
            <!-- 统计数据 -->
            <div class="stats-row">
              <div class="header-item" v-for="h in headers" :key="h.label">
                <span class="label">{{h.label}}</span>
                <span class="value">{{h.value}}<span class="unit">{{h.unit}}</span></span>
              </div>
            </div>
          </div>

          <!-- 日历 -->
          <div class="card">
            <div class="head">
              <div class="title">📆 阅读日历</div>
              <div class="cal-ctrl">
                <button class="cal-btn" @click="navPeriod(-1)">‹</button>
                <button class="cal-btn view" @click="switchView">
                  {{calView==='year'?curYear+'年':curYear+'年'+curMonth+'月'}}
                </button>
                <button class="cal-btn" @click="navPeriod(1)">›</button>
              </div>
            </div>
            <div v-if="calView==='year'" class="calendar">
              <div v-for="m in 12" :key="m" class="month">
                <div class="month-label">{{m}}月</div>
                <div class="month-grid">
                  <i v-for="d in getDays(m)" :key="d.day" :data-level="d.level" 
                     :title="d.tooltip"></i>
                </div>
              </div>
            </div>
            <div v-else class="cal-month">
              <div class="month-grid-lg">
                <i v-for="d in getDays(curMonth)" :key="d.day" :data-level="d.level"
                   :title="d.tooltip">
                  <span>{{d.day}}</span>
                </i>
              </div>
            </div>
          </div>

          <!-- 书籍分布 -->
          <div class="card">
            <div class="head">
              <div class="title">📚 书籍分布</div>
              <div class="subtitle">共 {{totalBooks}} 本</div>
            </div>
            <div class="rings">
              <svg viewBox="0 0 200 200">
                <path v-for="(s,i) in pie" :key="i" :d="s.path" :fill="s.color" stroke="var(--b3-theme-background)" stroke-width="2"/>
              </svg>
              <div class="legend">
                <div v-for="s in statusColors" :key="s.key" class="item">
                  <span class="dot" :style="{background:s.color}"></span>
                  <span class="label">{{s.label}}</span>
                  <span class="val">{{s.count}}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 喜好的书 -->
          <div v-if="topBooks.length" class="card">
            <div class="title">💖 喜好的书</div>
            <div class="books">
              <div v-for="b in topBooks" :key="b.url" class="book" @click="$emit('open',b)">
                <div class="cover">
                  <img v-if="getCover(b)" :src="getCover(b)" :alt="b.title">
                  <div v-else class="text" :style="{background:getColor(b.title)}">{{b.title.slice(0,2)}}</div>
                  <div class="badge">{{getBadge(b)}}</div>
                </div>
                <div class="name">{{b.title}}</div>
                <div class="meta">{{formatTime(b.time)}}</div>
              </div>
            </div>
          </div>

          <!-- 评分 -->
          <div v-if="ratings.length" class="card">
            <div class="title">⭐ 评分分布</div>
            <div class="bars">
              <div v-for="r in ratings" :key="r.rating" class="bar">
                <div class="fill" :style="{width:r.percent+'%'}"></div>
                <div class="text">
                  <span>{{'★'.repeat(r.rating)}}</span>
                  <span>{{r.count}} ({{r.percent}}%)</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 格式 -->
          <div v-if="formats.length" class="card">
            <div class="title">📖 格式分布</div>
            <div class="rings">
              <svg viewBox="0 0 240 240">
                <g v-for="(r,i) in fmtRings" :key="i">
                  <circle cx="120" cy="120" :r="r.r" fill="none" stroke="var(--b3-theme-background)" :stroke-width="r.w"/>
                  <circle cx="120" cy="120" :r="r.r" fill="none" :stroke="r.color" :stroke-width="r.w" :stroke-dasharray="`${r.dash} ${r.circum}`" transform="rotate(-90 120 120)"/>
                </g>
              </svg>
              <div class="legend">
                <div v-for="f in formats" :key="f.format" class="item">
                  <span class="dot" :style="{background:f.color}"></span>
                  <span class="label">{{f.label}}</span>
                  <span class="val">{{f.count}}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import {ref,computed,onMounted,onUnmounted,watch,nextTick,inject} from 'vue'
import {bookshelfManager} from '@/core/bookshelf'
import {useLicense} from '@/core/license'

const props=defineProps<{visible:boolean}>()
const emit=defineEmits<{close:[];open:[book:any]}>()

// 注入useStats实例和plugin
const statsComposable=inject<any>('stats')
const {can,showUpgrade}=useLicense({})

const popupRef=ref<HTMLElement>(),showDetail=ref(false)
const totalBooks=ref(0),finishedCount=ref(0),annotationCount=ref(0)
const topBooks=ref<any[]>([]),allBooks=ref<any[]>([]),statusStats=ref<any[]>([]),ratings=ref<any[]>([]),formats=ref<any[]>([])
const quote=ref({content:'The only way to do great work is to love what you do.',note:'—— Steve Jobs'})
const quoteVisible=ref(true)
const calView=ref<'year'|'month'>('year'),curYear=ref(new Date().getFullYear()),curMonth=ref(new Date().getMonth()+1)
const dailyData=ref<Record<string,{total:number;books:Array<{url:string;duration:number}>}>>({})
const now=ref(Date.now())
const todayReading=ref(0)
const totalReading=ref(0)

// 计算本次时长（触发器：now.value）
const sessionTime=computed(()=>{
  now.value // 触发依赖
  const start=statsComposable?.stats.value.sessionStart||0
  return start>0?Math.floor((Date.now()-start)/1000):0
})

// 计算今日时长（包含本次，触发器：now.value）
const todayTime=computed(()=>{
  now.value // 触发依赖
  return todayReading.value+sessionTime.value
})

// 计算累计时长（包含本次，触发器：now.value）
const totalTime=computed(()=>{
  now.value // 触发依赖
  return totalReading.value+sessionTime.value
})

// 复用useStats的格式化方法
const fmt=statsComposable?.fmt||(s=>s+'s')
const fmtShort=statsComposable?.fmtShort||(s=>s+'s')
const fmtDecimal=(s:number)=>{const h=s/3600;return h>=24?`${(h/24).toFixed(1)}天`:h>=1?`${h.toFixed(1)}时`:`${(s/60).toFixed(1)}分`}

const getBadge=(b:any)=>b.status==='finished'?'已读完':b.time>3600?'常读常新':b.progress>50?'阅读中':'最近阅读'
const getColor=(t:string)=>bookshelfManager.getBookColor(t)
const getCover=(b:any)=>bookshelfManager.getCoverUrl(b)
const formatTime=(s:number)=>{
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60
  return h>0?`${h}小时${m}分${sec}秒`:m>0?`${m}分${sec}秒`:`${sec}秒`
}

const headers=computed(()=>{
  const totalStr=fmtDecimal(totalTime.value)
  const todayStr=fmtDecimal(todayTime.value)
  return[
    {label:'积阅',value:totalStr.match(/[\d.]+/)?.[0]||'0',unit:totalStr.replace(/[\d.]+/,'')},
    {label:'今阅',value:todayStr.match(/[\d.]+/)?.[0]||'0',unit:todayStr.replace(/[\d.]+/,'')},
    {label:'读完',value:finishedCount.value,unit:'本'},
    {label:'读过',value:totalBooks.value,unit:'本'},
    {label:'笔记',value:annotationCount.value,unit:'条'}
  ]
})

const statusColors=computed(()=>{
  const colors=['#FF6B6B','#4ECDC4','#45B7D1']
  return statusStats.value.map((s,i)=>({...s,color:colors[i]||'#999'}))
})

const pie=computed(()=>{
  const total=statusStats.value.reduce((sum,s)=>sum+s.count,0)
  if(!total)return[]
  let angle=0
  return statusColors.value.map(s=>{
    const pct=s.count/total,deg=pct*360,end=angle+deg
    const x1=100+80*Math.cos((angle-90)*Math.PI/180),y1=100+80*Math.sin((angle-90)*Math.PI/180)
    const x2=100+80*Math.cos((end-90)*Math.PI/180),y2=100+80*Math.sin((end-90)*Math.PI/180)
    const path=`M 100 100 L ${x1} ${y1} A 80 80 0 ${deg>180?1:0} 1 ${x2} ${y2} Z`
    angle=end
    return{path,color:s.color}
  })
})

const fmtRings=computed(()=>formats.value.map((f,i)=>{
  const r=100-i*20,circum=2*Math.PI*r
  return{r,w:14,circum,dash:(f.percent/100)*circum,color:f.color}
}))

const getLevel=(duration:number)=>{
  if(!duration)return 0
  const m=Math.floor(duration/60)
  return m<5?1:m<15?2:m<30?3:4
}

const formatDayTooltip=(data:any)=>{
  if(!data||!data.total)return''
  const h=Math.floor(data.total/3600),m=Math.floor((data.total%3600)/60)
  let tip=`总计: ${h>0?h+'小时':''} ${m}分钟`
  if(data.books.length>0){
    tip+='\n'+data.books.map((b:any)=>{
      const bh=Math.floor(b.duration/3600),bm=Math.floor((b.duration%3600)/60)
      const book=allBooks.value.find(tb=>tb.url===b.url)
      const name=book?book.title.slice(0,10):'未知书籍'
      return `${name}: ${bh>0?bh+'小时':''} ${bm}分钟`
    }).join('\n')
  }
  return tip
}

const getDays=(m:number)=>{
  const year=calView.value==='year'?curYear.value:curYear.value
  const month=calView.value==='year'?m:curMonth.value
  const days=new Date(year,month,0).getDate()
  return Array.from({length:days},(_,i)=>{
    const day=i+1
    const key=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const data=dailyData.value[key]
    const duration=data?.total||0
    return{day,duration,level:getLevel(duration),tooltip:formatDayTooltip(data)}
  })
}

const switchView=()=>calView.value=calView.value==='year'?'month':'year'

const handleViewDetail=()=>{if(!can.value('reader-stats'))return showUpgrade('阅读统计');showDetail.value=true}

// 统一刷新方法
const refresh=()=>now.value=Date.now()

const navPeriod=(dir:number)=>{
  calView.value==='year'?curYear.value+=dir:(curMonth.value+=dir,curMonth.value<1?(curMonth.value=12,curYear.value--):curMonth.value>12&&(curMonth.value=1,curYear.value++))
  loadDaily()
}

const loadDaily=async()=>dailyData.value=await bookshelfManager.getDailyReading(curYear.value,calView.value==='month'?curMonth.value:undefined)

const loadQuote=async()=>{
  const quotes=[
    {content:'Life is what happens when you\'re busy making other plans.',note:'—— John Lennon'},
    {content:'The future belongs to those who believe in the beauty of their dreams.',note:'—— Eleanor Roosevelt'},
    {content:'It is during our darkest moments that we must focus to see the light.',note:'—— Aristotle'},
    {content:'The only impossible journey is the one you never begin.',note:'—— Tony Robbins'}
  ]
  let newQuote
  try{
    const res=await fetch('https://v1.hitokoto.cn/?c=i&encode=json'),data=await res.json()
    newQuote={content:data.hitokoto||'',note:data.from?`—— ${data.from}`:''}
  }catch{
    newQuote=quotes[Math.floor(Math.random()*quotes.length)]}
  quoteVisible.value=false
  setTimeout(()=>{quote.value=newQuote;quoteVisible.value=true},300)}

const load=async()=>{
  const [dbStats,books]=await Promise.all([bookshelfManager.getStats(),bookshelfManager.getBooks()])
  totalBooks.value=books.length
  finishedCount.value=dbStats.byStatus.finished||0
  annotationCount.value=dbStats.annotationCount||0
  allBooks.value=books
  topBooks.value=books.filter(b=>b.time>0).sort((a,b)=>(b.time||0)-(a.time||0)).slice(0,10)
  const statusMap={unread:'未读',reading:'在读',finished:'已完成'}
  statusStats.value=Object.entries(statusMap).map(([key,label])=>({key,label,count:dbStats.byStatus[key]||0}))
  const rTotal=Object.values(dbStats.byRating).reduce((s:number,c:number)=>s+c,0)
  ratings.value=[5,4,3,2,1].map(rating=>({rating,count:dbStats.byRating[rating]||0,percent:rTotal?Math.round((dbStats.byRating[rating]||0)/rTotal*100):0})).filter(r=>r.count>0)
  const fmtMap:Record<string,{label:string,color:string}>={epub:{label:'EPUB',color:'var(--b3-theme-primary)'},pdf:{label:'PDF',color:'var(--b3-theme-error)'},mobi:{label:'MOBI',color:'var(--b3-theme-secondary)'},azw3:{label:'AZW3',color:'var(--b3-theme-warning)'},txt:{label:'TXT',color:'var(--b3-theme-success)'}}
  const fTotal=Object.values(dbStats.byFormat).reduce((s:number,c:number)=>s+c,0)
  formats.value=Object.entries(fmtMap).map(([key,info])=>({format:key,...info,count:dbStats.byFormat[key]||0,percent:fTotal?Math.round((dbStats.byFormat[key]||0)/fTotal*100):0})).filter(f=>f.count>0)
  await loadDaily()
  loadQuote()
}

const loadBase=async()=>{
  const [today,total]=await Promise.all([bookshelfManager.getTodayReading(),statsComposable?.stats.value.readingTime||0])
  todayReading.value=today
  totalReading.value=total
}

const position=()=>nextTick(()=>{
  const bar=document.querySelector('#stats-btn') as HTMLElement
  if(!bar||!popupRef.value)return
  const rect=bar.getBoundingClientRect()
  popupRef.value.style.right=`${window.innerWidth-rect.right}px`
  popupRef.value.style.bottom=`${window.innerHeight-rect.top+8}px`
})

const clickOut=(e:MouseEvent)=>{
  const t=e.target as HTMLElement
  if(t.closest('.popup-btn'))return
  if(showDetail.value&&popupRef.value&&!popupRef.value.contains(t)){showDetail.value=false;return}
  if(!showDetail.value&&popupRef.value&&!popupRef.value.contains(t))emit('close')
}

watch(()=>props.visible,async v=>{
  if(v){showDetail.value=false;refresh();await loadBase();position();setTimeout(()=>document.addEventListener('click',clickOut),100)}
  else document.removeEventListener('click',clickOut)
})

watch(showDetail,v=>{if(v){refresh();load()}})

onMounted(async()=>{if(props.visible){refresh();await loadBase();position()}})
onUnmounted(()=>document.removeEventListener('click',clickOut))
</script>

<style lang="scss" scoped>
.fade-enter-active,.fade-leave-active{transition:all .3s}
.fade-enter-from,.fade-leave-to{opacity:0;transform:translateY(20px)}

.popup{
  position:fixed;z-index:99999;background:var(--b3-theme-background);border:1px solid var(--b3-border-color);
  border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);pointer-events:auto;
  transition:all .3s cubic-bezier(0.4,0,0.2,1);
  padding:12px 16px;font-size:12px;line-height:1.8;min-width:150px;
  
  &.expanded{
    width:320px;max-width:calc(100vw - 32px);max-height:480px;
    padding:0;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.2);
    background:var(--b3-theme-surface);overflow:hidden;
  }
  
  &-title{font-weight:bold;margin-bottom:6px;color:var(--b3-theme-on-background)}
  &-item{color:var(--b3-theme-on-background-light);span{font-weight:600;color:var(--b3-theme-primary)}}
  &-divider{height:1px;background:var(--b3-border-color);margin:8px -16px}
  &-btn{width:100%;padding:4px 8px;border:none;background:transparent;color:var(--b3-theme-primary);
    cursor:pointer;font-size:12px;text-align:center;transition:opacity .15s;&:hover{opacity:.8}}
}

.panel-body{
  padding:8px;max-height:480px;overflow-y:auto;box-sizing:border-box;
  
  &::-webkit-scrollbar{width:6px}
  &::-webkit-scrollbar-track{background:transparent}
  &::-webkit-scrollbar-thumb{background:var(--b3-border-color);border-radius:3px;
    &:hover{background:var(--b3-theme-on-surface-variant)}}
  
  .header,.card{
    margin-bottom:6px;padding:6px;background:var(--b3-theme-background);border-radius:6px;
    border:1px solid var(--b3-border-color);box-sizing:border-box;width:100%;height:auto;min-height:auto;
    &:last-child{margin-bottom:8px}
  }
}

.header{
  .quote-section{
    margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--b3-border-color);
  }
  .quote-text{font-size:11px;line-height:1.5;color:var(--b3-theme-on-surface);margin-bottom:4px;
    font-style:italic;word-wrap:break-word;transition:opacity .5s ease}
  .quote-note{font-size:10px;color:var(--b3-theme-on-surface-variant);line-height:1.4;word-wrap:break-word;
    transition:opacity .5s ease}
  .stats-row{display:flex;justify-content:space-between}
  &-item{flex:1;display:flex;flex-direction:column;gap:2px;text-align:center;min-width:0}
  .label{font-size:12px;color:var(--b3-theme-on-surface-variant);font-weight:400;line-height:1.3}
  .value{font-size:12px;font-weight:400;color:var(--b3-theme-primary);line-height:1.3;
    overflow:hidden;text-overflow:ellipsis;
    .unit{color:var(--b3-theme-on-surface);margin-left:1px}}
}

.title{font-size:11px;font-weight:600;color:var(--b3-theme-on-surface);margin-bottom:5px}
.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;gap:4px}
.subtitle{font-size:9px;color:var(--b3-theme-on-surface-variant)}

.cal-ctrl{display:flex;align-items:center;gap:2px}
.cal-btn{padding:2px 6px;border:1px solid var(--b3-border-color);background:var(--b3-theme-background);
  color:var(--b3-theme-on-surface);border-radius:3px;cursor:pointer;font-size:10px;
  &:hover{background:var(--b3-list-hover)}&.view{min-width:60px}}

.calendar{display:grid;grid-template-columns:repeat(4,1fr);gap:2px}
.month{display:flex;flex-direction:column;gap:1px;
  &-label{font-size:9px;font-weight:600;color:var(--b3-theme-on-surface-variant)}
  &-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;
    i{width:100%;aspect-ratio:1;background:var(--b3-theme-surface);border-radius:1px;cursor:pointer;
      &[data-level="1"]{background:var(--b3-theme-primary);opacity:.25}
      &[data-level="2"]{background:var(--b3-theme-primary);opacity:.5}
      &[data-level="3"]{background:var(--b3-theme-primary);opacity:.75}
      &[data-level="4"]{background:var(--b3-theme-primary);opacity:1}}}}

.cal-month .month-grid-lg{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;
  i{width:100%;aspect-ratio:1;background:var(--b3-theme-surface);border-radius:2px;cursor:pointer;
    display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:500;
    &[data-level="1"]{background:var(--b3-theme-primary);opacity:.25}
    &[data-level="2"]{background:var(--b3-theme-primary);opacity:.5}
    &[data-level="3"]{background:var(--b3-theme-primary);opacity:.75;color:white}
    &[data-level="4"]{background:var(--b3-theme-primary);opacity:1;color:white}}}

.rings{display:flex;align-items:center;gap:6px;
  svg{flex-shrink:0;width:75px;height:75px}}
.legend{flex:1;min-width:75px}
.item{display:flex;align-items:center;gap:4px;padding:2px 3px;border-radius:3px;
  cursor:pointer;transition:background .15s;font-size:10px;&:hover{background:var(--b3-list-hover)}}
.dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.label{flex:1;color:var(--b3-theme-on-surface)}
.val{font-weight:600;color:var(--b3-theme-primary);font-size:9px}

.books{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;
  &::-webkit-scrollbar{height:4px}
  &::-webkit-scrollbar-track{background:var(--b3-theme-surface)}
  &::-webkit-scrollbar-thumb{background:var(--b3-border-color);border-radius:2px}}

.book{flex-shrink:0;width:90px;cursor:pointer;
  &:hover .cover{box-shadow:0 4px 12px rgba(0,0,0,.15)}}

.cover{width:100%;aspect-ratio:3/4;border-radius:4px;overflow:hidden;
  box-shadow:0 2px 6px rgba(0,0,0,.1);position:relative;margin-bottom:4px;
  img{width:100%;height:100%;object-fit:cover}
  .text{width:100%;height:100%;display:flex;align-items:center;justify-content:center;
    color:white;font-size:14px;font-weight:600}}

.badge{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,.75);color:white;padding:1px 4px;border-radius:6px;font-size:9px}

.name{font-size:11px;font-weight:500;color:var(--b3-theme-on-surface);margin-bottom:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta{font-size:10px;color:var(--b3-theme-on-surface-variant)}

.bars{display:flex;flex-direction:column;gap:4px}
.bar{position:relative;height:26px;border-radius:4px;
  background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);
  .fill{position:absolute;left:0;top:0;bottom:0;background:var(--b3-theme-primary);opacity:0.15}
  .text{position:relative;display:flex;justify-content:space-between;align-items:center;
    padding:0 6px;height:100%;font-size:10px;color:var(--b3-theme-on-surface);gap:4px;
    span:first-child{font-size:11px}}}
</style>
