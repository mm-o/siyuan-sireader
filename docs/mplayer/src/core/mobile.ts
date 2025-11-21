// @ts-ignore
import Player from "../components/Player.svelte";

export interface MobileLayoutConfig{playerHeightRatio?:number;defaultPanel?:string;}

export class MobileDialogManager{
    private container:HTMLElement|null=null;
    private playerComponent:any=null;
    private els:Record<string,HTMLElement>={};
    private static TV='<svg viewBox="0 0 1024 1024" width="16" height="16"><path fill="currentColor" d="M753.265 105.112c12.57 12.546 12.696 32.81 0.377 45.512l-0.377 0.383-73.131 72.992L816 224c70.692 0 128 57.308 128 128v448c0 70.692-57.308 128-128 128H208c-70.692 0-128-57.308-128-128V352c0-70.692 57.308-128 128-128l136.078-0.001-73.13-72.992c-12.698-12.674-12.698-33.222 0-45.895 12.697-12.674 33.284-12.674 45.982 0l119.113 118.887h152.126l119.114-118.887c12.697-12.674 33.284-12.674 45.982 0zM457 440c-28.079 0-51 22.938-51 51v170c0 9.107 2.556 18.277 7 26 15.025 24.487 46.501 32.241 71 18l138-84c7.244-4.512 13.094-10.313 17-17 15.213-24.307 7.75-55.875-16-71l-139-85c-7.994-5.355-17.305-8-27-8z"/></svg>';
    private static COLLAPSE='<svg viewBox="0 0 1024 1024" width="16" height="16"><path fill="currentColor" d="M699.768 108l5.526 0.197c56.287 4.291 83.209 73.68 42.101 114.791L559.256 411.127c-26.306 26.303-68.948 26.303-95.254 0L275.863 222.988C233.432 180.554 263.481 108.004 323.49 108h376.278zM511.629 363.5l188.139-188.138H323.49L511.629 363.5z"/><path fill="currentColor" d="M699.768 916.343l5.526-0.198c56.287-4.29 83.209-73.679 42.101-114.791L559.256 613.216c-26.306-26.303-68.948-26.303-95.254 0L275.863 801.354c-42.431 42.435-12.382 114.985 47.627 114.989h376.278zM511.629 660.842l188.139 188.139H323.49l188.139-188.139z"/></svg>';
    
    constructor(private plugin:any,private i18n:any,private playerAPI:any,private configGetter:()=>Promise<any>){}

