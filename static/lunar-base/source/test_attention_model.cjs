const assert=require('node:assert/strict'),m=require('./live-model.js'),a=require('./attention-model.js');
const stamp='2026-10-13T04:00:00Z',now=Date.parse(stamp),context={kind:'task',now,connected:true};
const base={id:'task',project_id:'project',state:'running',config:{mode:'codex'},worker_pid:123,last_activity_at:stamp,updated:stamp};
const req={version:1,revision:1,state:'needs_user',observed_at:stamp,items:[{id:'x',kind:'question',text:'Which sample rate?'}]};
const pending={...base,user_requests:req},status=m.classify(pending,context);
assert.equal(status.category,'needs_user');assert(status.attentionPending);assert(status.attentionAnimate);assert(!status.animate);
assert.equal(m.classify({...base,state:'blocked',latest_update:'Please approve?'},context).attentionPending,false);
assert.equal(m.classify({...base,state:'waiting'},context).category,'waiting');assert.equal(m.classify({...base,state:'ready_for_review'},context).category,'needs_input');
for(const ctx of [{...context,connected:false},{...context,snapshotStale:true},{...context,now:now+130000}]){const s=m.classify(pending,ctx);assert(s.attentionPending);assert(!s.attentionAnimate);assert(!s.animate);}
const answered=m.classify({...pending,user_requests:{...req,items:[{...req.items[0],answered:true}]}},context);assert(answered.attentionPending);assert(!answered.attentionAnimate);
assert(!m.classify({...pending,state:'cancelled'},context).attentionPending);
const resolved={...base,user_requests:{...req,revision:2,state:'resolved',items:[],observed_at:'2026-10-13T04:00:01Z'}};
assert(!m.classify(resolved,context).animate);assert(m.classify({...resolved,last_activity_at:'2026-10-13T04:00:02Z'},context).animate);
assert(!m.classify({...resolved,state:'blocked'},context).animate);
assert.equal(a.identity(req),a.identity({...req,revision:3}));assert.notEqual(a.identity(req),a.identity({...req,items:[{...req.items[0],text:'Changed request'}]}));
assert.deepEqual(a.phase(0,true),{row:0,frame:0});assert.deepEqual(a.phase(1.3,true),{row:0,frame:3});assert.equal(a.phase(2.4,true).row,1);assert.deepEqual(a.phase(300,false),{row:1,frame:0});
assert.equal(a.target('p /','task /',{record_id:'r /'}),'/#record/p%20%2F/r%20%2F');assert.equal(a.target('p','t',{record_id:'r',answered:true}),'/#task/t');
const snapshot={projects:[{id:'project',name:'Flight data',records:[{id:'unlinked',category:'question',status:'open',text:'Which source?'}]}],tasks:[pending,{...base,id:'blocker',state:'blocked'}],jobs:[],plans:[{id:'plan',project_id:'project',state:'draft'}]};
const original=structuredClone(snapshot),view=m.build(snapshot,m.cleanRegistry(null),context);assert.deepEqual(snapshot,original);assert.equal(view.workers.length,2);assert.equal(view.projects[0].attentionCount,3);assert(view.projects[0].attentionHeld);
console.log('PASS explicit attention, stale/disconnect, resolution freshness, precise safe links and pure mapping.');

// Native blocking questions and permissions override an empty owner snapshot.
for(const method of ['item/tool/requestUserInput','item/commandExecution/requestApproval','item/fileChange/requestApproval','item/permissions/requestApproval','mcpServer/elicitation/request']){
 const raw={...base,managed_agent:true,owner_attention:{state:'none',items:[]},live_requests:[{id:'native',method,status:'pending',params:{questions:method==='item/tool/requestUserInput'?[{question:'Which sample?'}]:[],reason:'Exact permission requested'}}]};
 const native=m.classify(raw,context);assert.equal(native.label,'Waiting for you');assert(native.attentionAnimate);assert(!native.animate);assert.equal(native.attention.items[0].kind,method==='item/tool/requestUserInput'?'question':'approval');
 raw.live_requests[0].status='sending';assert(!m.classify(raw,context).attentionAnimate);
 raw.live_requests[0].status='resolved';assert(!m.classify(raw,context).attentionPending);
 raw.live_requests[0].status='pending';raw.state='paused';assert(!m.classify(raw,context).attentionPending);
}
const staleQuestion={id:'old-record',category:'question',status:'open',text:'Earlier question',user_request_task_id:'old-turn'};
const cleanSnapshot={projects:[{id:'project',records:[staleQuestion]}],tasks:[{...base,id:'old-turn',state:'superseded'},{...base,id:'next-turn',agent_id:'old-turn',parent_task_id:'old-turn'}],jobs:[]};
const cleanView=m.build(cleanSnapshot,m.cleanRegistry(null),context);assert.equal(cleanView.workers.length,1);assert.equal(cleanView.projects[0].attentionCount,0);
assert.equal(m.classify({...base,managed_agent:true,state:'ready_for_review'},context).category,'completed');
assert.equal(m.classify({...base,managed_agent:true,state:'ready_for_review',user_requests:req},context).category,'needs_user');
console.log('PASS: native questions, exact tool permissions, response receipts, stopped request cleanup and obsolete linked questions.');
