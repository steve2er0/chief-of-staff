window.LunarWorkshopAssets={"regions":{"work":{"x":0,"y":192,"width":384,"height":320,"columns":4,"rows":["assemble","scan","weld","sensor","inspect"],"cell":[96,64],"foot_anchor":[32,58]},"lander":{"x":0,"y":512,"width":233,"height":245},"hologram":{"x":0,"y":765,"width":225,"height":245},"teststand":{"x":0,"y":1018,"width":285,"height":160}}};

/* Synthetic in-memory showcase. No API reads, jobs, process IDs or sessions. */
(function(root){
  'use strict';
  const opened=Date.now();
  const definitions=[
    {id:'demo-flight',name:'Flight data',vision:'Flight data and lander telemetry',roles:['assemble','sensor'],titles:['Assemble a lander instrument bracket','Attach a flight telemetry sensor']},
    {id:'demo-analysis',name:'Analysis',vision:'Rocket model analysis and simulation',roles:['inspect','console'],titles:['Inspect the holographic rocket model','Operate the model analysis console']},
    {id:'demo-test',name:'Test data',vision:'Engine test data and ground test instrumentation',roles:['weld','scan'],titles:['Weld the engine test fixture','Laser scan the test stand']},
    {id:'demo-misc',name:'Miscellaneous',vision:'General notes and housekeeping',roles:['console','assemble'],titles:['Organize mission notes at the exterior console','Repair a habitat exterior panel']}
  ];
  function snapshot(elapsed=(Date.now()-opened)/1000){
    const stamp=new Date().toISOString(),seconds=elapsed;
    const projects=definitions.map(p=>({id:p.id,name:p.name,vision:p.vision,goal:p.vision,created:stamp,updated:stamp}));
    const tasks=definitions.flatMap(p=>p.roles.map((role,i)=>({id:p.id+'-'+i,project_id:p.id,title:p.titles[i],
      goal:'Illustrative workshop scene. No actual agent, hardware operation or worker run.',purpose:'Scripted art and animation demonstration.',
      config:{mode:'simulated'},state:'running',last_activity_at:stamp,updated:stamp,
      latest_update:'Scripted '+role+' pose at shared '+p.name+' infrastructure.',latest_update_at:stamp,
      activity:'Scripted visual demonstration',demo_role:role,demo_area:(seconds+23+i*7)%24<10?'console':'workspace',
      criteria:['Shared project infrastructure','Distinct planted work poses','Gentle lunar bounds'],output_links:[]})));
    return {projects,tasks,jobs:[],local_time:stamp,lunar_demo:true};
  }
  root.LunarWorkshop={snapshot};
})(typeof window!=='undefined'?window:globalThis);

