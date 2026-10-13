const assert=require('node:assert/strict');
const model=require('./placement-model.js'),live=require('./live-model.js'),sim=require('../simulation.js');
assert.deepEqual(model.objects.map(o=>o.asset).sort(),['console','habitat','hologram','lander','teststand']);
for(const o of model.objects){assert(o.x>=30&&o.y>=110);assert(o.x+o.width<=model.width-30);assert(o.y+o.height<=model.height-30);assert(o.labelY<model.height-25);}
function intersects(a,b){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
for(const a of model.objects)for(const b of model.objects)if(a.id<b.id){const deliberate=[a.id,b.id].sort().join(',')==='console,habitat';assert(!intersects(a,b)||deliberate,`${a.id}/${b.id} overlap`);}
const habitat=model.objects.find(o=>o.id==='habitat'),consoleArea=model.objects.find(o=>o.id==='console');
assert(consoleArea.x<habitat.x&&Math.abs(consoleArea.y+consoleArea.height-habitat.y-habitat.height)<30,'console remains adjacent to habitat');
for(let t=0;t<100;t+=.1){const p=model.walker(t,sim.bound,live.pose);assert(p.x>=32&&p.x+32<=model.width);assert(p.y>=58&&p.y<=model.height-40);for(const o of model.objects){const body={x:p.x-32,y:p.y-p.height-50,width:64,height:50};assert(!intersects(body,o),`walker crosses ${o.id}`);}}
for(const a of model.crew)for(const b of model.crew)if(a.id!==b.id&&a.role!=='walking'&&b.role!=='walking')assert(Math.hypot(a.x-b.x,a.y-b.y)>75);
assert.equal(new Set(model.crew.map(c=>c.role)).size,7);
console.log('PASS: all existing infrastructure, full viewport, deliberate console adjacency, separate footprints, clear walking corridor and distinct work positions.');