    async show():Promise<void>{
        this.destroy();
        const cfg=await this.configGetter(),f='position:fixed;left:0;right:0;',h=Math.floor(window.innerWidth*9/16),b='width:44px;height:44px;border:none;border-radius:50%;background:white;box-shadow:0 2px 8px rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent;pointer-events:auto;opacity:0;transform:translateY(-20px) scale(0.5);transition:all .25s cubic-bezier(.68,-.55,.27,1.55);';
        this.container=Object.assign(document.createElement('div'),{id:'mobile-media-player-container',className:'mobile-media-player',innerHTML:`
            <div id="m-back" style="display:none;position:fixed;top:8px;right:8px;z-index:9999;width:28px;height:28px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;backdrop-filter:blur(10px);pointer-events:auto;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
            <div id="m-player" style="display:none;${f}top:0;height:${h}px;background:#000;z-index:9998;pointer-events:auto;"></div>
            <div id="m-list" style="${f}top:0;background:var(--b3-theme-background);box-shadow:0 -4px 12px rgba(0,0,0,0.2);z-index:9997;transition:bottom .3s,top .3s;bottom:-100%;pointer-events:none;visibility:hidden;"></div>
            <div id="m-nav" style="display:none;${f}bottom:16px;right:16px;z-index:9998;pointer-events:none;"><div class="m-btns" style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;max-height:0;overflow:visible;transition:max-height .3s;pointer-events:none;"><div class="m-row1" style="display:flex;gap:8px;">
            <button data-act="screenshot" class="m-btn" style="${b}"><svg viewBox="0 0 1024 1024" width="20" height="20"><path fill="currentColor" d="M853.333333 170.666667a73.142857 73.142857 0 0 1 73.142857 73.142857v536.380952a73.142857 73.142857 0 0 1-73.142857 73.142857H170.666667a73.142857 73.142857 0 0 1-73.142857-73.142857V243.809524a73.142857 73.142857 0 0 1 73.142857-73.142857h682.666666z m0 73.142857H170.666667v536.380952h682.666666V243.809524z m-375.856762 168.057905l120.685715 120.685714 51.687619-51.712 172.422095 172.373333-51.712 51.736381-120.685714-120.685714-51.736381 51.736381-120.685715-120.685714-224.109714 224.109714-51.712-51.687619 275.846095-275.870476zM731.428571 292.571429a48.761905 48.761905 0 1 1 0 97.523809 48.761905 48.761905 0 0 1 0-97.523809z"/></svg></button>
            <button data-act="timestamp" class="m-btn" style="${b}"><svg viewBox="0 0 1024 1024" width="20" height="20"><path fill="currentColor" d="M511.292952 121.904762c80.408381 0 155.087238 24.405333 217.136762 66.218667l-49.737143 49.785904a318.756571 318.756571 0 0 0-167.399619-47.152762C334.189714 190.756571 190.610286 334.57981 190.610286 512s143.60381 321.243429 320.682666 321.243429c177.103238 0 320.682667-143.823238 320.682667-321.243429 0-49.127619-11.02019-95.695238-30.72-137.337905l51.102476-51.078095A388.87619 388.87619 0 0 1 900.681143 512c0 215.454476-174.32381 390.095238-389.36381 390.095238C296.228571 902.095238 121.904762 727.454476 121.904762 512S296.228571 121.904762 511.292952 121.904762z m0 137.679238c42.179048 0 81.968762 10.386286 116.906667 28.769524l-51.955809 51.931428a182.54019 182.54019 0 0 0-64.950858-11.849142c-101.180952 0-183.247238 82.16381-183.247238 183.56419 0 101.376 82.041905 183.588571 183.247238 183.588571s183.247238-82.212571 183.247238-183.588571a185.295238 185.295238 0 0 0-2.194285-28.42819l56.344381-56.32c9.435429 26.477714 14.57981 55.003429 14.579809 84.74819 0 139.410286-112.810667 252.416-251.977143 252.416-139.142095 0-251.952762-113.005714-251.952762-252.416s112.810667-252.416 251.952762-252.416zM853.577143 143.433143L902.095238 192.146286 566.613333 527.676952l-51.102476 2.681905 2.535619-51.297524 335.481905-335.62819z"/></svg></button>
            <button data-act="loopSegment" class="m-btn" style="${b}"><svg viewBox="0 0 1024 1024" width="20" height="20"><path fill="currentColor" d="M1020.562286 846.555429q0 43.885714-43.885715 43.885714h-50.029714v85.284571q0 18.212571-12.873143 31.085715t-31.012571 12.873142q-43.885714 0-43.885714-43.885714v-85.357714H140.726857q-43.885714 0-43.885714-43.885714V215.04H45.348571q-43.885714 0-43.885714-43.885715t43.885714-43.885715h51.565715V48.493714q0-43.885714 43.885714-43.885714t43.885714 43.885714V127.268571h698.148572q18.139429 0 31.012571 12.873143 12.8 12.873143 12.8 31.012572v631.588571h50.102857q43.885714 0 43.885715 43.812572z m-181.686857-43.885715V215.04H184.612571v587.702857h654.262858z"/><path fill="currentColor" d="M608.256 321.609143q-41.106286-17.773714-86.308571-17.773714-45.129143 0-86.162286 17.627428-35.401143 15.213714-63.341714 41.618286v-9.947429q0-14.043429-10.020572-23.990857-9.874286-9.801143-23.771428-9.801143t-23.844572 10.020572q-10.020571 9.947429-10.020571 23.771428V470.308571q0 14.116571 10.020571 24.064 9.947429 9.801143 23.844572 9.801143h117.174857q14.043429 0 23.990857-10.020571 9.801143-9.947429 9.801143-23.844572 0-13.824-10.020572-23.844571-9.947429-9.947429-23.771428-9.947429h-43.885715q19.602286-25.746286 48.859429-40.228571 33.645714-16.603429 71.460571-13.750857 50.980571 3.876571 87.478858 40.521143 36.571429 36.571429 40.082285 87.478857 4.242286 60.416-37.010285 104.448-40.96 43.885714-100.937143 43.885714-43.739429 0-79.36-25.161143-34.742857-24.576-49.883429-64.365714-4.388571-11.702857-14.409143-18.797714-10.093714-7.094857-22.308571-7.094857-20.187429 0-32.182857 16.530285-11.922286 16.676571-4.973715 35.401143 24.137143 65.097143 81.334858 104.155429 58.733714 40.155429 130.413714 37.156571 84.260571-33.364571 144.457143-63.561143 60.196571-60.050286 63.634285-144.091428 1.828571-45.494857-14.482285-87.332572-15.725714-40.374857-45.933715-71.68-30.208-31.232-69.924571-48.420571z"/></svg></button>
            <button data-act="mediaNotes" class="m-btn" style="${b}"><svg viewBox="0 0 1024 1024" width="20" height="20"><path fill="currentColor" d="M832 128a64 64 0 0 1 64 64v640a64 64 0 0 1-64 64H192a64 64 0 0 1-64-64V192a64 64 0 0 1 64-64h640z m0 64H192v640h640V192zM320 384h384a32 32 0 0 1 0 64H320a32 32 0 0 1 0-64z m0 192h384a32 32 0 0 1 0 64H320a32 32 0 0 1 0-64z"/></svg></button>
            </div><div class="m-row2" style="display:flex;gap:8px;padding-right:52px;">
            <button data-act="list" class="m-btn" style="${b}"><svg viewBox="0 0 1024 1024" width="20" height="20"><path fill="currentColor" d="M204.8 170.666667a34.133333 34.133333 0 0 0-34.133333 34.133333v170.666667a34.133333 34.133333 0 0 0 34.133333 34.133333h170.666667a34.133333 34.133333 0 0 0 34.133333-34.133333V204.8a34.133333 34.133333 0 0 0-34.133333-34.133333H204.8z m0-68.266667h170.666667a102.4 102.4 0 0 1 102.4 102.4v170.666667a102.4 102.4 0 0 1-102.4 102.4H204.8a102.4 102.4 0 0 1-102.4-102.4V204.8a102.4 102.4 0 0 1 102.4-102.4zM204.8 614.4a34.133333 34.133333 0 0 0-34.133333 34.133333v170.666667a34.133333 34.133333 0 0 0 34.133333 34.133333h170.666667a34.133333 34.133333 0 0 0 34.133333-34.133333V648.533333a34.133333 34.133333 0 0 0-34.133333-34.133333H204.8z m0-68.266667h170.666667a102.4 102.4 0 0 1 102.4 102.4v170.666667a102.4 102.4 0 0 1-102.4 102.4H204.8a102.4 102.4 0 0 1-102.4-102.4V648.533333a102.4 102.4 0 0 1 102.4-102.4z"/><path fill="var(--b3-theme-primary)" d="M733.866667 170.666667a119.466667 119.466667 0 1 0 0 238.933333 119.466667 119.466667 0 0 0 0-238.933333z m0-68.266667c103.68 0 187.733333 84.053333 187.733333 187.733333s-84.053333 187.733333-187.733333 187.733334-187.733333-84.053333-187.733334-187.733334S630.186667 102.4 733.866667 102.4z"/><path fill="currentColor" d="M648.533333 614.4a34.133333 34.133333 0 0 0-34.133333 34.133333v170.666667a34.133333 34.133333 0 0 0 34.133333 34.133333h170.666667a34.133333 34.133333 0 0 0 34.133333-34.133333V648.533333a34.133333 34.133333 0 0 0-34.133333-34.133333H648.533333z m0-68.266667h170.666667a102.4 102.4 0 0 1 102.4 102.4v170.666667a102.4 102.4 0 0 1-102.4 102.4H648.533333a102.4 102.4 0 0 1-102.4-102.4V648.533333a102.4 102.4 0 0 1 102.4-102.4z"/></svg></button>
            <button data-act="prev" class="m-btn" style="${b}"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="m13.41 12l3.3-3.29a1 1 0 1 0-1.42-1.42l-4 4a1 1 0 0 0 0 1.42l4 4a1 1 0 0 0 1.42 0a1 1 0 0 0 0-1.42ZM8 7a1 1 0 0 0-1 1v8a1 1 0 0 0 2 0V8a1 1 0 0 0-1-1"/></svg></button>
            <button data-act="play" class="m-btn m-play" style="${b}"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="m16 10.27l-5-2.89a2 2 0 0 0-3 1.73v5.78a2 2 0 0 0 1 1.73a2 2 0 0 0 2 0l5-2.89a2 2 0 0 0 0-3.46M15 12l-5 2.89V9.11zM12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 18a8 8 0 1 1 8-8a8 8 0 0 1-8 8"/></svg></button>
            <button data-act="next" class="m-btn" style="${b}"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M8.71 7.29a1 1 0 1 0-1.42 1.42l3.3 3.29l-3.3 3.29a1 1 0 0 0 0 1.42a1 1 0 0 0 1.42 0l4-4a1 1 0 0 0 0-1.42ZM16 7a1 1 0 0 0-1 1v8a1 1 0 0 0 2 0V8a1 1 0 0 0-1-1"/></svg></button>
            </div></div></div>`});
        this.container.style.pointerEvents='none';
        document.body.appendChild(this.container);
        ['m-back','m-player','m-list','m-nav'].forEach(id=>this.els[id.split('-')[1]]=this.container!.querySelector(`#${id}`)!);
        await this.initComponents(cfg);
        this.bindEvents();
        this.updatePlayerAndListHeight();
        (window as any).siyuanMediaPlayer=this.playerAPI;
        window.dispatchEvent(new CustomEvent('siyuanMediaPlayerUpdate',{detail:{player:this.playerAPI,currentItem:this.playerAPI?.getCurrentMedia?.()}}));
    }

