/* Shared lunar scenery. Crew always comes from the live agent projection. */
(function(root){
  'use strict';
  const width=2048,height=1152,crewScale=1.4;
  const objects=[
    {id:'habitat',asset:'habitat',x:136,y:140,width:410,height:255,label:'01 · HABITAT',labelX:341,labelY:447},
    {id:'console',asset:'console',x:103,y:319,width:86,height:95,label:'02 · CONSOLE',labelX:90,labelY:446},
    {id:'lander',asset:'lander',x:815,y:214,width:233,height:245,label:'03 · FLIGHT DATA / LANDER',labelX:930,labelY:516},
    {id:'hologram',asset:'hologram',x:342,y:450,width:225,height:245,label:'04 · ANALYSIS / MODEL',labelX:454,labelY:729},
    {id:'teststand',asset:'teststand',x:763,y:523,width:285,height:160,label:'05 · TEST DATA / STAND',labelX:905,labelY:727},
    {id:'garage',asset:'garage',src:'/lunar-base/expansion-v1/sprites-3x/rover-garage.png',x:1210,y:180,width:356,height:218,label:'06 · ROVER GARAGE'},
    {id:'greenhouse',asset:'greenhouse',src:'/lunar-base/expansion-v1/sprites-3x/greenhouse.png',x:1240,y:640,width:316,height:165,label:'07 · GREENHOUSE'},
    {id:'communications',asset:'communications',src:'/lunar-base/expansion-v1/sprites-3x/communications-dish.png',x:1790,y:180,width:166,height:191,label:'08 · COMMUNICATIONS DISH'},
    {id:'rover',asset:'rover',src:'/lunar-base/expansion-v1/sprites-3x/rover.png',x:1730,y:510,width:151,height:101,label:'10 · UTILITY ROVER'}
  ];
  // Native logical dimensions and visible support contacts, measured from the
  // source alpha silhouettes. These are art coordinates, not physical units.
  const geometry={
    habitat:{size:[410,764/3],anchor:[205,764/3],contacts:[[30,595/3,20,3],[175,701/3,34,4],[385,250,22,3]]},
    console:{size:[86,286/3],anchor:[43,286/3],contacts:[[10,247/3,10,2],[40,91,12,2],[72,275/3,9,2]]},
    lander:{size:[233,245],anchor:[116.5,245],contacts:[[15,225,15,3],[116,245,18,3],[216,226,15,3]]},
    hologram:{size:[225,245],anchor:[112.5,245],contacts:[[35,229,19,3],[110,241,32,3],[195,228,19,3]]},
    teststand:{size:[285,160],anchor:[142.5,160],contacts:[[35,140,24,3],[140,157,36,3],[250,145,22,3]]},
    garage:{size:[356,218],anchor:[178,210],contacts:[[25,517/3,20,3],[156,210,38,3],[327,165,19,3]]},
    greenhouse:{size:[316,165],anchor:[158,157],contacts:[[28,122,16,2.5],[120,421/3,22,3],[203,451/3,22,3],[298,152,13,2.5]]},
    communications:{size:[166,191],anchor:[83,183],contacts:[[25,548/3,18,3],[80,517/3,18,3],[125,182,18,3]]},
    rover:{size:[151,101],anchor:[76,93],contacts:[[73,277/3,10,2],[105,257/3,9,2],[132,80,8,2]]}
  };
  // A distant service row uses the same depth factor for people and scenery.
  // Larger native modules at that distance retain their modest apparent size.
  const sites={
    habitat:{pivot:[341,764/3+140],groupScale:1.15,artScale:1.44,offset:[35,480]},
    console:{pivot:[341,764/3+140],groupScale:1.15,offset:[35,480]},
    hologram:{pivot:[454.5,695],groupScale:1.15,offset:[565,320]},
    lander:{offset:[801.5,486]},
    teststand:{pivot:[905.5,683],distanceScale:.9,stationScale:.9,offset:[120,-100]},
    garage:{ground:[1388,650],pivot:[1388,650],distanceScale:.65,stationScale:.65,artScale:1.5,offset:[-38,-350]},
    greenhouse:{ground:[1800,300],pivot:[1800,300],stationScale:1/.65,artScale:1.5,offset:[-234,350]},
    rover:{ground:[1430,300],distanceScale:.65,artScale:1.5,offset:[-380,0]},
    communications:{ground:[480,983],offset:[-20,-550]}
  };
  for(const object of objects){
    const native=geometry[object.id],site=sites[object.id]||{};
    const originalGround=site.ground||[object.x+native.anchor[0],object.y+native.anchor[1]];
    const pivot=site.pivot||originalGround,groupScale=site.groupScale||1;
    const ground=originalGround.map((value,i)=>pivot[i]+(value-pivot[i])*groupScale);
    object.distanceScale=site.distanceScale||1;object.scale=object.distanceScale*(site.artScale||1)*groupScale;
    object.nativeSize=native.size;object.groundAnchor=native.anchor;object.contacts=native.contacts;
    object.width=native.size[0]*object.scale;object.height=native.size[1]*object.scale;
    if(site.ground||object.scale!==1){object.x=ground[0]-native.anchor[0]*object.scale;object.y=ground[1]-native.anchor[1]*object.scale;}
    const [dx,dy]=site.offset||[0,0];object.x+=dx;object.y+=dy;
    if(Number.isFinite(object.labelX))object.labelX=pivot[0]+(object.labelX-pivot[0])*groupScale+dx;
    if(Number.isFinite(object.labelY))object.labelY=pivot[1]+(object.labelY-pivot[1])*groupScale+dy;
    object.groundDepth=object.y+Math.max(...native.contacts.map(c=>c[1]))*object.scale;
  }
  // Optional movement waypoints remain internal; the live terrain has no drawn paths.
  const paths=[[[715,854],[760,929],[760,700],[710,700],[710,477]],
    [[760,929],[650,1110],[1020,1110],[1020,1015]],
    [[710,700],[850,650],[865,580],[900,580]],
    [[710,477],[1130,477],[1130,700],[1535,727],[1566,650]],
    [[1130,477],[1050,385],[1050,300]],
    [[1050,385],[1390,350],[1350,300]],
    [[1130,700],[1500,930],[1733,1010],[1733,945]],
    [[710,477],[650,510],[460,510],[460,433]]];
  const stations={
    console:{area:'console',role:'console',work:[127,426],home:[127,490]},
    habitat:{area:'habitat',role:'assemble',work:[337,422],home:[337,490]},
    habitatRight:{area:'habitat',role:'weld',work:[548,410],home:[551,490]},
    landerLeft:{area:'lander',role:'sensor',work:[812,473],home:[812,541]},
    landerRight:{area:'lander',role:'scan',work:[1075,490],home:[1075,548]},
    modelLeft:{area:'hologram',role:'inspect',work:[302,693],home:[276,747]},
    modelRight:{area:'hologram',role:'scan',work:[604,692],home:[604,754]},
    standLeft:{area:'teststand',role:'weld',work:[728,687],home:[728,752]},
    standRight:{area:'teststand',role:'sensor',work:[1078,687],home:[1078,752]},
    junction:{area:'paths',role:'inspect',work:[640,570],home:[650,640]},
    consoleLeft:{area:'console',role:'scan',work:[42,370],home:[42,370]},
    consoleInspect:{area:'console',role:'inspect',work:[127,575],home:[127,575]},
    habitatService:{area:'habitat',role:'sensor',work:[557,290],home:[557,290]},
    landerInspect:{area:'lander',role:'inspect',work:[1078,295],home:[1078,295]},
    modelSensor:{area:'hologram',role:'sensor',work:[316,530],home:[316,530]},
    standInspect:{area:'teststand',role:'inspect',work:[885,748],home:[885,748]},
    garageFront:{area:'garage',role:'assemble',work:[1360,700],home:[1360,700]},
    garageLeft:{area:'garage',role:'weld',work:[1180,550],home:[1180,550]},
    garageRight:{area:'garage',role:'inspect',work:[1610,550],home:[1610,550]},
    greenhouseLeft:{area:'greenhouse',role:'sensor',work:[1590,200],home:[1590,200]},
    greenhouseRight:{area:'greenhouse',role:'scan',work:[2010,270],home:[2010,270]},
    greenhouseFront:{area:'greenhouse',role:'inspect',work:[1780,350],home:[1780,350]},
    dishLeft:{area:'communications',role:'sensor',work:[350,975],home:[350,975]},
    dishRight:{area:'communications',role:'scan',work:[610,975],home:[610,975]},
    dishInspect:{area:'communications',role:'inspect',work:[480,1060],home:[480,1060]},
    roverLeft:{area:'rover',role:'weld',work:[1300,300],home:[1300,300]},
    roverRight:{area:'rover',role:'sensor',work:[1550,300],home:[1550,300]},
    roverInspect:{area:'rover',role:'inspect',work:[1430,385],home:[1430,385]}
  };
  // Move each area's crew with its scenery without changing saved station IDs.
  for(const station of Object.values(stations)){
    const site=sites[station.area],offset=site?.offset;if(!offset)continue;
    const pivot=site.pivot||[0,0],scale=site.stationScale||site.groupScale||1;
    for(const key of ['work','home'])station[key]=station[key].map((value,i)=>pivot[i]+(value-pivot[i])*scale+offset[i]);
  }
  // Keep the sensor position clear of the enlarged Hub's right flank.
  stations.habitatService.work=[760,850];stations.habitatService.home=[760,850];
  // Keep the swapped areas' left crew clear of the rover and test stand.
  stations.garageLeft.work=[1140,170];stations.garageLeft.home=[1140,170];
  stations.garageRight.work=[1555,250];stations.garageRight.home=[1555,250];
  stations.garageFront.work=[1390,350];stations.garageFront.home=[1390,350];
  stations.greenhouseLeft.work=[1295,470];stations.greenhouseLeft.home=[1295,470];
  const expansion=['garageFront','garageLeft','garageRight','greenhouseLeft','greenhouseRight','greenhouseFront','dishLeft','dishRight','dishInspect','roverLeft','roverRight','roverInspect'];
  const orders={
    // The original ten indices stay first so saved crew slots can migrate.
    miscellaneous:['console','habitat','modelLeft','landerLeft','standLeft','modelRight','landerRight','standRight','habitatRight','junction','consoleLeft','consoleInspect','habitatService','landerInspect','modelSensor','standInspect'],
    analysis:['modelLeft','modelRight','modelSensor','console','habitat','landerLeft','landerRight','landerInspect','standLeft','standRight','standInspect','habitatRight','habitatService','consoleLeft','consoleInspect','junction'],
    flight:['landerLeft','landerRight','landerInspect','console','habitat','modelLeft','modelRight','modelSensor','standLeft','standRight','standInspect','habitatRight','habitatService','consoleLeft','consoleInspect','junction'],
    test:['standLeft','standRight','standInspect','console','habitat','modelLeft','modelRight','modelSensor','landerLeft','landerRight','landerInspect','habitatRight','habitatService','consoleLeft','consoleInspect','junction']
  };
  // Append stations so every saved original station retains its index.
  for(const order of Object.values(orders))order.push(...expansion);
  for(const area of ['garage','greenhouse','communications','rover']){
    const preferred=expansion.filter(name=>stations[name].area===area);
    orders[area]=[...preferred,...orders.miscellaneous.filter(name=>!preferred.includes(name))];
  }
  const api={width,height,crewScale,objects,paths,stations,orders};
  root.LunarBaseLayout=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
