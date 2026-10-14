/* Manual map choices never change operational records or move other agents. */
const assert=require('node:assert/strict'),model=require('./live-model.js');
const stamp='2026-10-14T12:00:00Z',context={now:Date.parse(stamp),connected:true};
const snapshot={projects:[{id:'p',name:'General work'}],jobs:[],tasks:Array.from({length:8},(_,i)=>({
 id:'task-'+i,agent_id:'agent-'+i,project_id:'p',title:'General work '+i,managed_agent:true,state:'running',
 session_id:'fixture-'+i,config:{mode:'codex',execution_policy:'yolo'},context:{cwd:'/synthetic/project'},
 started_at:stamp,last_activity_at:stamp,updated:stamp}))};
const source=structuredClone(snapshot);
const build=registry=>model.build(snapshot,registry,context);
const find=(view,key)=>view.workers.find(w=>w.key===key);
const identity=w=>[w.key,w.id,w.suit,w.raw.session_id,w.raw.context.cwd];
const key='task:agent-4';
for(const area of Object.keys(model.infrastructureChoices)){
 const registry=model.cleanRegistry(null),before=build(registry),original=find(before,key);
 assert.deepEqual(Object.keys(registry.overrides),[],'new agents default to Automatic');
 assert.equal(model.setInfrastructure(before,registry,key,area),true);
 const after=build(registry),moved=find(after,key);
 assert.equal(moved.position.area,area);
 assert.deepEqual(identity(moved),identity(original),'moving keeps astronaut identity, suit and CLI context');
 assert.deepEqual(after.workers.filter(w=>w.key!==key).map(w=>[w.key,w.slot,w.position]),before.workers.filter(w=>w.key!==key).map(w=>[w.key,w.slot,w.position]));
 const reloaded=build(model.cleanRegistry(JSON.parse(JSON.stringify(registry))));
 assert.deepEqual(find(reloaded,key).position,moved.position,'choice and position survive reload');
 const noOp=JSON.stringify(registry);assert.equal(model.setInfrastructure(after,registry,key,area),false);assert.equal(JSON.stringify(registry),noOp);
 model.setInfrastructure(after,registry,key,'');
 const automatic=build(registry);
 assert.equal(registry.overrides[key],undefined);
 assert.deepEqual(find(automatic,key).position,original.position,'Automatic restores the original free station');
 assert.deepEqual(identity(find(automatic,key)),identity(original));
}
const registry=model.cleanRegistry(null);let view=build(registry);
for(const worker of [...view.workers]){
 model.setInfrastructure(view,registry,worker.key,'lander');view=build(registry);
}
assert(view.workers.every(w=>w.position.area==='lander'),'manual choices are honored when the first page is full');
assert.equal(new Set(view.workers.map(w=>w.slot)).size,8);
assert.equal(model.crewPages(view).length,3);
for(const page of model.crewPages(view)){
 const crew=view.workers.filter(w=>w.position.page===page);
 assert(crew.length<=3);assert.equal(new Set(crew.map(w=>w.visual.key)).size,crew.length,'overflow pages retain distinct existing animations');
}
const restored=model.cleanRegistry(JSON.parse(JSON.stringify(registry))),continued=structuredClone(snapshot);
continued.tasks=continued.tasks.map(t=>({...t,id:t.id+'-next',parent_task_id:t.id}));
const next=model.build(continued,restored,context);
assert.deepEqual(next.workers.map(w=>[w.key,w.slot,w.suit,w.position]),view.workers.map(w=>[w.key,w.slot,w.suit,w.position]),'preferences follow persistent agents across CLI turns');
const crowded=model.cleanRegistry(null);let cv=build(crowded);
model.setInfrastructure(cv,crowded,key,'hologram');cv=build(crowded);
model.setInfrastructure(cv,crowded,'task:agent-0','teststand');cv=build(crowded);
const occupied=find(cv,'task:agent-0');assert.equal(occupied.slot,4);
model.setInfrastructure(cv,crowded,key,'');cv=build(crowded);
assert.equal(find(cv,'task:agent-0').slot,occupied.slot,'returning to Automatic never steals an occupied station');
assert.notEqual(find(cv,key).slot,occupied.slot);
assert.equal(new Set(cv.workers.map(w=>w.slot)).size,8);
for(const invalid of ['missing','paths',['console'],{},null]){
 const before=JSON.stringify(crowded);assert.throws(()=>model.setInfrastructure(cv,crowded,key,invalid),/existing piece/);assert.equal(JSON.stringify(crowded),before);
}
assert.throws(()=>model.setInfrastructure(cv,crowded,'task:missing','lander'),/no longer/);
const dirty=model.cleanRegistry({version:3,projects:{},workers:{},crew:{},
 overrides:{a:'console',b:['console'],c:'missing'},automaticCrew:{a:0,b:-1,c:'0'},suits:{a:0,b:2,c:true}});
assert.deepEqual(Object.keys(dirty.overrides),['a']);assert.deepEqual(Object.keys(dirty.automaticCrew),['a']);assert.deepEqual(Object.keys(dirty.suits),['a']);
assert.deepEqual(snapshot,source,'manual map assignments cannot change instructions, projects, permissions or execution records');
console.log('PASS: Automatic default, all five manual targets, reload/turn persistence, stable suits and peers, safe overflow, occupied reset and invalid-choice rejection.');
