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
  function context(worker,transport={}){
    if(!worker)return {value:'Select an agent',note:'',detail:'Select an astronaut or open an agent conversation to see its last reported model-request tokens.'};
    const raw=worker.raw||{},usage=raw.context_usage,active=['queued','running','stopping'].includes(raw.state);
    if(!usage||usage.source!=='codex_app_server'||(usage.basis&&usage.basis!=='last_model_request')||!Number.isSafeInteger(usage.used_tokens)||usage.used_tokens<0){
      return {value:'Unavailable',note:active?'Awaiting token report':'No saved token report',detail:raw.config?.mode==='simulated'?'Simulated agents have no native token usage.':active?'No native token usage has been recorded for this run yet. A reading appears only if the CLI reports it.':'This saved run has no recorded native token usage. A future run can supply a reading if the CLI reports it; restarting CoS does not recover an earlier reading.'};
    }
    // `available` describes the percentage denominator, not the validity of the
    // native token count. Never replace missing limits with a model estimate.
    const used=usage.used_tokens.toLocaleString('en-US'),maximum=Number.isSafeInteger(usage.max_tokens)&&usage.max_tokens>0?usage.max_tokens:null;
    const stale=transport.connected===false||transport.snapshotStale===true;
    const value=maximum&&usage.used_tokens<=maximum?Math.round(usage.used_tokens/maximum*100)+'%':used+' tokens';
    return {value,note:stale?'Last known request':maximum?'Last reported request':'Limit not reported',detail:'Last reported model request: '+used+(maximum?' / '+maximum.toLocaleString('en-US'):'')+' tokens'+(maximum?' (reported context-window limit)':' (context-window limit not reported)')+(usage.updated_at?' · reported '+usage.updated_at:'')+'. Includes reported input/output tokens; not a live measurement of current context occupancy.'+(stale?' Connection or snapshot is stale; this is the last saved reading.':'')};
  }
  const api={host,context};root.LunarHUD=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
