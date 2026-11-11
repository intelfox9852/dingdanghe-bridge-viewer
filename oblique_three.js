import * as T from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {TilesRenderer} from '3d-tiles-renderer/three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';

const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const mobile=/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent),original=params.get('obliqueLOD')==='original';
export async function main({createRenderer,createGroup,classic=false}){
 $('status').textContent='正在启动'+(classic?'手机兼容显示':'三维显示')+'…';
 const renderer=createRenderer();renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?Math.min(1,Math.sqrt(700000/(innerWidth*innerHeight))):1.5));renderer.setSize(innerWidth,innerHeight);if(renderer.init)await renderer.init();document.body.prepend(renderer.domElement);
 const backend=renderer.backend?.isWebGPUBackend?'WebGPU':'WebGL2';
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();showFailure(new Error('显示内存不足或图形上下文中断，请刷新兼容模式重试'))});
 const scene=new T.Scene();scene.background=new T.Color('#e7edf2');
 const camera=new T.PerspectiveCamera(45,innerWidth/innerHeight,.5,15000),controls=new OrbitControls(camera,renderer.domElement);controls.minDistance=5;controls.maxDistance=6000;
 $('status').textContent='显示已就绪，正在读取实景索引…';
 const revision=new URL(import.meta.url).searchParams.get('v')||params.get('v')||'phone-compatible-20261111';
 const config=await fetch('./oblique/config.json?v='+encodeURIComponent(revision),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('实景配置读取失败');return r.json()});
 const compatible=!!config.mobileEntry&&(((mobile||classic)&&!params.has('obliqueLOD'))||params.get('obliqueLOD')==='mobile');
 const address=compatible?config.mobileEntry:original?config.entry:(config.optimizedEntry||config.entry),tiles=new TilesRenderer(address+'?v='+encodeURIComponent(revision));
 const base=new T.Group();scene.add(base);
 tiles.group.matrixAutoUpdate=false;tiles.group.matrix.fromArray(config.earthToThree);tiles.group.updateMatrixWorld(true);
 const [x0,y0,x1,y1]=config.bounds,group=compatible?new T.Group():createGroup();
 const planes=compatible?[]:[new T.Plane(new T.Vector3(1,0,0),-x0),new T.Plane(new T.Vector3(-1,0,0),x1),new T.Plane(new T.Vector3(0,0,-1),-y0),new T.Plane(new T.Vector3(0,0,1),y1)];if(classic)renderer.localClippingEnabled=true;else if(!compatible)group.clippingPlanes=planes;group.add(tiles.group);scene.add(group);
 const draco=new DRACOLoader(tiles.manager);draco.setDecoderPath('./vendor/oblique-three/examples/jsm/libs/draco/gltf/');draco.setWorkerLimit(mobile?1:2);
 const loader=new GLTFLoader(tiles.manager);loader.setDRACOLoader(draco);if(!compatible){const {MeshoptDecoder}=await import('three/addons/libs/meshopt_decoder.module.js');loader.setMeshoptDecoder(MeshoptDecoder)}tiles.manager.addHandler(/\.(gltf|glb)$/i,loader);
 tiles.setCamera(camera);tiles.setResolutionFromRenderer(camera,renderer);tiles.errorTarget=mobile?64:16;tiles.loadAncestors=true;tiles.loadSiblings=false;
 tiles.downloadQueue.maxJobs=mobile?1:4;tiles.parseQueue.maxJobs=1;tiles.lruCache.minSize=mobile?8:80;tiles.lruCache.maxSize=mobile?24:140;if(mobile){tiles.lruCache.minBytesSize=16*1024*1024;tiles.lruCache.maxBytesSize=24*1024*1024}
 // Show the complete coarse parent before requesting view-dependent children.
 tiles.maxDepth=1;
 let dirty=true,models=0,failures=0,firstVisibleMs=null,lastStatus=0,frames=0,baseStarted=false;
 function frame(near=false){const target=new T.Vector3(near?510:(x0+x1)/2,2,0),range=near?300:Math.max(x1-x0,(y1-y0)*camera.aspect)*.95;controls.target.copy(target);camera.position.copy(target).add(new T.Vector3(range*.12,range*.65,range*.78));controls.update();dirty=true}
 frame();
 function fail(e){failures++;$('error').hidden=false;$('error').textContent=e.error?.message||e.message||String(e);dirty=true}
 tiles.addEventListener('load-model',({scene:content})=>{models++;content.traverse(o=>{if(!o.isMesh)return;const materials=Array.isArray(o.material)?o.material:[o.material];const basic=materials.map(m=>new T.MeshBasicMaterial({map:m.map,color:m.color,side:T.DoubleSide,...(classic?{clippingPlanes:planes}:{})}));o.material=Array.isArray(o.material)?basic:basic[0];materials.forEach(m=>m.dispose())});dirty=true});
 tiles.addEventListener('load-error',fail);tiles.addEventListener('needs-update',()=>dirty=true);
 tiles.addEventListener('tile-visibility-change',()=>dirty=true);
 controls.addEventListener('change',()=>dirty=true);
 $('dataset').value=compatible?'mobile':original?'original':'optimized';$('dataset').onchange=()=>{const u=new URL(location.href);u.searchParams.set('obliqueLOD',$('dataset').value);location.href=u.href};
 $('quality').value=String(tiles.errorTarget);$('quality').onchange=()=>{tiles.errorTarget=Number($('quality').value);dirty=true};
 $('full').onclick=()=>frame();$('near').onclick=()=>frame(true);$('show').onchange=()=>{group.visible=$('show').checked;dirty=true};$('base').onchange=()=>{base.visible=$('base').checked;dirty=true};$('menu').onclick=()=>{$('panel').hidden=!$('panel').hidden;$('menu').textContent=$('panel').hidden?'展开菜单':'隐藏菜单'};
 async function addBase(){
  try{
   const data=await fetch('./terrain.json').then(r=>r.json());
   const geometry=(vertices,indices)=>{const p=new Float32Array(vertices.length);for(let i=0;i<p.length;i+=3){p[i]=vertices[i];p[i+1]=vertices[i+2];p[i+2]=-vertices[i+1]}const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(p,3));g.setIndex(indices);return g};
   const land=new T.Mesh(geometry(data.vertices,data.triangles),new T.MeshBasicMaterial({color:'#3d5b50',side:T.DoubleSide}));
   if(config.coverageTexture){const texture=await new T.TextureLoader().loadAsync(config.coverageTexture);texture.minFilter=T.NearestFilter;texture.magFilter=T.NearestFilter;const uv=[];for(let i=0;i<data.vertices.length;i+=3)uv.push((data.vertices[i]-x0)/(x1-x0),(data.vertices[i+1]-y0)/(y1-y0));land.geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));land.material.alphaMap=texture;land.material.alphaTest=.5}
   base.add(land,new T.Mesh(geometry(data.water.vertices,data.water.triangles),new T.MeshBasicMaterial({color:'#318dc5',side:T.DoubleSide})));dirty=true;
  }catch(e){console.warn('地形底图暂不可用',e)}
 }
 window.obliqueThree={renderer,scene,camera,controls,tiles,group,base,frame,config,classic,compatible,backend,get models(){return models},get failures(){return failures},get firstVisibleMs(){return firstVisibleMs},get frames(){return frames}};
 function animate(now){
  requestAnimationFrame(animate);if(document.hidden)return;
  camera.updateMatrixWorld();tiles.group.updateMatrixWorld(true);if(group.visible)tiles.update();
  if(dirty){dirty=false;renderer.render(scene,camera);frames++;if(firstVisibleMs===null&&tiles.visibleTiles.size){firstVisibleMs=performance.now();window.sceneBoot?.ready();$('timing').textContent=`首批实景 ${(firstVisibleMs/1000).toFixed(2)} 秒 · ${compatible?'手机兼容':original?'原版':'优化'}LOD`;tiles.maxDepth=mobile?2:Infinity;dirty=true;if(!baseStarted){baseStarted=true;addBase()}}}
  if(now-lastStatus>800){$('status').textContent=`${backend}${classic?'兼容':''} · ${firstVisibleMs===null?'正在载入首层 · ':''}已载入 ${models} 个模型 · 显示 ${tiles.visibleTiles.size} 瓦片${mobile?' · 实景缓存 '+(tiles.lruCache.cachedBytes/1048576).toFixed(1)+' MB':''}${failures?' · 失败 '+failures:''}`;lastStatus=now}
 }
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);tiles.setResolutionFromRenderer(camera,renderer);dirty=true});requestAnimationFrame(animate);
}
export function showFailure(e){if(window.sceneBoot)window.sceneBoot.fail(e);else{$('error').hidden=false;$('error').textContent=e.message}console.error(e)}
