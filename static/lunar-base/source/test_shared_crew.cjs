/* Shared infrastructure uses actual agent identities; fixture-only, no launches. */
const assert=require('node:assert/strict'),model=require('./live-model.js');
const stamp='2026-10-14T04:00:00Z',context={now:Date.parse(stamp),connected:true};
const projects=Array.from({length:5},(_,i)=>({id:'p'+i,name:'Project '+i}));
const canonical=model.baseLayout.orders.miscellaneous;
function owner(i){
 const name=canonical[i%model.WORKERS_PER_PAGE],area=model.baseLayout.stations[name].area;
 const siblings=canonical.filter(key=>model.baseLayout.stations[key].area===area);
 return (siblings.indexOf(name)+Math.floor(i/model.WORKERS_PER_PAGE))%projects.length;
}
const task=(i,extra={})=>({id:'crew-'+String(i).padStart(3,'0'),agent_id:'agent-'+String(i).padStart(3,'0'),
 project_id:'p'+owner(i),title:'Inspect and review the work',managed_agent:true,state:'running',
 config:{mode:'codex'},session_id:'fixture-'+i,started_at:stamp,last_activity_at:stamp,...extra});
const count=model.WORKERS_PER_PAGE*4;
const snapshot={projects,tasks:Array.from({length:count},(_,i)=>task(i)),jobs:[]};
const registry=model.cleanRegistry(null),view=model.build(snapshot,registry,context);
assert.equal(view.workers.length,count);
assert.equal(model.WORKERS_PER_PAGE,28);
assert.equal(new Set(view.workers.map(w=>w.position.page)).size,4);
assert.equal(model.baseLayout.objects.filter(o=>o.asset==='console').length,1);
assert.equal(new Set(view.workers.map(w=>w.slot)).size,count);
for(const page of model.crewPages(view)){
 const crew=view.workers.filter(w=>w.position.page===page);
 for(const area of Object.keys(model.infrastructureChoices)){
  const shared=crew.filter(w=>w.position.area===area);
  assert.equal(shared.length,3,area+' supports three agents on each display page');
  assert.equal(new Set(shared.map(w=>w.visual.key)).size,3,area+' has three different animations even for identical instructions');
  assert.equal(new Set(shared.map(w=>w.projectId)).size,3,area+' is shared across projects');
 }
 assert.equal(crew.filter(w=>w.visual.key==='console').length,1,'only the original terminal has a typing operator');
 for(const worker of crew){
  const anchor=model.workerAnchor(worker);
  assert.deepEqual(anchor,worker.position.work);
  for(const patch of [{state:'queued'},{state:'ready_for_review'},{activity:'fileChange: completed'},{activity:'commandExecution: running'},{state:'blocked'}]){
   const status=model.classify({...worker.raw,...patch},{...context,kind:'task'});
   assert.deepEqual(model.workerAnchor({...worker,status}),anchor,'tool/state changes cannot make crew cross stations');
  }
 }
}
for(const [name,area] of [['Flight data','lander'],['Analysis','hologram'],['Engine test data','teststand'],['Rover garage','garage'],['Hydroponics','greenhouse'],['Radio communications','communications'],['Launch operations','lander'],['Surface mobility','rover']]){
 const local=model.build({projects:[{id:'p0',name}],tasks:Array.from({length:3},(_,i)=>task(i,{project_id:'p0'})),jobs:[]},model.cleanRegistry(null),context);
 assert(local.workers.every(w=>w.position.area===area),'preferred equipment retains three available shared stations');
 assert.equal(new Set(local.workers.map(w=>w.visual.key)).size,3);
}
const saved=model.cleanRegistry({version:2,projects:{p0:0},workers:{},crew:{'task:old-a':0,'task:old-b':10,'task:old-c':29}});
assert.equal(saved.version,5);
assert.deepEqual(Object.values(saved.crew),[0,28,65],'legacy ten-slot pages retain their station indices and pages');
for(const [key,slot] of Object.entries(saved.crew)){
 const oldSlot={'task:old-a':0,'task:old-b':10,'task:old-c':29}[key];
 const position=model.workerPosition({x:0,y:0},slot);
 assert.equal(position.page,Math.floor(oldSlot/10));assert.equal(position.station,oldSlot%10);
}
const original=view.workers.map(w=>[w.key,w.slot,w.visual.key,w.position]);
const labelCrew=[0,1].map((i)=>({...view.workers[i],position:{...view.workers[i].position,page:0,scale:1.4,work:{x:500+i*500,y:400}}}));
const movingLabels=new Map(labelCrew.map((w,i)=>[w.key,{x:500+i*120,y:400}]));
assert.equal(model.workerLabelWidth(labelCrew[0],labelCrew),150,'uncrowded station labels retain their normal width');
const movingWidth=model.workerLabelWidth(labelCrew[0],labelCrew,w=>movingLabels.get(w.key));
assert(movingWidth*labelCrew[0].position.scale<=112,'moving crew labels preserve an eight-unit gap at the larger astronaut scale');
assert(movingWidth<150,'actual resting or walking positions constrain label width instead of old work positions');
const continued=structuredClone(snapshot);continued.projects.reverse();continued.tasks.reverse();
continued.tasks=continued.tasks.map(t=>({...t,id:t.id+'-next',parent_task_id:t.id}));
assert.deepEqual(model.build(continued,model.cleanRegistry(JSON.parse(JSON.stringify(registry))),context).workers.map(w=>[w.key,w.slot,w.visual.key,w.position]),original,'continuations and reload keep agent identity, station and animation');
if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(view.workers.map(w=>({key:w.key,position:w.position,role:w.visual.key,labelWidth:model.workerLabelWidth(w,view.workers)}))));
else console.log('PASS: three agents per structure, distinct animations, one console, fixed live anchors, preferred areas, migrated display pages and persistent crew.');
