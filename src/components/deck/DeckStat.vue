<template>
  <div class="deck-stat">
    <div class="sr-stats-tabs">
      <button v-for="t in TABS" :key="t.key" :class="{active:tab===t.key}" @click="tab=t.key">{{t.label}}</button>
    </div>

    <!-- 今日 -->
    <template v-if="tab==='today'">
      <div v-if="!props.allCards.length" class="sr-empty" style="margin:24px 0">暂无卡片数据。请先在"卡片"标签页添加卡片。</div>
      
      <!-- 今日统计 -->
      <div class="sr-stats-grid">
        <div v-for="s in statsCards" :key="s.label" class="stat-card" :class="{active:expanded===s.type}" @click="s.type&&expand(s.type)">
          <div class="stat-value">{{s.value}}</div>
          <div class="stat-label">{{s.label}}</div>
        </div>
      </div>
      <Transition name="expand"><div v-if="['new','review'].includes(expanded)&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><CardList :cards="displayedCards"/><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>

      <!-- 环形图统一渲染 -->
      <div v-for="chart in ringCharts" :key="chart.id" class="stat-panel">
        <div class="panel-title">{{chart.title}}</div>
        <div class="card-rings">
          <svg viewBox="0 0 240 240" style="width:100%;max-width:200px;height:auto">
            <g v-for="(r,i) in calcRings(chart.data)" :key="i">
              <circle cx="120" cy="120" :r="r.r" fill="none" stroke="var(--b3-theme-background)" :stroke-width="r.w"/>
              <circle cx="120" cy="120" :r="r.r" fill="none" :stroke="r.color" :stroke-width="r.w" :stroke-dasharray="`${r.dash} ${r.circum}`" transform="rotate(-90 120 120)"/>
            </g>
          </svg>
          <div class="ring-legend">
            <div v-for="d in chart.data" :key="d.label" class="ring-item">
              <span class="ring-dot" :style="{background:d.color}"></span>
              <span class="ring-label">{{d.label}}</span>
              <span class="ring-value">{{d.value}}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 记忆曲线 -->
      <div class="stat-panel">
        <div class="panel-head">
          <div class="panel-title">记忆曲线</div>
          <div class="period-tabs">
            <button :class="{active:period==='week'}" @click="period='week'">7天</button>
            <button :class="{active:period==='month'}" @click="period='month'">30天</button>
          </div>
        </div>
        <div class="curve-chart">
          <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto">
            <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#A9F387"/><stop offset="100%" stop-color="#48D8BF"/></linearGradient></defs>
            <line v-for="i in 5" :key="i" :x1="P" :y1="P+(H-P*2)/4*(i-1)" :x2="W-P" :y2="P+(H-P*2)/4*(i-1)" stroke="var(--b3-border-color)" stroke-width="1" opacity="0.3"/>
            <path v-if="curveData.path" :d="curveData.path" fill="none" stroke="url(#g)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <circle v-for="(p,i) in curveData.points" :key="i" :cx="p.x" :cy="p.y" r="4" fill="#fff" stroke="#48D8BF" stroke-width="2"/>
          </svg>
          <div class="curve-labels"><span v-for="(d,i) in curveData.curve" :key="i">{{formatDate(d.date)}}</span></div>
        </div>
      </div>
    </template>

    <!-- 总计 -->
    <template v-else>
      <!-- 总体统计 -->
      <div class="sr-stats-grid">
        <div v-for="s in statsCards" :key="s.label" class="stat-card" :class="{active:expanded===s.type}" @click="s.type&&expand(s.type)">
          <div class="stat-value">{{s.value}}</div>
          <div class="stat-label">{{s.label}}</div>
        </div>
      </div>
      <Transition name="expand"><div v-if="['all','reviewed'].includes(expanded)&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><CardList :cards="displayedCards"/><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>

      <!-- 条形图统一渲染 -->
      <div v-for="chart in barData" :key="chart.id" class="stat-panel">
        <div class="panel-title">{{chart.title}}</div>
        <div v-for="r in chart.data" :key="r.label" class="sr-rating-bar" :class="{active:expanded===chart.id&&expandVal===r.range}" @click="expand(chart.id,r.range)">
          <div class="sr-rating-fill" :style="{width:r.percentage+'%',background:r.color}"></div>
          <div class="sr-rating-text"><span>{{r.label}}</span><span>{{r.count}} ({{r.percentage}}%)</span></div>
        </div>
        <Transition name="expand"><div v-if="expanded===chart.id&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><CardList :cards="displayedCards"><template #source="{card}">{{getSourceText(chart.id,card)}}</template></CardList><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>
      </div>

      <!-- 学习效率 -->
      <div v-if="efficiencyData.data.length" class="stat-panel">
        <div class="panel-title">学习效率</div>
        <div class="efficiency-chart">
          <svg viewBox="0 0 400 240" style="width:100%;height:auto">
            <defs><radialGradient v-for="(e,i) in efficiencyData.data" :key="i" :id="'eg'+i"><stop offset="0%" :stop-color="e.color" stop-opacity="0.8"/><stop offset="100%" :stop-color="e.color" stop-opacity="0.2"/></radialGradient></defs>
            <line v-for="i in 5" :key="'h'+i" x1="50" :y1="30+(i-1)*40" x2="380" :y2="30+(i-1)*40" stroke="var(--b3-border-color)" stroke-width="1" opacity="0.3"/>
            <line v-for="i in 5" :key="'v'+i" :x1="50+(i-1)*82.5" y1="30" :x2="50+(i-1)*82.5" y2="210" stroke="var(--b3-border-color)" stroke-width="1" opacity="0.3"/>
            <line x1="50" y1="210" x2="380" y2="210" stroke="var(--b3-theme-on-surface)" stroke-width="2"/>
            <line x1="50" y1="30" x2="50" y2="210" stroke="var(--b3-theme-on-surface)" stroke-width="2"/>
            <text x="215" y="230" text-anchor="middle" fill="var(--b3-theme-on-surface-variant)" font-size="12">复习次数</text>
            <text x="25" y="120" text-anchor="middle" fill="var(--b3-theme-on-surface-variant)" font-size="12" transform="rotate(-90 25 120)">间隔天数</text>
            <text v-for="(t,i) in efficiencyData.ticks.x" :key="'x'+i" :x="50+i*82.5" y="225" text-anchor="middle" fill="var(--b3-theme-on-surface-variant)" font-size="11">{{t}}</text>
            <text v-for="(t,i) in efficiencyData.ticks.y" :key="'y'+i" x="45" :y="210-i*45" text-anchor="end" fill="var(--b3-theme-on-surface-variant)" font-size="11">{{t}}</text>
            <circle v-for="(e,i) in efficiencyData.data" :key="i" :cx="e.x" :cy="e.y" :r="e.r" :fill="`url(#eg${i})`" stroke="var(--b3-theme-surface)" stroke-width="2" class="eff-bubble" :class="{active:expanded==='efficiency'&&expandVal===e.range}" @click="expand('efficiency',e.range)"><title>{{e.label}}: {{e.count}}张 ({{e.avgReps}}次, {{e.avgDays}}天)</title></circle>
          </svg>
          <div class="ring-legend"><div v-for="e in efficiencyData.data" :key="e.label" class="ring-item" :class="{active:expanded==='efficiency'&&expandVal===e.range}" @click="expand('efficiency',e.range)"><span class="ring-dot" :style="{background:e.color}"></span><span class="ring-label">{{e.label}}</span><span class="ring-value">{{e.count}}</span></div></div>
        </div>
        <Transition name="expand"><div v-if="expanded==='efficiency'&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><CardList :cards="displayedCards"/><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>
      </div>

      <!-- FSRS 统计 -->
      <div v-if="fsrsStats.enabled" class="stat-panel">
        <div class="panel-title">FSRS 智能算法</div>
        <div class="sr-stats-grid">
          <div v-for="s in fsrsCards" :key="s.label" class="stat-card" :class="{active:expanded===s.type}" @click="s.type&&expand(s.type)">
            <div class="stat-value">{{s.value}}</div>
            <div class="stat-label">{{s.label}}</div>
          </div>
        </div>
        <Transition name="expand"><div v-if="expanded==='fsrs'&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><CardList :cards="displayedCards"/><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>
      </div>

      <!-- 难度分布 -->
      <div v-if="fsrsStats.enabled&&fsrsStats.count>0" class="stat-panel">
        <div class="panel-title">难度分布</div>
        <div class="card-rings">
          <svg viewBox="0 0 280 280" style="width:100%;max-width:240px;height:auto">
            <g transform="translate(140,140)">
              <circle v-for="i in 4" :key="'c'+i" :r="i*22" fill="none" :stroke="i===4?'var(--b3-theme-primary)':'var(--b3-theme-on-surface)'" :stroke-width="i===4?2:1" :opacity="i===4?0.3:0.15"/>
              <line v-for="(p,i) in fsrsStats.radar.points" :key="'l'+i" :x1="0" :y1="0" :x2="p.x*88" :y2="p.y*88" stroke="var(--b3-theme-on-surface)" stroke-width="1" opacity="0.2"/>
              <text v-for="(p,i) in fsrsStats.radar.labels" :key="'t'+i" :x="p.x" :y="p.y" text-anchor="middle" :fill="'var(--b3-theme-on-surface-variant)'" font-size="12" font-weight="500">{{p.label}}</text>
              <polygon :points="fsrsStats.radar.polygon" :fill="'var(--b3-theme-primary)'" fill-opacity="0.3" :stroke="'var(--b3-theme-primary)'" stroke-width="3"/>
              <circle v-for="(p,i) in fsrsStats.radar.data" :key="'p'+i" :cx="p.x" :cy="p.y" r="5" :fill="fsrsStats.difficultyDist[i].color" stroke="var(--b3-theme-surface)" stroke-width="2"/>
            </g>
          </svg>
          <div class="ring-legend">
            <div v-for="(d,i) in fsrsStats.difficultyDist" :key="d.label" class="ring-item" :class="{active:expanded==='difficulty'&&expandVal===['easy','medium','hard','veryhard'][i]}" @click="expand('difficulty',['easy','medium','hard','veryhard'][i])">
              <span class="ring-dot" :style="{background:d.color}"></span>
              <span class="ring-label">{{d.label}}</span>
              <span class="ring-value">{{d.count}}</span>
            </div>
          </div>
        </div>
        <Transition name="expand"><div v-if="expanded==='difficulty'&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><CardList :cards="displayedCards"/><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>
      </div>

      <!-- 环形图统一渲染 -->
      <div v-for="chart in ringCharts" :key="chart.id" class="stat-panel">
        <div class="panel-title">{{chart.title}}</div>
        <div class="card-rings">
          <svg viewBox="0 0 240 240" style="width:100%;max-width:200px;height:auto">
            <g v-for="(r,i) in calcRings(chart.data)" :key="i">
              <circle cx="120" cy="120" :r="r.r" fill="none" stroke="var(--b3-theme-background)" :stroke-width="r.w"/>
              <circle cx="120" cy="120" :r="r.r" fill="none" :stroke="r.color" :stroke-width="r.w" :stroke-dasharray="`${r.dash} ${r.circum}`" transform="rotate(-90 120 120)"/>
            </g>
          </svg>
          <div class="ring-legend">
            <div v-for="d in chart.data" :key="d.label" class="ring-item" :class="{active:expanded===chart.id&&expandVal===d.type}" @click="expand(chart.id,d.type)">
              <span class="ring-dot" :style="{background:d.color}"></span>
              <span class="ring-label">{{d.label}}</span>
              <span class="ring-value">{{d.value}}</span>
            </div>
          </div>
        </div>
        <Transition name="expand"><div v-if="expanded===chart.id&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><CardList :cards="displayedCards"/><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>
      </div>

      <!-- 学习日历 -->
      <div v-if="cal.data.length" class="stat-panel">
        <div class="panel-head">
          <div class="panel-title">学习日历</div>
          <div class="cal-nav">
            <button @click="cal.nav('prev')">‹</button>
            <button @click="cal.nav('today')">•</button>
            <button @click="cal.nav('next')">›</button>
          </div>
        </div>
        <div class="cal-grid" ref="calGrid">
          <i v-for="(d,i) in cal.data" :key="i" :data-level="d.level" :class="{today:d.isToday,on:expanded==='date'&&expandVal===d.date}" :title="`${d.date}: ${d.reviews}次`" @click="expand('date',d.date)"></i>
        </div>
        <div class="cal-foot">
          <div class="cal-stats">
            <span>日均 <b>{{cal.stats.avg}}</b></span>
            <span>学习 <b>{{cal.stats.active}}</b> 天</span>
            <span>最长 <b>{{cal.stats.longest}}</b> 天</span>
            <span>连续 <b>{{cal.stats.current}}</b> 天</span>
          </div>
          <div class="cal-legend">
            <span>少</span><i data-level="0"></i><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i><span>多</span>
          </div>
        </div>
        <Transition name="expand"><div v-if="expanded==='date'&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><CardList :cards="displayedCards"/><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>
      </div>

      <div v-if="!barData.length&&!cal.data.length" class="sr-empty">暂无统计数据</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {ref,computed,watch} from 'vue'
