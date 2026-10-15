/* Projected markings in the registered sprite plane; the hardware stays fixed. */
(function(root){
  'use strict';
  function point(orbit,angle){
    const [cx,cy]=orbit.center,[rx,ry]=orbit.radii,c=Math.cos(orbit.tilt),s=Math.sin(orbit.tilt);
    return [cx+rx*Math.cos(angle)*c-ry*Math.sin(angle)*s,cy+rx*Math.cos(angle)*s+ry*Math.sin(angle)*c];
  }
  function strokes(index,meta,front){
    if(index===null||!meta.rings)return [];
    const rings=meta.rings,result=[];
    const add=(points,width,alpha)=>{if(points.length>1)result.push({points,width,alpha});};
    const arc=(points,alpha)=>{add(points,6,alpha*.17);add(points,2.5,alpha);};
    for(const orbit of rings.orbits){
      const angle=orbit.offset+orbit.direction*index/rings.frames*Math.PI*2;
      const alpha=.70+.16*Math.sin(angle);let points=[];
      for(let n=0;n<=20;n++){
        const a=angle-orbit.direction*rings.arc*(1-n/20);
        if((Math.sin(a)>=0)===front)points.push(point(orbit,a));
        else if(points.length){arc(points,alpha);points=[];}
      }
      arc(points,alpha);
      // A short normal tick and small marker make motion readable on a uniform ring.
      if((Math.sin(angle)>=0)===front){
        const [x,y]=point(orbit,angle),[tx,ty]=point(orbit,angle-.015),length=Math.hypot(x-tx,y-ty);
        const nx=-(y-ty)/length*5,ny=(x-tx)/length*5;
        add([[x-nx,y-ny],[x+nx,y+ny]],2,alpha);
        add([[x-3,y-3],[x+3,y-3],[x+3,y+3],[x-3,y+3],[x-3,y-3]],2,alpha);
      }
    }
    return result;
  }
  function paint(ctx,index,meta,x,y,width,height,front){
    const paths=strokes(index,meta,front);if(!paths.length)return;
    ctx.save();ctx.translate(x,y);ctx.scale(width/meta.width,height/meta.height);ctx.lineCap='square';ctx.lineJoin='round';
    for(const path of paths){
      ctx.strokeStyle='rgba(126,244,255,'+path.alpha+')';ctx.lineWidth=path.width;ctx.beginPath();
      path.points.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.stroke();
    }
    ctx.restore();
  }
  const api={point,strokes,paint};root.LunarHologramOrbits=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
