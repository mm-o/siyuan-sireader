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
        <div v-for="s in todayCards" :key="s.label" class="stat-card" :class="{active:expanded===s.type}" @click="s.type&&expand(s.type)">
          <div class="stat-value">{{s.value}}</div>
          <div class="stat-label">{{s.label}}</div>
        </div>
      </div>
      <Transition name="expand"><div v-if="['new','review'].includes(expanded)&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><div class="stat-expand-list"><div v-for="c in displayedCards" :key="c.id" class="deck-card" :class="{expanded:detail===c.id}" @click="toggleCard($event,c)"><span class="sr-bar" :style="{background:getMasteryColor(c)}"></span><div class="deck-card-main"><div class="deck-card-mastery">{{getMasteryIcon(c)}}</div><div class="deck-card-title" v-html="getTitle(c)" @click.capture="stopIfAudio"></div><div class="deck-card-hint" v-html="getHint(c)"></div><Transition name="expand"><div v-if="detail===c.id" class="deck-card-content" v-html="renderAnki(c)" @click.capture="stopIfAudio"></div></Transition><div class="deck-card-source">{{c.model||'Anki'}} · 复习 {{c.learning?.reps||0}}次</div></div></div></div><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>

      <!-- 今日评分 -->
      <div v-if="todayRatingDist.length" class="stat-panel">
        <div class="panel-title">今日评分</div>
        <div class="card-rings">
          <svg viewBox="0 0 240 240" style="width:100%;max-width:200px;height:auto">
            <g v-for="(r,i) in calcRings(todayRatingDist)" :key="i">
              <circle cx="120" cy="120" :r="r.r" fill="none" stroke="var(--b3-theme-background)" :stroke-width="r.w"/>
              <circle cx="120" cy="120" :r="r.r" fill="none" :stroke="r.color" :stroke-width="r.w" :stroke-dasharray="`${r.dash} ${r.circum}`" transform="rotate(-90 120 120)"/>
            </g>
          </svg>
          <div class="ring-legend">
            <div v-for="d in todayRatingDist" :key="d.label" class="ring-item">
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
            <path v-if="curvePath" :d="curvePath" fill="none" stroke="url(#g)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <circle v-for="(p,i) in curvePoints" :key="i" :cx="p.x" :cy="p.y" r="4" fill="#fff" stroke="#48D8BF" stroke-width="2"/>
          </svg>
          <div class="curve-labels"><span v-for="(d,i) in curve" :key="i">{{fmt(d.date)}}</span></div>
        </div>
      </div>
    </template>

    <!-- 总计 -->
    <template v-else>
      <!-- 总体统计 -->
      <div class="sr-stats-grid">
        <div v-for="s in totalCards" :key="s.label" class="stat-card" :class="{active:expanded===s.type}" @click="s.type&&expand(s.type)">
          <div class="stat-value">{{s.value}}</div>
          <div class="stat-label">{{s.label}}</div>
        </div>
      </div>
      <Transition name="expand"><div v-if="['all','reviewed'].includes(expanded)&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><div class="stat-expand-list"><div v-for="c in displayedCards" :key="c.id" class="deck-card" :class="{expanded:detail===c.id}" @click="toggleCard($event,c)"><span class="sr-bar" :style="{background:getMasteryColor(c)}"></span><div class="deck-card-main"><div class="deck-card-mastery">{{getMasteryIcon(c)}}</div><div class="deck-card-title" v-html="getTitle(c)" @click.capture="stopIfAudio"></div><div class="deck-card-hint" v-html="getHint(c)"></div><Transition name="expand"><div v-if="detail===c.id" class="deck-card-content" v-html="renderAnki(c)" @click.capture="stopIfAudio"></div></Transition><div class="deck-card-source">{{c.model||'Anki'}} · 复习 {{c.learning?.reps||0}}次</div></div></div></div><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>

      <!-- 失误分析 -->
      <div v-if="lapsesData.length" class="stat-panel">
        <div class="panel-title">失误分析</div>
        <div v-for="r in lapsesData" :key="r.label" class="sr-rating-bar" :class="{active:expanded==='lapses'&&expandVal===r.range}" @click="expand('lapses',r.range)">
          <div class="sr-rating-fill" :style="{width:r.percentage+'%',background:r.color}"></div>
          <div class="sr-rating-text"><span>{{r.label}}</span><span>{{r.count}} ({{r.percentage}}%)</span></div>
        </div>
        <Transition name="expand"><div v-if="expanded==='lapses'&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><div class="stat-expand-list"><div v-for="c in displayedCards" :key="c.id" class="deck-card" :class="{expanded:detail===c.id}" @click="toggleCard($event,c)"><span class="sr-bar" :style="{background:getMasteryColor(c)}"></span><div class="deck-card-main"><div class="deck-card-mastery">{{getMasteryIcon(c)}}</div><div class="deck-card-title" v-html="getTitle(c)" @click.capture="stopIfAudio"></div><div class="deck-card-hint" v-html="getHint(c)"></div><Transition name="expand"><div v-if="detail===c.id" class="deck-card-content" v-html="renderAnki(c)" @click.capture="stopIfAudio"></div></Transition><div class="deck-card-source">{{c.model||'Anki'}} · 失误 {{c.learning?.lapses||0}}次</div></div></div></div><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>
      </div>

      <!-- 学习效率 -->
      <div v-if="efficiencyData.length" class="stat-panel">
        <div class="panel-title">学习效率</div>
        <div class="efficiency-chart">
          <svg viewBox="0 0 400 240" style="width:100%;height:auto">
            <defs><radialGradient v-for="(e,i) in efficiencyData" :key="i" :id="'eg'+i"><stop offset="0%" :stop-color="e.color" stop-opacity="0.8"/><stop offset="100%" :stop-color="e.color" stop-opacity="0.2"/></radialGradient></defs>
            <line v-for="i in 5" :key="'h'+i" x1="50" :y1="30+(i-1)*40" x2="380" :y2="30+(i-1)*40" stroke="var(--b3-border-color)" stroke-width="1" opacity="0.3"/>
            <line v-for="i in 5" :key="'v'+i" :x1="50+(i-1)*82.5" y1="30" :x2="50+(i-1)*82.5" y2="210" stroke="var(--b3-border-color)" stroke-width="1" opacity="0.3"/>
            <line x1="50" y1="210" x2="380" y2="210" stroke="var(--b3-theme-on-surface)" stroke-width="2"/>
            <line x1="50" y1="30" x2="50" y2="210" stroke="var(--b3-theme-on-surface)" stroke-width="2"/>
            <text x="215" y="230" text-anchor="middle" fill="var(--b3-theme-on-surface-variant)" font-size="12">复习次数</text>
            <text x="25" y="120" text-anchor="middle" fill="var(--b3-theme-on-surface-variant)" font-size="12" transform="rotate(-90 25 120)">间隔天数</text>
            <text v-for="(t,i) in effTicks.x" :key="'x'+i" :x="50+i*82.5" y="225" text-anchor="middle" fill="var(--b3-theme-on-surface-variant)" font-size="11">{{t}}</text>
            <text v-for="(t,i) in effTicks.y" :key="'y'+i" x="45" :y="210-i*45" text-anchor="end" fill="var(--b3-theme-on-surface-variant)" font-size="11">{{t}}</text>
            <circle v-for="(e,i) in efficiencyData" :key="i" :cx="e.x" :cy="e.y" :r="e.r" :fill="`url(#eg${i})`" stroke="var(--b3-theme-surface)" stroke-width="2" class="eff-bubble" :class="{active:expanded==='efficiency'&&expandVal===e.range}" @click="expand('efficiency',e.range)"><title>{{e.label}}: {{e.count}}张 ({{e.avgReps}}次, {{e.avgDays}}天)</title></circle>
          </svg>
          <div class="ring-legend"><div v-for="e in efficiencyData" :key="e.label" class="ring-item" :class="{active:expanded==='efficiency'&&expandVal===e.range}" @click="expand('efficiency',e.range)"><span class="ring-dot" :style="{background:e.color}"></span><span class="ring-label">{{e.label}}</span><span class="ring-value">{{e.count}}</span></div></div>
        </div>
        <Transition name="expand"><div v-if="expanded==='efficiency'&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><div class="stat-expand-list"><div v-for="c in displayedCards" :key="c.id" class="deck-card" :class="{expanded:detail===c.id}" @click="toggleCard($event,c)"><span class="sr-bar" :style="{background:getMasteryColor(c)}"></span><div class="deck-card-main"><div class="deck-card-mastery">{{getMasteryIcon(c)}}</div><div class="deck-card-title" v-html="getTitle(c)" @click.capture="stopIfAudio"></div><div class="deck-card-hint" v-html="getHint(c)"></div><Transition name="expand"><div v-if="detail===c.id" class="deck-card-content" v-html="renderAnki(c)" @click.capture="stopIfAudio"></div></Transition><div class="deck-card-source">{{c.model||'Anki'}} · 复习 {{c.learning?.reps||0}}次</div></div></div></div><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>
      </div>

      <!-- 记忆强度 -->
      <div v-if="easeData.length" class="stat-panel">
        <div class="panel-title">记忆强度（Ease）</div>
        <div v-for="r in easeData" :key="r.label" class="sr-rating-bar" :class="{active:expanded==='ease'&&expandVal===r.range}" @click="expand('ease',r.range)">
          <div class="sr-rating-fill" :style="{width:r.percentage+'%',background:r.color}"></div>
          <div class="sr-rating-text"><span>{{r.label}}</span><span>{{r.count}} ({{r.percentage}}%)</span></div>
        </div>
        <Transition name="expand"><div v-if="expanded==='ease'&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><div class="stat-expand-list"><div v-for="c in displayedCards" :key="c.id" class="deck-card" :class="{expanded:detail===c.id}" @click="toggleCard($event,c)"><span class="sr-bar" :style="{background:getMasteryColor(c)}"></span><div class="deck-card-main"><div class="deck-card-mastery">{{getMasteryIcon(c)}}</div><div class="deck-card-title" v-html="getTitle(c)" @click.capture="stopIfAudio"></div><div class="deck-card-hint" v-html="getHint(c)"></div><Transition name="expand"><div v-if="detail===c.id" class="deck-card-content" v-html="renderAnki(c)" @click.capture="stopIfAudio"></div></Transition><div class="deck-card-source">{{c.model||'Anki'}} · Ease {{((c.learning?.ease||2.5)*100).toFixed(0)}}%</div></div></div></div><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>
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
        <Transition name="expand"><div v-if="expanded==='fsrs'&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><div class="stat-expand-list"><div v-for="c in displayedCards" :key="c.id" class="deck-card" :class="{expanded:detail===c.id}" @click="toggleCard($event,c)"><span class="sr-bar" :style="{background:getMasteryColor(c)}"></span><div class="deck-card-main"><div class="deck-card-mastery">{{getMasteryIcon(c)}}</div><div class="deck-card-title" v-html="getTitle(c)" @click.capture="stopIfAudio"></div><div class="deck-card-hint" v-html="getHint(c)"></div><Transition name="expand"><div v-if="detail===c.id" class="deck-card-content" v-html="renderAnki(c)" @click.capture="stopIfAudio"></div></Transition><div class="deck-card-source">{{c.model||'Anki'}} · 复习 {{c.learning?.reps||0}}次</div></div></div></div><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>
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
        <Transition name="expand"><div v-if="expanded==='difficulty'&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><div class="stat-expand-list"><div v-for="c in displayedCards" :key="c.id" class="deck-card" :class="{expanded:detail===c.id}" @click="toggleCard($event,c)"><span class="sr-bar" :style="{background:getMasteryColor(c)}"></span><div class="deck-card-main"><div class="deck-card-mastery">{{getMasteryIcon(c)}}</div><div class="deck-card-title" v-html="getTitle(c)" @click.capture="stopIfAudio"></div><div class="deck-card-hint" v-html="getHint(c)"></div><Transition name="expand"><div v-if="detail===c.id" class="deck-card-content" v-html="renderAnki(c)" @click.capture="stopIfAudio"></div></Transition><div class="deck-card-source">{{c.model||'Anki'}} · 复习 {{c.learning?.reps||0}}次</div></div></div></div><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>
      </div>

      <!-- 间隔分布 -->
      <div v-if="totalRatingDist.length" class="stat-panel">
        <div class="panel-title">间隔分布</div>
        <div class="card-rings">
          <svg viewBox="0 0 240 240" style="width:100%;max-width:200px;height:auto">
            <g v-for="(r,i) in calcRings(totalRatingDist)" :key="i">
              <circle cx="120" cy="120" :r="r.r" fill="none" stroke="var(--b3-theme-background)" :stroke-width="r.w"/>
              <circle cx="120" cy="120" :r="r.r" fill="none" :stroke="r.color" :stroke-width="r.w" :stroke-dasharray="`${r.dash} ${r.circum}`" transform="rotate(-90 120 120)"/>
            </g>
          </svg>
          <div class="ring-legend">
            <div v-for="d in totalRatingDist" :key="d.label" class="ring-item" :class="{active:expanded==='rating'&&expandVal===d.type}" @click="expand('rating',d.type)">
              <span class="ring-dot" :style="{background:d.color}"></span>
              <span class="ring-label">{{d.label}}</span>
              <span class="ring-value">{{d.value}}</span>
            </div>
          </div>
        </div>
        <Transition name="expand"><div v-if="expanded==='rating'&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><div class="stat-expand-list"><div v-for="c in displayedCards" :key="c.id" class="deck-card" :class="{expanded:detail===c.id}" @click="toggleCard($event,c)"><span class="sr-bar" :style="{background:getMasteryColor(c)}"></span><div class="deck-card-main"><div class="deck-card-mastery">{{getMasteryIcon(c)}}</div><div class="deck-card-title" v-html="getTitle(c)" @click.capture="stopIfAudio"></div><div class="deck-card-hint" v-html="getHint(c)"></div><Transition name="expand"><div v-if="detail===c.id" class="deck-card-content" v-html="renderAnki(c)" @click.capture="stopIfAudio"></div></Transition><div class="deck-card-source">{{c.model||'Anki'}} · 复习 {{c.learning?.reps||0}}次</div></div></div></div><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>
      </div>

      <!-- 复习间隔 -->
      <div v-if="intervals.length" class="stat-panel">
        <div class="panel-title">复习间隔</div>
        <div v-for="r in intervals" :key="r.label" class="sr-rating-bar" :class="{active:expanded==='interval'&&expandVal===r.label}" @click="expand('interval',r.label)">
          <div class="sr-rating-fill" :style="{width:r.percentage+'%',background:'var(--b3-theme-primary)'}"></div>
          <div class="sr-rating-text"><span>{{r.label}}</span><span>{{r.count}} ({{r.percentage}}%)</span></div>
        </div>
        <Transition name="expand"><div v-if="expanded==='interval'&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><div class="stat-expand-list"><div v-for="c in displayedCards" :key="c.id" class="deck-card" :class="{expanded:detail===c.id}" @click="toggleCard($event,c)"><span class="sr-bar" :style="{background:getMasteryColor(c)}"></span><div class="deck-card-main"><div class="deck-card-mastery">{{getMasteryIcon(c)}}</div><div class="deck-card-title" v-html="getTitle(c)" @click.capture="stopIfAudio"></div><div class="deck-card-hint" v-html="getHint(c)"></div><Transition name="expand"><div v-if="detail===c.id" class="deck-card-content" v-html="renderAnki(c)" @click.capture="stopIfAudio"></div></Transition><div class="deck-card-source">{{c.model||'Anki'}} · 复习 {{c.learning?.reps||0}}次</div></div></div></div><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>
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
        <Transition name="expand"><div v-if="expanded==='date'&&filtered.length" class="stat-expand"><div class="stat-expand-title">{{expandTitle}} ({{filtered.length}}张)</div><div class="stat-expand-list"><div v-for="c in displayedCards" :key="c.id" class="deck-card" :class="{expanded:detail===c.id}" @click="toggleCard($event,c)"><span class="sr-bar" :style="{background:getMasteryColor(c)}"></span><div class="deck-card-main"><div class="deck-card-mastery">{{getMasteryIcon(c)}}</div><div class="deck-card-title" v-html="getTitle(c)" @click.capture="stopIfAudio"></div><div class="deck-card-hint" v-html="getHint(c)"></div><Transition name="expand"><div v-if="detail===c.id" class="deck-card-content" v-html="renderAnki(c)" @click.capture="stopIfAudio"></div></Transition><div class="deck-card-source">{{c.model||'Anki'}} · 复习 {{c.learning?.reps||0}}次</div></div></div></div><button v-if="hasMore" class="stat-load-more" @click="loadMore">加载更多 ({{filtered.length-displayCount}})</button></div></Transition>
      </div>

      <div v-if="!totalRatingDist.length&&!intervals.length&&!cal.data.length" class="sr-empty">暂无统计数据</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {ref,computed,watch,onMounted,onUnmounted} from 'vue'