import CardList from './CardList.vue'
import {calcRings,calcRadar,formatDate} from './utils'
import type{DailyStats,TotalStats,IntervalStats,RetentionStats,ForecastStats} from './types'

const props=defineProps<{todayStats:DailyStats,historyStats:DailyStats[],totalStats:TotalStats,intervals:IntervalStats,retention:RetentionStats,forecast:ForecastStats,allCards:any[]}>()

const tab=ref<'today'|'total'>('today'),period=ref<'week'|'month'>('week'),calGrid=ref<HTMLElement|null>(null)
const expanded=ref(''),expandVal=ref<any>(),filtered=ref<any[]>([])
const fsrsEnabled=ref(false),fsrsRetention=ref(0.9)

// 检查 FSRS 是否启用
watch(()=>props.allCards,async(newCards)=>{
  try{
    const{getSettingsManager}=await import('./settings')
    const manager=getSettingsManager()
    const deckId=newCards[0]?.deckId
    if(deckId){
      const settings=await manager.getSettings(deckId)
      if(settings){
        fsrsEnabled.value=settings.enableFsrs||false
        fsrsRetention.value=settings.desiredRetention||0.9
      }
    }
  }catch(e){
    console.error('Failed to get FSRS settings:',e)
  }
},{immediate:true,deep:true})