/* Read-only projection of supported CoS snapshots. No operational state writes. */
(function (root) {
  'use strict';
  const ACTIVITY_STALE_MS = 120000, SNAPSHOT_STALE_MS = 15000, WORKERS_PER_PAGE = 10;
  const infrastructureTypes = {
    flight:{label:'Flight data · lander',asset:'lander'},
    analysis:{label:'Analysis · holographic model',asset:'hologram'},
    test:{label:'Test data · engine stand',asset:'teststand'},
    miscellaneous:{label:'Miscellaneous · habitat + exterior console',asset:'habitat'}
  };
  const roles = {
    console:{label:'Console operation',row:null,rate:3.5},
    assemble:{label:'Assembly / hammering',row:0,rate:2.1},
    scan:{label:'Laser scanning',row:1,rate:1.8},
    weld:{label:'Welding',row:2,rate:2.4},
    sensor:{label:'Sensor attachment',row:3,rate:1.5},
    inspect:{label:'Tablet inspection',row:4,rate:1.3}
  };
  function workType(record) {
    // Descriptive metadata chooses scenery; it never proves current activity.
    const fields=['name','title','vision','goal','purpose'];
    const outputs=Array.isArray(record?.expected_outputs)?record.expected_outputs:[];
    const text=fields.map(k=>String(record?.[k]||'')).concat(outputs.map(v=>typeof v==='string'?v:v?.name||'')).join(' ').toLowerCase();
    const matches=[
      ['test',/\b(test data|test stand|test campaign|engine test|ground test|hot[ -]?fire|qualification|bench test)\b/],
      ['flight',/\b(flight data|telemetry|lander|landing|trajectory|orbital|avionics)\b/],
      ['analysis',/\b(analysis|analyse|analyze|analytical|simulation|modelling|modeling|rocket model|hologram)\b/]
    ];
    for(const [type,pattern] of matches) {const match=text.match(pattern);if(match)return {type,matched:match[0],basis:'Descriptive project/task metadata'};}
    return {type:'miscellaneous',matched:null,basis:'No supported work-type cue; habitat / exterior console fallback'};
  }
  function projectInfrastructure(raw,assignments) {
    const direct=workType(raw);if(direct.matched)return direct;
    const counts={test:0,flight:0,analysis:0};
    for(const a of assignments) {const type=workType(a.raw).type;if(type in counts)counts[type]++;}
    const type=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]||a.localeCompare(b))[0];
    return counts[type]?{type,matched:null,basis:'Most common work type in this project’s task metadata'}:direct;
  }
  function roleFor(record,infrastructure,slot,context={}) {
    if(context.illustrative && roles[record.demo_role])return {key:record.demo_role,basis:'Scripted workshop demo role'};
    const text=['title','goal','purpose'].map(k=>String(record[k]||'')).join(' ').toLowerCase();
    for(const [key,pattern] of [['weld',/\bweld\w*\b/],['sensor',/\b(sensor|instrument|attach)\w*\b/],['scan',/\b(scan|laser|survey)\w*\b/],['assemble',/\b(assembl|hammer|fabricat|repair)\w*\b/],['console',/\b(console|terminal)\b/],['inspect',/\b(inspect|review|tablet|analys|analyz|model)\w*\b/]]) {
      const match=text.match(pattern);if(match)return {key,basis:'Illustration selected from task metadata: '+match[0]};
    }
    // Generic tasks get distinct stable visual roles at shared infrastructure.
    // This is explicitly an illustration, not physical-activity telemetry.
    const choices=infrastructure.type==='flight'?['console','assemble','sensor','scan','inspect']:
      infrastructure.type==='analysis'?['inspect','console','scan','sensor','assemble']:
      infrastructure.type==='test'?['console','weld','scan','sensor','inspect']:['console','assemble','weld','inspect','sensor'];
    return {key:choices[slot%choices.length],basis:'Stable illustrative station role; no physical-activity telemetry'};
  }
  const definitions = {
    active: {label:'Reported running', colour:'#62dce4'},
    waiting: {label:'Waiting', colour:'#bac4d4'},
    blocked: {label:'Blocked', colour:'#ffb34d'},
    needs_input: {label:'Needs your review', colour:'#e3b8f5'},
    completed: {label:'Completed', colour:'#a7dfb4'},
    unknown: {label:'Unknown', colour:'#a0a8b5'},
    stale: {label:'Activity stale', colour:'#e9c895'},
    disconnected: {label:'Disconnected', colour:'#bca6a6'},
    failed: {label:'Failed', colour:'#ed9696'},
    stopped: {label:'Stopped', colour:'#a9b0bd'}
  };
  function time(value) {
    if (typeof value !== 'string') return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function proof(record, kind) {
    const mode = kind === 'task' ? record.config?.mode : 'codex';
    return mode === 'codex' && Boolean(record.session_id || (Number.isSafeInteger(record.worker_pid) && record.worker_pid > 0) || time(record.started_at)!==null);
  }
  function classify(record, context = {}) {
    const state = String(record.state || 'unknown'), now = context.now ?? Date.now();
    const simulated = context.kind === 'task' && record.config?.mode === 'simulated';
    const lastActivity = record.last_activity_at || record.updated || null;
    const lastMessage = record.latest_update_at || record.finished_at || record.updated || null;
    const sourceState = state, sourceReported = record.reported_status || null;
    let category = 'unknown', reason = 'Execution state is unavailable.';
    if (['running','stopping'].includes(state)) {
      category = state === 'stopping' ? 'waiting' : 'active';
      reason = state === 'stopping' ? 'CoS reports the worker is stopping.' : 'CoS reports a running worker.';
    } else if (['queued','paused','pending','waiting'].includes(state)) {
      category = 'waiting'; reason = state === 'queued' || state === 'pending' ? 'Waiting; this record does not prove a worker has started.' : 'Worker is paused or waiting.';
    } else if (state === 'ready_for_review' || ['needs_input','waiting_for_input'].includes(state)) {
      category = 'needs_input'; reason = state === 'ready_for_review' ? 'The worker returned a result for your review.' : 'CoS explicitly reports that input is needed.';
    } else if (state === 'blocked') { category = 'blocked'; reason = 'CoS records a blocker.'; }
    else if (state === 'failed') { category = 'failed'; reason = 'CoS records a failure.'; }
    else if (['completed','accepted'].includes(state)) { category = 'completed'; reason = state === 'accepted' ? 'The owner accepted this result.' : 'This CoS call completed.'; }
    else if (['cancelled','superseded'].includes(state)) { category = 'stopped'; reason = 'This recorded run is no longer active.'; }
    else if (state === 'interrupted' || record.recovery_lock) { category = 'unknown'; reason = 'Interrupted; CoS cannot confirm whether the old worker is still connected.'; }
    if (record.recovery_lock) { category = 'unknown'; reason = 'Recovery lock: worker connection is unconfirmed.'; }
    if (state === 'running' && ['blocked','failed'].includes(sourceReported)) {
      category = sourceReported; reason = 'The latest agent update reports ' + sourceReported + '; the CoS lifecycle still says running.';
    }
    let freshness = 'current';
    if (state === 'running' && category === 'active') {
      const at = time(lastActivity), age = at === null ? null : now - at;
      if (age === null || age < -5000) { category = 'unknown'; freshness = 'unknown'; reason = 'No usable activity timestamp; motion is held.'; }
      else if (age > ACTIVITY_STALE_MS) { category = 'stale'; freshness = 'stale'; reason = 'No CoS activity for over two minutes. This does not prove the process stopped.'; }
      if (!context.illustrative && category==='active' && !(record.session_id || (Number.isSafeInteger(record.worker_pid) && record.worker_pid>0))) {
        category='unknown';reason='CoS reports a run starting, but no process or captured session is confirmed yet.';
      }
    }
    if (context.snapshotStale) { category = 'stale'; freshness = 'stale'; reason = 'The displayed snapshot is older than 15 seconds. Motion is held.'; }
    if (context.connected === false) { category = 'disconnected'; freshness = 'disconnected'; reason = 'The CoS service could not be reached. This is last-known state.'; }
    if (simulated) reason = 'Simulated CoS assignment; no real worker is represented.';
    const verified = proof(record, context.kind);
    const animate = (context.illustrative || (verified && !simulated)) && category === 'active';
    const activity = String(record.activity || '');
    const activityKind = /^(command_execution|file_change|plan_update):\s*\w+$/.exec(activity)?.[1] || null;
    return {category, label:context.illustrative && category==='active'?'Scripted work':definitions[category].label, colour:definitions[category].colour, reason,
      sourceState, sourceReported, lastActivity, lastMessage, freshness, simulated, verified, animate,
      illustrative:context.illustrative===true,activityKind,
      area:context.illustrative ? (record.demo_area==='workspace'?'workspace':'console') : activityKind === 'file_change' ? 'workspace' : 'console'};
  }
  function cleanRegistry(saved) {
    const registry = {version:1, projects:Object.create(null), workers:Object.create(null)};
    if (!saved || saved.version !== 1) return registry;
    const usedProjects=new Set();
    for (const [id, slot] of Object.entries(saved.projects || {})) {
      if (id.length <= 200 && Number.isSafeInteger(slot) && slot >= 0 && slot < 100000 && !usedProjects.has(slot)) {registry.projects[id] = slot;usedProjects.add(slot);}
    }
    for (const [pid, slots] of Object.entries(saved.workers || {})) {
      const valid = Object.create(null), used=new Set();
      for (const [id, slot] of Object.entries(slots || {})) {
        if (id.length <= 250 && Number.isSafeInteger(slot) && slot >= 0 && slot < 100000 && !used.has(slot)) {valid[id] = slot;used.add(slot);}
      }
      registry.workers[pid] = valid;
    }
    return registry;
  }
  function assign(slots, ids) {
    let next = Math.max(-1, ...Object.values(slots)) + 1;
    for (const id of [...ids].sort()) if (!Object.prototype.hasOwnProperty.call(slots, id)) slots[id] = next++;
  }
  function projectPosition(slot) { return {x:(slot % 3) * 760, y:Math.floor(slot / 3) * 720}; }
  function workerPosition(project, slot) {
    const visibleSlot = slot % WORKERS_PER_PAGE;
    const stations=project.infrastructure?.type==='miscellaneous'?
      [[128,400],[302,378],[512,385],[585,413],[423,382],[143,518],[300,490],[420,500],[540,490],[660,500]]:
      [[270,525],[530,525],[385,585],[145,515],[645,550],[130,610],[265,670],[530,670],[385,685],[645,680]];
    const [x,y]=stations[visibleSlot],work={x:project.x+x,y:project.y+y};
    return {work,home:{x:work.x+(visibleSlot%2?-42:42),y:work.y+28},page:Math.floor(slot/WORKERS_PER_PAGE),station:visibleSlot};
  }
  function project(raw, registry) {
    const slot = registry.projects[raw.id], position = projectPosition(slot);
    return {id:raw.id, name:String(raw.name || raw.id), raw, slot, ...position, workers:[], assignments:[]};
  }
  function build(snapshot, registry, context = {}) {
    if (!snapshot || !Array.isArray(snapshot.projects) || !Array.isArray(snapshot.tasks) || !Array.isArray(snapshot.jobs)) throw new Error('The CoS snapshot is missing projects, tasks or jobs.');
    const records = snapshot.projects.filter(p => p && typeof p.id === 'string' && p.id.length > 0);
    assign(registry.projects, records.map(p => p.id));
    const projects = records.map(p => project(p, registry)).sort((a,b) => a.slot - b.slot);
    const byProject = new Map(projects.map(p => [p.id,p]));
    let orphanRecords = 0, unverifiedRecords = 0, simulatedRecords = 0;
    const workers = [];
    for (const [kind, list] of [['task',snapshot.tasks],['job',snapshot.jobs]]) {
      for (const record of list) {
        if (!record || typeof record.id !== 'string') continue;
        const owner = byProject.get(record.project_id);
        if (!owner) { orphanRecords++; continue; }
        const status = classify(record, {...context,kind});
        const key = kind + ':' + record.id;
        const assignment = {key, id:record.id, projectId:owner.id, kind, raw:record, status};
        owner.assignments.push(assignment);
        if (status.simulated) { simulatedRecords++; if(!context.illustrative)continue; }
        if (!status.verified) { unverifiedRecords++; if(!context.illustrative)continue; }
        workers.push(assignment); owner.workers.push(assignment);
      }
    }
    for (const p of projects) {
      p.infrastructure=projectInfrastructure(p.raw,p.assignments);
      p.infrastructure={...p.infrastructure,...infrastructureTypes[p.infrastructure.type]};
      const slots = registry.workers[p.id] ||= Object.create(null);
      assign(slots, p.workers.map(w => w.key));
      for (const w of p.workers) {
        w.slot = slots[w.key]; w.position = workerPosition(p,w.slot);
        w.name = String(w.raw.title || (w.kind === 'job' ? 'CoS ' + (w.raw.kind || 'call') : 'Agent task'));
        w.workType=workType(w.raw);
        w.visual={...roleFor(w.raw,p.infrastructure,w.slot,context),phase:w.slot*.73,sharedProject:p.id};
        w.visual.label=roles[w.visual.key].label;
      }
      p.workers.sort((a,b) => a.slot - b.slot);
    }
    return {projects,workers,orphanRecords,unverifiedRecords,simulatedRecords,fixture:snapshot.lunar_fixture === true,illustrative:context.illustrative===true};
  }
  function transport(lastReceived, connected, clientNow) {
    return {connected, snapshotStale:connected && lastReceived > 0 && clientNow - lastReceived > SNAPSHOT_STALE_MS};
  }
  function pose(elapsed, from, to, parameters) {
    const length = Math.hypot(to.x - from.x,to.y - from.y);
    if (length < .01) return {x:to.x,y:to.y,height:0,squash:1,frame:0,done:true};
    const duration = parameters.push + parameters.flight + parameters.landing;
    const hops = Math.ceil(length / parameters.stride), hop = Math.floor(elapsed / duration);
    if (hop >= hops) return {x:to.x,y:to.y,height:0,squash:1,frame:0,done:true};
    const hopTime = elapsed % duration, start = hop * parameters.stride;
    const distance = Math.min(parameters.stride,length - start);
    let progress=0,height=0,squash=1,frame=0;
    if (hopTime < parameters.push) {
      const p=hopTime/parameters.push; squash=1-.07*Math.sin(Math.PI*p);frame=p<.55?0:1;
    } else if (hopTime < parameters.push + parameters.flight) {
      progress=(hopTime-parameters.push)/parameters.flight;height=4*parameters.height*progress*(1-progress);
      frame=progress<.25?2:progress<.70?5:3;
    } else {progress=1;frame=4;squash=1-.08*Math.sin(Math.PI*(hopTime-parameters.push-parameters.flight)/parameters.landing);}
    const fraction=(start+distance*progress)/length;
    return {x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction,height,squash,frame,done:false,flip:to.x<from.x};
  }
  const api={ACTIVITY_STALE_MS,SNAPSHOT_STALE_MS,WORKERS_PER_PAGE,infrastructureTypes,roles,workType,projectInfrastructure,roleFor,definitions,time,classify,proof,cleanRegistry,build,transport,projectPosition,workerPosition,pose};
  root.LunarLiveModel=api;
  if (typeof module !== 'undefined') module.exports=api;
})(typeof window !== 'undefined' ? window : globalThis);

