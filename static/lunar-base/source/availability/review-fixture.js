/* Synthetic supported backend fields only. No API calls/mutations. */
const observed=new Map(),sync=LunarAvailability.sync,advance=LunarAvailability.advance;
LunarAvailability.sync=(...args)=>{const result=sync(...args);observed.set(args[1].key,result);return result;};
const scene=LunarLiveView.mount({host:document.querySelector('main')});
let scenario='working',started=Date.now();
const inspect=()=>[...observed].map(([key,t])=>({key,x:t.x,y:t.y,height:t.height,frame:t.frame,mode:t.behavior.mode,phase:t.phase,restTime:t.restTime,journey:Boolean(t.journey),routeBlocked:Boolean(t.routeBlocked)}));
const project={id:'qa',name:'Synthetic availability',goal:'Read-only visual fixture'};
function snapshot(){
 const stamp=new Date().toISOString();
 const task=(id,state,extra={})=>({id,agent_id:id,managed_agent:true,project_id:'qa',title:id==='a'?'Console · explicit waiting':'Habitat · finish and return',state,config:{mode:'codex'},session_id:'synthetic',started_at:stamp,last_activity_at:stamp,updated:stamp,activity:'fileChange: started',...extra});
 let state=({completed:'completed',waiting:'waiting',interrupted:'interrupted'})[scenario]||'running';
 let extra={};
 if(scenario==='thinking')extra.activity='commandExecution: running';
 if(scenario==='attention')extra.user_requests={version:1,revision:1,state:'needs_user',items:[{id:'fixture-question',kind:'question',text:'Synthetic request: which result should I use?'}]};
 if(scenario==='interrupted')extra.recovery_lock=true;
 if(scenario==='stale')extra.last_activity_at=new Date(Date.now()-180000).toISOString();
 return {local_time:stamp,projects:[project],tasks:[task('a','waiting'),task('b',state,extra)],jobs:[],lunar_fixture:true};
}
function set(value){scenario=value;started=Date.now();document.querySelector('#qa-state').textContent=value;scenario==='disconnect'?scene.disconnect('Synthetic disconnection'):scene.update(snapshot());document.querySelector('#qa-state').dataset.telemetry=JSON.stringify(inspect());}
document.querySelectorAll('[data-qa]').forEach(b=>b.onclick=()=>set(b.dataset.qa));
setInterval(()=>{if(scenario!=='disconnect')scene.update(snapshot());},1000);
set('working');

window.qa={set,scene,inspect};
setInterval(()=>document.querySelector('#qa-state').dataset.telemetry=JSON.stringify(inspect()),100);
const record=document.createElement('button');record.textContent='Record 24s review';record.id='qa-record';document.querySelector('.qa').append(record);
record.onclick=()=>{
 record.disabled=true;set('working');let frames=[],times=[],states=[],start=performance.now();
 setTimeout(()=>set('completed'),1800);
 const sample=setInterval(()=>{
  const canvas=document.querySelector('canvas'),copy=document.createElement('canvas');copy.width=960;copy.height=540;copy.getContext('2d').drawImage(canvas,0,0,960,540);
  frames.push(copy.toDataURL('image/jpeg',.88));times.push(performance.now()-start);states.push(inspect());
  if(times.at(-1)>24000){clearInterval(sample);const a=document.createElement('a');a.id='qa-download';a.textContent='Download real browser frames';a.download='availability-browser-samples.json';a.href=URL.createObjectURL(new Blob([JSON.stringify({frames,times,states,width:960,height:540,source:'Actual Mac Chrome Canvas samples, real animation timers'})],{type:'application/json'}));document.querySelector('.qa').append(a);fetch('/qa-capture',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({frames,times,states,width:960,height:540,source:'Actual Mac Chrome Canvas samples, real animation timers'})}).then(r=>{if(!r.ok)throw new Error('Capture save failed');record.textContent='Review capture saved';record.disabled=false;});}
 },200);
};