const TABS=[{key:'today',label:'今日'},{key:'total',label:'总计'}]
const W=400,H=200,P=20
const LABELS={again:'重来',hard:'困难',good:'良好',easy:'简单'}
const EBBINGHAUS=[{days:0,retention:100},{days:1,retention:58},{days:2,retention:44},{days:4,retention:36},{days:7,retention:28},{days:15,retention:25},{days:30,retention:21}]

// ========== 通用工具函数 ==========
const createDistribution=(cards:any[],getValue:(c:any)=>number,ranges:any[])=>{
  const counts=ranges.map(r=>({...r,count:cards.filter(c=>{const v=getValue(c);return v>=r.min&&v<r.max}).length}))
  const total=counts.reduce((s,c)=>s+c.count,0)
  return counts.map(c=>({...c,percentage:total?Math.round(c.count/total*100):0})).filter(c=>c.count>0)
}

const reviewed=computed(()=>props.allCards.filter(c=>(c.learning?.reps||0)>0))

// ========== 条形图配置 ==========
const barCharts=[
  {
    id:'lapses',
    title:'失误分析',
    getValue:(c:any)=>c.learning?.lapses||0,
    ranges:[
      {label:'0次',min:0,max:1,color:'#10b981',range:'0'},
      {label:'1-2次',min:1,max:3,color:'#3b82f6',range:'1-2'},
      {label:'3-5次',min:3,max:6,color:'#f59e0b',range:'3-5'},
      {label:'>5次',min:6,max:Infinity,color:'#ef4444',range:'>5'}
    ]
  },
  {
    id:'ease',
    title:'记忆强度（Ease）',
    getValue:(c:any)=>c.learning?.ease||2.5,
    ranges:[
      {label:'困难(<130%)',min:0,max:1.3,color:'#ef4444',range:'<1.3'},
      {label:'一般(130-200%)',min:1.3,max:2.0,color:'#f59e0b',range:'1.3-2.0'},
      {label:'良好(200-250%)',min:2.0,max:2.5,color:'#3b82f6',range:'2.0-2.5'},
      {label:'优秀(≥250%)',min:2.5,max:Infinity,color:'#10b981',range:'≥2.5'}
    ]
  },
  {
    id:'interval',
    title:'复习间隔',
    getValue:(c:any)=>Math.floor((c.learning?.interval||0)/1440),
    ranges:[
      {label:'<1天',min:0,max:1,color:'var(--b3-theme-primary)',range:'<1天'},
      {label:'1-7天',min:1,max:7,color:'var(--b3-theme-primary)',range:'1-7天'},
      {label:'1-4周',min:7,max:28,color:'var(--b3-theme-primary)',range:'1-4周'},
      {label:'1-3月',min:28,max:90,color:'var(--b3-theme-primary)',range:'1-3月'},
      {label:'3-6月',min:90,max:180,color:'var(--b3-theme-primary)',range:'3-6月'},
      {label:'>6月',min:180,max:Infinity,color:'var(--b3-theme-primary)',range:'>6月'}
    ]
  }
]

