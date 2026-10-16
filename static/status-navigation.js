'use strict';

// Navigation is a projection of saved lifecycle states, never a task mutation.
function statusAgents(kind){
  return currentAgents('').filter(task=>{
    if(kind==='working')return ['queued','running','stopping'].includes(task.state)&&!projectAgentNeedsYou(task);
    if(kind==='finished')return ['ready_for_review','accepted','completed','paused','cancelled'].includes(task.state)&&!projectAgentNeedsYou(task);
    return projectAgentNeedsYou(task);
  });
}
function statusAgentRows(tasks){
  return tasks.map(task=>`<article class="status-agent-row"><div><p class="eyebrow">${esc(projectName(task.project_id))}</p><button class="text-button status-agent-title" data-task="${esc(task.id)}">${esc(AgentModel.title(task,72))}</button><p class="project-state">${esc((task.config?.mode==='simulated'?'Simulated · ':'')+projectAgentLabel(task))}</p><p class="status-agent-update">${esc(shortTaskText(task.latest_update||task.progress||task.result?.summary||'',160))}</p></div><button class="mini-button" data-task="${esc(task.id)}">Conversation →</button></article>`).join('');
}
function statusJobs(kind){
  const active=['queued','running','stopping','pending'];
  return (state.jobs||[]).filter(job=>kind==='working'?active.includes(job.state)&&!job.recovery_lock:['completed','cancelled'].includes(job.state)&&!job.recovery_lock);
}
function renderStatusList(kind){
  const tasks=statusAgents(kind),jobs=statusJobs(kind);
  return `<section class="status-list"><p class="muted">${kind==='working'?'Current runs and queued work. Open a conversation to follow up.':'Completed runs and saved stopped or paused conversations. Each row shows its recorded state.'}</p>${statusAgentRows(tasks)}${jobs.map(job=>`<article class="status-agent-row"><div><p class="eyebrow">${esc(projectName(job.project_id))}</p><strong>CoS · ${esc(job.kind||'call')}</strong><p class="project-state">${esc(stateName(job.state))}</p></div><button class="mini-button" data-status-job="${esc(job.id)}">Open call →</button></article>`).join('')}${!tasks.length&&!jobs.length?`<div class="empty-state"><h3>${kind==='working'?'No agents working right now.':'No finished conversations yet.'}</h3></div>`:''}</section>`;
}
function renderWorking(){return renderStatusList('working');}
function renderFinished(){return renderStatusList('finished');}
function projectConversationLinks(project){
  const tasks=currentAgents(project.id);
  return tasks.length?`<div class="project-conversation-links" aria-label="${esc(project.name)} conversations">${tasks.map(task=>`<button class="text-button" data-task="${esc(task.id)}" data-project-focus="conversation:${esc(task.id)}">${esc(AgentModel.title(task,42))}<span>${esc(projectAgentLabel(task))}</span><span class="sr-only"> · Open conversation</span></button>`).join('')}</div>`:'';
}
function attentionCoveredAgents(items=state.attention||[]){
  const ids=new Set(items.filter(item=>item.kind==='task').map(item=>item.target_id));
  for(const item of items.filter(item=>item.kind==='record')){
    const record=state.projects.find(p=>p.id===item.project_id)?.records?.find(r=>r.id===item.target_id);
    if(record?.user_request_task_id)ids.add(record.user_request_task_id);
  }
  return ids;
}
function syncStatusNavigation(){
  const working=$('#working-count'),finished=$('#finished-count');
  if(working)working.textContent=statusAgents('working').length+statusJobs('working').length||'';
  if(finished)finished.textContent=statusAgents('finished').length+statusJobs('finished').length||'';
  const needs=$('#attention-count');
  if(needs){const ids=attentionCoveredAgents();needs.textContent=(state.attention||[]).length+statusAgents('needs').filter(task=>!ids.has(task.id)).length||'';}
}
function lunarReducedMotion(){try{return localStorage.getItem('cos.lunar.reducedMotion')==='true';}catch{return false;}}
document.addEventListener('click',event=>{const button=event.target.closest('[data-status-job]');if(button&&!button.disabled)openCoordinatorPanel(button.dataset.statusJob);});
