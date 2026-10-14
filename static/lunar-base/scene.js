/* Shared, immutable projection of agent identities and returned turns. */
(function(root){
  'use strict';
  const identity=task=>task.agent_id||task.id;
  // Display labels never change the saved title or the agent's instructions.
  function title(task,limit=56){
    const value=String(task.title||task.name||'Agent').replace(/\s+/g,' ').trim()
      .split(/\.\s+/)[0].replace(/^(?:please\s+|check that (?:the\s+)?|I want you to\s+)/i,'');
    if(value.length<=limit)return value;
    const clipped=value.slice(0,limit-1).replace(/\s+\S*$/,'').trimEnd();
    return (clipped||value.slice(0,limit-1))+'…';
  }
  const pending=task=>task.state==='running'?(task.live_requests||[]).filter(r=>['pending','sending'].includes(r.status)):[];
  function current(tasks,projectId=''){
    const parents=new Set(tasks.map(t=>t.parent_task_id).filter(Boolean)),latest=new Map();
    for(const task of tasks){
      const key=identity(task);if(!latest.has(key))latest.set(key,null);
      if(task.state==='superseded'||parents.has(task.id))continue;
      const prior=latest.get(key);
      if(!prior||(Date.parse(task.created)||0)>=(Date.parse(prior.created)||0))latest.set(key,task);
    }
    return [...latest.values()].filter(t=>t&&(!projectId||t.project_id===projectId));
  }
  function status(task){
    if(task.state==='queued'&&['pending','preparing'].includes(task.workspace_preparation))return 'Preparing';
    if(pending(task).length)return 'Waiting for you';
    const owner=task.owner_attention||task.user_requests;
    if(!['superseded','accepted','cancelled'].includes(task.state)&&owner?.state==='needs_user'&&owner.items?.length)return owner.items.every(i=>i.answered)?'Response saved · awaiting agent':'Waiting for you';
    return ({ready_for_review:'Finished',accepted:'Finished · accepted',completed:'Finished',queued:'Queued',running:'Working',paused:'Paused',cancelled:'Stopped',interrupted:'Interrupted',blocked:'Needs your reply',failed:'Run failed',stopping:'Stopping',superseded:'Earlier turn'})[task.state]||String(task.state||'Unknown').replaceAll('_',' ');
  }
  function results(tasks,projectId=''){
    return tasks.filter(t=>t.result&&(!projectId||t.project_id===projectId)).sort((a,b)=>(Date.parse(b.finished_at||b.updated)||0)-(Date.parse(a.finished_at||a.updated)||0));
  }
  function turns(tasks,task){return tasks.filter(t=>identity(t)===identity(task));}
  function conversationRuns(tasks,task){
    const runs=turns(tasks,task).filter(t=>(Date.parse(t.created)||0)<=(Date.parse(task.created)||Infinity))
      .sort((a,b)=>(Date.parse(a.created)||0)-(Date.parse(b.created)||0));
    if(!runs.some(t=>t.id===task.id))runs.push(task);
    const groups=new Map(runs.map(t=>[t.id,{task:t,messages:[]}]));
    for(const message of task.conversation||[]){
      let owner=groups.has(message.task_id)?message.task_id:null;
      if(!owner){
        const at=Date.parse(message.at)||0;
        owner=(runs.filter(t=>(Date.parse(t.created)||0)<=at).at(-1)||runs[0]).id;
        // A queued follow-up may be recorded just before its new run is created.
        if(message.role==='user')for(const run of runs){
          const parent=tasks.find(t=>t.id===run.parent_task_id),finished=Date.parse(parent?.finished_at);
          if(run.continuation_note&&message.text&&run.continuation_note.includes(message.text)&&at>=finished&&at<=(Date.parse(run.created)||0))owner=run.id;
        }
      }
      groups.get(owner).messages.push(message);
    }
    return [...groups.values()];
  }
  function resultView(task){
    if(!task.result)return task;
    const result=task.result,files=task.expected_outputs?.length||result.artifacts?.length||(task.output_links||[]).some(x=>x.source_path);
    const ready=result.status==='completed'||['ready_for_review','accepted'].includes(task.prior_state||task.state);
    if(files||!ready)return task;
    const legacy='No project files could be captured for this editable assignment. Supply the deliverables or correct their paths before review.';
    const clean=issues=>(issues||[]).filter(x=>x!==legacy);
    const view={...task,result:{...result,delivery_kind:'reply',handoff_issues:clean(result.handoff_issues)},handoff_issues:clean(task.handoff_issues),snapshot_limits:clean(task.snapshot_limits)};
    if(!view.handoff_issues.length&&!view.snapshot_limits.length&&!view.result.handoff_issues.length)view.delivery_status='complete';
    return view;
  }
  const api={identity,title,pending,current,status,results,turns,conversationRuns,resultView};root.AgentModel=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

window.LunarAttentionAssets={"y": 1216, "cell": [64, 64], "columns": 4, "turnSeconds": 1.6, "waveRate": 1.5};

/* Only explicit owner-request metadata; prose never creates an approval. */
(function(root){
 'use strict';
 const terminal=['accepted','superseded','cancelled'];
 function requests(raw){
  if(terminal.includes(raw.state))return {state:'none',items:[],source:'terminal'};
  const live=raw.state==='running'?(raw.live_requests||[]).filter(r=>['pending','sending'].includes(r.status)):[];
  if(live.length)return {state:'needs_user',source:'Live CLI request',items:live.map(r=>({id:'live:'+r.id,kind:r.method==='item/tool/requestUserInput'?'question':'approval',text:(r.params?.questions||[]).map(q=>q.question).join('\n')||r.params?.reason||r.params?.message||'The agent needs a tool permission.',answered:r.status==='sending',response_status:r.status==='sending'?'Sending your response…':undefined}))};
  let a=raw.owner_attention;
  if(!a&&raw.user_requests)a={...raw.user_requests,source:'structured'};
  if(!a&&['blocked','failed','ready_for_review'].includes(raw.state)){
   const d=raw.decisions_needed||raw.result?.decisions;
   if(Array.isArray(d))a={state:'needs_user',source:'legacy_decisions',items:d.filter(x=>typeof x==='string'&&x.trim()).map((text,i)=>({id:'legacy-'+i,kind:'decision',text})),warning:'Legacy decision list: request type and explicit resolution metadata unavailable.'};
  }
  if(!a)return {state:'none',items:[],source:'missing'};
  const items=(Array.isArray(a.items)?a.items:[]).filter(i=>i&&typeof i.id==='string'&&['question','decision','approval'].includes(i.kind)&&typeof i.text==='string'&&i.text.trim()).slice(0,30);
  return {...a,state:['needs_user','resolved'].includes(a.state)?a.state:'none',items};
 }
 function identity(a){return a.state==='needs_user'?JSON.stringify(a.items.map(i=>[i.id,i.kind,i.text])):'';}
 function phase(seconds,animated){
  if(!animated)return {row:1,frame:0};
  if(seconds<1.6)return {row:0,frame:Math.min(3,Math.floor(seconds/0.4))};
  return {row:1,frame:Math.floor((seconds-1.6)*1.5)%4};
 }
 function target(projectId,taskId,item){return item.record_id&&!item.answered?'/#record/'+encodeURIComponent(projectId)+'/'+encodeURIComponent(item.record_id):'/#task/'+encodeURIComponent(taskId);}
 function projectRequests(snapshot,p){
  const linked=new Set(p.assignments.flatMap(w=>requests(w.raw).items.map(i=>i.record_id).filter(Boolean)));
  const result=[];
  const tasks=new Map(snapshot.tasks.map(t=>[t.id,t]));
  for(const r of p.raw.records||[]){
   if(linked.has(r.id))continue;
   if(['superseded','cancelled'].includes(tasks.get(r.user_request_task_id)?.state))continue;
   if((r.category==='question'&&r.status==='open')||(['decision','assumption'].includes(r.category)&&r.status==='suggested'))result.push({id:r.id,kind:r.category==='question'?'question':'decision',text:r.text,href:'/#record/'+encodeURIComponent(p.id)+'/'+encodeURIComponent(r.id),source:'Existing CoS project record'});
  }
  for(const plan of snapshot.plans||[])if(plan.project_id===p.id&&['draft','approved'].includes(plan.state))result.push({id:plan.id,kind:'approval',text:plan.state==='approved'?'Approved assignment awaits your explicit launch.':'Assignment awaits your review and approval.',href:'/#plan/'+encodeURIComponent(plan.id),source:'Existing CoS assignment '+plan.state});
  return result;
 }
 const api={requests,identity,phase,target,projectRequests};root.LunarAttention=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

window.LunarWorkshopAssets={"regions":{"work":{"x":0,"y":192,"width":384,"height":320,"columns":4,"rows":["assemble","scan","weld","sensor","inspect"],"cell":[96,64],"foot_anchor":[32,58]},"lander":{"x":0,"y":512,"width":233,"height":245},"hologram":{"x":0,"y":765,"width":225,"height":245},"teststand":{"x":0,"y":1018,"width":285,"height":160}}};

window.LunarDisplayAssets={"regions":{"crew":{"x":0,"y":1344,"width":1152,"height":576,"scale":3},"work":{"x":0,"y":1920,"width":1152,"height":960,"scale":3},"attention":{"x":0,"y":2880,"width":768,"height":384,"scale":3},"lander":{"x":0,"y":3264,"width":699,"height":735,"scale":3},"hologram":{"x":0,"y":4007,"width":675,"height":735,"scale":3},"teststand":{"x":0,"y":4750,"width":855,"height":480,"scale":3}}};

/* Shared lunar scenery. Crew always comes from the live agent projection. */
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
  const stations={
    console:{area:'console',work:[127,426],home:[127,490]},
    habitat:{area:'habitat',work:[337,422],home:[337,490]},
    habitatRight:{area:'habitat',work:[548,410],home:[551,490]},
    landerLeft:{area:'lander',work:[812,473],home:[812,541]},
    landerRight:{area:'lander',work:[1075,490],home:[1075,548]},
    modelLeft:{area:'hologram',work:[302,693],home:[276,747]},
    modelRight:{area:'hologram',work:[604,692],home:[604,754]},
    standLeft:{area:'teststand',work:[728,687],home:[728,752]},
    standRight:{area:'teststand',work:[1078,687],home:[1078,752]},
    junction:{area:'paths',work:[621,449],home:[650,550]}
  };
  const orders={
    miscellaneous:['console','habitat','modelLeft','landerLeft','standLeft','modelRight','landerRight','standRight','habitatRight','junction'],
    analysis:['modelLeft','modelRight','console','habitat','landerLeft','landerRight','standLeft','standRight','habitatRight','junction'],
    flight:['landerLeft','landerRight','console','habitat','modelLeft','modelRight','standLeft','standRight','habitatRight','junction'],
    test:['standLeft','standRight','console','habitat','modelLeft','modelRight','landerLeft','landerRight','habitatRight','junction']
  };
  const api={width,height,objects,paths,stations,orders};
  root.LunarBaseLayout=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

/* Read-only projection of supported CoS snapshots. No operational state writes. */
(function (root) {
  'use strict';
  const attention=root.LunarAttention||(typeof require==='function'?require('./attention-model.js'):null);
  const agents=root.AgentModel||(typeof require==='function'?require('../../agent-model.js'):null);
  const baseLayout=root.LunarBaseLayout||(typeof require==='function'?require('./base-layout.js'):null);
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
    // Descriptive metadata chooses workstations; it never proves current activity.
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
    needs_user: {label:'Needs you', colour:'#ffbd66'},
    active: {label:'Working', colour:'#62dce4'},
    waiting: {label:'Waiting', colour:'#bac4d4'},
    blocked: {label:'Blocked', colour:'#ffb34d'},
    needs_input: {label:'Needs your review', colour:'#e3b8f5'},
    completed: {label:'Finished', colour:'#a7dfb4'},
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
    const owner=attention.requests(record),ownerPending=owner.state==='needs_user'&&owner.items.length>0;
    let category = 'unknown', reason = 'Execution state is unavailable.';
    if (['running','stopping'].includes(state)) {
      category = state === 'stopping' ? 'waiting' : 'active';
      reason = state === 'stopping' ? 'CoS reports the worker is stopping.' : 'CoS reports a running worker.';
    } else if (['queued','paused','pending','waiting'].includes(state)) {
      category = 'waiting'; reason = state === 'queued' || state === 'pending' ? 'Waiting; this record does not prove a worker has started.' : 'Worker is paused or waiting.';
      if(state==='queued'&&['pending','preparing'].includes(record.workspace_preparation))reason='Preparing a separate checkout and selected inputs; the agent has not started.';
    } else if (state === 'ready_for_review' || ['needs_input','waiting_for_input'].includes(state)) {
      category = 'needs_input'; reason = state === 'ready_for_review' ? 'The worker returned a result for your review.' : 'CoS explicitly reports that input is needed.';
      if(state==='ready_for_review'&&record.managed_agent&&!ownerPending){category='completed';reason='Returned work is saved in Results. Continue whenever you want; acceptance is optional.';}
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
    if(ownerPending){
      category='needs_user';reason=owner.items.every(i=>i.answered)?'Your response is saved. Waiting for an explicit agent resolution and fresh running state.':'An explicit owner request is pending; ordinary work is held.';
      const at=time(lastActivity);
      if(at===null || now-at < -5000){freshness='unknown';reason+=' Activity timing unavailable; attention motion held.';}
      else if(now-at>ACTIVITY_STALE_MS){freshness='stale';reason+=' Last-known request; activity stale, attention motion held.';}
    } else if(['needs_input','waiting_for_input'].includes(state)){category='needs_user';reason='Explicit input-needed state; exact request text was not supplied. No question is invented.';}
    if(owner.state==='resolved' && category==='active' && (time(owner.observed_at)===null||time(lastActivity)<time(owner.observed_at))){category='waiting';reason='Request resolved; waiting for fresh reported running activity.';}
    if (context.snapshotStale) { category = 'stale'; freshness = 'stale'; reason = 'The displayed snapshot is older than 15 seconds. Motion is held.'; }
    if (context.connected === false) { category = 'disconnected'; freshness = 'disconnected'; reason = 'The CoS service could not be reached. This is last-known state.'; }
    if (simulated) reason = 'Simulated CoS assignment; no real worker is represented.';
    const verified = proof(record, context.kind);
    const animate = (context.illustrative || (verified && !simulated)) && category === 'active';
    const activity = String(record.activity || '');
    const native = /^(commandExecution|fileChange|mcpToolCall|webSearch|command_execution|file_change|plan_update):\s*\w+$/.exec(activity)?.[1] || null;
    const activityKind = ({commandExecution:'command_execution',fileChange:'file_change',mcpToolCall:'mcp_tool_call',webSearch:'web_search'})[native]||native;
    const label=ownerPending&&freshness!=='current'?'Last-known · needs you':ownerPending&&owner.items.every(i=>i.answered)?'Response saved · awaiting agent':context.illustrative && category==='active'?'Scripted work':record.managed_agent&&!['unknown','stale','disconnected'].includes(category)?agents.status(record):definitions[category].label;
    return {category, label:simulated&&!context.illustrative?'Simulated · '+label:label, colour:definitions[category].colour, reason,
      sourceState, sourceReported, lastActivity, lastMessage, freshness, simulated, verified, animate,
      attention:owner,attentionPending:ownerPending,attentionAnimate:ownerPending&&owner.items.some(i=>!i.answered)&&freshness==='current'&&category==='needs_user'&&!record.recovery_lock&&(context.illustrative||(verified&&!simulated)),
      illustrative:context.illustrative===true,activityKind,
      area:context.illustrative ? (record.demo_area==='workspace'?'workspace':'console') : activityKind === 'file_change' ? 'workspace' : 'console'};
  }
  function cleanRegistry(saved) {
    const registry = {version:2, projects:Object.create(null), workers:Object.create(null), crew:Object.create(null)};
    if (!saved || ![1,2].includes(saved.version)) return registry;
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
    const usedCrew=new Set();
    for(const [id,slot] of Object.entries(saved.version===2?saved.crew||{}:{})) {
      if(id.length<=250&&Number.isSafeInteger(slot)&&slot>=0&&slot<100000&&!usedCrew.has(slot)){registry.crew[id]=slot;usedCrew.add(slot);}
    }
    return registry;
  }
  function assign(slots, ids) {
    let next = Math.max(-1, ...Object.values(slots)) + 1;
    for (const id of [...ids].sort()) if (!Object.prototype.hasOwnProperty.call(slots, id)) slots[id] = next++;
  }
  function projectPosition() { return {x:0,y:0}; }
  function assignCrew(slots, workers, byProject) {
    const occupied=new Set(Object.values(slots)),canonical=baseLayout.orders.miscellaneous;
    for(const worker of [...workers].sort((a,b)=>a.key.localeCompare(b.key))) {
      if(Object.prototype.hasOwnProperty.call(slots,worker.key))continue;
      const type=workType(worker.raw),project=byProject.get(worker.projectId);
      const order=baseLayout.orders[type.matched?type.type:project.infrastructure.type]||canonical;
      let page=0,slot;
      do {slot=order.map(name=>page*WORKERS_PER_PAGE+canonical.indexOf(name)).find(value=>!occupied.has(value));page++;} while(slot===undefined);
      slots[worker.key]=slot;occupied.add(slot);
    }
  }
  function workerPosition(project, slot) {
    const visibleSlot = slot % WORKERS_PER_PAGE;
    const order=baseLayout.orders.miscellaneous;
    const station=baseLayout.stations[order[visibleSlot]];
    return {work:{x:project.x+station.work[0],y:project.y+station.work[1]},
      home:{x:project.x+station.home[0],y:project.y+station.home[1]},
      page:Math.floor(slot/WORKERS_PER_PAGE),station:visibleSlot,area:station.area};
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
    const jobs=snapshot.jobs.filter(j=>['queued','running','stopping'].includes(j.state)||j.recovery_lock);
    for (const [kind, list] of [['task',agents.current(snapshot.tasks)],['job',jobs]]) {
      for (const record of list) {
        if (!record || typeof record.id !== 'string') continue;
        const owner = byProject.get(record.project_id);
        if (!owner) { orphanRecords++; continue; }
        const status = classify(record, {...context,kind});
        const key = kind + ':' + (kind==='task'?agents.identity(record):record.id);
        const assignment = {key, id:record.id, agentId:kind==='task'?agents.identity(record):null, projectId:owner.id, kind, raw:record, status};
        owner.assignments.push(assignment);
        if (status.simulated) { simulatedRecords++; if(!context.illustrative&&!record.managed_agent)continue; }
        if (!status.verified&&!status.simulated) { unverifiedRecords++; if(!context.illustrative&&!record.managed_agent)continue; }
        workers.push(assignment); owner.workers.push(assignment);
      }
    }
    for (const p of projects) {
      p.infrastructure=projectInfrastructure(p.raw,p.assignments);
      p.infrastructure={...p.infrastructure,...infrastructureTypes[p.infrastructure.type]};
      const slots = registry.workers[p.id] ||= Object.create(null);
      assign(slots, p.workers.map(w => w.key));
      for (const w of p.workers) {
        w.roleSlot=slots[w.key];
        w.name = String(w.raw.title || (w.kind === 'job' ? 'CoS ' + (w.raw.kind || 'call') : 'Agent task'));
        w.workType=workType(w.raw);
        w.visual={...roleFor(w.raw,p.infrastructure,w.roleSlot,context),phase:w.roleSlot*.73,sharedProject:p.id};
        w.visual.label=roles[w.visual.key].label;
      }
      p.ownerRequests=attention.projectRequests(snapshot,p);
      p.attentionCount=p.ownerRequests.length+p.assignments.reduce((n,a)=>n+a.status.attention.items.filter(i=>a.status.attentionPending&&!i.answered).length,0);
      p.attentionHeld=p.assignments.some(a=>a.status.attentionPending);
    }
    assignCrew(registry.crew,workers,byProject);
    for(const worker of workers){worker.slot=registry.crew[worker.key];worker.position=workerPosition(byProject.get(worker.projectId),worker.slot);}
    workers.sort((a,b)=>a.slot-b.slot);
    for(const p of projects)p.workers.sort((a,b)=>a.slot-b.slot);
    const base={id:'shared-base',name:'Lunar Base',x:0,y:0,width:baseLayout.width,height:baseLayout.height};
    return {base,projects,workers,orphanRecords,unverifiedRecords,simulatedRecords,fixture:snapshot.lunar_fixture === true,illustrative:context.illustrative===true};
  }
  function visibleWorkers(view,projectId=''){return projectId?view.workers.filter(w=>w.projectId===projectId):view.workers;}
  function crewPages(view,projectId=''){const pages=[...new Set(visibleWorkers(view,projectId).map(w=>w.position.page))].sort((a,b)=>a-b);return pages.length?pages:[0];}
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
  const api={ACTIVITY_STALE_MS,SNAPSHOT_STALE_MS,WORKERS_PER_PAGE,baseLayout,infrastructureTypes,roles,workType,projectInfrastructure,roleFor,definitions,time,classify,proof,cleanRegistry,build,transport,projectPosition,workerPosition,visibleWorkers,crewPages,pose};
  root.LunarLiveModel=api;
  if (typeof module !== 'undefined') module.exports=api;
})(typeof window !== 'undefined' ? window : globalThis);

/* Scene projection. Management controls are supplied by the authenticated app. */
(function (root) {
  'use strict';
  function mount(options={}) {
    const isDemo=options.demo===true,isAttention=options.attentionDemo===true;
    const embedded=Boolean(options.host),host=options.host||document.querySelector('main');
    const model=root.LunarLiveModel,layout=model.baseLayout,bound=root.LunarSimulation.bound;
    document.body.dataset.lunarMode='live';
    document.title=isAttention?'Lunar Base · Needs-you demonstration':isDemo?'Lunar Base · Illustrative workshop':'Lunar Base · Agents';
    host.innerHTML=`
      <div class="live-connection"><span id="live-connection" role="status" aria-live="polite">Connecting…</span><span class="demo-label" hidden><b id="live-kind">LIVE AGENTS</b></span><button id="live-refresh" type="button">Refresh</button></div>
      <section class="viewport" aria-label="Live lunar agent map">
        <canvas id="world" width="768" height="512" tabindex="0" aria-label="Live lunar base with habitat, exterior console, lander, model platform, engine test stand and connecting paths. Astronauts represent recorded CLI agents from all projects in one shared base. Drag to pan. Select an astronaut for its conversation; project filters keep the same base. Arrow keys pan; Space pauses illustration."></canvas>
        <div class="scene-title"><p id="live-outpost">SHARED LUNAR BASE</p><h1>LUNAR BASE</h1><div class="title-rule"></div></div>
        <div id="live-empty" class="live-empty" role="status">Waiting for the first supported CoS snapshot.</div>
        <div class="scene-caption" id="live-caption" hidden></div>
      </section>
      <div class="controls"><div class="motion"><button id="pause" type="button" aria-pressed="false">Pause</button><span id="motion-state" hidden></span></div><div class="live-camera"><button id="live-zoom-out" aria-label="Zoom out">−</button><button id="live-zoom-in" aria-label="Zoom in">+</button><button id="live-overview">Home</button><button id="attention-replay" hidden>Replay local attention cycle</button></div></div>
      <nav id="live-projects" class="entities" aria-label="Project filters"></nav>
      <div class="live-crew-heading"><span id="live-crew-heading">Recorded crew</span><div><button id="live-page-prev" aria-label="Previous crew page">←</button><span id="live-crew-page"></span><button id="live-page-next" aria-label="Next crew page">→</button></div></div>
      <nav id="live-workers" class="entities" aria-label="Agents"></nav>
      <section class="details live-details" aria-labelledby="detail-title" ${embedded?'hidden':''}><div><p class="eyebrow" id="detail-kicker">LIVE CONNECTION</p><h2 id="detail-title">Your projects, in place.</h2><p id="detail-body">Select an astronaut to follow its work.</p><div id="live-detail-fields"></div></div><div class="detail-note"><span id="detail-status">Connecting</span><p id="live-source"></p></div></section>
      <p id="attention-announcement" class="attention-summary" role="status" aria-live="polite" hidden></p>
      <details class="scene-info"><summary>Status key</summary><div class="live-legend" aria-label="Agent states">${Object.entries(model.definitions).map(([key,value])=>`<span data-state="${key}"><i></i>${value.label}</span>`).join('')}</div><p id="view-metaphor">Motion illustrates reported activity.</p><b id="view-footer" hidden>LIVE AGENTS</b></details>`;
    if(isDemo) {textSetup();}
    function textSetup(){document.getElementById('view-footer').textContent=isAttention?'SCRIPTED ATTENTION DEMO':'ILLUSTRATIVE WORKSHOP DEMO';document.getElementById('view-metaphor').textContent=isAttention?'Five scripted characters · answers and resolution are in memory only':'Eight scripted characters · no real agent activity';document.getElementById('live-refresh').hidden=true;}
    if(isAttention){elementReplaySetup();}
    function elementReplaySetup(){const button=document.getElementById('attention-replay');button.hidden=false;button.addEventListener('click',()=>{demoElapsed=0;tracks.clear();refresh();});}
    const canvas=host.querySelector('#world'),ctx=canvas.getContext('2d'),images={},tracks=new Map();
    host.querySelectorAll('[data-state]').forEach(label=>{label.querySelector('i').style.backgroundColor=model.definitions[label.dataset.state].colour;});
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const storageKey=isDemo?(isAttention?'cos.lunar.attention-demo.layout.v1':'cos.lunar.workshop-demo.layout.v1'):'cos.lunar.layout.v1';
    let registry,storageAvailable=true;
    try {registry=model.cleanRegistry(JSON.parse(localStorage.getItem(storageKey)||'null'));} catch {registry=model.cleanRegistry(null);}
    let snapshot=null,view={base:{id:'shared-base',x:0,y:0},projects:[],workers:[]},connected=false,lastReceived=0,serverAnchor=0,clientAnchor=0;
    let projectFilter=new URLSearchParams(location.search).get('project')||'',selectedProject=projectFilter,selectedWorker='',fetching=false,requestController=null,connectionError='',initialFocus=false;
    let paused=motion.matches,previous=0,crewPage=0,drag=null,lastPainted=[],listsSignature='',detailSignature='',demoElapsed=0,attentionSignature='',beaconPhase=0;
    let camera={x:0,y:0,zoom:1},assetsReady=false,dirty=true,destroyed=false;
    // Layout and hit testing stay in 768 x 512 logical units. Only the backing
    // surface follows the CSS size and display density, including drawer resize.
    function resizeSurface(){
      const rect=canvas.getBoundingClientRect(),density=window.devicePixelRatio||1;
      const width=Math.max(1,Math.round(rect.width*density)),height=Math.max(1,Math.round(rect.height*density));
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;dirty=true;}
    }
    const resizeObserver=new ResizeObserver(resizeSurface);
    resizeObserver.observe(canvas);window.addEventListener('resize',resizeSurface);resizeSurface();
    const element=id=>host.querySelector('#'+id);
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
    function selected() {const worker=view.workers.find(w=>w.key===selectedWorker);return view.projects.find(p=>p.id===(worker?.projectId||selectedProject));}
    function visibleWorkers(){return model.visibleWorkers(view,projectFilter);}
    function pages(){return model.crewPages(view,projectFilter);}
    function reconcile() {
      if (!snapshot) return;
      view=model.build(snapshot,registry,currentContext());
      persist();
      if(projectFilter&&!view.projects.some(p=>p.id===projectFilter)){projectFilter='';selectedProject='';selectedWorker='';options.onFilter?.('');}
      if(selectedProject&&!view.projects.some(p=>p.id===selectedProject))selectedProject='';
      if(!initialFocus){focus();initialFocus=true;}
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
        const identity=root.LunarAttention.identity(worker.status.attention);
        if(identity!==track.attentionIdentity){track.attentionIdentity=identity;track.attentionPhase=0;}
        if (!worker.status.animate) {
          track.journey=null;track.height=0;track.squash=1;track.frame=0;
        }
      }
      const requestState=JSON.stringify(view.projects.map(p=>[p.id,p.attentionCount,p.attentionHeld]));
      if(requestState!==attentionSignature){attentionSignature=requestState;const count=view.projects.reduce((n,p)=>n+p.attentionCount,0),held=view.projects.some(p=>p.attentionHeld);text('attention-announcement',count?count+' request'+(count===1?'':'s')+' needs you':held?'Response saved · awaiting agent':'');element('attention-announcement').hidden=!count&&!held;}
      dirty=true; renderLists();renderDetail();renderConnection();
    }
    function focus() {
      const zoom=Math.min(.75,720/layout.width,440/layout.height);
      camera={x:(layout.width-768/zoom)/2,y:-45/zoom,zoom};dirty=true;
    }
    function projectPick(id) {
      if(id&&!view.projects.some(p=>p.id===id))return;
      projectFilter=id;selectedProject=id;selectedWorker='';crewPage=pages()[0];
      dirty=true;renderLists();renderDetail();options.onFilter?.(id);
    }
    function workerPick(key) {
      const worker=view.workers.find(w=>w.key===key);if(!worker)return;
      selectedProject=worker.projectId;selectedWorker=key;crewPage=worker.position.page;
      dirty=true;renderLists();renderDetail();
      if(options.onWorker)options.onWorker(worker);
    }
    function renderLists() {
      const availablePages=pages();if(!availablePages.includes(crewPage))crewPage=availablePages[0];
      const signature=JSON.stringify([projectFilter,selectedWorker,crewPage,view.projects.map(p=>[p.id,p.name,p.workers.length,p.assignments.length,p.attentionCount]),view.workers.map(w=>[w.key,w.name,w.visual.key,w.status.category,w.status.label,w.status.freshness,w.position.page])]);
      if(signature===listsSignature)return;listsSignature=signature;
      const focused=document.activeElement,focusFilter=focused?.id==='live-project-filter',focusWorker=focused?.dataset?.liveWorker;
      const projectList=element('live-projects'),workerList=element('live-workers');
      projectList.replaceChildren();workerList.replaceChildren();
      const label=document.createElement('label');label.className='live-project-filter';label.textContent='Project';
      const select=document.createElement('select');select.id='live-project-filter';select.setAttribute('aria-label','Filter agents by project');
      const all=document.createElement('option');all.value='';all.textContent='All projects';select.append(all);
      for(const p of view.projects){const option=document.createElement('option');option.value=p.id;option.textContent=p.name+(p.attentionCount?' · ? '+p.attentionCount:'');select.append(option);}
      select.value=projectFilter;select.addEventListener('change',()=>projectPick(select.value));label.append(select);projectList.append(label);
      const workers=visibleWorkers(),pageIndex=availablePages.indexOf(crewPage),shown=workers.filter(w=>w.position.page===crewPage).length;
      text('live-crew-heading',workers.length+(isDemo?' scripted character':' agent')+(workers.length===1?'':'s')+(projectFilter?' · '+view.projects.find(p=>p.id===projectFilter).name:' · all projects'));
      text('live-crew-page','Crew '+(pageIndex+1)+' / '+availablePages.length+' · '+shown+' on map');
      element('live-crew-page').parentElement.hidden=availablePages.length<=1;
      element('live-page-prev').disabled=pageIndex===0;
      element('live-page-next').disabled=pageIndex>=availablePages.length-1;
      // The list retains every filtered agent, including other display pages.
      for(const worker of workers) {
        const owner=view.projects.find(p=>p.id===worker.projectId);
        const button=document.createElement('button');button.setAttribute('aria-pressed',String(worker.key===selectedWorker));button.dataset.liveWorker=worker.key;
        button.title=worker.name+' · '+owner.name;
        const dot=document.createElement('i');dot.style.backgroundColor=worker.status.colour;
        const name=document.createElement('span');name.textContent=root.AgentModel.title({title:worker.name});
        const project=document.createElement('small');project.className='live-worker-project';project.textContent=owner.name;name.append(project);
        const status=document.createElement('small');status.textContent=worker.status.label;
        button.append(dot,name,status);button.addEventListener('click',()=>workerPick(worker.key));workerList.append(button);
      }
      if(!workers.length){const note=document.createElement('p');note.className='live-no-workers';note.textContent=projectFilter?'No agents in this project yet. Start one in its folder.':'Your base is ready. Start agents in any project folder.';workerList.append(note);}
      text('live-outpost','Shared lunar base');
      text('live-caption','ONE SHARED BASE · CONNECTING PATHS · '+(isDemo?'SCRIPTED DEMO':view.workers.length+' AGENT'+(view.workers.length===1?'':'S')));
      if(focusFilter)select.focus();
      if(focusWorker)[...workerList.children].find(b=>b.dataset.liveWorker===focusWorker)?.focus();
    }
    function renderConnection() {
      const context=currentContext();
      const message=!snapshot?(connectionError||'Connecting to this CoS service…'):
        !connected?'Disconnected · showing the last snapshot · '+connectionError:
        context.snapshotStale?'Connection stale · motion paused':
        isAttention?'Scripted attention demo · no real workers':isDemo?'Scripted workshop · no real workers':view.fixture?'QA fixtures':snapshot.config?.mode==='simulated'?'Simulated · no model calls':'Connected';
      text('live-connection',message);
      element('live-connection').title=lastReceived?'Last snapshot: '+new Date(lastReceived).toLocaleTimeString():message;
      text('live-kind',isAttention?'SCRIPTED ATTENTION DEMO':isDemo?'ILLUSTRATIVE WORKSHOP DEMO':view.fixture?'QA FIXTURES':snapshot?.config?.mode==='simulated'?'SIMULATED WORKERS':'LIVE AGENTS');
      const empty=element('live-empty');empty.hidden=Boolean(snapshot);
      empty.textContent=!snapshot?(connectionError||'Waiting for the first supported CoS snapshot.'):
        'Your base is ready. Use Start agents to choose a folder and give each agent a task.';
      empty.classList.toggle('connection-error',Boolean(connectionError));
      if (!storageAvailable) text('live-connection',message+' · visual layout storage unavailable');
    }
    function renderDetail() {
      const p=selected(),worker=view.workers.find(w=>w.key===selectedWorker);
      const signature=JSON.stringify([p?.raw,p?.infrastructure,p?.assignments.map(a=>[a.key,a.status.category]),worker?.raw,worker?.visual,worker?.status.category,worker?.status.reason,worker?.status.freshness,selectedProject,selectedWorker,connected]);
      if(signature===detailSignature)return;detailSignature=signature;
      element('live-detail-fields').replaceChildren();
      if (!p) {
        text('detail-kicker','SHARED LUNAR BASE');text('detail-title','All projects, one base');
        text('detail-body','This view reads GET /api/state on this CoS service. It does not discover independent Codex sessions or launch work.');
        text('detail-status',connected?view.workers.length+' recorded agents':'Not connected');
        text('live-source','Source: GET /api/state\nLast snapshot: '+(lastReceived?date(new Date(lastReceived).toISOString()):'Unavailable'));
        return;
      }
      if (worker) {
        const raw=worker.raw,status=worker.status;
        text('detail-kicker',isAttention?'SCRIPTED DEMO ASTRONAUT':worker.kind==='job'?'CoS COORDINATOR CALL':'CoS AGENT ASSIGNMENT');
        text('detail-title',worker.name);text('detail-body',raw.latest_update||raw.result?.summary||raw.progress||'No update text was supplied.');
        text('detail-status',status.label);
        field('Project',p.name);
        if(status.attentionPending){
          field('Attention source',status.attention.source);field('Attention metadata',status.attention.warning);
          for(const item of status.attention.items){
            field(item.kind==='approval'?'Approval decision requested':item.kind==='question'?'Exact question':'Decision requested',item.text);
            if(item.answered)field('Owner response saved',item.owner_answer||item.response_status||'Saved; waiting for explicit agent resolution.');
            if(!isDemo){const link=document.createElement('a');link.className='live-output';link.textContent=item.answered?'Open CoS handoff / continuation controls ↗':item.record_id?'Open existing CoS response controls ↗':'Open CoS task / continuation controls ↗';link.href=root.LunarAttention.target(p.id,worker.id,item);element('live-detail-fields').append(link);}
          }
          field('Response boundary',isDemo?'All questions, answers and resolution in this view are scripted.':'Replies continue with the captured permissions. Tool permissions use the exact request controls in the agent panel.');
        }else if(['needs_input','waiting_for_input'].includes(status.sourceState))field('Request unavailable','The exact request text and type were not supplied.');field('Recorded lifecycle',status.sourceState);field('Agent-reported blocker',status.sourceReported);
        field('Base infrastructure','Habitat, exterior console, lander, model platform and engine test stand');field('Primary work area',p.infrastructure.label);field('Work area choice',p.infrastructure.basis+(p.infrastructure.matched?' · '+p.infrastructure.matched:''));
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
        text('live-source',(isAttention?'Scripted in-memory attention demo':isDemo?'Scripted in-memory workshop demo':view.fixture?'Synthetic QA fixture':'Source: GET /api/state · '+worker.kind+' '+worker.id)+'\nLast snapshot received: '+date(new Date(lastReceived).toISOString())+'\nMotion illustrates state; work poses are not physical telemetry.');
      } else {
        text('detail-kicker','PROJECT OUTPOST');text('detail-title',p.name);text('detail-body',p.raw.vision||p.raw.goal||'No project description was supplied.');
        text('detail-status',isDemo?'Scripted project':!connected?'Disconnected · last known project':'Recorded project');
        field('Project ID',p.id);
        field('Explicit requests for you',p.attentionCount);
        for(const assignment of p.assignments.filter(a=>a.status.attentionPending)){for(const item of assignment.status.attention.items){field(assignment.raw.title+' · '+item.kind,item.text);if(!isDemo){const link=document.createElement('a');link.className='live-output';link.href=root.LunarAttention.target(p.id,assignment.id,item);link.textContent='Open CoS controls · '+assignment.raw.title+' ↗';element('live-detail-fields').append(link);}}}
        for(const request of p.ownerRequests){field(request.kind==='approval'?'Assignment action requested':'Project '+request.kind,request.text);if(!isDemo){const link=document.createElement('a');link.className='live-output';link.href=request.href;link.textContent='Open existing CoS controls ↗';element('live-detail-fields').append(link);}}field('Project last updated',date(p.raw.updated));field(isDemo?'Scripted characters':'Recorded workers',p.workers.length);
        field('Base infrastructure','Habitat, exterior console, lander, model platform and engine test stand');field('Primary work area',p.infrastructure.label);field('Work area choice',p.infrastructure.basis+(p.infrastructure.matched?' · '+p.infrastructure.matched:''));
        field('Assignments and CoS calls',p.assignments.length);
        field('Simulated assignments',p.assignments.filter(a=>a.status.simulated).length);
        field('Unconfirmed / not started',p.assignments.filter(a=>!a.status.verified && !a.status.simulated).length);
        for (const assignment of p.assignments.filter(a=>!isDemo && (!a.status.verified || a.status.simulated))) {
          field(assignment.raw.title||'CoS '+(assignment.raw.kind||'call'),(assignment.status.simulated?'Simulated · ':'')+assignment.status.sourceState+' · '+(assignment.raw.latest_update||assignment.raw.progress||assignment.status.reason));
        }
        if(!isDemo) {const link=document.createElement('a');link.className='live-output';link.textContent='Open original CoS project ↗';link.href='/#project/'+encodeURIComponent(p.id);element('live-detail-fields').append(link);}
        text('live-source',(isAttention?'Scripted in-memory attention demo':isDemo?'Scripted in-memory workshop demo':view.fixture?'Synthetic QA fixtures':'Source: GET /api/state · project '+p.id)+'\nLast snapshot received: '+date(new Date(lastReceived).toISOString())+'\nLocations and work roles are visual metadata only.');
      }
    }
    async function refresh() {
      if(embedded){options.onRefresh?.();return;}
      if (fetching) return;
      fetching=true;requestController=new AbortController();
      const timeout=setTimeout(()=>requestController.abort(),8000);
      try {
        if(isDemo) {snapshot=root.LunarWorkshop.snapshot(demoElapsed);if(isAttention)snapshot=root.LunarAttentionDemo.snapshot(demoElapsed);connected=true;lastReceived=clientAnchor=Date.now();serverAnchor=lastReceived;reconcile();return;}
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
      const region=root.LunarDisplayAssets.regions[name];
      ctx.drawImage(images.teal,region.x,region.y,region.width,region.height,x,y,width,height);
    }
    function crewFrame(sprite,name,col,row,cellWidth=64){
      const region=root.LunarDisplayAssets.regions[name],scale=region.scale;
      ctx.drawImage(sprite,region.x+col*cellWidth*scale,region.y+row*64*scale,cellWidth*scale,64*scale,-32,-58,cellWidth,64);
    }
    function draw() {
      if(!assetsReady)return;
      ctx.setTransform(canvas.width/768,0,0,canvas.height/512,0,0);
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(images.terrain,0,0,768,512);
      // A restrained ground tint keeps the crew and warm-lit props prominent.
      const ground=ctx.createLinearGradient(0,105,0,512);ground.addColorStop(0,'#0b122000');ground.addColorStop(1,'#0b122030');ctx.fillStyle=ground;ctx.fillRect(0,0,768,512);
      lastPainted=[];const drawables=[],beacons=[];
      const filteredProjects=projectFilter?view.projects.filter(p=>p.id===projectFilter):view.projects;
      const base={...view.base,workers:visibleWorkers(),attentionCount:filteredProjects.reduce((n,p)=>n+p.attentionCount,0),attentionHeld:filteredProjects.some(p=>p.attentionHeld)};
      for (const p of [base]) {
        const corner=screen(p);
        if(corner.x+layout.width*camera.zoom < -100||corner.x>868||corner.y+layout.height*camera.zoom < -100||corner.y>612)continue;
        if(p.attentionCount||p.attentionHeld)beacons.push({p,point:screen({x:p.x+341,y:p.y+120})});
        for(const path of layout.paths) {
          ctx.beginPath();path.forEach(([x,y],i)=>{const point=screen({x:p.x+x,y:p.y+y});i?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y);});
          ctx.strokeStyle='#111f364d';ctx.lineWidth=12*camera.zoom;ctx.setLineDash([]);ctx.stroke();
          ctx.strokeStyle='#91dadddd';ctx.lineWidth=Math.max(1.3,2*camera.zoom);ctx.setLineDash([5*camera.zoom,7*camera.zoom]);ctx.stroke();
        }
        ctx.setLineDash([]);
        for(const object of layout.objects) {
          const s=screen({x:p.x+object.x,y:p.y+object.y}),w=object.width*camera.zoom,h=object.height*camera.zoom;
          drawables.push({depth:p.y+object.y+object.height,draw:()=>{
            ctx.fillStyle='#1a1d3d44';ctx.beginPath();ctx.ellipse(s.x+w/2,s.y+h-3*camera.zoom,w*.39,9*camera.zoom,0,0,Math.PI*2);ctx.fill();
            if(object.asset==='habitat'||object.asset==='console')ctx.drawImage(images[object.asset],s.x,s.y,w,h);
            else packed(object.asset,s.x,s.y,w,h);

          }});
          lastPainted.push({kind:'base',id:p.id,x:s.x,y:s.y,width:w,height:h,depth:p.y+object.y+object.height});
        }
      }
      for(const worker of visibleWorkers()) {
        if(worker.position.page!==crewPage)continue;
        const track=tracks.get(worker.key);if(!track)continue;
        const position=screen(track),scale=camera.zoom;
        if(position.x < -80||position.x>848||position.y < -80||position.y>592)continue;
        const owner=view.projects.find(p=>p.id===worker.projectId);
        drawables.push({depth:track.y,draw:()=>{
          ctx.fillStyle='rgba(23,25,55,'+(.30-track.height*.008)+')';ctx.beginPath();
          ctx.ellipse(position.x-6*scale,position.y,(13-track.height*.16)*scale,3*scale,0,0,Math.PI*2);ctx.fill();
          if(worker.key===selectedWorker)ring(position,16*scale,worker.status.colour);
          const attending=worker.status.attentionPending;
          const moving=worker.status.animate && track.journey,working=worker.status.animate && !track.journey && (!isDemo||worker.status.area==='console');
          const row=moving?0:working?2:1,frame=moving?track.frame:working?Math.floor(track.phase*5)%6:0;
          const landmark=layout.objects.find(o=>o.id===worker.position.area);
          const center=owner.x+(landmark?landmark.x+landmark.width/2:layout.width/2);
          const role=model.roles[worker.visual.key],workFlip=working && worker.visual.key!=='console' && track.x>center;
          ctx.save();ctx.translate(position.x,position.y-track.height*scale);ctx.scale(scale*(attending?1:working?(workFlip?-1:1):(track.flip?-1:1)),scale*track.squash);
          if(!worker.status.animate && !attending)ctx.globalAlpha=.80;
          const sprite=worker.slot%2?images.amber:images.teal;
          if(attending){
            const pose=root.LunarAttention.phase(track.attentionPhase||0,!paused&&worker.status.attentionAnimate);
            crewFrame(sprite,'attention',pose.frame,pose.row);
          } else if(working && role.row!==null) {
            const workFrame=Math.floor(track.phase*role.rate)%4;
            crewFrame(sprite,'work',workFrame,role.row,96);
          } else crewFrame(sprite,'crew',frame,row);
          ctx.restore();
          if(attending){const radius=Math.max(7,10*scale),y=position.y-68*scale;ctx.fillStyle='#ffbd66';ctx.beginPath();ctx.arc(position.x,y,radius,0,Math.PI*2);ctx.fill();ctx.fillStyle='#25303c';ctx.font='bold '+Math.round(radius*1.65)+'px ui-monospace,monospace';ctx.textAlign='center';ctx.fillText(worker.status.attention.items.every(i=>i.answered)?'·':'?',position.x,y+radius*.58);ctx.textAlign='left';}
          ctx.fillStyle=worker.status.attentionPending?'#ffbd66':worker.status.colour;ctx.fillRect(position.x-3,position.y+7*scale,6,3);
          const projectLabel=owner.name.length>22?owner.name.slice(0,21)+'…':owner.name;ctx.font='9px system-ui, sans-serif';
          const labelWidth=ctx.measureText(projectLabel).width+8;ctx.fillStyle='#0b1220de';ctx.fillRect(position.x-labelWidth/2,position.y+12,labelWidth,14);
          ctx.fillStyle='#c9d7e8';ctx.textAlign='center';ctx.fillText(projectLabel,position.x,position.y+22);ctx.textAlign='left';
        }});
        lastPainted.push({kind:'worker',id:worker.key,x:position.x-25*scale,y:position.y-(track.height+54)*scale,width:50*scale,height:60*scale,depth:track.y});
      }
      drawables.sort((a,b)=>a.depth-b.depth).forEach(item=>item.draw());
      for(const {p,point} of beacons){
        const animated=!paused&&connected&&!currentContext().snapshotStale&&p.workers.some(w=>w.status.attentionAnimate),radius=10+(animated?Math.sin(beaconPhase*2)*2:0);
        ctx.fillStyle='#ffbd662d';ctx.beginPath();ctx.arc(point.x,point.y,radius+7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffbd66';ctx.beginPath();ctx.arc(point.x,point.y,Math.max(7,8*camera.zoom),0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#222b35';ctx.font='bold 12px ui-monospace,monospace';ctx.textAlign='center';ctx.fillText(p.attentionCount?'?':'·',point.x,point.y+4);ctx.textAlign='left';
        if(p.attentionCount){ctx.fillStyle='#201f34';ctx.fillRect(point.x+13,point.y-8,16,16);ctx.fillStyle='#ffce8b';ctx.fillText(String(p.attentionCount),point.x+17,point.y+4);}
        lastPainted.push({kind:'base',id:p.id,x:point.x-18,y:point.y-18,width:48,height:36,depth:1e6});
      }
    }
    function updateMotion() {
      element('pause').textContent=paused?'Resume':'Pause';
      element('pause').setAttribute('aria-label',paused?'Resume illustration':'Pause illustration');
      element('pause').title='Animation illustrates fresh reported activity';
      element('pause').setAttribute('aria-pressed',String(paused));
      text('motion-state',paused?(motion.matches?'Paused · reduced motion':'Illustration paused'):isDemo?'Scripted work poses and gentle lunar bounds':'Fresh reported activity enables illustrative poses');
    }
    function loop(timestamp) {
      if(destroyed)return;
      const elapsed=previous?Math.min(.08,(timestamp-previous)/1000):0;previous=timestamp;
      if(!paused && !document.hidden) {
        if(isDemo)demoElapsed+=elapsed;beaconPhase+=elapsed;
        for(const worker of view.workers) {
          const status=model.classify(worker.raw,{...currentContext(),kind:worker.kind}),track=tracks.get(worker.key);
          if(!track)continue;
          if(status.attentionAnimate)track.attentionPhase=(track.attentionPhase||0)+elapsed;
          if(!status.animate)continue;
          track.phase+=elapsed;
          if(track.journey) {
            track.journey.elapsed+=elapsed;
            const pose=model.pose(track.journey.elapsed,track.journey.from,track.journey.to,bound);
            Object.assign(track,pose);if(pose.done)track.journey=null;
          }
        }
      }
      if(assetsReady && (dirty || drag || (!paused && view.workers.some(w=>w.status.animate||w.status.attentionAnimate)))) {draw();dirty=false;}
      requestAnimationFrame(loop);
    }
    function zoom(factor) {
      const center=world({x:384,y:300}),next=Math.max(.18,Math.min(1.5,camera.zoom*factor));
      camera={x:center.x-384/next,y:center.y-300/next,zoom:next};dirty=true;
    }
    function overview(){focus();renderLists();}
    element('pause').addEventListener('click',()=>{paused=!paused;dirty=true;updateMotion();});
    motion.addEventListener('change',event=>{if(event.matches){paused=true;dirty=true;updateMotion();}});
    element('live-refresh').addEventListener('click',refresh);
    element('live-zoom-in').addEventListener('click',()=>zoom(1.25));
    element('live-zoom-out').addEventListener('click',()=>zoom(.8));
    element('live-overview').addEventListener('click',overview);
    element('live-page-prev').addEventListener('click',()=>{const available=pages();crewPage=available[Math.max(0,available.indexOf(crewPage)-1)];selectedWorker='';dirty=true;renderLists();renderDetail();});
    element('live-page-next').addEventListener('click',()=>{const available=pages();crewPage=available[Math.min(available.length-1,available.indexOf(crewPage)+1)];selectedWorker='';dirty=true;renderLists();renderDetail();});
    canvas.addEventListener('pointerdown',event=>{canvas.setPointerCapture(event.pointerId);drag={x:event.clientX,y:event.clientY,camera:{...camera},moved:false};});
    canvas.addEventListener('pointermove',event=>{
      if(!drag)return;const rect=canvas.getBoundingClientRect(),dx=(event.clientX-drag.x)*768/rect.width,dy=(event.clientY-drag.y)*512/rect.height;
      if(Math.abs(dx)+Math.abs(dy)>4)drag.moved=true;
      if(drag.moved){camera={...camera,x:drag.camera.x-dx/camera.zoom,y:drag.camera.y-dy/camera.zoom};}
    });
    canvas.addEventListener('pointerup',event=>{
      if(!drag)return;const moved=drag.moved;drag=null;if(moved)return;
      const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*768/rect.width,y=(event.clientY-rect.top)*512/rect.height;
      const hit=[...lastPainted].sort((a,b)=>b.depth-a.depth).find(item=>x>=item.x&&x<=item.x+item.width&&y>=item.y&&y<=item.y+item.height);
      if(hit){if(hit.kind==='worker')workerPick(hit.id);else{selectedWorker='';selectedProject=projectFilter;dirty=true;renderLists();renderDetail();}}
    });
    canvas.addEventListener('pointercancel',()=>{drag=null;});
    canvas.addEventListener('keydown',event=>{
      if(event.code==='Space'){event.preventDefault();paused=!paused;dirty=true;updateMotion();}
      const delta={ArrowLeft:[-50,0],ArrowRight:[50,0],ArrowUp:[0,-50],ArrowDown:[0,50]}[event.key];
      if(delta){event.preventDefault();camera.x+=delta[0]/camera.zoom;camera.y+=delta[1]/camera.zoom;dirty=true;}
    });
    const visibility=()=>{previous=0;if(!document.hidden)refresh();};
    document.addEventListener('visibilitychange',visibility);
    const pagehide=()=>requestController?.abort();
    window.addEventListener('pagehide',pagehide,{once:true});
    updateMotion();renderConnection();
    Promise.all(Object.entries({terrain:'terrain',habitat:'habitat',console:'console',teal:'astronaut-teal',amber:'astronaut-amber'}).map(([key,name])=>new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>{images[key]=image;resolve();};image.onerror=()=>reject(new Error('Scene asset unavailable: '+name));image.src='/lunar-base/assets/'+name+'.png';
    }))).then(()=>{if(destroyed)return;assetsReady=true;requestAnimationFrame(loop);}).catch(error=>{if(destroyed)return;connectionError=error.message;renderConnection();});
    if(!embedded)refresh();
    const polling=embedded?null:setInterval(()=>{if(!document.hidden && (!isDemo||!paused))refresh();},isAttention?500:2500);
    const aging=setInterval(()=>{if(snapshot&&!document.hidden)reconcile();},1000);
    return {
      update(data){if(destroyed)return;model.build(data,model.cleanRegistry(registry),{now:Date.now(),connected:true});snapshot=data;connected=true;connectionError='';lastReceived=clientAnchor=Date.now();serverAnchor=model.time(data.local_time)||lastReceived;reconcile();},
      disconnect(message){connected=false;connectionError=message;if(snapshot)reconcile();else renderConnection();},
      selectAgent(id){const worker=view.workers.find(w=>w.agentId===id);if(worker&&selectedWorker!==worker.key){if(projectFilter&&worker.projectId!==projectFilter){projectFilter='';options.onFilter?.('');}selectedProject=worker.projectId;selectedWorker=worker.key;crewPage=worker.position.page;dirty=true;renderLists();renderDetail();}},
      selectProject(id){if(projectFilter!==id&&(!id||view.projects.some(p=>p.id===id)))projectPick(id);},
      destroy(){destroyed=true;resizeObserver.disconnect();window.removeEventListener('resize',resizeSurface);clearInterval(polling);clearInterval(aging);requestController?.abort();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);}
    };
  }
  root.LunarLiveView={mount};
})(typeof window !== 'undefined'?window:globalThis);

if(!document.body.dataset.agentWorkspace){window.LunarLiveView.mount();}
