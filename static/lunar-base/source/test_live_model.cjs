/* Contract tests against synthetic fixtures; never launches workers. */
const assert=require('node:assert/strict');
const model=require('./live-model.js');
const sim=require('../simulation.js');
const stamp='2026-10-13T04:00:00Z',now=Date.parse(stamp);
const real=(extra={})=>({id:'worker-a',project_id:'project-a',state:'running',config:{mode:'codex'},worker_pid:123,
  started_at:stamp,last_activity_at:stamp,updated:stamp,...extra});
const context={kind:'task',now,connected:true};
const status=record=>model.classify(record,context);
assert.equal(status(real()).category,'active');assert(status(real()).animate);
for (const [state,category] of [['queued','waiting'],['paused','waiting'],['blocked','blocked'],['failed','failed'],
  ['ready_for_review','needs_input'],['accepted','completed'],['completed','completed'],['interrupted','unknown'],
  ['cancelled','stopped'],['brand-new-state','unknown']]) {
  const result=status(real({state}));assert.equal(result.category,category);assert.equal(result.animate,false);
}
assert.equal(status(real({reported_status:'blocked'})).category,'blocked');
assert.equal(status(real({reported_status:'failed'})).animate,false);
assert.equal(status(real({recovery_lock:true})).category,'unknown');
assert.equal(status(real({last_activity_at:'2026-10-13T03:57:00Z'})).category,'stale');
assert.equal(status(real({last_activity_at:'2026-10-14T04:00:00Z'})).category,'unknown');
assert.equal(status(real({last_activity_at:null,updated:null})).category,'unknown');
assert.equal(status(real({worker_pid:null,session_id:null})).category,'unknown');
assert.equal(model.classify(real(),{...context,connected:false}).category,'disconnected');
assert.equal(model.classify(real(),{...context,snapshotStale:true}).animate,false);
assert.equal(status(real({config:{mode:'simulated'}})).animate,false);
assert.equal(status(real({config:{mode:'simulated'}})).verified,false);
assert.equal(status(real({config:{}})).verified,false);
assert.equal(status(real({activity:'file_change: completed'})).area,'workspace');
assert.equal(status(real({latest_update:'I am editing files'})).area,'console','do not infer tool activity from prose');
assert.deepEqual(model.transport(now,true,now+16000),{connected:true,snapshotStale:true});
const registry=model.cleanRegistry(null);
const snapshot={projects:[{id:'project-a',name:'A'},{id:'project-b',name:'B'}],tasks:[
  real(),real({id:'simulated',config:{mode:'simulated'}}),
  real({id:'queue-only',state:'queued',worker_pid:null,started_at:null}),
  real({id:'unknown-engine',config:{mode:'mystery'}}),
  real({id:'orphan',project_id:'missing'})],jobs:[
  {id:'job-a',project_id:'project-a',state:'completed',session_id:'known-session',updated:stamp}]};
