'use strict';

let projectTab = 'conversation', cosMethod = 'local';
const selectedPieces = new Set();
const conversationDrafts = new Map();
const priorityLabel = value => ({advance:'Advance now',maintain:'Maintain momentum',deferred:'Deferred'}[value] || 'Maintain momentum');
const projectItems = id => state.work_items.filter(x=>x.project_id===id);
const projectTasks = id => state.tasks.filter(x=>x.project_id===id && x.state!=='superseded');
const continuity = id => state.portfolio.landscape.find(x=>x.project_id===id);
const itemTitle = id => state.work_items.find(x=>x.id===id)?.title || 'Work piece';
const methodOptions = () => `<option value="local" ${cosMethod==='local'?'selected':''}>Local guided prompts · not AI</option><option value="codex" ${cosMethod==='codex'?'selected':''} ${state.config.mode!=='codex'?'disabled':''}>Codex CoS · real read-only call</option>`;
const paragraph = text => `<div class="prose">${esc(text)}</div>`;
const projectReview = id => (state.setup_reviews||[]).find(x=>x.project_id===id);

function projectReviewHTML(p) {
  if(state.config.mode!=='codex')return '';
  const review=projectReview(p.id);
  if(review?.state==='running'||review?.state==='completed')return '';
  if(review?.state==='pending')return `<div class="job"><div class="row"><strong>CoS project review · waiting</strong><button data-cancel-project-review="${p.id}" class="mini-button">Cancel review</button></div><p>Your CoS will get oriented as soon as current work allows.</p></div>`;
  const issue=review&&['failed','blocked','interrupted'].includes(review.state);
  return `<div class="help ${issue?'warning':''}"><p>${issue?'The project is saved, but the CoS setup review needs attention.':review?.state==='cancelled'?'The setup review was cancelled.':review?'The project changed since the setup review.':'Your CoS can review the vision, project folder and references to get oriented.'}</p>${issue?`<details><summary>Review details</summary>${paragraph(review.progress)}</details>`:''}<button data-project-review="${p.id}" class="mini-button">${issue?'Retry project review':'Review project context'}</button></div>`;
}

function renderHome() {
  const b=state.portfolio, ready=state.tasks.filter(t=>t.state==='ready_for_review');
  const advice=b.model_advice, usingModel=advice?.fresh;
  const recommendations=usingModel?advice.result.recommendations.map(r=>({...b.landscape.find(x=>x.project_id===r.project_id),next:{title:r.next_step,id:r.target_id,action:r.action},reasons:[r.reason]})):b.recommendations;
  const focusJobs=state.jobs.filter(j=>j.kind==='portfolio'&&!['completed','cancelled'].includes(j.state));
  const active=state.tasks.filter(t=>['queued','running','stopping'].includes(t.state));
  const pending=state.projects.flatMap(p=>p.records.filter(r=>r.status==='open'));
  const labels={'project.saved':'Project direction updated','proposal.adopt':'Project proposal adopted','work_item.updated':'Work map updated','task.accept':'Result accepted','task.revised':'Revision prepared','worker.ready_for_review':'Result ready for review','worker.blocked':'Worker needs attention','worker.failed':'Worker stopped with a failure','result.partial':'Useful findings recorded','project.discussed':'CoS discussion updated'};
  return `<div class="briefing-toolbar"><div class="actions"><span class="muted">${b.preferences.focus_project?'Current focus: '+esc(projectName(b.preferences.focus_project)):'Choose where your attention goes next'}</span></div><label class="inline-control">Time available<select id="focus-time"><option value="15" ${b.preferences.minutes===15?'selected':''}>15 minutes</option><option value="60" ${b.preferences.minutes===60?'selected':''}>An hour</option><option value="180" ${b.preferences.minutes===180?'selected':''}>A longer session</option></select></label></div>
  <div class="stats"><div class="stat"><span>Projects</span><strong>${state.projects.length}</strong></div><div class="stat"><span>Ready for review</span><strong>${ready.length}</strong></div><div class="stat"><span>Open questions</span><strong>${pending.length}</strong></div><div class="stat"><span>Agents in motion</span><strong>${active.length}</strong></div></div>
  ${!state.projects.length?`<section class="panel empty-state"><div class="glyph">◇</div><h2>Start with your vision.</h2><p>Tell your CoS what you want to accomplish. Build the direction together, then prepare one agent task. Split work when you want separate responsibilities.</p><button id="empty-project" class="primary">Create your first project</button></section>`:`<div class="briefing-grid"><section class="panel focus-panel"><div class="eyebrow">WHERE YOUR ATTENTION COULD HELP</div><h2>Suggested focus</h2><button data-focus-advice class="mini-button" ${state.config.mode!=='codex'||focusJobs.some(j=>j.state==='running')?'disabled':''} title="Requires Codex mode and a successful CLI preflight">Ask Codex for focus advice</button>${focusJobs.map(j=>`<div class="job"><strong>CoS focus advice · ${esc(j.state)}</strong><p>${esc(j.progress)}</p>${j.state==='running'||j.recovery_lock?`<button data-stop-job="${j.id}" class="mini-button">${j.recovery_lock?'Confirm stopped & unlock':'Stop call'}</button>`:''}</div>`).join('')}${advice&&!usingModel?'<p class="section-note">Earlier Codex advice is out of date. Current local suggestions are shown.</p>':''}${usingModel?paragraph(advice.result.summary):''}${recommendations.length?recommendations.map((r,i)=>`<article class="recommendation ${i===0?'featured':''}"><div class="row"><span class="pill">${esc(priorityLabel(r.priority))}</span>${r.deadline?`<span class="muted">Target ${esc(r.deadline)}</span>`:''}</div><h3>${esc(r.name)}</h3><p class="next-title">${esc(r.next.title)}</p><p class="muted">${esc(r.reasons.join(' '))}</p><button data-focus-project="${r.project_id}" data-focus-action="${r.next.action}" data-focus-id="${r.next.id}" class="${i===0?'primary':'mini-button'}">${r.next.action==='review'?'Review this result':'Focus here'} →</button></article>`).join(''):usingModel?'<p>No additional focus action was suggested.</p>':'<p>All projects are deferred. Change a project’s priority when you want to return to it.</p>'}<p class="section-note guidance-basis">${usingModel?esc(advice.basis)+' · '+esc(date(advice.created)):esc(b.basis)+'.'}</p></section>
  <div><section class="panel"><div class="section-title"><h2>Since your last check-in</h2><button class="mini-button" data-mark-seen>Mark reviewed</button></div>${b.preferences.last_seen?`<p class="muted">Since ${esc(date(b.preferences.last_seen))}</p>`:'<p class="muted">Recent project activity</p>'}${b.changes.slice(0,5).map(e=>`<div class="change-row"><span class="activity-dot"></span><div><button class="text-button" data-open-project="${e.project_id}">${esc(projectName(e.project_id))}</button><p>${esc(labels[e.action]||'Project updated')}</p><small>${esc(date(e.time))}</small></div></div>`).join('')||'<p class="muted">No new project events since your last check-in.</p>'}</section>
  ${attentionPanelHTML(3)}</div></div>
  <section class="panel"><div class="section-title"><h2>Your project landscape</h2><button data-view="projects" class="mini-button">Manage projects</button></div><div class="table-scroll"><table class="landscape-table"><thead><tr><th>Project</th><th>Current milestone</th><th>Where you left off</th><th>Next useful move</th></tr></thead><tbody>${b.landscape.map(p=>`<tr><td><button class="text-button" data-open-project="${p.project_id}">${esc(p.name)}</button><small>${esc(priorityLabel(p.priority))}</small></td><td>${esc(p.milestone)}</td><td>${esc(p.last_left)}</td><td><button class="text-button" data-focus-project="${p.project_id}" data-focus-action="${p.next.action}" data-focus-id="${p.next.id}">${esc(p.next.title)} →</button></td></tr>`).join('')}</tbody></table></div></section>`}
  ${b.dormant.length?`<section class="panel"><h3>Worth revisiting</h3>${b.dormant.map(p=>`<div class="brief-row"><div><strong>${esc(p.name)}</strong><p>No recorded update since ${esc(date(p.last_updated))}. Keep its priority, defer it, or choose a small next step.</p></div><button data-edit-project="${p.project_id}" class="mini-button">Review priority</button></div>`).join('')}</section>`:''}`;
}