const barData=computed(()=>barCharts.map(cfg=>({...cfg,data:createDistribution(reviewed.value,cfg.getValue,cfg.ranges)})).filter(cfg=>cfg.data.length>0))

// ========== 环形图配置 ==========
const ringCharts=computed(()=>{
  const charts=[]
  if(tab.value==='today'){
    const r=props.todayStats.ratings
    if(r){
      const t=r.again+r.hard+r.good+r.easy
      if(t>0){
        charts.push({
          id:'todayRating',
          title:'今日评分',
          data:[
            {label:'重来',value:r.again,percent:Math.round(r.again/t*100)||0,color:'#ef4444',type:'again'},
            {label:'困难',value:r.hard,percent:Math.round(r.hard/t*100)||0,color:'#f59e0b',type:'hard'},
            {label:'良好',value:r.good,percent:Math.round(r.good/t*100)||0,color:'#10b981',type:'good'},
            {label:'简单',value:r.easy,percent:Math.round(r.easy/t*100)||0,color:'#3b82f6',type:'easy'}
          ].filter(i=>i.value>0)
        })
      }
    }
  }
  if(tab.value==='total'){
    const dist={again:0,hard:0,good:0,easy:0}
    props.allCards.forEach(c=>{
      const reps=c.learning?.reps||0
      if(reps===0)return
      const i=Math.floor((c.learning?.interval||0)/1440)
      if(i<1)dist.again++
      else if(i<4)dist.hard++
      else if(i<15)dist.good++
      else dist.easy++
    })
    const t=dist.again+dist.hard+dist.good+dist.easy
    if(t>0){
      charts.push({
        id:'rating',
        title:'间隔分布',
        data:[
          {label:'<1天',value:dist.again,percent:Math.round(dist.again/t*100)||0,color:'#ef4444',type:'again'},
          {label:'1-3天',value:dist.hard,percent:Math.round(dist.hard/t*100)||0,color:'#f59e0b',type:'hard'},
          {label:'4-14天',value:dist.good,percent:Math.round(dist.good/t*100)||0,color:'#10b981',type:'good'},
          {label:'≥15天',value:dist.easy,percent:Math.round(dist.easy/t*100)||0,color:'#3b82f6',type:'easy'}
        ].filter(i=>i.value>0)
      })
    }
  }
  return charts
})

