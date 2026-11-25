export const MAX_TERRITORY_POINTS = 128;
const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const epsilon=1e-10;
const onSegment=(a,b,p)=>Math.abs(cross(a,b,p))<=epsilon && p.x>=Math.min(a.x,b.x)-epsilon && p.x<=Math.max(a.x,b.x)+epsilon && p.y>=Math.min(a.y,b.y)-epsilon && p.y<=Math.max(a.y,b.y)+epsilon;
function intersects(a,b,c,d) {
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  return ((abC>epsilon&&abD<-epsilon||abC<-epsilon&&abD>epsilon)&&(cdA>epsilon&&cdB<-epsilon||cdA<-epsilon&&cdB>epsilon)) || onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
}
export function validateTerritory(points) {
  if(!Array.isArray(points)||points.length<3||points.length>MAX_TERRITORY_POINTS)throw new Error(`Desenhe entre 3 e ${MAX_TERRITORY_POINTS} pontos para fechar o território.`);
  const vertices=points.map(point=>{
    if(!point||![point.x,point.y].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1))throw new Error('Todos os pontos do território devem estar dentro do mapa.');
    return {x:point.x,y:point.y};
  });
  const n=vertices.length;
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(Math.hypot(vertices[i].x-vertices[j].x,vertices[i].y-vertices[j].y)<1e-7)throw new Error('Os pontos do território não podem se repetir.');
  for(let i=0;i<n;i++) {
    const a=vertices[i],b=vertices[(i+1)%n],previous=vertices[(i+n-1)%n];
    if(onSegment(previous,a,b)||onSegment(a,b,previous))throw new Error('As linhas do território não podem se sobrepor.');
    for(let j=i+1;j<n;j++) {
      if(j===i+1 || (i===0&&j===n-1))continue;
      if(intersects(a,b,vertices[j],vertices[(j+1)%n]))throw new Error('As linhas do território não podem se cruzar. Desfaça o último ponto e ajuste o contorno.');
    }
  }
  const area=vertices.reduce((sum,a,i)=>{const b=vertices[(i+1)%n];return sum+a.x*b.y-b.x*a.y;},0);
  if(Math.abs(area)<1e-8)throw new Error('Desenhe uma área: os pontos não podem ficar todos na mesma linha.');
  return vertices;
}
export function territoryCenter(vertices) {
  let area=0,x=0,y=0;
  for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],weight=a.x*b.y-b.x*a.y;area+=weight;x+=(a.x+b.x)*weight;y+=(a.y+b.y)*weight;}
  return {x:Math.max(0,Math.min(1,x/(3*area))),y:Math.max(0,Math.min(1,y/(3*area)))};
}