function renderReview() {
  const ready=state.tasks.filter(t=>t.state==='ready_for_review'), attention=state.tasks.filter(t=>['blocked','failed','interrupted'].includes(t.state));
  return `<section class="panel"><div class="section-title"><h2>Returned work</h2><span class="pill">${ready.length} awaiting review</span></div>${ready.map(t=>`<div class="review-row"><div><div class="eyebrow">${esc(projectName(t.project_id))}</div><h3>${esc(t.title)}</h3><p>${esc(t.result?.summary?.slice(0,300)||t.progress)}</p><small>${t.output_links.length} output snapshot(s) · ${esc(date(t.updated))}</small></div><button data-task="${t.id}" class="primary">Review result →</button></div>`).join('')||'<div class="empty-state"><h3>A clear review inbox.</h3><p>Agent results arrive here when they are ready for your judgment.</p></div>'}</section>
  ${attention.length?`<section class="panel"><h2>Needs a recovery decision</h2>${attention.map(t=>`<div class="brief-row"><div><strong>${esc(t.title)}</strong><p>${esc(projectName(t.project_id))} · ${esc(t.progress)}</p></div><button data-task="${t.id}">${esc(stateName(t.state))} →</button></div>`).join('')}</section>`:''}`;
}

renderProjects = function() {
  return `<div class="section-title"><h2>Direction that stays with the work</h2><button id="projects-new">+ New project</button></div><div class="grid-projects">${state.projects.map(p=>{const c=continuity(p.id),whole=projectTasks(p.id).filter(t=>t.assignment_scope==='project').at(-1);return `<article class="panel project-tile"><div class="row"><span class="pill">${esc(priorityLabel(p.priority))}</span><span class="muted">${whole?'Agent task · '+esc(stateName(whole.state)):c.done+'/'+c.pieces+' pieces complete'}</span></div><h3><button class="text-button" data-open-project="${p.id}">${esc(p.name)}</button></h3><p>${esc(p.vision)}</p><div class="context-label">WHERE YOU LEFT OFF</div><p>${esc(c.last_left)}</p><button data-open-project="${p.id}">Pick up here →</button></article>`;}).join('')||'<section class="panel empty-state"><h2>What do you want to accomplish?</h2><p>Start a project with your vision. The approach can develop through discussion.</p><button id="empty-project" class="primary">Create a project</button></section>'}</div>`;
};

projectForm = function(id) {
  const p=state.projects.find(x=>x.id===id)||{}, b=p.brief||{};
  modal(id?'Edit your project direction':'What do you have in mind?','START WITH YOUR VISION',`<form id="project-form" data-id="${esc(id||'')}"><p class="muted">Describe the idea in your own words. We can figure out the rest together.</p>${!id&&state.config.mode==='codex'?'<p class="section-note">Your CoS will review the project context and suggest a first step. You choose what to delegate.</p>':''}<label>Your vision<textarea name="vision" required rows="6" placeholder="I want to…">${esc(p.vision||p.goal||'')}</textarea></label><label>Project name <span class="muted">· optional</span><input name="name" value="${esc(p.name||'')}" placeholder="The CoS can use the first line of your vision"></label><details><summary>Project details · optional</summary><div class="form-grid"><label>Priority<select name="priority">${['advance','maintain','deferred'].map(v=>`<option value="${v}" ${(p.priority||'maintain')===v?'selected':''}>${priorityLabel(v)}</option>`).join('')}</select></label><label>Target date <span class="muted">· optional</span><input name="deadline" type="date" value="${esc(p.deadline||'')}"></label></div>
  ${id?`<label>Current milestone<input name="milestone" value="${esc(b.milestone||'')}" placeholder="What should the next useful outcome deliver?"></label><label>Evidence of success<textarea name="success">${esc(b.success||'')}</textarea></label><label>Constraints and priorities<textarea name="constraints">${esc(b.constraints||'')}</textarea></label>`:''}
  <label>Read-only Word import<input id="vision-docx" type="file" accept=".docx"><small id="vision-source">Imported text is reviewed here before saving.</small></label><input name="source" id="vision-source-value" type="hidden" value="">${pathFields(p)}<label>Open questions<textarea name="open_questions">${esc(p.open_questions||'')}</textarea></label><label>Next steps<textarea name="next_steps">${esc(p.next_steps||'')}</textarea></label></details><div class="actions"><button type="submit" class="primary">${id?'Save direction':'Create project'}</button></div></form>`,'project',id);
  initReferenceFiles($('#project-form'),p);
};