// 统计卡片配置
const statsCards=computed(()=>tab.value==='today'?(() =>{
  const ts=new Date().setHours(0,0,0,0),rev=props.allCards.filter(c=>(c.learning?.lastReview||0)>=ts)
  return[
    {value:rev.filter(c=>(c.learning?.reps||0)===1).length,label:'今日新学',type:'new'},
    {value:rev.filter(c=>(c.learning?.reps||0)>1).length,label:'今日复习',type:'review'},
    {value:(props.todayStats.correctRate||0)+'%',label:'正确率',type:null},
    {value:props.totalStats.streak||0,label:'连续天数',type:null}
  ]
})():[
  {value:props.allCards.length,label:'总卡片',type:'all'},
  {value:reviewed.value.length,label:'已复习',type:'reviewed'},
  {value:(props.totalStats.avgCorrectRate||0)+'%',label:'平均正确率',type:null},
  {value:props.totalStats.streak||0,label:'连续天数',type:null}
])

const fsrsStats=computed(()=>{
  if(!fsrsEnabled.value)return{enabled:false,count:0,retention:0.9,avgStability:0,avgDifficulty:0,difficultyDist:[],radar:null}
  const cards=props.allCards.filter(c=>{const s=c.learning?.stability,d=c.learning?.difficulty;return s!==undefined&&s!==null&&d!==undefined&&d!==null&&s>0})
  const dist=[{label:'简单',range:[0,3],count:0,color:'#10b981'},{label:'中等',range:[3,5],count:0,color:'#3b82f6'},{label:'困难',range:[5,7],count:0,color:'#f59e0b'},{label:'极难',range:[7,10],count:0,color:'#ef4444'}]
  if(!cards.length)return{enabled:true,count:0,retention:fsrsRetention.value,avgStability:0,avgDifficulty:0,difficultyDist:dist.map(d=>({...d,percent:25})),radar:calcRadar(dist.map(d=>({...d,percent:25})))}
  cards.forEach(c=>{const d=c.learning?.difficulty||0;dist[d<3?0:d<5?1:d<7?2:3].count++})
  const maxCount=Math.max(...dist.map(d=>d.count),1)
  const difficultyDist=dist.map(d=>({...d,percent:maxCount>0?Math.round(d.count/maxCount*100):25}))
  return{enabled:true,count:cards.length,retention:fsrsRetention.value,avgStability:cards.reduce((s,c)=>s+(c.learning?.stability||0),0)/cards.length,avgDifficulty:cards.reduce((s,c)=>s+(c.learning?.difficulty||0),0)/cards.length,difficultyDist,radar:calcRadar(difficultyDist)}
})

