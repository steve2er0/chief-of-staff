'use strict';
history.replaceState(null, '', '/' + location.hash);
let state, view = 'live', selectedProject = '', selectedBriefing = '', boardFilter = '', currentModal = null, lunarScene = null;
const $ = s => document.querySelector(s);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines = x => String(x || '').split('\n').map(x => x.trim()).filter(Boolean);
const stateName = x => x.replaceAll('_', ' ');
const date = x => x ? new Date(x).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
const projectName = id => state.projects.find(p => p.id === id)?.name || 'Project';
function toast(message, error=false) { const t=$('#toast'); t.textContent=message; t.className=error?'error':''; t.hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.hidden=true,7000); }
async function api(path, payload={}, id=crypto.randomUUID(), refreshState=true) {
  const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-CoS-CSRF':state.csrf},body:JSON.stringify({...payload,request_id:id})});
  const data=await r.json(); if(!r.ok){const error=new Error(data.error || 'Request failed');error.status=r.status;throw error;}
  if(refreshState)await refresh(false); return data;
}
async function refresh(renderPage=true) {
  const r=await fetch('/api/state'); if(!r.ok) throw new Error(r.status===401?'Open the private launch URL to reconnect.':'Service unavailable. Retrying…');
  const previous=state;state=await r.json();
  document.querySelectorAll('.workspace-actions button').forEach(button=>button.disabled=false);
  if(lunarScene)lunarScene.update(state);
  $('#result-count').textContent=AgentModel.results(state.tasks).length||'';
  $('#local-clock').textContent=new Date(state.local_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  $('#mode-label').textContent=state.config.mode==='simulated'?'SIMULATED WORKERS':'CODEX CLI';
  const decisions=state.projects.flatMap(p=>p.records).filter(r=>['suggested','open'].includes(r.status)).length;
  $('#decision-count').textContent=decisions ? decisions : '';
  $('#attention-count').textContent=state.attention?.length||'';
  $('#project-links').innerHTML=state.projects.map(p=>`<button data-project="${esc(p.id)}">● &nbsp; ${esc(p.name)}</button>`).join('');
  syncConversationFeedback(true);
  syncTaskFeedback();
  if(typeof syncAgentSession==='function')syncAgentSession();
  if(renderPage&&currentModal?.type==='workspace-panel'&&view!=='settings'&&!$('#modal-content').dataset.dirty&&!document.activeElement.matches('textarea,input,select')){render();}
  if(renderPage && currentModal?.type==='task' && $('#modal').open && !$('#modal-content').dataset.dirty && !document.activeElement.matches('textarea,input,select')) {
    const t=state.tasks.find(x=>x.id===currentModal.id),old=previous?.tasks.find(x=>x.id===currentModal.id);
    if(t&&t.updated!==old?.updated)taskModal(t.id);
  }
  if(renderPage && view!=='settings' && !$('#modal').open && !document.activeElement.matches('textarea,input,select') && !$('#main-content').querySelector('form[data-dirty="true"]')) render();
}
function setView(v) {
  if(['live','board','home'].includes(v)){
    view='live';if($('#modal').open)closeModal();history.replaceState(null,'','#live');render();return;
  }
  view=v;history.replaceState(null,'','#'+(v==='project'?'project/'+selectedProject:v));render();
}
function render() {
  if(!lunarScene){
    lunarScene=LunarLiveView.mount({host:$('#lunar-host'),onRefresh:()=>refresh(false).catch(error=>{lunarScene.disconnect(error.message);toast(error.message,true);}),
      onWorker:worker=>{if(worker.kind==='task')taskModal(worker.id);else openCoordinatorPanel(worker.id);},
      onProject:id=>{selectedProject=id;projectTab='assignment';setView('project');}});
    lunarScene.update(state);
  }
  document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  if(view==='live')return;
  const titles={review:'Needs you',results:'Results',briefings:'Decisions & history',projects:'Projects',project:projectName(selectedProject),settings:'Settings'};
  const renders={review:renderReview,results:renderResults,briefings:renderBriefings,projects:renderProjects,project:renderProject,settings:renderSettings};
  if(!renders[view])return;
  const expanded=new Set([...document.querySelectorAll('#modal-content details[data-preserve-open][open]')].map(el=>el.dataset.preserveOpen));
  const transcript=$('.conversation'),scroll=transcript?.scrollTop,atEnd=!transcript||transcript.scrollHeight-transcript.scrollTop-transcript.clientHeight<30;
  const signature=JSON.stringify([view,selectedProject,selectedBriefing,boardFilter,attentionFilter,state.projects,state.tasks,state.jobs,state.attention,state.briefings]);
  if(currentModal?.type==='workspace-panel'&&currentModal.id===view&&currentModal.signature===signature)return;
  modal(titles[view],'',renders[view](),'workspace-panel',view);currentModal.signature=signature;
  document.querySelectorAll('#modal-content details[data-preserve-open]').forEach(el=>{el.open=expanded.has(el.dataset.preserveOpen);});
  const next=$('.conversation');if(next)next.scrollTop=atEnd?next.scrollHeight:scroll||0;
  syncConversationFeedback();
}
function renderBoard() {
  const tasks=state.tasks.filter(t=>t.state!=='superseded' && (!boardFilter || t.project_id===boardFilter));
  const review=tasks.filter(t=>t.state==='ready_for_review').length, active=tasks.filter(t=>['queued','running','stopping'].includes(t.state)).length;
  const attention=tasks.filter(t=>['blocked','failed','interrupted'].includes(t.state)).length;
  let html=`<div class="stats"><div class="stat"><span>In motion</span><strong>${active}</strong></div><div class="stat"><span>Ready for review</span><strong>${review}</strong></div><div class="stat"><span>Needs attention</span><strong>${attention}</strong></div><div class="stat"><span>Accepted</span><strong>${tasks.filter(t=>t.state==='accepted').length}</strong></div></div>`;
  if(state.config.mode==='simulated') html+=`<div class="help">Simulated mode · no real agent calls. The project flow prepares one editable task; Codex mode prepares a model-backed brief and runs the worker after approval and launch.</div>`;
  const drafts=state.plans.filter(p=>['draft','approved'].includes(p.state) && (!boardFilter || p.project_id===boardFilter));
  html+=drafts.map(p=>`<div class="draft-banner"><div><strong>${esc(projectName(p.project_id))} · ${p.specs.length} proposed assignments</strong><small>${esc(p.state==='approved'?'Approved — waiting for explicit launch':p.basis)}</small></div><button data-plan="${p.id}" class="mini-button">${p.state==='approved'?'Review & launch':'Review plan'} →</button></div>`).join('');
  html+=attentionPanelHTML(3,boardFilter);
  html+=renderJobs();
  html+=`<div class="board-top"><div><h3>Focus for today</h3><span class="section-note">Your agent’s latest update, elapsed time and next review.</span></div><select id="board-filter" aria-label="Filter projects"><option value="">All projects</option>${state.projects.map(p=>`<option value="${p.id}" ${boardFilter===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>`;
  if(!tasks.length&&!drafts.length) return html+`<div class="panel empty-state"><div class="glyph">◇</div><h2>Start with a little context.</h2><p>Create a project, discuss your vision, then prepare one agent task. The first run can be entirely simulated.</p><div class="actions"><button id="empty-project" class="primary">Create a project</button><button id="seed-demo">Try a synthetic example</button></div></div>`;
  const cols=[['Queued & paused',['queued','paused','cancelled'],''],['In progress',['running','stopping'],'blue'],['Review & decisions',['ready_for_review','blocked','failed','interrupted'],'rose'],['Accepted',['accepted'],'green']];
  html+='<div class="board">'+cols.map(([title,states,color])=>{const ts=tasks.filter(t=>states.includes(t.state));return `<section class="column"><div class="column-heading"><i></i>${title}<b>${ts.length}</b></div>${ts.map(t=>card(t,color)).join('') || '<div class="empty-column">Room for the next step</div>'}</section>`}).join('')+'</div>';
  return html;
}
function openDecisionsFor(t) { return state.projects.find(p=>p.id===t.project_id)?.records.filter(r=>r.status==='open'&&r.provenance.includes(t.id)).length||0; }
function card(t,color) {
  const n=openDecisionsFor(t);
  return `<article class="task-card ${color}" data-task="${t.id}" tabindex="0" role="button" aria-label="Open task ${esc(t.title)}"><div class="card-project">${esc(projectName(t.project_id))}</div><h3>${esc(t.title)}</h3><div class="card-purpose">${esc(shortTaskText(t.goal||(t.assignment_scope==='project'?t.context.vision:t.purpose),180))}</div>${taskFeedbackHTML(t,true)}<div class="card-footer"><span class="badge">${esc(stateName(t.state))}</span>${n?`<span class="decision-tag">${n} decision${n>1?'s':''}</span>`:`<span>${t.output_links.length?'↗ '+t.output_links.length+' output'+(t.output_links.length>1?'s':''):date(t.updated)}</span>`}</div><div class="section-note">Updated ${esc(date(t.updated))}</div>${t.output_links.length?`<div class="card-outputs">${t.output_links.slice(0,2).map(o=>`<a href="/api/output/${t.id}/${encodeURIComponent(o.name)}">↗ ${esc(o.label)}</a>`).join('')}</div>`:''}</article>`;
}
function renderJobs() {return state.jobs.filter(j=>j.state!=='completed'&&j.state!=='cancelled').map(j=>`<div class="job"><div class="row"><strong>${esc(projectName(j.project_id))} · ${esc(j.kind)} · ${esc(j.state)}</strong><button class="mini-button" data-stop-job="${j.id}">${j.recovery_lock?'Confirm stopped & unlock':'Stop coordinator'}</button></div><div>${esc(j.progress)}</div></div>`).join('');}
function renderProjects() {return `<div class="section-title"><h2>The longer view</h2><button id="projects-new">+ New project</button></div><div class="grid-projects">${state.projects.map(p=>`<article class="panel project-tile" data-project="${p.id}" tabindex="0" role="button"><div class="eyebrow">PROJECT · ${p.accepted_results.length} ACCEPTED RESULTS</div><h3>${esc(p.name)}</h3><p>${esc(p.goal)}</p><span class="pill">${p.records.filter(r=>r.status==='approved').length} approved records</span><span class="pill">${p.records.filter(r=>['open','suggested'].includes(r.status)).length} unresolved</span></article>`).join('') || '<div class="panel empty-state"><h2>No projects yet.</h2><p>Add a goal and a working folder to begin.</p></div>'}</div>`;}
function recordHTML(r) {return `<div class="record"><span class="record-status">${esc(r.category)} · ${esc(r.status)}</span><p>${esc(r.text)}</p>${r.answer?`<p><strong>Answer:</strong> ${esc(r.answer)}</p>`:''}<div class="provenance">${esc(r.provenance)} · ${esc(date(r.created))}${r.resolved_at?' · Resolved '+esc(date(r.resolved_at)):''}</div></div>`;}
function renderProject() {
  const p=state.projects.find(p=>p.id===selectedProject); if(!p)return '<div class="panel">Project not found.</div>';
  return `<div class="section-title"><span class="pill">Context version ${p.version}</span><div class="actions"><button data-edit-project="${p.id}">Edit context</button><button data-daily="${p.id}" class="primary">Add daily bullets</button></div></div><div class="split"><div><section class="panel"><div class="context-label">GOAL</div><div class="context-value">${esc(p.goal)}</div><div class="context-label">WORKING DIRECTORY${p.demo_directory?' · DEMO ONLY':''}</div><div class="context-value">${esc(p.cwd)}</div><div class="context-label">FILE REFERENCES</div><div class="context-value">${p.file_refs.map(x=>`<span class="pill">${esc(x)}</span>`).join('')||'<span class="muted">No file references yet</span>'}</div><div class="context-label">OPEN QUESTIONS</div><div class="context-value">${esc(p.open_questions)||'None recorded'}</div><div class="context-label">NEXT STEPS</div><div class="context-value">${esc(p.next_steps)||'None recorded'}</div></section><section class="panel"><div class="section-title"><h2>Accepted results</h2></div>${p.accepted_results.map(r=>`<div class="record"><a href="#" data-task="${r.task_id}"><strong>${esc(r.title)}</strong></a><p>${esc(r.summary)}</p><div class="provenance">${esc(r.provenance)} · ${esc(date(r.accepted_at))}</div></div>`).join('')||'<p class="muted">Results appear here only after explicit acceptance.</p>'}</section></div><div><section class="panel"><div class="section-title"><h2>Approved knowledge</h2></div>${p.records.filter(r=>r.status==='approved'||r.status==='answered').map(recordHTML).join('')||'<p class="muted">Approved decisions and assumptions stay available to future assignments.</p>'}</section><section class="panel"><div class="section-title"><h2>Suggestions & questions</h2><button class="mini-button" data-add-record="${p.id}">+ Add</button></div>${p.records.filter(r=>['suggested','open'].includes(r.status)).map(recordHTML).join('')||'<p class="muted">No pending suggestions or questions.</p>'}<div class="actions"><button data-view="briefings">Resolve as a batch →</button></div></section></div></div><section class="panel"><h3>Project assignments</h3>${state.tasks.filter(t=>t.project_id===p.id).map(t=>`<div class="brief-row"><div><a href="#" data-task="${t.id}">${esc(t.title)}</a><p>${esc(t.progress)}</p></div><span class="badge">${esc(stateName(t.state))}</span></div>`).join('')||'<p class="muted">No assignments yet.</p>'}</section>`;
}
function renderBriefings() {
  const bs=[...state.briefings].reverse();const b=bs.find(x=>x.id===selectedBriefing)||bs[0];
  const pending=state.projects.flatMap(p=>p.records.filter(r=>['suggested','open'].includes(r.status)).map(r=>({...r,project:p.name,project_id:p.id})));
  return `<div class="help">Local schedule: ${esc(state.config.briefing_times.join(' · '))} (${state.config.schedule_enabled?'enabled':'disabled'}). Generated only while this service is running. Missed times are skipped; no email or desktop delivery.</div><div class="section-title"><h2>${b?esc(b.title):'Your first briefing'}</h2><button id="generate-briefing" class="primary">Generate briefing now</button></div>${bs.length?`<div class="archive-list">${bs.slice(0,12).map(x=>`<button data-briefing="${x.id}">${esc(date(x.created))}${x.schedule_key?' · scheduled':''}</button>`).join('')}</div>`:''}${b?`<section class="panel"><div class="row"><h3>Work at a glance</h3><span class="muted">Snapshot · ${esc(date(b.created))}</span></div>${b.tasks.map(t=>`<div class="brief-row"><div><a href="#" data-task="${t.id}"><strong>${esc(t.title)}</strong></a><p>${esc(t.project)} · ${esc(t.progress)}</p></div><div><span class="badge">${esc(stateName(t.state))}</span><div class="muted">${esc(date(t.updated))}</div></div></div>`).join('')||'<p class="muted">No tasks in this snapshot.</p>'}</section>`:'<div class="panel empty-state"><h2>Check in when you choose.</h2><p>Generate a briefing to collect progress, outputs and decisions in one place.</p></div>'}<section class="panel"><div class="section-title"><h2>Decisions needing you</h2><span class="pill">${pending.length} pending · live</span></div><p class="muted">These are suggestions until you approve them. Questions need an answer. Blank selections stay pending.</p><form id="decision-form">${pending.map(r=>`<div class="decision-row" data-record-row="${r.id}" data-project-id="${r.project_id}"><div class="eyebrow">${esc(r.project)} · ${esc(r.category)}</div><p>${esc(r.text)}</p><div class="provenance">${esc(r.provenance)}</div><div class="form-grid"><label>Resolution<select data-resolution="${r.id}"><option value="">Keep pending</option>${r.category==='question'?'<option value="answer">Answer</option>':'<option value="approve">Approve</option><option value="reject">Reject</option>'}</select></label>${r.category==='question'?`<label>Your answer<input data-answer="${r.id}" placeholder="Answer only if you choose to resolve it"></label>`:'<div></div>'}</div></div>`).join('')}${pending.length?'<button type="submit" class="primary">Resolve selected decisions</button>':'<p class="muted">Nothing needs a decision right now.</p>'}</form></section>`;
}
function renderSettings() {
  const c=state.config,cap=state.capabilities;
  return `<section class="panel"><form id="settings-form" class="settings-form"><label>Mode<select name="mode"><option value="simulated" ${c.mode==='simulated'?'selected':''}>Simulated · no model calls</option><option value="codex" ${c.mode==='codex'?'selected':''}>Codex CLI</option></select></label><label>Model<input name="model" value="${esc(c.model)}"></label><div class="form-grid"><div><label class="checkbox-row"><input name="unlimited_agents" type="checkbox" ${c.concurrency===0?'checked':''}>Unlimited agents</label><label>Concurrent agents<input name="concurrency" type="number" min="1" step="1" value="${c.concurrency||''}" ${c.concurrency===0?'disabled':'required'} placeholder="Your limit"></label></div><label>Default access<select name="default_execution_policy"><option value="yolo" ${c.default_execution_policy==='yolo'?'selected':''}>Full access · YOLO</option><option value="sandboxed" ${c.default_execution_policy!=='yolo'?'selected':''}>Sandboxed</option></select></label></div><details><summary>CLI configuration</summary><label>CLI executable<input name="executable" value="${esc(c.executable)}"><small>Native executable path or name. For Windows npm installs, use node.exe with the JS entrypoint below.</small></label><label>JS entrypoint · optional<input name="entrypoint" value="${esc(c.entrypoint)}"><small>Absolute path to installed Codex bin/codex.js. No shell wrappers or command strings.</small></label><p class="section-note">Use a model identifier available to your CLI. Existing login and provider routing are retained; this app does not verify model availability.</p></details><details><summary>Time limits & briefings</summary><label>Agent time limit<select name="default_time_limit"><option value="none" ${c.default_time_limit==='none'?'selected':''}>Until finished or stopped</option><option value="default" ${c.default_time_limit!=='none'?'selected':''}>Configured limit</option></select></label><label>Configured limit · seconds<input name="timeout_seconds" type="number" min="5" max="14400" value="${c.timeout_seconds}"></label><label>Briefing times<input name="briefing_times" value="${esc(c.briefing_times.join(', '))}"><small>Local 24-hour times, comma separated. Runs while this service is awake; missed times are skipped.</small></label><label><input type="checkbox" name="schedule_enabled" ${c.schedule_enabled?'checked':''}> Enable briefings</label></details><button class="primary" type="submit">Save settings</button></form></section><details class="panel"><summary>CLI readiness${cap?' · '+(cap.ok?'flags detected':'needs attention'):''}</summary><p class="muted">Checks version and help only; authentication, models and sandbox enforcement remain unverified.</p><button id="preflight">Check CLI capabilities</button><div id="preflight-result">${cap?`<div class="help ${cap.ok?'':'error'}"><strong>${cap.ok?'Required flags detected':'Required capabilities missing'}</strong><p>${esc(cap.version)}</p><p>Structured completion: ${cap.schema?'available':'JSON contract fallback'} · Resume: ${cap.resume?'available':'unavailable'}</p><p>${esc(cap.note)}</p><p>${state.preflight_required?'Recheck after this service restart.':'Checked during this service session.'}</p></div>`:'<p class="muted">No check recorded.</p>'}</div></details><details class="panel"><summary>Permissions & local storage</summary><p class="section-note">Sandboxed workers use read-only or workspace-write. Full access (YOLO) removes CLI sandboxing and command approval prompts, including access beyond the project. Sandboxed command networking requires per-assignment approval. Browser permissions remain separate.</p><p class="section-note">Your installed CLI and local configuration control provider routing, tools and enforcement. Directory locks cover this app’s assignments, not independent terminals or editors.</p><p class="section-note">Keep the private launch URL local. SQLite, logs and output snapshots are stored unencrypted on this computer.</p></details><details class="panel"><summary>Recent activity</summary>${state.audit.slice(0,8).map(a=>`<div class="record"><div>${esc(a.action)}</div><div class="provenance">${esc(date(a.time))} · ${esc(a.details)}</div></div>`).join('')}</details>`;
}

function modal(title,eyebrow,html,type,id) {const changed=currentModal?.type!==type||currentModal?.id!==id;$('#modal-title').textContent=title;$('#modal-eyebrow').textContent=eyebrow;$('#modal-content').innerHTML=html;delete $('#modal-content').dataset.dirty;currentModal={type,id};view=type==='workspace-panel'?id:'live';$('#modal').dataset.panel=type;document.body.dataset.panelOpen=type;if(!$('#modal').open)$('#modal').show();if(changed){$('#modal').scrollTop=0;window.scrollTo({top:0,behavior:'instant'});}}
function closeModal() {if(referenceSaveInProgress()){toast('Wait for the project to finish saving.');return;}$('#modal').close();delete document.body.dataset.panelOpen;currentModal=null;view='live';history.replaceState(null,'','#live');render();}
function projectForm(id) {
  const p=state.projects.find(x=>x.id===id)||{};
  modal(id?'Edit project context':'Start a project','THE LONGER VIEW',`<form id="project-form" data-id="${esc(id||'')}"><div class="form-grid"><label>Project name<input name="name" value="${esc(p.name||'')}" required placeholder="Engineering handbook"></label><label>Working directory<input name="cwd" value="${esc(p.demo_directory?'':p.cwd||'')}" placeholder="Absolute path, or leave blank for demo"><small>Local project folder. Blank creates a demo folder. File references stay inside it.</small></label></div><label>Goal<textarea name="goal" required placeholder="A clear outcome for the next few weeks">${esc(p.goal||'')}</textarea></label><div class="form-grid"><label>Open questions<textarea name="open_questions">${esc(p.open_questions||'')}</textarea></label><label>Next steps<textarea name="next_steps">${esc(p.next_steps||'')}</textarea></label></div><label>File references (one relative path per line)<textarea name="file_refs" placeholder="docs/overview.txt">${esc((p.file_refs||[]).join('\n'))}</textarea><small>References are validated read-only. Originals are never changed by import.</small></label><button type="submit" class="primary">Save project context</button></form>`,'project',id);
}
function daily(pid) {
  if(!state.projects.length){projectForm();return;}
  modal('From morning log to a plan','A SMALL START',`<form id="daily-form"><label>Project<select name="project_id">${state.projects.map(p=>`<option value="${p.id}" ${pid===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><label>Daily bullets<textarea name="bullets" id="daily-bullets" required rows="7" placeholder="- Review the draft engineering checklist&#10;- Compare two test approaches&#10;- Identify the next milestone"></textarea></label><div class="form-grid"><label>Source / provenance<input name="source" id="daily-source" value="Pasted morning log"></label><label>Read-only Word import<input id="docx-file" type="file" accept=".docx"><small>Text only. Original Word file remains unchanged.</small></label></div><label>Planning method<select name="method"><option value="local">Local deterministic fallback · no AI</option><option value="codex">Model-backed Codex coordinator · real call</option></select></label><div class="help">This creates proposed assignments. Review the purpose, acceptance criteria, folder and permissions before approval and launch.</div><button type="submit" class="primary">Propose assignments</button></form>`,'daily',pid);
}
function planModal() {} // Defined by task-feedback.js before workspace initialization.
function readSpecs() {const p=state.plans.find(x=>x.id===currentModal.id);return [...document.querySelectorAll('[data-spec]')].map(el=>({spec_id:p.specs[Number(el.dataset.spec)]?.spec_id,title:el.querySelector('[name=title]').value,goal:el.querySelector('[name=goal]').value,purpose:el.querySelector('[name=purpose]').value,criteria:lines(el.querySelector('[name=criteria]').value),access:el.querySelector('[name=access]').value,research_access:el.querySelector('[name=research_access]')?.checked||false,time_limit:el.querySelector('[name=time_limit]')?.value||'default',execution_policy:el.querySelector('[name=execution_policy]')?.value||'sandboxed',continuation_note:el.querySelector('[name=continuation_note]')?.value||'',scenario:el.querySelector('[name=scenario]').value,expected_outputs:lines(el.querySelector('[name=expected_outputs]').value)}));}
function taskModal(id) {
  const t=state.tasks.find(x=>x.id===id);if(!t)return;
  const revisable=['ready_for_review','failed','blocked','paused','cancelled','interrupted'].includes(t.state);
  modal(t.title,`${projectName(t.project_id)} · ${stateName(t.state)}`,`<div class="task-detail">${typeof ownerRequestsHTML==='function'?ownerRequestsHTML(t):''}${taskFeedbackHTML(t)}${resultHandoffHTML(t)}<details class="assignment-background"><summary>Original assignment & criteria</summary><div class="context-label">GOAL</div><p class="context-value">${esc(t.goal||(t.assignment_scope==='project'?t.context.vision:shortTaskText(t.purpose,600)))}</p><div class="context-label">INSTRUCTIONS</div><p class="context-value">${esc(t.purpose)}</p><div class="context-label">ACCEPTANCE CRITERIA</div><ul>${t.criteria.map(c=>`<li>${esc(c)}</li>`).join('')}</ul><div class="form-grid"><div><div class="context-label">FOLDER & PERMISSIONS</div><p class="context-value">${esc(t.context.cwd)}<br>${esc(t.access)} · ${esc(t.config.mode)} workers<br>Execution: ${t.execution_policy==='yolo'?'YOLO · no CLI sandbox or command approvals':'Sandboxed'}<br>Command network: ${t.execution_policy==='yolo'?'available in YOLO mode':t.research_access?'approved research':'not approved'}<br>Time limit: ${t.config.timeout_seconds===0?'none':esc(t.config.timeout_seconds)+' seconds'}</p></div><div><div class="context-label">SESSION & UPDATE</div><p class="context-value">${esc(t.session_id||'Session not started')}<br>${esc(date(t.updated))}</p></div></div></details>${outputSnapshotsHTML(t)}${t.review?`<h3>Review recommendation</h3><div class="help">${esc(t.review.basis)}<p>${esc(t.review.summary)}</p>${(t.review.criteria||[]).map(c=>`<p>${esc(c.criterion)} · ${esc(c.verdict)}</p>`).join('')}</div>`:''}${openDecisionsFor(t)?`<div class="help warning">${openDecisionsFor(t)} question(s) in the decision batch. <button class="mini-button" id="task-decisions">Open attention queue</button></div>`:''}<div class="actions">${['queued','running','stopping'].includes(t.state)?'<button data-task-action="pause">Pause worker</button><button class="danger" data-task-action="cancel">Cancel worker</button>':''}${t.state==='ready_for_review'?'<button class="primary" data-task-action="accept">Accept result</button>':''}</div>${t.state==='ready_for_review'?'<p class="section-note">Acceptance records your judgment that the outputs meet the criteria. Model recommendations do not accept results automatically.</p>':''}${resumeWorkHTML(t)}<details class="activity-log"><summary>Detailed activity log</summary>${t.history.slice(-12).map(h=>`<div class="record"><div class="muted">${esc(date(h.at))}</div><div>${esc(h.text)}</div></div>`).join('')}</details></div>`,'task',id);
}
function addRecord(pid) {modal('Add durable context','SUGGESTIONS STAY SEPARATE',`<form id="record-form" data-id="${pid}"><label>Category<select name="category"><option value="suggestion">Suggestion</option><option value="assumption">Assumption</option><option value="decision">Decision proposal</option><option value="question">Open question</option></select></label><label>Text<textarea name="text" required></textarea></label><label>Provenance<input name="provenance" value="User entry / ${esc(date(new Date().toISOString()))}" required></label><div class="help">Decisions and assumptions enter as suggestions. Approve them in the decision batch before they become approved knowledge.</div><button class="primary" type="submit">Add to project record</button></form>`,'record',pid);}
async function seedDemo() {
  const p=await api('project',{name:'Engineering handbook',goal:'Prepare a practical, evidence-backed onboarding checklist for a generic engineering team.',open_questions:'What evidence should support each checklist item?',next_steps:'Review the initial checklist and choose a validation approach.'});
  await api('record',{project_id:p.id,text:'Use a small synthetic sample for the first review.',category:'assumption',provenance:'Synthetic demo starter'});
  const plan=await api('plan',{project_id:p.id,bullets:'- Review the draft engineering checklist\n- Compare two test approaches\n- Identify evidence needed for the next milestone',source:'Synthetic demo morning log'});
  planModal(plan.id);toast('Synthetic project created. Review the plan before approval.');
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button,a,[data-task],[data-project]');if(!b)return;
  if(b.tagName==='A' && (b.dataset.task||b.dataset.project||b.classList.contains('brand')))e.preventDefault();
  if(b.classList.contains('brand')){setView('home');return;}
  if(b.dataset.view){if($('#modal').open)closeModal();setView(b.dataset.view);return;}
  if(b.dataset.project){selectedProject=b.dataset.project;projectTab='conversation';setView('project');return;}
  if(b.dataset.task){taskModal(b.dataset.task);return;}
  if(b.dataset.plan){planModal(b.dataset.plan);return;}
  if(b.dataset.editProject){projectForm(b.dataset.editProject);return;}
  if(b.dataset.daily){daily(b.dataset.daily);return;}
  if(b.dataset.addRecord){addRecord(b.dataset.addRecord);return;}
  if(b.dataset.briefing){selectedBriefing=b.dataset.briefing;render();return;}
  if(b.hasAttribute('data-remove-spec')){b.closest('[data-spec]').remove();const launch=$('#launch-plan');if(launch)launch.disabled=true;return;}
  if(['new-project','empty-project','projects-new','header-new-project'].includes(b.id)){projectForm();return;}
  if(b.id==='daily-button'){daily(view==='project'?selectedProject:'');return;}
  if(b.id==='close-modal'){closeModal();return;}
  if(b.id==='task-decisions'){closeModal();setView('review');return;}
  if(b.type==='submit' && b.form)return;
  if(b.disabled)return;
  b.disabled=true;
  try{
    if(b.id==='seed-demo')await seedDemo();
    else if(b.id==='generate-briefing'){const r=await api('briefing');selectedBriefing=r.id;render();toast('Briefing generated locally.');}
    else if(b.id==='preflight'){toast('Checking CLI help and version…');await api('preflight');render();toast('Preflight finished. Model and authentication remain unverified.');}
    else if(['approve-plan','delegate-plan'].includes(b.id)){
      const p=state.plans.find(x=>x.id===currentModal.id), specs=readSpecs();
      const existing=p.specs.map(({spec_id,title,goal,purpose,criteria,access,research_access=false,time_limit='default',execution_policy='sandboxed',continuation_note='',scenario,expected_outputs})=>({spec_id,title,goal,purpose,criteria,access,research_access,time_limit,execution_policy,continuation_note,scenario,expected_outputs}));
      let rev=p.revision;
      if(JSON.stringify(specs)!==JSON.stringify(existing)){const edited=await api('edit-plan',{id:p.id,revision:rev,specs});rev=edited.revision;}
      const result=await api(b.id==='delegate-plan'?'delegate-now':'approve',{id:p.id,revision:rev});
      if(b.id==='delegate-plan'&&!result.refreshed){closeModal();setView('board');toast('Agents queued. CoS will bring back their results.');}
      else {planModal(p.id);toast(result.refreshed?result.message:'Assignment saved for later launch.');}
    }else if(b.id==='launch-plan'){const plan=await api('launch',{id:currentModal.id});closeModal();if(plan.scope==='project'||plan.specs.some(s=>s.work_item_id)){selectedProject=plan.project_id;projectTab='results';setView('project');}else setView('board');toast('Approved assignments queued.');}
    else if(b.dataset.taskAction){const id=currentModal.id,act=b.dataset.taskAction;const r=await api('action',{id,action:act,note:(act==='accept'?$('#review-note'):$('#revision-note'))?.value||'',complete_item:$('#complete-item')?.checked||false,confirmed_stopped:$('#confirm-stopped')?.checked||false,fresh:$('#fresh-session')?.checked||false});if(['revise','resume'].includes(act)){planModal(r.id);toast('Continuation prepared. Review, approve, then launch.');}else{taskModal(id);toast(act==='accept'?'Accepted result saved to project context.':'Stop requested. Waiting for process cleanup.');}}
    else if(b.dataset.taskReview){const id=currentModal.id;await api('review',{id,method:b.dataset.taskReview});taskModal(id);toast(b.dataset.taskReview==='codex'?'Model-backed review requested.':'Local checks complete. Assess the criteria before acceptance.');}
    else if(b.dataset.stopJob){const j=state.jobs.find(x=>x.id===b.dataset.stopJob);if(j.recovery_lock&&!confirm('Confirm the old coordinator and child processes have stopped before releasing this lock.'))return;await api('stop-job',{id:j.id,confirmed_stopped:!!j.recovery_lock});if(currentModal?.type==='attention-job')closeModal();render();toast('CoS handoff updated.');}
  }catch(err){toast(err.message,true);}finally{if(b.isConnected)b.disabled=false;}
});
document.addEventListener('submit',async e=>{
  if(!['project-form','daily-form','plan-form','record-form','settings-form','decision-form'].includes(e.target.id))return;
  e.preventDefault();const f=e.target,b=f.querySelector('[type=submit]');if(b?.disabled)return;if(b)b.disabled=true;
  try{
    const raw=Object.fromEntries(new FormData(f));
    if(f.id==='project-form'){
      const reference_ids=await prepareReferenceSave(f,lines(raw.file_refs).length);
      const p=await api('project',{...raw,id:f.dataset.id||undefined,file_refs:lines(raw.file_refs),reference_ids});
      commitReferenceSave(f,reference_ids);closeModal();selectedProject=p.id;projectTab='conversation';setView('project');toast(!f.dataset.id&&state.config.mode==='codex'?'Project saved. Your CoS is getting oriented.':'Project vision saved.');
    }
    else if(f.id==='daily-form'){const r=await api('plan',raw);if(r.specs)planModal(r.id);else{closeModal();setView('board');toast('Model-backed planning requested. The proposed plan will appear when it finishes.');}}
    else if(f.id==='plan-form'){await api('edit-plan',{id:f.dataset.id,revision:Number(f.dataset.revision),specs:readSpecs()});planModal(f.dataset.id);toast('Edits saved. Approval is required again.');}
    else if(f.id==='record-form'){await api('record',{...raw,project_id:f.dataset.id});closeModal();toast('Proposed context saved with provenance.');}
    else if(f.id==='settings-form'){await api('settings',{...raw,default_isolate:raw.default_isolate==='true',concurrency:f.elements.unlimited_agents.checked?0:Number(raw.concurrency),timeout_seconds:Number(raw.timeout_seconds),schedule_enabled:f.elements.schedule_enabled.checked,briefing_times:raw.briefing_times.split(',').map(x=>x.trim()).filter(Boolean)});render();toast('Settings saved. Existing plan approvals may need to be renewed.');}
    else if(f.id==='decision-form'){const items=[...f.querySelectorAll('[data-record-row]')].map(el=>({project_id:el.dataset.projectId,record_id:el.dataset.recordRow,action:el.querySelector('select').value,answer:el.querySelector('input')?.value})).filter(x=>x.action);if(!items.length)throw new Error('Choose at least one resolution.');await api('resolve',{items});render();toast('Selected decisions resolved and recorded.');}
  }catch(err){toast(err.message,true);}finally{if(f.id==='project-form')finishReferenceSave(f);if(b?.isConnected)b.disabled=false;}
});
document.addEventListener('change',async e=>{
  if(e.target.closest('#decision-form'))$('#decision-form').dataset.dirty='true';
  if(e.target.name==='unlimited_agents'){const field=e.target.form.elements.concurrency;field.disabled=e.target.checked;field.required=!e.target.checked;}
  if(e.target.id==='board-filter'){boardFilter=e.target.value;render();}
  if(e.target.id==='docx-file'){
    const file=e.target.files[0];if(!file)return;
    try{if(file.size>8*1024*1024)throw new Error('Choose a DOCX smaller than 8 MiB.');const buffer=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<buffer.length;i+=8192)binary+=String.fromCharCode(...buffer.subarray(i,i+8192));const r=await api('import',{filename:file.name,base64:btoa(binary)});$('#daily-bullets').value=r.text;$('#daily-source').value=r.source;toast('Text imported read-only. Review the bullets before planning.');}catch(err){toast(err.message,true);}
  }
});
document.addEventListener('input',e=>{if(e.target.closest('#decision-form'))$('#decision-form').dataset.dirty='true';});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[role=button]')){e.preventDefault();e.target.click();}});
$('#modal').addEventListener('cancel',e=>{if(referenceSaveInProgress()){e.preventDefault();toast('Wait for the project to finish saving.');return;}currentModal=null;view='live';setTimeout(render,0);});

document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('#modal').open&&!$('#path-picker').open){event.preventDefault();closeModal();}});
