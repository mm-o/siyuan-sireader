<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, afterUpdate } from 'svelte';
  import { loadAllSites, cmsSearch, cmsDetail, cmsHome, cmsListByType, getHomeSiteKey, cmsDetailInfo } from '../core/tvbox';
  import { searchMovie, getMovieDetail } from '../core/douban';
  // @ts-ignore
  import Tabs from './Tabs.svelte';
  import { showMessage } from 'siyuan';
  import '../styles/components.scss';
  export let className = '', hidden = false, i18n: any = {}, activeTabId = 'tvbox', plugin: any;

  // 与 PlayList 兼容的最小状态，专注复用结构与样式
  let state: any = {
    tab: '',
    tags: [] as string[],
    items: [] as any[],
    searching: false,
    search: '',
    sites: [] as any[],
    currentSiteKey: '',
    categories: [] as { id: string, name: string }[],
    loading: false,
    refs: {} as any,
    page: 1,
    hasMore: true,
    detail: null as any,
    detailSourceIndex: 0,
    detailLoading: false,
    detailPlotExpanded: false,
    detailScrollTop: 0,
    currentPlayingUrl: '',
    // 聚合搜索用
    searchSites: [] as any[],
    searchIndex: 0,
    searchSeen: new Set<string>(),
  };
  const cache:any=(window as any).__tvboxCache||(((window as any).__tvboxCache)={sites:null,cats:{},items:{},search:{}});


  function imgFallback(e: Event){ const t=e.currentTarget as HTMLImageElement; if(!t||(t as any).__fallback) return; (t as any).__fallback=true; t.src='/plugins/siyuan-media-player/assets/images/video.png'; }

