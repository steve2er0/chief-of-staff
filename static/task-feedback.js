'use strict';

const shortTaskText=(text,limit=350)=>{const value=String(text||'').replace(/\s+/g,' ').trim();return value.length>limit?value.slice(0,limit-1).trimEnd()+'…':value;};
// Render a small, escaped Markdown subset. Reports cannot inject HTML, scripts,
// images or non-web link schemes into the local workspace.
function reportInline(value){
  return String(value||'').split(/(`[^`\n]+`|!?\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).map(part=>{
    if(part.startsWith('`')&&part.endsWith('`'))return '<code>'+esc(part.slice(1,-1))+'</code>';
    const link=part.match(/^(!?)\[([^\]]+)\]\(([^\s)]+)\)$/);
    if(link){const [,image,label,url]=link;return !image&&/^(?:https?:\/\/|\/api\/)/i.test(url)?`<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(label)}</a>`:esc(label);}
    if(part.startsWith('**')&&part.endsWith('**'))return '<strong>'+esc(part.slice(2,-2))+'</strong>';
    if(part.startsWith('*')&&part.endsWith('*'))return '<em>'+esc(part.slice(1,-1))+'</em>';
    return esc(part);
  }).join('');
}
function reportHTML(value){
  const blocks=[],paragraph=[],items=[];let fence=null,ordered=false;
  const flush=()=>{if(paragraph.length)blocks.push('<p>'+reportInline(paragraph.splice(0).join('\n')).replace(/\n/g,'<br>')+'</p>');if(items.length){const tag=ordered?'ol':'ul';blocks.push('<'+tag+'>'+items.splice(0).map(x=>'<li>'+reportInline(x)+'</li>').join('')+'</'+tag+'>');}};
  for(const line of String(value||'').split('\n')){
    if(/^\s*```/.test(line)){flush();if(fence!==null){blocks.push('<pre><code>'+esc(fence.join('\n'))+'</code></pre>');fence=null;}else fence=[];continue;}
    if(fence!==null){fence.push(line);continue;}
    if(!line.trim()){flush();continue;}
    const heading=line.match(/^#{1,6}\s+(.+)$/),item=line.match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/);
    if(heading){flush();blocks.push('<h4>'+reportInline(heading[1])+'</h4>');}
    else if(item){if(paragraph.length||(items.length&&ordered!==!item[1]))flush();ordered=!item[1];items.push(item[2]);}
    else{if(items.length)flush();paragraph.push(line);}
  }
  flush();if(fence!==null)blocks.push('<pre><code>'+esc(fence.join('\n'))+'</code></pre>');
  return '<div class="report-markdown">'+blocks.join('')+'</div>';
}
function reportPreview(value,limit=260){
  const plain=String(value||'').replace(/!?\[([^\]]+)\]\([^\s)]+\)/g,'$1').replace(/[*`#]/g,'');
  return esc(shortTaskText(plain,limit));
}
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
  if(!value||/^(command_execution|file_change|plan_update|commandExecution|fileChange|mcpToolCall|webSearch):\s*\w+$/.test(value))return null;
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
  const fallback=t.state==='queued'?(t.workspace_preparation&&t.workspace_preparation!=='ready'?'Preparing separate checkout.':'Waiting for an agent slot.'):t.state==='stopping'?'Stopping the agent and its tools.':t.state==='running'?'The agent is working. A meaningful update will appear here.':stateName(t.state)+'.';
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
  const signature=JSON.stringify([t.state,f.text,f.reported,f.at,f.start,f.end,t.handoff_issues]);
  const issues=t.handoff_issues||t.result?.handoff_issues||[];
  const message=issues.length&&!['ready_for_review','accepted'].includes(t.state)?(compact?shortTaskText(issues[0],260):`Report preserved · ${issues.length} item${issues.length===1?' needs':'s need'} attention. See what needs fixing below.`):!compact&&t.result?({ready_for_review:t.managed_agent?'Finished · your result is saved below.':'Result ready for your review.',blocked:'Agent stopped with a blocker. Review the incomplete work below.',failed:'Agent stopped with a failure. Review the returned work below.',accepted:'Result accepted.'}[t.state]||stateName(t.state)):compact?shortTaskText(f.text,260):f.text;
  return `<div class="agent-feedback ${warning?'warning':''}" data-agent-feedback="${esc(t.id)}" data-feedback-signature="${esc(signature)}" ${compact?'':'role="status" aria-live="polite"'}>${f.reported?'<strong class="reported-blocker">Agent update · still running</strong>':''}<p>${reportPreview(message,compact?200:320)}</p><div class="agent-timing">${elapsed?`<span>${f.running?'Elapsed':'Run time'} <span data-elapsed-start="${esc(f.start)}" data-elapsed-end="${esc(f.end||'')}">${esc(elapsed)}</span></span>`:''}<span data-activity-time="${esc(f.lastActivity||'')}">${esc(activityAge(f.lastActivity))}</span></div></div>`;
}
function syncTaskFeedback() {
  document.querySelectorAll('[data-agent-feedback]').forEach(el=>{
    const task=state.tasks.find(t=>t.id===el.dataset.agentFeedback);if(!task)return;
    const f=taskFeedback(task), signature=JSON.stringify([task.state,f.text,f.reported,f.at,f.start,f.end,task.handoff_issues]);
    const compact=el.closest('.task-card,.review-row,.draft-banner')!==null;
    if(el.dataset.feedbackSignature!==signature)el.outerHTML=taskFeedbackHTML(task,compact);
    else {const clock=el.querySelector('[data-activity-time]');if(clock)clock.dataset.activityTime=f.lastActivity||'';}
  });
  document.querySelectorAll('[data-elapsed-start]').forEach(el=>{el.textContent=elapsedLabel(el.dataset.elapsedStart,el.dataset.elapsedEnd||null);});
  document.querySelectorAll('[data-activity-time]').forEach(el=>{el.textContent=activityAge(el.dataset.activityTime);});
}
function resultSections(summary) {
  const sections={changes:'',checks:'',limits:'',next:''};let key=null,found=false;
  for(const line of String(summary||'').split('\n')){
    const match=line.match(/^\s*(?:#{1,3}\s*)?(?:\*\*)?(Changes|Checks|Limits|Next(?: action| steps?)?)\s*:(?:\*\*)?\s*(.*)$/i);
    if(match){key=match[1].toLowerCase().startsWith('next')?'next':match[1].toLowerCase();found=true;sections[key]+=match[2]+'\n';}
    else if(key)sections[key]+=line+'\n';
  }
  const text=String(summary||''), paragraphs=text.split(/\n\s*\n/), statements=text.split(/\n+|[.!?]\s+/);
  return found?Object.fromEntries(Object.entries(sections).map(([k,v])=>[k,v.trim()])):{changes:paragraphs[0]||text,
    checks:statements.filter(x=>/\b(tests?|checks?|validation|verification)\b/i.test(x)&&/\b(passed|failed|not run|untested|blocked)\b/i.test(x)).join('\n'),
    limits:paragraphs.slice(1).filter(x=>/\b(blocked|failed|denied|rejected|limits?|unverified|untested)\b/i.test(x)).join('\n\n')};
}
function validationChecksHTML(t) {
  const checks=t.validation_checks||[];if(!checks.length)return '';
  return `<section class="continuation-context"><h3>Follow-up validation</h3><p class="section-note">These observations update the handoff below. The original agent report is preserved.</p>${checks.map(c=>`<div class="record"><strong>${esc(c.label)} · ${esc(c.status)}</strong><p>${esc(c.details)}</p><small class="muted">${esc(c.source)} · ${esc(date(c.at))}</small></div>`).join('')}</section>`;
}

function resultHandoffHTML(t) {
  if(!t.result)return '';
  const report=resultSections(t.result.summary),links=t.output_links||[],files=links.filter(x=>x.source_path),fullReport=links.find(x=>x.name==='agent-report.txt');
  const ready=['ready_for_review','accepted'].includes(t.prior_state||t.state),issues=t.handoff_issues||t.result.handoff_issues||t.snapshot_limits||[];
  const limits=[report.limits,...issues].filter(Boolean),heading=ready?'Result':'Result · INCOMPLETE';
  return `<section class="result-handoff"><h3>${heading}</h3><p>${reportPreview(report.changes||t.result.summary,360)}</p>${t.result.report_truncated&&fullReport?`<p class="section-note">Preview · <a href="/api/output/${encodeURIComponent(t.id)}/agent-report.txt" download>Full report</a></p>`:''}${limits.length?`<p class="section-note"><strong>Limitations:</strong> ${reportPreview(limits[0],240)}</p>`:''}<p class="muted">${files.length?files.length+' file'+(files.length===1?'':'s'):'No validated file snapshots are available'} · ${t.config.mode==='simulated'?'simulated result':'agent report'}</p>${t.result.decisions?.length?`<h3>Needs your decision</h3>${t.result.decisions.map(d=>reportHTML(d)).join('')}`:''}<details class="assignment-background"><summary>Report & validation</summary><p class="handoff-basis">${t.result.recovery_source?'Recovered agent report':'Reported checks · agent report'}</p>${reportHTML(report.checks||'No checks reported.')}<p class="section-note">File integrity and reported testing are separate evidence.</p>${limits.length?`<h4>Limitations & delivery issues</h4><ul>${limits.map(x=>`<li>${reportInline(x)}</li>`).join('')}</ul>`:''}${validationChecksHTML(t)}${(t.delivery_notes||t.result.delivery_notes||[]).map(x=>reportHTML(x)).join('')}${t.state==='failed'&&t.latest_update?`<h4>Last agent update before the stop</h4><p class="section-note">Progress report · verification was interrupted</p>${reportHTML(t.latest_update)}`:''}${report.next||t.result.next_steps?.length?`<h4>Next step</h4>${reportHTML(report.next||t.result.next_steps.join('\n'))}`:''}<h4>Original report</h4>${reportHTML(typeof t.result.agent_report==='string'?t.result.agent_report:t.result.summary)}<details><summary>Raw report</summary><pre>${esc(t.result.agent_report||JSON.stringify(t.result,null,2))}</pre></details></details></section>`;
}

function outputSnapshotsHTML(t) {
  const links=t.output_links||[];if(!links.length)return '';
  const link=o=>`<a class="output-link" href="/api/output/${t.id}/${encodeURIComponent(o.name)}">↗ ${esc(o.label)} <span class="muted">· ${esc(o.sha256.slice(0,12))}</span></a>`;
  return `<details class="assignment-background"><summary>Files & reports · ${links.filter(x=>x.source_path).length} files</summary>${links.map(link).join('')}</details>`;
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
  const launched=p.state==='launched',single=p.scope==='project';
  const fields=p.specs.map((s,i)=>`<section class="plan-task" data-spec="${i}"><div class="row"><h3>${single?'One agent task':'Agent '+(i+1)}</h3>${!launched&&p.specs.length>1?'<button type="button" class="mini-button danger" data-remove-spec>Remove</button>':''}</div><label>Title<input name="title" value="${esc(s.title)}" required ${launched?'disabled':''}></label><label>Goal<textarea name="goal" rows="3" required ${launched?'disabled':''}>${esc(s.goal||shortTaskText(s.purpose,700))}</textarea></label><p class="section-note" data-execution-summary>${s.access==='read-only'?'Read-only report':s.execution_policy==='yolo'?'YOLO · --yolo':'Sandboxed · edit project files'} · ${s.time_limit==='none'?'until finished or stopped':'configured time limit'}</p>${s.resume_context?`<label>Next instructions<textarea name="continuation_note" rows="3" ${launched?'disabled':''}>${esc(s.continuation_note||'')}</textarea></label><details><summary>Previous result</summary><pre>${esc(JSON.stringify(s.resume_context,null,2))}</pre></details>`:''}<details class="assignment-background"><summary>Instructions, execution & files</summary><label>Done when<textarea name="criteria" rows="3" required ${launched?'disabled':''}>${esc(s.criteria.join('\n'))}</textarea></label><label>Detailed instructions<textarea name="purpose" rows="6" required ${launched?'disabled':''}>${esc(s.purpose)}</textarea></label><label>Permissions<select name="access" ${launched?'disabled':''}><option value="read-only" ${s.access==='read-only'?'selected':''}>Read-only report</option><option value="workspace-write" ${s.access==='workspace-write'?'selected':''}>Edit project files</option></select></label>${executionPolicyHTML(s,launched)}${researchPermissionHTML(s,launched)}${timeLimitHTML(s,(p.approval?.payload.execution||state.config).timeout_seconds,launched)}<label>Expected files · optional<textarea name="expected_outputs" rows="3" ${launched?'disabled':''}>${esc(s.expected_outputs.join('\n'))}</textarea></label><p class="section-note">The agent can choose and report the files it delivers.</p><label ${state.config.mode==='codex'?'hidden':''}>Simulation scenario<select name="scenario" ${launched?'disabled':''}>${['success','blocked','failed','slow'].map(x=>`<option value="${x}" ${s.scenario===x?'selected':''}>${x}</option>`).join('')}</select></label></details></section>`).join('');
  modal(single?'Delegate an agent':'Delegate agents','YOUR GOAL',`<p class="brief-folder"><strong>${esc(p.context.name)}</strong><br>${esc(p.context.cwd)}</p><form id="plan-form" data-id="${id}" data-revision="${p.revision}">${fields}<details class="assignment-background"><summary>Project context</summary><pre>${esc(JSON.stringify(p.context,null,2))}</pre></details><p class="section-note">Delegation starts these agents with the goal and execution choices shown here. Agents own routine testing and recovery. Results return for your review.</p><div class="actions">${!launched?'<button type="submit">Save for later</button><button type="button" id="delegate-plan" class="primary">Delegate & start →</button>':`<span class="pill">${p.task_ids.length} agent task${p.task_ids.length===1?'':'s'} launched</span>`}</div></form>`,'plan',id);
  $('#plan-form')?.addEventListener('change',event=>{
    const row=event.target.closest('[data-spec]');if(!row)return;
    const access=row.querySelector('[name=access]'),policy=row.querySelector('[name=execution_policy]'),research=row.querySelector('[name=research_access]');
    policy.querySelector('[value=yolo]').disabled=access.value!=='workspace-write';
    if(access.value!=='workspace-write'){policy.value='sandboxed';research.checked=false;}
    else if(event.target.name==='access')policy.value=state.config.default_execution_policy||'sandboxed';
    research.disabled=access.value!=='workspace-write'||policy.value==='yolo';
    row.querySelector('[data-execution-summary]').textContent=(access.value==='read-only'?'Read-only report':policy.value==='yolo'?'YOLO · --yolo':'Sandboxed · edit project files')+' · '+(row.querySelector('[name=time_limit]').value==='none'?'until finished or stopped':'configured time limit');
  });
};

// Timings remain live while a review note or assignment edit has focus.
setInterval(syncTaskFeedback,1000);