import {getDictName,renderDictCard} from '@/core/dictionary'
import {extractAnkiTitle,extractAnkiHint,playAudio,setupImageLazyLoad} from './utils'
import type{DailyStats,TotalStats,IntervalStats,RetentionStats,ForecastStats} from './types'

const props=defineProps<{todayStats:DailyStats,historyStats:DailyStats[],totalStats:TotalStats,intervals:IntervalStats,retention:RetentionStats,forecast:ForecastStats,allCards:any[]}>()

const tab=ref<'today'|'total'>('today'),period=ref<'week'|'month'>('week'),calGrid=ref<HTMLElement|null>(null)
const expanded=ref(''),expandVal=ref<any>(),filtered=ref<any[]>([]),detail=ref<string|null>(null)
const fsrsEnabled=ref(false),fsrsRetention=ref(0.9)
let obs:IntersectionObserver|null=null

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
const MASTERY_COLORS=['#ef4444','#f59e0b','#10b981','#3b82f6']
const MASTERY_ICONS=['😐','🙂','😊','🤩']
const INTERACTIVE=['button','a','input','textarea','select','.b3-button']

// 辅助函数
const calcRings=(dist:any[])=>dist.map((d,i)=>{const r=100-i*20,w=14,c=2*Math.PI*r;return{r,w,circum:c,dash:(d.percent/100)*c,color:d.color}})
const calcRadar=(dist:any[])=>{
  const n=dist.length
  const pts=Array.from({length:n},(_,i)=>{const a=(i*2*Math.PI/n)-Math.PI/2;return{x:Math.cos(a),y:Math.sin(a)}})
  const max=Math.max(...dist.map(d=>d.count),1)
  const data=dist.map((d,i)=>{const r=d.count/max;return{x:pts[i].x*r*88,y:pts[i].y*r*88}})
  const labels=dist.map((d,i)=>{const o=28;return{x:pts[i].x*(88+o),y:pts[i].y*(88+o)+4,label:d.label}})
  return{points:pts,data,labels,polygon:data.map(p=>`${p.x},${p.y}`).join(' ')}
}

