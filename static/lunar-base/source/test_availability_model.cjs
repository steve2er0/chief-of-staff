/* Deterministic synthetic state/transition fixtures. No processes or jobs. */
const assert=require('node:assert/strict');
const model=require('./live-model.js'),behavior=require('./availability-model.js'),bound=require('../simulation.js').bound;
const stamp='2026-10-14T12:00:00Z',now=Date.parse(stamp),context={now,connected:true,kind:'task'};
const raw=(patch={})=>({id:'run-a',agent_id:'agent-a',managed_agent:true,project_id:'p',state:'running',config:{mode:'codex'},session_id:'fixture',last_activity_at:stamp,started_at:stamp,activity:'fileChange: started',...patch});
const status=r=>model.classify(r,context),project={id:'p',name:'Fixture'};
const worker=(r,registry=model.cleanRegistry(null))=>model.build({projects:[project],tasks:[r],jobs:[]},registry,context).workers[0];
for(const [patch,mode] of [
  [{},'working'],[{activity:'commandExecution: running'},'thinking'],[{activity:'fileChange: completed'},'thinking'],
  [{activity:'mcpToolCall: started'},'thinking'],[{state:'paused'},'waiting'],[{state:'waiting'},'waiting'],
  [{state:'queued'},'waiting'],[{state:'completed'},'available'],[{state:'accepted'},'available'],[{state:'ready_for_review'},'available'],
  [{state:'cancelled'},'held'],[{state:'failed'},'held'],[{state:'interrupted'},'held'],[{recovery_lock:true},'held'],
  [{state:'brand-new'},'held'],[{last_activity_at:'2026-10-14T11:55:00Z'},'held'],
  [{reported_status:'blocked'},'held'],[{config:{mode:'simulated'}},'held'],
  [{user_requests:{state:'needs_user',items:[{id:'q',kind:'question',text:'Exact fixture question'}]}},'attention']
]){const r=raw(patch);assert.equal(behavior.intent(status(r),r).mode,mode,JSON.stringify(patch));}
for(const extra of [{connected:false},{snapshotStale:true}]){
  assert.equal(behavior.intent(model.classify(raw({state:'completed'}),{...context,...extra}),raw()).mode,'held');
}
const answered=raw({state:'completed',user_requests:{state:'needs_user',items:[{id:'q',kind:'question',text:'Exact request',answered:true}]}});
assert.equal(behavior.intent(status(answered),answered).mode,'attention','saved answers await explicit resolution');
assert(!behavior.intent(status(answered),answered).motion);
assert.equal(behavior.intent(status(raw({state:'ready_for_review',managed_agent:false})),raw()).mode,'held','legacy review is not automatically availability');
const layout=model.baseLayout,spots=behavior.restSpots(layout);
assert(spots.length>=model.WORKERS_PER_PAGE,'all visible crew have separate rest spots');
for(const p of spots.slice(0,model.WORKERS_PER_PAGE)){
  assert(!behavior.obstacles(layout,32).some(r=>behavior.inside(p,r)));
  assert(Object.values(layout.stations).every(s=>Math.hypot(p.x-s.work[0],p.y-s.work[1])>=68));
}
for(let i=0;i<model.WORKERS_PER_PAGE;i++){
  const work=model.workerPosition({x:0,y:0},i).work,target=spots[i],route=behavior.route(work,target,layout);
  assert(route,'safe route for station '+i);
  let from=work;
  for(const to of route){for(const r of behavior.obstacles(layout))if(!behavior.inside(work,r)&&!behavior.inside(target,r))assert(!behavior.crosses(from,to,r),'station '+i+' crosses infrastructure');from=to;}
}
const registry=model.cleanRegistry(null),first=worker(raw(),registry),original=structuredClone(first);
let track=behavior.sync(null,first,layout);assert.deepEqual({x:track.x,y:track.y},first.position.work);
const completed=worker(raw({state:'completed'}),registry);track=behavior.sync(track,completed,layout);
assert(track.journey);const initial={x:track.x,y:track.y};
behavior.advance(track,.1,model.pose,bound);assert.deepEqual({x:track.x,y:track.y},initial,'push-off is planted');
for(let n=0;n<12000&&track.journey;n++)behavior.advance(track,.05,model.pose,bound);
assert(!track.journey);assert.deepEqual({x:track.x,y:track.y},behavior.destination(completed,track.behavior,layout));
const atRest={x:track.x,y:track.y};
const continued=worker(raw({id:'run-b',parent_task_id:'run-a'}),registry);track=behavior.sync(track,continued,layout);
assert.deepEqual({x:track.x,y:track.y},atRest,'reassignment starts at actual position without teleport');assert(track.journey);
behavior.advance(track,1,model.pose,bound);const interrupted={...track};
track=behavior.sync(track,worker(raw({state:'interrupted',recovery_lock:true}),registry),layout);
behavior.advance(track,10,model.pose,bound);assert.equal(track.x,interrupted.x);assert.equal(track.y,interrupted.y);assert.equal(track.height,interrupted.height,'unknown freezes last pose');
track=behavior.sync(track,continued,layout);behavior.advance(track,.05,model.pose,bound);assert(track.behavior.motion,'fresh recovery resumes');
track=behavior.sync(track,worker(raw({user_requests:{state:'needs_user',items:[{id:'q',kind:'question',text:'Request fixture'}]}}),registry),layout);
assert.equal(track.behavior.mode,'attention');assert.equal(track.journey,null);assert.equal(track.height,0);
const attentionPosition={x:track.x,y:track.y};track=behavior.sync(track,continued,layout);assert.deepEqual({x:track.x,y:track.y},attentionPosition);assert(track.journey,'resolved request returns to actual assigned work station');
assert.deepEqual(first,original,'behavior never mutates worker/backend records');
assert.equal(behavior.restPose(0,0),0);assert.equal(behavior.restPose(0,1),1);assert.equal(behavior.restPose(22,0),2);assert.equal(behavior.restPose(50,0),3);
assert.equal(behavior.tabletFrame(0),null);assert.equal(behavior.tabletFrame(18),0);assert.equal(behavior.tabletFrame(22),null);
console.log('PASS: all state fixtures, explicit attention priority, no silence/session inference, all 28 obstacle-safe routes, rest spacing, reassignment, interruption/freeze/recovery, immutable state, planted lunar bounds and rare poses.');
