import * as T from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';

// Clip the delivered triangle surfaces, retain authored wire edges, and cap
// actual section contours with their holes. All computations use metres.
export function setupSection3D({model,sections}){
 const $=id=>document.getElementById(id),host=$('section3D'),dialog=$('sectionDialog');
 const categories=new Set(['主桥箱梁','引桥箱梁','调平层','桥面铺装','路基路面','护栏','顶板束','腹板束','底板束','引桥钢束','齿板']);
 const list=model.meshes.filter(m=>categories.has(m.cat));
 const bounds=new Map(list.map(m=>{const b=[Infinity,Infinity,-Infinity,-Infinity];for(let i=0;i<m.v.length;i+=3){b[0]=Math.min(b[0],m.v[i]);b[1]=Math.min(b[1],m.v[i+1]);b[2]=Math.max(b[2],m.v[i]);b[3]=Math.max(b[3],m.v[i+1])}return [m,b]}));
 let renderer,scene,camera,controls,group,active=false,ready=null,generation=0,last=null;
 function frame(s){const p=model.meta.registration,base=p?.pathBase??42160,step=p?.pathStep??.5;let x=0,y=0,a=0;const k=s=>s<42568.513?-1/5520:s<42868.513?-(42868.513-s)/300/5520:s<43168.513?(s-42868.513)/300/2760:1/2760;const n=Math.floor((s-base)/step);for(let i=0;i<n;i++){const c=k(base+(i+.5)*step);x+=step*Math.cos(a+c*step/2);y+=step*Math.sin(a+c*step/2);a+=c*step}const t=(s-base)/step-n,c=k(base+(n+.5)*step);return {x:x+t*step*Math.cos(a+c*step/2)-740,y:y+t*step*Math.sin(a+c*step/2),nx:Math.cos(a+t*c*step),ny:Math.sin(a+t*c*step)}}
 function resize(){if(!renderer)return;const w=host.clientWidth,h=host.clientHeight;if(w&&h){renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix()}}
 async function init(){if(ready)return ready;ready=(async()=>{renderer=new T.WebGPURenderer({antialias:true});await renderer.init();renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));host.append(renderer.domElement);scene=new T.Scene();scene.background=new T.Color('#e7edf2');camera=new T.PerspectiveCamera(40,1,.01,3000);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.2;controls.maxDistance=500;scene.add(new T.HemisphereLight(0xffffff,0x8897a3,2.1));const light=new T.DirectionalLight(0xffffff,2.3);light.position.set(-20,40,30);scene.add(light);renderer.setAnimationLoop(()=>{if(active&&dialog.open){controls.update();renderer.render(scene,camera)}});new ResizeObserver(resize).observe(host);resize()})();return ready}
 function disposeGroup(){if(!group)return;scene.remove(group);group.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});group=null}
 const area=ps=>ps.reduce((sum,a,i)=>{const b=ps[(i+1)%ps.length];return sum+a[0]*b[1]-b[0]*a[1]},0)/2;
 function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes}return yes}
 async function rebuild(){if(!active||!dialog.open)return;const run=++generation;await init();if(run!==generation||!active)return;resize();disposeGroup();group=new T.Group();scene.add(group);
  const s=Number($('sectionStation').value),length=Math.max(.5,Math.min(30,Number($('sectionLength').value)||6));$('sectionLength').value=length;
  const f=frame(s),half=length/2,z0=(sections.latest.low+sections.latest.high)/2,groups=new Map(),caps=[];
  const local=p=>[p[0]-f.x,p[2]-z0,-(p[1]-f.y)],distance=p=>(p[0]-f.x)*f.nx+(p[1]-f.y)*f.ny;
  function batch(m){if(!groups.has(m.cat))groups.set(m.cat,{color:m.cat.endsWith('束')?'#e02127':m.color,vertices:[],edges:[],parts:new Set()});const b=groups.get(m.cat);b.parts.add(m.name);return b}
  function clip(poly,sign){const out=[];if(!poly.length)return out;let a=poly.at(-1),da=half-sign*distance(a);for(const b of poly){const db=half-sign*distance(b);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push(a.map((v,i)=>v+(b[i]-v)*t))}if(db>=0)out.push(b);a=b;da=db}return out}
  function triangle(out,a,b,c){const u=b.map((v,i)=>v-a[i]),v=c.map((q,i)=>q-a[i]);if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-10)return;out.push(...local(a),...local(b),...local(c))}
  let count=0;
  for(const m of list){if(!$('sectionSteel').checked&&m.cat.endsWith('束'))continue;if(m.cat==='齿板'&&!$('sectionTeeth').checked)continue;const b=bounds.get(m);const ds=[[b[0],b[1]],[b[0],b[3]],[b[2],b[1]],[b[2],b[3]]].map(p=>distance(p));if(Math.min(...ds)>half||Math.max(...ds)<-half)continue;const out=batch(m);count++;
   for(let i=0;i<m.f.length;i+=3){let poly=m.f.slice(i,i+3).map(k=>m.v.slice(k*3,k*3+3));poly=clip(clip(poly,1),-1);for(let j=1;j+1<poly.length;j++)triangle(out.vertices,poly[0],poly[j],poly[j+1])}
   for(let i=0;i<m.w.length;i+=2){let a=m.v.slice(m.w[i]*3,m.w[i]*3+3),b=m.v.slice(m.w[i+1]*3,m.w[i+1]*3+3),valid=true;for(const sign of [-1,1]){const da=half-sign*distance(a),db=half-sign*distance(b);if(da<0&&db<0){valid=false;break}if((da>=0)!==(db>=0)){const t=da/(da-db),p=a.map((v,i)=>v+(b[i]-v)*t);if(da<0)a=p;else b=p}}if(valid)out.edges.push(...local(a),...local(b))}
  }
  for(const sign of [-1,1]){const plane={...f,x:f.x+sign*half*f.nx,y:f.y+sign*half*f.ny};const cut=sections.cut(s,plane);
   for(const {m,loops} of cut.result){const out=batch(m);const rings=loops.map(ps=>{const q=ps.slice();if(Math.hypot(q[0][0]-q.at(-1)[0],q[0][1]-q.at(-1)[1])<.0001)q.pop();return q}).filter(q=>q.length>2&&Math.abs(area(q))>1e-10);const data=rings.map((points,i)=>({points,index:i,area:Math.abs(area(points)),parent:-1,depth:0}));
    for(const q of data){const parents=data.filter(p=>p!==q&&p.area>q.area&&inside(q.points[0],p.points)).sort((a,b)=>a.area-b.area);q.parent=parents[0]?.index??-1}
    for(const q of data){let i=q.parent;while(i>=0){q.depth++;i=data[i].parent}}
    const xyz=p=>[plane.x-plane.ny*p[0],plane.y+plane.nx*p[0],p[1]];
    for(const q of data){if(q.depth%2)continue;const holes=data.filter(p=>p.parent===q.index&&p.depth%2);const flat=[q.points,...holes.map(h=>h.points)].flat();const faces=T.ShapeUtils.triangulateShape(q.points.map(p=>new T.Vector2(...p)),holes.map(h=>h.points.map(p=>new T.Vector2(...p))));for(const t of faces)triangle(out.vertices,...t.map(i=>xyz(flat[i])));caps.push({name:m.name,holes:holes.length,triangles:faces.length})}
    for(const q of data)for(let i=0;i<q.points.length;i++)out.edges.push(...local(xyz(q.points[i])),...local(xyz(q.points[(i+1)%q.points.length])));
   }
  }
  let triangles=0;for(const [cat,b] of groups){if(b.vertices.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(b.vertices,3));g.computeVertexNormals();const mesh=new T.Mesh(g,new T.MeshLambertMaterial({color:b.color,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,flatShading:true}));mesh.userData.kind='solid';mesh.userData.category=cat;group.add(mesh);triangles+=b.vertices.length/9}if(b.edges.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(b.edges,3));const line=new T.LineSegments(g,new T.LineBasicMaterial({color:cat.endsWith('束')?'#e02127':'#4c6271',transparent:true,opacity:.45}));line.userData.kind='wire';line.userData.category=cat;group.add(line)}}
  last={station:s,length,parts:count,triangles,caps,backend:renderer.backend.isWebGPUBackend?'WebGPU':'WebGL2'};$('section3DSummary').textContent=`K${Math.floor(s/1000)}+${(s%1000).toFixed(3)} · 截取长度 ${length} m · ${count}构件 · ${last.backend}`;setMode();home();
 }
 function home(){if(!group)return;const box=new T.Box3().setFromObject(group),center=box.getCenter(new T.Vector3()),f=frame(last.station),d=new T.Vector3(f.nx-.4*f.ny,.4,-f.ny-.4*f.nx).normalize(),right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),d).normalize(),up=new T.Vector3().crossVectors(d,right).normalize(),tv=Math.tan(camera.fov*Math.PI/360),th=tv*camera.aspect;let distance=1;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new T.Vector3(x,y,z).sub(center);distance=Math.max(distance,Math.abs(p.dot(up))/tv+p.dot(d),Math.abs(p.dot(right))/th+p.dot(d))}controls.target.copy(center);camera.position.copy(center).add(d.multiplyScalar(distance*1.15));camera.updateProjectionMatrix();controls.update()}
 function setMode(){if(!group)return;const mode=$('section3DMode').value,xray=$('section3DXray').checked;for(const o of group.children){const fade=xray&&['主桥箱梁','引桥箱梁','调平层','桥面铺装','护栏'].includes(o.userData.category);o.visible=o.userData.kind==='solid'?mode!=='wire':mode!=='solid'&&(!fade||mode==='wire');if(o.userData.kind==='solid'){o.material.transparent=fade;o.material.opacity=fade?.15:1;o.material.depthWrite=!fade;o.material.needsUpdate=true;o.renderOrder=fade?2:0}}}
 $('sectionView').onchange=()=>{active=$('sectionView').value==='3d';$('sectionSvg').style.display=active?'none':'';host.hidden=!active;$('section3DTools').hidden=!active;$('sectionSummary').hidden=active;$('section3DSummary').hidden=!active;$('sectionExport').hidden=active;if(active)rebuild().catch(e=>{$('section3DSummary').textContent='三维短段加载失败：'+e.message;console.error(e)})};
 for(const id of ['sectionOpen','sectionPreset','sectionApply','sectionSteel','sectionTeeth']){const el=$(id),event=['sectionOpen','sectionApply'].includes(id)?'onclick':'onchange',before=el[event];el[event]=e=>{before?.(e);if(active)rebuild()}}
 $('sectionLength').onchange=rebuild;$('section3DHome').onclick=home;$('section3DMode').onchange=setMode;$('section3DXray').onchange=setMode;
 addEventListener('pagehide',()=>{disposeGroup();renderer?.dispose();controls?.dispose()},{once:true});
 return {get latest(){return last},get camera(){return camera},get controls(){return controls},get renderer(){return renderer},rebuild};
}
