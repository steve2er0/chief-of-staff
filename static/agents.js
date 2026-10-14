'use strict';

let agentFilter='all';
const agentReplyDrafts=new Map();
const agentReplyRequests=new Map();
const liveRequestDrafts=new Map();
let startAgentRequest=null;

function currentAgents(projectId=boardFilter) {
  return AgentModel.current(state.tasks,projectId);
}
function agentStatus(t) {return AgentModel.status(t);}
function projectFilterHTML() {
  return `<label class="inline-control">Project<select id="board-filter"><option value="">All projects</option>${state.projects.map(p=>`<option value="${esc(p.id)}" ${boardFilter===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>`;
}
function collectedResults() {
  return AgentModel.results(state.tasks,boardFilter);
}
function agentCard(t) {
  const active=['running','queued','stopping'].includes(t.state),waiting=(t.live_requests||[]).some(r=>r.status==='pending');
  return `<article class="task-card agent-card ${waiting?'rose':active?'blue':'green'}"><div class="row"><span class="card-project">${esc(projectName(t.project_id))}</span><span class="badge">${esc(agentStatus(t))}</span></div><h3><button data-task="${esc(t.id)}" class="text-button">${esc(t.title)}</button></h3><p class="card-purpose">${esc(shortTaskText(t.goal||t.purpose,160))}</p>${taskFeedbackHTML(t,true)}<div class="actions"><button data-task="${esc(t.id)}" class="${waiting?'primary':'mini-button'}">${waiting?'Reply to agent':'Open conversation'}</button>${active&&t.state!=='stopping'?`<button data-agent-stop="${esc(t.id)}" class="mini-button">Stop</button>`:''}</div>${t.state==='queued'?`<p class="section-note">${esc(t.progress)}</p>`:''}${t.worktree?'<p class="section-note">Separate checkout · original folder preserved</p>':''}</article>`;
}
renderBoard=function() {
  const all=currentAgents(),active=all.filter(t=>['queued','running','stopping'].includes(t.state)),waiting=all.filter(t=>(t.live_requests||[]).some(r=>r.status==='pending')||['blocked','failed','interrupted'].includes(t.state));
  const finished=all.filter(t=>['ready_for_review','accepted'].includes(t.state));
  const visible=all.filter(t=>agentFilter==='all'||(agentFilter==='active'&&active.includes(t))||(agentFilter==='waiting'&&waiting.includes(t))||(agentFilter==='finished'&&finished.includes(t)));
  const drafts=state.plans.filter(p=>['draft','approved'].includes(p.state)&&(!boardFilter||p.project_id===boardFilter));
  return `<div class="stats"><div class="stat"><span>In motion</span><strong>${active.length}</strong></div><div class="stat"><span>Needs you</span><strong>${waiting.length}</strong></div><div class="stat"><span>Finished</span><strong>${finished.length}</strong></div><div class="stat"><span>Saved results</span><strong>${state.tasks.filter(t=>t.result&&(!boardFilter||t.project_id===boardFilter)).length}</strong></div></div><section class="panel agent-toolbar"><div><h2>Your agents</h2><p>Give each agent a task. Follow its progress and reply here.</p></div><button data-start-agent class="primary">+ Start agents</button></section>${state.config.mode==='simulated'?'<div class="help">Simulated mode · try the workflow without model calls. Choose Codex CLI in Settings for real agents.</div>':''}<div class="board-top"><div class="attention-filters" role="group" aria-label="Filter agents">${[['all','All'],['active','In motion'],['waiting','Needs you'],['finished','Finished']].map(([key,label])=>`<button data-agent-filter="${key}" class="mini-button" aria-pressed="${agentFilter===key}">${label}</button>`).join('')}</div>${projectFilterHTML()}</div><div class="agent-grid">${visible.map(agentCard).join('')||`<section class="panel empty-state"><h2>${all.length?'No agents in this view.':'Start your first agent.'}</h2><p>Choose a project or folder and describe the work. Add more agents when you want separate responsibilities.</p><button data-start-agent class="primary">Start agent</button></section>`}</div>${drafts.length?`<details class="panel"><summary>Saved planning drafts · ${drafts.length}</summary>${drafts.map(p=>`<div class="brief-row"><span>${esc(projectName(p.project_id))} · ${esc(p.specs[0].title)}</span><button data-plan="${esc(p.id)}">Open draft</button></div>`).join('')}</details>`:''}<section class="panel"><div class="section-title"><h2>Recent results</h2><button data-view="results" class="mini-button">All results →</button></div>${agentResultRows(collectedResults().slice(0,4))}</section>`;
};
function agentResultRows(tasks) {
  return tasks.map(t=>{
    const sections=resultSections(t.result.summary),files=(t.output_links||[]).filter(x=>x.source_path);
    return `<article class="agent-result"><div class="row"><div><div class="eyebrow">${esc(projectName(t.project_id))} · ${esc(date(t.finished_at||t.updated))}</div><h3>${esc(t.title)}</h3></div><span class="badge">${esc(agentStatus(t))}</span></div><p>${esc(shortTaskText(sections.changes||t.result.summary,500))}</p>${sections.checks?`<p class="result-checks"><strong>Reported checks:</strong> ${esc(shortTaskText(sections.checks,240))}</p>`:''}${sections.limits?`<p class="section-note"><strong>Limitations:</strong> ${esc(shortTaskText(sections.limits,240))}</p>`:''}${sections.next||t.result.next_steps?.[0]?`<p><strong>Next:</strong> ${esc(shortTaskText(sections.next||t.result.next_steps[0],240))}</p>`:''}<div class="actions"><button data-task="${esc(t.id)}" class="mini-button">Open result & conversation</button>${files.slice(0,3).map(f=>`<a href="/api/output/${encodeURIComponent(t.id)}/${encodeURIComponent(f.name)}" class="output-link">${esc(f.label)}</a>`).join('')}<span class="muted">${files.length} file snapshot${files.length===1?'':'s'}</span></div></article>`;
  }).join('')||'<p class="muted">Returned work will appear here automatically. You can continue an agent without accepting its previous result.</p>';
}
function renderResults() {
  const tasks=collectedResults();
  return `<div class="board-top"><p>${tasks.length} saved result${tasks.length===1?'':'s'} · includes earlier turns and partial work</p>${projectFilterHTML()}</div><section class="panel">${agentResultRows(tasks)}</section>`;
}

function newAgentFields() {
  return `<section class="new-agent-row"><div class="row"><h3>Agent task</h3><button type="button" data-remove-agent class="mini-button">Remove</button></div><label>Instructions<textarea name="instructions" required rows="3" placeholder="What should this agent accomplish?"></textarea></label><details><summary>Name this agent task</summary><label>Title<input name="title" placeholder="Optional · uses the first line of your instructions"></label></details></section>`;
}
function startAgentModal(pid='') {
  const project=state.projects.find(p=>p.id===(pid||selectedProject||boardFilter));
  modal('Start agents','YOUR INSTRUCTIONS',`<form id="start-agent-form"><label>Project<select name="project_id" id="agent-project"><option value="">Choose a folder for a new project</option>${state.projects.map(p=>`<option value="${esc(p.id)}" ${project?.id===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><div id="agent-new-project" ${project?'hidden':''}><label>Working folder<div class="path-input"><input name="cwd" id="project-cwd" placeholder="Absolute project folder" ${state.config.mode==='codex'&&!project?'required':''}><button type="button" data-pick-path="directory">Choose folder…</button></div></label><label>Project name<input name="project_name" placeholder="Optional · uses the folder name"></label></div><div id="new-agent-rows">${newAgentFields()}</div><button type="button" data-add-agent class="mini-button">+ Add another agent</button><details class="agent-options"><summary>Execution options · ${state.config.default_execution_policy==='yolo'?'YOLO':'sandboxed'} · until finished or stopped</summary><div class="form-grid"><label>Access<select name="access"><option value="workspace-write">Edit project files</option><option value="read-only">Read-only report</option></select></label><label>Execution<select name="execution_policy"><option value="sandboxed" ${state.config.default_execution_policy!=='yolo'?'selected':''}>Sandboxed · project access</option><option value="yolo" ${state.config.default_execution_policy==='yolo'?'selected':''}>YOLO · full CLI access</option></select></label></div><label class="checkbox-label"><input type="checkbox" name="research_access">Allow command network access in sandboxed mode</label><label class="checkbox-label"><input type="checkbox" name="isolate" checked>Use separate checkouts for Git projects</label><p class="section-note">Separate checkouts start with current tracked edits and untracked files. Shared-folder writers run one at a time. Checkouts and results stay available after a run.</p><label>Time limit<select name="time_limit"><option value="none">Until finished or stopped</option><option value="default">Configured limit · ${esc(state.config.timeout_seconds)} seconds</option></select></label><p class="section-note" id="agent-permission-note">${state.config.default_execution_policy==='yolo'?'YOLO lets CLI commands access files and the network beyond the project.':'Sandboxed agents can ask for additional tool permissions here when needed.'}</p></details><div class="actions"><button type="submit" class="primary">Start agents →</button></div><p class="section-note">Start launches these instructions with the execution options above.</p><p id="agent-start-status" role="status" aria-live="polite"></p></form>`,'start-agents',project?.id||'');
}

function liveRequestsHTML(t) {
  return AgentModel.pending(t).map(r=>{
    const p=r.params,question=r.method==='item/tool/requestUserInput',permissions=r.method==='item/permissions/requestApproval',elicitation=r.method==='mcpServer/elicitation/request';
    const fields=question&&r.questions_omitted?`<p>This request has more questions than fit in the preview. Download the full request and provide each question ID and answer below.</p><label>Answers as JSON${r.has_secret_questions?'<input type="password" autocomplete="off" data-agent-answers-json required>':'<textarea data-agent-answers-json rows=8 required placeholder="&#123;&quot;question_id&quot;: &quot;Your answer&quot;&#125;"></textarea>'}</label>`:question?(p.questions||[]).map(q=>`<label>${esc(r.capture_name?shortTaskText(q.question,1200):q.question)}${q.options?.length?`<select data-question-choice="${esc(q.id)}"><option value="">Choose or write your answer</option>${q.options.map(o=>`<option value="${esc(o.label)}">${esc(o.label)}${o.description?' · '+esc(o.description):''}</option>`).join('')}</select>`:''}<input ${q.isSecret?'type="password" autocomplete="off"':'type="text"'} data-agent-answer="${esc(q.id)}" required placeholder="Your answer"></label>`).join(''):`<p>${esc(p.reason||p.message||'The agent needs a tool permission to continue.')}</p>${p.command?`<pre>${esc(p.command)}</pre>`:''}${p.cwd?`<p class="section-note">Folder: ${esc(p.cwd)}</p>`:''}${p.grantRoot?`<p class="section-note">Requested folder access: ${esc(p.grantRoot)}</p>`:''}${p.networkApprovalContext?`<p>Network: ${esc(p.networkApprovalContext.host)} · ${esc(p.networkApprovalContext.protocol)}</p>`:''}${permissions?`<pre>${esc(JSON.stringify(p.permissions,null,2))}</pre>`:''}${elicitation&&p.url?`<p>Requested URL: ${esc(p.url)}</p>`:''}${elicitation&&p.requestedSchema?.properties?Object.entries(p.requestedSchema.properties).map(([key,value])=>`<label>${esc(value.title||key)}<input data-elicitation-field="${esc(key)}" ${p.requestedSchema.required?.includes(key)?'required':''} data-field-type="${esc(value.type||'string')}"></label>`).join(''):''}`;
    return `<section class="live-agent-request help warning"><h3>${question?'Agent question':'Tool permission'}</h3><form data-live-agent-form data-task-id="${esc(t.id)}" data-request-id="${esc(r.id)}" data-method="${esc(r.method)}"><fieldset ${r.status==='sending'?'disabled':''}>${fields}${r.capture_name?`<p class="section-note">Preview · <a href="/api/agent-capture/${encodeURIComponent(t.id)}/${encodeURIComponent(r.capture_name)}" download>Download the full request</a>. ${question?'':'Allow grants the full requested scope shown in the download.'}</p>`:''}${question?'<button type="submit" class="primary">Reply & continue</button>':`<div class="actions"><button type="submit" name="decision" value="accept" class="primary">Allow once</button>${!permissions&&!elicitation?'<button type="submit" name="decision" value="acceptForSession">Allow for this session</button>':''}<button type="submit" name="decision" value="decline">Decline</button></div>`}</fieldset>${r.status==='sending'?'<p role="status">Response is being sent to the agent…</p>':''}</form></section>`;
  }).join('');
}
function syncAgentSession() {
  if(currentModal?.type!=='task')return;
  let task=state.tasks.find(t=>t.id===currentModal.id);if(!task)return;
  if(task.state==='superseded'&&currentModal.followAgent){
    const latest=AgentModel.current(state.tasks).find(t=>AgentModel.identity(t)===AgentModel.identity(task));
    if(latest){const draft=$('#agent-reply-form textarea')?.value||agentReplyDrafts.get(task.id);if(draft)agentReplyDrafts.set(latest.id,draft);taskModal(latest.id);task=latest;}
  }
  $('#modal-title').textContent=task.title;
  $('#modal-eyebrow').textContent=`${projectName(task.project_id)} · ${agentStatus(task)}`;
  if(!$('#agent-reply-form')&&!['stopping','superseded'].includes(task.state))taskModal(task.id);
  const composer=$('#agent-reply-form');
  if(composer){
    const active=['running','queued'].includes(task.state),button=composer.querySelector('button[type=submit]');
    button.textContent=active?'Send to agent':'Reply & continue';
    button.disabled=task.state==='stopping'||composer.dataset.sending==='true';
    composer.querySelector('[data-agent-reply-label]').textContent=task.state==='running'?'Send instructions to this agent':'Reply and continue';
    composer.elements.fresh.disabled=active;
    composer.querySelector('[data-agent-reply-help]').textContent=task.state==='running'?(task.interactive?'Your message is sent to the running session.':'This CLI uses queued follow-ups; your message starts the next turn when this run stops.'):'Work continues directly with these instructions.';
  }
  document.querySelectorAll('#modal-content [data-agent-stop]').forEach(button=>{button.hidden=!['queued','running'].includes(task.state);});
  const returned=$('#agent-returned-work'),resultSignature=JSON.stringify([task.result,task.output_links]);
  if(returned&&returned.dataset.signature!==resultSignature){returned.innerHTML=(task.result?resultHandoffHTML(task):'')+outputSnapshotsHTML(task);returned.dataset.signature=resultSignature;}
  const transcript=$('[data-agent-transcript]');
  if(transcript){
    const signature=JSON.stringify(task.conversation||[]);
    if(transcript.dataset.signature!==signature){
      const atEnd=transcript.scrollHeight-transcript.scrollTop-transcript.clientHeight<30,scroll=transcript.scrollTop;
      const holder=document.createElement('div');holder.innerHTML=agentConversationHTML(task);
      transcript.innerHTML=holder.firstElementChild.innerHTML;transcript.dataset.signature=signature;
      transcript.scrollTop=atEnd?transcript.scrollHeight:scroll;
    }
  }
  const requests=$('#live-agent-requests');
  if(requests){
    const signature=JSON.stringify(task.live_requests||[]);
    if(requests.dataset.signature!==signature){rememberLiveRequestDrafts();requests.innerHTML=liveRequestsHTML(task);requests.dataset.signature=signature;restoreLiveRequestDrafts();}
  }
}
function rememberLiveRequestDrafts(){
  document.querySelectorAll('[data-live-agent-form]').forEach(form=>{
    const values=[...form.querySelectorAll('input,select,textarea')].filter(el=>el.type!=='password').map(el=>[(el.hasAttribute('data-agent-answers-json')?'$answers':el.dataset.agentAnswer||el.dataset.questionChoice||el.dataset.elicitationField),el.hasAttribute('data-question-choice')?'choice':'answer',el.value]);
    liveRequestDrafts.set(form.dataset.taskId+':'+form.dataset.requestId,{values,responseUuid:form.dataset.responseUuid,responseFingerprint:form.dataset.responseFingerprint});
  });
}
function restoreLiveRequestDrafts(){
  document.querySelectorAll('[data-live-agent-form]').forEach(form=>{
    const draft=liveRequestDrafts.get(form.dataset.taskId+':'+form.dataset.requestId);if(!draft)return;
    if(draft.responseUuid)form.dataset.responseUuid=draft.responseUuid;
    if(draft.responseFingerprint)form.dataset.responseFingerprint=draft.responseFingerprint;
    for(const [id,kind,value] of draft.values){const el=[...form.querySelectorAll('input,select,textarea')].find(el=>((el.hasAttribute('data-agent-answers-json')?'$answers':el.dataset.agentAnswer||el.dataset.questionChoice||el.dataset.elicitationField))===id&&(el.hasAttribute('data-question-choice')?'choice':'answer')===kind);if(el)el.value=value;}
  });
}
function agentConversationHTML(t) {
  const messages=t.conversation||[],labels={pending:'Queued for start',queued:'Sending to agent',delivered:'Delivered',queued_next:'Queued for the next turn',uncertain:'Delivery uncertain · inspect the session before retrying',failed:'Could not deliver'};
  return `<div class="agent-transcript" data-agent-transcript="${esc(t.id)}">${messages.slice(-10).map(m=>`<article class="message ${m.role==='user'?'user':'cos'}"><div class="message-label">${m.role==='user'?'YOU':'AGENT'}<span>${esc(date(m.at))}</span></div><p class="prose">${esc(agentMessage(m.text)?.text||m.text)}</p>${m.capture_name?`<p><a href="/api/agent-capture/${encodeURIComponent(m.task_id||t.id)}/${encodeURIComponent(m.capture_name)}" download>Download the full message</a></p>`:''}${m.role==='user'?`<small class="message-receipt">${esc(labels[m.status]||m.status)}${m.error?' · '+esc(m.error):''}</small>`:''}</article>`).join('')||'<p class="muted">Follow-ups and agent replies will stay here.</p>'}</div>`;
}
function replyComposerHTML(t) {
  if(t.state==='stopping'||t.state==='superseded')return '';
  const draft=agentReplyDrafts.get(t.id)||'';
  return `<form id="agent-reply-form" data-task-id="${esc(t.id)}"><label><span data-agent-reply-label>${t.state==='running'?'Send instructions to this agent':'Reply and continue'}</span><textarea name="text" rows="3" placeholder="What should the agent do next?">${esc(draft)}</textarea></label>${t.recovery_lock?'<label class="checkbox-label"><input type="checkbox" name="confirmed_stopped" required>The previous worker and its tools have stopped.</label>':''}<details><summary>Session options</summary><label class="checkbox-label"><input type="checkbox" name="fresh" ${!t.session_id&&!['running','queued'].includes(t.state)?'checked':''} ${['running','queued'].includes(t.state)?'disabled':''}>Start a fresh session</label><p class="section-note">Continuation keeps this agent’s folder, model and execution permissions.</p></details><button type="submit" class="primary">${['running','queued'].includes(t.state)?'Send to agent':'Reply & continue'}</button><p class="section-note" data-agent-reply-help>${t.state==='running'?(t.interactive?'Your message is sent to the running session.':'This CLI uses queued follow-ups; your message starts the next turn when this run stops.'):'Work continues directly with these instructions.'}</p><p id="agent-reply-status" role="status" aria-live="polite"></p></form>`;
}
taskModal=function(id) {
  const t=state.tasks.find(x=>x.id===id);if(!t)return;
  selectedProject=t.project_id;
  rememberLiveRequestDrafts();
  if(lunarScene)lunarScene.selectAgent(AgentModel.identity(t));
  modal(t.title,`${projectName(t.project_id)} · ${agentStatus(t)}`,`${taskFeedbackHTML(t)}<div id="live-agent-requests">${liveRequestsHTML(t)}</div>${typeof ownerRequestsHTML==='function'?ownerRequestsHTML(t):''}${agentConversationHTML(t)}${replyComposerHTML(t)}<div id="agent-returned-work">${t.result?resultHandoffHTML(t):''}${outputSnapshotsHTML(t)}</div>${t.worktree?`<details><summary>Working checkout</summary><p class="prose">${esc(t.context.cwd)}</p><p class="section-note">Branch: ${esc(t.worktree.branch)}. Edits are retained here; they are not merged into your original folder automatically.</p></details>`:''}<details><summary>Original instructions & execution</summary><p class="prose">${esc(t.purpose)}</p><p class="prose">${esc(t.context.cwd)}</p><p>${esc(t.access)} · ${t.execution_policy==='yolo'?'YOLO':'sandboxed'} · ${t.config.timeout_seconds===0?'no time limit':esc(t.config.timeout_seconds)+' seconds'}</p><p class="section-note">Session: ${esc(t.session_id||'Not started')}</p></details><div class="actions">${['queued','running'].includes(t.state)?`<button data-agent-stop="${esc(t.id)}">Stop agent</button>`:''}${t.state==='superseded'?`<button data-agent-open-latest="${esc(t.agent_id||t.id)}">Open current agent</button>`:''}</div>${t.state==='ready_for_review'?'<details><summary>Optional result acceptance</summary><p>Record that this result meets your goal. You can continue the agent without accepting it.</p><label>Review note<textarea id="review-note"></textarea></label><button data-task-action="accept">Accept result</button></details>':''}${AgentModel.turns(state.tasks,t).some(turn=>turn.id!==t.id&&turn.result)?`<details><summary>Earlier results from this agent</summary>${AgentModel.results(AgentModel.turns(state.tasks,t)).filter(turn=>turn.id!==t.id).map(turn=>`<div class="brief-row"><span>${esc(date(turn.finished_at||turn.updated))} · ${esc(shortTaskText(turn.result.summary,110))}</span><button data-task="${esc(turn.id)}">Open result</button></div>`).join('')}</details>`:''}<details><summary>Detailed activity</summary>${(t.history||[]).slice(-20).map(h=>`<div class="record"><small>${esc(date(h.at))}</small><p>${esc(h.text)}</p></div>`).join('')}</details>`,'task',id);
  currentModal.followAgent=t.state!=='superseded';
  $('#live-agent-requests').dataset.signature=JSON.stringify(t.live_requests||[]);
  restoreLiveRequestDrafts();
  if(agentReplyDrafts.has(id))$('#modal-content').dataset.dirty='true';
};

assignmentHTML=function(p) {
  return `<section class="panel"><h2>Agents for this project</h2><p>Start as many separate tasks as you need. Existing runs and unreviewed results stay available.</p><button data-start-agent="${esc(p.id)}" class="primary">+ Start agents</button></section><div class="agent-grid">${currentAgents(p.id).map(agentCard).join('')}</div><details class="panel"><summary>Optional planning</summary><button data-project-tab="work" class="mini-button">Open work map</button></details>`;
};

renderProjects=function(){
  return `<div class="section-title"><p>Each project has its own outpost.</p><button id="projects-new">+ New project</button></div>${state.projects.map(p=>`<article class="panel"><h3><button class="text-button" data-project="${esc(p.id)}">${esc(p.name)}</button></h3><p>${esc(shortTaskText(p.vision||p.goal,230))}</p><p class="section-note">${esc(p.cwd)} · ${currentAgents(p.id).length} agents</p><div class="actions"><button data-project="${esc(p.id)}">Open outpost</button><button data-start-agent="${esc(p.id)}" class="primary">Start agents</button></div></article>`).join('')||'<p>No projects yet. Start agents to create one from a working folder.</p>'}`;
};
renderProject=function(){
  const p=state.projects.find(p=>p.id===selectedProject);if(!p)return '<p>Project not found.</p>';
  lunarScene?.selectProject(p.id);
  return `<div class="actions"><button data-start-agent="${esc(p.id)}" class="primary">+ Start agents here</button><button data-edit-project="${esc(p.id)}">Edit project context</button></div><p>${esc(p.vision||p.goal)}</p><p class="section-note">${esc(p.cwd)}</p><h3>Agents</h3><div class="agent-grid">${currentAgents(p.id).map(agentCard).join('')||'<p class="muted">No agents yet.</p>'}</div><h3>Recent results</h3>${agentResultRows(AgentModel.results(state.tasks,p.id).slice(0,4))}<details><summary>Saved project decisions & questions</summary>${(p.records||[]).map(recordHTML).join('')||'<p class="muted">None recorded.</p>'}<button data-view="briefings">Manage project records</button></details>`;
};
function openCoordinatorPanel(id){
  const job=state.jobs.find(j=>j.id===id);if(!job)return;
  modal('CoS · '+(job.kind||'call'),projectName(job.project_id),`<p class="prose">${esc(job.progress)}</p><p class="section-note">${esc(stateName(job.state))}</p>${job.recovery_lock?'<p>Confirm the old worker and its tools stopped before releasing this lock.</p>':''}<div class="actions"><button data-stop-job="${esc(job.id)}">${job.recovery_lock?'Confirm stopped & unlock':'Stop call'}</button><button data-open-project="${esc(job.project_id)}">Open project</button></div>`,'attention-job',id);
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-start-agent')){startAgentModal(button.dataset.startAgent);return;}
  if(button.hasAttribute('data-add-agent')){$('#new-agent-rows').insertAdjacentHTML('beforeend',newAgentFields());return;}
  if(button.hasAttribute('data-remove-agent')){if(document.querySelectorAll('.new-agent-row').length>1)button.closest('.new-agent-row').remove();return;}
  if(button.dataset.agentFilter){agentFilter=button.dataset.agentFilter;render();return;}
  if(button.dataset.agentOpenLatest){const latest=[...state.tasks].reverse().find(t=>(t.agent_id||t.id)===button.dataset.agentOpenLatest&&t.state!=='superseded');if(latest)taskModal(latest.id);return;}
  if(button.dataset.agentStop){button.disabled=true;try{await api('action',{id:button.dataset.agentStop,action:'pause'});if(currentModal?.type==='task')taskModal(currentModal.id);else render();toast('Stopping the agent and its tools.');}catch(error){toast(error.message,true);}finally{if(button.isConnected)button.disabled=false;}}
});
document.addEventListener('change',event=>{
  const field=event.target;
  if(field.id==='agent-project'){
    $('#agent-new-project').hidden=!!field.value;
    $('#start-agent-form').elements.cwd.required=!field.value&&state.config.mode==='codex';
  }
  if(field.dataset.questionChoice){const answer=[...field.form.querySelectorAll('[data-agent-answer]')].find(x=>x.dataset.agentAnswer===field.dataset.questionChoice);answer.value=field.value;}
  if(field.closest('#start-agent-form')&&['access','execution_policy'].includes(field.name)){
    const form=field.form,reader=form.elements.access.value==='read-only',policy=form.elements.execution_policy;
    policy.querySelector('[value=yolo]').disabled=reader;if(reader)policy.value='sandboxed';
    form.elements.research_access.disabled=reader||policy.value==='yolo';if(reader)form.elements.research_access.checked=false;
    $('#agent-permission-note').textContent=policy.value==='yolo'?'YOLO lets CLI commands access files and the network beyond the project.':'Sandboxed agents can ask for additional tool permissions here when needed.';
  }
});
document.addEventListener('input',event=>{
  if(event.target.closest('[data-live-agent-form]'))rememberLiveRequestDrafts();
  if(event.target.closest('#agent-reply-form')&&event.target.name==='text')agentReplyDrafts.set(event.target.form.dataset.taskId,event.target.value);
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!['start-agent-form','agent-reply-form'].includes(form.id)&&!form.hasAttribute('data-live-agent-form'))return;
  event.preventDefault();if(form.dataset.sending==='true')return;form.dataset.sending='true';
  const buttons=[...form.querySelectorAll('button[type=submit]')];buttons.forEach(b=>b.disabled=true);
  try{
    const data=new FormData(form);let result;
    if(form.id==='start-agent-form'){
      const payload={project_id:data.get('project_id')||undefined,cwd:data.get('cwd'),project_name:data.get('project_name'),
        agents:[...form.querySelectorAll('.new-agent-row')].map(row=>({title:row.querySelector('[name=title]').value,instructions:row.querySelector('[name=instructions]').value})),
        access:data.get('access'),execution_policy:data.get('execution_policy'),research_access:form.elements.research_access.checked,isolate:form.elements.isolate.checked,time_limit:data.get('time_limit')};
      if(payload.access==='read-only')payload.research_access=false;
      const fingerprint=JSON.stringify(payload);if(!startAgentRequest||startAgentRequest.fingerprint!==fingerprint)startAgentRequest={fingerprint,id:crypto.randomUUID()};
      $('#agent-start-status').textContent='Starting agents…';
      result=await api('start-agents',payload,startAgentRequest.id,false);startAgentRequest=null;
      closeModal();boardFilter='';agentFilter='all';await refresh(false);setView('live');lunarScene?.selectProject(result.project_id);toast(`${result.task_ids.length} agent${result.task_ids.length===1?'':'s'} queued.`);
    }else if(form.id==='agent-reply-form'){
      const tid=form.dataset.taskId,payload={id:tid,text:data.get('text'),confirmed_stopped:form.elements.confirmed_stopped?.checked||false,fresh:form.elements.fresh.checked};
      const fingerprint=JSON.stringify(payload),previous=agentReplyRequests.get(tid);
      const request=previous?.fingerprint===fingerprint?previous:{fingerprint,id:crypto.randomUUID()};agentReplyRequests.set(tid,request);
      $('#agent-reply-status').textContent='Sending…';
      result=await api('agent-reply',payload,request.id,false);agentReplyDrafts.delete(tid);agentReplyRequests.delete(tid);
      if(form.elements.text.value===payload.text)form.elements.text.value='';
      else agentReplyDrafts.set(result.id,form.elements.text.value);
      await refresh(false);taskModal(result.id);toast(result.state==='queued'?'Follow-up queued for this agent.':'Reply saved; delivery status is shown in the conversation.');
    }else{
      const payload={id:form.dataset.taskId,request:form.dataset.requestId};
      if(form.dataset.method==='item/tool/requestUserInput'){const bulk=form.querySelector('[data-agent-answers-json]');payload.answers=bulk?JSON.parse(bulk.value):Object.fromEntries([...form.querySelectorAll('[data-agent-answer]')].map(x=>[x.dataset.agentAnswer,x.value]));}
      else{payload.decision=event.submitter?.value||'decline';if(form.querySelector('[data-elicitation-field]'))payload.content=Object.fromEntries([...form.querySelectorAll('[data-elicitation-field]')].map(x=>[x.dataset.elicitationField,x.dataset.fieldType==='boolean'?x.value==='true':x.dataset.fieldType==='integer'||x.dataset.fieldType==='number'?Number(x.value):x.value]));}
      const fingerprint=JSON.stringify(payload);if(form.dataset.responseFingerprint!==fingerprint){form.dataset.responseUuid=crypto.randomUUID();form.dataset.responseFingerprint=fingerprint;}result=await api('agent-response',payload,form.dataset.responseUuid,false);
      liveRequestDrafts.delete(payload.id+':'+payload.request);await refresh(false);taskModal(result.id);toast('Response sent to the agent.');
    }
  }catch(error){toast(error.message,true);const status=form.querySelector('[role=status]');if(status)status.textContent=error.message+' Your instructions are preserved for retry.';}
  finally{form.dataset.sending='false';buttons.forEach(b=>{if(b.isConnected)b.disabled=false;});}
});
