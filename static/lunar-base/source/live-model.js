/* Read-only projection of supported CoS snapshots. No operational state writes. */
(function (root) {
  'use strict';
  const attention=root.LunarAttention||(typeof require==='function'?require('./attention-model.js'):null);
  const agents=root.AgentModel||(typeof require==='function'?require('../../agent-model.js'):null);
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
        w.slot = slots[w.key]; w.position = workerPosition(p,w.slot);
        w.name = String(w.raw.title || (w.kind === 'job' ? 'CoS ' + (w.raw.kind || 'call') : 'Agent task'));
        w.workType=workType(w.raw);
        w.visual={...roleFor(w.raw,p.infrastructure,w.slot,context),phase:w.slot*.73,sharedProject:p.id};
        w.visual.label=roles[w.visual.key].label;
      }
      p.workers.sort((a,b) => a.slot - b.slot);
      p.ownerRequests=attention.projectRequests(snapshot,p);
      p.attentionCount=p.ownerRequests.length+p.assignments.reduce((n,a)=>n+a.status.attention.items.filter(i=>a.status.attentionPending&&!i.answered).length,0);
      p.attentionHeld=p.assignments.some(a=>a.status.attentionPending);
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
