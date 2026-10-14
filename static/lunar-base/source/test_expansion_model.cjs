/* Imported artwork, connected paths and old browser choices stay consistent. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const model=require('./live-model.js'),base=model.baseLayout,original=require('./placement-model.js');
const root=path.resolve(__dirname,'..'),manifest=require('../expansion-v1/manifest.json');
const spriteGeometry=o=>[o.id,o.asset,o.nativeSize];
assert.deepEqual(base.objects.slice(0,5).map(spriteGeometry),original.objects.map(spriteGeometry),'foreground placement retains the original sprite proportions');
const scenery=Object.fromEntries(base.objects.map(o=>[o.id,o]));
assert(!scenery.launchpad&&!model.infrastructureChoices.launchpad,'removed landing pad is neither drawn nor assignable');
assert(scenery.hologram.groundDepth>scenery.teststand.groundDepth,'holographic platform sits in the foreground');
assert.equal(base.objects.length,9);assert.equal(Object.keys(model.infrastructureChoices).length,9);
assert.equal(new Set(base.objects.map(o=>o.id)).size,9);
const assets={garage:'rover-garage',greenhouse:'greenhouse',communications:'communications-dish',rover:'rover'};
for(const [id,name] of Object.entries(assets)){
 const object=base.objects.find(o=>o.id===id),item=manifest.assets[name];
 assert.equal(object.src,'/lunar-base/expansion-v1/'+item.display_path);
 assert.deepEqual(object.nativeSize,item.logical_dimensions);
 assert(Math.abs(object.width/object.nativeSize[0]-object.height/object.nativeSize[1])<1e-12,'one scale preserves the sprite aspect ratio');
 const image=fs.readFileSync(path.join(root,'expansion-v1',item.display_path));
 assert.equal(crypto.createHash('sha256').update(image).digest('hex'),item.display_sha256,'live view uses the approved export unchanged');
 assert.deepEqual([image.readUInt32BE(16),image.readUInt32BE(20)],object.nativeSize.map(v=>v*3));
 assert(object.x>=0&&object.y>=0&&object.x+object.width<=base.width&&object.y+object.height<=base.height);
 assert(base.paths.flat().some(([x,y])=>x>=object.x&&x<=object.x+object.width&&y>=object.y&&y<=object.y+object.height),'path reaches '+id);
}
const graph=new Map(),point=p=>p.join(',');
for(const route of base.paths)for(let i=1;i<route.length;i++){
 const a=point(route[i-1]),b=point(route[i]);
 if(!graph.has(a))graph.set(a,new Set());if(!graph.has(b))graph.set(b,new Set());
 graph.get(a).add(b);graph.get(b).add(a);
}
const reached=new Set(),queue=[point(base.paths[0][0])];
while(queue.length){const next=queue.shift();if(reached.has(next))continue;reached.add(next);queue.push(...graph.get(next));}
assert.equal(reached.size,graph.size,'all original and extended paths belong to one connected base');
for(const order of Object.values(base.orders)){
 assert.equal(order.length,28);assert.equal(new Set(order).size,28);
 assert(order.every(name=>base.stations[name]));
}
const stamp='2026-10-14T12:00:00Z',context={now:Date.parse(stamp),connected:true};
const snapshot={projects:[{id:'p',name:'General work'}],jobs:[],tasks:Array.from({length:64},(_,i)=>({
 id:'legacy-'+i,agent_id:'legacy-'+i,project_id:'p',managed_agent:true,title:'Review work',state:'running',config:{mode:'codex'},session_id:'fixture-'+i,last_activity_at:stamp}))};
const saved={version:3,projects:{p:0},workers:{},crew:Object.fromEntries(snapshot.tasks.map((t,i)=>['task:'+t.agent_id,i])),
 overrides:{'task:legacy-0':'console'},automaticCrew:{'task:legacy-0':17},suits:{'task:legacy-1':0}};
const registry=model.cleanRegistry(saved),view=model.build(snapshot,registry,context);
assert.equal(registry.version,5);assert.equal(registry.automaticCrew['task:legacy-0'],29);
assert.equal(registry.overrides['task:legacy-0'],'console');
for(const worker of view.workers){
 const old=Number(worker.agentId.split('-')[1]);
 assert.equal(worker.position.station,old%16);assert.equal(worker.position.page,Math.floor(old/16));
 assert.equal(worker.slot,Math.floor(old/16)*28+old%16);
 assert.equal(worker.suit,(old===1?0:old%2)?'amber':'teal','migration preserves the suit, including explicit saved colors');
}
const reloaded=model.build(snapshot,model.cleanRegistry(JSON.parse(JSON.stringify(registry))),context);
assert.deepEqual(reloaded.workers.map(w=>[w.key,w.position,w.suit]),view.workers.map(w=>[w.key,w.position,w.suit]));
// A full v4 page keeps surviving stations/pages/suits; retired pad workers
// return to Automatic without moving their peers or losing their identities.
const v4={version:4,projects:{p:0},workers:{},crew:Object.fromEntries(Array.from({length:62},(_,i)=>['task:legacy-'+i,i])),
 overrides:{'task:legacy-25':'launchpad','task:legacy-28':'rover','task:legacy-56':'launchpad'},
 automaticCrew:{'task:legacy-25':16,'task:legacy-28':30,'task:legacy-56':57},suits:{'task:legacy-25':0}};
const migrated=model.cleanRegistry(v4),moved=model.build({...snapshot,tasks:snapshot.tasks.slice(0,62)},migrated,context);
assert.equal(migrated.version,5);assert.equal(moved.workers.length,62);
assert.equal(new Set(moved.workers.map(w=>w.slot)).size,62);
assert(!Object.values(migrated.overrides).includes('launchpad'));
assert.equal(migrated.overrides['task:legacy-28'],'rover');assert.equal(migrated.automaticCrew['task:legacy-28'],27);
for(const worker of moved.workers){
 const old=Number(worker.agentId.split('-')[1]),index=old%31;
 if(index<25||index>27){assert.equal(worker.position.page,Math.floor(old/31));assert.equal(worker.position.station,index>=28?index-3:index);}
 assert.notEqual(worker.position.area,'launchpad');assert.equal(worker.suit,(old===25?0:old%2)?'amber':'teal');
}
const savedAgain=model.build({...snapshot,tasks:snapshot.tasks.slice(0,62)},model.cleanRegistry(JSON.parse(JSON.stringify(migrated))),context);
assert.deepEqual(savedAgain.workers.map(w=>[w.key,w.position,w.suit]),moved.workers.map(w=>[w.key,w.position,w.suit]));
const resetPad=model.cleanRegistry({version:4,crew:{'task:pad-agent':25},overrides:{'task:pad-agent':'launchpad'},automaticCrew:{'task:pad-agent':16}});
assert.equal(resetPad.crew['task:pad-agent'],16,'removed manual pad choice restores the previous Automatic station when free');
assert.equal(resetPad.suits['task:pad-agent'],1,'restoring Automatic preserves the previous suit');
assert(!('task:pad-agent' in resetPad.overrides)&&!('task:pad-agent' in resetPad.automaticCrew));
console.log('PASS: exact expansion exports, original scenery, connected paths, complete station orders and v3 migration of stations, pages, manual choices, Automatic memo and suits.');