const fsrsCards=computed(()=>[
  {value:(fsrsStats.value.retention*100).toFixed(0)+'%',label:'目标记忆率',type:null},
  {value:fsrsStats.value.count,label:'FSRS 卡片',type:'fsrs'},
  {value:fsrsStats.value.avgStability.toFixed(1),label:'平均稳定性',type:null},
  {value:fsrsStats.value.avgDifficulty.toFixed(1),label:'平均难度',type:null}
])

const efficiencyData=computed(()=>{
  if(!reviewed.value.length)return{data:[],ticks:{x:[],y:[]}}
  const groups=[{label:'高效掌握',minReps:1,maxReps:5,minDays:7,color:'#10b981'},{label:'稳定进步',minReps:1,maxReps:10,minDays:1,maxDays:7,color:'#3b82f6'},{label:'需要巩固',minReps:5,maxReps:Infinity,maxDays:7,color:'#f59e0b'},{label:'困难卡片',minReps:10,maxReps:Infinity,maxDays:1,color:'#ef4444'}]
  const data=groups.map(g=>{const cards=reviewed.value.filter(c=>{const reps=c.learning?.reps||0,days=Math.floor((c.learning?.interval||0)/1440);return reps>=g.minReps&&reps<g.maxReps&&days>=(g.minDays||0)&&days<(g.maxDays||Infinity)});return cards.length?{...g,count:cards.length,avgReps:Math.round(cards.reduce((s,c)=>s+(c.learning?.reps||0),0)/cards.length),avgDays:Math.round(cards.reduce((s,c)=>s+Math.floor((c.learning?.interval||0)/1440),0)/cards.length),range:g.label}:null}).filter(Boolean)
  if(!data.length)return{data:[],ticks:{x:[],y:[]}}
  const maxReps=Math.max(...data.map(d=>d.avgReps),10),maxDays=Math.max(...data.map(d=>d.avgDays),30),maxCount=Math.max(...data.map(d=>d.count),1)
  return{data:data.map(d=>({...d,x:50+d.avgReps/maxReps*330,y:210-d.avgDays/maxDays*180,r:Math.max(8,Math.min(30,d.count/maxCount*20+8))})),ticks:{x:[0,Math.round(maxReps*0.25),Math.round(maxReps*0.5),Math.round(maxReps*0.75),maxReps],y:[0,Math.round(maxDays*0.25),Math.round(maxDays*0.5),Math.round(maxDays*0.75),maxDays]}}
})