const curve=computed(()=>{
  const days=period.value==='week'?7:30,pts=EBBINGHAUS.filter(p=>p.days<=days)
  if(props.historyStats.length){
    const h=props.historyStats.slice(-days),avg=h.reduce((s,d)=>s+d.correctRate,0)/h.length,adj=avg>0?avg/70:1
    return pts.map(p=>{const d=new Date();d.setDate(d.getDate()-(days-p.days));return{date:d.toISOString().split('T')[0],retention:Math.min(100,p.retention*adj)}})
  }
  return pts.map(p=>{const d=new Date();d.setDate(d.getDate()-(days-p.days));return{date:d.toISOString().split('T')[0],retention:p.retention}})
})

// 今日统计
const todayCards=computed(()=>{
  const todayStart=new Date();todayStart.setHours(0,0,0,0);const todayStartTime=todayStart.getTime()
  const todayReviewed=props.allCards.filter(c=>(c.learning?.lastReview||0)>=todayStartTime)
  const newToday=todayReviewed.filter(c=>(c.learning?.reps||0)===1).length
  const reviewToday=todayReviewed.filter(c=>(c.learning?.reps||0)>1).length
  
  return[
    {value:newToday,label:'今日新学',type:'new'},
    {value:reviewToday,label:'今日复习',type:'review'},
    {value:(props.todayStats.correctRate||0)+'%',label:'正确率',type:null},
    {value:props.totalStats.streak||0,label:'连续天数',type:null}
  ]
})