const standardizeItem=(v:any)=>({ ...v, id:String(v.id||v.vod_id||v.vid||v.ids||''), title:v.title||v.vod_name||v.name||String(v.id||v.vod_id||''), pic:v.pic||v.vod_pic||v.cover });
const dispatch = createEventDispatcher();
  $: filteredItems = ((q)=> q ? state.items.filter((it:any)=>(it.title||'').toLowerCase().includes(q)) : state.items)(state.search.trim().toLowerCase());
  // 统一获得可用站点
  function ensureSite(): any { const k = getHomeSiteKey?.() || ''; return state.sites.find((s:any)=>s.name===state.currentSiteKey||s.key===state.currentSiteKey) || (k && state.sites.find((s:any)=>s.name?.includes(k)||s.key===k)) || null; }

  async function loadCategoryItems(id:string,p=1,append=false){ const s=ensureSite(); if(!s) return; state.loading=true; try{ if(p===1){ const ck=(s.name||s.key)+'|'+id, cached=cache.items[ck]; if(cached){ state.items=append?[...state.items,...cached]:cached; state.page=p; state.hasMore=!!cached.length; return; } } const items=(await cmsListByType(s,id,p)||[]).map(standardizeItem); if(p===1){ cache.items[(s.name||s.key)+'|'+id]=items; } state.items=append?[...state.items,...items]:items; state.page=p; state.hasMore=!!items.length; }catch{ showMessage('加载列表失败'); } finally{ state.loading=false; } }

  async function loadCategoriesForSite(){ const s=ensureSite(); if(!s){ state.tags=[]; state.categories=[]; return; } const key=s.name||s.key; state.currentSiteKey=key; const cachedCats=cache.cats[key]; if(cachedCats?.length){ state.categories=cachedCats; state.tags=cachedCats.map((c:any)=>c.name).filter(Boolean); state.tab=state.tags[0]||''; state.search=''; state.searching=false; state.page=1; const first=cachedCats[0]; if(first){ const ck=key+'|'+first.id, ci=cache.items[ck]; if(ci){ state.items=ci; state.hasMore=!!ci.length; return; } } } state.loading=true; try{ const cats=await cmsHome(s); cache.cats[key]=cats; state.categories=cats; state.tags=cats.map((c:any)=>c.name).filter(Boolean); state.tab=state.tags[0]||''; state.search=''; state.searching=false; state.page=1; state.hasMore=true; if(cats[0]) await loadCategoryItems(cats[0].id,1,false); else { const { cmsListAll } = await import('../core/tvbox'); const list=(await cmsListAll(s,1))||[]; state.items=list.map(standardizeItem); state.tags=['最新']; state.tab='最新'; state.hasMore=!!list.length; } } catch{ state.categories=[]; state.tags=[]; state.items=[]; showMessage('加载首页分类失败'); } finally{ state.loading=false; } }

  const setTab = async (tag:string)=>{ state.tab=tag; state.search=''; state.searching=false; state.page=1; state.hasMore=true; const c=state.categories.find((x:any)=>x.name===tag); if(c){ const s=ensureSite(); const ck=(s?.name||s?.key||'')+'|'+c.id; const cached=cache.items[ck]; state.loading=true; state.items=cached||[]; await loadCategoryItems(c.id,1,false); } };

  const input = async (e:Event)=>{ if(e instanceof KeyboardEvent && e.key!=='Enter') return; const v=((e.target as HTMLInputElement).value||'').trim(); state.search=v; if(!v) return state.searching=false; await doSearch(v); };

  async function doSearch(keyword: string) {
    if (!keyword) return;
    state.searchSites = (state.sites||[]).filter((s:any)=>/^https?:/i.test(s.api||''));
    const cv = cache.search[keyword];
    state.searchIndex = 0; state.searchSeen = new Set<string>();
    if (cv?.length) { state.items = cv; for (const it of cv) state.searchSeen.add(((it.title||it.vod_name||it.id)+'|'+(it.site?.name||it.site?.key||''))); }
    else { state.items = []; }
    state.page = 1; state.hasMore = state.searchSites.length>0; state.loading = true;
    await searchNextBatch(keyword);
  }
  async function searchNextBatch(keyword: string) {
    if (state.search !== keyword) return;
    const batch = state.searchSites.slice(state.searchIndex, state.searchIndex + 6);
    state.searchIndex += batch.length;
    const rs = await Promise.allSettled(batch.map((s:any)=>cmsSearch(s, keyword).catch(()=>[])));
    const list = rs.flatMap(r=>r.status==='fulfilled'?(r.value||[]):[]);
    for (const it of list) { const k=(it.title||it.vod_name||it.id)+'|'+(it.site?.name||it.site?.key||''); if (!state.searchSeen.has(k)) { state.searchSeen.add(k); state.items.push(standardizeItem(it)); } }
    state.items = state.items; // trigger update
    if (state.loading && state.items.length>0) state.loading = false;
    state.hasMore = state.searchIndex < state.searchSites.length;
    if (!state.hasMore) cache.search[keyword] = state.items;
    if (state.hasMore && state.search === keyword) setTimeout(()=>searchNextBatch(keyword), 0); else state.loading = false;
  }

  async function refreshSites(){ try{ state.loading=true; state.sites = cache.sites || await loadAllSites(plugin) || []; cache.sites = state.sites; state.currentSiteKey=''; state.items=[]; state.page=1; state.hasMore=true; await loadCategoriesForSite(); }catch{ showMessage('加载接口失败'); } finally{ state.loading=false; } }

  const play = async (item: any, urlOverride?: string) => {
    try {
      const site = item.site || ensureSite(), ep0 = state.detail?.item?.id === item.id ? (state.detail?.sources?.[state.detailSourceIndex]?.episodes?.[0]?.url || '') : '', url = urlOverride || ep0 || await cmsDetail(site, item.rawId || item.id);
      if (!url) return showMessage('未找到播放地址');
      state.currentPlayingUrl = url;
      const eps = state.detail?.sources?.[state.detailSourceIndex]?.episodes || [], i = urlOverride ? eps.findIndex((e: any) => e.url === urlOverride) : -1, ep = i >= 0 ? eps[i] : null;
      const epNum = i >= 0 ? i + 1 : 0;
      const protocolUrl = (await import('../core/tvbox')).generateTvboxProtocol(item.title || item.vod_name, epNum);
      dispatch('play', { ...item, title: ep ? `${item.title} - ${ep.name || `第${String(epNum).padStart(2, '0')}集`}` : item.title, url, site, source: 'tvbox', originalUrl: protocolUrl, tvboxTitle: item.title || item.vod_name, tvboxEpisode: epNum });
    } catch (e) { showMessage(`解析失败: ${e?.message || e}`); }
  };

  const nav = async (d: number) => { if (!state.detail || !state.currentPlayingUrl) return false; const eps = state.detail.sources?.[state.detailSourceIndex]?.episodes || [], i = eps.findIndex((e: any) => e.url === state.currentPlayingUrl), n = eps[i + d]; if (n) { await play(state.detail.item, n.url); return true; } return false; };
  export const hasDetail = () => !!state.detail;
  export const playNext = () => nav(1);
  export const playPrev = () => nav(-1);

  // 详情
  export const showDetail = async (item: any, existingDetail?: any) => {
    state.detailLoading = true;
    state.detail = { title: item.title, pic: item.pic, item }; // Show basic info immediately

    try {
      const site = item.site || ensureSite();
      // 如果已有详情信息，直接使用；否则获取
      const tvboxInfoPromise = existingDetail ? Promise.resolve(existingDetail) : cmsDetailInfo(site, item.rawId || item.id);
      // Fetch TVBox and Douban data in parallel for speed
      const [tvboxInfo, doubanMatch] = await Promise.all([
        tvboxInfoPromise,
        searchMovie(item.title.replace(/第.*季/, '').trim()),
      ]);

      let finalDetail = { ...tvboxInfo, item };

      if (doubanMatch?.id) {
        const doubanDetail = await getMovieDetail(doubanMatch.id);
        if (doubanDetail) {
          // Merge: Prioritize Douban's rich metadata, but keep TVBox's playback sources
          finalDetail = {
            ...finalDetail, // Keep TVBox sources
            title: doubanDetail.title,
            original_title: doubanDetail.original_title,
            pic: doubanDetail.pic?.large || doubanDetail.pic?.normal || finalDetail.pic,
            genres: doubanDetail.genres,
            rating: doubanDetail.rating,
            directors: doubanDetail.directors,
            casts: doubanDetail.actors,
            year: doubanDetail.year,
            countries: doubanDetail.countries,
            summary: doubanDetail.intro,
            aka: doubanDetail.aka,
            durations: doubanDetail.durations,
            trailers: doubanDetail.trailers,
            pubdate: doubanDetail.pubdate,
            languages: doubanDetail.languages,
            episodes_count: doubanDetail.episodes_count,
          };
        }
      }
      if (finalDetail?.sources) finalDetail.sources = finalDetail.sources.map((s:any)=>({ ...s, episodes:(s.episodes||[]).slice().sort((a:any,b:any)=>Number(/m3u8/i.test(b.url))-Number(/m3u8/i.test(a.url))) }));
      const preferIdx = Math.max(0,(finalDetail.sources||[]).findIndex((s:any)=>(s.episodes||[]).some((e:any)=>/m3u8/i.test(e.url))));
      state.detail = finalDetail;
      state.detailSourceIndex = preferIdx;
    } catch (e) {
      showMessage('加载详情失败');
      // Keep basic info on failure
    } finally {
      state.detailLoading = false;
    }
  };
  const hideDetail = () => { state.detail = null; state.currentPlayingUrl = ''; };

  // 懒加载下一页（仅分类列表，搜索时不触发）
  let loadMoreEl: HTMLDivElement;
  let io: IntersectionObserver | null = null;
  $: canObserve = state.hasMore;
  $: isLoadingMore = state.loading && state.items.length > 0 && state.hasMore;

  async function loadNextPage() {
    if (state.loading || !state.hasMore) return;
    if (state.search.trim()) return await searchNextBatch(state.search);
    const cat = state.categories.find((c: any) => c.name === state.tab);
    if (!cat) return;
    await loadCategoryItems(cat.id, state.page + 1, true);
  }
  function setupObserver() {
    if (io) io.disconnect();
    if (!loadMoreEl || !canObserve) { io = null; return; }
    io = new IntersectionObserver((entries) => entries.forEach(e => e.isIntersecting && loadNextPage()), { threshold: 0.1 });
    io.observe(loadMoreEl);
  }
  onDestroy(()=>{ io?.disconnect(); io = null; });
  afterUpdate(setupObserver);

  onMount(async () => {
    try {
      state.loading = true;
      await loadTvboxSourcesScript();
      await refreshSites();
    } catch (e) {
      showMessage('加载规则失败');
    } finally { state.loading = false; }
    // 监听外部请求打开详情页
    const handleShowDetail = (e: CustomEvent) => showDetail(e.detail.item, e.detail.existingDetail);
    window.addEventListener('tvbox:showDetail', handleShowDetail as any);
    return () => window.removeEventListener('tvbox:showDetail', handleShowDetail as any);
  });
  // 动态引入外部源配置脚本（docs/tvbox-sources.js），若未加载
  async function loadTvboxSourcesScript() {
    if ((window as any).tvboxSources) return;
    return new Promise<void>((resolve) => {
      const s = document.createElement('script');
      s.src = '/plugins/siyuan-media-player/docs/tvbox-sources.js';
      s.onload = () => resolve();
      s.onerror = () => resolve(); // 失败时按内置默认兜底
      document.head.appendChild(s);
    });
  }

