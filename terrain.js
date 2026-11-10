import * as T from 'three';
import {createWaterReflection,createWaterMaterial} from './three-water.mjs';
export async function loadTerrain(scene,camera){
 const data=await fetch('./terrain.json').then(r=>{if(!r.ok)throw Error('三维地形文件未找到');return r.json()});
 const extent=[Infinity,Infinity,-Infinity,-Infinity];for(let i=0;i<data.vertices.length;i+=3){extent[0]=Math.min(extent[0],data.vertices[i]);extent[1]=Math.min(extent[1],data.vertices[i+1]);extent[2]=Math.max(extent[2],data.vertices[i]);extent[3]=Math.max(extent[3],data.vertices[i+1])}
 const [xmin,ymin,xmax,ymax]=extent;let coverageMask=null,coverageURL=null;
 const texture=await new T.TextureLoader().loadAsync(data.texture);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
 function geometry(vertices,faces,uvs=true){const pos=[],uv=[];for(let i=0;i<vertices.length;i+=3){const [x,y,z]=vertices.slice(i,i+3);pos.push(x,z,-y);uv.push((x-xmin)/(xmax-xmin),(y-ymin)/(ymax-ymin))}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));if(uvs)g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(faces);g.computeVertexNormals();g.computeBoundingBox();return g}
 const landMaterial=new T.MeshBasicMaterial({map:texture,color:'#a4b28e',side:T.DoubleSide});
 const land=new T.Mesh(geometry(data.vertices,data.triangles),landMaterial);land.name='测绘点三维TIN地形';scene.add(land);
 const flat=new T.Mesh(geometry([xmin,ymin,0,xmax,ymin,0,xmax,ymax,0,xmin,ymax,0],[0,1,2,0,2,3]),landMaterial);flat.name='平面测绘底图';flat.visible=false;scene.add(flat);
 const referenceLevel=data.meta.heightRange[0]-.5;
 const reference=new T.Mesh(geometry([xmin,ymin,referenceLevel,xmax,ymin,referenceLevel,xmax,ymax,referenceLevel,xmin,ymax,referenceLevel],[0,1,2,0,2,3]),landMaterial);reference.name='已合并，无独立叠加底图';reference.visible=false;
 const water=new T.Mesh(geometry(data.water.vertices,data.water.triangles,false),new T.MeshBasicMaterial({color:'#318dc5',side:T.DoubleSide}));water.name='1.77m参考水面';water.renderOrder=1;scene.add(water);
 const plainWater=water.material;
 const reflection=createWaterReflection({scene,camera,waterLevel:1.77,resolutionScale:.5});
 const waterEffect=createWaterMaterial({camera,waterLevel:1.77,reflection:reflection.node,opacity:.94,palette:{deep:0x1c6389,shallow:0x287ba4,side:0x245f88,reflectionTint:[.60,.82,1]},rippleScale:1.1,distortion:.0006,reflectionBlur:1.4});
 waterEffect.material.side=T.DoubleSide;water.material=waterEffect.material;
 const surveyPositions=[];for(let i=0;i<data.meta.observations*3;i+=3)surveyPositions.push(data.vertices[i],data.vertices[i+2]+.15,-data.vertices[i+1]);const surveyGeometry=new T.BufferGeometry();surveyGeometry.setAttribute('position',new T.Float32BufferAttribute(surveyPositions,3));const survey=new T.Points(surveyGeometry,new T.PointsMaterial({color:'#c86d2c',size:1.2,sizeAttenuation:true}));survey.visible=false;scene.add(survey);
 let mode='3d',waterOn=true,pointsOn=false,obliqueOn=false;
 let referenceOn=true;
 let effectMode='reflection',updates=0;
 function update(){const mask=obliqueOn&&mode==='3d'?coverageMask:null;if(landMaterial.alphaMap!==mask){landMaterial.alphaMap=mask;landMaterial.alphaTest=mask?.5:0;landMaterial.needsUpdate=true}land.visible=mode==='3d'&&(!obliqueOn||Boolean(coverageMask));reference.visible=false;flat.visible=mode==='2d';water.visible=mode==='3d'&&waterOn;survey.visible=mode==='3d'&&pointsOn}
 return {apiVersion:3,footprint:{bounds:extent},get obliqueFallback(){return {active:obliqueOn&&Boolean(coverageMask),coverageURL}},async setObliqueCoverage(url){if(coverageURL===url)return;const tex=await new T.TextureLoader().loadAsync(url);tex.minFilter=T.NearestFilter;tex.magFilter=T.NearestFilter;coverageMask?.dispose();coverageMask=tex;coverageURL=url;update()},setOblique(value){obliqueOn=value;update()},data,land,flat,water,survey,reference,reflection,waterEffect,get waterUpdates(){return updates},setEffect(value){effectMode=value;water.material=value==='reflection'?waterEffect.material:plainWater},setOpacity(value){waterEffect.setOpacity(value);plainWater.transparent=value<1;plainWater.opacity=value;plainWater.needsUpdate=true},tick(seconds){if(water.visible&&effectMode==='reflection'&&!document.hidden){waterEffect.update(seconds);updates++}},dispose(){coverageMask?.dispose();waterEffect.dispose();reflection.dispose();plainWater.dispose()},setReference(value){referenceOn=value;update()},setMode(value){mode=value;update()},setWater(value){waterOn=value;update()},setPoints(value){pointsOn=value;update()},get mode(){return mode},bounds:new T.Box3(new T.Vector3(xmin,data.meta.heightRange[0],-ymax),new T.Vector3(xmax,data.meta.heightRange[1],-ymin))};
}
