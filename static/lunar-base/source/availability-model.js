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
      // Only explicit in-progress file/tool work enables the existing work poses.
      // A completed tool event does not complete the agent's running turn.
      const editing=status.activityKind==='file_change'&&/:(?:\s*)(started|running|inProgress|in_progress|working)$/.test(String(raw.activity||''));
      const scripted=status.illustrative&&status.animate;
      return {mode:editing||scripted?'working':'thinking',motion:true,light:'on',reason:editing?'Fresh in-progress file work.':scripted?'Scripted demonstration.':'CoS still reports a running solve; no explicit completion or inter-agent wait is inferred.'};
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
  function route(from,to,layout){
    if(distance(from,to)<EPS)return [{x:to.x,y:to.y}];
    const blocks=obstacles(layout).filter(r=>!inside(from,r)&&!inside(to,r));
    const clear=(a,b)=>!blocks.some(r=>crosses(a,b,r));
    const nodes=[{x:from.x,y:from.y},{x:to.x,y:to.y}];
    for(const path of layout.paths)for(const [x,y] of path)if(!blocks.some(r=>inside({x,y},r)))nodes.push({x,y});
    for(const r of blocks)for(const x of [r.left,r.right])for(const y of [r.top,r.bottom]){
      if(x>=32&&x<=layout.width-32&&y>=58&&y<=layout.height-8&&!blocks.some(q=>inside({x,y},q)))nodes.push({x,y});
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
    const scale=layout.crewScale||1,step=Math.ceil(76*scale);
    const hab=layout.objects.find(o=>o.id==='habitat'),blocks=obstacles(layout,32*scale),stations=Object.values(layout.stations).map(s=>({x:s.work[0],y:s.work[1]}));
    const candidates=[],center={x:hab.x+hab.width/2,y:hab.y+hab.height};
    for(let y=78;y<Math.min(layout.height-12,hab.y+hab.height+600);y+=step)for(let x=48;x<Math.min(layout.width-32,hab.x+hab.width+650);x+=step){
      const p={x,y};if(!blocks.some(r=>inside(p,r))&&stations.every(q=>distance(p,q)>=68*scale))candidates.push(p);
    }
    candidates.sort((a,b)=>distance(a,center)-distance(b,center)||a.y-b.y||a.x-b.x);
    restCache.set(layout,candidates);return candidates;
  }
  function destination(worker,behavior,layout){
    if(behavior.mode==='available'){
      const spots=restSpots(layout),index=worker.position.station;
      return spots[index]||worker.position.work;
    }
    return worker.position.work;
  }
  function sync(track,worker,layout){
    const behavior=intent(worker.status,worker.raw),target=destination(worker,behavior,layout);
    if(!track){return {...target,height:0,squash:1,frame:0,phase:worker.visual.phase,behavior,restTime:0,journey:null,goal:{...target}};}
    const changed=!track.goal||distance(track.goal,target)>EPS;
    const oldMode=track.behavior?.mode;track.behavior=behavior;
    if(oldMode!==behavior.mode)track.restTime=0;
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
  function advance(track,seconds,pose,bound,canStep=()=>true){
    if(!track.behavior.motion||track.behavior.mode==='attention')return;
    track.phase+=seconds;
    if(track.journey){
      const j=track.journey,to=j.points[j.index],next=pose(j.elapsed+seconds,j.from,to,bound);
      if(!canStep(next))return;
      j.elapsed+=seconds;Object.assign(track,next);
      if(next.done){
        j.index++;if(j.index===j.points.length){track.journey=null;track.height=0;track.squash=1;track.restTime=0;}
        else{j.from={x:track.x,y:track.y};j.elapsed=0;}
      }
    }else track.restTime+=seconds;
  }
  function restPose(seconds,seed=0){
    // One short gesture per 28 seconds; seated/neutral remains still otherwise.
    const cycle=Math.floor(seconds/28),phase=seconds%28;
    if(phase>=21&&phase<25)return (cycle+seed)%2?3:2;
    return seed%2?1:0;
  }
  function tabletFrame(seconds,seed=0){const t=(seconds+seed*1.7)%24;return t>=18&&t<21?Math.floor((t-18)*1.3)%4:null;}
  const api={intent,obstacles,inside,crosses,route,restSpots,destination,sync,advance,restPose,tabletFrame};
  root.LunarAvailability=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
