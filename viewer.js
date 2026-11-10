import {loadModel} from './model_loader.js?v=6e07cff7b6c7';
import * as T from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {loadTerrain} from './terrain.js?v=6e07cff7b6c7';
import {setupCrossSections} from './cross_sections.js?v=6e07cff7b6c7';
import {setupSection3D} from './section_3d.js?v=6e07cff7b6c7';
const $=s=>document.getElementById(s),scene=new T.Scene();scene.background=new T.Color('#e7edf2');
const startupAt=performance.now(),progress=text=>$('status').textContent=text;progress('正在初始化显示…');
const camera=new T.PerspectiveCamera(40,innerWidth/innerHeight,.5,15000),renderer=new T.WebGPURenderer({antialias:true,logarithmicDepthBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);document.body.prepend(renderer.domElement);
await renderer.init();
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.12;controls.maxDistance=6000;controls.minDistance=1;
scene.add(new T.HemisphereLight(0xffffff,0x8897a3,2.1));const light=new T.DirectionalLight(0xffffff,2.3);light.position.set(-200,400,200);scene.add(light);
progress('正在读取桥梁…');
const loaded=await loadModel(progress),model=loaded.model,renderCache=loaded.cache;
window.startupTiming={...loaded.timing,modelReady_ms:performance.now()-startupAt};progress('正在准备桥梁显示…');
const steelCats=new Set(['顶板束','腹板束','底板束','引桥钢束','引桥正弯矩束','引桥负弯矩束']),fadeCats=new Set(['主桥箱梁','引桥箱梁','引桥横梁','引桥堵头板','引桥湿接头','引桥齿板','调平层','桥面铺装','护栏','白色标线']);
const steelScope=document.createElement('small');steelScope.textContent='引桥：第3联25.5m钢束320束；30m正弯矩2496束、负弯矩1624束。按专图与QT通用图恢复，适配长度及待核事项见属性。';$('steelLayers').after(steelScope);
const cats=new Map(),units=new Map(),hiddenUnits=new Set();let detailState=null,detailMeshes=null;let selected=null,highlight=null,highlightWire=null,mode='both',measuring=false,points=[],measureLine=null,xray=false,viewDir=new T.Vector3(.55,.42,.85);
function geometry(pos,indices,edges,ranges,normals=null){
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));g.setIndex(new T.BufferAttribute(indices,1));
 if(normals)g.setAttribute('normal',new T.BufferAttribute(normals,3));else g.computeVertexNormals();g.computeBoundingBox();
 const e=new T.BufferGeometry();e.setAttribute('position',g.attributes.position);e.setIndex(new T.BufferAttribute(edges,1));return {g,e,ranges};
}
function build(list){
 const pos=new Float32Array(list.reduce((s,m)=>s+m.v.length,0)),indices=new Uint32Array(list.reduce((s,m)=>s+m.f.length,0)),edges=new Uint32Array(list.reduce((s,m)=>s+m.w.length,0)),ranges=[];
 let v=0,fi=0,wi=0;
 for(const m of list){for(let i=0;i<m.v.length;i+=3){const k=v*3+i;pos[k]=m.v[i];pos[k+1]=m.v[i+2];pos[k+2]=-m.v[i+1]}
  for(let i=0;i<m.f.length;i++)indices[fi+i]=m.f[i]+v;for(let i=0;i<m.w.length;i++)edges[wi+i]=m.w[i]+v;
  ranges.push({start:fi/3,end:(fi+m.f.length)/3,m});fi+=m.f.length;wi+=m.w.length;v+=m.v.length/3;
 }
 return geometry(pos,indices,edges,ranges);
}
function buildCached(name,list){const c=renderCache?.[name];return c?geometry(c.position,c.faces,c.edges,c.ranges.map(r=>({start:r.start,end:r.end,m:model.meshes[r.mesh]})),c.normal):build(list)}