</script>

<div class="panel {className}" class:hidden={hidden}>
  <Tabs {activeTabId} {i18n}><select slot="controls" class="panel-count b3-select" bind:value={state.currentSiteKey} on:change={loadCategoriesForSite} aria-label="切换站点" style="height:20px;padding:0 6px;border-radius:4px">{#each state.sites as s}<option value={s.name||s.key}>{s.name||s.key}</option>{/each}</select></Tabs>

  <!-- 固定标签栏（与 PlayList/Setting 结构一致） -->
  <div class="layout-tab-bar fn__flex">
    {#if state.searching}
      <input bind:this={state.refs.search} type="text" class="tab-input b3-text-field" placeholder="搜索片名…" bind:value={state.search} on:keydown={e => input(e)} on:blur={() => !state.search && (state.searching = false)}>
    {:else}
      <div class="item" role="button" tabindex="0" aria-label="搜索"
        on:click={() => (state.searching = true, setTimeout(() => state.refs.search?.focus(), 0))}
        on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (state.searching = true, setTimeout(() => state.refs.search?.focus(), 0))}
      ><span class="item__text"><svg class="svg"><use xlink:href="#iconSearch" /></svg></span></div>
    {/if}

    {#each state.tags as tag}
      <div class="item" class:item--focus={state.tab === tag && !state.searching} role="button" tabindex="0"
        on:click={() => setTab(tag)}
        on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && setTab(tag)}
      >
        <span class="item__text">{tag}</span>
      </div>
    {/each}
    <div class="fn__flex-1"></div>
  </div>

  <div class="panel-content grid-view tvbox">
    <!-- 列表 -->
    {#if filteredItems.length === 0}
      {#if state.loading}
        <div class="infinite-loader"><div class="spinner"></div><span>加载中…</span></div>
      {:else if state.search.trim() && state.items.length > 0}
        <div class="panel-empty">
          <div>已获取 {state.items.length} 项，但被搜索筛选隐藏</div>
          <button class="b3-button" on:click={() => { state = { ...state, search: '', searching: false }; }}>{'清空搜索'}</button>
        </div>
      {:else}
        <div class="panel-empty"><div>{i18n?.playList?.empty || '暂无内容'}</div></div>
      {/if}
    {:else}
      <div class="panel-items media-card-grid">
        {#each filteredItems as item (item.id)}
          <div class="panel-item grid media-card" on:click={() => showDetail(item)} on:dblclick={() => play(item)} on:keydown={(e)=> (e.key==='Enter'||e.key===' ') && showDetail(item)} role="button" tabindex="0">
            <div class="tvbox-poster media-card-thumbnail">
              <img loading="lazy" src={item.pic || item.thumbnail || '/plugins/siyuan-media-player/assets/images/video.png'} alt={item.title || item.vod_name} referrerpolicy="no-referrer" on:error={imgFallback} />
              <div class="tvbox-play-icon media-card-play-icon"></div>
              {#if item.remarks}<span class="badge media-card-badge">{item.remarks}</span>{/if}
              <span class="badge media-card-badge" style="left:6px;right:auto">{item.site?.name || item.site?.key}</span>
              <div class="tvbox-info media-card-info">
                <div class="tvbox-title media-card-title">{item.title || item.vod_name}</div>
                <div class="tvbox-meta media-card-subtitle">{[item.year, item.area, item.type_name, (item.site?.name || item.site?.key)].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          </div>
        {/each}
      </div>

      {#if isLoadingMore}
        <div class="infinite-loader"><div class="spinner"></div><span>加载中…</span></div>
        <div class="media-card-grid media-skeleton-grid">
          {#each Array(6) as _}
            <div class="panel-item grid media-card skeleton">
              <div class="media-card-thumbnail skeleton-box"></div>
            </div>
          {/each}
        </div>
      {/if}

      <div bind:this={loadMoreEl} style="height:1px;"></div>
    {/if}

    <!-- 详情页独立于列表显示 -->
    {#if state.detail}
      <div class="tvbox-detail modern-v2" role="dialog" aria-modal="true">
          <button class="b3-button b3-button--text back" on:click={hideDetail} aria-label="返回"><svg class="svg"><use xlink:href="#iconLeft"/></svg></button>

          <div class="detail-poster" style="transform: translateY(-{state.detailScrollTop / 2.5}px); opacity: {Math.max(0, 1 - state.detailScrollTop / 200)};">
            <img src={state.detail.pic || state.detail.item?.pic} alt="" referrerpolicy="no-referrer" on:error={imgFallback} />
          </div>

          <div class="detail-scroll-content" on:scroll={(e) => state.detailScrollTop = e.currentTarget.scrollTop}>
            <div class="detail-content-wrapper">
              <div class="main-info">
                <h1>{state.detail.title || state.detail.item?.title}</h1>
                {#if state.detail.original_title && state.detail.original_title !== state.detail.title}<p class="original-title">{state.detail.original_title}</p>{/if}
                <div class="meta">
                  <span class="label">评分：</span>
                  {#if state.detail.rating?.value > 0}
                    <span class="value">{state.detail.rating.value.toFixed(1)}</span>
                    <span class="stars-wrapper"><span class="stars-bg">★★★★★</span><span class="stars-fg" style="width: {state.detail.rating.star_count * 20}%;">★★★★★</span></span>
                    <span class="count">({state.detail.rating.count}人)</span>
                  {:else}
                    <span class="no-rating">暂无评分</span>
                  {/if}
                </div>
                <div class="meta-line">
                  <span>{state.detail.year}</span>
                  {#each state.detail.countries || [] as country}<span>{country}</span>{/each}
                  {#each state.detail.languages || [] as lang}<span>{lang}</span>{/each}
                  {#if state.detail.episodes_count}<span>共{state.detail.episodes_count}集</span>{/if}
                  {#each state.detail.durations || [] as d}<span>{d}</span>{/each}
                </div>
                <div class="tags">
                  {#each state.detail.genres || [] as tag}
                    <span class="tag">{tag}</span>
                  {/each}
                </div>
              </div>

              <div class="actions">
                <button class="play-button" on:click={() => play(state.detail.item)}><svg><use xlink:href="#iconPlay"/></svg> 播放</button>
              </div>

              <div class="section plot">
                <h2>剧情简介</h2>
                <p class:expanded={state.detailPlotExpanded}>
                  {((h)=>{const t=document.createElement('textarea');t.innerHTML=h;return t.value;})(state.detail.summary||state.detail.content||'')}
                </p>
                <button class="expand-toggle" on:click={() => state.detailPlotExpanded = !state.detailPlotExpanded}>
                  {state.detailPlotExpanded ? '收起' : '全部'}
                </button>
              </div>

              {#if state.detail.aka?.length}
                <div class="section aka">
                  <h2>又名</h2>
                  <p>{state.detail.aka.join(' / ')}</p>
                </div>
              {/if}

              <div class="section cast">
                <h2>影人</h2>
                <div class="cast-list">
                  {#if state.detail.directors?.length}
                    <div class="cast-group">
                      <span class="role">导演:</span>
                      <span class="names">{(state.detail.directors||[]).map(p=>p.name).join(' / ')}</span>
                    </div>
                  {/if}
                  {#if state.detail.casts?.length}
                    <div class="cast-group">
                      <span class="role">主演:</span>
                      <span class="names">{(state.detail.casts||[]).map(p=>p.name).join(' / ')}</span>
                    </div>
                  {/if}
                </div>
              </div>

              {#if state.detail.trailers?.length}
                <div class="section trailers">
                  <h2>预告片</h2>
                  <div class="trailers-list">
                    {#each state.detail.trailers as trailer}
                      <div
                        class="trailer-card"
                        role="button"
                        tabindex="0"
                        on:click={() => play({ title: `${state.detail.title} - ${trailer.title}`, type: 'video', source: 'DoubanTrailer' }, trailer.video_url)}
                        on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && play({ title: `${state.detail.title} - ${trailer.title}`, type: 'video', source: 'DoubanTrailer' }, trailer.video_url)}
                      >
                        <div class="trailer-thumbnail">
                          <img src={trailer.cover_url} alt={trailer.title} on:error={imgFallback} />
                          <div class="play-icon"><svg><use xlink:href="#iconPlay"/></svg></div>
                        </div>
                        <span class="trailer-title">{trailer.title}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <div class="section episodes-section">
                <h2>播放列表</h2>
                <div class="sources">
                  {#each state.detail.sources || [] as src, i}
                    <button class="chip {state.detailSourceIndex===i?'active':''}" on:click={() => state.detailSourceIndex=i}>{src.from || ('源'+(i+1))}</button>
                  {/each}
                </div>
                <div class="episodes">
                  {#each (state.detail.sources?.[state.detailSourceIndex]?.episodes || []) as ep}
                    <button class="ep {state.currentPlayingUrl===ep.url?'playing':''}" on:click={() => play(state.detail.item, ep.url)}>{ep.name}</button>
                  {/each}
                </div>
              </div>
            </div>
          </div>

          {#if state.detailLoading}
            <div class="detail-loading"><div class="spinner"></div></div>
          {/if}
        </div>
      {/if}
  </div>
</div>