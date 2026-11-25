import type { Effects } from './useHuntState';
type Point={x:number;y:number};
type Bounds={left:number;top:number;width:number;height:number};

// Textures and trajectories are generated once, not allocated on every frame.
export function createAmbientEffects(){
  let seed=74017;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const particles=Array.from({length:110},()=>({x:random(),y:random(),speed:.5+random(),phase:random()*Math.PI*2,size:.7+random()*1.6}));
  const grain=document.createElement('canvas');grain.width=grain.height=96;
  const noise=grain.getContext('2d')!;const pixels=noise.createImageData(96,96);
  for(let i=0;i<pixels.data.length;i+=4){const v=Math.floor(random()*255);pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=36;}
  noise.putImageData(pixels,0,0);
  let pattern:CanvasPattern|null=null;
  const wrap=(n:number)=>((n%1)+1)%1;
  return (ctx:CanvasRenderingContext2D,effects:Effects,time:number,bounds:Bounds,project:(x:number,y:number)=>Point,viewport:Point)=>{
    const {left,top,width:w,height:h}=bounds;
    function glow(x:number,y:number,r:number,center:string){
      const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,center);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    ctx.save();
    if(effects.redGlow){
      const pulse=.32+.045*Math.sin(time*.47);
      glow(left,top+h*.35,w*.72,`rgba(165,9,28,${pulse})`);
      glow(left+w,top+h*.7,w*.65,`rgba(188,12,24,${pulse*.85})`);
    }
    if(effects.torchlight){
      const pulse=.33+Math.sin(time*2.3)*.035+Math.sin(time*3.7)*.02;
      glow(left+w*.08,top+h*.9,w*.42,`rgba(255,142,27,${pulse})`);
      glow(left+w*.93,top+h*.65,w*.36,`rgba(255,169,54,${pulse*.85})`);
    }
    const visible=(p:Point)=>p.x>=-30&&p.y>=-30&&p.x<=viewport.x+30&&p.y<=viewport.y+30;
    if(effects.fireflies)particles.slice(0,30).forEach((particle,index)=>{
      const p=project(particle.x+Math.sin(time*.17+particle.phase)*.013,particle.y+Math.cos(time*.21+particle.phase)*.012);
      if(!visible(p))return;const pulse=.35+.25*Math.sin(time*.65+particle.phase);
      glow(p.x,p.y,7+particle.size*2,`rgba(${index%3?'179,221,116':'242,215,137'},${pulse*.35})`);
      ctx.fillStyle=`rgba(225,240,164,${pulse+.1})`;ctx.beginPath();ctx.arc(p.x,p.y,particle.size*.6,0,Math.PI*2);ctx.fill();
    });
    if(effects.embers)particles.slice(0,35).forEach(particle=>{
      const y=wrap(particle.y-time*.025*particle.speed),p=project(wrap(particle.x+Math.sin(time*.25+particle.phase)*.025),y);
      if(!visible(p))return;ctx.fillStyle=`rgba(247,146,62,${Math.sin(y*Math.PI)*.65})`;ctx.beginPath();ctx.ellipse(p.x,p.y,particle.size*.45,particle.size,0,0,Math.PI*2);ctx.fill();
    });
    if(effects.rain){
      ctx.lineWidth=.8;ctx.strokeStyle='rgba(183,207,220,.27)';ctx.beginPath();
      particles.forEach(particle=>{const p=project(wrap(particle.x-time*.04*particle.speed),wrap(particle.y+time*.28*particle.speed));if(visible(p)){ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-3,p.y+10+particle.size*4);}});ctx.stroke();
    }
    if(effects.snow)particles.slice(0,70).forEach(particle=>{
      const p=project(wrap(particle.x+Math.sin(time*.19+particle.phase)*.025),wrap(particle.y+time*.025*particle.speed));if(!visible(p))return;
      ctx.fillStyle='rgba(220,230,232,.5)';ctx.beginPath();ctx.arc(p.x,p.y,particle.size*.75,0,Math.PI*2);ctx.fill();
    });
    if(effects.tvStatic){
      pattern ||= ctx.createPattern(grain,'repeat');
      ctx.save();ctx.translate(Math.floor(time*7)%96,Math.floor(time*5)%96);ctx.fillStyle=pattern!;ctx.fillRect(-96,-96,viewport.x+192,viewport.y+192);ctx.restore();
      ctx.fillStyle='rgba(9,15,13,.09)';for(let y=top%4;y<viewport.y;y+=4)ctx.fillRect(Math.max(0,left),y,Math.min(w,viewport.x),1);
      const scan=top+wrap(time*.035)*h;const band=ctx.createLinearGradient(0,scan-35,0,scan+35);band.addColorStop(0,'rgba(190,210,185,0)');band.addColorStop(.5,'rgba(190,210,185,.035)');band.addColorStop(1,'rgba(190,210,185,0)');ctx.fillStyle=band;ctx.fillRect(left,scan-35,w,70);
    }
    ctx.restore();
  };
}
