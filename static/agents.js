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
  t=AgentModel.resultView(t);
  const active=['running','queued','stopping'].includes(t.state),waiting=(t.live_requests||[]).some(r=>r.status==='pending');
  return `<article class="task-card agent-card ${waiting?'rose':active?'blue':'green'}"><div class="row"><span class="card-project">${esc(projectName(t.project_id))}</span><span class="badge">${esc(agentStatus(t))}</span></div><h3><button data-task="${esc(t.id)}" class="text-button">${esc(AgentModel.title(t))}</button></h3>${taskFeedbackHTML(t,true)}<div class="actions"><button data-task="${esc(t.id)}" class="${waiting?'primary':'mini-button'}">${waiting?'Reply to agent':'Open conversation'}</button>${active&&t.state!=='stopping'?`<button data-agent-stop="${esc(t.id)}" class="mini-button">Stop</button>`:''}</div>${t.state==='queued'?`<p class="section-note">${esc(t.progress)}</p>`:''}${t.worktree?'<p class="section-note">Separate checkout · original folder preserved</p>':''}</article>`;
}
renderBoard=function() {
  const all=currentAgents(),active=all.filter(t=>['queued','running','stopping'].includes(t.state)),waiting=all.filter(t=>(t.live_requests||[]).some(r=>r.status==='pending')||['blocked','failed','interrupted'].includes(t.state));
  const finished=all.filter(t=>['ready_for_review','accepted'].includes(t.state));
  const visible=all.filter(t=>agentFilter==='all'||(agentFilter==='active'&&active.includes(t))||(agentFilter==='waiting'&&waiting.includes(t))||(agentFilter==='finished'&&finished.includes(t)));
  const drafts=state.plans.filter(p=>['draft','approved'].includes(p.state)&&(!boardFilter||p.project_id===boardFilter));
  return `<div class="stats"><div class="stat"><span>In motion</span><strong>${active.length}</strong></div><div class="stat"><span>Needs you</span><strong>${waiting.length}</strong></div><div class="stat"><span>Finished</span><strong>${finished.length}</strong></div><div class="stat"><span>Saved results</span><strong>${state.tasks.filter(t=>t.result&&(!boardFilter||t.project_id===boardFilter)).length}</strong></div></div><section class="panel agent-toolbar"><div><h2>Your agents</h2><p>Give each agent a task. Follow its progress and reply here.</p></div><button data-start-agent class="primary">+ Start agents</button></section>${state.config.mode==='simulated'?'<div class="help">Simulated mode · try the workflow without model calls. Choose Codex CLI in Settings for real agents.</div>':''}<div class="board-top"><div class="attention-filters" role="group" aria-label="Filter agents">${[['all','All'],['active','In motion'],['waiting','Needs you'],['finished','Finished']].map(([key,label])=>`<button data-agent-filter="${key}" class="mini-button" aria-pressed="${agentFilter===key}">${label}</button>`).join('')}</div>${projectFilterHTML()}</div><div class="agent-grid">${visible.map(agentCard).join('')||`<section class="panel empty-state"><h2>${all.length?'No agents in this view.':'Start your first agent.'}</h2><p>Choose a project or folder and describe the work. Add more agents when you want separate responsibilities.</p><button data-start-agent class="primary">Start agent</button></section>`}</div>${drafts.length?`<details class="panel"><summary>Saved planning drafts · ${drafts.length}</summary>${drafts.map(p=>`<div class="brief-row"><span>${esc(projectName(p.project_id))} · ${esc(p.specs[0].title)}</span><button data-plan="${esc(p.id)}">Open draft</button></div>`).join('')}</details>`:''}<section class="panel"><div class="section-title"><h2>Recent results</h2><button data-view="results" class="mini-button">All results →</button></div>${agentResultRows(collectedResults().slice(0,4))}</section>`;
};
function agentResultRows(tasks) {
  return tasks.map(raw=>{
    const t=AgentModel.resultView(raw);
    const sections=resultSections(t.result.summary),files=(t.output_links||[]).filter(x=>x.source_path);
    return `<article class="agent-result"><div class="row"><div><div class="eyebrow">${esc(projectName(t.project_id))} · ${esc(date(t.finished_at||t.updated))}</div><h3>${esc(AgentModel.title(t))}</h3></div><span class="badge">${esc(agentStatus(t))}</span></div><p>${reportPreview(sections.changes||t.result.summary)}</p>${sections.limits?`<p class="section-note"><strong>Limitations:</strong> ${reportPreview(sections.limits,160)}</p>`:''}<div class="actions"><button data-agent-result="${esc(t.id)}" class="mini-button">Open result</button><span class="muted">${files.length} file${files.length===1?'':'s'}</span></div><details class="result-details"><summary>Checks & files</summary>${sections.checks?`<p class="handoff-basis">Reported by the agent</p>${reportHTML(sections.checks)}`:'<p class="muted">No checks reported.</p>'}${sections.next||t.result.next_steps?.[0]?`<h4>Next step</h4>${reportHTML(sections.next||t.result.next_steps[0])}`:''}${files.map(f=>`<a href="/api/output/${encodeURIComponent(t.id)}/${encodeURIComponent(f.name)}" class="output-link">${esc(f.label)}</a>`).join('')}</details></article>`;
  }).join('')||'<p class="muted">No results yet.</p>';
}
function renderResults() {
  const tasks=collectedResults(),seen=new Set(),latest=[],earlier=[];
  for(const task of tasks){const id=AgentModel.identity(task);if(seen.has(id))earlier.push(task);else{seen.add(id);latest.push(task);}}
  return `<div class="board-top"><p class="muted">${tasks.length} saved result${tasks.length===1?'':'s'}</p>${state.projects.length>1?projectFilterHTML():''}</div><section class="panel">${agentResultRows(latest)}</section>${earlier.length?`<details class="previous-results"><summary>Earlier results · ${earlier.length}</summary><section class="panel">${agentResultRows(earlier)}</section></details>`:''}`;
}