/* One coherent placement review, entirely synthetic and separate from live state. */
(function(root){
 'use strict';
 const width=1152,height=768;
 const objects=[
  {id:'habitat',asset:'habitat',x:136,y:140,width:410,height:255,label:'01 · HABITAT',labelX:341,labelY:447},
  {id:'console',asset:'console',x:103,y:319,width:86,height:95,label:'02 · CONSOLE',labelX:90,labelY:446},
  {id:'lander',asset:'lander',x:815,y:214,width:233,height:245,label:'03 · FLIGHT DATA / LANDER',labelX:930,labelY:516},
  {id:'hologram',asset:'hologram',x:342,y:450,width:225,height:245,label:'04 · ANALYSIS / MODEL',labelX:454,labelY:729},
  {id:'teststand',asset:'teststand',x:763,y:523,width:285,height:160,label:'05 · TEST DATA / STAND',labelX:905,labelY:727}
 ];
 const paths=[[[546,382],[589,421],[621,449],[710,477],[812,473]],[[710,477],[712,585],[637,635],[617,685]],[[712,585],[747,621],[742,675]]];
 const circuit=[{x:621,y:449},{x:710,y:477},{x:712,y:585},{x:637,y:635},{x:617,y:685}];
 const crew=[
  {id:'operator',x:127,y:426,role:'console',colour:'teal',area:'console',label:'Exterior console operation'},
  {id:'repair',x:337,y:422,role:'assemble',colour:'amber',area:'habitat',label:'Habitat panel repair'},
  {id:'sensor',x:812,y:473,role:'sensor',colour:'teal',area:'lander',label:'Lander sensor attachment'},
  {id:'scanner',x:1075,y:490,role:'scan',colour:'amber',area:'lander',flip:true,label:'Lander laser scan'},
  {id:'analyst',x:302,y:693,role:'inspect',colour:'teal',area:'hologram',label:'Model / tablet inspection'},
  {id:'welder',x:728,y:687,role:'weld',colour:'amber',area:'teststand',label:'Test-stand assembly / welding'},
  {id:'walker',x:621,y:449,role:'walking',colour:'teal',area:'paths',label:'Scripted corridor walk'}
 ];
 const descriptions={
  habitat:'The approved warm-lit habitat remains the main base. Its rooftop solar array, communications dish and airlock are the existing supporting artwork.',
  console:'The original exterior console and its equipment boxes sit against the habitat, with room for its operator and a separate panel-repair position.',
  lander:'The existing lander serves the flight-data area. Sensor and scanning positions flank it, with a clear approach from the central corridor.',
  hologram:'The existing holographic rocket platform serves analysis. A tablet-inspection position and open foreground remain around the model.',
  teststand:'The existing engine test stand includes its built-in sensors, plumbing and console. It has a separate welding position and an open approach.',
  paths:'Dashed floor guides show the proposed connections. They are placement aids, not measured routes or live worker locations.'
 };
 function walker(time,parameters,pose){
  const duration=parameters.push+parameters.flight+parameters.landing;
  const segments=circuit.map((from,i)=>({from,to:circuit[(i+1)%circuit.length]}));
  const durations=segments.map(s=>Math.ceil(Math.hypot(s.to.x-s.from.x,s.to.y-s.from.y)/parameters.stride)*duration);
  let t=time%durations.reduce((a,b)=>a+b,0);
  for(let i=0;i<segments.length;i++){if(t<durations[i])return pose(t,segments[i].from,segments[i].to,parameters);t-=durations[i];}
  return {...circuit[0],height:0,squash:1,frame:0};
 }
 const api={width,height,objects,paths,circuit,crew,descriptions,walker};
 root.LunarPlacementModel=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

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

/* GET-only CoS scene. Visual metadata stays in this browser, outside CoS records. */
(function (root) {
  'use strict';
  function mount(options={}) {
    const isDemo=options.demo===true;
    const model=root.LunarLiveModel, bound=root.LunarSimulation.bound;
    document.body.dataset.lunarMode='live';
    document.title=isDemo?'Lunar Base · Illustrative workshop':'Lunar Base · Read-only CoS view';
    document.querySelector('main').innerHTML=`
      <header class="masthead"><a class="back" href="/">← Chief of Staff</a><span class="demo-label"><span></span><b id="live-kind">READ-ONLY CoS VIEW</b></span></header>
      <div class="live-connection"><span id="live-connection" role="status" aria-live="polite">Connecting to this CoS service…</span><button id="live-refresh" type="button">Reconnect / refresh</button><a href="?mode=placement">All infrastructure ↗</a><a href="?mode=workshop">Work types demo ↗</a><a href="?mode=demo">Original demo ↗</a><a id="live-route" href="?mode=live">Read-only live view ↗</a></div>
      <section class="viewport" aria-label="Read-only lunar project map">
        <canvas id="world" width="768" height="512" tabindex="0" aria-label="Read-only lunar map of CoS projects and recorded workers. Drag to pan. Select a building or crew member, or use the lists below. Arrow keys pan; Space pauses illustration."></canvas>
        <div class="scene-title"><p id="live-outpost">YOUR PROJECT OUTPOSTS</p><h1>LUNAR BASE</h1><div class="title-rule"></div></div>
        <div id="live-empty" class="live-empty" role="status">Waiting for the first supported CoS snapshot.</div>
        <div class="scene-caption" id="live-caption">CoS PROJECTS · RECORDED WORKERS</div>
      </section>
      <div class="controls"><div class="motion"><button id="pause" type="button" aria-pressed="false">Pause illustration</button><span id="motion-state">Only fresh reported activity animates</span></div><div class="live-camera"><button id="live-zoom-out" aria-label="Zoom out">−</button><button id="live-zoom-in" aria-label="Zoom in">+</button><button id="live-overview">All outposts</button></div></div>
      <nav id="live-projects" class="entities" aria-label="Project outposts"></nav>
      <div class="live-crew-heading"><span id="live-crew-heading">Recorded crew</span><div><button id="live-page-prev" aria-label="Previous crew page">←</button><span id="live-crew-page"></span><button id="live-page-next" aria-label="Next crew page">→</button></div></div>
      <nav id="live-workers" class="entities" aria-label="Recorded workers"></nav>
      <section class="details live-details" aria-labelledby="detail-title"><div><p class="eyebrow" id="detail-kicker">READ-ONLY CONNECTION</p><h2 id="detail-title">Your projects, in place.</h2><p id="detail-body">This view reads this CoS service. It does not discover independent Codex sessions or launch work.</p><div id="live-detail-fields"></div></div><div class="detail-note"><span id="detail-status">Connecting</span><p id="live-source"></p></div></section>
      <div class="live-legend" aria-label="Worker states"><span>Running</span><span>Waiting</span><span>Blocked / failed</span><span>Needs review</span><span>Completed</span><span>Unknown / stale</span></div>
      <footer><b id="view-footer">READ-ONLY CoS VIEW</b><span id="view-metaphor">Task roles are illustrations · no physical activity or token telemetry</span></footer>`;
    if(isDemo) {textSetup();}
    function textSetup(){document.getElementById('view-footer').textContent='ILLUSTRATIVE WORKSHOP DEMO';document.getElementById('view-metaphor').textContent='Eight scripted characters · no real agent activity';document.getElementById('live-refresh').hidden=true;}
    const canvas=document.querySelector('#world'),ctx=canvas.getContext('2d'),images={},tracks=new Map();
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const storageKey=isDemo?'cos.lunar.workshop-demo.layout.v1':'cos.lunar.layout.v1';
    let registry,storageAvailable=true;
    try {registry=model.cleanRegistry(JSON.parse(localStorage.getItem(storageKey)||'null'));} catch {registry=model.cleanRegistry(null);}
    let snapshot=null,view={projects:[],workers:[]},connected=false,lastReceived=0,serverAnchor=0,clientAnchor=0;
    let selectedProject=new URLSearchParams(location.search).get('project')||'',selectedWorker='',fetching=false,requestController=null,connectionError='',initialFocus=false;
    let paused=motion.matches,previous=0,crewPage=0,drag=null,lastPainted=[],listsSignature='',detailSignature='',demoElapsed=0;
    let camera={x:0,y:0,zoom:1},assetsReady=false,dirty=true,projectFocus=true;
    const element=id=>document.getElementById(id);
    const text=(id,value)=>{element(id).textContent=value;};
    const date=value=>model.time(value)===null?'Unavailable':new Date(value).toLocaleString();
    function field(label,value,container=element('live-detail-fields')) {
      if (value===undefined || value===null || value==='') return;
      const row=document.createElement('div');row.className='live-field';
      const title=document.createElement('strong');title.textContent=label;
      const content=document.createElement('span');content.textContent=String(value);
      row.append(title,content);container.append(row);
    }
    function logicalNow() {return serverAnchor ? serverAnchor+(Date.now()-clientAnchor) : Date.now();}
    function currentContext() {return {...model.transport(lastReceived,connected,Date.now()),now:logicalNow(),illustrative:isDemo};}
    function persist() {
      try {localStorage.setItem(storageKey,JSON.stringify(registry));}
      catch {storageAvailable=false;}
    }
    function selected() {return view.projects.find(p=>p.id===selectedProject);}
    function reconcile() {
      if (!snapshot) return;
      view=model.build(snapshot,registry,currentContext());
      persist();
      if (!view.projects.some(p=>p.id===selectedProject)) {
        selectedProject=view.projects[0]?.id||'';selectedWorker='';crewPage=0;
        if (selectedProject) focus(selected());
      }
      if(!initialFocus && selectedProject) {focus(selected());initialFocus=true;}
      if (selectedWorker && !view.workers.some(w=>w.key===selectedWorker)) selectedWorker='';
      for (const worker of view.workers) {
        let track=tracks.get(worker.key);
        const destination=worker.status.area==='workspace' && (isDemo||worker.visual.key!=='console')?worker.position.home:worker.position.work;
        if (!track) {
          // Opening the page never replays a fictitious worker journey.
          const initial=worker.status.animate?destination:worker.position.home;
          track={x:initial.x,y:initial.y,height:0,squash:1,frame:0,journey:null,target:worker.status.area,phase:worker.visual.phase};
          tracks.set(worker.key,track);
        } else if (worker.status.animate && !track.journey && (track.target!==worker.status.area || Math.hypot(track.x-destination.x,track.y-destination.y)>.1)) {
          track.journey={from:{x:track.x,y:track.y},to:destination,elapsed:0};
          track.target=worker.status.area;
        }
        if (!worker.status.animate) {
          track.journey=null;track.height=0;track.squash=1;track.frame=0;
        }
      }
      dirty=true; renderLists();renderDetail();renderConnection();
    }
    function focus(project) {
      if (!project) return;
      camera={x:project.x-150,y:project.y+5,zoom:.72};
      projectFocus=true;
      dirty=true;
    }
    function projectPick(id) {
      selectedProject=id;selectedWorker='';crewPage=0;
      const p=selected();
      const active=p.workers.find(w=>w.status.animate);
      if (active) crewPage=active.position.page;
      focus(p);renderLists();renderDetail();
    }
    function workerPick(key) {
      const worker=view.workers.find(w=>w.key===key);if(!worker)return;
      selectedProject=worker.projectId;selectedWorker=key;crewPage=worker.position.page;
      focus(selected());renderLists();renderDetail();
    }
    function renderLists() {
      const signature=JSON.stringify([selectedProject,selectedWorker,crewPage,view.projects.map(p=>[p.id,p.name,p.infrastructure.type,p.workers.length,p.assignments.length]),view.workers.map(w=>[w.key,w.name,w.visual.key,w.status.category,w.position.page])]);
      if(signature===listsSignature)return;listsSignature=signature;
      const focused=document.activeElement?.dataset;
      const focusProject=focused?.liveProject,focusWorker=focused?.liveWorker;
      const projectList=element('live-projects'),workerList=element('live-workers');
      projectList.replaceChildren();workerList.replaceChildren();
      for (const p of view.projects) {
        const button=document.createElement('button');button.textContent=p.name;
        button.setAttribute('aria-pressed',String(p.id===selectedProject));button.dataset.liveProject=p.id;
        button.addEventListener('click',()=>projectPick(p.id));projectList.append(button);
      }
      const p=selected(),workers=p?.workers||[];
      const pageCount=workers.length?Math.max(...workers.map(w=>w.position.page))+1:1;
      crewPage=Math.min(crewPage,pageCount-1);
      text('live-crew-heading',workers.length+(isDemo?' scripted character':' recorded worker')+(workers.length===1?'':'s')+(p?' · '+p.name:''));
      text('live-crew-page','Crew page '+(crewPage+1)+' / '+pageCount);
      element('live-page-prev').disabled=crewPage===0;
      element('live-page-next').disabled=crewPage>=pageCount-1;
      for (const worker of workers.filter(w=>w.position.page===crewPage)) {
        const button=document.createElement('button');button.setAttribute('aria-pressed',String(worker.key===selectedWorker));
        button.dataset.liveWorker=worker.key;
        const dot=document.createElement('i');dot.style.backgroundColor=worker.status.colour;
        const label=document.createElement('span');label.textContent=worker.name;
        const status=document.createElement('small');status.textContent=worker.status.label;
        button.append(dot,label,status);button.addEventListener('click',()=>workerPick(worker.key));workerList.append(button);
      }
      if (p && !workers.length) {
        const note=document.createElement('p');note.className='live-no-workers';
        note.textContent=p.assignments.length?'No confirmed real worker run in these records. Queued, simulated and unverified assignments remain in project details.':'No recorded workers for this project.';
        workerList.append(note);
      }
      text('live-outpost',p?p.name.toUpperCase():'YOUR PROJECT OUTPOSTS');
      text('live-caption',(p?.infrastructure.label.toUpperCase()||'PROJECT OUTPOSTS')+' · '+(isDemo?'SCRIPTED DEMO':view.workers.length+' RECORDED WORKERS'));
      if(focusProject)[...projectList.children].find(b=>b.dataset.liveProject===focusProject)?.focus();
      if(focusWorker)[...workerList.children].find(b=>b.dataset.liveWorker===focusWorker)?.focus();
    }
    function renderConnection() {
      const context=currentContext();
      const message=!snapshot?(connectionError||'Connecting to this CoS service…'):
        !connected?'Disconnected · showing the last snapshot · '+connectionError:
        context.snapshotStale?'Snapshot stale · motion held':
        isDemo?'Scripted workshop · eight illustrative characters · no real workers':view.fixture?'QA fixtures connected · no real workers started':'Connected to this CoS service · read-only';
      text('live-connection',message+(lastReceived?' · snapshot '+new Date(lastReceived).toLocaleTimeString():''));
      text('live-kind',isDemo?'ILLUSTRATIVE WORKSHOP DEMO':view.fixture?'READ-ONLY · QA FIXTURES':'READ-ONLY CoS VIEW');
      const empty=element('live-empty');empty.hidden=Boolean(snapshot && view.projects.length);
      empty.textContent=!snapshot?(connectionError||'Waiting for the first supported CoS snapshot.'):
        'No CoS projects yet. Create or open projects in Chief of Staff, then return here.';
      empty.classList.toggle('connection-error',Boolean(connectionError));
      if (!storageAvailable) text('live-connection',message+' · visual layout storage unavailable');
    }
    function renderDetail() {
      const p=selected(),worker=view.workers.find(w=>w.key===selectedWorker);
      const signature=JSON.stringify([p?.raw,p?.infrastructure,p?.assignments.map(a=>[a.key,a.status.category]),worker?.raw,worker?.visual,worker?.status.category,selectedProject,selectedWorker,connected]);
      if(signature===detailSignature)return;detailSignature=signature;
      element('live-detail-fields').replaceChildren();
      if (!p) {
        text('detail-kicker','READ-ONLY CONNECTION');text('detail-title',snapshot?'No project records':'Your projects, in place.');
        text('detail-body','This view reads GET /api/state on this CoS service. It does not discover independent Codex sessions or launch work.');
        text('detail-status',connected?'No projects':'Not connected');
        text('live-source','Source: GET /api/state\nLast snapshot: '+(lastReceived?date(new Date(lastReceived).toISOString()):'Unavailable'));
        return;
      }
      if (worker) {
        const raw=worker.raw,status=worker.status;
        text('detail-kicker',worker.kind==='job'?'CoS COORDINATOR CALL':'CoS AGENT ASSIGNMENT');
        text('detail-title',worker.name);text('detail-body',raw.latest_update||raw.result?.summary||raw.progress||'No update text was supplied.');
        text('detail-status',status.label);
        field('Project',p.name);field('Recorded lifecycle',status.sourceState);field('Agent-reported blocker',status.sourceReported);
        field('Shared infrastructure',p.infrastructure.label);field('Infrastructure choice',p.infrastructure.basis+(p.infrastructure.matched?' · '+p.infrastructure.matched:''));
        field('Illustrative work pose',worker.visual.label);field('Pose choice',worker.visual.basis);
        field('Illustration boundary',isDemo?'Entirely scripted demo; no worker process or session.':'Pose is a visual metaphor. Current activity is only the reported lifecycle/tool event below.');
        field('What this means',status.reason);field('Last CoS activity',date(status.lastActivity));
        field('Last message / result update',date(status.lastMessage));field('Run started',date(raw.started_at));
        field('Reported tool activity',raw.activity);field('Goal',raw.goal||raw.purpose);
        field('Worker record',raw.id);field('Captured session',raw.session_id);
        if (Array.isArray(raw.criteria)) field('Acceptance criteria',raw.criteria.join('\n'));
        if (raw.result?.next_steps?.length) field('Reported next step',raw.result.next_steps.join('\n'));
        if (worker.kind==='task') for (const output of raw.output_links||[]) {
          const link=document.createElement('a');link.className='live-output';link.textContent=output.label||output.name;
          link.href='/api/output/'+encodeURIComponent(worker.id)+'/'+encodeURIComponent(output.name);link.target='_blank';link.rel='noopener';
          element('live-detail-fields').append(link);
        }
        text('live-source',(isDemo?'Scripted in-memory workshop demo':view.fixture?'Synthetic QA fixture':'Source: GET /api/state · '+worker.kind+' '+worker.id)+'\nLast snapshot received: '+date(new Date(lastReceived).toISOString())+'\nMotion illustrates state; work poses are not physical telemetry.');
      } else {
        text('detail-kicker','PROJECT OUTPOST');text('detail-title',p.name);text('detail-body',p.raw.vision||p.raw.goal||'No project description was supplied.');
        text('detail-status',isDemo?'Scripted outpost':!connected?'Disconnected · last known project':'Recorded project');
        field('Project ID',p.id);field('Project last updated',date(p.raw.updated));field(isDemo?'Scripted characters':'Recorded workers',p.workers.length);
        field('Shared infrastructure',p.infrastructure.label);field('Infrastructure choice',p.infrastructure.basis+(p.infrastructure.matched?' · '+p.infrastructure.matched:''));
        field('Assignments and CoS calls',p.assignments.length);
        field('Simulated assignments',p.assignments.filter(a=>a.status.simulated).length);
        field('Unconfirmed / not started',p.assignments.filter(a=>!a.status.verified && !a.status.simulated).length);
        for (const assignment of p.assignments.filter(a=>!isDemo && (!a.status.verified || a.status.simulated))) {
          field(assignment.raw.title||'CoS '+(assignment.raw.kind||'call'),(assignment.status.simulated?'Simulated · ':'')+assignment.status.sourceState+' · '+(assignment.raw.latest_update||assignment.raw.progress||assignment.status.reason));
        }
        if(!isDemo) {const link=document.createElement('a');link.className='live-output';link.textContent='Open original CoS project ↗';link.href='/#project/'+encodeURIComponent(p.id);element('live-detail-fields').append(link);}
        text('live-source',(isDemo?'Scripted in-memory workshop demo':view.fixture?'Synthetic QA fixtures':'Source: GET /api/state · project '+p.id)+'\nLast snapshot received: '+date(new Date(lastReceived).toISOString())+'\nLocations and work roles are visual metadata only.');
      }
    }
    async function refresh() {
      if (fetching) return;
      fetching=true;requestController=new AbortController();
      const timeout=setTimeout(()=>requestController.abort(),8000);
      try {
        if(isDemo) {snapshot=root.LunarWorkshop.snapshot(demoElapsed);connected=true;lastReceived=clientAnchor=Date.now();serverAnchor=lastReceived;reconcile();return;}
        const response=await fetch('/api/state',{method:'GET',credentials:'same-origin',cache:'no-store',signal:requestController.signal});
        if (!response.ok) {
          throw new Error(response.status===401?'Open the private CoS launch URL, then use Reconnect / refresh.':response.status===404?'This page must be opened from Chief of Staff for live data.':'CoS returned HTTP '+response.status+'.');
        }
        const data=await response.json();
        // Validate before replacing last-known data.
        model.build(data,model.cleanRegistry(registry),{now:Date.now(),connected:true});
        snapshot=data;connected=true;connectionError='';lastReceived=clientAnchor=Date.now();serverAnchor=model.time(data.local_time)||lastReceived;
        reconcile();
      } catch(error) {
        connected=false;connectionError=error.name==='AbortError'?'The CoS service timed out.':error.message;
        if(snapshot)reconcile();else renderConnection();
      } finally {clearTimeout(timeout);fetching=false;requestController=null;}
    }
    function screen(point) {return {x:(point.x-camera.x)*camera.zoom,y:(point.y-camera.y)*camera.zoom};}
    function world(point) {return {x:point.x/camera.zoom+camera.x,y:point.y/camera.zoom+camera.y};}
    function ring(point,width,colour) {
      ctx.strokeStyle=colour;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(point.x,point.y,width,width*.25,0,0,Math.PI*2);ctx.stroke();
    }
    function packed(name,x,y,width,height) {
      const region=root.LunarWorkshopAssets.regions[name];
      ctx.drawImage(images.teal,region.x,region.y,region.width,region.height,x,y,width,height);
    }
    function draw() {
      if(!assetsReady)return;
      ctx.imageSmoothingEnabled=false;ctx.drawImage(images.terrain,0,0,768,512);
      lastPainted=[];const drawables=[];
      for (const p of view.projects) {
        if(projectFocus && p.id!==selectedProject)continue;
        const misc=p.infrastructure.type==='miscellaneous';
        const building=misc?{x:p.x+191,y:p.y+100,width:410,height:255}:{x:p.x+235,y:p.y+65,width:310,height:193};
        const s=screen(building),w=building.width*camera.zoom,h=building.height*camera.zoom;
        if(s.x+w < -100||s.x>868||s.y+h < -100||s.y>612)continue;
        drawables.push({depth:building.y+building.height,draw:()=>{
          ctx.fillStyle='#1a1d3d55';ctx.beginPath();ctx.ellipse(s.x+w*.45,s.y+h-10*camera.zoom,w*.37,w*.06,0,0,Math.PI*2);ctx.fill();
          ctx.drawImage(images.habitat,s.x,s.y,w,h);
          if(p.id===selectedProject)ring({x:s.x+w*.45,y:s.y+h},w*.38,'#75dfe4');
          ctx.font=Math.max(8,11*camera.zoom)+'px ui-monospace, monospace';
          const label=p.name.length>38?p.name.slice(0,37)+'…':p.name;
          const width=ctx.measureText(label).width+16;
          const labelY=misc?Math.max(12,s.y-22):s.y+h+8;
          ctx.fillStyle='#0b1422e6';ctx.fillRect(s.x,labelY,width,20);
          ctx.fillStyle='#e8e4df';ctx.fillText(label,s.x+8,labelY+14);
        }});
        lastPainted.push({kind:'project',id:p.id,x:s.x,y:s.y,width:w,height:h,depth:building.y+building.height});
        if(!misc) {
          const region=root.LunarWorkshopAssets.regions[p.infrastructure.asset];
          const point=screen({x:p.x+384-region.width/2,y:p.y+500-region.height});
          drawables.push({depth:p.y+500,draw:()=>{
            ctx.fillStyle='#1a1d3d44';ctx.beginPath();ctx.ellipse(point.x+region.width*camera.zoom/2,point.y+region.height*camera.zoom,region.width*.42*camera.zoom,9*camera.zoom,0,0,Math.PI*2);ctx.fill();
            packed(p.infrastructure.asset,point.x,point.y,region.width*camera.zoom,region.height*camera.zoom);
          }});
          lastPainted.push({kind:'project',id:p.id,x:point.x,y:point.y,width:region.width*camera.zoom,height:region.height*camera.zoom,depth:p.y+500});
        } else {
          // The original exterior console stays next to the habitat.
          const consolePoint=screen({x:p.x+139,y:p.y+298});
          drawables.push({depth:p.y+393,draw:()=>ctx.drawImage(images.console,consolePoint.x,consolePoint.y,86*camera.zoom,95*camera.zoom)});
        }
      }
      for(const worker of view.workers) {
        if(projectFocus && worker.projectId!==selectedProject)continue;
        const visiblePage=worker.projectId===selectedProject?crewPage:0;
        if(worker.position.page!==visiblePage)continue;
        const track=tracks.get(worker.key);if(!track)continue;
        const work=screen(worker.position.work),position=screen(track),scale=camera.zoom;
        if(position.x < -80||position.x>848||position.y < -80||position.y>592)continue;
        const owner=view.projects.find(p=>p.id===worker.projectId);
        if(worker.visual.key==='console' && !(owner.infrastructure.type==='miscellaneous' && worker.position.station===0)) {
          drawables.push({depth:worker.position.work.y-7,draw:()=>ctx.drawImage(images.console,work.x+11*scale,work.y-102*scale,86*scale,95*scale)});
        }
        drawables.push({depth:track.y,draw:()=>{
          ctx.fillStyle='rgba(23,25,55,'+(.30-track.height*.008)+')';ctx.beginPath();
          ctx.ellipse(position.x-6*scale,position.y,(13-track.height*.16)*scale,3*scale,0,0,Math.PI*2);ctx.fill();
          if(worker.key===selectedWorker)ring(position,16*scale,worker.status.colour);
          const moving=worker.status.animate && track.journey,working=worker.status.animate && !track.journey && (!isDemo||worker.status.area==='console');
          const row=moving?0:working?2:1,frame=moving?track.frame:working?Math.floor(track.phase*5)%6:0;
          const role=model.roles[worker.visual.key],workFlip=working && worker.visual.key!=='console' && track.x>owner.x+384;
          ctx.save();ctx.translate(position.x,position.y-track.height*scale);ctx.scale(scale*(working?(workFlip?-1:1):(track.flip?-1:1)),scale*track.squash);
          if(!worker.status.animate)ctx.globalAlpha=.80;
          const sprite=worker.slot%2?images.amber:images.teal;
          if(working && role.row!==null) {
            const workFrame=Math.floor(track.phase*role.rate)%4;
            ctx.drawImage(sprite,workFrame*96,192+role.row*64,96,64,-32,-58,96,64);
          } else ctx.drawImage(sprite,frame*64,row*64,64,64,-32,-58,64,64);
          ctx.restore();
          ctx.fillStyle=worker.status.colour;ctx.fillRect(position.x-3,position.y+7*scale,6,3);
        }});
        lastPainted.push({kind:'worker',id:worker.key,x:position.x-25*scale,y:position.y-(track.height+54)*scale,width:50*scale,height:60*scale,depth:track.y});
      }
      drawables.sort((a,b)=>a.depth-b.depth).forEach(item=>item.draw());
    }
    function updateMotion() {
      element('pause').textContent=paused?'Resume illustration':'Pause illustration';
      element('pause').setAttribute('aria-pressed',String(paused));
      text('motion-state',paused?(motion.matches?'Paused · reduced motion':'Illustration paused'):isDemo?'Scripted work poses and gentle lunar bounds':'Fresh reported activity enables illustrative poses');
    }
    function loop(timestamp) {
      const elapsed=previous?Math.min(.08,(timestamp-previous)/1000):0;previous=timestamp;
      if(!paused && !document.hidden) {
        if(isDemo)demoElapsed+=elapsed;
        for(const worker of view.workers) {
          const status=model.classify(worker.raw,{...currentContext(),kind:worker.kind}),track=tracks.get(worker.key);
          if(!status.animate||!track)continue;
          track.phase+=elapsed;
          if(track.journey) {
            track.journey.elapsed+=elapsed;
            const pose=model.pose(track.journey.elapsed,track.journey.from,track.journey.to,bound);
            Object.assign(track,pose);if(pose.done)track.journey=null;
          }
        }
      }
      if(assetsReady && (dirty || drag || (!paused && view.workers.some(w=>w.status.animate)))) {draw();dirty=false;}
      requestAnimationFrame(loop);
    }
    function zoom(factor) {
      const center=world({x:384,y:300}),next=Math.max(.18,Math.min(1.5,camera.zoom*factor));
      camera={x:center.x-384/next,y:center.y-300/next,zoom:next};dirty=true;
    }
    function overview() {
      if(!view.projects.length)return;
      const minX=Math.min(...view.projects.map(p=>p.x+40)),minY=Math.min(...view.projects.map(p=>p.y+80));
      const maxX=Math.max(...view.projects.map(p=>p.x+700)),maxY=Math.max(...view.projects.map(p=>p.y+680));
      const zoom=Math.min(.85,700/(maxX-minX),415/(maxY-minY));
      camera={x:minX-34/zoom,y:minY-70/zoom,zoom};dirty=true;
      projectFocus=false;
    }
    element('pause').addEventListener('click',()=>{paused=!paused;updateMotion();});
    motion.addEventListener('change',event=>{if(event.matches){paused=true;updateMotion();}});
    element('live-refresh').addEventListener('click',refresh);
    element('live-zoom-in').addEventListener('click',()=>zoom(1.25));
    element('live-zoom-out').addEventListener('click',()=>zoom(.8));
    element('live-overview').addEventListener('click',overview);
    element('live-page-prev').addEventListener('click',()=>{crewPage=Math.max(0,crewPage-1);selectedWorker='';renderLists();renderDetail();});
    element('live-page-next').addEventListener('click',()=>{crewPage++;selectedWorker='';renderLists();renderDetail();});
    canvas.addEventListener('pointerdown',event=>{canvas.setPointerCapture(event.pointerId);drag={x:event.clientX,y:event.clientY,camera:{...camera},moved:false};});
    canvas.addEventListener('pointermove',event=>{
      if(!drag)return;const rect=canvas.getBoundingClientRect(),dx=(event.clientX-drag.x)*768/rect.width,dy=(event.clientY-drag.y)*512/rect.height;
      if(Math.abs(dx)+Math.abs(dy)>4)drag.moved=true;
      if(drag.moved){camera={...camera,x:drag.camera.x-dx/camera.zoom,y:drag.camera.y-dy/camera.zoom};projectFocus=false;}
    });
    canvas.addEventListener('pointerup',event=>{
      if(!drag)return;const moved=drag.moved;drag=null;if(moved)return;
      const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*768/rect.width,y=(event.clientY-rect.top)*512/rect.height;
      const hit=[...lastPainted].sort((a,b)=>b.depth-a.depth).find(item=>x>=item.x&&x<=item.x+item.width&&y>=item.y&&y<=item.y+item.height);
      if(hit)hit.kind==='worker'?workerPick(hit.id):projectPick(hit.id);
    });
    canvas.addEventListener('pointercancel',()=>{drag=null;});
    canvas.addEventListener('keydown',event=>{
      if(event.code==='Space'){event.preventDefault();paused=!paused;updateMotion();}
      const delta={ArrowLeft:[-50,0],ArrowRight:[50,0],ArrowUp:[0,-50],ArrowDown:[0,50]}[event.key];
      if(delta){event.preventDefault();camera.x+=delta[0]/camera.zoom;camera.y+=delta[1]/camera.zoom;projectFocus=false;dirty=true;}
    });
    document.addEventListener('visibilitychange',()=>{previous=0;if(!document.hidden)refresh();});
    window.addEventListener('pagehide',()=>requestController?.abort(),{once:true});
    updateMotion();renderConnection();
    Promise.all(Object.entries({terrain:'terrain',habitat:'habitat',console:'console',teal:'astronaut-teal',amber:'astronaut-amber'}).map(([key,name])=>new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>{images[key]=image;resolve();};image.onerror=()=>reject(new Error('Scene asset unavailable: '+name));image.src='./assets/'+name+'.png';
    }))).then(()=>{assetsReady=true;requestAnimationFrame(loop);}).catch(error=>{connectionError=error.message;renderConnection();});
    refresh();
    setInterval(()=>{if(!document.hidden)refresh();},2500);
    setInterval(()=>{if(snapshot)reconcile();},1000);
  }
  root.LunarLiveView={mount};
})(typeof window !== 'undefined'?window:globalThis);