const curveData=computed(()=>{
  const days=period.value==='week'?7:30,pts=EBBINGHAUS.filter(p=>p.days<=days)
  const curve=props.historyStats.length?(()=>{const h=props.historyStats.slice(-days),adj=h.length?h.reduce((s,d)=>s+d.correctRate,0)/h.length/70:1;return pts.map(p=>{const d=new Date();d.setDate(d.getDate()-(days-p.days));return{date:d.toISOString().split('T')[0],retention:Math.min(100,p.retention*adj)}})})():pts.map(p=>{const d=new Date();d.setDate(d.getDate()-(days-p.days));return{date:d.toISOString().split('T')[0],retention:p.retention}})
  const w=W-P*2,h=H-P*2,step=w/Math.max(curve.length-1,1)
  const points=curve.map((v,i)=>({x:P+i*step,y:H-P-(v.retention/100)*h}))
  const path=points.length===1?`M ${points[0].x-2} ${points[0].y} A 2 2 0 1 1 ${points[0].x+2} ${points[0].y} A 2 2 0 1 1 ${points[0].x-2} ${points[0].y}`:points.length?`M ${points[0].x} ${points[0].y}`+points.slice(1).map(p=>` L ${p.x} ${p.y}`).join(''):''
  return{curve,points,path}
})

const cal=computed(()=>{
  const now=new Date();now.setHours(0,0,0,0);const ts=now.toISOString().split('T')[0]
  const start=new Date(now);start.setFullYear(start.getFullYear()-1);start.setDate(start.getDate()+1)
  const d=start.getDay();if(d!==1)start.setDate(start.getDate()-(d===0?6:d-1))
  const map=new Map(props.historyStats.map(h=>[h.date,h]))
  const data:any[]=[]
  for(const cur=new Date(start);cur<=now;cur.setDate(cur.getDate()+1)){
    const ds=cur.toISOString().split('T')[0]
    const rev=map.get(ds)?.reviews||0
    data.push({date:ds,reviews:rev,level:rev===0?0:rev>=50?4:rev>=30?3:rev>=10?2:1,isToday:ds===ts})
  }
  const active=data.filter(d=>d.reviews>0)
  const avg=active.length?Math.round(active.reduce((s,d)=>s+d.reviews,0)/active.length):0
  let longest=0,current=0,streak=0
  for(let i=data.length-1;i>=0;i--){
    if(data[i].reviews>0){
      streak++;if(i===data.length-1||data[i].isToday)current=streak;longest=Math.max(longest,streak)
    }else streak=current?0:0
  }
  return{
    data,
    stats:{avg,active:active.length,longest,current},
    nav:(dir:'prev'|'next'|'today')=>{
      const g=calGrid.value;if(!g)return
      const w=g.clientWidth
      g.scrollLeft=dir==='prev'?g.scrollLeft-w*.8:dir==='next'?g.scrollLeft+w*.8:Math.floor(data.findIndex(d=>d.isToday)/7)*13-w/2
    }
  }
})

const displayCount=ref(8),displayedCards=computed(()=>filtered.value.slice(0,displayCount.value)),hasMore=computed(()=>filtered.value.length>displayCount.value)
const loadMore=()=>{displayCount.value+=8},close=()=>{expanded.value='';expandVal.value=undefined;filtered.value=[];displayCount.value=8}

