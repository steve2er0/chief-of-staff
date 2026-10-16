'use strict';

let attentionFilter='all';
const attentionLabels={approvals:'Approvals',handoffs:'Handoffs',reviews:'Reviews'};
function attentionRows(items) {
  return items.map(item=>{
    const record=item.kind==='record'?state.projects.find(p=>p.id===item.project_id)?.records?.find(r=>r.id===item.target_id):null;
    const task=(state.tasks||[]).find(t=>t.id===(item.kind==='task'?item.target_id:record?.user_request_task_id));
    return `<article class="attention-row"><div><div class="eyebrow">${esc(item.project)} · ${esc(attentionLabels[item.group])}</div><h3>${esc(item.title)}</h3><p>${esc(shortTaskText(item.reason,450))}</p><small class="muted">${esc(date(item.updated))}</small>${task?`<p class="attention-conversation"><button class="text-button" data-task="${esc(task.id)}">Open conversation →</button></p>`:''}</div><button data-attention="${esc(item.id)}" class="${item.group==='reviews'?'primary':'mini-button'}">${esc(item.action)} →</button></article>`;
  }).join('');
}
function attentionPanelHTML(limit=4,projectId='') {
  const items=(state.attention||[]).filter(item=>!projectId||item.project_id===projectId);
  return `<section class="panel attention-panel"><div class="section-title"><h2>Needs you</h2><span class="pill">${items.length}</span></div>${items.length?attentionRows(items.slice(0,limit)):'<p class="muted">No approvals, handoffs or results are waiting on you.</p>'}<button data-view="review" class="mini-button">Open attention queue →</button></section>`;
}
renderReview=function() {
  const items=state.attention||[], visible=items.filter(item=>attentionFilter==='all'||item.group===attentionFilter);
  const linked=typeof attentionCoveredAgents==='function'?attentionCoveredAgents(items):new Set(items.filter(item=>item.kind==='task').map(item=>item.target_id)),extra=typeof statusAgents==='function'?statusAgents('needs').filter(task=>!linked.has(task.id)):[];
  return `<section class="panel"><div class="section-title"><h2>Your attention queue</h2><span class="pill">${items.length+extra.length} waiting</span></div><p class="muted">Review the request, make your decision, then choose when work starts or continues.</p><div class="attention-filters" role="group" aria-label="Filter attention queue">${[['all','All'],...Object.entries(attentionLabels)].map(([key,label])=>`<button class="mini-button" data-attention-filter="${key}" aria-pressed="${attentionFilter===key}">${label} · ${key==='all'?items.length+extra.length:items.filter(item=>item.group===key).length}</button>`).join('')}</div>${attentionRows(visible)}${attentionFilter==='all'&&extra.length?statusAgentRows(extra):''}${!visible.length&&!(attentionFilter==='all'&&extra.length)?'<div class="empty-state"><h3>Nothing waiting here.</h3><p>New approvals, handoffs and reviews arrive in this queue.</p></div>':''}</section>`;
};

