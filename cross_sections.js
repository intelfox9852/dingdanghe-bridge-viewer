// Cuts delivered component triangles with a plane normal to the route tangent.
export function setupCrossSections(model){
 const $=id=>document.getElementById(id),base=42160,step=.5,path=[[0,0,0]];
 const k=s=>s<42568.513?-1/5520:s<42868.513?-(42868.513-s)/300/5520:s<43168.513?(s-42868.513)/300/2760:1/2760;
 for(let i=0;i<2960;i++){const [x,y,a]=path.at(-1),c=k(base+(i+.5)*step);path.push([x+step*Math.cos(a+c*step/2),y+step*Math.sin(a+c*step/2),a+c*step])}
 const categories=new Set(['主桥箱梁','引桥箱梁','调平层','桥面铺装','路基路面','护栏','顶板束','腹板束','底板束']);
 const meshes=model.meshes.filter(m=>categories.has(m.cat)).map(m=>{const b=[Infinity,Infinity,-Infinity,-Infinity];for(let i=0;i<m.v.length;i+=3){b[0]=Math.min(b[0],m.v[i]);b[1]=Math.min(b[1],m.v[i+1]);b[2]=Math.max(b[2],m.v[i]);b[3]=Math.max(b[3],m.v[i+1])}return {m,b}});
 const presets=[['主桥 · 40号墩横隔梁',model.stations[40]+.3],['主桥 · 0号块端截面',model.stations[40]+5.9],['主桥 · 8号悬浇块',model.stations[40]+31],['主桥 · 中跨跨中',((model.stations[40]+model.stations[41])/2)+.2],['引桥 · 30m跨中',((model.stations[20]+model.stations[21])/2)],['引桥 · 第3联25.5m跨中',(model.stations[8]+model.stations[9])/2]];
 for(const [label,s] of presets){const o=document.createElement('option');o.textContent=label;o.value=s;$('sectionPreset').append(o)}
 function cut(s){const t=(s-base)/step,i=Math.floor(t),r=t-i;const [x,y,a]=path[i].map((v,j)=>v*(1-r)+path[i+1][j]*r);const cx=x-740,cy=y,nx=Math.cos(a),ny=Math.sin(a);const result=[];let low=Infinity,high=-Infinity;
  for(const {m,b} of meshes){if(!$('sectionSteel').checked&&m.cat.endsWith('束'))continue;const ds=[[b[0],b[1]],[b[0],b[3]],[b[2],b[1]],[b[2],b[3]]].map(([x,y])=>(x-cx)*nx+(y-cy)*ny);if(Math.min(...ds)>0||Math.max(...ds)<0)continue;
   const segments=new Map();const pointMap=new Map();const v=m.v,f=m.f;
   const key=p=>p.map(x=>Math.round(x*1e5)).join(',');
   for(let j=0;j<f.length;j+=3){const tri=f.slice(j,j+3).map(idx=>{const p=v.slice(idx*3,idx*3+3);return {p,d:(p[0]-cx)*nx+(p[1]-cy)*ny}});const hits=[];
    for(let h=0;h<3;h++){const q=tri[h],p=tri[(h+1)%3];if((p.d>=0)!==(q.d>=0)){const t=q.d/(q.d-p.d),xx=q.p[0]+(p.p[0]-q.p[0])*t,yy=q.p[1]+(p.p[1]-q.p[1])*t,z=q.p[2]+(p.p[2]-q.p[2])*t;hits.push([-(xx-cx)*ny+(yy-cy)*nx,z])}}
    if(hits.length===2){const [a,b]=hits.map(key);if(a===b)continue;pointMap.set(a,hits[0]);pointMap.set(b,hits[1]);segments.set('raw'+j,[a,b])}}
   const raw=[...segments.values()];segments.clear();const allPoints=[...pointMap.entries()];
   // Split shared, collinear interfaces before cancelling internal boundaries.
   for(const [a,b] of raw){const pa=pointMap.get(a),pb=pointMap.get(b),dx=pb[0]-pa[0],dy=pb[1]-pa[1],len2=dx*dx+dy*dy;const cuts=allPoints.map(([key,p])=>({key,t:((p[0]-pa[0])*dx+(p[1]-pa[1])*dy)/len2,cross:Math.abs((p[0]-pa[0])*dy-(p[1]-pa[1])*dx)})).filter(q=>q.t>=-1e-6&&q.t<=1+1e-6&&q.cross<Math.sqrt(len2)*.000015).sort((a,b)=>a.t-b.t);for(let i=0;i<cuts.length-1;i++){const a=cuts[i].key,b=cuts[i+1].key;if(a===b||cuts[i+1].t-cuts[i].t<1e-7)continue;const id=[a,b].sort().join('|');if(segments.has(id))segments.delete(id);else segments.set(id,[a,b])}}
   const adjacency=new Map();for(const [a,b] of segments.values()){if(!adjacency.has(a))adjacency.set(a,[]);if(!adjacency.has(b))adjacency.set(b,[]);adjacency.get(a).push(b);adjacency.get(b).push(a)}
   const used=new Set(),loops=[];
   for(const [first,second] of segments.values()){if(used.has([first,second].sort().join('|')))continue;const points=[pointMap.get(first)];let prev=first,cur=second;used.add([first,second].sort().join('|'));for(let count=0;count<segments.size+1;count++){points.push(pointMap.get(cur));if(cur===first)break;const next=(adjacency.get(cur)||[]).find(n=>n!==prev&&!used.has([cur,n].sort().join('|')));if(!next)break;used.add([cur,next].sort().join('|'));prev=cur;cur=next}if(points.length>2)loops.push(points)}
   if(loops.length){for(const loop of loops)for(const p of loop){low=Math.min(low,p[1]);high=Math.max(high,p[1])}result.push({m,loops})}}
  return {result,low,high};}
 let latest=null;
 function render(){const s=Number($('sectionStation').value);if(!(s>model.stations[0]&&s<model.stations.at(-1))){$('sectionSummary').textContent='请输入桥梁范围内的桩号。';return}const {result,low,high}=cut(s);latest={s,result,low,high};const minY=-high-.85,height=Math.max(5,high-low+1.7);const paths=result.map(({m,loops})=>`<path d="${loops.map(ps=>'M'+ps.map(p=>p[0].toFixed(4)+','+(-p[1]).toFixed(4)).join('L')+'Z').join(' ')}" fill="${m.cat.endsWith('束')?'#e02127':['桥面铺装','路基路面'].includes(m.cat)?'#536779':m.cat==='调平层'?'#d5c9ab':m.cat==='护栏'?'#ccd5dc':'#c7d3db'}" stroke="${m.cat.endsWith('束')?'#c22226':'#405e71'}" stroke-width=".018" fill-rule="evenodd"><title>${m.name}</title></path>`).join('');
  $('sectionSvg').setAttribute('viewBox',`-15 ${minY} 30 ${height}`);$('sectionSvg').innerHTML=paths+`<path d="M0 ${-high-.3}V${-low+.3}" stroke="#95a6b4" stroke-width=".015" stroke-dasharray=".12 .12"/>`;
  if(!Number.isFinite(low)){$('sectionSvg').innerHTML='';$('sectionSummary').textContent='该桩号位于构件间隙，请稍作调整。';return}
  $('sectionSummary').textContent=`K${Math.floor(s/1000)}+${(s%1000).toFixed(3)} · 逆桩号方向看 · 实际模型剖切 · 高程 ${low.toFixed(3)}—${high.toFixed(3)} m · ${result.length}构件`;
 }
 $('sectionOpen').onclick=()=>{$('sectionDialog').showModal();$('sectionStation').value=$('sectionPreset').value;render()};$('sectionClose').onclick=()=>$('sectionDialog').close();$('sectionPreset').onchange=()=>{$('sectionStation').value=$('sectionPreset').value;render()};$('sectionApply').onclick=render;$('sectionSteel').onchange=render;
 $('sectionExport').onclick=()=>{const text=new XMLSerializer().serializeToString($('sectionSvg'));const blob=new Blob([text],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='桥梁横断面.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 return {render,get latest(){return latest}};
}
