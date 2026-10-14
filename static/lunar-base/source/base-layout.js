/* Shared lunar scenery. Crew always comes from the live agent projection. */
(function(root){
  'use strict';
  const width=1152,height=768;
  const objects=[
    {id:'habitat',asset:'habitat',x:136,y:140,width:410,height:255,label:'01 · HABITAT',labelX:341,labelY:447},
    {id:'console',asset:'console',x:103,y:319,width:86,height:95,label:'02 · CONSOLE',labelX:90,labelY:446},
    {id:'lander',asset:'lander',x:815,y:214,width:233,height:245,label:'03 · FLIGHT DATA / LANDER',labelX:930,labelY:516},
    {id:'hologram',asset:'hologram',x:342,y:450,width:225,height:245,label:'04 · ANALYSIS / MODEL',labelX:454,labelY:729},
    {id:'teststand',asset:'teststand',x:763,y:523,width:285,height:160,label:'05 · TEST DATA / STAND',labelX:905,labelY:727}
  ];
  const paths=[[[546,382],[589,421],[621,449],[710,477],[812,473]],[[710,477],[712,585],[637,635],[617,685]],[[712,585],[747,621],[742,675]]];
  const stations={
    console:{area:'console',work:[127,426],home:[127,490]},
    habitat:{area:'habitat',work:[337,422],home:[337,490]},
    habitatRight:{area:'habitat',work:[548,410],home:[551,490]},
    landerLeft:{area:'lander',work:[812,473],home:[812,541]},
    landerRight:{area:'lander',work:[1075,490],home:[1075,548]},
    modelLeft:{area:'hologram',work:[302,693],home:[276,747]},
    modelRight:{area:'hologram',work:[604,692],home:[604,754]},
    standLeft:{area:'teststand',work:[728,687],home:[728,752]},
    standRight:{area:'teststand',work:[1078,687],home:[1078,752]},
    junction:{area:'paths',work:[621,449],home:[650,550]}
  };
  const orders={
    miscellaneous:['console','habitat','modelLeft','landerLeft','standLeft','modelRight','landerRight','standRight','habitatRight','junction'],
    analysis:['modelLeft','modelRight','console','habitat','landerLeft','landerRight','standLeft','standRight','habitatRight','junction'],
    flight:['landerLeft','landerRight','console','habitat','modelLeft','modelRight','standLeft','standRight','habitatRight','junction'],
    test:['standLeft','standRight','console','habitat','modelLeft','modelRight','landerLeft','landerRight','habitatRight','junction']
  };
  const api={width,height,objects,paths,stations,orders};
  root.LunarBaseLayout=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