// 筛选器配置
const FILTERS:Record<string,any>={
  new:(c:any,ts:number)=>(c.learning?.lastReview||0)>=ts&&(c.learning?.reps||0)===1,
  review:(c:any,ts:number)=>(c.learning?.lastReview||0)>=ts&&(c.learning?.reps||0)>1,
  all:()=>true,
  reviewed:(c:any)=>(c.learning?.reps||0)>0,
  fsrs:(c:any)=>{const s=c.learning?.stability,d=c.learning?.difficulty;return s!==undefined&&s!==null&&d!==undefined&&d!==null&&s>0},
  difficulty:(c:any,_:any,v:string)=>{const d=c.learning?.difficulty;if(!d)return false;return v==='easy'?d<3:v==='medium'?d>=3&&d<5:v==='hard'?d>=5&&d<7:d>=7},
  todayRating:(c:any,ts:number)=>(c.learning?.lastReview||0)>=ts,
  rating:(c:any,_:any,v:string)=>{const r=c.learning?.reps||0,i=Math.floor((c.learning?.interval||0)/1440);if(!r)return false;return v==='again'?i<1:v==='hard'?i>=1&&i<4:v==='good'?i>=4&&i<15:i>=15},
  date:(c:any,_:any,v:string)=>{const lr=c.learning?.lastReview;return lr&&new Date(lr).toISOString().split('T')[0]===v},
  interval:(c:any,_:any,v:string)=>{const i=Math.floor((c.learning?.interval||0)/1440);return v==='<1天'?i<1:v==='1-7天'?i>=1&&i<7:v==='1-4周'?i>=7&&i<28:v==='1-3月'?i>=28&&i<90:v==='3-6月'?i>=90&&i<180:i>=180},
  lapses:(c:any,_:any,v:string)=>{const l=c.learning?.lapses||0;return v==='0'?l<1:v==='1-2'?l>=1&&l<3:v==='3-5'?l>=3&&l<6:l>=6},
  efficiency:(c:any,_:any,v:string)=>{const r=c.learning?.reps||0,d=Math.floor((c.learning?.interval||0)/1440);return v==='高效掌握'?r>=1&&r<5&&d>=7:v==='稳定进步'?r>=1&&r<10&&d>=1&&d<7:v==='需要巩固'?r>=5&&d<7:r>=10&&d<1},
  ease:(c:any,_:any,v:string)=>{const e=c.learning?.ease||2.5;return v==='<1.3'?e<1.3:v==='1.3-2.0'?e>=1.3&&e<2.0:v==='2.0-2.5'?e>=2.0&&e<2.5:e>=2.5}
}

const TITLES:Record<string,any>={
  new:'今日新学',review:'今日复习',all:'所有卡片',reviewed:'已复习卡片',fsrs:'FSRS 卡片',
  difficulty:(v:string)=>`难度: ${{easy:'简单',medium:'中等',hard:'困难',veryhard:'极难'}[v]||v}`,
  todayRating:(v:string)=>`今日评分: ${LABELS[v as keyof typeof LABELS]||v}`,
  rating:(v:string)=>`间隔: ${{again:'<1天',hard:'1-3天',good:'4-14天',easy:'≥15天'}[v]||v}`,
  date:(v:string)=>`日期: ${v}`,
  interval:(v:string)=>`间隔: ${v}`,
  lapses:(v:string)=>`失误: ${v}次`,
  efficiency:(v:string)=>`效率: ${v}`,
  ease:(v:string)=>`记忆强度: ${v}`
}

const expand=(type:string,val?:any)=>{
  if(expanded.value===type&&expandVal.value===val){close();return}
  expanded.value=type;expandVal.value=val;displayCount.value=8
  const ts=new Date().setHours(0,0,0,0)
  const filter=FILTERS[type]
  filtered.value=filter?props.allCards.filter(c=>filter(c,ts,val)):[]
}

const expandTitle=computed(()=>{
  const t=TITLES[expanded.value]
  return t?(typeof t==='function'?t(expandVal.value):t):''
})

const getSourceText=(chartId:string,card:any)=>{
  if(chartId==='lapses')return`${card.model||'Anki'} · 失误 ${card.learning?.lapses||0}次`
  if(chartId==='ease')return`${card.model||'Anki'} · Ease ${((card.learning?.ease||2.5)*100).toFixed(0)}%`
  return`${card.model||'Anki'} · 复习 ${card.learning?.reps||0}次`
}
</script>

<style scoped lang="scss">
@use './deck.scss';
</style>
