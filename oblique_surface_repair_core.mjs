import {ShapeUtils,Vector2} from './vendor/three.webgpu.js';

// Repair atlas padding, not dark islands (e.g. photographed shadows) inside a chart.
export function repairAtlas(input,width,height){
 const count=width*height,pixels=new Uint8ClampedArray(input),padding=new Uint8Array(count),queue=new Int32Array(count);
 const dark=i=>Math.max(input[i*4],input[i*4+1],input[i*4+2])<=12||input[i*4+3]===0;
 let head=0,tail=0;
 const seed=i=>{if(!padding[i]&&dark(i)){padding[i]=1;queue[tail++]=i}};
 for(let x=0;x<width;x++){seed(x);seed((height-1)*width+x)}
 for(let y=1;y<height-1;y++){seed(y*width);seed(y*width+width-1)}
 while(head<tail){const i=queue[head++],x=i%width;
  if(x)seed(i-1);if(x<width-1)seed(i+1);if(i>=width)seed(i-width);if(i<count-width)seed(i+width);
 }
 const filled=tail;
 if(!filled||filled===count)return {pixels,filled:0,unresolved:filled===count?count:0};
 // Multi-source nearest-neighbour propagation keeps the photographed pixels exact.
 head=0;tail=0;
 for(let i=0;i<count;i++)if(!padding[i])queue[tail++]=i;
 const extend=(i,from)=>{if(!padding[i])return;padding[i]=0;const a=i*4,b=from*4;pixels[a]=pixels[b];pixels[a+1]=pixels[b+1];pixels[a+2]=pixels[b+2];pixels[a+3]=255;queue[tail++]=i};
 while(head<tail){const i=queue[head++],x=i%width;
  if(x)extend(i-1,i);if(x<width-1)extend(i+1,i);if(i>=width)extend(i-width,i);if(i<count-width)extend(i+width,i);
 }
 return {pixels,filled,unresolved:0};
}

function inside(p,ring){let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
}return result}
function linear(c){c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}

// Close only small, simple INTERNAL boundary loops, welding position-only UV seams.
// Outer tile boundaries, branching/non-manifold rims and the open river stay open.
export function repairMesh({positions,indices,uv,matrix,water=[],bounds,pixels,width,height,flipY=false}){
 const nv=positions.length/3,unique=[],representative=[],remap=new Uint32Array(nv),lookup=new Map(),m=matrix;
 for(let i=0;i<nv;i++){
  const x=positions[3*i],y=positions[3*i+1],z=positions[3*i+2];
  const p=[m[0]*x+m[4]*y+m[8]*z+m[12],-(m[2]*x+m[6]*y+m[10]*z+m[14]),m[1]*x+m[5]*y+m[9]*z+m[13]];
  const key=p.map(v=>Math.round(v*1000)).join(',');let id=lookup.get(key);
  if(id===undefined){id=unique.length;lookup.set(key,id);unique.push(p);representative.push(i)}remap[i]=id;
 }
 const edges=new Map(),faces=indices??Uint32Array.from({length:nv},(_,i)=>i);let winding=0;
 const edge=(a,b)=>{const key=Math.min(a,b)*unique.length+Math.max(a,b),old=edges.get(key);if(old)old.count++;else edges.set(key,{a,b,count:1})};
 for(let i=0;i<faces.length;i+=3){const a=remap[faces[i]],b=remap[faces[i+1]],c=remap[faces[i+2]];if(a===b||b===c||c===a)continue;
  edge(a,b);edge(b,c);edge(c,a);const A=unique[a],B=unique[b],C=unique[c];winding+=(B[0]-A[0])*(C[1]-A[1])-(B[1]-A[1])*(C[0]-A[0]);
 }
 const adj=new Map();let boundaryEdges=0;
 const add=(a,b)=>{if(!adj.has(a))adj.set(a,[]);adj.get(a).push(b)};
 for(const e of edges.values())if(e.count===1){add(e.a,e.b);add(e.b,e.a);boundaryEdges++}
 const visited=new Set(),patchPositions=[],patchColors=[],holes=[];let skippedOuter=0,skippedWater=0,skippedComplex=0;
 for(const e of edges.values()){
  if(e.count!==1||visited.has(e.a))continue;
  const component=[],stack=[e.a];visited.add(e.a);
  while(stack.length){const a=stack.pop();component.push(a);for(const b of adj.get(a))if(!visited.has(b)){visited.add(b);stack.push(b)}}
  if(component.length<3||component.length>256||component.some(a=>adj.get(a).length!==2)){skippedComplex++;continue}
  const ids=[e.a];let previous=e.a,current=e.b;
  while(current!==ids[0]&&ids.length<=component.length){ids.push(current);const next=adj.get(current).find(i=>i!==previous);previous=current;current=next}
  if(ids.length!==component.length){skippedComplex++;continue}
  const ring=ids.map(i=>unique[i]);let area=0,perimeter=0;const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];area+=a[0]*b[1]-b[0]*a[1];perimeter+=Math.hypot(...a.map((v,j)=>v-b[j]));for(let j=0;j<3;j++){low[j]=Math.min(low[j],a[j]);high[j]=Math.max(high[j],a[j])}}
  area/=2;
  if(area*winding>=0||Math.abs(area)<.005||Math.abs(area)>200||perimeter>90||high[2]-low[2]>12||Math.hypot(high[0]-low[0],high[1]-low[1])>30){skippedOuter++;continue}
  if(bounds&&(low[0]<=bounds[0]+.02||low[1]<=bounds[1]+.02||high[0]>=bounds[2]-.02||high[1]>=bounds[3]-.02)){skippedOuter++;continue}
  const centroid=[0,0,0];for(const p of ring)for(let j=0;j<3;j++)centroid[j]+=p[j]/ring.length;
  // Reject any loop touching water, plus water vertices enclosed by the candidate.
  if(water.some(w=>[centroid,...ring].some(p=>inside(p,w))||w.some(p=>inside(p,ring)))){skippedWater++;continue}
  const tris=ShapeUtils.triangulateShape(ring.map(p=>new Vector2(p[0],p[1])),[]);
  const covered=tris.reduce((sum,t)=>{const [a,b,c]=t.map(i=>ring[i]);return sum+Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2},0);
  if(!tris.length||Math.abs(covered-Math.abs(area))>Math.max(.001,Math.abs(area)*1e-4)){skippedComplex++;continue}
  const color=i=>{const original=representative[ids[i]],u=uv[original*2],v=uv[original*2+1];const x=Math.min(width-1,Math.max(0,Math.round(u*(width-1)))),y=Math.min(height-1,Math.max(0,Math.round((flipY?1-v:v)*(height-1)))),k=(y*width+x)*4;return [linear(pixels[k]),linear(pixels[k+1]),linear(pixels[k+2])]};
  for(const t of tris){const [a,b,c]=t.map(i=>ring[i]);if(((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))*winding<0)[t[1],t[2]]=[t[2],t[1]];
   for(const i of t){const original=representative[ids[i]];patchPositions.push(...positions.subarray(original*3,original*3+3));patchColors.push(...color(i))}
  }
  holes.push({area:Math.abs(area),center:centroid,vertices:ids.length,triangles:tris.length,low,high});
 }
 return {positions:new Float32Array(patchPositions),colors:new Float32Array(patchColors),stats:{vertices:nv,boundaryEdges,holes:holes.length,triangles:patchPositions.length/9,area:holes.reduce((a,h)=>a+h.area,0),skippedOuter,skippedWater,skippedComplex,loops:holes}};
}