function briefSidebar(p) {
  const b=p.brief||{};
  const unresolved=[...new Set([...lines(p.open_questions).filter(text=>!p.records.some(r=>r.category==='question'&&r.text===text&&r.status==='answered')),...p.records.filter(r=>r.status==='open').map(r=>r.text)])].join('\n');
  return `<aside class="project-brief"><section class="panel"><div class="section-title"><h2>Project brief</h2><button data-edit-project="${p.id}" class="mini-button">Edit</button></div><div class="context-label">YOUR VISION</div>${paragraph(p.vision)}<span class="pill">${esc(priorityLabel(p.priority))}</span>${p.deadline?`<span class="pill">Target ${esc(p.deadline)}</span>`:''}<div class="context-label spaced">AGREED DIRECTION</div>${b.interpretation?paragraph(b.interpretation):'<p class="muted">Discuss the vision and review a proposed framing.</p>'}<div class="context-label spaced">CURRENT MILESTONE</div>${paragraph(b.milestone||'Not yet agreed')}<div class="context-label spaced">EVIDENCE OF SUCCESS</div>${paragraph(b.success||'To be defined')}<div class="context-label spaced">CONSTRAINTS</div>${paragraph(b.constraints||'None recorded')}<div class="context-label spaced">OPEN QUESTIONS</div>${paragraph(unresolved||'None recorded')}<div class="context-label spaced">NEXT STEP</div>${paragraph(p.next_steps||continuity(p.id)?.next.title||'Discuss the first milestone')}<details><summary>Vision history</summary>${(p.vision_history||[]).map(v=>`<div class="record">${paragraph(v.text)}<small>${esc(v.source)} · ${esc(date(v.at))}</small></div>`).join('')}</details></section></aside>`;
}

renderProject = function() {
  const p=state.projects.find(x=>x.id===selectedProject);if(!p)return '<section class="panel">Project not found.</section>';
  const ts=projectTasks(p.id), items=projectItems(p.id);
  if(projectTab==='conversation')return `<div class="conversation-workspace"><div id="project-conversation-notes">${projectNotesHTML(p)}</div>${conversationHTML(p)}</div>`;
  const tabs=[['assignment','Agent task'],['results','Results & activity · '+ts.length],...(projectTab==='work'?[['work','Separate pieces · '+items.length]]:[]),['context','Decisions & evidence']];
  return `<div class="delegation-heading"><button data-back-conversation class="text-button">← Back to conversation</button><span class="muted">Review a task and choose when to launch</span></div><div class="workspace-tabs" role="tablist" aria-label="Planning views">${tabs.map(([key,label])=>`<button role="tab" aria-selected="${projectTab===key}" data-project-tab="${key}" class="${projectTab===key?'active':''}">${esc(label)}</button>`).join('')}</div><div class="project-layout"><div>${['assignment','work'].includes(projectTab)?'':renderProjectJobs(p.id)}${projectTab==='assignment'?assignmentHTML(p):projectTab==='work'?planningProposalsHTML(p)+workMapHTML(p):projectTab==='results'?resultsHTML(p):contextHTML(p)+planningProposalsHTML(p)}</div>${briefSidebar(p)}</div>`;
};

const shortNote = (text, limit=190) => {
  const value=String(text||'').replace(/\s+/g,' ').trim();
  return value.length>limit?value.slice(0,limit-1).trimEnd()+'…':value;
};

function projectNotesHTML(p) {
  const c=continuity(p.id), tasks=projectTasks(p.id), items=projectItems(p.id), brief=p.brief||{};
  const wholeTasks=tasks.filter(t=>t.assignment_scope==='project'), draft=state.plans.filter(x=>x.project_id===p.id&&x.scope==='project'&&['draft','approved'].includes(x.state)).at(-1);
  if(wholeTasks.length||draft){
    const outstanding=[...wholeTasks].reverse().find(t=>['queued','running','stopping','ready_for_review','blocked','failed','interrupted','paused'].includes(t.state)), last=wholeTasks.at(-1);
    const note=outstanding?outstanding.state==='ready_for_review'?'Your agent has returned a result for review.':['queued','running','stopping'].includes(outstanding.state)?'One agent is handling this project.':`Your agent task is ${stateName(outstanding.state)}.`:draft?'One agent task is ready for your review.':last?.state==='accepted'?'You accepted the agent’s result. The project remains available for continued work.':'Pick up the project when you’re ready.';
    const action=outstanding?`<button class="text-button" data-task="${outstanding.id}">${outstanding.state==='ready_for_review'?'Review the result':'View the agent task'} →</button>`:draft?`<button class="text-button" data-plan="${draft.id}">Review the task, then approve and launch →</button>`:esc(shortNote(last?.result?.next_steps?.[0]||p.next_steps||'Discuss the next useful change.'));
    return `<div class="conversation-notes"><section class="project-note"><h2>Where we are</h2><p>${esc(note)}${outstanding?' '+esc(shortNote(taskFeedback(outstanding).text,140)):''}</p></section><section class="project-note next-note"><h2>Suggested next step</h2><p>${action}</p></section></div><div class="conversation-tools"><button data-edit-project="${p.id}" class="text-button">Your vision</button><button data-enter-delegation class="mini-button">Delegate work →</button></div>`;
  }
  const latest=state.proposals.filter(x=>x.project_id===p.id&&x.kind==='conversation'&&x.state==='suggested'&&x.conversation_style==='simple'&&x.based_on_version===p.version).at(-1);
  const ready=tasks.filter(t=>t.state==='ready_for_review'), active=tasks.filter(t=>['queued','running','stopping'].includes(t.state));
  const needsAttention=ready.length||tasks.some(t=>['blocked','failed','interrupted'].includes(t.state));
  const review=projectReview(p.id), gettingOriented=review&&['pending','running'].includes(review.state);
  let note=gettingOriented?'Your CoS is getting oriented to the project.':brief.interpretation||brief.milestone||'';
  if(!note&&latest?.basis.startsWith('Codex CoS /')&&latest.data.interpretation)note='Working understanding: '+latest.data.interpretation;
  if(!note)note=items.length?`${c.done} of ${items.length} work pieces complete.`:tasks.length?'The project has delegated work to pick up.':'We’re exploring your vision.';
  note=shortNote(note,130);
  if(ready.length)note+=` ${ready.length} result${ready.length===1?'':'s'} ready for your review.`;
  else if(c.attention)note+=` ${c.attention} assignment${c.attention===1?'':'s'} need attention.`;
  else if(active.length)note+=` ${active.length} assignment${active.length===1?'':'s'} in progress.`;
  else if(!tasks.length)note+=' No work has been delegated.';
  const next=needsAttention||items.length?c.next.title:gettingOriented?'A suggestion will appear after the CoS reviews your starting point.':latest?.data.next_step||p.next_steps||'Consider a concrete example of the first useful outcome.';
  const nextAction=needsAttention?`<button class="text-button" ${c.next.action==='decision'?'data-view="briefings"':'data-project-tab="results"'}>${esc(shortNote(next,150))} →</button>`:esc(shortNote(next,150));
  return `<div class="conversation-notes"><section class="project-note"><h2>Where we are</h2><p>${esc(shortNote(note))}</p></section><section class="project-note next-note"><h2>Suggested next step</h2><p>${nextAction}</p></section></div><div class="conversation-tools"><button data-edit-project="${p.id}" class="text-button">Your vision</button><button data-enter-delegation class="mini-button">Delegate work →</button></div>`;
}

