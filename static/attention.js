'use strict';

let attentionFilter='all';
const attentionLabels={approvals:'Approvals',handoffs:'Handoffs',reviews:'Reviews'};
function attentionRows(items) {
  return items.map(item=>`<article class="attention-row"><div><div class="eyebrow">${esc(item.project)} · ${esc(attentionLabels[item.group])}</div><h3>${esc(item.title)}</h3><p>${esc(shortTaskText(item.reason,450))}</p><small class="muted">${esc(date(item.updated))}</small></div><button data-attention="${esc(item.id)}" class="${item.group==='reviews'?'primary':'mini-button'}">${esc(item.action)} →</button></article>`).join('');
}
function attentionPanelHTML(limit=4,projectId='') {
  const items=(state.attention||[]).filter(item=>!projectId||item.project_id===projectId);
  return `<section class="panel attention-panel"><div class="section-title"><h2>Needs you</h2><span class="pill">${items.length}</span></div>${items.length?attentionRows(items.slice(0,limit)):'<p class="muted">No approvals, handoffs or results are waiting on you.</p>'}<button data-view="review" class="mini-button">Open attention queue →</button></section>`;
}
renderReview=function() {
  const items=state.attention||[], visible=items.filter(item=>attentionFilter==='all'||item.group===attentionFilter);
  return `<section class="panel"><div class="section-title"><h2>Your attention queue</h2><span class="pill">${items.length} waiting</span></div><p class="muted">Review the request, make your decision, then choose when work starts or continues.</p><div class="attention-filters" role="group" aria-label="Filter attention queue">${[['all','All'],...Object.entries(attentionLabels)].map(([key,label])=>`<button class="mini-button" data-attention-filter="${key}" aria-pressed="${attentionFilter===key}">${label} · ${items.filter(item=>key==='all'||item.group===key).length}</button>`).join('')}</div>${attentionRows(visible)||'<div class="empty-state"><h3>Nothing waiting here.</h3><p>New approvals, handoffs and reviews arrive in this queue.</p></div>'}</section>`;
};

function resumeWorkHTML(task) {
  if(!['ready_for_review','failed','blocked','paused','cancelled','interrupted'].includes(task.state))return '';
  const c=state.config, same=['mode','model','executable','entrypoint'].every(key=>task.config[key]===c[key])&&task.context.cwd===state.projects.find(p=>p.id===task.project_id)?.cwd;
  const captured=!!task.session_id&&same&&c.mode==='codex'&&state.capabilities?.resume!==false;
  return `<section class="plan-task resume-work"><h3>${task.state==='ready_for_review'?'Request a revision':'Continue the saved work'}</h3><p>${captured?'The continuation will use this assignment’s captured CLI session.':'The saved files and project context remain available. A fresh session will be used.'}</p>${task.recovery_lock?'<div class="help warning">Confirm cleanup of the previous worker before continuing.</div><label><input type="checkbox" id="confirm-stopped"> I have confirmed the old worker and its child processes are stopped.</label>':''}<label>Handoff note or next instructions<textarea id="revision-note" rows="4" placeholder="What did you check, approve or change? What should the agent do next?"></textarea></label><p class="section-note">Resume prepares a continuation brief with your note and the previous report. Review its permissions, approve, then launch.</p><label><input type="checkbox" id="fresh-session" ${captured?'':'checked'}> Start a fresh CLI session</label><div class="actions">${task.state!=='ready_for_review'?'<button data-task-action="resume" class="primary">Resume saved work →</button>':''}<button data-task-action="revise">${task.state==='ready_for_review'?'Prepare revision →':'Revise scope instead'}</button></div></section>`;
}
function attentionRecordModal(item) {
  const record=state.projects.find(p=>p.id===item.project_id)?.records.find(r=>r.id===item.target_id);if(!record)return;
  const question=record.category==='question';
  modal(question?'Answer the handoff':'Review a proposed decision',item.project,`<p class="prose">${esc(record.text)}</p><p class="muted">${esc(record.provenance)}</p><form id="attention-record-form" data-project-id="${esc(item.project_id)}" data-record-id="${esc(record.id)}">${question?'<label>Your answer<textarea name="answer" required rows="4"></textarea></label>':'<label>Your decision<select name="action"><option value="approve">Approve</option><option value="reject">Reject</option></select></label>'}<p class="section-note">This records project context for the next approved assignment. It does not change a running agent or grant an external browser permission.</p><button type="submit" class="primary">${question?'Save answer':'Record decision'}</button></form>`,'attention-record',record.id);
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
    const data=new FormData(form);await api('resolve',{items:[{project_id:form.dataset.projectId,record_id:form.dataset.recordId,action:data.get('action')||'answer',answer:data.get('answer')||''}]});
    closeModal();render();toast('Saved to project context. Choose a continuation when the agent is stopped.');
  }catch(error){toast(error.message,true);}finally{if(button.isConnected)button.disabled=false;}
});
