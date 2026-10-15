/* Ambient scenery only. This clock has no agent, task or transport inputs. */
(function(root){
  'use strict';
  function frame(seconds,meta,reduced=false){
    if(reduced||!Number.isFinite(seconds))return 0;
    const t=((seconds%meta.period)+meta.period)%meta.period,h=meta.hold,d=meta.transition,n=meta.steps;
    if(t<h)return t%4>=2?n+1:0;
    if(t<h+d)return Math.round((t-h)/d*n);
    if(t<h*2+d)return (t-h-d)%4>=2?n+2:n;
    return Math.round((1-(t-h*2-d)/d)*n);
  }
  function clock(meta){
    let seconds=0;
    return {advance(elapsed,{paused=false,hidden=false,reduced=false}={}){
      if(!paused&&!hidden&&!reduced&&Number.isFinite(elapsed)&&elapsed>0)
        seconds=(seconds+Math.min(.08,elapsed))%meta.period;
      return frame(seconds,meta,reduced);
    },orbit(reduced=false){
      return reduced||!meta.rings?null:Math.floor(seconds/meta.rings.period*meta.rings.frames)%meta.rings.frames;
    }};
  }
  function rect(index,meta){
    return [(index%meta.columns)*meta.width,Math.floor(index/meta.columns)*meta.height,meta.width,meta.height];
  }
  const api={frame,clock,rect};root.LunarHologram=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
