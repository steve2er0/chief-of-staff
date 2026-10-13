/* Existing raster assets only. No API, real jobs or telemetry. */
(function(root){
 'use strict';
 function mount(){
  const model=root.LunarPlacementModel,simulation=root.LunarSimulation,live=root.LunarLiveModel;
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  document.body.dataset.lunarMode='placement';document.title='Lunar Base · All infrastructure placement';
  document.querySelector('main').innerHTML=`
   <header class="masthead"><a class="back" href="/">← Chief of Staff</a><a class="back" href="?mode=workshop">Work types demo ↗</a><a class="back" href="?mode=demo">Original demo ↗</a><a class="back" href="?mode=live">Read-only live view ↗</a><span class="demo-label"><span></span> SYNTHETIC PLACEMENT VIEW</span></header>
   <section class="viewport" aria-label="All infrastructure in one lunar landscape"><canvas id="world" width="1152" height="768" tabindex="0" aria-label="Lunar placement overview: one habitat with adjacent console, lander, holographic rocket platform and test stand, with representative scripted astronauts and clear connecting paths. Select an area or use the buttons below. Space pauses the illustration."></canvas><div id="loading" role="status">Preparing the placement overview…</div></section>
   <div class="controls"><div class="motion"><button id="pause" aria-pressed="false">Pause illustration</button><span id="motion-state">Scripted work poses and lunar bounds</span></div><span class="control-hint">ONE SHARED LANDSCAPE · EXISTING ASSET SCALE</span></div>
   <nav class="entities" aria-label="Placement work areas"></nav>
   <section class="details" aria-labelledby="detail-title"><div><p class="eyebrow" id="detail-kicker">PLACEMENT REVIEW / SYNTHETIC</p><h2 id="detail-title">All the infrastructure, together.</h2><p id="detail-body">Review the habitat and adjacent console, lander, model platform and test stand at their current relative sprite scale. Floor guides leave a clear corridor between the work areas.</p></div><div class="detail-note"><span id="detail-status">Illustrative placement</span><p>Existing approved assets.<br>Seven scripted characters; no real workers.<br>Positions are a proposal for review.</p></div></section>
   <footer>ALL INFRASTRUCTURE · SYNTHETIC DEMO<span>Canvas placement review · no telemetry</span></footer><span id="live-outpost" hidden>all-infrastructure-placement</span>`;
  const canvas=document.getElementById('world'),ctx=canvas.getContext('2d'),images={};
  let time=6,previous=0,paused=media.matches,selected='',ready=false;
  const labels={habitat:'Habitat',console:'Adjacent console',lander:'Lander',hologram:'Model platform',teststand:'Test stand',paths:'Paths / spacing'};
  const nav=document.querySelector('.entities');
  for(const [id,label] of Object.entries(labels)){const b=document.createElement('button');b.dataset.placement=id;b.textContent=label;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>select(id));nav.append(b);}
  function select(id){selected=id;document.getElementById('detail-title').textContent=labels[id];document.getElementById('detail-body').textContent=model.descriptions[id];nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.placement===id)));draw();}
  function motion(){document.getElementById('pause').textContent=paused?'Resume illustration':'Pause illustration';document.getElementById('pause').setAttribute('aria-pressed',String(paused));document.getElementById('motion-state').textContent=paused?(media.matches?'Paused · reduced motion':'Illustration paused'):'Scripted work poses and lunar bounds';}
  function toggle(){paused=!paused;motion();}
  document.getElementById('pause').addEventListener('click',toggle);
  canvas.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();toggle();}});
  media.addEventListener('change',e=>{if(e.matches){paused=true;motion();}});
  document.addEventListener('visibilitychange',()=>{previous=0;});
  function shadow(x,y,width=13,height=0){ctx.fillStyle='rgba(23,25,55,'+(.30-height*.008)+')';ctx.beginPath();ctx.ellipse(x,y,width-height*.16,3,0,0,Math.PI*2);ctx.fill();}
  function packed(object){const region=root.LunarWorkshopAssets.regions[object.asset];ctx.drawImage(images.teal,region.x,region.y,region.width,region.height,object.x,object.y,object.width,object.height);}
  function draw(){
   if(!ready)return;ctx.imageSmoothingEnabled=false;ctx.drawImage(images.terrain,0,0,model.width,model.height);
   for(const path of model.paths){ctx.beginPath();path.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle='#111f364d';ctx.lineWidth=12;ctx.setLineDash([]);ctx.stroke();ctx.strokeStyle=selected==='paths'?'#b0eaf2':'#7ccfd88c';ctx.lineWidth=2;ctx.setLineDash([3,9]);ctx.stroke();}ctx.setLineDash([]);
   const items=model.objects.map(o=>({depth:o.y+o.height,draw:()=>{
    ctx.fillStyle='#181c393c';ctx.beginPath();ctx.ellipse(o.x+o.width/2,o.y+o.height-3,o.width*.39,9,0,0,Math.PI*2);ctx.fill();
    if(o.asset==='habitat'||o.asset==='console')ctx.drawImage(images[o.asset],o.x,o.y,o.width,o.height);else packed(o);
    if(selected===o.id){ctx.strokeStyle='#95e2e4';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(o.x+o.width/2,o.y+o.height,o.width*.48,13,0,0,Math.PI*2);ctx.stroke();}
   }}));
   for(const [i,c] of model.crew.entries()){
    const walk=c.role==='walking',p=walk?model.walker(time,simulation.bound,live.pose):{x:c.x,y:c.y,height:0,squash:1,flip:c.flip};
    shadow(p.x-6,p.y,13,p.height);items.push({depth:p.y,draw:()=>{
     const sprite=c.colour==='amber'?images.amber:images.teal;ctx.save();ctx.translate(Math.round(p.x),Math.round(p.y-p.height));ctx.scale(p.flip?-1:1,p.squash);
     if(walk)ctx.drawImage(sprite,p.frame*64,0,64,64,-32,-58,64,64);
     else if(c.role==='console')ctx.drawImage(sprite,Math.floor((time+i*.47)*3.5)%6*64,128,64,64,-32,-58,64,64);
     else {const role=live.roles[c.role],frame=Math.floor((time+i*.47)*role.rate)%4;ctx.drawImage(sprite,frame*96,192+role.row*64,96,64,-32,-58,96,64);}
     ctx.restore();
    }});
   }
   items.sort((a,b)=>a.depth-b.depth).forEach(item=>item.draw());
   ctx.fillStyle='#e8e3ea';ctx.font='bold 34px ui-monospace, monospace';ctx.fillText('LUNAR BASE',43,60);
   ctx.fillStyle='#adced6';ctx.font='13px ui-monospace, monospace';ctx.fillText('ALL INFRASTRUCTURE · PLACEMENT REVIEW',44,87);
   for(const o of model.objects){ctx.font='12px ui-monospace, monospace';const width=ctx.measureText(o.label).width+18;ctx.fillStyle='#0b162ae6';ctx.fillRect(o.labelX-width/2,o.labelY-15,width,23);ctx.fillStyle='#dce5e9';ctx.fillText(o.label,o.labelX-width/2+9,o.labelY+1);}
   ctx.font='11px ui-monospace, monospace';ctx.fillStyle='#071224dd';ctx.fillRect(30,735,1092,23);ctx.fillStyle='#a9c3cd';ctx.fillText('SYNTHETIC PLACEMENT · EXISTING ASSETS AT ONE SCALE · DASHED CORRIDORS ARE REVIEW GUIDES · NO REAL WORKERS',43,751);
  }
  canvas.addEventListener('click',event=>{const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)*model.width/r.width,y=(event.clientY-r.top)*model.height/r.height;const hit=[...model.objects].sort((a,b)=>b.y+b.height-a.y-a.height).find(o=>x>=o.x&&x<=o.x+o.width&&y>=o.y&&y<=o.y+o.height);if(hit)select(hit.id);});
  function loop(stamp){if(previous)time=simulation.advance(time,(stamp-previous)/1000,paused,document.hidden);previous=stamp;draw();requestAnimationFrame(loop);}
  motion();Promise.all(Object.entries({terrain:'terrain',habitat:'habitat',console:'console',teal:'astronaut-teal',amber:'astronaut-amber'}).map(([key,name])=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{images[key]=image;resolve();};image.onerror=()=>reject(new Error('Placement asset unavailable: '+name));image.src='./assets/'+name+'.png';}))).then(()=>{ready=true;document.getElementById('loading').hidden=true;requestAnimationFrame(loop);}).catch(e=>{document.getElementById('loading').textContent=e.message;});
 }
 root.LunarPlacement={mount};
})(typeof window!=='undefined'?window:globalThis);
