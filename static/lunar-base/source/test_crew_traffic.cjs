/* Reproduced head-on deadlock, parked obstacles and full-page return journeys. */
const assert=require('node:assert/strict');
const model=require('./live-model.js'),availability=require('./availability-model.js'),bound=require('../simulation.js').bound;
const layout=model.baseLayout,separation=32*layout.crewScale;
const stamp='2026-10-14T12:00:00Z',context={now:Date.parse(stamp),connected:true};
function fixture(count){
 const snapshot={projects:[{id:'p',name:'General work'}],jobs:[],tasks:Array.from({length:count},(_,i)=>({
  id:'run-'+i,agent_id:'agent-'+String(i).padStart(2,'0'),managed_agent:true,project_id:'p',title:'Synthetic traffic',
  state:'running',config:{mode:'codex'},session_id:'fixture',last_activity_at:stamp,activity:'fileChange: started'}))};
 const registry=model.cleanRegistry(null),view=model.build(snapshot,registry,context);
 return {snapshot,registry,workers:view.workers,tracks:new Map(view.workers.map(w=>[w.key,availability.sync(null,w,layout)]))};
}
function run(workers,tracks,step=.05){
 const previous=new Map();
 for(let i=0;i<workers.length;i++)for(let j=i+1;j<workers.length;j++){
  const a=tracks.get(workers[i].key),b=tracks.get(workers[j].key);previous.set(i+':'+j,Math.hypot(a.x-b.x,a.y-b.y));
 }
 for(let n=0;n<14000;n++){
  availability.advanceCrew(workers,tracks,step,model.pose,bound,layout);
  for(let i=0;i<workers.length;i++)for(let j=i+1;j<workers.length;j++){
   if(workers[i].position.page!==workers[j].position.page)continue;
   const a=tracks.get(workers[i].key),b=tracks.get(workers[j].key);
   const gap=Math.hypot(a.x-b.x,a.y-b.y),before=previous.get(i+':'+j);
   assert(gap>=Math.min(separation,before)-.01,'walkers keep clearance or recover an existing spawn overlap');
   previous.set(i+':'+j,gap);
  }
  if(workers.every(w=>!tracks.get(w.key).journey))return n;
 }
 assert.fail('a feasible crew journey remained blocked: '+JSON.stringify([...tracks].filter(([key,t])=>t.journey).map(([key,t])=>({key,x:t.x,y:t.y,goal:t.goal,mode:t.behavior.mode,detours:t.detours,step}))));
}
function send(track,to){
 track.goal={...to};track.behavior={mode:'working',motion:true};
 track.journey={points:availability.route(track,to,layout),index:0,from:{x:track.x,y:track.y},elapsed:0};
 assert(track.journey.points);
}
// Two agents exchange places on open foreground ground. Neither may pass through
// the other, teleport, or freeze forever while both wait for the same clearance.
for(const reverse of [false,true]){
 const {workers,tracks}=fixture(2),a=tracks.get(workers[0].key),b=tracks.get(workers[1].key);
 Object.assign(a,{x:300,y:1000});Object.assign(b,{x:650,y:1000});
 send(a,{x:650,y:1000});send(b,{x:300,y:1000});
 run(reverse?[...workers].reverse():workers,tracks);
 assert.deepEqual([a.x,a.y,b.x,b.y],[650,1000,300,1000]);
 assert((a.detours||0)+(b.detours||0)>0,'head-on traffic uses an actual detour');
}
// A pending request can hold an astronaut on a route. The moving agent goes
// around it while that held astronaut's position, pose and source stay unchanged.
{
 const {workers,tracks}=fixture(2),a=tracks.get(workers[0].key),b=tracks.get(workers[1].key);
 Object.assign(a,{x:300,y:1000});Object.assign(b,{x:500,y:1000,behavior:{mode:'held',motion:false}});
 send(a,{x:700,y:1000});const frozen=structuredClone(b),raw=structuredClone(workers.map(w=>w.raw));
 run(workers,tracks,.08);
 assert.deepEqual([a.x,a.y],[700,1000]);
 for(const field of ['x','y','height','frame','phase','restTime','behavior'])assert.deepEqual(b[field],frozen[field]);
 assert.deepEqual(workers.map(w=>w.raw),raw,'traffic never mutates lifecycle records');
}
// Every display position can finish together, reach a distinct nearby Hub spot,
// and continue back to its own infrastructure through the now-parked crowd.
for(const step of [.05,.08]){
 const f=fixture(model.WORKERS_PER_PAGE);
 for(const state of ['completed','running']){
  for(const task of f.snapshot.tasks)task.state=state;
  const view=model.build(f.snapshot,f.registry,context);f.workers=view.workers;
  const targets=availability.restTargets(f.workers,f.tracks,layout);
  if(state==='completed')assert.equal(targets.size,model.WORKERS_PER_PAGE);
  for(const w of f.workers)availability.sync(f.tracks.get(w.key),w,layout,targets.get(w.key));
  run(f.workers,f.tracks,step);
  for(const w of f.workers){
   const t=f.tracks.get(w.key),goal=availability.destination(w,t.behavior,layout,t.restSpot);
   assert(Math.hypot(t.x-goal.x,t.y-goal.y)<.01);
   assert(Math.abs(availability.visualScale(w,t,layout)-(state==='completed'?layout.crewScale:w.position.scale))<1e-9,'crew perspective follows arrival at Hub/work');
  }
 }
}
// Parking considers actual busy work spots, not empty stations. A continuation
// displaces only a conflicting parked astronaut; all other identities stay put.
for(let busy=0;busy<model.WORKERS_PER_PAGE;busy++){
 const f=fixture(model.WORKERS_PER_PAGE);
 for(let i=0;i<f.snapshot.tasks.length;i++)f.snapshot.tasks[i].state=i===busy?'running':'completed';
 const workers=model.build(f.snapshot,f.registry,context).workers;
 const targets=availability.restTargets(workers,f.tracks,layout);
 assert.equal(targets.size,model.WORKERS_PER_PAGE-1,'all finished agents can park even with any one busy station');
 const occupied=workers.filter(w=>w.status.category!=='completed').map(w=>({point:w.position.work,scale:w.position.scale}));
 for(const w of workers)if(targets.has(w.key)){
  assert(availability.restClear(targets.get(w.key),occupied,layout.crewScale),'parked poses do not cover active work poses');
  availability.sync(f.tracks.get(w.key),w,layout,targets.get(w.key));
 }
 const reloaded=availability.restTargets([...workers].reverse(),f.tracks,layout);
 for(const [key,point] of targets)assert.deepEqual(reloaded.get(key),point,'unchanged parking is stable across snapshots/order');
}
// New records may appear at an already occupied point. A walker must be able to
// make a planted push-off and leave without moving farther into the held agent.
{
 const {workers,tracks}=fixture(2),a=tracks.get(workers[0].key),b=tracks.get(workers[1].key);
 Object.assign(a,{x:300,y:1000});Object.assign(b,{x:300,y:1000,behavior:{mode:'held',motion:false}});
 send(a,{x:700,y:1000});run(workers,tracks);
 assert.deepEqual([a.x,a.y,b.x,b.y],[700,1000,300,1000]);
}
// Astronauts on another display page do not occupy this page's terrain.
{
 const {workers,tracks}=fixture(2),a=tracks.get(workers[0].key),b=tracks.get(workers[1].key);
 workers[1].position.page=1;Object.assign(a,{x:300,y:1000});Object.assign(b,{x:500,y:1000,behavior:{mode:'held',motion:false}});
 send(a,{x:700,y:1000});run(workers,tracks);assert(!a.detours);
}
console.log('PASS: head-on/reversed traffic, held blockers, full 28-agent finish/continue at two frame rates, perspective, clearance and page isolation.');