// 总计统计
const totalCards=computed(()=>{
  const allCount=props.allCards.length
  const reviewedCount=props.allCards.filter(c=>(c.learning?.reps||0)>0).length
  return[
    {value:allCount,label:'总卡片',type:'all'},
    {value:reviewedCount,label:'已复习',type:'reviewed'},
    {value:(props.totalStats.avgCorrectRate||0)+'%',label:'平均正确率',type:null},
    {value:props.totalStats.streak||0,label:'连续天数',type:null}
  ]
})

// 今日评分分布
const todayRatingDist=computed(()=>{
  const r=props.todayStats.ratings
  if(!r)return[]
  const t=r.again+r.hard+r.good+r.easy
  if(t===0)return[]
  return[
    {label:'重来',value:r.again,percent:Math.round(r.again/t*100)||0,color:'#ef4444',type:'again'},
    {label:'困难',value:r.hard,percent:Math.round(r.hard/t*100)||0,color:'#f59e0b',type:'hard'},
    {label:'良好',value:r.good,percent:Math.round(r.good/t*100)||0,color:'#10b981',type:'good'},
    {label:'简单',value:r.easy,percent:Math.round(r.easy/t*100)||0,color:'#3b82f6',type:'easy'}
  ].filter(i=>i.value>0)
})

