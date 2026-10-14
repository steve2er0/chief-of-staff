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
  if(typeof AgentModel!=='undefined')t=AgentModel.resultView(t);
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
  if(typeof AgentModel!=='undefined')t=AgentModel.resultView(t);
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
  const text=String(summary||''), paragraphs=text.split(/\n\s*\n/), statements=text.replace(/\*\*/g,'').split(/\n+|[.!?]\s+/);
  return found?Object.fromEntries(Object.entries(sections).map(([k,v])=>[k,v.trim()])):{changes:paragraphs[0]||text,
    checks:statements.filter(x=>/\b(tests?|checks?|validation|verification|benchmarks?)\b/i.test(x)&&/\b(pass(?:ed|ing)?|fail(?:ed|ing)?|not (?:yet )?run|untested|blocked)\b|\bno (?:tests?|checks?).{0,30}\brun\b/i.test(x)).join('\n'),
    limits:paragraphs.filter(x=>/\b(blocked|failed|denied|rejected|limits?|unverified|untested|preliminary|not (?:yet )?run|not verified|remain(?:s)? open)\b|\bno (?:tests?|checks?).{0,30}\brun\b/i.test(x)).join('\n\n')};
}

function resultPlain(value){return String(value||'').replace(/!?\[([^\]]+)\]\([^\s)]+\)/g,'$1').replace(/[*`#]/g,'').replace(/\s+/g,' ').trim();}
function resultOutcome(t){
  const summary=String(t.result?.summary||'');let body=resultSections(summary).changes||summary;
  const intro=text=>/^(?:implemented|updated|completed|done|changes|summary|results?|what changed)(?: locally)?\s*[:.!]?$/i.test(text)||text.endsWith(':')&&text.split(/\s+/).length<=5;
  if(intro(resultPlain(body)))body=summary.split('\n').map(resultPlain).find(line=>line&&!intro(line)&&!line.startsWith('```'))||body;
  const text=resultPlain(body).replace(/^[-–]\s*/,'');
  return shortTaskText(text.split(/(?<=[.!?])\s+/)[0],160);
}
function resultPreviewLink(t){
  // Use an explicitly supplied preview link. Never guess an address or open it automatically.
  const text=String(t.result?.summary||'').replace(/```[\s\S]*?(?:```|$)/g,'').replace(/`[^`\n]*`/g,'');
  for(const match of text.matchAll(/(?<!!)\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi)){
    try{
      const url=new URL(match[2]),local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
      if(!url.username&&!url.password&&(/\b(preview|viewer|demo)\b/i.test(match[1])||local&&/\b(tool|app|visualization|dashboard)\b/i.test(match[1])))return {url:url.href,label:match[1]};
    }catch{/* Invalid links stay in the preserved report. */}
  }
  return null;
}
function resultLimits(t){
  const report=resultSections(t.result?.summary),negativeChecks=report.checks.split('\n').filter(x=>/\b(fail(?:ed|ing)?|not (?:yet )?run|untested|blocked)\b|\bno (?:tests?|checks?).{0,30}\b(?:run|pass(?:ed)?)\b/i.test(x));
  return [...new Set([...(t.handoff_issues||[]),...(t.result?.handoff_issues||[]),...(t.snapshot_limits||[]),...(t.validation_checks||[]).filter(c=>['failed','pending','blocked'].includes(c.status)).map(c=>c.label+': '+c.details),...negativeChecks.map(x=>'Agent-reported checks: '+x),report.limits].filter(Boolean))];
}
function resultAlertsHTML(t){
  const limits=resultLimits(t),decisions=t.result?.decisions||[];
  return `${limits.length?`<p class="result-alert"><strong>Limitations:</strong> ${reportPreview(limits[0],150)}${limits.length>1?` <span>+${limits.length-1} more in More</span>`:''}</p>`:''}${decisions.length?`<p class="result-alert"><strong>Needs your decision:</strong> ${reportPreview(decisions[0],150)}${decisions.length>1?` · ${decisions.length} decisions`:''}</p>`:''}${t.worktree?'<p class="result-location">Run used separate checkout</p>':''}${t.config?.mode==='simulated'?'<p class="result-location">Simulated result</p>':''}`;
}
function resultFilesHTML(t){
  const files=(t.output_links||[]).filter(x=>x.source_path);if(!files.length)return '';
  const basename=x=>String(x.source_path||x.label).split(/[\\/]/).at(-1);
  return `<details class="result-files" data-preserve-open="${esc(t.id)}:files" data-panel-detail="files"><summary data-result-focus="${esc(t.id)}:files">Files (${files.length})</summary><div class="result-file-list">${files.map(f=>`<a class="result-file-link" href="/api/output/${encodeURIComponent(t.id)}/${encodeURIComponent(f.name)}" title="${esc(f.source_path)}" download><span>${esc(basename(f))}</span>${files.filter(x=>basename(x)===basename(f)).length>1?`<small>${esc(f.source_path)}</small>`:''}${f.partial?'<small>Partial snapshot</small>':''}</a>`).join('')}</div></details>`;
}
function resultMoreHTML(t,{review=false}={}){
  const report=resultSections(t.result.summary),limits=resultLimits(t),links=t.output_links||[],raw=t.result.agent_report||JSON.stringify(t.result,null,2);
  return `<details class="result-more" data-preserve-open="${esc(t.id)}:more" data-panel-detail="more"><summary data-result-focus="${esc(t.id)}:more">More</summary><div class="result-more-body">${report.checks?`<h4>Agent-reported checks</h4>${reportHTML(report.checks)}`:''}${limits.length?`<h4>Limitations & delivery issues</h4><ul>${limits.map(x=>`<li>${reportInline(x)}</li>`).join('')}</ul>`:''}${t.result.decisions?.length?`<h4>Decisions</h4>${t.result.decisions.map(reportHTML).join('')}`:''}${validationChecksHTML(t)}${(t.delivery_notes||t.result.delivery_notes||[]).map(reportHTML).join('')}${(t.result.status||t.prior_state||t.state)==='failed'&&t.latest_update?`<h4>Last agent update before the stop</h4><p class="section-note">Progress report · verification was interrupted.</p>${reportHTML(t.latest_update)}`:''}${report.next||t.result.next_steps?.length?`<h4>Next step</h4>${reportHTML(report.next||t.result.next_steps.join('\n'))}`:''}<details data-preserve-open="${esc(t.id)}:report" data-panel-detail="report"><summary data-result-focus="${esc(t.id)}:report">Full report${t.result.report_truncated?' · preview':''}</summary>${reportHTML(agentMessage(t.result.agent_report)?.text||t.result.summary)}${links.filter(x=>!x.source_path).map(f=>`<a class="output-link" href="/api/output/${encodeURIComponent(t.id)}/${encodeURIComponent(f.name)}" download>${esc(f.label)}</a>`).join('')}</details>${t.review_note?`<h4>Your review</h4>${reportHTML(t.review_note)}`:''}${review?`<details data-preserve-open="${esc(t.id)}:review" data-panel-detail="acceptance"><summary>Record your review · optional</summary><label>Review note<textarea id="review-note"></textarea></label><button data-task-action="accept">Accept result</button></details>`:''}<details data-preserve-open="${esc(t.id)}:technical" data-panel-detail="technical"><summary data-result-focus="${esc(t.id)}:technical">Technical details</summary><p class="section-note">Hashes identify captured files. Reported tests and your review assess the work.</p>${links.map(f=>`<div class="result-file-metadata"><span>${esc(f.source_path||f.label)}</span><code>${esc(f.sha256||'Hash not recorded')}</code>${f.bytes!==undefined?`<small>${esc(f.bytes)} bytes</small>`:''}</div>`).join('')}<h4>Raw report</h4><pre>${esc(raw)}</pre></details></div></details>`;
}
function validationChecksHTML(t) {
  const checks=t.validation_checks||[];if(!checks.length)return '';
  return `<section class="continuation-context"><h3>Follow-up validation</h3><p class="section-note">These observations update the handoff below. The original agent report is preserved.</p>${checks.map(c=>`<div class="record"><strong>${esc(c.label)} · ${esc(c.status)}</strong><p>${esc(c.details)}</p><small class="muted">${esc(c.source)} · ${esc(date(c.at))}</small></div>`).join('')}</section>`;
}

function resultHandoffHTML(t,options={}) {
  if(typeof AgentModel!=='undefined')t=AgentModel.resultView(t);
  if(!t.result)return '';
  const preview=resultPreviewLink(t),status=typeof AgentModel!=='undefined'?AgentModel.resultStatus(t):{label:t.result.status==='completed'?'Completed':'Incomplete',tone:t.result.status==='completed'?'finished':'attention'};
  return `<section class="result-handoff result-compact"><div class="result-outcome-status"><span class="badge" data-result-tone="${status.tone}">${esc(status.label)}</span>${!['Completed','Accepted','Reply','Completed · issues'].includes(status.label)?'<span class="sr-only">Result · INCOMPLETE</span>':''}</div><p class="result-outcome">${esc(resultOutcome(t))}</p>${resultAlertsHTML(t)}${t.result.delivery_kind==='reply'?'<p class="result-location">Discussion reply · no files expected</p>':''}${preview?`<a class="result-primary-action primary" href="${esc(preview.url)}" target="_blank" rel="noreferrer">Open preview</a>`:''}${resultFilesHTML(t)}${resultMoreHTML(t,options)}</section>`;
}

function outputSnapshotsHTML(t) {
  return resultFilesHTML(t);
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