    private async initComponents(cfg:any):Promise<void>{
        this.els.list.className='media-player-sidebar';
        const content=Object.assign(document.createElement('div'),{className:'media-player-sidebar-content'});
        this.els.list.appendChild(content);
        await this.plugin.showTabContent('playlist',content);
        const pl=this.plugin.components.get('playlist');
        this.playerComponent=new Player({target:this.els.player,props:{config:cfg.settings,i18n:this.i18n,currentItem:this.playerAPI?.getCurrentMedia?.(),api:this.playerAPI,playPrev:async(f?:boolean)=>await pl?.playPrev?.(f),playNext:async(f?:boolean)=>await pl?.playNext?.(f)}});
        this.plugin.components.set('mobile_player',this.playerComponent);
        window.addEventListener('siyuanMediaPlayerUpdate',(e:any)=>{if(e.detail?.currentItem&&this.playerAPI?.getCurrentMedia?.())this.toggle(true);});
    }

    private bindEvents():void{
        let exp=false;
        const fb=document.getElementById('mobile-player-float-btn'),w=this.els.nav.querySelector('.m-btns') as HTMLElement;
        const toggle=()=>{
            exp=!exp;
            const bs=w?.querySelectorAll('.m-btn')||[];
            if(w)Object.assign(w.style,{maxHeight:exp?'120px':'0',pointerEvents:exp?'auto':'none'});
            bs.forEach((b,i)=>Object.assign((b as HTMLElement).style,exp?{opacity:'1',transform:'translateY(0) scale(1)',transitionDelay:`${i*25}ms`}:{opacity:'0',transform:'translateY(-20px) scale(0.5)',transitionDelay:'0ms'}));
            if(fb){fb.innerHTML=exp?MobileDialogManager.COLLAPSE:MobileDialogManager.TV;const s=fb.firstElementChild as HTMLElement;if(s)Object.assign(s.style,{transition:'transform .3s',transform:exp?'rotate(180deg)':'rotate(0)'});}
        };
        const updateBtn=()=>{const b=this.els.nav.querySelector('[data-act="play"]');if(!b)return;const v=this.els.player.querySelector('video'),p=v&&!v.paused;b.innerHTML=`<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="${p?'M10 7a1 1 0 0 0-1 1v8a1 1 0 0 0 2 0V8a1 1 0 0 0-1-1m2-5a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 18a8 8 0 1 1 8-8a8 8 0 0 1-8 8m2-13a1 1 0 0 0-1 1v8a1 1 0 0 0 2 0V8a1 1 0 0 0-1-1':'m16 10.27l-5-2.89a2 2 0 0 0-3 1.73v5.78a2 2 0 0 0 1 1.73a2 2 0 0 0 2 0l5-2.89a2 2 0 0 0 0-3.46M15 12l-5 2.89V9.11zM12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 18a8 8 0 1 1 8-8a8 8 0 0 1-8 8'}"/></svg>`;b.classList.toggle('playing',!!p);};
        const ac:Record<string,()=>void>={screenshot:()=>this.playerAPI?.triggerAction('screenshot'),timestamp:()=>this.playerAPI?.triggerAction('timestamp'),loopSegment:()=>this.playerAPI?.triggerAction('loopSegment'),mediaNotes:()=>this.playerAPI?.triggerAction('mediaNotes'),prev:()=>this.playerAPI?.triggerAction('prev'),next:()=>this.playerAPI?.triggerAction('next'),play:()=>{if(this.playerAPI?.getCurrentMedia?.())this.toggle(true);this.playerAPI?.toggle();setTimeout(updateBtn,100);},list:()=>this.toggleList()};
        this.els.nav.addEventListener('click',e=>{const a=(e.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');a&&ac[a]?.();});
        this.els.back.addEventListener('click',()=>this.hide());
        fb?.addEventListener('click',e=>{if(this.els.nav.style.display==='block'){e.preventDefault();e.stopPropagation();toggle();}});
        window.addEventListener('siyuanMediaPlayerUpdate',updateBtn);
        window.addEventListener('resize',()=>this.updatePlayerAndListHeight());
        (this as any).toggleNav=toggle;
        (this as any).updatePlayBtn=updateBtn;
    }

    private toggleList():void{const h=this.els.list.style.bottom==='-100%'||!this.els.list.style.bottom;Object.assign(this.els.list.style,h?{visibility:'visible',bottom:'0',pointerEvents:'auto'}:{bottom:'-100%',pointerEvents:'none'});if(!h)setTimeout(()=>this.els.list.style.visibility='hidden',300);}

    showNavbar():void{this.els.nav.style.display='block';this.els.back.style.display=this.els.player.style.display==='none'?'none':'flex';setTimeout(()=>(this as any).updatePlayBtn?.(),50);}
    toggle(show:boolean):void{['player','nav','back'].forEach((k,i)=>this.els[k].style.display=show?(['block','block','flex'][i]):'none');if(show)setTimeout(()=>{this.updatePlayerAndListHeight();(this as any).updatePlayBtn?.();},0);else Object.assign(this.els.list.style,{bottom:'-100%',pointerEvents:'none',visibility:'hidden'});}
    setPlayerHeightRatio(_:number):void{this.updatePlayerAndListHeight();}
    private updatePlayerAndListHeight():void{const h=Math.floor(window.innerWidth*9/16),v=this.els.player.style.display!=='none';this.els.player.style.height=`${h}px`;Object.assign(this.els.list.style,{height:v?`${window.innerHeight-h}px`:'100vh',top:v?`${h}px`:'0'});}
    hide():void{if(!this.container)return;this.toggle(false);const b=document.getElementById('mobile-player-float-btn');if(b)b.style.display='flex';}
    destroy():void{
        if(!this.container)return;
        try{this.playerComponent?.$destroy?.();}catch{}
        this.plugin.components.delete('mobile_player');
        this.container.querySelectorAll('[data-tab-id]').forEach(el=>{const id=el.getAttribute('data-tab-id');try{this.plugin.components.get(id)?.$destroy?.();}catch{}this.plugin.components.delete(id);});
        this.container.remove();
        this.container=null;
        this.els={};
        const b=document.getElementById('mobile-player-float-btn');
        if(b)b.style.display='flex';
        (window as any).siyuanMediaPlayer=null;
    }
    isShowing():boolean{return!!this.container;}
}

export default MobileDialogManager;