// 总计间隔分布
const totalRatingDist=computed(()=>{
  const dist={again:0,hard:0,good:0,easy:0}
  props.allCards.forEach(c=>{
    const r=c.learning?.reps||0
    if(r===0)return
    const i=Math.floor((c.learning?.interval||0)/1440)
    if(i<1)dist.again++
    else if(i<4)dist.hard++
    else if(i<15)dist.good++
    else dist.easy++
  })
  const t=dist.again+dist.hard+dist.good+dist.easy
  if(t===0)return[]
  return[
    {label:'<1天',value:dist.again,percent:Math.round(dist.again/t*100)||0,color:'#ef4444',type:'again'},
    {label:'1-3天',value:dist.hard,percent:Math.round(dist.hard/t*100)||0,color:'#f59e0b',type:'hard'},
    {label:'4-14天',value:dist.good,percent:Math.round(dist.good/t*100)||0,color:'#10b981',type:'good'},
    {label:'≥15天',value:dist.easy,percent:Math.round(dist.easy/t*100)||0,color:'#3b82f6',type:'easy'}
  ].filter(i=>i.value>0)
})

const fsrsStats=computed(()=>{
  if(!fsrsEnabled.value)return{enabled:false,count:0,retention:0.9,avgStability:0,avgDifficulty:0,difficultyDist:[],radar:null}
  
  const cards=props.allCards.filter(c=>{
    const s=c.learning?.stability
    const d=c.learning?.difficulty
    return s!==undefined&&s!==null&&d!==undefined&&d!==null&&s>0
  })
  
  if(cards.length===0){
    const dist=[
      {label:'简单',count:0,percent:25,color:'#10b981'},
      {label:'中等',count:0,percent:25,color:'#3b82f6'},
      {label:'困难',count:0,percent:25,color:'#f59e0b'},
      {label:'极难',count:0,percent:25,color:'#ef4444'}
    ]
    return{enabled:true,count:0,retention:fsrsRetention.value,avgStability:0,avgDifficulty:0,difficultyDist:dist,radar:calcRadar(dist)}
  }
  
  const avgStability=cards.reduce((s,c)=>s+(c.learning?.stability||0),0)/cards.length
  const avgDifficulty=cards.reduce((s,c)=>s+(c.learning?.difficulty||0),0)/cards.length
  
  const dist=[
    {label:'简单',range:[0,3],count:0,color:'#10b981'},
    {label:'中等',range:[3,5],count:0,color:'#3b82f6'},
    {label:'困难',range:[5,7],count:0,color:'#f59e0b'},
    {label:'极难',range:[7,10],count:0,color:'#ef4444'}
  ]
  
  cards.forEach(c=>{
    const d=c.learning?.difficulty||0
    if(d<3)dist[0].count++
    else if(d<5)dist[1].count++
    else if(d<7)dist[2].count++
    else dist[3].count++
  })
  
  const maxCount=Math.max(...dist.map(d=>d.count),1)
  const difficultyDist=dist.map(d=>({...d,percent:maxCount>0?Math.round(d.count/maxCount*100):25}))
  
  return{enabled:true,count:cards.length,retention:fsrsRetention.value,avgStability,avgDifficulty,difficultyDist,radar:calcRadar(difficultyDist)}
})

