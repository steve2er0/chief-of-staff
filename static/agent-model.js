/* Shared, immutable projection of agent identities and returned turns. */
(function(root){
  'use strict';
  const identity=task=>task.agent_id||task.id;
  // Display labels never change the saved title or the agent's instructions.
  function title(task,limit=56){
    const value=String(task.title||task.name||'Agent').replace(/\s+/g,' ').trim()
      .split(/\.\s+/)[0].replace(/^(?:please\s+|check that (?:the\s+)?|I want you to\s+)/i,'');
    if(value.length<=limit)return value;
    const clipped=value.slice(0,limit-1).replace(/\s+\S*$/,'').trimEnd();
    return (clipped||value.slice(0,limit-1))+'…';
  }
  const pending=task=>task.state==='running'?(task.live_requests||[]).filter(r=>['pending','sending'].includes(r.status)):[];
  function current(tasks,projectId=''){
    const parents=new Set(tasks.map(t=>t.parent_task_id).filter(Boolean)),latest=new Map();
    for(const task of tasks){
      const key=identity(task);if(!latest.has(key))latest.set(key,null);
      if(task.state==='superseded'||parents.has(task.id))continue;
      const prior=latest.get(key);
      if(!prior||(Date.parse(task.created)||0)>=(Date.parse(prior.created)||0))latest.set(key,task);
    }
    return [...latest.values()].filter(t=>t&&(!projectId||t.project_id===projectId));
  }
  function status(task){
    if(task.state==='queued'&&['pending','preparing'].includes(task.workspace_preparation))return 'Preparing';
    if(pending(task).length)return 'Waiting for you';
    const owner=task.owner_attention||task.user_requests;
    if(!['superseded','accepted','cancelled'].includes(task.state)&&owner?.state==='needs_user'&&owner.items?.length)return owner.items.every(i=>i.answered)?'Response saved · awaiting agent':'Waiting for you';
    return ({ready_for_review:'Finished',accepted:'Finished · accepted',completed:'Finished',queued:'Queued',running:'Working',paused:'Paused',cancelled:'Stopped',interrupted:'Interrupted',blocked:'Needs your reply',failed:'Run failed',stopping:'Stopping',superseded:'Earlier turn'})[task.state]||String(task.state||'Unknown').replaceAll('_',' ');
  }
  function results(tasks,projectId=''){
    return tasks.filter(t=>t.result&&(!projectId||t.project_id===projectId)).sort((a,b)=>(Date.parse(b.finished_at||b.updated)||0)-(Date.parse(a.finished_at||a.updated)||0));
  }
  function turns(tasks,task){return tasks.filter(t=>identity(t)===identity(task));}
  const api={identity,title,pending,current,status,results,turns};root.AgentModel=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