const original=structuredClone(snapshot);
const first=model.build(snapshot,registry,{now,connected:true});
assert.equal(first.workers.length,1);assert.equal(first.simulatedRecords,1);assert.equal(first.unverifiedRecords,2);assert.equal(first.orphanRecords,1);
assert.deepEqual(snapshot,original,'projection must not edit snapshot or operational records');
const positions=first.projects.map(p=>[p.id,p.x,p.y]);
const slots=first.workers.map(w=>[w.key,w.slot]);
const added=structuredClone(snapshot);added.projects.reverse();added.projects.unshift({id:'project-c',name:'C'});
added.tasks.unshift(real({id:'worker-new'}));model.build(added,registry,{now,connected:true});
const again=model.build(snapshot,registry,{now,connected:true});
assert.deepEqual(again.projects.map(p=>[p.id,p.x,p.y]),positions,'order and additions do not move existing projects');
assert.deepEqual(again.workers.map(w=>[w.key,w.slot]),slots,'new worker does not move existing worker slots');
const restored=model.cleanRegistry(JSON.parse(JSON.stringify(registry)));
assert.deepEqual(model.build(snapshot,restored,{now,connected:true}).projects.map(p=>[p.id,p.x,p.y]),positions,'locations survive reload');
const removed={projects:[{id:'project-b',name:'B'}],tasks:[],jobs:[]};
model.build(removed,registry,{now,connected:true});
assert.deepEqual(model.build(snapshot,registry,{now,connected:true}).projects.map(p=>[p.id,p.x,p.y]),positions,'removed/reappearing projects retain locations');
const duplicates=model.cleanRegistry({version:1,projects:{a:0,b:0},workers:{a:{one:0,two:0}}});
assert.equal(Object.keys(duplicates.projects).length,1);assert.equal(Object.keys(duplicates.workers.a).length,1);
const many={projects:[{id:'project-a'}],tasks:Array.from({length:25},(_,i)=>real({id:'worker-'+i})),jobs:[]};
const pages=model.build(many,model.cleanRegistry(null),{now,connected:true}).workers;
assert.equal(new Set(pages.map(w=>w.position.page)).size,3);
for (let page=0;page<3;page++) {
  const crew=pages.filter(w=>w.position.page===page);
  for(const a of crew)for(const b of crew)if(a.key!==b.key)assert(Math.hypot(a.position.work.x-b.position.work.x,a.position.work.y-b.position.work.y)>=70);
}
const from={x:0,y:0},to={x:60,y:0};
const pushA=model.pose(.05,from,to,sim.bound),pushB=model.pose(.30,from,to,sim.bound);
assert.equal(pushA.x,pushB.x);assert.equal(pushA.height,0);
const apex=model.pose(sim.bound.push+sim.bound.flight/2,from,to,sim.bound);
assert(Math.abs(apex.height-12)<1e-8);assert(apex.x>0&&apex.x<30);
const landing=model.pose(2.85,from,to,sim.bound);
assert.equal(landing.x,30);assert.equal(landing.height,0);
assert(model.pose(6.3,from,to,sim.bound).done);
assert.throws(()=>model.build({projects:[]},registry),/missing/);
console.log('PASS: real/simulated proof, all state categories, stale/disconnected freeze, immutable source, stable persisted layout, pagination, lunar bounds.');

// Persistent agent turns project onto one astronaut; results retain every turn.
const agents=require('../../agent-model.js');
const initial=real({id:'root',agent_id:'root',managed_agent:true,state:'ready_for_review',finished_at:stamp,result:{summary:'First result'}});
const continued=real({id:'next',agent_id:'root',managed_agent:true,parent_task_id:'root',created:'2026-10-13T04:00:01Z'});
const liveSnapshot={projects:[{id:'project-a',records:[]}],tasks:[initial],jobs:[]};
const layout=model.cleanRegistry(null),before=model.build(liveSnapshot,layout,context).workers[0];
assert.equal(before.status.label,'Finished');assert(!before.status.attentionPending);
liveSnapshot.tasks=[continued,{...initial,state:'superseded',updated:'2026-10-13T04:00:05Z'}];
const after=model.build(liveSnapshot,layout,context).workers;
assert.equal(after.length,1);assert.equal(after[0].id,'next');assert.equal(after[0].key,before.key);assert.deepEqual(after[0].position,before.position);
assert.equal(agents.results(liveSnapshot.tasks).length,1);assert.equal(agents.current(liveSnapshot.tasks)[0].id,'next');
for(const [activity,kind,area] of [['fileChange: completed','file_change','workspace'],['commandExecution: running','command_execution','console'],['mcpToolCall: completed','mcp_tool_call','console'],['webSearch: completed','web_search','console']]){
 const mapped=status(real({activity}));assert.equal(mapped.activityKind,kind);assert.equal(mapped.area,area);
}
const queued=real({managed_agent:true,state:'queued',worker_pid:null,started_at:null});
assert.equal(model.build({...liveSnapshot,tasks:[queued]},model.cleanRegistry(null),context).workers[0].status.label,'Queued');
assert(!status(queued).animate);
const simulated=real({managed_agent:true,config:{mode:'simulated'}});
assert.equal(model.build({...liveSnapshot,tasks:[simulated]},model.cleanRegistry(null),context).workers[0].status.label,'Simulated · Working');assert(!status(simulated).animate);
console.log('PASS: persistent astronaut identity and position, completed results, queued/simulated labels and native event vocabulary.');
