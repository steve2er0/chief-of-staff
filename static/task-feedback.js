'use strict';

const shortTaskText=(text,limit=350)=>{const value=String(text||'').replace(/\s+/g,' ').trim();return value.length>limit?value.slice(0,limit-1).trimEnd()+'…':value;};
const taskReviewDrafts=new Map();
function rememberTaskReviewDraft(event) {
  const field=event.target;
  if(currentModal?.type!=='task'||!['review-note','revision-note','complete-item','fresh-session','confirm-stopped'].includes(field.id))return;
  const draft=taskReviewDrafts.get(currentModal.id)||{};
  draft[field.id]=field.type==='checkbox'?field.checked:field.value;
  taskReviewDrafts.set(currentModal.id,draft);$('#modal-content').dataset.dirty='true';
}
function restoreTaskReviewDraft(id) {
  const draft=taskReviewDrafts.get(id);if(!draft)return;
  for(const [key,value] of Object.entries(draft)){const el=document.getElementById(key);if(!el)continue;if(el.type==='checkbox')el.checked=value;else el.value=value;}
  $('#modal-content').dataset.dirty='true';
}
document.addEventListener('input',rememberTaskReviewDraft);
document.addEventListener('change',rememberTaskReviewDraft);
function agentMessage(text) {
  let value=String(text||'').trim(), reported=null;
  if(!value||/^(command_execution|file_change|plan_update):\s*\w+$/.test(value))return null;
  if(/^[{\[]/.test(value)){
    try{const data=JSON.parse(value);if(!data||typeof data.summary!=='string')return null;value=data.summary.trim();reported=['blocked','failed'].includes(data.status)?data.status:null;}catch{return null;}
  }
  return value?{text:value,reported}:null;
}
function taskFeedback(t) {
  const running=['running','stopping'].includes(t.state), terminal=!['queued','running','stopping'].includes(t.state);
  let latest=t.latest_update?{text:t.latest_update,reported:t.reported_status,at:t.latest_update_at}:null;
  if(!latest)for(const event of [...(t.history||[])].reverse()){
    if(event.kind==='activity'||['process.started','thread.started'].includes(event.event))continue;
    const message=agentMessage(event.text);if(message){latest={...message,at:event.at};break;}
  }
  const final=terminal?agentMessage(t.result?.summary||t.progress):null;
  const fallback=t.state==='queued'?'Waiting for an agent slot.':t.state==='stopping'?'Stopping the agent and its tools.':t.state==='running'?'The agent is working. A meaningful update will appear here.':stateName(t.state)+'.';
  const start=t.started_at||(t.history||[]).find(x=>x.event==='process.started')?.at;
  return {text:final?.text||latest?.text||fallback,reported:running?latest?.reported:null,
    at:final?t.finished_at||t.updated:latest?.at,lastActivity:t.last_activity_at||t.updated,
    start,end:terminal?t.finished_at||t.updated:null,running};
}
function elapsedLabel(start,end,now=Date.now()) {
  if(!start)return '';
  const seconds=Math.max(0,Math.floor(((end?Date.parse(end):now)-Date.parse(start))/1000));
  if(!Number.isFinite(seconds))return '';
  if(seconds<60)return `${seconds}s`;
  if(seconds<3600)return `${Math.floor(seconds/60)}m ${seconds%60}s`;
  return `${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`;
}
function activityAge(at) {
  if(!at)return 'Activity time unavailable';
  const seconds=Math.max(0,Math.floor((Date.now()-Date.parse(at))/1000));
  if(!Number.isFinite(seconds))return 'Activity time unavailable';
  return seconds<15?'Activity just now':seconds<60?`Activity ${seconds}s ago`:`Activity ${Math.floor(seconds/60)}m ago`;
}
function taskFeedbackHTML(t,compact=false) {
  const f=taskFeedback(t), warning=['blocked','failed','interrupted'].includes(t.state);
  const elapsed=elapsedLabel(f.start,f.end);
  const signature=JSON.stringify([t.state,f.text,f.reported,f.at,f.start,f.end]);
  const message=!compact&&t.result?({ready_for_review:'Result ready for your review.',blocked:'Agent stopped with a blocker. Review the incomplete work below.',failed:'Agent stopped with a failure. Review the returned work below.',accepted:'Result accepted.'}[t.state]||stateName(t.state)):compact?shortTaskText(f.text,260):f.text;
  return `<div class="agent-feedback ${warning?'warning':''}" data-agent-feedback="${esc(t.id)}" data-feedback-signature="${esc(signature)}" ${compact?'':'role="status" aria-live="polite"'}>${f.reported?'<strong class="reported-blocker">Agent update · still running</strong>':''}<p>${esc(message)}</p><div class="agent-timing">${elapsed?`<span>${f.running?'Elapsed':'Run time'} <span data-elapsed-start="${esc(f.start)}" data-elapsed-end="${esc(f.end||'')}">${esc(elapsed)}</span></span>`:''}<span data-activity-time="${esc(f.lastActivity||'')}">${esc(activityAge(f.lastActivity))}</span></div></div>`;
}
function syncTaskFeedback() {
  document.querySelectorAll('[data-agent-feedback]').forEach(el=>{
    const task=state.tasks.find(t=>t.id===el.dataset.agentFeedback);if(!task)return;
    const f=taskFeedback(task), signature=JSON.stringify([task.state,f.text,f.reported,f.at,f.start,f.end]);
    const compact=el.closest('.task-card,.review-row,.draft-banner')!==null;
    if(el.dataset.feedbackSignature!==signature)el.outerHTML=taskFeedbackHTML(task,compact);
    else {const clock=el.querySelector('[data-activity-time]');if(clock)clock.dataset.activityTime=f.lastActivity||'';}
  });
  document.querySelectorAll('[data-elapsed-start]').forEach(el=>{el.textContent=elapsedLabel(el.dataset.elapsedStart,el.dataset.elapsedEnd||null);});
  document.querySelectorAll('[data-activity-time]').forEach(el=>{el.textContent=activityAge(el.dataset.activityTime);});
}
function resultSections(summary) {
  const sections={changes:'',checks:'',limits:''};let key=null,found=false;
  for(const line of String(summary||'').split('\n')){
    const match=line.match(/^\s*(?:#{1,3}\s*)?(?:\*\*)?(Changes|Checks|Limits)\s*:(?:\*\*)?\s*(.*)$/i);
    if(match){key=match[1].toLowerCase();found=true;sections[key]+=match[2]+'\n';}
    else if(key)sections[key]+=line+'\n';
  }
  const text=String(summary||''), paragraphs=text.split(/\n\s*\n/), statements=text.split(/\n+|[.!?]\s+/);
  return found?Object.fromEntries(Object.entries(sections).map(([k,v])=>[k,v.trim()])):{changes:paragraphs[0]||text,
    checks:statements.filter(x=>/\b(tests?|checks?|validation|verification)\b/i.test(x)&&/\b(passed|failed|not run|untested|blocked)\b/i.test(x)).join('\n'),
    limits:paragraphs.slice(1).filter(x=>/\b(blocked|failed|denied|rejected|limits?|unverified|untested)\b/i.test(x)).join('\n\n')};
}
function resultHandoffHTML(t) {
  if(!t.result)return '';
  const report=resultSections(t.result.summary), links=t.output_links||[];
  const changed=links.filter(x=>x.source_path), partial=t.state!=='ready_for_review'&&t.state!=='accepted';
  return `<section class="result-handoff"><div class="eyebrow">${t.state==='accepted'?'ACCEPTED RESULT':partial?'RETURNED WORK · INCOMPLETE':'RETURNED WORK · YOUR REVIEW'}</div><h3>${partial?'What the agent returned':'What changed'}</h3><p class="handoff-basis">Agent report${t.config.mode==='simulated'?' · simulated work':''}</p><div class="prose">${esc(report.changes||'No change summary was reported.')}</div>${t.state==='failed'&&!Array.isArray(t.result.artifacts)&&t.latest_update?`<h3>Last agent update before the stop</h3><p class="handoff-basis">Progress report · verification was interrupted</p><div class="prose">${esc(t.latest_update)}</div>`:''}${changed.length?`<p class="muted">${changed.length} ${partial?'partial ':''}file snapshot${changed.length===1?'':'s'} available below.</p>`:t.result.artifacts?.length?`<details><summary>Files reported by the agent · ${t.result.artifacts.length}</summary><ul>${t.result.artifacts.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`:''}<h3>Checks & evidence</h3><p class="handoff-basis">Reported checks${t.review?' · a separate review is available below':''}</p><div class="prose">${esc(report.checks||'The agent did not provide a separate checks summary. Inspect its report and artifacts before deciding whether the criteria are met.')}</div><p class="section-note">${links.length?'File snapshots were captured and hashed. This confirms artifact integrity; it does not establish that calculations or tests are correct.':'No validated file snapshots are available.'}</p>${report.limits?`<h3>Limits & remaining work</h3><div class="prose">${esc(report.limits)}</div>`:''}${t.snapshot_limits?.length?`<p class="help warning">${esc(t.snapshot_limits.join('\n'))}</p>`:''}<h3>${t.state==='accepted'?'Your decision':'Needs your judgment'}</h3><p>${t.state==='accepted'?'You accepted this result.':partial?'Review the blocker and decide whether to revise or resume the assignment.':'Review the original criteria and choose whether to accept the result or request a revision.'}</p>${t.result.decisions?.length?`<details><summary>Items raised by the agent · ${t.result.decisions.length}</summary><ul>${t.result.decisions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`:''}<h3>Suggested next step</h3><p>${esc(t.result.next_steps?.[0]|| (partial?'Review the incomplete work and prepare a bounded revision.':'Review the result against the assignment criteria.'))}</p><details class="assignment-background"><summary>Full agent report</summary><pre>${esc(t.result.summary)}</pre></details></section>`;
}

function researchPermissionHTML(s,launched=false) {
  return `<div class="research-permission"><label class="checkbox-row"><input type="checkbox" name="research_access" ${s.research_access?'checked':''} ${launched||s.access!=='workspace-write'||s.execution_policy==='yolo'?'disabled':''}>Allow public web research & downloads in sandboxed mode</label><p class="section-note">YOLO already permits command networking. Browser permissions stay separate in either execution mode.</p><details><summary>Scope of research access</summary><p class="section-note">In sandboxed mode this enables outbound command network access without a domain allowlist. The agent is instructed to use public sources for this task, keep downloads in the project folder, and avoid uploads of private files, signed-in accounts and credential changes. Requires permission to edit project files. Other tool denials still stop the work.</p></details></div>`;
}

function executionPolicyHTML(s,launched=false) {
  return `<label>Agent execution<select name="execution_policy" ${launched?'disabled':''}><option value="sandboxed" ${s.execution_policy!=='yolo'?'selected':''}>Sandboxed · project permissions</option><option value="yolo" ${s.execution_policy==='yolo'?'selected':''} ${s.access!=='workspace-write'?'disabled':''}>YOLO · --yolo</option></select></label><p class="section-note">YOLO runs CLI commands without sandboxing or command approval prompts. The CLI can access files and the network beyond this project. Task scope and browser permissions still apply. This choice is covered by assignment approval.</p>`;
}

function timeLimitHTML(s,defaultSeconds,launched=false) {
  return `<label>Time limit<select name="time_limit" ${launched?'disabled':''}><option value="default" ${s.time_limit!=='none'?'selected':''}>Default · ${esc(defaultSeconds)} seconds</option><option value="none" ${s.time_limit==='none'?'selected':''}>No time limit · until finished or stopped</option></select></label><p class="section-note">You can pause or cancel a running agent.</p>`;
}

planModal=function(id) {
  const p=state.plans.find(x=>x.id===id);if(!p)return;
  const launched=p.state==='launched', single=p.scope==='project', project=state.projects.find(x=>x.id===p.project_id);
  const fields=p.specs.map((s,i)=>`<section class="plan-task" data-spec="${i}"><div class="row"><h3>${single?'One agent task':'Assignment '+(i+1)}</h3>${!launched&&p.specs.length>1?'<button type="button" class="mini-button danger" data-remove-spec>Remove</button>':''}</div><label>Title<input name="title" value="${esc(s.title)}" required ${launched?'disabled':''}></label><label>Goal<textarea name="goal" rows="3" required ${launched?'disabled':''}>${esc(s.goal||(single?p.context.vision:shortTaskText(s.purpose,700)))}</textarea></label><label>Done when · one criterion per line<textarea name="criteria" rows="5" required ${launched?'disabled':''}>${esc(s.criteria.join('\n'))}</textarea></label><label>Permissions<select name="access" ${launched?'disabled':''}><option value="read-only" ${s.access==='read-only'?'selected':''}>Read-only · report</option><option value="workspace-write" ${s.access==='workspace-write'?'selected':''}>Edit files in the project folder</option></select></label>${executionPolicyHTML(s,launched)}${researchPermissionHTML(s,launched)}${timeLimitHTML(s,(p.approval?.payload.execution||state.config).timeout_seconds,launched)}${s.resume_context?`<section class="continuation-context"><h3>Previous handoff</h3><p class="section-note">Saved files remain in the project. ${s.resume_session?'Continuing the captured CLI session.':'A fresh CLI session will use this context.'}</p><p class="prose">${esc(shortTaskText(s.resume_context.summary||s.resume_context.latest_update,1200))}</p><label>Your continuation instructions<textarea name="continuation_note" rows="4" ${launched?'disabled':''}>${esc(s.continuation_note||'')}</textarea></label><details><summary>Inspect the previous report and output metadata</summary><pre>${esc(JSON.stringify(s.resume_context,null,2))}</pre></details></section>`:''}<details class="assignment-background"><summary>Detailed instructions & deliverables</summary><label>Purpose & instructions<textarea name="purpose" rows="8" required ${launched?'disabled':''}>${esc(s.purpose)}</textarea></label><label>Expected output files · relative paths, one per line<textarea name="expected_outputs" rows="4" ${launched?'disabled':''}>${esc(s.expected_outputs.join('\n'))}</textarea></label><p class="section-note">Write tasks need output files. Their snapshots are checked before result acceptance.</p><label ${state.config.mode==='codex'?'hidden':''}>Simulation scenario<select name="scenario" ${launched?'disabled':''}>${['success','blocked','failed','slow'].map(x=>`<option value="${x}" ${s.scenario===x?'selected':''}>${x}</option>`).join('')}</select></label>${s.resume_session?`<p class="section-note">Resume this assignment’s captured session: ${esc(s.resume_session)}</p>`:''}</details></section>`).join('');
  modal(single?'Review agent task':'Review assignments','YOUR HANDOFF',`<p class="brief-folder"><strong>${esc(p.context.name)}</strong><br>Working folder: ${esc(p.context.cwd)}</p>${!launched&&project?.version!==p.context.version?'<div class="help warning">The project changed since this brief was prepared. Approval will refresh the captured context for another review.</div>':''}<form id="plan-form" data-id="${id}" data-revision="${p.revision}">${fields}<details class="assignment-background"><summary>Captured context & execution settings</summary><p>${esc(p.basis)} · ${esc(p.source)}</p><p>${esc((p.approval?.payload.execution||state.config).mode)} · ${esc((p.approval?.payload.execution||state.config).model)} · context version ${p.context.version}</p><pre class="context-value">${esc(JSON.stringify(p.context,null,2))}</pre></details><p class="section-note">${p.state==='approved'?'Approved. Launch starts the agent.':'Approval covers this brief, captured project context, folder and permissions. Launch is a separate step.'}</p><div class="actions">${!launched?`<button type="submit">Save edits</button><button type="button" id="approve-plan" class="${p.state==='approved'?'':'primary'}">${single?'Approve assignment':'Approve assignments'}</button>${p.state==='approved'?`<button type="button" id="launch-plan" class="primary">${single?'Launch agent →':'Launch agents →'}</button>`:''}`:`<span class="pill">Launched · ${p.task_ids.length} ${p.task_ids.length===1?'agent task':'agent tasks'}</span>`}</div></form>`,'plan',id);
  $('#plan-form')?.addEventListener('input',()=>{const launch=$('#launch-plan');if(launch)launch.disabled=true;});
  $('#plan-form')?.addEventListener('change',event=>{
    if(['access','execution_policy'].includes(event.target.name)){
      const row=event.target.closest('[data-spec]'), access=row.querySelector('[name=access]'), policy=row.querySelector('[name=execution_policy]'), research=row.querySelector('[name=research_access]');
      policy.querySelector('[value=yolo]').disabled=access.value!=='workspace-write';
      if(access.value!=='workspace-write'){policy.value='sandboxed';research.checked=false;}
      research.disabled=access.value!=='workspace-write'||policy.value==='yolo';
    }
    const launch=$('#launch-plan');if(launch)launch.disabled=true;
  });
};

// Timings remain live while a review note or assignment edit has focus.
setInterval(syncTaskFeedback,1000);