for(const m of model.meshes){if(!cats.has(m.cat))cats.set(m.cat,{list:[],visible:true});cats.get(m.cat).list.push(m);if(!units.has(m.unit))units.set(m.unit,[]);units.get(m.unit).push(m)}
for(const [name,c] of cats){const {g,e,ranges}=buildCached(name,c.list);c.solid=new T.Mesh(g,new (steelCats.has(name)||name==='白色标线'?T.MeshBasicMaterial:T.MeshLambertMaterial)({color:steelCats.has(name)?'#e02127':c.list[0].color,side:T.DoubleSide,flatShading:true,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));c.solid.userData.ranges=ranges;c.solid.userData.category=name;c.wire=new T.LineSegments(e,new T.LineBasicMaterial({color:steelCats.has(name)?'#e02127':'#4c6271',transparent:true,opacity:.3,depthWrite:false}));scene.add(c.solid,c.wire);const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';c.visible=name!=='预留孔道';box.checked=c.visible;box.dataset.cat=name;box.onchange=()=>{c.visible=box.checked;setMode();cancelSelection()};label.append(box,document.createTextNode(name+(c.list[0].addition?'（'+c.list.length+'）':'')));(c.list[0].addition?$('steelLayers'):$('layers')).append(label)}
function setMode(){mode=$('mode').value;for(const [name,c] of cats){c.solid.visible=c.visible&&!c.detailEmpty&&mode!=='wire';c.wire.visible=c.visible&&!c.detailEmpty&&mode!=='solid'&&(mode==='wire'||!['桥面铺装','路基路面','白色标线','路基边坡','路基填土'].includes(name))&&!(xray&&fadeCats.has(name))&&(!steelCats.has(name)||mode==='wire');c.wire.material.opacity=mode==='wire'?.85:.30}if(highlight)highlight.visible=mode!=='wire';if(highlightWire)highlightWire.visible=mode!=='solid'}
$('mode').onchange=setMode;
const allBounds=new T.Box3();for(const c of cats.values())allBounds.union(c.solid.geometry.boundingBox);
function fit(box,dir=viewDir){const center=box.getCenter(new T.Vector3()),d=dir.clone().normalize(),right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),d).normalize(),up=new T.Vector3().crossVectors(d,right).normalize(),tanV=Math.tan(camera.fov*Math.PI/360),tanH=tanV*camera.aspect;let distance=12;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new T.Vector3(x,y,z).sub(center);distance=Math.max(distance,Math.abs(p.dot(up))/tanV+p.dot(d),Math.abs(p.dot(right))/tanH+p.dot(d))}distance*=1.15;controls.target.copy(center);camera.position.copy(center).add(d.multiplyScalar(distance));camera.near=Math.max(.05,distance/20000);camera.updateProjectionMatrix();controls.update()}
function unitBounds(list){const b=new T.Box3();for(const m of list)for(let i=0;i<m.v.length;i+=3)b.expandByPoint(new T.Vector3(m.v[i],m.v[i+2],-m.v[i+1]));return b}
const mainList=model.meshes.filter(m=>m.cat==='主桥箱梁'||(/(39|40|41|42)号/.test(m.unit)));const mainBounds=unitBounds(mainList);
progress('正在读取测绘地形…');const terrain=await loadTerrain(scene,camera);const sections=setupCrossSections(model);const section3D=setupSection3D({model,sections});$('waterEffect').onchange=()=>terrain.setEffect($('waterEffect').value);$('waterOpacity').oninput=()=>{terrain.setOpacity(Number($('waterOpacity').value)/100);$('waterOpacityValue').textContent=$('waterOpacity').value+'%'};
$('terrainMode').onchange=()=>terrain.setMode($('terrainMode').value);$('water').onchange=()=>terrain.setWater($('water').checked);$('survey').onchange=()=>terrain.setPoints($('survey').checked);$('site').onclick=()=>fit(terrain.bounds);
let oblique={};
function startOblique(){import('./oblique.js?v=6e07cff7b6c7').then(({setupOblique})=>setupOblique({scene,camera,renderer,terrain})).then(layer=>{oblique=layer;if(window.bridge)window.bridge.oblique=layer;window.obliqueReady=true}).catch(e=>{console.error(e);$('status').textContent+=' · 实景暂未载入'})}
function setXray(enabled){xray=enabled;const opacity=Number($('opacity').value)/100;for(const [name,c] of cats){if(fadeCats.has(name)){const m=c.solid.material;m.transparent=xray;m.opacity=xray?opacity:1;m.depthWrite=!xray;m.side=xray?T.FrontSide:T.DoubleSide;m.needsUpdate=true;c.solid.renderOrder=xray?2:0}}$('xray').classList.toggle('active',xray);$('opacityRow').hidden=!xray;$('opacityValue').textContent=$('opacity').value+'%';setMode()}
$('xray').onclick=()=>setXray(!xray);$('opacity').oninput=()=>setXray(true);
$('all').onclick=()=>fit(allBounds);$('main').onclick=()=>fit(mainBounds);$('top').onclick=()=>{viewDir.set(0,1,.0001);fit(selected?unitBounds(units.get(selected.unit)):mainBounds)};$('side').onclick=()=>{viewDir.set(0,.05,1);fit(selected?unitBounds(units.get(selected.unit)):mainBounds)};
function cancelSelection(){selected=null;for(const h of [highlight,highlightWire]){if(h){scene.remove(h);h.geometry.dispose();h.material.dispose()}}highlight=null;highlightWire=null;$('hideSelected').disabled=true;$('info').textContent='点击构件查看图号与尺寸依据。'}
function select(m){cancelSelection();const list=units.get(m.unit).filter(x=>cats.get(x.cat).visible&&!hiddenUnits.has(x.unit)&&(!detailMeshes||detailMeshes.has(x)));if(!list.length)return;selected=m;const {g,e}=build(list);highlight=new T.Mesh(g,new T.MeshBasicMaterial({color:'#e8ab46',transparent:true,opacity:.55,side:T.DoubleSide,depthWrite:false}));highlightWire=new T.LineSegments(e,new T.LineBasicMaterial({color:'#ffab20',depthTest:false}));highlightWire.renderOrder=8;scene.add(highlight,highlightWire);highlight.visible=mode!=='wire';highlightWire.visible=mode!=='solid';$('hideSelected').disabled=false;$('info').textContent=`${m.unit}\n${m.name}\n`+(m.memberId?`单体编号：${m.memberId}\n所属：${m.parentUnit}\n`:'')+`依据：${m.source}\n状态：${m.status}\n`+Object.entries(m.props).map(([k,v])=>`${k}：${v}`).join('\n')}
for(const c of cats.values())c.original={g:c.solid.geometry,e:c.wire.geometry,ranges:c.solid.userData.ranges};
function refreshGeometry(names=null){for(const [name,c] of cats){if(names&&!names.has(name))continue;const list=c.list.filter(m=>!hiddenUnits.has(m.unit)&&(!detailMeshes||detailMeshes.has(m)));if(c.solid.geometry!==c.original.g){c.solid.geometry.dispose();c.wire.geometry.dispose()}c.solid.geometry=c.original.g;c.wire.geometry=c.original.e;c.solid.userData.ranges=c.original.ranges;c.detailEmpty=!list.length;if(list.length&&list.length!==c.list.length){const b=build(list);c.solid.geometry=b.g;c.wire.geometry=b.e;c.solid.userData.ranges=b.ranges}}setMode();$('restoreMembers').textContent=`恢复隐藏单元（${hiddenUnits.size}）`}
$('hideSelected').onclick=()=>{if(!selected)return;const key=selected.unit;hiddenUnits.add(key);const names=new Set(units.get(key).map(m=>m.cat));cancelSelection();refreshGeometry(names)};
$('restoreMembers').onclick=()=>{hiddenUnits.clear();refreshGeometry();cancelSelection()};
const memberParents=new Map();for(const [unit,list] of units){if(!list[0].memberId)continue;const parent=list[0].parentUnit;if(!memberParents.has(parent))memberParents.set(parent,[]);memberParents.get(parent).push({unit,list})}
for(const parent of memberParents.keys()){const o=document.createElement('option');o.value=parent;o.textContent=parent;$('memberParent').append(o)}
function fillMemberList(){const el=$('memberPick');el.replaceChildren();for(const {unit,list} of memberParents.get($('memberParent').value)||[]){const o=document.createElement('option');o.value=unit;o.textContent=unit.includes('／')?unit.split('／')[1]:unit;o.title=list.map(m=>m.name).join('、');el.append(o)}}
$('memberParent').onchange=fillMemberList;fillMemberList();$('selectMember').onclick=()=>{const key=$('memberPick').value;if(hiddenUnits.has(key)){hiddenUnits.delete(key);refreshGeometry(new Set(units.get(key).map(m=>m.cat)))}const m=units.get(key)?.find(m=>cats.get(m.cat).visible&&(!detailMeshes||detailMeshes.has(m)));if(m){select(m);fit(unitBounds(units.get(key)))}else $('info').textContent='请先打开对应构造图层或退出构造近景。'};
$('focus').onclick=()=>{if(selected)fit(unitBounds(units.get(selected.unit)))};
const ray=new T.Raycaster(),mouse=new T.Vector2();let pointerDown=null;
function hit(event){mouse.set(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1);ray.setFromCamera(mouse,camera);const objects=[...cats.values()].filter(c=>c.visible&&!c.detailEmpty&&(!xray||c.solid.material.opacity>=.5)).map(c=>c.solid);const hits=ray.intersectObjects(objects,false);if(!hits.length)return null;const h=hits[0],range=h.object.userData.ranges.find(r=>h.faceIndex>=r.start&&h.faceIndex<r.end);return {...h,m:range.m}}
renderer.domElement.addEventListener('pointerdown',e=>pointerDown=[e.clientX,e.clientY]);
renderer.domElement.addEventListener('pointerup',e=>{if(!pointerDown||Math.hypot(e.clientX-pointerDown[0],e.clientY-pointerDown[1])>5)return;const h=hit(e);if(!h)return;if(measuring){points.push(h.point.clone());if(points.length===2){if(measureLine){scene.remove(measureLine);measureLine.geometry.dispose()}measureLine=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#d85e27',depthTest:false}));measureLine.renderOrder=10;scene.add(measureLine);const d=points[0].distanceTo(points[1]);$('info').textContent=`两点三维距离：${d.toFixed(3)} m\n表面交点，无顶点吸附。\n高差：${Math.abs(points[0].y-points[1].y).toFixed(3)} m`;points=[];measuring=false;$('measure').classList.remove('active');window.lastMeasurement=d}else $('info').textContent='已选第1点，请点击第2点。'}else select(h.m)});
renderer.domElement.addEventListener('dblclick',e=>{const h=hit(e);if(h&&!measuring){select(h.m);fit(unitBounds(units.get(h.m.unit)))}});
$('measure').onclick=()=>{measuring=!measuring;points=[];$('measure').classList.toggle('active',measuring);$('info').textContent=measuring?'依次点击两个可见构件表面点。':'测量已退出。'};
$('clear').onclick=()=>{points=[];measuring=false;$('measure').classList.remove('active');if(measureLine){scene.remove(measureLine);measureLine.geometry.dispose();measureLine=null}window.lastMeasurement=null;$('info').textContent='测量已清除。'};
addEventListener('keydown',e=>{if(e.key==='Escape'){cancelSelection();measuring=false;points=[];$('measure').classList.remove('active')}});
$('hide').onclick=()=>{const h=$('menu').hidden=!$('menu').hidden;$('hide').textContent=h?'显示菜单':'隐藏菜单'};
const labelNodes=model.labels.map((l,i)=>{const el=document.createElement('span');el.className='label';el.textContent=l.name;$('labels').append(el);return {...l,el,p3:new T.Vector3(l.p[0],l.p[2],-l.p[1])}});
let count=0;renderer.setAnimationLoop(()=>{if($('sectionDialog').open&&count>0)return;controls.update();oblique.tick?.();terrain.tick(performance.now()/1000);if((count++%3)===0){const wide=camera.position.distanceTo(controls.target)>600;for(let i=0;i<labelNodes.length;i++){const l=labelNodes[i],v=l.p3.clone().project(camera);const show=$('numbers').checked&&v.z<1&&v.z>-1&&Math.abs(v.x)<1&&Math.abs(v.y)<1&&(!wide||i%4===0||i>=39);l.el.style.display=show?'block':'none';if(show){l.el.style.left=(v.x*.5+.5)*innerWidth+'px';l.el.style.top=(-v.y*.5+.5)*innerHeight+'px'}}}renderer.render(scene,camera)});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
fit(mainBounds);setMode();if(['prestress','approach-prestress'].includes(new URLSearchParams(location.search).get('view')))setXray(true);const backend=renderer.backend.isWebGPUBackend?'WebGPU':'WebGL2';$('status').textContent=`${backend} · ${model.meshes.length}构件 · 主桥 ${model.meshes.filter(m=>['顶板束','腹板束','底板束'].includes(m.cat)).length}束 · 引桥 ${model.meshes.filter(m=>m.approachPrestress).length}束 · ${terrain.data.meta.observations}个高程控制点 · 高程原比例`;
window.bridge={oblique,model,cats,units,hiddenUnits,get highlight(){return highlight},get highlightWire(){return highlightWire},camera,controls,renderer,terrain,sections,section3D,setXray,select,fit,unitBounds,mainBounds,allBounds,get selected(){return selected},get mode(){return mode},project(m){const p=unitBounds([m]).getCenter(new T.Vector3()).project(camera);return {x:(p.x*.5+.5)*innerWidth,y:(-.5*p.y+.5)*innerHeight}}};window.ready=true;window.startupTiming.ready_ms=performance.now()-startupAt;
requestAnimationFrame(()=>{window.startupTiming.firstFrame_ms=performance.now()-startupAt;setTimeout(startOblique,0)});

// Review the corrected drawings at a useful scale; existing layer visibility stays user-controlled.
const detailSelect=document.createElement('select');detailSelect.id='detailPreset';
for(const [value,label] of [['main','主墩支座与挡块'],['transition','42号过渡墩'],['approach','引桥盖梁'],['west','0号桥台与锥坡'],['east','46号桥台与锥坡'],['third','第3联预制箱梁']]){const option=document.createElement('option');option.value=value;option.textContent=label;detailSelect.append(option)}
const detailButton=document.createElement('button');detailButton.id='detailFocus';detailButton.textContent='构造近景';

function restoreDetails(){if(!detailState)return;terrain.setMode(detailState.terrain);$('numbers').checked=detailState.numbers;detailState=null;detailMeshes=null;detailExit.hidden=true;refreshGeometry();cancelSelection()}
const detailExit=document.createElement('button');detailExit.id='detailExit';detailExit.textContent='退出构造近景';detailExit.hidden=true;detailExit.onclick=restoreDetails;
for(const id of ['all','main','site']){const before=$(id).onclick;$(id).onclick=()=>{restoreDetails();before()}}
detailButton.onclick=()=>{const key=detailSelect.value;const list=model.meshes.filter(m=>{
 if(key==='main')return (m.parentUnit||m.unit)==='左幅40号墩'&&!['桩基','承台','墩柱'].includes(m.cat);
 if(key==='transition')return (m.parentUnit||m.unit)==='左幅42号墩'&&m.cat!=='桩基';
 if(key==='approach')return (m.parentUnit||m.unit)==='左幅16号墩'&&!['桩基','墩柱'].includes(m.cat);
 if(key==='third')return m.unit==='左幅第3联'&&m.name.includes('8—9跨');
 const n=key==='west'?'0':'46';return ((m.parentUnit||m.unit)===`左幅${n}号台`&&m.cat!=='桩基')||m.unit.startsWith(`${n}号台左外侧`);
 });
 if(!detailState)detailState={terrain:$('terrainMode').value,numbers:$('numbers').checked};
 const unitSet=new Set(list.map(m=>m.unit));const display=model.meshes.filter(m=>unitSet.has(m.unit)&&m.cat!=='桩基'&&!(key==='main'&&m.cat==='承台'));
 detailMeshes=new Set(display);refreshGeometry();
 terrain.setMode('off');$('numbers').checked=false;detailExit.hidden=false;setMode();cancelSelection();fit(unitBounds(list),new T.Vector3(.65,.40,-1));};
const detailRow=document.createElement('div');detailRow.className='buttons';detailRow.append(detailSelect,detailButton,detailExit);$('sectionOpen').parentElement.after(detailRow);
const approachView=new URLSearchParams(location.search).get('view');
if(approachView==='site')fit(terrain.bounds);
if(approachView==='approach-prestress'){const list=model.meshes.filter(m=>m.approachPrestress);fit(unitBounds(list),new T.Vector3(.15,.65,1));}
if(approachView==='qt-prestress'){
 setXray(true);
 const list=model.meshes.filter(m=>m.qtPrestress&&m.props?.位置?.startsWith('20—21跨/'));
 if(list.length)fit(unitBounds(list),new T.Vector3(.15,.65,1));
 $('sectionOpen').click();$('sectionPreset').selectedIndex=4;$('sectionPreset').dispatchEvent(new Event('change'));
 $('sectionView').value='3d';$('sectionView').dispatchEvent(new Event('change'));
 $('section3DXray').checked=true;$('section3DXray').dispatchEvent(new Event('change'));
}
if(approachView==='approach-general'){
 $('sectionOpen').click();$('sectionPreset').selectedIndex=12;$('sectionPreset').dispatchEvent(new Event('change'));
 $('sectionView').value='3d';$('sectionView').dispatchEvent(new Event('change'));
}
if(approachView==='tooth-sections'){
 $('sectionOpen').click();$('sectionPreset').selectedIndex=6;$('sectionPreset').dispatchEvent(new Event('change'));
 $('sectionView').value='3d';$('sectionView').dispatchEvent(new Event('change'));
 $('section3DXray').checked=true;$('section3DXray').dispatchEvent(new Event('change'));
}
if(['west-abutment','east-abutment'].includes(approachView)){
 const n=approachView==='west-abutment'?0:46;
 const list=model.meshes.filter(m=>m.unit.startsWith(`${n}号台`)||m.unit.includes(`${n}号台台后道路`));
 fit(unitBounds(list),new T.Vector3(n===0?-.65:.65,.8,-.8));
}



addEventListener("pagehide",()=>{oblique.dispose?.();terrain.dispose()},{once:true});
