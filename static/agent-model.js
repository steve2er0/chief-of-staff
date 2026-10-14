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
  function conversationRuns(tasks,task){
    const runs=turns(tasks,task).filter(t=>(Date.parse(t.created)||0)<=(Date.parse(task.created)||Infinity))
      .sort((a,b)=>(Date.parse(a.created)||0)-(Date.parse(b.created)||0));
    if(!runs.some(t=>t.id===task.id))runs.push(task);
    const groups=new Map(runs.map(t=>[t.id,{task:t,messages:[]}]));
    for(const message of task.conversation||[]){
      let owner=groups.has(message.task_id)?message.task_id:null;
      if(!owner){
        const at=Date.parse(message.at)||0;
        owner=(runs.filter(t=>(Date.parse(t.created)||0)<=at).at(-1)||runs[0]).id;
        // A queued follow-up may be recorded just before its new run is created.
        if(message.role==='user')for(const run of runs){
          const parent=tasks.find(t=>t.id===run.parent_task_id),finished=Date.parse(parent?.finished_at);
          if(run.continuation_note&&message.text&&run.continuation_note.includes(message.text)&&at>=finished&&at<=(Date.parse(run.created)||0))owner=run.id;
        }
      }
      groups.get(owner).messages.push(message);
    }
    return [...groups.values()];
  }
  function resultView(task){
    if(!task.result)return task;
    const result=task.result,files=task.expected_outputs?.length||result.artifacts?.length||(task.output_links||[]).some(x=>x.source_path);
    const ready=result.status==='completed'||['ready_for_review','accepted'].includes(task.prior_state||task.state);
    if(files||!ready)return task;
    const legacy='No project files could be captured for this editable assignment. Supply the deliverables or correct their paths before review.';
    const clean=issues=>(issues||[]).filter(x=>x!==legacy);
    const view={...task,result:{...result,delivery_kind:'reply',handoff_issues:clean(result.handoff_issues)},handoff_issues:clean(task.handoff_issues),snapshot_limits:clean(task.snapshot_limits)};
    if(!view.handoff_issues.length&&!view.snapshot_limits.length&&!view.result.handoff_issues.length)view.delivery_status='complete';
    return view;
  }
  const api={identity,title,pending,current,status,results,turns,conversationRuns,resultView};root.AgentModel=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