function conversationTranscriptHTML(p) {
  const messages=state.messages.filter(m=>m.project_id===p.id);
  const legacyPlaceholder=m=>projectReview(p.id)&&m.basis.startsWith('Local guided')&&m.text.includes('Review the existing project work and identify a small next move.');
  const earlier=messages.filter(m=>m.style!=='conversation'||legacyPlaceholder(m)), current=messages.filter(m=>m.style==='conversation'&&!legacyPlaceholder(m));
  const messageHTML=(m,history=false)=>`<article class="message ${m.role}"><div class="message-label">${m.role==='user'?'YOU':m.basis.startsWith('Local guided')?'LOCAL GUIDANCE · NOT AI':'CHIEF OF STAFF'}<span>${esc(date(m.created))}</span></div>${paragraph(m.text)}${m.role==='cos'?conversationDetails(m.proposal_id,m.text,history):messageDeliveryHTML(m)}</article>`;
  return `${earlier.length?`<details class="earlier-conversation" data-preserve-open="history-${p.id}"><summary>Earlier conversation & planning · ${earlier.length} notes</summary>${earlier.map(m=>messageHTML(m,true)).join('')}</details>`:''}${current.map(m=>messageHTML(m)).join('')||'<p class="conversation-invitation">Your project is ready to pick up.</p>'}${conversationActivityHTML(p.id)}`;
}

function conversationHTML(p) {
  const draft=conversationDrafts.get(p.id)||'';
  return `<section class="panel conversation-panel"><div class="section-title"><h2>Conversation</h2><span class="connection-label">${cosMethod==='codex'?'Codex CoS':'Local guidance · not AI'}</span></div><div id="conversation-jobs">${renderProjectJobs(p.id,true)}${projectReviewHTML(p)}</div><div class="conversation" data-signature="${esc(conversationSignature(p.id))}">${conversationTranscriptHTML(p)}</div><form id="conversation-form" data-project-id="${p.id}" ${draft?'data-dirty="true"':''}><label class="composer-label">Continue the conversation<textarea name="text" required rows="3" placeholder="Here’s what I have in mind…">${esc(draft)}</textarea></label><div class="composer-footer"><details class="conversation-options" data-preserve-open="options-${p.id}"><summary>Conversation options</summary><label>CoS method<select name="method" id="cos-method">${methodOptions()}</select></label></details><button type="submit" class="primary">Send to CoS →</button></div><p id="conversation-delivery" class="composer-delivery" role="status" aria-live="polite" hidden></p></form></section>`;
}

function planningProposalsHTML(p) {
  const proposals=state.proposals.filter(x=>x.project_id===p.id&&x.kind==='conversation'&&x.state==='suggested');
  return proposals.length?`<details class="panel planning-proposals" data-preserve-open="proposals-${p.id}"><summary>Background planning notes · ${proposals.length} suggestions</summary><p class="muted">These are suggestions until you choose to adopt them.</p>${proposals.map(x=>`<div class="proposal-link"><span>${esc(shortNote(x.data.interpretation||x.data.summary))}<small>${x.based_on_version===p.version?'Awaiting your decision':'Earlier proposal · project has changed'} · ${esc(x.basis)}</small></span><button data-proposal="${x.id}" class="mini-button">Review framing →</button></div>`).join('')}</details>`:'';
}

function conversationDetails(id, summary, history=false) {
  const proposal=state.proposals.find(x=>x.id===id);
  if(!proposal||proposal.kind!=='conversation')return '';
  const questions=proposal.data.questions.filter(question=>!summary.includes(question));
  if(history&&questions.length)return `<div class="conversation-question">${questions.map(paragraph).join('')}</div>`;
  const question=questions[0];
  return proposal.conversation_style==='simple'&&question?`<div class="conversation-question">${paragraph(question.replace(/^\s*\d+[.)]\s*/,''))}</div>`:'';
}

function renderProjectJobs(pid,hideActiveConversation=false) {return state.jobs.filter(j=>(!hideActiveConversation||j.kind!=='conversation'||j.id===state.jobs.filter(x=>x.project_id===pid&&x.kind==='conversation').at(-1)?.id)&&!(hideActiveConversation&&j.state==='running'&&['conversation','intake'].includes(j.kind))&&j.project_id===pid&&j.state!=='completed'&&j.state!=='cancelled'&&(j.kind!=='intake'||(j.id===projectReview(pid)?.job_id&&(j.state==='running'||j.recovery_lock)))).map(j=>`<div class="job"><div class="row"><strong>CoS ${j.kind==='intake'?'project review':j.kind==='conversation'?'reply':j.kind==='assignment'?'task brief':esc(j.kind)} · ${esc(j.state)}</strong>${j.state==='running'||j.recovery_lock?`<button data-stop-job="${j.id}" class="mini-button">${j.recovery_lock?'Confirm stopped & unlock':'Stop call'}</button>`:''}</div><p>${esc(j.kind==='intake'&&j.state==='running'?'Getting oriented to your vision and existing work.':j.progress)}</p></div>`).join('');}

