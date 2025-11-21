export class HWDecode {
    static async check() {
        try {
            const r = await navigator.mediaCapabilities?.decodingInfo({type:'file',video:{contentType:'video/mp4; codecs="avc1.42E01E"',width:1920,height:1080,bitrate:5e6,framerate:30}});
            return r?.powerEfficient || false;
        } catch { return false; }
    }
    static getGPU() {
        try {
            const gl = document.createElement('canvas').getContext('webgl');
            const d = gl?.getExtension('WEBGL_debug_renderer_info');
            const f = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '';
            return f?.match(/ANGLE \(([^)]+)\)/)?.[1] || f || '';
        } catch { return ''; }
    }
    static monitorBitrate(v: HTMLVideoElement, e: HTMLElement) {
        let b=0,t=Date.now();
        return setInterval(()=>{
            const n=Date.now(),d=(n-t)/1e3;
            if(d<1)return;
            const c=(v as any).webkitVideoDecodedByteCount||0;
            if(c>b)e.textContent=(((c-b)*8)/d/1e6).toFixed(2)+' Mbps';
            b=c;t=n;
        },1e3);
    }
}

