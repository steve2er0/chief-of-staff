/* Format only measured app-host metrics and explicitly reported agent context. */
(function(root){
  'use strict';
  const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const percent=value=>finite(value)&&value<=100?Math.round(value)+'%':'Unavailable';
  function memory(used,total){
    if(!finite(used)||!finite(total)||total<=0||used>total)return '';
    const gib=1024**3;return (used/gib).toFixed(1)+' / '+(total/gib).toFixed(1)+' GB';
  }
  function host(metrics){
    if(!metrics||metrics.scope!=='app_host'||metrics.available!==true)return {cpu:'Unavailable',ram:'Unavailable',detail:'Metrics unavailable for the machine running CoS.'};
    const ram=percent(metrics.memory_percent),size=memory(metrics.memory_used_bytes,metrics.memory_total_bytes);
    const platform={darwin:'macOS',win32:'Windows',linux:'Linux'}[metrics.platform]||'App host';
    return {cpu:percent(metrics.cpu_percent),ram,detail:platform+' · machine running CoS'+(size?' · RAM '+size:'')+(metrics.sampled_at?' · sampled '+metrics.sampled_at:'')};
  }
  function context(worker){
    if(!worker)return {value:'Select an agent',detail:'Select an astronaut or open an agent conversation to see reported context usage.'};
    const usage=worker.raw?.context_usage;
    if(!usage||usage.available!==true||usage.source!=='codex_app_server'||!finite(usage.used_tokens))return {value:'Unavailable',detail:'This agent has not reported context usage.'};
    const used=Math.round(usage.used_tokens).toLocaleString('en-US');
    const maximum=finite(usage.max_tokens)&&usage.max_tokens>0?usage.max_tokens:null;
    const value=finite(usage.percent)&&usage.percent<=100?Math.round(usage.percent)+'%':maximum&&usage.used_tokens<=maximum?Math.round(usage.used_tokens/maximum*100)+'%':used+' tokens';
    return {value,detail:'Last reported request context: '+used+(maximum?' / '+Math.round(maximum).toLocaleString('en-US'):'')+' tokens'+(usage.updated_at?' · updated '+usage.updated_at:'')};
  }
  const api={host,context};root.LunarHUD=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