const lunarMode=new URLSearchParams(location.search).get('mode');
if(lunarMode==='live'){window.LunarLiveView.mount();}else if(lunarMode==='placement'){window.LunarPlacement.mount();}else if(lunarMode==='workshop'){window.LunarLiveView.mount({demo:true});}else{
/* Isolated Canvas renderer. All activity below is scripted synthetic state. */
(function () {
  'use strict';
  const canvas = document.querySelector('#world'), ctx = canvas.getContext('2d');
  const sim = window.LunarSimulation, motion = matchMedia('(prefers-reduced-motion: reduce)');
  const images = {}, loading = document.querySelector('#loading');
  let time = 4, previous = 0, paused = motion.matches, selected = '', latestCrew = sim.crew(time);
  const objects = {
    habitat: {x: 191, y: 130, width: 410, height: 255, depth: 383},
    console: {x: 154, y: 300, width: 86, height: 95, depth: 395}
  };
  const metadata = {
    teal: ['CREW / 01 · TEAL SUIT', 'Astra', 'Astra follows the circuit in gentle lunar bounds, then takes a turn at the research console. All activity is a scripted visual demonstration.'],
    amber: ['CREW / 02 · AMBER SUIT', 'Sol', 'Sol explores the foreground and takes the next console shift. The suit colour keeps the two crew members discernible as their paths continue.'],
    habitat: ['HABITAT / A-01', 'Tranquility habitat', 'A single warm-lit habitat, with a rooftop array, communications dish and airlock ramp. Its artwork is a separate transparent asset with no baked-in crew.'],
    console: ['WORK AREA / C-01', 'Research console', 'Astra and Sol take turns here. Typing uses a separate planted-foot animation, and the work area stays still. All console activity is synthetic.']
  };
  function updateMotion() {
    document.querySelector('#pause').textContent = paused ? 'Resume motion' : 'Pause motion';
    document.querySelector('#pause').setAttribute('aria-pressed', String(paused));
    document.querySelector('#motion-state').textContent = paused ? (motion.matches ? 'Paused · reduced motion' : 'Motion paused') : 'Bounding & working';
  }
  function select(id) {
    selected = id;
    const data = metadata[id];
    document.querySelector('#detail-kicker').textContent = data[0];
    document.querySelector('#detail-title').textContent = data[1];
    document.querySelector('#detail-body').textContent = data[2];
    document.querySelectorAll('[data-entity]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.entity === id)));
    updateDetail();
    draw();
  }
  function updateDetail() {
    const astronaut = latestCrew.find(a => a.id === selected);
    document.querySelector('#detail-status').textContent = astronaut ? 'Demo state · ' + (astronaut.boundPhase || astronaut.action) : 'Synthetic activity';
  }
  function shadow(x, y, width, alpha = .30) {
    ctx.fillStyle = 'rgba(23,25,55,' + alpha + ')';
    ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), width, width * .25, -.15, 0, Math.PI * 2); ctx.fill();
  }
  function selectionRing(x, y, width, colour) {
    ctx.strokeStyle = colour; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y) + 1, width, width * .28, 0, 0, Math.PI * 2); ctx.stroke();
  }
  function renderAstronaut(agent) {
    const x = Math.round(agent.x), y = Math.round(agent.y);
    if (selected === agent.id) selectionRing(x, y, 15, agent.id === 'teal' ? '#60e2eb' : '#ffc265');
    ctx.save(); ctx.translate(x, y - agent.height);
    if (agent.flip) ctx.scale(-1, 1);
    ctx.scale(1, agent.squash);
    const row = {walking: 0, idle: 1, working: 2}[agent.action];
    ctx.drawImage(images[agent.id], agent.frame * 64, row * 64, 64, 64, -32, -58, 64, 64);
    ctx.restore();
  }
  function draw() {
    if (!images.terrain) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(images.terrain, 0, 0, 768, 512);
    // Small inset route markers sit on the floor and never obscure a sprite.
    ctx.fillStyle = '#d3a05baa';
    for (const [x, y] of [[250,420],[328,415],[402,409],[490,402]]) ctx.fillRect(x, y, 3, 1);
    shadow(366, 367, 165, .28); shadow(195, 391, 36, .34);
    for (const agent of latestCrew) shadow(agent.x - 6, agent.y, 13 - agent.height * .16, .30 - agent.height * .008);
    if (selected === 'habitat') selectionRing(385, 379, 169, '#6ed6db');
    if (selected === 'console') selectionRing(197, 395, 38, '#6ed6db');
    const drawables = Object.entries(objects).map(([id, object]) => ({depth: object.depth, draw: () => ctx.drawImage(images[id], object.x, object.y, object.width, object.height)}));
    for (const agent of latestCrew) drawables.push({depth: agent.y, draw: () => renderAstronaut(agent)});
    drawables.sort((a, b) => a.depth - b.depth).forEach(item => item.draw());
  }
  function loop(timestamp) {
    if (previous) time = sim.advance(time, (timestamp - previous) / 1000, paused, document.hidden);
    previous = timestamp;
    latestCrew = sim.crew(time);
    draw(); updateDetail();
    requestAnimationFrame(loop);
  }
  canvas.addEventListener('click', event => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * 768 / rect.width, y = (event.clientY - rect.top) * 512 / rect.height;
    const agent = [...latestCrew].reverse().find(a => Math.abs(a.x - x) < 23 && y >= a.y - a.height - 54 && y <= a.y - a.height + 5);
    if (agent) return select(agent.id);
    for (const id of ['console', 'habitat']) {
      const object = objects[id];
      if (x >= object.x && x <= object.x + object.width && y >= object.y && y <= object.y + object.height) return select(id);
    }
  });
  document.querySelectorAll('[data-entity]').forEach(button => button.addEventListener('click', () => select(button.dataset.entity)));
  function toggle() { paused = !paused; updateMotion(); }
  document.querySelector('#pause').addEventListener('click', toggle);
  canvas.addEventListener('keydown', event => { if (event.code === 'Space') { event.preventDefault(); toggle(); } });
  motion.addEventListener('change', event => { if (event.matches) { paused = true; updateMotion(); } });
  document.addEventListener('visibilitychange', () => { previous = 0; });
  updateMotion();
  Promise.all(Object.entries({terrain:'terrain', habitat:'habitat', console:'console', teal:'astronaut-teal', amber:'astronaut-amber'}).map(([key, name]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { images[key] = image; resolve(); };
    image.onerror = () => reject(new Error('Missing scene asset: ' + name));
    image.src = './assets/' + name + '.png';
  }))).then(() => { loading.hidden = true; requestAnimationFrame(loop); }).catch(error => { loading.textContent = error.message + '. Reload or check the local demo files.'; });
})();

}
