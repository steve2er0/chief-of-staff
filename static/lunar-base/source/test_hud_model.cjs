'use strict';
const assert=require('node:assert/strict'),hud=require('./hud-model.js');
for(const metrics of [null,{}, {scope:'browser',available:true,cpu_percent:90}, {scope:'app_host',available:false}])assert.equal(hud.host(metrics).cpu,'Unavailable');
for(const platform of ['darwin','win32','linux']){
 const metrics={scope:'app_host',available:true,platform,cpu_percent:34.6,memory_percent:70,memory_used_bytes:8*1024**3,memory_total_bytes:16*1024**3};
 const result=hud.host(metrics);assert.equal(result.cpu,'35%');assert.equal(result.ram,'70%');assert(result.detail.includes('8.0 / 16.0 GB'));if(platform==='win32')assert(result.detail.startsWith('Windows'));
 for(const invalid of [null,NaN,Infinity,-1,101,'20'])assert.equal(hud.host({...metrics,cpu_percent:invalid}).cpu,'Unavailable');
}
assert.equal(hud.context().value,'Select an agent');
for(const usage of [undefined,{available:false},{available:true,source:'estimate',used_tokens:200,max_tokens:1000},{available:true,source:'codex_app_server',used_tokens:null}])assert.equal(hud.context({raw:{context_usage:usage}}).value,'Unavailable');
const usage={available:true,source:'codex_app_server',used_tokens:24000,max_tokens:200000,percent:12};
assert.equal(hud.context({raw:{context_usage:usage}}).value,'12%');
assert(hud.context({raw:{context_usage:usage}}).detail.includes('24,000 / 200,000 tokens'));
assert.equal(hud.context({raw:{context_usage:{...usage,percent:null}}}).value,'12%');
assert.equal(hud.context({raw:{context_usage:{...usage,percent:null,max_tokens:null}}}).value,'24,000 tokens');
console.log('PASS: measured app-host CPU/RAM across platforms, unknown samples, verified context, null limits and no estimates.');