function resumeWorkHTML(task) {
  if(!['ready_for_review','failed','blocked','paused','cancelled','interrupted'].includes(task.state))return '';
  const captured=task.config.mode==='codex'&&task.session_id,ready=task.state==='ready_for_review';
  const body=`<label>${ready?'Changes you want':'Next instructions'}<textarea id="revision-note" rows="3" placeholder="What should the agent do next?"></textarea></label>${task.recovery_lock?'<label><input type="checkbox" id="confirm-stopped"> The previous worker and its tools have stopped.</label>':''}<details><summary>Session options</summary><p>${captured?'Continue the captured session with the saved files.':'Continue with the saved files and project context.'}</p><label><input type="checkbox" id="fresh-session" ${captured?'':'checked'}> Start a fresh CLI session</label></details><div class="actions"><button data-task-action="${ready?'revise':'resume'}" class="${ready?'':'primary'}">${ready?'Prepare changes →':'Continue saved work →'}</button></div>`;
  return ready?`<details class="resume-work"><summary>Ask the agent for changes</summary>${body}</details>`:`<section class="resume-work"><h3>Continue the saved work</h3>${body}</section>`;
}
function attentionRecordModal(item) {
  const record=state.projects.find(p=>p.id===item.project_id)?.records?.find(r=>r.id===item.target_id);if(!record)return;
  const question=record.category==='question', linked=!!record.user_request_task_id;
  modal(question?'Answer the handoff':'Review a proposed decision',item.project,`<p class="prose">${esc(record.text)}</p><p class="muted">${esc(record.provenance)}</p><form id="attention-record-form" data-project-id="${esc(item.project_id)}" data-record-id="${esc(record.id)}" data-agent-linked="${linked}">${question?'<label>Your answer<textarea name="answer" required rows="4"></textarea></label>':'<label>Your decision<select name="action"><option value="approve">Approve</option><option value="reject">Reject</option></select></label>'}<p class="section-note">${linked?'Your response is saved and sent to the agent. Its existing execution permissions stay in effect.':'This saves your project context.'}</p><button type="submit" class="primary">${linked?'Reply & continue':question?'Save answer':'Record decision'}</button></form>`,'attention-record',record.id);
}
document.addEventListener('input',event=>{if(event.target.closest('#attention-record-form'))$('#modal-content').dataset.dirty='true';});
document.addEventListener('click',event=>{
  const filter=event.target.closest('[data-attention-filter]');if(filter){attentionFilter=filter.dataset.attentionFilter;render();return;}
  const button=event.target.closest('[data-attention]');if(!button)return;
  const item=(state.attention||[]).find(x=>x.id===button.dataset.attention);if(!item)return;
  if(item.kind==='plan')planModal(item.target_id);
  else if(item.kind==='task')taskModal(item.target_id);
  else if(item.kind==='record')attentionRecordModal(item);
  else if(item.kind==='job'){
    const job=state.jobs.find(j=>j.id===item.target_id);if(!job)return;
    modal('CoS call needs attention',item.project,`<p class="prose">${esc(job.progress)}</p>${job.recovery_lock?`<p>Confirm the previous process stopped before releasing its lock.</p><button data-stop-job="${esc(job.id)}">Confirm stopped & unlock</button>`:`<button data-stop-job="${esc(job.id)}">Dismiss this call</button>`}<button data-open-project="${esc(item.project_id)}">Open project to continue →</button>`,'attention-job',job.id);
  }
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(form.id!=='attention-record-form')return;event.preventDefault();
  const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
  try{
    const data=new FormData(form),response={project_id:form.dataset.projectId,record_id:form.dataset.recordId,action:data.get('action')||'answer',answer:data.get('answer')||''};form.dataset.responseUuid||=crypto.randomUUID();const result=form.dataset.agentLinked==='true'?await api('answer-and-continue',response,form.dataset.responseUuid):await api('resolve',{items:[response]},form.dataset.responseUuid);
    closeModal();render();toast(form.dataset.agentLinked==='true'?'Response sent; the agent continues with its existing permissions.':'Saved to project context.');
  }catch(error){toast(error.message,true);}finally{if(button.isConnected)button.disabled=false;}
});

/* Exact owner requests, safe read-only deep links to existing CoS controls. */
function ownerRequestsHTML(task){
 const a=task.owner_attention;if(!a||a.state!=='needs_user'||!a.items?.length)return '';
 return `<section class="help warning owner-requests"><h3>Explicit requests for you</h3>${a.items.map(r=>`<article><strong>${esc(r.kind==='approval'?'Owner approval decision':r.kind==='question'?'Question':'Decision')}</strong><p class="prose">${esc(r.text)}</p>${r.answered?`<p class="muted">Owner response saved: ${esc(r.response_status)}.</p>`:r.record_id?`<button class="mini-button" data-owner-record="${esc(r.record_id)}" data-owner-project="${esc(task.project_id)}">Reply to agent →</button>`:'<p class="muted">Legacy handoff: use the continuation note below when the worker has stopped.</p>'}</article>`).join('')}<p class="section-note">Replying continues the agent with its existing folder and permissions. Tool permission requests appear separately.</p>${a.warning?`<p class="muted">${esc(a.warning)}</p>`:''}</section>`;
}
document.addEventListener('click',event=>{
 const b=event.target.closest('[data-owner-record]');if(!b)return;
 const p=state.projects.find(p=>p.id===b.dataset.ownerProject),r=p?.records.find(r=>r.id===b.dataset.ownerRecord);if(!r)return;
 attentionRecordModal({project_id:p.id,target_id:r.id,project:p.name});
});
let openedOwnerRoute='';
function openOwnerRequestRoute(){
 if(!state||openedOwnerRoute===location.hash)return;
 let route;try{route=location.hash.slice(1).split('/').map(decodeURIComponent);}catch{return;}
 if(!['task','record','plan'].includes(route[0]))return;
 if($('#modal-content')?.dataset.dirty)return;
 if(route[0]==='task'&&state.tasks.some(t=>t.id===route[1])){openedOwnerRoute=location.hash;setView('review');taskModal(route[1]);}
 else if(route[0]==='plan'&&state.plans.some(p=>p.id===route[1])){openedOwnerRoute=location.hash;setView('review');planModal(route[1]);}
 else if(route[0]==='record'){
  const p=state.projects.find(p=>p.id===route[1]),r=p?.records.find(r=>r.id===route[2]);
  if(r&&['open','suggested'].includes(r.status)){openedOwnerRoute=location.hash;setView('review');attentionRecordModal({project_id:p.id,target_id:r.id,project:p.name});}
 }
}
if(typeof window!=='undefined')window.addEventListener('hashchange',()=>{openedOwnerRoute='';openOwnerRequestRoute();});
document.addEventListener('DOMContentLoaded',openOwnerRequestRoute);
