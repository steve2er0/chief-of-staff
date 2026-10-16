/* Deterministic active-only routines; every movement uses real lunar travel. */
'use strict';
const assert=require('node:assert/strict');
const model=require('./live-model.js'),behavior=require('./availability-model.js'),bound=require('../simulation.js').bound;
const layout=model.baseLayout,stamp='2026-10-14T12:00:00Z',context={now:Date.parse(stamp),connected:true};
const fixture=(count=1)=>({projects:[{id:'p',name:'Fixture'}],jobs:[],tasks:Array.from({length:count},(_,n)=>({id:'r'+n,agent_id:'a'+n,managed_agent:true,project_id:'p',state:'running',config:{mode:'codex'},session_id:'fixture',last_activity_at:stamp,activity:'commandExecution: started'}))});
for(const area of Object.keys(model.infrastructureChoices)){
 const registry=model.cleanRegistry(null),snapshot=fixture();let view=model.build(snapshot,registry,context);
 model.setInfrastructure(view,registry,view.workers[0].key,area);view=model.build(snapshot,registry,context);
 const worker=view.workers[0],raw=structuredClone(worker.raw),track=behavior.sync(null,worker,layout),tracks=new Map([[worker.key,track]]),roles=new Set();let moved=false,wasAirborne=false;
 for(let n=0;n<3000;n++){
  behavior.advanceCrew(view.workers,tracks,.05,model.pose,bound,layout,{cosmetic:true});roles.add(track.cosmeticRole);
  if(track.journey)moved=true;if(track.height>0)wasAirborne=true;
  assert.equal(behavior.visualScale(worker,track,layout),worker.position.scale,'local work retains the assigned perspective');
  if(n%20===0){const before={x:track.x,y:track.y},target=structuredClone(track.workTarget);behavior.sync(track,worker,layout);assert.deepEqual({x:track.x,y:track.y},before,'snapshot does not teleport');assert.deepEqual(track.workTarget,target,'snapshot retains cosmetic destination');}
  for(const obstacle of behavior.obstacles(layout,0))assert(!behavior.inside(track,obstacle),area+' walker crosses scenery');
 }
 assert(moved&&wasAirborne,area+' moves using slow lunar bounds');assert(roles.size>=3,area+' varies cosmetic activities');assert.deepEqual(worker.raw,raw,'routine never changes task records');
 for(const patch of [{state:'waiting'},{state:'completed'},{state:'blocked'},{user_requests:{state:'needs_user',items:[{id:'q',kind:'question',text:'Fixture question'}]}}]){
  Object.assign(snapshot.tasks[0],{state:'running',user_requests:undefined},patch);const next=model.build(snapshot,registry,context).workers[0];behavior.sync(track,next,layout);
  const before=JSON.stringify(track);behavior.workRoutine(next,track,[],layout);assert.equal(JSON.stringify(track),before,'nonworking state cannot receive cosmetic work');
 }
}
// Crowded work keeps the same separation rules as finish/continue traffic.
{
 const registry=model.cleanRegistry(null),view=model.build(fixture(model.WORKERS_PER_PAGE),registry,context),tracks=new Map(view.workers.map(w=>[w.key,behavior.sync(null,w,layout)]));
 const minimum=32*layout.crewScale,previous=new Map();
 for(let i=0;i<view.workers.length;i++)for(let j=i+1;j<view.workers.length;j++){const a=tracks.get(view.workers[i].key),b=tracks.get(view.workers[j].key);previous.set(i+':'+j,Math.hypot(a.x-b.x,a.y-b.y));}
 for(let n=0;n<700;n++){
  behavior.advanceCrew(view.workers,tracks,.08,model.pose,bound,layout,{cosmetic:true});
  for(let i=0;i<view.workers.length;i++)for(let j=i+1;j<view.workers.length;j++){
   const a=tracks.get(view.workers[i].key),b=tracks.get(view.workers[j].key),gap=Math.hypot(a.x-b.x,a.y-b.y),key=i+':'+j;
   assert(gap>=Math.min(minimum,previous.get(key))-.01,'cosmetic walkers keep clearance');previous.set(key,gap);
  }
 }
}
// A safe foot-point gap can still put the full work-frame arms/helmet inside a
// peer. Check every chosen endpoint against current, reserved and saved poses.
{
 const view=model.build(fixture(model.WORKERS_PER_PAGE),model.cleanRegistry(null),context),tracks=new Map(view.workers.map(w=>[w.key,behavior.sync(null,w,layout)]));
 const poses=(worker,track)=>[
  {point:track,scale:behavior.visualScale(worker,track,layout)},
  {point:worker.position.work,scale:worker.position.scale},
  ...(track.goal?[{point:track.goal,scale:worker.position.scale}]:[])
 ];
 let endpoints=0;
 for(let n=0;n<700;n++){
  const prior=new Map(view.workers.map(w=>[w.key,tracks.get(w.key).workTarget]));
  behavior.advanceCrew(view.workers,tracks,.08,model.pose,bound,layout,{cosmetic:true});
  for(const worker of view.workers){
   const track=tracks.get(worker.key),target=track.workTarget;if(!target||target===prior.get(worker.key))continue;
   endpoints++;
   const own={left:target.x-32*worker.position.scale,right:target.x+32*worker.position.scale,top:target.y-52*worker.position.scale,bottom:target.y+2*worker.position.scale};
   for(const peer of view.workers.filter(w=>w.key!==worker.key))for(const {point:p,scale:s} of poses(peer,tracks.get(peer.key))){
    const other={left:p.x-32*s,right:p.x+32*s,top:p.y-52*s,bottom:p.y+2*s};
    assert(!(own.left<other.right&&own.right>other.left&&own.top<other.bottom&&own.bottom>other.top),'cosmetic endpoint overlaps a full peer pose');
   }
  }
 }
 assert(endpoints>0,'crowded work still has safe cosmetic destinations');
}
console.log('PASS: nine work areas, varied cosmetic roles, lunar bounds, stable snapshot goals, immutable records, true nonworking states and crowded clearance.');
