import * as T from 'three';
import {TilesRenderer} from '3d-tiles-renderer/three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';

// A running page can still hold an older terrain module across a viewer update.
// Restore the visibility contract as well as versioning the module imports.
export function ensureTerrainOblique(terrain){
 if(typeof terrain.setOblique==='function')return {legacy:false,set:terrain.setOblique.bind(terrain)};
 let active=false;
 const update=()=>{if(terrain.land)terrain.land.visible=terrain.mode==='3d'&&!active};
 for(const name of ['setMode','setWater','setPoints','setReference']){
  if(typeof terrain[name]!=='function')continue;
  const original=terrain[name].bind(terrain);terrain[name]=(...args)=>{const result=original(...args);update();return result};
 }
 terrain.setOblique=value=>{active=Boolean(value);update()};
 return {legacy:true,set:terrain.setOblique};
}

export async function setupOblique({scene,camera,renderer,terrain}){
 const terrainAPI=ensureTerrainOblique(terrain),setTerrainOblique=terrainAPI.set;
 const el=document.createElement('section');el.id='obliqueControls';
 el.innerHTML='<div class="rule"></div><b>倾斜摄影</b><label><input id="obliqueShow" type="checkbox" checked>显示倾斜摄影（地形图范围内）</label><select id="obliqueQuality" aria-label="倾斜摄影精度"><option value="32">流畅</option><option value="16" selected>均衡</option><option value="8">精细</option></select><label>高程微调 <input id="obliqueHeight" type="number" value="0" min="-200" max="200" step="0.1" style="width:85px"> m</label><small id="obliqueStatus">正在读取实景入口…</small><small style="display:block">按测绘图边界裁剪，缺覆盖处保留测绘地形。小孔按邻面补齐，河道与外边界保持开放；缺失处为插值表面。</small>';
 document.getElementById('site').parentElement.after(el);
 const $=s=>document.getElementById(s),status=$('obliqueStatus');
 let config,tiles,group,repair,models=0,failures=0,lastText=0,enabled=true,disposed=false;
 const current={legacyTerrainAdapter:terrainAPI.legacy,get tiles(){return tiles},get group(){return group},get config(){return config},get models(){return models},get failures(){return failures},get enabled(){return enabled},get repair(){return repair}};
 try{
  const response=await fetch('./oblique/config.json?v=1b0ea059a1fb',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('未生成倾斜摄影配置');config=await response.json();
  if(config.processedSource){const note=el.querySelector('small:last-child');note.textContent='使用重新处理的实景原始层级和纹理；按测绘图1700×600m边界显示裁剪，范围外不显示。';}
  if(config.coverageTexture&&typeof terrain.setObliqueCoverage==='function')await terrain.setObliqueCoverage(config.coverageTexture);
  if(!config.staticRelease){const probe=await fetch(config.sourceRoute+(config.sourceIndex||'3dtile.json'),{method:'HEAD',signal:AbortSignal.timeout(10000)});
   if(!probe.ok)throw Error('需使用支持实景目录的本地入口（运行 local_preview.py）');}
  tiles=new TilesRenderer(config.entry);tiles.group.matrixAutoUpdate=false;tiles.group.matrix.fromArray(config.earthToThree);tiles.group.updateMatrixWorld(true);
  group=new T.ClippingGroup();group.name='倾斜摄影：测绘图范围裁剪';
  const [x0,y0,x1,y1]=terrain.footprint?.bounds??config.bounds;
  group.clippingPlanes=[new T.Plane(new T.Vector3(1,0,0),-x0),new T.Plane(new T.Vector3(-1,0,0),x1),
   new T.Plane(new T.Vector3(0,0,-1),-y0),new T.Plane(new T.Vector3(0,0,1),y1)];
  group.add(tiles.group);scene.add(group);
  tiles.registerPlugin({name:'terrain-footprint-prefilter',preprocessNode(tile){
   tile.children=tile.children.filter(child=>{
    const sphere=child.boundingVolume?.sphere;if(!sphere)return true;
    const center=new T.Vector3(...sphere.slice(0,3)).applyMatrix4(tiles.group.matrix),r=sphere[3]*1.02;
    return center.x+r>=x0&&center.x-r<=x1&&center.z+r>=-y1&&center.z-r<=-y0;
   });
  }});
  const draco=new DRACOLoader(tiles.manager);draco.setDecoderPath('./vendor/oblique-three/examples/jsm/libs/draco/gltf/');draco.setWorkerLimit(2);
  const gltf=new GLTFLoader(tiles.manager);gltf.setDRACOLoader(draco);tiles.manager.addHandler(/\.(gltf|glb)$/i,gltf);
  tiles.setCamera(camera);tiles.setResolutionFromRenderer(camera,renderer);tiles.errorTarget=16;tiles.loadAncestors=true;tiles.loadSiblings=true;
  tiles.lruCache.maxSize=180;tiles.lruCache.minSize=120;tiles.downloadQueue.maxJobs=3;tiles.parseQueue.maxJobs=1;
  repair={add(){},remove(){},dispose(){},enabled:true,get stats(){return {models,holes:0,pending:0,errors:0,pendingBlackMeshes:0}},details:[]};
  tiles.addEventListener('load-model',({scene:content})=>{
   models++;content.traverse(o=>{if(!o.isMesh)return;const old=Array.isArray(o.material)?o.material:[o.material];
    const converted=old.map(m=>new T.MeshBasicMaterial({map:m.map,color:m.color,side:T.DoubleSide,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest}));
    o.material=Array.isArray(o.material)?converted:converted[0];for(const m of old)m.dispose();
   });
   repair.add(content);sync();
  });
  tiles.addEventListener('dispose-model',({scene:content})=>{repair.remove(content);content.traverse(o=>{if(o.isMesh&&!o.userData.obliqueRepair)for(const m of (Array.isArray(o.material)?o.material:[o.material]))m.dispose()})});
  tiles.addEventListener('load-error',e=>{failures++;status.textContent=`部分实景瓦片读取失败（${failures}）：${e.error?.message||e.url}`;});
  function sync(){group.visible=enabled&&terrain.mode==='3d';setTerrainOblique(group.visible&&models>0)}
  $('obliqueShow').onchange=()=>{enabled=$('obliqueShow').checked;sync()};
  $('obliqueQuality').onchange=()=>tiles.errorTarget=Number($('obliqueQuality').value);
  $('obliqueHeight').onchange=()=>{const h=Number($('obliqueHeight').value);if(Number.isFinite(h)&&Math.abs(h)<=200){group.position.y=h;group.updateMatrixWorld(true)}};
  const oldMode=$('terrainMode').onchange;$('terrainMode').onchange=()=>{oldMode();sync()};
  sync();
  current.tick=()=>{
   if(disposed)return;
   // Detail views change terrain mode directly, as well as through the menu.
   const visible=enabled&&terrain.mode==='3d';
   if(group.visible!==visible){group.visible=visible;setTerrainOblique(visible&&models>0)}
   if(!visible)return;
   camera.updateMatrixWorld();tiles.group.updateMatrixWorld(true);tiles.update();
   const now=performance.now();if(now-lastText>800){status.textContent=`已载入 ${models} 个实景模型 · 显示 ${tiles.visibleTiles.size} 瓦片${failures?' · 失败 '+failures:''}`;lastText=now}
  };
  current.dispose=()=>{disposed=true;tiles.dispose();repair.dispose();draco.dispose();scene.remove(group);setTerrainOblique(false)};
  status.textContent=`实景入口已就绪，范围内 ${config.retainedRootTiles}/${config.sourceRootTiles} 个根瓦片`;
 }catch(e){status.textContent='倾斜摄影未加载：'+e.message;$('obliqueShow').checked=false;enabled=false;setTerrainOblique(false)}
 return current;
}