const fsrsCards=computed(()=>[
  {value:(fsrsStats.value.retention*100).toFixed(0)+'%',label:'目标记忆率',type:null},
  {value:fsrsStats.value.count,label:'FSRS 卡片',type:'fsrs'},
  {value:fsrsStats.value.avgStability.toFixed(1),label:'平均稳定性',type:null},
  {value:fsrsStats.value.avgDifficulty.toFixed(1),label:'平均难度',type:null}
])

const intervals=computed(()=>props.intervals?.ranges?.filter(r=>r.count>0)||[])

const calcDist=(cards:any[],fn:(c:any)=>number,ranges:any[])=>{
  const counts=ranges.map(r=>({...r,count:cards.filter(c=>fn(c)>=r.min&&fn(c)<r.max).length}))
  const total=counts.reduce((s,c)=>s+c.count,0)
  return counts.map(c=>({...c,percentage:total?Math.round(c.count/total*100):0})).filter(c=>c.count>0)
}

const reviewed=computed(()=>props.allCards.filter(c=>(c.learning?.reps||0)>0))

const lapsesData=computed(()=>calcDist(reviewed.value,c=>c.learning?.lapses||0,[{label:'0次',min:0,max:1,color:'#10b981',range:'0'},{label:'1-2次',min:1,max:3,color:'#3b82f6',range:'1-2'},{label:'3-5次',min:3,max:6,color:'#f59e0b',range:'3-5'},{label:'>5次',min:6,max:Infinity,color:'#ef4444',range:'>5'}]))