function assignmentHTML(p) {
  const plans=state.plans.filter(x=>x.project_id===p.id&&x.scope==='project'&&['draft','approved'].includes(x.state)), plan=plans.at(-1);
  const running=state.jobs.some(j=>j.project_id===p.id&&j.kind==='assignment'&&j.state==='running');
  const tasks=projectTasks(p.id), active=[...tasks].reverse().find(t=>['queued','running','stopping','ready_for_review','blocked','failed','interrupted','paused'].includes(t.state));
  return `<section class="panel assignment-panel"><div class="eyebrow">ONE AGENT, ONE TASK</div><h2>Assign this project</h2><p>Your vision and conversation become one assignment. The agent handles the research, implementation and checks within that task, then brings the result back to you.</p>${renderProjectJobs(p.id)}${active?`<div class="draft-banner"><div><strong>${esc(active.title)}</strong><p>${esc(stateName(active.state))}</p>${taskFeedbackHTML(active,true)}</div><button data-task="${active.id}">${active.result?'Review returned work':'View assignment'} →</button></div>`:plan?`<div class="assignment-preview"><span class="pill">${plan.state==='approved'?'Approved · ready to launch':'Draft · ready to review'}${plan.context.version!==p.version?' · project context has changed':''}</span><h3>${esc(plan.specs[0].title)}</h3><div class="context-label spaced">GOAL</div>${paragraph(shortNote(plan.specs[0].goal||p.vision,350))}<div class="context-label spaced">DONE WHEN</div><ul class="brief-criteria">${plan.specs[0].criteria.slice(0,3).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="muted">${plan.specs[0].access==='workspace-write'?'Edits project files':'Read-only work'} · ${plan.specs[0].criteria.length} acceptance criteria · 1 agent</p><button data-plan="${plan.id}" class="primary">Review agent task →</button></div>`:running?'<p class="composer-delivery" role="status" aria-live="polite">CoS is preparing one task from your project context…</p>':`<button data-project-assignment="${p.id}" class="primary">Prepare one agent task →</button><p class="section-note">Review the brief, permissions and outputs before approving and launching.</p>`}<details class="assignment-background" data-preserve-open="assignment-background-${p.id}"><summary>Detailed planning${projectItems(p.id).length?' · '+projectItems(p.id).length+' work pieces':''}</summary><p>Use a work map when you want to split responsibilities or delegate pieces separately.</p><button data-project-tab="work" class="mini-button">Split into separate assignments →</button></details></section>`;
}

function workMapHTML(p) {
  const items=projectItems(p.id), ts=projectTasks(p.id), pending=state.proposals.filter(x=>x.project_id===p.id&&x.kind==='workmap'&&x.state==='suggested');
  const selected=items.filter(x=>selectedPieces.has(x.id));
  return `<section class="panel"><div class="section-title"><h2>Your project in pieces</h2><button data-new-item="${p.id}" class="mini-button">+ Add a piece</button></div><p class="muted">Choose what to discuss, handle yourself, or delegate. Each piece carries its outcome and dependencies.</p><div class="map-tools"><label>Decomposition method<select id="map-method">${methodOptions()}</select></label><button data-breakdown="${p.id}">Break down project</button></div>${renderProjectJobs(p.id)}${pending.map(x=>`<div class="draft-banner"><strong>Suggested work map</strong><button data-proposal="${x.id}">Review & edit →</button></div>`).join('')}${!items.length?'<div class="empty-state"><h3>Start with a manageable breakdown.</h3><p>Review a CoS proposal or add your own work pieces.</p></div>':''}<div class="work-map">${items.map(item=>{
    const deps=item.depends_on.map(id=>state.work_items.find(x=>x.id===id)), blocked=deps.some(x=>x.status!=='done');
    const assignment=ts.find(t=>t.work_item_id===item.id&&['queued','running','stopping'].includes(t.state));
    const draft=state.plans.find(plan=>plan.project_id===p.id&&['draft','approved'].includes(plan.state)&&plan.specs.some(s=>s.work_item_id===item.id));
    const eligible=!assignment&&!['done','deferred'].includes(item.status);
    return `<article class="work-piece ${item.status==='done'?'complete':''}"><div class="row"><span class="eyebrow">${esc(item.kind)}</span><span class="pill">${assignment?esc(stateName(assignment.state)):esc(stateName(item.status))}</span></div><h3><button data-item="${item.id}" class="text-button">${esc(item.title)}</button></h3><p>${esc(item.outcome)}</p><div class="piece-recommendation">${esc(item.recommendation)}</div>${deps.length?`<div class="dependency-list"><small>Depends on</small>${deps.map(x=>`<button class="dependency ${x.status==='done'?'resolved':''}" data-item="${x.id}">${x.status==='done'?'✓':'○'} ${esc(x.title)}</button>`).join('')}</div>`:''}<div class="owner-label">${assignment?'Delegated assignment':item.owner==='me'?'You’re handling this':item.owner==='cos'?'Discussing with CoS':'Ownership not yet chosen'}</div>${assignment?`<button data-task="${assignment.id}">View assignment →</button>`:draft?`<button data-plan="${draft.id}">Review prepared assignment →</button>`:`<div class="piece-actions"><button data-discuss-item="${item.id}" class="mini-button">Discuss with CoS</button><button data-own-item="${item.id}" class="mini-button">I’ll handle this</button><button data-item="${item.id}" class="mini-button">Edit</button></div>`}<label class="delegation-choice"><input type="checkbox" data-select-piece="${item.id}" ${selectedPieces.has(item.id)?'checked':''} ${eligible?'':'disabled'}>Select for delegation</label>${!eligible?`<small>${assignment?'Stop the current assignment first':'Reopen this piece to delegate it'}</small>`:''}</article>`;
  }).join('')}</div></section><div class="delegation-tray"><div><strong>${selected.length} piece${selected.length===1?'':'s'} selected</strong><small>You’ll review the assignment briefs before approving and launching.</small></div><button id="prepare-delegation" class="primary" ${!selected.length?'disabled':''}>Prepare selected assignments →</button></div>`;
}

function resultsHTML(p) {
  const tasks=projectTasks(p.id);
  return `<section class="panel"><h2>Results & agent activity</h2>${tasks.map(t=>`<div class="review-row"><div><div class="row"><h3>${esc(t.title)}</h3><span class="pill">${esc(stateName(t.state))}</span></div>${taskFeedbackHTML(t,true)}${t.result?.next_steps?.[0]?`<p class="section-note">Suggested next step: ${esc(t.result.next_steps[0])}</p>`:''}</div><button data-task="${t.id}" class="${t.state==='ready_for_review'?'primary':''}">${t.state==='ready_for_review'?'Review result':t.result?'Review returned work':'View assignment'} →</button></div>`).join('')||'<p class="muted">Your agent task appears here after approval and launch.</p>'}</section>`;
}

function contextHTML(p) {
  return `<section class="panel"><h2>Approved decisions & knowledge</h2>${p.records.filter(r=>['approved','answered'].includes(r.status)).map(recordHTML).join('')||'<p class="muted">Your approved decisions and answered questions will stay here.</p>'}</section><section class="panel"><div class="section-title"><h2>Questions & proposals</h2><button data-add-record="${p.id}" class="mini-button">+ Add</button></div>${p.records.filter(r=>['suggested','open'].includes(r.status)).map(recordHTML).join('')||'<p class="muted">No unresolved records.</p>'}<button data-view="briefings">Resolve as a batch →</button></section><section class="panel"><h2>Accepted results</h2>${p.accepted_results.map(r=>`<div class="record"><button data-task="${r.task_id}" class="text-button">${esc(r.title)}</button>${paragraph(r.summary)}<small>${esc(r.provenance)} · ${esc(date(r.accepted_at))}</small></div>`).join('')||'<p class="muted">Results become accepted through your review.</p>'}</section><section class="panel"><h2>Useful findings from partial results</h2>${state.findings.filter(x=>x.project_id===p.id).map(x=>`<div class="record">${paragraph(x.text)}<button data-task="${x.task_id}" class="mini-button">Source result</button><small>${esc(date(x.created))} · ${esc(x.source)}</small></div>`).join('')||'<p class="muted">Record useful parts during review while keeping remaining work open.</p>'}</section><section class="panel"><h3>Files & references</h3>${paragraph(p.demo_directory?'Working folder can be chosen when you prepare real assignments.':p.cwd)}${p.file_refs.map(x=>`<span class="pill">${esc(x)}</span>`).join('')}${savedReferencesHTML(p)}<button data-edit-project="${p.id}" class="mini-button">Choose references</button> <button data-daily="${p.id}" class="mini-button">Import a daily log</button></section>`;
}

function proposalModal(id) {
  const proposal=state.proposals.find(x=>x.id===id), p=state.projects.find(x=>x.id===proposal?.project_id);if(!proposal||!p)return;
  const d=proposal.data, stale=p.version!==proposal.based_on_version;
  const body=proposal.kind==='conversation'?`${['interpretation','milestone','success','constraints','next_step'].map(key=>`<label>${esc(({interpretation:'CoS interpretation',milestone:'First milestone',success:'Evidence of success',constraints:'Constraints',next_step:'Suggested next step'})[key])}<textarea name="${key}">${esc(d[key])}</textarea></label>`).join('')}<label>Open questions · one per line<textarea name="questions">${esc(d.questions.join('\n'))}</textarea></label>`:d.items.map((item,i)=>`<section class="plan-task" data-proposed-piece="${i}"><div class="row"><h3>${i+1}. ${esc(item.title)}</h3><button type="button" data-remove-proposed-piece class="mini-button">Remove piece</button></div><p>${esc(item.outcome)}</p><details><summary>Edit scope, criteria and dependencies</summary><label>Title<input name="title" value="${esc(item.title)}" required></label><label>Purpose<textarea name="purpose" required>${esc(item.purpose)}</textarea></label><label>Expected outcome<textarea name="outcome" required>${esc(item.outcome)}</textarea></label><div class="form-grid"><label>Kind<select name="kind">${['decision','investigation','discussion','implementation','validation','future'].map(v=>`<option value="${v}" ${item.kind===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Suggested approach<input name="recommendation" value="${esc(item.recommendation)}" required></label></div><label>Completion criteria · one per line<textarea name="criteria" required>${esc(item.criteria.join('\n'))}</textarea></label><div class="context-label">DEPENDS ON</div>${d.items.filter(x=>x.key!==item.key).map(x=>`<label class="checkbox-label"><input type="checkbox" data-proposal-dependency value="${esc(x.key)}" ${item.depends_on.includes(x.key)?'checked':''}>${esc(x.title)}</label>`).join('')}</details></section>`).join('');
  modal(proposal.kind==='conversation'?'Agree on the project framing':'Review the proposed work map','YOUR DIRECTION, YOUR DECISION',`<p>${esc(d.summary)}</p><p class="muted">${esc(proposal.basis)}</p>${stale?'<div class="help warning">The project changed after this proposal was prepared. Request a fresh proposal before adopting it.</div>':''}<form id="proposal-form" data-id="${id}">${body}<div class="actions"><button type="submit" class="primary" ${stale||proposal.state!=='suggested'?'disabled':''}>${proposal.kind==='conversation'?'Use this framing':'Add these work pieces'}</button><button type="button" data-dismiss-proposal="${id}">Dismiss proposal</button></div><small>Adopting this proposal updates the project record. Delegation is a separate choice.</small></form>`,'proposal',id);
}

function itemModal(id,pid) {
  const item=state.work_items.find(x=>x.id===id)||{project_id:pid,kind:'investigation',owner:'unassigned',status:'open',criteria:[],depends_on:[]};
  const others=projectItems(item.project_id).filter(x=>x.id!==id);
  modal(id?'Work piece: '+item.title:'Add a work piece','PART OF YOUR PROJECT',`<form id="item-form" data-id="${esc(id||'')}" data-project-id="${item.project_id}"><label>Title<input name="title" value="${esc(item.title||'')}" required></label><label>Purpose<textarea name="purpose" required>${esc(item.purpose||'')}</textarea></label><label>Expected outcome<textarea name="outcome" required>${esc(item.outcome||'')}</textarea></label><label>Completion criteria · one per line<textarea name="criteria" required>${esc(item.criteria.join('\n'))}</textarea></label><div class="form-grid"><label>Kind<select name="kind">${['decision','investigation','discussion','implementation','validation','future'].map(v=>`<option value="${v}" ${item.kind===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Ownership<select name="owner">${[['unassigned','Not yet chosen'],['me','I’ll handle this'],['cos','Discuss with CoS']].map(([v,label])=>`<option value="${v}" ${item.owner===v?'selected':''}>${label}</option>`).join('')}</select></label><label>Status<select name="status">${['open','doing','done','deferred'].map(v=>`<option value="${v}" ${item.status===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Suggested approach<input name="recommendation" value="${esc(item.recommendation||'')}"></label></div><div class="context-label">DEPENDS ON</div>${others.map(x=>`<label class="checkbox-label"><input type="checkbox" data-item-dependency value="${x.id}" ${item.depends_on.includes(x.id)?'checked':''}>${esc(x.title)}</label>`).join('')||'<p class="muted">No other pieces yet.</p>'}<label>Completion evidence or note <span class="muted">· required when marking done</span><textarea name="completion_note">${esc(item.completion_note||'')}</textarea></label><button type="submit" class="primary">Save work piece</button></form>`,'item',id);
}

const originalTaskModal=taskModal;
taskModal=function(id) {
  const same=currentModal?.type==='task'&&currentModal.id===id;
  const expanded=same?[...document.querySelectorAll('#modal-content details[open]')].map(el=>el.querySelector('summary')?.textContent):[];
  const scroll=same?$('#modal').scrollTop:0;
  originalTaskModal(id);
  const t=state.tasks.find(x=>x.id===id), p=state.projects.find(x=>x.id===t?.project_id);if(!t)return;
  const target=$('#modal-content');
  const direction=x=>JSON.stringify({vision:x.vision||x.goal,brief:x.brief||{},cwd:x.cwd,file_refs:x.file_refs,reference_files:x.reference_files||[],approved:x.records.filter(r=>['approved','answered'].includes(r.status))});
  if(p&&direction(p)!==direction(t.context))target.insertAdjacentHTML('afterbegin','<div class="help warning">Project direction or approved knowledge changed since this assignment was approved. Assess this result against the original assignment and your current direction.</div>');
  if(t.work_item_id)target.insertAdjacentHTML('afterbegin',`<div class="result-project-link"><button data-open-project="${t.project_id}" class="text-button">${esc(projectName(t.project_id))}</button> → ${esc(itemTitle(t.work_item_id))}</div>`);
  if(t.state==='accepted'&&t.review_note)target.insertAdjacentHTML('beforeend',`<section class="review-judgment"><h3>Your acceptance note</h3>${paragraph(t.review_note)}<small>${esc(date(t.accepted_at))}</small></section>`);
  const modelReview=target.querySelector('[data-task-review="codex"]');if(modelReview&&state.config.mode!=='codex'){modelReview.disabled=true;modelReview.title='Configure Codex mode in Settings for a model-backed review';}
  const accept=target.querySelector('[data-task-action="accept"]');
  if(accept)accept.closest('.actions').insertAdjacentHTML('beforebegin',`<section class="review-judgment"><h3>Your review</h3><p class="muted">Check the original criteria against the output snapshots. Local checks confirm file integrity; you assess the substance.</p><label>Review note or useful findings<textarea id="review-note" placeholder="What meets the criteria? What is missing? What should we retain?">${esc(t.review_note||'')}</textarea></label>${t.work_item_id?'<label class="checkbox-label"><input type="checkbox" id="complete-item">This result also completes the linked work piece</label>':''}<div class="actions"><button data-partial-result="${id}">Record useful parts</button><button data-review-later>Review later</button></div></section>`);
  restoreTaskReviewDraft(id);
  document.querySelectorAll('#modal-content details').forEach(el=>{el.open=expanded.includes(el.querySelector('summary')?.textContent);});
  $('#modal').scrollTop=scroll;
};

document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  try {
    if(b.dataset.openProject){if($('#modal').open)closeModal();selectedProject=b.dataset.openProject;projectTab='conversation';setView('project');}
    else if(b.hasAttribute('data-enter-delegation')){projectTab='assignment';render();}
    else if(b.hasAttribute('data-back-conversation')){projectTab='conversation';render();}
    else if(b.dataset.projectTab){projectTab=b.dataset.projectTab;render();}
    else if(b.dataset.focusProject){await api('portfolio',{focus_project:b.dataset.focusProject});selectedProject=b.dataset.focusProject;projectTab='conversation';setView('project');if(['review','activity'].includes(b.dataset.focusAction))taskModal(b.dataset.focusId);else if(b.dataset.focusAction==='piece'){projectTab='work';render();itemModal(b.dataset.focusId);}else if(b.dataset.focusAction==='decision')setView('briefings');}
    else if(b.hasAttribute('data-focus-advice')){b.disabled=true;await api('focus-advice');render();toast('Codex focus advice requested. Your focus and delegation remain your choices.');}
    else if(b.dataset.projectReview){b.disabled=true;await api('project-review',{project_id:b.dataset.projectReview});render();toast('Your CoS will review the project context.');}
    else if(b.dataset.cancelProjectReview){b.disabled=true;await api('cancel-project-review',{project_id:b.dataset.cancelProjectReview});render();toast('Project review cancelled.');}
    else if(b.hasAttribute('data-mark-seen')){await api('portfolio',{mark_seen:true});render();toast('Briefing marked reviewed.');}
    else if(b.dataset.breakdown){b.disabled=true;const r=await api('breakdown',{project_id:b.dataset.breakdown,method:$('#map-method')?.value||$('#cos-method')?.value||cosMethod});if(r.data)proposalModal(r.id);else{render();toast('CoS decomposition requested. The proposal will appear when it returns.');}}
    else if(b.dataset.projectAssignment){b.disabled=true;const r=await api('project-assignment',{project_id:b.dataset.projectAssignment,method:cosMethod});if(r.specs)planModal(r.id);else{render();toast('CoS is preparing one agent task. Review the brief when it returns.');}}
    else if(b.dataset.proposal)proposalModal(b.dataset.proposal);
    else if(b.dataset.dismissProposal){await api('proposal',{id:b.dataset.dismissProposal,action:'dismiss'});closeModal();}
    else if(b.hasAttribute('data-remove-proposed-piece'))b.closest('[data-proposed-piece]').remove();
    else if(b.dataset.item)itemModal(b.dataset.item);
    else if(b.dataset.newItem)itemModal(null,b.dataset.newItem);
    else if(b.dataset.ownItem||b.dataset.discussItem){const item=state.work_items.find(x=>x.id===(b.dataset.ownItem||b.dataset.discussItem));await api('work-item',{...item,owner:b.dataset.ownItem?'me':'cos'});if(b.dataset.discussItem){projectTab='conversation';render();$('#conversation-form textarea').value='Let’s work through this piece: '+item.title+'\nExpected outcome: '+item.outcome;$('#conversation-form').dataset.dirty='true';$('#conversation-form textarea').focus();}else{render();toast('Marked as your work.');}}
    else if(b.id==='prepare-delegation'){b.disabled=true;const ids=projectItems(selectedProject).filter(x=>selectedPieces.has(x.id)).map(x=>x.id);const plan=await api('delegate',{project_id:selectedProject,item_ids:ids});ids.forEach(id=>selectedPieces.delete(id));planModal(plan.id);}
    else if(b.dataset.partialResult){await api('partial',{id:b.dataset.partialResult,note:$('#review-note').value});taskModal(b.dataset.partialResult);toast('Useful findings saved. The full result remains open for review.');}
    else if(b.hasAttribute('data-review-later')){closeModal();toast('Result remains in your review inbox.');}
  }catch(error){toast(error.message,true);}finally{if(b.isConnected)b.disabled=false;}
});

document.addEventListener('submit',async e=>{
  const form=e.target;if(!['conversation-form','proposal-form','item-form'].includes(form.id))return;
  e.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
  try {
    const raw=Object.fromEntries(new FormData(form));
    if(form.id==='conversation-form'){cosMethod=raw.method;await sendConversation(form,raw);}
    else if(form.id==='proposal-form'){
      const proposal=state.proposals.find(x=>x.id===form.dataset.id);let data;
      if(proposal.kind==='conversation')data={...proposal.data,...raw,questions:lines(raw.questions)};
      else {const rows=[...form.querySelectorAll('[data-proposed-piece]')],keys=new Set(rows.map(el=>proposal.data.items[Number(el.dataset.proposedPiece)].key));data={summary:proposal.data.summary,items:rows.map(el=>{const old=proposal.data.items[Number(el.dataset.proposedPiece)];const value=name=>el.querySelector('[name="'+name+'"]').value;return {key:old.key,title:value('title'),purpose:value('purpose'),outcome:value('outcome'),kind:value('kind'),recommendation:value('recommendation'),criteria:lines(value('criteria')),depends_on:[...el.querySelectorAll('[data-proposal-dependency]:checked')].map(x=>x.value).filter(x=>keys.has(x))};})};}
      await api('proposal',{id:proposal.id,action:'adopt',data});projectTab=proposal.kind==='workmap'?'work':'conversation';closeModal();toast(proposal.kind==='workmap'?'Work pieces added. Choose what to delegate.':'Project framing agreed.');
    }else if(form.id==='item-form'){await api('work-item',{...raw,id:form.dataset.id||undefined,project_id:form.dataset.projectId,criteria:lines(raw.criteria),depends_on:[...form.querySelectorAll('[data-item-dependency]:checked')].map(x=>x.value)});closeModal();toast('Work piece saved.');}
  }catch(error){toast(error.message,true);}finally{if(form.id==='conversation-form')syncConversationFeedback();else if(button.isConnected)button.disabled=false;}
});

document.addEventListener('change',async e=>{
  const el=e.target;
  if(el.dataset.selectPiece){if(el.checked)selectedPieces.add(el.dataset.selectPiece);else selectedPieces.delete(el.dataset.selectPiece);render();}
  if(['cos-method','map-method'].includes(el.id)){cosMethod=el.value;const label=$('.connection-label');if(label)label.textContent=cosMethod==='codex'?'Codex CoS':'Local guidance · not AI';syncConversationFeedback();}
  if(el.id==='focus-time'){try{await api('portfolio',{minutes:Number(el.value)});render();}catch(error){toast(error.message,true);}}
  if(el.id==='vision-docx'){
    const file=el.files[0];if(!file)return;
    try{if(file.size>8*1024*1024)throw new Error('Choose a DOCX smaller than 8 MiB.');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const result=await api('import',{filename:file.name,base64:btoa(binary)});$('#project-form [name=vision]').value=result.text;$('#vision-source').textContent=result.source;$('#vision-source-value').value=result.source;toast('Text imported. Review your vision before creating the project.');}catch(error){toast(error.message,true);}
  }
});
document.addEventListener('input',e=>{const form=e.target.closest('form');if(form)form.dataset.dirty='true';if(form?.id==='conversation-form'&&e.target.name==='text')conversationDrafts.set(form.dataset.projectId,e.target.value);if(e.target.closest('#modal-content'))$('#modal-content').dataset.dirty='true';if(form?.id==='conversation-form')syncConversationFeedback();});

function initializeWorkspace(){return refresh(false).then(()=>{
  cosMethod=state.config.mode==='codex'?'codex':'local';
  const route=location.hash.slice(1).split('/');
  if(['task','record','plan'].includes(route[0])&&typeof openOwnerRequestRoute==='function'){openOwnerRequestRoute();}
  else if(route[0]==='project'&&state.projects.some(p=>p.id===route[1])){selectedProject=route[1];setView('project');}
  else setView(['live','home','projects','review','board','results','briefings','settings'].includes(route[0])?route[0]:'live');
  if(typeof openOwnerRequestRoute==='function')openOwnerRequestRoute();
}).catch(error=>{$('#notice').textContent=error.message;$('#notice').hidden=false;});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initializeWorkspace,{once:true});else initializeWorkspace();
setInterval(async()=>{try{await refresh();$('#notice').hidden=true;}catch(error){if(lunarScene)lunarScene.disconnect(error.message);$('#notice').textContent=error.message;$('#notice').hidden=false;}},2500);
