/* Synthetic time, DOM and images; no browser, model, worker or network starts. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const animation=require('./hologram-model.js');
const meta={width:675,height:735,columns:5,steps:15,period:24,hold:9,transition:3,url:'/hologram.png'};
const orbits=require('./hologram-orbits.js');
meta.rings=JSON.parse(fs.readFileSync(__dirname+'/hologram/orbits.json','utf8'));
assert.equal(meta.rings.period,meta.period);assert.equal(meta.rings.frames/meta.period,5);
assert.deepEqual(meta.rings.orbits.map(o=>o.direction),[1,-1]);
assert.deepEqual(orbits.strokes(null,meta,true),[]);
for(const front of [false,true]){
  assert.notDeepEqual(orbits.strokes(0,meta,front),orbits.strokes(15,meta,front));
  for(let index=0;index<meta.rings.frames;index++)for(const path of orbits.strokes(index,meta,front))
    for(const [x,y] of path.points)assert.ok(x>120&&x<565&&y>80&&y+path.width/2<400,'Projected markings stay above physical hardware');
  const rounded=index=>JSON.stringify(orbits.strokes(index,meta,front),(key,value)=>typeof value==='number'?Math.round(value*1e7)/1e7:value);
  assert.equal(rounded(0),rounded(meta.rings.frames),'Ring motion loops without a seam');
}
for(const [time,expected] of [[0,0],[1,0],[2,16],[8,0],[9,0],[10.5,8],[12,15],[14,17],[20,15],[21,15],[22.5,8],[24,0],[48,0]])
  assert.equal(animation.frame(time,meta),expected,String(time));
for(let time=0;time<48;time+=.01){
  assert.equal(animation.frame(time,meta,true),0);
  const index=animation.frame(time,meta),[x,y,w,h]=animation.rect(index,meta);
  assert.ok(index>=0&&index<=17&&x>=0&&y>=0&&x+w<=3375&&y+h<=2940);
}
assert.equal(animation.frame(NaN,meta),0);
assert.equal(animation.frame(Infinity,meta),0);
const clock=animation.clock(meta);
for(let n=0;n<162;n++)clock.advance(.08);
const capsule=clock.advance(0);assert.equal(capsule,15);
const orbit=clock.orbit();assert.ok(orbit>0);assert.equal(clock.orbit(true),null);
for(const options of [{paused:true},{hidden:true},{reduced:true}]){
  for(let n=0;n<200;n++)clock.advance(.08,options);
  assert.equal(clock.advance(0),capsule);
  assert.equal(clock.orbit(),orbit,'Pause, visibility and reduced motion freeze both clocks');
}
for(const elapsed of [NaN,Infinity,-1,0])assert.equal(clock.advance(elapsed),capsule);
assert.equal(clock.advance(1000),capsule); // stalls are capped, with no catch-up

async function renderer({failedAtlas=false,reduced=false}={}){
  let raf=null,time=1000,intervals=0,refreshes=0,reduceSetting=false;
  const draws=[],layers=[],documentEvents={},motionEvents={},elements=new Map(),motion={matches:reduced,addEventListener:(k,fn)=>motionEvents[k]=fn};
  const node=()=>({dataset:{},hidden:false,textContent:'',classList:{toggle(){}},
    addEventListener(k,fn){this[k]=fn;},setAttribute(){},getBoundingClientRect:()=>({width:768,height:432})});
  const context2d=new Proxy({drawImage:(...args)=>{draws.push(args);if(args[0].url===meta.url)layers.push('body');},createLinearGradient:()=>({addColorStop(){}})},
    {get:(target,key)=>key in target?target[key]:()=>{}});
  const canvas=node();canvas.getContext=()=>context2d;elements.set('#world',canvas);
  const host=node();host.querySelector=key=>{if(!elements.has(key))elements.set(key,node());return elements.get(key);};host.querySelectorAll=()=>[];
  const document={body:{dataset:{}},hidden:false,addEventListener:(k,fn)=>documentEvents[k]=fn,removeEventListener(){}};
  const context={document,devicePixelRatio:1,location:{search:''},URLSearchParams,AbortController,
    localStorage:{getItem:()=>null},matchMedia:()=>motion,ResizeObserver:class{observe(){}disconnect(){}},
    Image:class{width=1600;height=900;set src(value){this.url=value;queueMicrotask(()=>failedAtlas&&value===meta.url?this.onerror():this.onload());}},
    requestAnimationFrame:fn=>{assert.equal(raf,null,'Only one renderer RAF may be pending');raf=fn;},
    addEventListener(){},removeEventListener(){},setInterval:()=>++intervals,clearInterval(){},
    fetch:()=>{throw Error('Ambient renderer must not fetch or launch anything');},
    LunarHologram:animation,LunarHologramAssets:meta,LunarSimulation:{bound(){}},LunarAvailability:{advanceCrew(){}},
    LunarHologramOrbits:{paint(...args){layers.push(args.at(-1)?'front':'back');orbits.paint(...args);}},
    LunarDisplayAssets:{regions:{hologram:{x:0,y:4007,width:675,height:735}}},
    LunarLiveModel:{baseLayout:{width:1100,objects:[{id:'hologram',asset:'hologram',x:342,y:450,width:225,height:245,groundDepth:695,contacts:[]}]},
      infrastructureChoices:{},definitions:{},cleanRegistry:()=>({}),transport:()=>({}),time:()=>null,visibleWorkers:view=>view.workers}};
  context.window=context;vm.createContext(context);
  vm.runInContext(fs.readFileSync(__dirname+'/live-view.js','utf8'),context);
  const api=context.LunarLiveView.mount({host,onRefresh:()=>refreshes++});
  await new Promise(resolve=>setImmediate(resolve));
  function step(elapsed=80){const fn=raf;assert.ok(fn);raf=null;time+=elapsed;fn(time);}
  const holograms=()=>draws.filter(args=>args[0].url===meta.url);
  const latest=()=>holograms().at(-1);
  step();
  assert.equal(intervals,1,'Ambient animation adds no timers');
  return {api,document,motion,documentEvents,motionEvents,draws,layers,step,latest,holograms,context,canvas,
    pause:()=>api.setReducedMotion(reduceSetting=!reduceSetting),get refreshes(){return refreshes;}};
}
(async()=>{
  const r=await renderer();assert.deepEqual(r.latest().slice(1,5),[0,0,675,735]);
  const anchor=r.latest().slice(5),initial=r.holograms().length;
  for(let n=0;n<20;n++)r.step();
  assert.ok(r.holograms().length>initial&&r.holograms().length<=initial+9,'Ring movement uses bounded five-fps updates during a morph hold');
  for(let n=0;n<140;n++)r.step();
  assert.ok(r.holograms().some(args=>args[1]===0&&args[2]===2205),'Capsule is drawn by the real renderer');
  for(const args of r.holograms())assert.deepEqual(args.slice(5),anchor,'Every frame retains the authored destination/anchor');
  for(let i=0;i<r.layers.length;i+=3)assert.deepEqual(r.layers.slice(i,i+3),['back','body','front'],'Rear markings are occluded by the body; front markings pass over it');
  r.pause();r.step();const paused=r.draws.length,pose=r.latest().slice(1,5);
  for(let n=0;n<100;n++)r.step();assert.equal(r.draws.length,paused);assert.deepEqual(r.latest().slice(1,5),pose);
  r.pause();r.step();const resumedPose=r.latest().slice(1,5);r.document.hidden=true;r.documentEvents.visibilitychange();const hidden=r.draws.length;
  for(let n=0;n<100;n++)r.step();assert.equal(r.draws.length,hidden,'Hidden tabs neither advance nor paint');
  r.document.hidden=false;r.documentEvents.visibilitychange();r.step(100000);
  assert.deepEqual(r.latest().slice(1,5),resumedPose,'Visibility return does not catch up elapsed background time');assert.equal(r.refreshes,1);
  r.motion.matches=true;r.motionEvents.change({matches:true});r.step();assert.deepEqual(r.latest().slice(1,5),[0,0,675,735]);
  r.pause();for(let n=0;n<200;n++)r.step();assert.deepEqual(r.latest().slice(1,5),[0,0,675,735],'Resume respects reduced motion for ambient art');
  const beforeDestroy=r.draws.length;r.api.destroy();r.step();assert.equal(r.draws.length,beforeDestroy);
  const reduced=await renderer({reduced:true});for(let n=0;n<200;n++)reduced.step();
  assert.equal(reduced.holograms().length,1);assert.deepEqual(reduced.latest().slice(1,5),[0,0,675,735]);reduced.api.destroy();
  const fallback=await renderer({failedAtlas:true});assert.equal(fallback.holograms().length,0);
  assert.ok(fallback.draws.some(args=>args[0].url.endsWith('astronaut-teal.png')&&args[2]===4007),'Missing optional atlas retains the original packed rocket');fallback.api.destroy();
  console.log('Morph timing, opposed ring motion, depth ordering, fixed anchors, five-fps updates, pause, reduced motion, visibility and fallback passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