const efficiencyData=computed(()=>{
  if(!reviewed.value.length)return[]
  const data=[
    {label:'高效掌握',minReps:1,maxReps:5,minDays:7,color:'#10b981'},
    {label:'稳定进步',minReps:1,maxReps:10,minDays:1,maxDays:7,color:'#3b82f6'},
    {label:'需要巩固',minReps:5,maxReps:Infinity,maxDays:7,color:'#f59e0b'},
    {label:'困难卡片',minReps:10,maxReps:Infinity,maxDays:1,color:'#ef4444'}
  ].map(g=>{
    const cards=reviewed.value.filter(c=>{
      const reps=c.learning?.reps||0,days=Math.floor((c.learning?.interval||0)/1440)
      return reps>=g.minReps&&reps<g.maxReps&&days>=(g.minDays||0)&&days<(g.maxDays||Infinity)
    })
    return cards.length?{...g,count:cards.length,avgReps:Math.round(cards.reduce((s,c)=>s+(c.learning?.reps||0),0)/cards.length),avgDays:Math.round(cards.reduce((s,c)=>s+Math.floor((c.learning?.interval||0)/1440),0)/cards.length),range:g.label}:null
  }).filter(Boolean)
  if(!data.length)return[]
  const maxReps=Math.max(...data.map(d=>d.avgReps),10),maxDays=Math.max(...data.map(d=>d.avgDays),30),maxCount=Math.max(...data.map(d=>d.count),1)
  return data.map(d=>({...d,x:50+d.avgReps/maxReps*330,y:210-d.avgDays/maxDays*180,r:Math.max(8,Math.min(30,d.count/maxCount*20+8))}))
})

const effTicks=computed(()=>{
  if(!efficiencyData.value.length)return{x:[],y:[]}
  const maxReps=Math.max(...efficiencyData.value.map(d=>d.avgReps),10),maxDays=Math.max(...efficiencyData.value.map(d=>d.avgDays),30)
  return{x:[0,Math.round(maxReps*0.25),Math.round(maxReps*0.5),Math.round(maxReps*0.75),maxReps],y:[0,Math.round(maxDays*0.25),Math.round(maxDays*0.5),Math.round(maxDays*0.75),maxDays]}
})

const easeData=computed(()=>calcDist(reviewed.value,c=>c.learning?.ease||2.5,[{label:'困难(<130%)',min:0,max:1.3,color:'#ef4444',range:'<1.3'},{label:'一般(130-200%)',min:1.3,max:2.0,color:'#f59e0b',range:'1.3-2.0'},{label:'良好(200-250%)',min:2.0,max:2.5,color:'#3b82f6',range:'2.0-2.5'},{label:'优秀(≥250%)',min:2.5,max:Infinity,color:'#10b981',range:'≥2.5'}]))

const curvePoints=computed(()=>{
  const d=curve.value;if(!d.length)return[]
  const w=W-P*2,h=H-P*2,step=w/Math.max(d.length-1,1)
  return d.map((v,i)=>({x:P+i*step,y:H-P-(v.retention/100)*h}))
})

