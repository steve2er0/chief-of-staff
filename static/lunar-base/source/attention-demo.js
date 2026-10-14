/* Local scripted attention/resolution scenario. No API calls or real replies. */
(function(root){

 function snapshot(elapsed=0){
  const clock=elapsed%24,cycle=Math.floor(elapsed/24),stamp=new Date().toISOString();
  const pending=clock<9,answered=clock>=6&&pending;
  const p={id:'attention-flight-demo',name:'Flight data · attention demo',vision:'Lander flight data and telemetry',updated:stamp,records:[]};
  const task=(id,title,state)=>({id,project_id:p.id,title,state,config:{mode:'simulated'},updated:stamp,last_activity_at:stamp,latest_update_at:stamp,started_at:stamp,latest_update:'Scripted attention demonstration. No worker process or job.',criteria:[],output_links:[],demo_role:'console',demo_area:'console'});
  const question=task('attention-question','Telemetry sensor question',pending?'blocked':'running');question.demo_role='sensor';
  question.owner_attention={version:1,revision:cycle*2+(pending?1:2),state:pending?'needs_user':'resolved',source:'scripted_demo',observed_at:stamp,items:pending?[{id:'sensor-'+cycle,kind:'question',text:'Which telemetry sample rate should I use: 10 Hz or 50 Hz?',answered,response_status:answered?'answered':null,owner_answer:answered?'10 Hz — scripted demonstration response':null}]:[]};
  const approval=task('attention-approval','Instrument placement decision',pending?'blocked':'running');approval.demo_role='inspect';approval.demo_area='workspace';
  approval.owner_attention={version:1,revision:cycle*2+(pending?1:2),state:pending?'needs_user':'resolved',source:'scripted_demo',observed_at:stamp,items:pending?[{id:'placement-'+cycle,kind:'approval',text:'Approve the proposed instrument position on the lander bracket?',answered,response_status:answered?'approved':null}]:[]};
  const blocker=task('attention-blocker','Generic source-file blocker','blocked');blocker.latest_update='Scripted missing input file; no explicit owner question.';
  const waiting=task('attention-waiting','Waiting for another assignment','waiting');
  const review=task('attention-review','Completed output awaiting review','ready_for_review');
  return {projects:[p],tasks:[question,approval,blocker,waiting,review],jobs:[],plans:[],local_time:stamp,lunar_demo:true,attention_demo:true,demo_clock:clock};
 }
 root.LunarAttentionDemo={snapshot};
})(typeof window!=='undefined'?window:globalThis);