function newAgentFields() {
  return `<section class="new-agent-row"><div class="row"><h3>Agent</h3><button type="button" data-remove-agent class="mini-button">Remove</button></div><label>Instructions<textarea name="instructions" required rows="3" placeholder="What should this agent accomplish?"></textarea></label><label>Name <span class="muted">· optional</span><input name="title" maxlength="100" placeholder="A short task name"></label></section>`;
}
function startAgentModal(pid='') {
  const project=state.projects.find(p=>p.id===(pid||selectedProject||boardFilter));
  modal('Start agents','',`<form id="start-agent-form"><label>Project<select name="project_id" id="agent-project"><option value="">Choose a folder for a new project</option>${state.projects.map(p=>`<option value="${esc(p.id)}" ${project?.id===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><div id="agent-new-project" ${project?'hidden':''}><label>Working folder<div class="path-input"><input name="cwd" id="project-cwd" placeholder="Absolute project folder" ${state.config.mode==='codex'&&!project?'required':''}><button type="button" data-pick-path="directory">Choose folder…</button></div></label><label>Project name<input name="project_name" placeholder="Optional · uses the folder name"></label></div><div id="new-agent-rows">${newAgentFields()}</div><button type="button" data-add-agent class="mini-button">+ Add another agent</button><details class="agent-options"><summary>Execution options · ${state.config.default_execution_policy==='yolo'?'YOLO':'sandboxed'} · until finished or stopped</summary><div class="form-grid"><label>Access<select name="access"><option value="workspace-write">Edit project files</option><option value="read-only">Read-only report</option></select></label><label>Execution<select name="execution_policy"><option value="sandboxed" ${state.config.default_execution_policy!=='yolo'?'selected':''}>Sandboxed · project access</option><option value="yolo" ${state.config.default_execution_policy==='yolo'?'selected':''}>YOLO · full CLI access</option></select></label></div><label class="checkbox-label"><input type="checkbox" name="research_access">Allow command network access in sandboxed mode</label><label class="checkbox-label"><input type="checkbox" name="isolate" ${state.config.default_isolate?'checked':''}>Use separate checkouts for Git projects</label><p class="section-note">Agents edit the chosen project folder by default. Writers in overlapping folders run one at a time. Separate checkouts allow parallel edits in the same Git project; those edits stay in the checkout until applied to the original.</p><label>Time limit<select name="time_limit"><option value="none">Until finished or stopped</option><option value="default">Configured limit · ${esc(state.config.timeout_seconds)} seconds</option></select></label><p class="section-note" id="agent-permission-note">${state.config.default_execution_policy==='yolo'?'YOLO lets CLI commands access files and the network beyond the project.':'Sandboxed agents can ask for additional tool permissions here when needed.'}</p></details><div class="actions"><button type="submit" class="primary">Start agents →</button></div><p class="section-note"><span id="agent-folder-note">${state.config.default_isolate?'Changes stay in separate checkouts until applied to the original project.':'Changes are saved directly in the chosen project folder.'}</span> Start launches these instructions with the execution options above.</p><p id="agent-start-status" role="status" aria-live="polite"></p></form>`,'start-agents',project?.id||'');
}

function liveRequestsHTML(t) {
  return AgentModel.pending(t).map(r=>{
    const p=r.params,question=r.method==='item/tool/requestUserInput',permissions=r.method==='item/permissions/requestApproval',elicitation=r.method==='mcpServer/elicitation/request';
    const fields=question&&r.questions_omitted?`<p>This request has more questions than fit in the preview. Download the full request and provide each question ID and answer below.</p><label>Answers as JSON${r.has_secret_questions?'<input type="password" autocomplete="off" data-agent-answers-json required>':'<textarea data-agent-answers-json rows=8 required placeholder="&#123;&quot;question_id&quot;: &quot;Your answer&quot;&#125;"></textarea>'}</label>`:question?(p.questions||[]).map(q=>`<label>${esc(r.capture_name?shortTaskText(q.question,1200):q.question)}${q.options?.length?`<select data-question-choice="${esc(q.id)}"><option value="">Choose or write your answer</option>${q.options.map(o=>`<option value="${esc(o.label)}">${esc(o.label)}${o.description?' · '+esc(o.description):''}</option>`).join('')}</select>`:''}<input ${q.isSecret?'type="password" autocomplete="off"':'type="text"'} data-agent-answer="${esc(q.id)}" required placeholder="Your answer"></label>`).join(''):`<p>${esc(p.reason||p.message||'The agent needs a tool permission to continue.')}</p>${p.command?`<pre>${esc(p.command)}</pre>`:''}${p.cwd?`<p class="section-note">Folder: ${esc(p.cwd)}</p>`:''}${p.grantRoot?`<p class="section-note">Requested folder access: ${esc(p.grantRoot)}</p>`:''}${p.networkApprovalContext?`<p>Network: ${esc(p.networkApprovalContext.host)} · ${esc(p.networkApprovalContext.protocol)}</p>`:''}${permissions?`<pre>${esc(JSON.stringify(p.permissions,null,2))}</pre>`:''}${elicitation&&p.url?`<p>Requested URL: ${esc(p.url)}</p>`:''}${elicitation&&p.requestedSchema?.properties?Object.entries(p.requestedSchema.properties).map(([key,value])=>`<label>${esc(value.title||key)}<input data-elicitation-field="${esc(key)}" ${p.requestedSchema.required?.includes(key)?'required':''} data-field-type="${esc(value.type||'string')}"></label>`).join(''):''}`;
    return `<section class="live-agent-request help warning"><h3>${question?'Agent question':'Tool permission'}</h3><form data-live-agent-form data-task-id="${esc(t.id)}" data-request-id="${esc(r.id)}" data-method="${esc(r.method)}"><fieldset ${r.status==='sending'?'disabled':''}>${fields}${r.capture_name?`<p class="section-note">Preview · <a href="/api/agent-capture/${encodeURIComponent(t.id)}/${encodeURIComponent(r.capture_name)}" download>Download the full request</a>. ${question?'':'Allow grants the full requested scope shown in the download.'}</p>`:''}${question?'<button type="submit" class="primary">Reply & continue</button>':`<div class="actions"><button type="submit" name="decision" value="accept" class="primary">Allow once</button>${!permissions&&!elicitation?'<button type="submit" name="decision" value="acceptForSession">Allow for this session</button>':''}<button type="submit" name="decision" value="decline">Decline</button></div>`}</fieldset>${r.status==='sending'?'<p role="status">Response is being sent to the agent…</p>':''}</form></section>`;
  }).join('');
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
function panelStatus(t){
  if(t.state==='superseded')return 'Earlier run';
  if(t.state==='ready_for_review'&&t.result?.delivery_kind==='reply')return 'Reply received';
  if(t.state==='blocked'&&!t.owner_attention?.items?.length)return 'Blocked';
  return agentStatus(t);
}
function agentStatusHTML(t){
  const f=taskFeedback(t),active=['running','queued','stopping'].includes(t.state);
  const attention=AgentModel.pending(t).length||t.owner_attention?.state==='needs_user';
  const tone=attention?'attention':t.state==='failed'?'error':active?'active':['ready_for_review','accepted'].includes(t.state)?'finished':'quiet';
  return `<div class="agent-status-line"><span data-agent-status data-tone="${tone}">${esc(panelStatus(t))}</span><span class="agent-run-time">${f.start?`<span data-elapsed-start="${esc(f.start)}" data-elapsed-end="${esc(f.end||'')}">${esc(elapsedLabel(f.start,f.end))}</span>`:''}<span data-activity-time="${esc(f.lastActivity||'')}">${esc(activityAge(f.lastActivity))}</span></span><button data-agent-stop="${esc(t.id)}" class="mini-button" ${!active?'hidden':''} ${t.state==='stopping'?'disabled':''}>${t.state==='stopping'?'Stopping…':'Stop'}</button></div>${t.state==='superseded'?`<div class="agent-archive">Saved run · ${esc(date(t.finished_at||t.updated))}<button data-agent-open-latest="${esc(AgentModel.identity(t))}" class="mini-button">Return to live conversation</button></div>`:''}${t.worktree?'<p class="agent-folder-context">Separate checkout <span>· folder in Details</span></p>':''}`;
}
function agentConversationHTML(t,wrap=true){
  const tasks=typeof state!=='undefined'&&state?.tasks?state.tasks:[t];
  const runs=AgentModel.conversationRuns(tasks,t),earlier=runs.filter(r=>r.task.id!==t.id&&r.messages.length),current=runs.find(r=>r.task.id===t.id);
  const labels={pending:'Queued',queued:'Sending',delivered:'Delivered',queued_next:'Queued for next run',uncertain:'Delivery uncertain · inspect before retrying',failed:'Could not deliver'};
  const message=(m,run)=>`<article class="message ${m.role==='user'?'user':'cos'}" data-message-key="${esc((m.task_id||run.id)+':'+(m.id||m.at))}"><div class="message-label">${m.role==='user'?'You':'Agent'}<span>${esc(date(m.at))}</span></div>${reportHTML(agentMessage(m.text)?.text||m.text)}${m.capture_name?`<p><a href="/api/agent-capture/${encodeURIComponent(m.task_id||run.id)}/${encodeURIComponent(m.capture_name)}" download>Full message</a></p>`:''}${m.role==='user'?`<small class="message-receipt">${esc(labels[m.status]||m.status)}${m.error?' · '+esc(m.error):''}</small>`:''}</article>`;
  const messages=`${earlier.length?`<details class="earlier-runs" data-panel-detail="earlier-runs"><summary>Earlier runs · ${earlier.length}</summary>${earlier.map(run=>`<section><div class="run-separator">Saved run · ${esc(date(run.task.started_at||run.task.created))}</div>${run.messages.map(m=>message(m,run.task)).join('')}</section>`).join('')}</details>`:''}<div class="run-separator">${t.state==='superseded'?'Saved':'Current'} run · ${esc(date(t.started_at||t.created))}</div>${(current?.messages||[]).map(m=>message(m,t)).join('')||'<p class="muted">Waiting for the first message.</p>'}`;
  return wrap?`<div class="agent-transcript" data-agent-transcript="${esc(t.id)}">${messages}</div>`:messages;
}
function agentReplyHelp(t){
  if(t.state==='stopping')return 'Waiting for the agent and its tools to stop';
  if(t.state==='queued')return 'Queued until this agent starts';
  if(t.state==='running')return t.interactive?'Sent to the live session':'Queued for the next run';
  return 'Continues with the same folder and permissions';
}
function replyComposerHTML(t){
  const draft=agentReplyDrafts.get(t.id)||'',active=['running','queued'].includes(t.state);
  return `<form id="agent-reply-form" data-task-id="${esc(t.id)}" ${t.state==='superseded'?'hidden':''}><label class="composer-label"><span class="sr-only" data-agent-reply-label>Message to this agent</span><textarea name="text" rows="2" placeholder="${active?'Send a message or change direction…':'What should the agent do next?'}">${esc(draft)}</textarea></label><label class="checkbox-label agent-recovery" ${!t.recovery_lock?'hidden':''}><input type="checkbox" name="confirmed_stopped" ${t.recovery_lock?'required':''}>The previous worker and its tools have stopped.</label><div class="agent-composer-actions"><p data-agent-reply-help class="section-note">${agentReplyHelp(t)}</p><button type="submit" class="primary" ${t.state==='stopping'?'disabled':''}>${t.state==='stopping'?'Stopping…':active?'Send message':'Continue agent'}</button></div><p id="agent-reply-status" role="status" aria-live="polite"></p></form>`;
}
function agentResultsHTML(t){
  const tasks=typeof state!=='undefined'&&state?.tasks?state.tasks:[t],returned=AgentModel.results(AgentModel.turns(tasks,t));
  const selected=t.result?t:returned[0],older=returned.filter(r=>r.id!==selected?.id);
  const result=raw=>{const r=AgentModel.resultView(raw);return `<article data-saved-result="${esc(r.id)}"><div class="run-separator">${r.id===t.id?'This run':'Saved run'} · ${esc(date(r.finished_at||r.updated))}</div>${resultHandoffHTML(r)}${outputSnapshotsHTML(r)}</article>`;};
  return `${selected?result(selected):'<p class="agent-empty">Replies and returned work will appear here.</p>'}${t.state==='ready_for_review'?`<details data-panel-detail="acceptance"><summary>Record your review · optional</summary><label>Review note<textarea id="review-note"></textarea></label><button data-task-action="accept">Accept result</button></details>`:''}${older.length?`<details data-panel-detail="older-results"><summary>Other saved results · ${older.length}</summary>${older.map(result).join('')}</details>`:''}`;
}
function agentDetailsHTML(t){
  const active=['running','queued'].includes(t.state);
  return `<section><h3>Instructions</h3>${reportHTML(t.purpose||t.goal||'No instructions recorded.')}<h3>Working folder</h3><p class="prose">${esc(t.context?.cwd||'Not recorded')}</p>${t.worktree?`<p class="section-note">Separate checkout · ${esc(t.worktree.branch)}. Edits stay here until applied to the original project.</p>`:''}<h3>Execution</h3><p>${esc(t.config?.model||'Not recorded')} · ${esc(t.access||'Not recorded')} · ${t.execution_policy==='yolo'?'Full access · YOLO':'Sandboxed'}</p><p class="section-note">${t.config?.timeout_seconds===0?'Until finished or stopped':esc(t.config?.timeout_seconds||'')+' seconds'}</p><h3>Session</h3><p class="prose">${esc(t.session_id||'Not started')}</p><label class="checkbox-label"><input type="checkbox" name="fresh" form="agent-reply-form" ${!t.session_id&&!active?'checked':''} ${active?'disabled':''}>Start a new session for the next run</label><p class="section-note">Available after this run ends. A continuation keeps its captured execution permissions.</p><details data-panel-detail="activity"><summary>Activity log</summary>${(t.history||[]).map(h=>`<div class="record"><small>${esc(date(h.at))}</small><p>${esc(h.text)}</p></div>`).join('')||'<p class="muted">No activity recorded.</p>'}</details></section>`;
}
function detailKey(el){return el.dataset.panelDetail||((el.closest('[data-saved-result]')?.dataset.savedResult||'panel')+':'+el.querySelector('summary')?.textContent);}
function replaceAgentSection(node,html,signature){
  if(!node||node.dataset.signature===signature)return false;
  const open=new Set([...node.querySelectorAll('details[open]')].map(detailKey));
  node.innerHTML=html;node.dataset.signature=signature;
  node.querySelectorAll('details').forEach(el=>{if(open.has(detailKey(el)))el.open=true;});
  return true;
}
function clearNewMessages(){
  const panel=$('#agent-panel');if(!panel)return;
  panel.dataset.unread='false';$('#agent-new-messages').hidden=true;
  $('[data-agent-tab=conversation]').removeAttribute('data-unread');
  $('[data-agent-tab=conversation]').setAttribute('aria-label','Conversation');
}
function jumpToLatest(){
  const panel=$('#agent-panel'),scroll=$('#agent-conversation-scroll');if(!panel||!scroll)return;
  panel.dataset.followLatest='true';scroll.scrollTop=scroll.scrollHeight;clearNewMessages();
}
function selectAgentTab(tab){
  const panel=$('#agent-panel');if(!panel)return;
  panel.dataset.tab=tab;currentModal.tab=tab;
  panel.querySelectorAll('[data-agent-tab]').forEach(b=>{const selected=b.dataset.agentTab===tab;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
  panel.querySelectorAll('[data-agent-tab-panel]').forEach(p=>{p.hidden=p.dataset.agentTabPanel!==tab;});
  if(tab==='conversation'&&panel.dataset.followLatest==='true')requestAnimationFrame(jumpToLatest);
}
function syncAgentSession(){
  if(currentModal?.type!=='task'||!$('#agent-panel'))return;
  let raw=state.tasks.find(t=>t.id===currentModal.id);if(!raw)return;
  if(raw.state==='superseded'&&currentModal.followAgent){
    const latest=AgentModel.current(state.tasks).find(t=>AgentModel.identity(t)===AgentModel.identity(raw));
    if(latest){const draft=$('#agent-reply-form textarea')?.value;if(draft)agentReplyDrafts.set(latest.id,draft);currentModal.id=latest.id;raw=latest;}
  }
  const t=AgentModel.resultView(raw),panel=$('#agent-panel');
  $('#modal-title').textContent=AgentModel.title(t);$('#modal-eyebrow').textContent=projectName(t.project_id);
  replaceAgentSection($('#agent-status'),agentStatusHTML(t),JSON.stringify([t.state,t.owner_attention,t.live_requests?.map(r=>[r.id,r.status]),t.started_at,t.finished_at,t.last_activity_at,t.session_id,t.worktree]));
  const scroll=$('#agent-conversation-scroll'),transcript=$('[data-agent-transcript]'),signature=JSON.stringify([t.id,t.conversation]);
  if(transcript.dataset.signature!==signature){
    const follow=panel.dataset.followLatest==='true',bounds=scroll.getBoundingClientRect();
    const visible=[...transcript.querySelectorAll('[data-message-key]')].find(m=>{const r=m.getBoundingClientRect();return r.height&&r.bottom>bounds.top&&r.top<bounds.bottom;});
    const anchor=visible?.dataset.messageKey,top=visible?.getBoundingClientRect().top,previousScroll=scroll.scrollTop;
    replaceAgentSection(transcript,agentConversationHTML(t,false),signature);
    // The wrapper stays mounted; only its messages change, so drafts keep focus.
    transcript.dataset.agentTranscript=t.id;
    if(follow){if(panel.dataset.tab==='conversation')requestAnimationFrame(jumpToLatest);else{panel.dataset.unread='true';$('[data-agent-tab=conversation]').dataset.unread='true';$('[data-agent-tab=conversation]').setAttribute('aria-label','Conversation, new messages');}}
    else{
      const next=[...transcript.querySelectorAll('[data-message-key]')].find(m=>m.dataset.messageKey===anchor);
      if(next){let parent=next.parentElement;while(parent&&parent!==transcript){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}scroll.scrollTop=previousScroll+next.getBoundingClientRect().top-top;}
      else scroll.scrollTop=previousScroll;
      panel.dataset.unread='true';$('#agent-new-messages').hidden=false;
      $('[data-agent-tab=conversation]').dataset.unread='true';$('[data-agent-tab=conversation]').setAttribute('aria-label','Conversation, new messages');
    }
  }
  const requests=$('#agent-current-requests'),requestSignature=JSON.stringify([t.id,t.live_requests,t.owner_attention]);
  if(requests.dataset.signature!==requestSignature){rememberLiveRequestDrafts();replaceAgentSection(requests,liveRequestsHTML(t)+(typeof ownerRequestsHTML==='function'?ownerRequestsHTML(t):''),requestSignature);restoreLiveRequestDrafts();if(panel.dataset.followLatest==='true'&&panel.dataset.tab==='conversation')requestAnimationFrame(jumpToLatest);}
  const results=$('#agent-returned-work'),resultSignature=JSON.stringify(AgentModel.turns(state.tasks,t).map(r=>[r.id,r.state,r.result,r.output_links,r.handoff_issues,r.validation_checks]));
  if(results.dataset.signature!==resultSignature&&!results.contains(document.activeElement)){replaceAgentSection(results,agentResultsHTML(t),resultSignature);restoreTaskReviewDraft(t.id);}
  $('[data-agent-tab=results]').textContent='Results'+(AgentModel.results(AgentModel.turns(state.tasks,t)).length?' · '+AgentModel.results(AgentModel.turns(state.tasks,t)).length:'');
  const details=$('#agent-details-content'),detailSignature=JSON.stringify([t.id,t.purpose,t.context?.cwd,t.config,t.access,t.worktree,t.session_id,t.state,t.history]);
  if(details.dataset.signature!==detailSignature&&!details.contains(document.activeElement)){
    const fresh=$('#agent-panel [name=fresh]')?.checked,wasActive=details.dataset.wasActive==='true',nowActive=['running','queued'].includes(t.state);
    replaceAgentSection(details,agentDetailsHTML(t),detailSignature);
    if(fresh!==undefined&&!(wasActive&&!nowActive&&!t.session_id))$('#agent-panel [name=fresh]').checked=fresh;
    details.dataset.wasActive=String(nowActive);
  }
  const composer=$('#agent-reply-form'),active=['running','queued'].includes(t.state);
  composer.dataset.taskId=t.id;composer.hidden=t.state==='superseded';
  composer.querySelector('button[type=submit]').textContent=t.state==='stopping'?'Stopping…':active?'Send message':'Continue agent';
  composer.querySelector('button[type=submit]').disabled=t.state==='stopping'||composer.dataset.sending==='true';
  composer.querySelector('textarea').placeholder=active?'Send a message or change direction…':'What should the agent do next?';
  composer.querySelector('[data-agent-reply-help]').textContent=agentReplyHelp(t);
  composer.elements.fresh.disabled=active||t.state==='stopping';
  composer.querySelector('.agent-recovery').hidden=!t.recovery_lock;composer.elements.confirmed_stopped.required=Boolean(t.recovery_lock);
}
taskModal=function(id,tab='conversation'){
  const raw=state.tasks.find(t=>t.id===id);if(!raw)return;
  const t=AgentModel.resultView(raw);rememberLiveRequestDrafts();
  selectedProject=t.project_id;lunarScene?.selectAgent(AgentModel.identity(t));
  modal(AgentModel.title(t),projectName(t.project_id),`<div id="agent-panel" data-tab="${tab}" data-follow-latest="true"><div id="agent-status">${agentStatusHTML(t)}</div><div class="agent-panel-tabs" role="tablist" aria-label="Agent panel">${[['conversation','Conversation'],['results','Results'],['details','Details']].map(([key,label])=>`<button type="button" role="tab" id="agent-tab-${key}" aria-controls="agent-${key}-panel" aria-selected="${key===tab}" tabindex="${key===tab?0:-1}" data-agent-tab="${key}">${label}</button>`).join('')}</div><section id="agent-conversation-panel" class="agent-tab-panel" data-agent-tab-panel="conversation" role="tabpanel" aria-labelledby="agent-tab-conversation" ${tab!=='conversation'?'hidden':''}><div id="agent-conversation-scroll" class="agent-tab-scroll">${agentConversationHTML(t)}<div id="agent-current-requests"></div></div><button id="agent-new-messages" type="button" class="mini-button" hidden>New messages ↓</button>${replyComposerHTML(t)}</section><section id="agent-results-panel" class="agent-tab-panel agent-tab-scroll" data-agent-tab-panel="results" role="tabpanel" aria-labelledby="agent-tab-results" ${tab!=='results'?'hidden':''}><div id="agent-returned-work"></div></section><section id="agent-details-panel" class="agent-tab-panel agent-tab-scroll" data-agent-tab-panel="details" role="tabpanel" aria-labelledby="agent-tab-details" ${tab!=='details'?'hidden':''}><div id="agent-details-content"></div></section></div>`,'task',id);
  currentModal.followAgent=t.state!=='superseded';currentModal.tab=tab;
  $('[data-agent-transcript]').dataset.signature=JSON.stringify([t.id,t.conversation]);
  $('#agent-conversation-scroll').addEventListener('scroll',()=>{const scroll=$('#agent-conversation-scroll');if(!scroll||scroll.clientHeight===0)return;$('#agent-panel').dataset.followLatest=String(scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<48);if($('#agent-panel').dataset.followLatest==='true')clearNewMessages();});
  $('#agent-new-messages').addEventListener('click',jumpToLatest);
  syncAgentSession();requestAnimationFrame(()=>{if(tab==='conversation')jumpToLatest();});
  if(agentReplyDrafts.has(id))$('#modal-content').dataset.dirty='true';
};

assignmentHTML=function(p) {
  return `<section class="panel"><h2>Agents for this project</h2><p>Start as many separate tasks as you need. Existing runs and unreviewed results stay available.</p><button data-start-agent="${esc(p.id)}" class="primary">+ Start agents</button></section><div class="agent-grid">${currentAgents(p.id).map(agentCard).join('')}</div><details class="panel"><summary>Optional planning</summary><button data-project-tab="work" class="mini-button">Open work map</button></details>`;
};

renderProjects=function(){
  return `<div class="section-title"><button id="projects-new">+ New project</button></div>${state.projects.map(p=>`<article class="panel"><h3><button class="text-button" data-project="${esc(p.id)}">${esc(p.name)}</button></h3><p>${reportPreview(p.vision||p.goal,150)}</p><p class="section-note">${currentAgents(p.id).length} agent${currentAgents(p.id).length===1?'':'s'}</p><details><summary>Project folder</summary><p class="prose">${esc(p.cwd)}</p></details><div class="actions"><button data-project="${esc(p.id)}">Open project</button><button data-start-agent="${esc(p.id)}" class="primary">Start agents</button></div></article>`).join('')||'<p>No projects yet. Start agents to create one from a working folder.</p>'}`;
};
renderProject=function(){
  const p=state.projects.find(p=>p.id===selectedProject);if(!p)return '<p>Project not found.</p>';
  lunarScene?.selectProject(p.id);
  return `<div class="actions"><button data-start-agent="${esc(p.id)}" class="primary">+ Start agents here</button><button data-edit-project="${esc(p.id)}">Project details</button></div><p>${reportPreview(p.vision||p.goal,180)}</p><details><summary>Vision & folder</summary>${reportHTML(p.vision||p.goal)}<p class="prose">${esc(p.cwd)}</p></details><h3>Agents</h3><div class="agent-grid">${currentAgents(p.id).map(agentCard).join('')||'<p class="muted">No agents yet.</p>'}</div><h3>Recent results</h3>${agentResultRows(AgentModel.results(state.tasks,p.id).slice(0,4))}<details><summary>Saved project decisions & questions</summary>${(p.records||[]).map(recordHTML).join('')||'<p class="muted">None recorded.</p>'}<button data-view="briefings">Manage project records</button></details>`;
};
function openCoordinatorPanel(id){
  const job=state.jobs.find(j=>j.id===id);if(!job)return;
  modal('CoS · '+(job.kind||'call'),projectName(job.project_id),`<p class="prose">${esc(job.progress)}</p><p class="section-note">${esc(stateName(job.state))}</p>${job.recovery_lock?'<p>Confirm the old worker and its tools stopped before releasing this lock.</p>':''}<div class="actions"><button data-stop-job="${esc(job.id)}">${job.recovery_lock?'Confirm stopped & unlock':'Stop call'}</button><button data-open-project="${esc(job.project_id)}">Open project</button></div>`,'attention-job',id);
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.agentTab){selectAgentTab(button.dataset.agentTab);return;}
  if(button.dataset.agentResult){taskModal(button.dataset.agentResult,'results');return;}
  if(button.hasAttribute('data-start-agent')){startAgentModal(button.dataset.startAgent);return;}
  if(button.hasAttribute('data-add-agent')){$('#new-agent-rows').insertAdjacentHTML('beforeend',newAgentFields());return;}
  if(button.hasAttribute('data-remove-agent')){if(document.querySelectorAll('.new-agent-row').length>1)button.closest('.new-agent-row').remove();return;}
  if(button.dataset.agentFilter){agentFilter=button.dataset.agentFilter;render();return;}
  if(button.dataset.agentOpenLatest){const latest=[...state.tasks].reverse().find(t=>(t.agent_id||t.id)===button.dataset.agentOpenLatest&&t.state!=='superseded');if(latest)taskModal(latest.id);return;}
  if(button.dataset.agentStop){button.disabled=true;try{await api('action',{id:button.dataset.agentStop,action:'pause'});if(currentModal?.type==='task')syncAgentSession();else render();toast('Stopping the agent and its tools.');}catch(error){toast(error.message,true);}finally{if(button.isConnected)button.disabled=false;}}
});
document.addEventListener('change',event=>{
  const field=event.target;
  if(field.id==='agent-project'){
    $('#agent-new-project').hidden=!!field.value;
    $('#start-agent-form').elements.cwd.required=!field.value&&state.config.mode==='codex';
  }
  if(field.closest('#start-agent-form')&&field.name==='isolate')$('#agent-folder-note').textContent=field.checked?'Changes stay in separate checkouts until applied to the original project.':'Changes are saved directly in the chosen project folder.';
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
      closeModal();boardFilter='';agentFilter='all';await refresh(false);setView('live');lunarScene?.selectProject('');toast(`${result.task_ids.length} agent${result.task_ids.length===1?'':'s'} queued.`);
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

// Arrow keys move between the three tabs without losing their reading positions.
document.addEventListener('keydown',event=>{
  const button=event.target.closest('[data-agent-tab]');if(!button)return;
  const tabs=[...document.querySelectorAll('[data-agent-tab]')],index=tabs.indexOf(button);
  const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
  if(next!==null){event.preventDefault();selectAgentTab(tabs[next].dataset.agentTab);tabs[next].focus();}
});
