/* One coherent placement review, entirely synthetic and separate from live state. */
(function(root){
 'use strict';
 const base=root.LunarBaseLayout||(typeof require==='function'?require('./base-layout.js'):null);
 // This unshipped historical review retains its composition independently of
 // the live foreground layout. Only the sprite geometry comes from the base.
 const original={habitat:[136,140,341,447],console:[103,319,90,446],lander:[815,214,930,516],hologram:[342,450,454,729],teststand:[763,523,905,727]};
 const width=1152,height=768,objects=base.objects.slice(0,5).map(object=>{
  const [x,y,labelX,labelY]=original[object.id];return {...object,x,y,labelX,labelY,width:object.nativeSize[0],height:object.nativeSize[1],scale:1,groundDepth:y+Math.max(...object.contacts.map(c=>c[1]))};
 }),paths=[[[546,382],[589,421],[621,449],[710,477],[812,473]],[[710,477],[712,585],[637,635],[617,685]],[[712,585],[747,621],[742,675]]];
 const circuit=[{x:621,y:449},{x:710,y:477},{x:712,y:585},{x:637,y:635},{x:617,y:685}];
 const crew=[
  {id:'operator',x:127,y:426,role:'console',colour:'teal',area:'console',label:'Exterior console operation'},
  {id:'repair',x:337,y:422,role:'assemble',colour:'amber',area:'habitat',label:'Habitat panel repair'},
  {id:'sensor',x:812,y:473,role:'sensor',colour:'teal',area:'lander',label:'Lander sensor attachment'},
  {id:'scanner',x:1075,y:490,role:'scan',colour:'amber',area:'lander',flip:true,label:'Lander laser scan'},
  {id:'analyst',x:302,y:693,role:'inspect',colour:'teal',area:'hologram',label:'Model / tablet inspection'},
  {id:'welder',x:728,y:687,role:'weld',colour:'amber',area:'teststand',label:'Test-stand assembly / welding'},
  {id:'walker',x:621,y:449,role:'walking',colour:'teal',area:'paths',label:'Scripted corridor walk'}
 ];
 const descriptions={
  habitat:'The approved warm-lit habitat remains the main base. Its rooftop solar array, communications dish and airlock are the existing supporting artwork.',
  console:'The original exterior console and its equipment boxes sit against the habitat, with room for its operator and a separate panel-repair position.',
  lander:'The existing lander serves the flight-data area. Sensor and scanning positions flank it, with a clear approach from the central corridor.',
  hologram:'The existing holographic rocket platform serves analysis. A tablet-inspection position and open foreground remain around the model.',
  teststand:'The existing engine test stand includes its built-in sensors, plumbing and console. It has a separate welding position and an open approach.',
  paths:'Dashed floor guides show the proposed connections. They are placement aids, not measured routes or live worker locations.'
 };
 function walker(time,parameters,pose){
  const duration=parameters.push+parameters.flight+parameters.landing;
  const segments=circuit.map((from,i)=>({from,to:circuit[(i+1)%circuit.length]}));
  const durations=segments.map(s=>Math.ceil(Math.hypot(s.to.x-s.from.x,s.to.y-s.from.y)/parameters.stride)*duration);
  let t=time%durations.reduce((a,b)=>a+b,0);
  for(let i=0;i<segments.length;i++){if(t<durations[i])return pose(t,segments[i].from,segments[i].to,parameters);t-=durations[i];}
  return {...circuit[0],height:0,squash:1,frame:0};
 }
 const api={width,height,objects,paths,circuit,crew,descriptions,walker};
 root.LunarPlacementModel=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
