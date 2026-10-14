/* Local, conservative prediction. Reports are evidence, never executable instructions. */
(function(root){
  'use strict';
  const text=(value,limit)=>typeof value==='string'&&value.length<=limit&&!/[\u0000-\u001f\u007f]/.test(value.replace(/[\n\r\t]/g,''))?value.trim():'';
  const list=value=>Array.isArray(value)?value:[];
  const unresolved=value=>/\?|\b(?:choose|decide|whether|would you|do you want|let me know|awaiting|needs? your|pending approval|ignore (?:previous|prior)|system prompt)\b/i.test(value);
  const safePath=value=>typeof value==='string'&&value.length<=100&&
    /^(?:[\w-]+\/)*[\w.-]+\.(?:md|txt|csv|json|html|css|js|ts|tsx|jsx|py|svg|png|jpg|pdf|docx|xlsx|pptx)$/i.test(value)&&
    !value.split('/').some(part=>part==='.'||part==='..');

  function context(snapshot,taskId){
    if(!snapshot||snapshot.config?.followup_suggestions===false)return null;
    const tasks=list(snapshot.tasks),task=tasks.find(t=>t.id===taskId);
    if(!task||!['ready_for_review','accepted','completed'].includes(task.state)||task.recovery_lock)return null;
    if(root.AgentModel.current(tasks).find(t=>root.AgentModel.identity(t)===root.AgentModel.identity(task))?.id!==task.id)return null;
    const result=task.result;
    if(!result||result.status!=='completed'||result.report_truncated||result.execution_verified===false)return null;
    const owner=task.owner_attention||task.user_requests;
    if(list(task.live_requests).some(r=>['pending','sending'].includes(r.status))||
      list(owner?.items).some(r=>!r.answered)||list(result.user_requests?.items).length||
      list(result.decisions).length||list(task.handoff_issues).length||list(task.snapshot_limits).length||list(result.handoff_issues).length)return null;
    const project=list(snapshot.projects).find(p=>p.id===task.project_id);
    if(!project||list(project.records).some(r=>r.category==='question'&&r.status==='open'||
      ['decision','assumption'].includes(r.category)&&r.status==='suggested'))return null;
    const summary=text(result.summary,8000),report=text(result.agent_report||result.summary,16000);
    if(!summary||!report||unresolved(summary)||unresolved(report))return null;
    const messages=root.AgentModel.conversationRuns(tasks,task).find(r=>r.task.id===task.id)?.messages||[];
    // A newer user message has already selected the next direction, even before polling a new run.
    const latest=messages.at(-1);
    if(latest?.role==='user'||latest&&(!text(latest.text,16000)||unresolved(latest.text)))return null;
    const request=text(messages.filter(m=>m.role==='user').at(-1)?.text||task.continuation_note||task.purpose||task.goal,4000);
    if(!request)return null;
    const topic=text(request.replace(/\s+/g,' '),80)||text(task.title,80);
    const steps=list(result.next_steps);
    if(steps.length>1||steps.some(step=>!text(step,160)||unresolved(step)))return null;
    const files=list(task.output_links).map(file=>file.source_path).filter(safePath);
    const captured=[...new Set(files.filter(path=>list(result.artifacts).includes(path)))];
    const evidence={request,topic,summary,steps,captured};
    // Freeze every relevant input, including transcript changes, for stale-result rejection.
    return {key:JSON.stringify([task.id,task.project_id,task.state,task.finished_at,result,
      messages,project.version,project.vision||project.goal,project.records,task.output_links]),...evidence};
  }

  function predict(input){
    if(!input)return null;
    const {steps,topic,captured,request}=input;
    // Only recognize a narrow test signal; never echo arbitrary report next_steps.
    if(steps.length===1&&topic&&/^run (?:the )?(?:relevant |focused |unit |regression |automated )?tests(?: and report (?:the )?results)?[.!]?$/i.test(steps[0].trim()))
      return {text:`Run the relevant tests for “${topic}” and report the results.`,source:'local'};
    if(steps.length||captured.length!==1||/\b(?:review|audit|inspect|verify)\b/i.test(request))return null;
    return {text:`Review “${captured[0]}” against my latest request and report any gaps.`,source:'local'};
  }

  // Independent of DOM and transport. Prediction can be asynchronous, but never sends anything.
  function controller({read,predict:generate=predict,show,timeoutMs=1000}){
    let key=null,epoch=0,pending=null,suggestion=null,attempted=false;
    const dismissed=new Set();
    function cancel(){epoch++;if(pending){clearTimeout(pending.timer);pending.abort.abort();pending=null;}suggestion=null;show(null);}
    function sync(){
      const view=read(),next=view.context?.key||null;
      if(next!==key){cancel();key=next;attempted=false;}
      if(!view.focused||!view.empty||!view.enabled||!next){cancel();attempted=false;return;}
      if(dismissed.has(key)||attempted)return;
      attempted=true;
      const ticket=++epoch,abort=new AbortController();
      const timer=setTimeout(()=>{if(ticket===epoch)cancel();},timeoutMs);
      pending={abort,timer};
      Promise.resolve().then(()=>generate(view.context,{signal:abort.signal})).then(result=>{
        if(ticket!==epoch)return;
        clearTimeout(timer);pending=null;
        const current=read();
        if(!current.focused||!current.empty||!current.enabled||current.context?.key!==key){cancel();return;}
        if(result?.source!=='local'||!text(result.text,240)||/[\n\r\t]/.test(result.text))return;
        suggestion=result;show(result);
      }).catch(()=>{if(ticket===epoch)cancel();});
    }
    function dismiss(){
      const current=read().context?.key;if(current){dismissed.add(current);if(dismissed.size>100)dismissed.delete(dismissed.values().next().value);}
      cancel();
    }
    function accept(){
      const current=read();
      if(!suggestion||!current.focused||!current.empty||!current.enabled||current.context?.key!==key){cancel();return null;}
      const value=suggestion.text;dismiss();return value;
    }
    function keydown(event){
      if(event.defaultPrevented||event.isComposing||event.altKey||event.ctrlKey||event.metaKey)return null;
      if(event.key==='Escape'&&(suggestion||pending)){event.preventDefault();event.stopImmediatePropagation();dismiss();return null;}
      if(event.key==='Tab'&&!event.shiftKey&&suggestion){const value=accept();if(value)event.preventDefault();return value;}
      return null;
    }
    return {sync,dismiss,accept,keydown,reset(){cancel();key=null;attempted=false;}};
  }
  const api={context,predict,controller};root.FollowupSuggestions=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