const curvePath=computed(()=>{
  const p=curvePoints.value;if(!p.length)return''
  if(p.length===1)return`M ${p[0].x-2} ${p[0].y} A 2 2 0 1 1 ${p[0].x+2} ${p[0].y} A 2 2 0 1 1 ${p[0].x-2} ${p[0].y}`
  let path=`M ${p[0].x} ${p[0].y}`;for(let i=1;i<p.length;i++)path+=` L ${p[i].x} ${p[i].y}`;return path
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

const fmt=(d:string)=>{const dt=new Date(d);return`${dt.getMonth()+1}/${dt.getDate()}`}
const close=()=>{expanded.value='';expandVal.value=undefined;filtered.value=[];displayCount.value=8}

const displayCount=ref(8)
const displayedCards=computed(()=>filtered.value.slice(0,displayCount.value))
const hasMore=computed(()=>filtered.value.length>displayCount.value)
const loadMore=()=>{displayCount.value+=8}

const expand=(type:string,val?:any)=>{
  if(expanded.value===type&&expandVal.value===val){close();return}
  expanded.value=type;expandVal.value=val;displayCount.value=8
  const today=new Date().toISOString().split('T')[0]
  const todayStart=new Date();todayStart.setHours(0,0,0,0);const todayStartTime=todayStart.getTime()
  filtered.value=props.allCards.filter(c=>{
    const l=c.learning,r=l?.reps||0,i=Math.floor((l?.interval||0)/1440),lr=l?.lastReview||0
    const s=l?.stability,d=l?.difficulty
    if(type==='new')return lr>=todayStartTime&&r===1
    if(type==='review')return lr>=todayStartTime&&r>1
    if(type==='all')return true
    if(type==='reviewed')return r>0
    if(type==='fsrs')return s!==undefined&&s!==null&&d!==undefined&&d!==null&&s>0
    if(type==='difficulty'){
      if(!s||s===undefined||s===null||s<=0)return false
      if(!d||d===undefined||d===null)return false
      if(val==='easy')return d<3
      if(val==='medium')return d>=3&&d<5
      if(val==='hard')return d>=5&&d<7
      if(val==='veryhard')return d>=7
      return false
    }
    if(type==='todayRating'){
      // 今日评分无法精确筛选（卡片无评分历史），显示今天复习的所有卡片
      return lr>=todayStartTime
    }
    if(type==='rating'){if(r===0)return false;if(val==='again')return i<1;if(val==='hard')return i>=1&&i<4;if(val==='good')return i>=4&&i<15;if(val==='easy')return i>=15}
    if(type==='date')return lr&&new Date(lr).toISOString().split('T')[0]===val
    if(type==='interval'){if(val==='<1天')return i<1;if(val==='1-7天')return i>=1&&i<7;if(val==='1-4周')return i>=7&&i<28;if(val==='1-3月')return i>=28&&i<90;if(val==='3-6月')return i>=90&&i<180;if(val==='>6月')return i>=180}
    if(type==='lapses'){
      const lapses=l?.lapses||0
      if(val==='0')return lapses<1
      if(val==='1-2')return lapses>=1&&lapses<3
      if(val==='3-5')return lapses>=3&&lapses<6
      if(val==='>5')return lapses>=6
    }
    if(type==='efficiency'){
      const reps=r,days=i
      if(val==='高效掌握')return reps>=1&&reps<5&&days>=7
      if(val==='稳定进步')return reps>=1&&reps<10&&days>=1&&days<7
      if(val==='需要巩固')return reps>=5&&days<7
      if(val==='困难卡片')return reps>=10&&days<1
    }
    if(type==='ease'){
      const ease=l?.ease||2.5
      if(val==='<1.3')return ease<1.3
      if(val==='1.3-2.0')return ease>=1.3&&ease<2.0
      if(val==='2.0-2.5')return ease>=2.0&&ease<2.5
      if(val==='≥2.5')return ease>=2.5
    }
    return false
  })
}



const expandTitle=computed(()=>{
  const t=expanded.value,v=expandVal.value
  if(t==='new')return'今日新学';if(t==='review')return'今日复习'
  if(t==='all')return'所有卡片';if(t==='reviewed')return'已复习卡片'
  if(t==='fsrs')return'FSRS 卡片'
  if(t==='difficulty'){
    const labels={'easy':'简单','medium':'中等','hard':'困难','veryhard':'极难'}
    return`难度: ${labels[v as keyof typeof labels]||v}`
  }
  if(t==='todayRating')return`今日评分: ${LABELS[v as keyof typeof LABELS]||v}`
  if(t==='rating'){
    const labels={'again':'<1天','hard':'1-3天','good':'4-14天','easy':'≥15天'}
    return`间隔: ${labels[v as keyof typeof labels]||v}`
  }
  if(t==='date')return`日期: ${v}`;if(t==='interval')return`间隔: ${v}`
  if(t==='lapses')return`失误: ${v}次`
  if(t==='efficiency')return`效率: ${v}`
  if(t==='ease')return`记忆强度: ${v}`
  return''
})

// 辅助函数
const getMasteryLevel=(c:any)=>{const i=Math.floor((c.learning?.interval||0)/1440);return i<1?1:i<4?2:i<15?3:4}
const getMasteryColor=(c:any)=>MASTERY_COLORS[getMasteryLevel(c)-1]
const getMasteryIcon=(c:any)=>MASTERY_ICONS[getMasteryLevel(c)-1]
const getTitle=extractAnkiTitle
const getHint=extractAnkiHint
const renderAnki=(c:any)=>c.modelCss?`<style>${c.modelCss}</style>${c.back}`:c.back
const stopIfAudio=(e:Event)=>{if((e.target as HTMLElement).closest('.anki-audio'))e.stopPropagation()}

const toggleCard=(e:Event,c:any)=>{
  const t=e.target as HTMLElement
  if(INTERACTIVE.some(s=>t.matches(s)||t.closest(s)))return
  const was=detail.value===c.id
  detail.value=was?null:c.id
  if(!was)setTimeout(()=>document.querySelectorAll('img[data-cid]').forEach(el=>{const img=el as HTMLImageElement,src=img.getAttribute('src');if(!src||!src.startsWith('blob:'))obs?.observe(img)}),100)
}

onMounted(()=>{obs=setupImageLazyLoad();document.addEventListener('click',playAudio,true)})
onUnmounted(()=>{obs?.disconnect();document.removeEventListener('click',playAudio,true)})
watch(()=>filtered.value,()=>setTimeout(()=>document.querySelectorAll('img[data-cid]').forEach(el=>{const img=el as HTMLImageElement,src=img.getAttribute('src');if(!src||!src.startsWith('blob:'))obs?.observe(img)}),100))
</script>

<style scoped lang="scss">
@use './deck.scss';
</style>
