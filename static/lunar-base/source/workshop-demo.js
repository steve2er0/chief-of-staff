/* Synthetic in-memory showcase. No API reads, jobs, process IDs or sessions. */
(function(root){
  'use strict';
  const opened=Date.now();
  const definitions=[
    {id:'demo-flight',name:'Flight data',vision:'Flight data and lander telemetry',roles:['assemble','sensor'],titles:['Assemble a lander instrument bracket','Attach a flight telemetry sensor']},
    {id:'demo-analysis',name:'Analysis',vision:'Rocket model analysis and simulation',roles:['inspect','console'],titles:['Inspect the holographic rocket model','Operate the model analysis console']},
    {id:'demo-test',name:'Test data',vision:'Engine test data and ground test instrumentation',roles:['weld','scan'],titles:['Weld the engine test fixture','Laser scan the test stand']},
    {id:'demo-misc',name:'Miscellaneous',vision:'General notes and housekeeping',roles:['console','assemble'],titles:['Organize mission notes at the exterior console','Repair a habitat exterior panel']}
  ];
  function snapshot(elapsed=(Date.now()-opened)/1000){
    const stamp=new Date().toISOString(),seconds=elapsed;
    const projects=definitions.map(p=>({id:p.id,name:p.name,vision:p.vision,goal:p.vision,created:stamp,updated:stamp}));
    const tasks=definitions.flatMap(p=>p.roles.map((role,i)=>({id:p.id+'-'+i,project_id:p.id,title:p.titles[i],
      goal:'Illustrative workshop scene. No actual agent, hardware operation or worker run.',purpose:'Scripted art and animation demonstration.',
      config:{mode:'simulated'},state:'running',last_activity_at:stamp,updated:stamp,
      latest_update:'Scripted '+role+' pose at shared '+p.name+' infrastructure.',latest_update_at:stamp,
      activity:'Scripted visual demonstration',demo_role:role,demo_area:(seconds+23+i*7)%24<10?'console':'workspace',
      criteria:['Shared project infrastructure','Distinct planted work poses','Gentle lunar bounds'],output_links:[]})));
    return {projects,tasks,jobs:[],local_time:stamp,lunar_demo:true};
  }
  root.LunarWorkshop={snapshot};
})(typeof window!=='undefined'?window:globalThis);
