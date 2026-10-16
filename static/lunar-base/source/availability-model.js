/* Read-only astronaut behavior. No lifecycle inference from silence or prose. */
(function(root){
  'use strict';
  const EPS=.01;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function intent(status,raw={}){
    const supported=(status.verified&&!status.simulated)||status.illustrative;
    const fresh=status.freshness==='current'&&supported;
    if(status.attentionPending||status.category==='needs_user')return {mode:'attention',motion:fresh&&status.attentionAnimate,light:'amber',reason:status.reason};
    if(!fresh||['unknown','stale','disconnected','failed','stopped','blocked','needs_input'].includes(status.category))return {mode:'held',motion:false,light:'unknown',reason:status.reason};
    if(status.category==='completed')return {mode:'available',motion:true,light:'dim',reason:'This turn finished; the saved agent remains available. No session-end signal exists.'};
    if(status.category==='waiting')return {mode:'waiting',motion:true,light:'dim',reason:status.reason};
    if(status.category==='active'){
      // Fresh, verified running work may use cosmetic routines. The poses never
      // claim a particular real tool action and never alter the reported state.
      return {mode:'working',motion:true,light:'on',reason:status.illustrative?'Scripted demonstration.':'CoS reports active work. Typing, inspection and maintenance poses are cosmetic; the reported tool activity remains the source of truth.'};
    }
    return {mode:'held',motion:false,light:'unknown',reason:status.reason};
  }
  function obstacles(layout,padding=9){return layout.objects.map(o=>({left:o.x-padding,right:o.x+o.width+padding,top:o.y-padding,bottom:o.y+o.height+padding}));}
  const inside=(p,r)=>p.x>r.left+EPS&&p.x<r.right-EPS&&p.y>r.top+EPS&&p.y<r.bottom-EPS;
  function crosses(a,b,r){
    let lo=0,hi=1;
    for(const [k,min,max] of [['x',r.left+EPS,r.right-EPS],['y',r.top+EPS,r.bottom-EPS]]){
      const d=b[k]-a[k];
      if(Math.abs(d)<EPS){if(a[k]<=min||a[k]>=max)return false;continue;}
      const u=(min-a[k])/d,v=(max-a[k])/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));
      if(lo>=hi)return false;
    }
    return hi>0&&lo<1;
  }
  function segmentDistance(point,from,to){
    const dx=to.x-from.x,dy=to.y-from.y,length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((point.x-from.x)*dx+(point.y-from.y)*dy)/length)):0;
    return Math.hypot(point.x-from.x-t*dx,point.y-from.y-t*dy);
  }
  function route(from,to,layout,occupied=[]){
    if(distance(from,to)<EPS)return [{x:to.x,y:to.y}];
    const blocks=obstacles(layout).filter(r=>!inside(from,r)&&!inside(to,r));
    const circles=occupied.filter(c=>distance(from,c)>=c.radius-EPS);
    const clear=(a,b)=>!blocks.some(r=>crosses(a,b,r))&&!circles.some(c=>segmentDistance(c,a,b)<c.radius-EPS);
    const nodes=[{x:from.x,y:from.y},{x:to.x,y:to.y}];
    for(const path of layout.paths)for(const [x,y] of path)if(!blocks.some(r=>inside({x,y},r)))nodes.push({x,y});
    for(const r of blocks)for(const x of [r.left,r.right])for(const y of [r.top,r.bottom]){
      if(x>=32&&x<=layout.width-32&&y>=58&&y<=layout.height-8&&!blocks.some(q=>inside({x,y},q)))nodes.push({x,y});
    }
    // Circumscribed octagons give blocked walkers room to pass, not just stop.
    for(const c of circles)for(let n=0;n<8;n++){
      const angle=n*Math.PI/4,radius=(c.radius+2)/Math.cos(Math.PI/8);
      const p={x:c.x+Math.cos(angle)*radius,y:c.y+Math.sin(angle)*radius};
      if(p.x>=32&&p.x<=layout.width-32&&p.y>=58&&p.y<=layout.height-8&&!blocks.some(r=>inside(p,r))&&!circles.some(q=>distance(p,q)<q.radius-EPS))nodes.push(p);
    }
    // Retain the free passage between two parked astronauts. Octagon corners
    // alone can miss a narrow gap even when the actual clearance is sufficient.
    for(let i=0;i<circles.length;i++)for(let j=i+1;j<circles.length;j++){
      const a=circles[i],b=circles[j],gap=distance(a,b),radii=a.radius+b.radius;
      if(gap<radii+EPS||gap>radii*1.6)continue;
      const p={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      if(!blocks.some(r=>inside(p,r))&&!circles.some(c=>distance(p,c)<c.radius-EPS))nodes.push(p);
    }
    const costs=nodes.map(()=>Infinity),prior=nodes.map(()=>-1),seen=new Set();costs[0]=0;
    while(seen.size<nodes.length){
      let i=-1;for(let n=0;n<nodes.length;n++)if(!seen.has(n)&&(i<0||costs[n]<costs[i]))i=n;
      if(i<0||!Number.isFinite(costs[i]))break;if(i===1)break;seen.add(i);
      for(let j=0;j<nodes.length;j++)if(j!==i&&!seen.has(j)&&clear(nodes[i],nodes[j])){
        const cost=costs[i]+distance(nodes[i],nodes[j]);if(cost<costs[j]){costs[j]=cost;prior[j]=i;}
      }
    }
    if(prior[1]<0)return null; // Hold honestly if the current layout offers no safe route.
    const points=[];for(let i=1;i>0;i=prior[i])points.unshift(nodes[i]);
    return points;
  }
  const restCache=new WeakMap();
  function restSpots(layout){
    if(restCache.has(layout))return restCache.get(layout);
    const scale=layout.crewScale||1,step=Math.round(67*scale);
    const hab=layout.objects.find(o=>o.id==='habitat'),blocks=obstacles(layout,18*scale);
    const candidates=[],center={x:hab.x+hab.width/2,y:hab.y+hab.height};
    // Stay on the ground beside/in front of the Hub; never spill into the horizon.
    for(let y=Math.floor(hab.y+hab.height-160*scale);y<=Math.min(layout.height-24,hab.y+hab.height+250);y+=step)for(let x=Math.max(64,Math.round(hab.x+38*scale));x<=Math.min(layout.width-40,hab.x+hab.width+320);x+=step){
      const p={x,y};if(!blocks.some(r=>inside(p,r)))candidates.push(p);
    }
    candidates.sort((a,b)=>distance(a,center)-distance(b,center)||a.y-b.y||a.x-b.x);
    restCache.set(layout,candidates);return candidates;
  }
  function restClear(point,occupied,scale){
    // Bounds cover every registered rest/work pose, in either facing direction.
    return occupied.every(({point:p,scale:s})=>Math.abs(point.x-p.x)>=19*scale+32*s||point.y<=p.y-52*s||point.y-51*scale>=p.y+2*s);
  }
  function restTargets(workers,tracks,layout){
    const result=new Map(),spots=restSpots(layout),scale=layout.crewScale||1;
    for(const page of new Set(workers.map(w=>w.position.page))){
      const crew=workers.filter(w=>w.position.page===page),available=crew.filter(w=>intent(w.status,w.raw).mode==='available').sort((a,b)=>a.key.localeCompare(b.key));
      const occupied=crew.filter(w=>intent(w.status,w.raw).mode!=='available').map(w=>{
        const track=tracks.get(w.key),held=track&&['held','attention'].includes(intent(w.status,w.raw).mode);
        return {point:held?track:w.position.work,scale:held?visualScale(w,track,layout):w.position.scale};
      });
      const free=spots.filter(p=>restClear(p,occupied,scale)),used=new Set();
      // Keep existing parked identities stable. Only displaced/new arrivals choose
      // the nearest free Hub position; empty infrastructure needs no reservation.
      for(const w of available){
        const old=tracks.get(w.key)?.restSpot,index=old?free.findIndex(p=>distance(p,old)<EPS):-1;
        if(index>=0&&!used.has(index)){used.add(index);result.set(w.key,free[index]);}
      }
      for(const w of available)if(!result.has(w.key)){
        const index=free.findIndex((p,i)=>!used.has(i));
        if(index>=0){used.add(index);result.set(w.key,free[index]);}
      }
    }
    return result;
  }
  function destination(worker,behavior,layout,restTarget){
    if(behavior.mode==='available'){
      if(restTarget)return restTarget;
      const spots=restSpots(layout),index=worker.position.station;
      return spots[index]||worker.position.work;
    }
    return worker.position.work;
  }
  function visualScale(worker,track,layout){
    if(track.behavior.mode==='working'&&track.workTarget)return worker.position.scale;
    const hubScale=layout.crewScale||1,work=worker.position.work;
    const rest=destination(worker,{mode:'available'},layout,track.restSpot),span=rest.y-work.y;
    const progress=Math.abs(span)>EPS?Math.max(0,Math.min(1,(track.y-work.y)/span)):track.behavior.mode==='available'?1:0;
    return worker.position.scale+(hubScale-worker.position.scale)*progress;
  }
  function random(track){
    let value=track.cosmeticSeed||1;value^=value<<13;value^=value>>>17;value^=value<<5;
    track.cosmeticSeed=value>>>0;return track.cosmeticSeed/4294967296;
  }
  function seed(key){let value=2166136261;for(const letter of String(key))value=Math.imul(value^letter.charCodeAt(0),16777619);return value>>>0||1;}
  function cosmeticRole(track,worker){
    const choices=worker.position.area==='console'?['console','inspect','console','sensor']:['console','inspect','assemble','weld','sensor','scan'];
    const candidates=choices.filter(role=>role!==track.cosmeticRole);
    track.cosmeticRole=candidates[Math.floor(random(track)*candidates.length)];
    track.nextWork=6+random(track)*8;
  }
  function sync(track,worker,layout,restTarget){
    const behavior=intent(worker.status,worker.raw),workAnchor=worker.position.work;
    const sameWork=track?.workAnchor&&distance(track.workAnchor,workAnchor)<EPS;
    const target=behavior.mode==='working'&&sameWork&&track.workTarget?track.workTarget:destination(worker,behavior,layout,restTarget);
    if(!track){
      track={...target,height:0,squash:1,frame:0,phase:worker.visual.phase,behavior,restTime:0,journey:null,goal:{...target},restSpot:behavior.mode==='available'?{...target}:null,workAnchor:{...workAnchor},cosmeticSeed:seed(worker.key)};
      if(behavior.mode==='working')cosmeticRole(track,worker);return track;
    }
    const changed=!track.goal||distance(track.goal,target)>EPS;
    const oldMode=track.behavior?.mode;track.behavior=behavior;
    if(behavior.mode==='available')track.restSpot={...target};
    if(oldMode!==behavior.mode)track.restTime=0;
    if(behavior.mode!=='working'||!sameWork){track.workTarget=null;track.cosmeticRole=null;}
    track.workAnchor={...workAnchor};
    if(behavior.mode==='working'&&!track.cosmeticRole)cosmeticRole(track,worker);
    if(behavior.mode==='attention'){
      // Explicit request takes priority at the actual current position.
      track.journey=null;track.goal=null;track.height=0;track.squash=1;track.frame=0;
    }else if(behavior.motion&&changed){
      const points=route(track,target,layout);track.goal={...target};
      track.journey=points&&distance(track,target)>EPS?{points,index:0,from:{x:track.x,y:track.y},elapsed:0}:null;
      track.routeBlocked=!points;track.height=0;track.squash=1;
    }
    return track;
  }
  function workRoutine(worker,track,peers,layout){
    if(track.behavior.mode!=='working'||!track.behavior.motion||track.journey||track.restTime<(track.nextWork||8))return;
    cosmeticRole(track,worker);track.restTime=0;
    const anchor=worker.position.work,margin=32*(layout.crewScale||1),blocks=obstacles(layout,14),infrastructure=layout.objects.find(o=>o.id===worker.position.area);
    const near=point=>!infrastructure||Math.hypot(Math.max(infrastructure.x-point.x,0,point.x-infrastructure.x-infrastructure.width),Math.max(infrastructure.y-point.y,0,point.y-infrastructure.y-infrastructure.height))<160;
    const scale=worker.position.scale;
    const occupied=peers.flatMap(p=>[
      {point:p.track,scale:visualScale(p.worker,p.track,layout)},
      {point:p.worker.position.work,scale:p.worker.position.scale},
      ...(p.track.goal?[{point:p.track.goal,scale:p.track.behavior.mode==='available'?(layout.crewScale||1):p.worker.position.scale}]:[])
    ]);
    const clear=point=>point.x>=32&&point.x<=layout.width-32&&point.y>=58&&point.y<=layout.height-24&&
      near(point)&&!blocks.some(r=>inside(point,r))&&occupied.every(({point:p,scale:s})=>
        // Reserve the full pose envelope in either facing direction. Center
        // distance alone can leave hands/helmets overlapping at a work stop.
        Math.abs(point.x-p.x)>=32*(scale+s)+8||point.y+2*scale+8<=p.y-52*s||point.y-52*scale-8>=p.y+2*s);
    const candidates=[anchor];
    for(const station of Object.values(layout.stations))if(station.area===worker.position.area){
      const point={x:station.work[0],y:station.work[1]};if(distance(point,anchor)<=240)candidates.push(point);
    }
    // Small local work positions retain the assigned infrastructure and avoid
    // displacing another astronaut's saved work station or current destination.
    for(const [dx,dy] of [[-54,0],[54,0],[0,54],[0,-54],[-40,40],[40,40],[-40,-40],[40,-40]])candidates.push({x:anchor.x+dx,y:anchor.y+dy});
    const free=candidates.filter(p=>clear(p)&&distance(p,track)>24);
    if(!free.length)return;
    const offset=Math.floor(random(track)*free.length);
    for(let n=0;n<free.length;n++){
      const target=free[(offset+n)%free.length],points=route(track,target,layout,peers.map(p=>({...p.track,radius:margin})));
      if(!points)continue;
      track.workTarget={...target};track.goal={...target};track.routeBlocked=false;
      track.journey={points,index:0,from:{x:track.x,y:track.y},elapsed:0};return;
    }
  }
  function advance(track,seconds,pose,bound,canStep=()=>true){
    if(!track.behavior.motion||track.behavior.mode==='attention')return;
    track.phase+=seconds;
    if(track.journey){
      const j=track.journey,to=j.points[j.index],next=pose(j.elapsed+seconds,j.from,to,bound);
      if(!canStep(next))return false;
      j.elapsed+=seconds;Object.assign(track,next);
      if(next.done){
        j.index++;if(j.index===j.points.length){track.journey=null;track.height=0;track.squash=1;track.restTime=0;}
        else{j.from={x:track.x,y:track.y};j.elapsed=0;}
      }
    }else track.restTime+=seconds;
    return true;
  }
  function advanceCrew(workers,tracks,seconds,pose,bound,layout,options={}){
    const separation=32*(layout.crewScale||1);
    for(const worker of [...workers].sort((a,b)=>a.key.localeCompare(b.key))){
      const track=tracks.get(worker.key);if(!track)continue;
      const peers=workers.filter(other=>other.key!==worker.key&&other.position.page===worker.position.page)
        .map(other=>({worker:other,track:tracks.get(other.key)})).filter(p=>p.track);
      if(options.cosmetic)workRoutine(worker,track,peers,layout);
      let blockers=[];
      const stepped=advance(track,seconds,pose,bound,next=>{
        blockers=peers.filter(p=>{
          const current=distance(track,p.track),future=distance(next,p.track);
          // A newly appearing/held agent can already be in someone's way.
          // Permit a planted push-off and movement out of that overlap, never
          // movement farther into it; otherwise neither can take the first step.
          return future<separation&&(current>=separation-EPS||future<current-EPS);
        });
        return !blockers.length;
      });
      if(stepped!==false){track.blockedFor=0;continue;}
      track.blockedFor=(track.blockedFor||0)+seconds;
      // One moving astronaut yields by detouring; the other keeps its route.
      // A stationary/held astronaut is always an obstacle to walk around.
      const yields=blockers.some(p=>!p.track.journey||!p.track.behavior.motion||worker.key.localeCompare(p.worker.key)>0);
      if(track.blockedFor<.4||!yields&&track.blockedFor<2)continue;
      const points=route(track,track.goal,layout,peers.map(p=>({...p.track,radius:separation})));
      track.blockedFor=0;
      if(points){
        track.journey={points,index:0,from:{x:track.x,y:track.y},elapsed:0};
        track.routeBlocked=false;track.height=0;track.squash=1;track.frame=0;track.detours=(track.detours||0)+1;
      }
    }
  }
  function restPose(seconds,seed=0){
    // One short gesture per 28 seconds; seated/neutral remains still otherwise.
    const cycle=Math.floor(seconds/28),phase=seconds%28;
    if(phase>=21&&phase<25)return (cycle+seed)%2?3:2;
    return seed%2?1:0;
  }
  function tabletFrame(seconds,seed=0){const t=(seconds+seed*1.7)%24;return t>=18&&t<21?Math.floor((t-18)*1.3)%4:null;}
  const api={intent,obstacles,inside,crosses,segmentDistance,route,restSpots,restClear,restTargets,destination,visualScale,sync,workRoutine,advance,advanceCrew,restPose,tabletFrame};
  root.LunarAvailability=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
