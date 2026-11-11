import * as T from 'three/webgpu';
import {OrbitControls} from './vendor/OrbitControls.js';
import {TilesRenderer} from '3d-tiles-renderer/three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const mobile=/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent),original=params.get('obliqueLOD')==='original';
async function main(){
 const renderer=new T.WebGPURenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1:1.5));renderer.setSize(innerWidth,innerHeight);await renderer.init();document.body.prepend(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color('#e7edf2');
 const camera=new T.PerspectiveCamera(45,innerWidth/innerHeight,.5,15000),controls=new OrbitControls(camera,renderer.domElement);controls.minDistance=5;controls.maxDistance=6000;
 const config=await fetch('./oblique/config.json').then(r=>{if(!r.ok)throw Error('实景配置读取失败');return r.json()});
 const address=original?config.entry:(config.optimizedEntry||config.entry),tiles=new TilesRenderer(address);
 const base=new T.Group();scene.add(base);
 tiles.group.matrixAutoUpdate=false;tiles.group.matrix.fromArray(config.earthToThree);tiles.group.updateMatrixWorld(true);
 const [x0,y0,x1,y1]=config.bounds,group=new T.ClippingGroup();
 group.clippingPlanes=[new T.Plane(new T.Vector3(1,0,0),-x0),new T.Plane(new T.Vector3(-1,0,0),x1),new T.Plane(new T.Vector3(0,0,-1),-y0),new T.Plane(new T.Vector3(0,0,1),y1)];group.add(tiles.group);scene.add(group);
 const draco=new DRACOLoader(tiles.manager);draco.setDecoderPath('./vendor/oblique-three/examples/jsm/libs/draco/gltf/');draco.setWorkerLimit(mobile?1:2);
 const loader=new GLTFLoader(tiles.manager);loader.setDRACOLoader(draco);loader.setMeshoptDecoder(MeshoptDecoder);tiles.manager.addHandler(/\.(gltf|glb)$/i,loader);
 tiles.setCamera(camera);tiles.setResolutionFromRenderer(camera,renderer);tiles.errorTarget=mobile?32:16;tiles.loadAncestors=true;tiles.loadSiblings=false;
 tiles.downloadQueue.maxJobs=mobile?2:4;tiles.parseQueue.maxJobs=1;tiles.lruCache.minSize=mobile?40:80;tiles.lruCache.maxSize=mobile?80:140;
 // Show the complete coarse parent before requesting view-dependent children.
 tiles.maxDepth=1;
 let dirty=true,models=0,failures=0,firstVisibleMs=null,lastStatus=0,frames=0,baseStarted=false;
 function frame(near=false){const target=new T.Vector3(near?510:(x0+x1)/2,2,0),range=near?300:Math.max(x1-x0,(y1-y0)*camera.aspect)*.95;controls.target.copy(target);camera.position.copy(target).add(new T.Vector3(range*.12,range*.65,range*.78));controls.update();dirty=true}
 frame();
 function fail(e){failures++;$('error').hidden=false;$('error').textContent=e.error?.message||e.message||String(e);dirty=true}
 tiles.addEventListener('load-model',({scene:content})=>{models++;content.traverse(o=>{if(!o.isMesh)return;const materials=Array.isArray(o.material)?o.material:[o.material];const basic=materials.map(m=>new T.MeshBasicMaterial({map:m.map,color:m.color,side:T.DoubleSide}));o.material=Array.isArray(o.material)?basic:basic[0];materials.forEach(m=>m.dispose())});dirty=true});
 tiles.addEventListener('load-error',fail);tiles.addEventListener('needs-update',()=>dirty=true);
 tiles.addEventListener('tile-visibility-change',()=>dirty=true);
 controls.addEventListener('change',()=>dirty=true);
 $('dataset').value=original?'original':'optimized';$('dataset').onchange=()=>{const u=new URL(location.href);u.searchParams.set('obliqueLOD',$('dataset').value);location.href=u.href};
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
 window.obliqueThree={renderer,scene,camera,controls,tiles,group,base,frame,config,get models(){return models},get failures(){return failures},get firstVisibleMs(){return firstVisibleMs},get frames(){return frames}};
 function animate(now){
  requestAnimationFrame(animate);if(document.hidden)return;
  camera.updateMatrixWorld();tiles.group.updateMatrixWorld(true);if(group.visible)tiles.update();
  if(dirty){dirty=false;renderer.render(scene,camera);frames++;if(firstVisibleMs===null&&tiles.visibleTiles.size){firstVisibleMs=performance.now();$('timing').textContent=`首批实景 ${(firstVisibleMs/1000).toFixed(2)} 秒 · ${original?'原版':'优化'}LOD`;tiles.maxDepth=Infinity;dirty=true;if(!baseStarted){baseStarted=true;addBase()}}}
  if(now-lastStatus>800){$('status').textContent=`${renderer.backend.isWebGPUBackend?'WebGPU':'WebGL2'} · 已载入 ${models} 个模型 · 显示 ${tiles.visibleTiles.size} 瓦片${failures?' · 失败 '+failures:''}`;lastStatus=now}
 }
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);tiles.setResolutionFromRenderer(camera,renderer);dirty=true});requestAnimationFrame(animate);
}
main().catch(e=>{$('error').hidden=false;$('error').textContent=e.message;console.error(e)});
