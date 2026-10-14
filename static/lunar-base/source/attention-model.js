/* Only explicit owner-request metadata; prose never creates an approval. */
(function(root){
 'use strict';
 const terminal=['accepted','superseded','cancelled'];
 function requests(raw){
  if(terminal.includes(raw.state))return {state:'none',items:[],source:'terminal'};
  const live=raw.state==='running'?(raw.live_requests||[]).filter(r=>['pending','sending'].includes(r.status)):[];
  if(live.length)return {state:'needs_user',source:'Live CLI request',items:live.map(r=>({id:'live:'+r.id,kind:r.method==='item/tool/requestUserInput'?'question':'approval',text:(r.params?.questions||[]).map(q=>q.question).join('\n')||r.params?.reason||r.params?.message||'The agent needs a tool permission.',answered:r.status==='sending',response_status:r.status==='sending'?'Sending your response…':undefined}))};
  let a=raw.owner_attention;
  if(!a&&raw.user_requests)a={...raw.user_requests,source:'structured'};
  if(!a&&['blocked','failed','ready_for_review'].includes(raw.state)){
   const d=raw.decisions_needed||raw.result?.decisions;
   if(Array.isArray(d))a={state:'needs_user',source:'legacy_decisions',items:d.filter(x=>typeof x==='string'&&x.trim()).map((text,i)=>({id:'legacy-'+i,kind:'decision',text})),warning:'Legacy decision list: request type and explicit resolution metadata unavailable.'};
  }
  if(!a)return {state:'none',items:[],source:'missing'};
  const items=(Array.isArray(a.items)?a.items:[]).filter(i=>i&&typeof i.id==='string'&&['question','decision','approval'].includes(i.kind)&&typeof i.text==='string'&&i.text.trim()).slice(0,30);
  return {...a,state:['needs_user','resolved'].includes(a.state)?a.state:'none',items};
 }
 function identity(a){return a.state==='needs_user'?JSON.stringify(a.items.map(i=>[i.id,i.kind,i.text])):'';}
 function phase(seconds,animated){
  if(!animated)return {row:1,frame:0};
  if(seconds<1.6)return {row:0,frame:Math.min(3,Math.floor(seconds/0.4))};
  return {row:1,frame:Math.floor((seconds-1.6)*1.5)%4};
 }
 function target(projectId,taskId,item){return item.record_id&&!item.answered?'/#record/'+encodeURIComponent(projectId)+'/'+encodeURIComponent(item.record_id):'/#task/'+encodeURIComponent(taskId);}
 function projectRequests(snapshot,p){
  const linked=new Set(p.assignments.flatMap(w=>requests(w.raw).items.map(i=>i.record_id).filter(Boolean)));
  const result=[];
  const tasks=new Map(snapshot.tasks.map(t=>[t.id,t]));
  for(const r of p.raw.records||[]){
   if(linked.has(r.id))continue;
   if(['superseded','cancelled'].includes(tasks.get(r.user_request_task_id)?.state))continue;
   if((r.category==='question'&&r.status==='open')||(['decision','assumption'].includes(r.category)&&r.status==='suggested'))result.push({id:r.id,kind:r.category==='question'?'question':'decision',text:r.text,href:'/#record/'+encodeURIComponent(p.id)+'/'+encodeURIComponent(r.id),source:'Existing CoS project record'});
  }
  for(const plan of snapshot.plans||[])if(plan.project_id===p.id&&['draft','approved'].includes(plan.state))result.push({id:plan.id,kind:'approval',text:plan.state==='approved'?'Approved assignment awaits your explicit launch.':'Assignment awaits your review and approval.',href:'/#plan/'+encodeURIComponent(plan.id),source:'Existing CoS assignment '+plan.state});
  return result;
 }
 const api={requests,identity,phase,target,projectRequests};root.LunarAttention=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
