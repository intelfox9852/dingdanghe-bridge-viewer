import * as T from 'three';

export function createSurfaceRepair({tiles,bounds,water:waterRings=[]}){
 const worker=new Worker(new URL('./oblique_repair_worker.js',import.meta.url),{type:'module'}),records=new Map(),queue=[];
 let serial=0,busy=false,enabled=true,disposed=false;
 const totals={models:0,holes:0,triangles:0,area:0,paddingPixels:0,errors:0};
 function pump(){if(disposed||busy)return;let task;while(queue.length){task=queue.shift();if(records.has(task.id))break;task=null}if(!task)return;busy=true;worker.postMessage(task,[task.positions.buffer,task.indices.buffer,task.uv.buffer,task.pixels.buffer])}
 function apply(r){
  // A newly arrived LOD must never render its unrepaired black atlas for one frame.
  r.material.map=enabled?(r.repairedTexture??null):r.originalTexture;
  r.material.color.copy(enabled&&!r.repairedTexture?new T.Color('#254f39'):r.originalColor);
  r.material.needsUpdate=true;if(r.patch)r.patch.visible=enabled;
 }
 worker.onmessage=({data})=>{busy=false;const r=records.get(data.id);
  if(r){if(data.error){r.error=data.error;totals.errors++}else{
   const texture=new T.DataTexture(data.pixels,r.width,r.height,T.RGBAFormat);texture.colorSpace=r.originalTexture.colorSpace;texture.flipY=r.originalTexture.flipY;texture.wrapS=r.originalTexture.wrapS;texture.wrapT=r.originalTexture.wrapT;texture.offset.copy(r.originalTexture.offset);texture.repeat.copy(r.originalTexture.repeat);texture.center.copy(r.originalTexture.center);texture.rotation=r.originalTexture.rotation;texture.channel=r.originalTexture.channel;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;r.repairedTexture=texture;r.stats=data.stats;
   if(data.positions.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(data.positions,3));g.computeBoundingSphere();const patch=new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide,color:'#254f39'}));patch.name='实景内部孔洞修补（农田深绿色）';patch.userData.obliqueRepair=true;patch.frustumCulled=false;r.mesh.add(patch);r.patch=patch}
   for(const key of ['holes','triangles','area','paddingPixels'])totals[key]+=data.stats[key];totals.models++;apply(r);
  }}pump();
 };
 worker.onerror=e=>{totals.errors++;busy=false;console.warn('实景表面修补：',e.message);pump()};
 function add(content){
  const meshes=[];content.traverse(o=>{if(o.isMesh&&!o.userData.obliqueRepair)meshes.push(o)});
  for(const mesh of meshes){const material=mesh.material;if(Array.isArray(material)||!material.map||!mesh.geometry.attributes.uv)continue;
   const image=material.map.image,width=image.width,height=image.height;if(!width||!height)continue;
   try{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,width,height).data;
    const geometry=mesh.geometry,p=geometry.attributes.position,u=geometry.attributes.uv,positions=new Float32Array(p.count*3),uv=new Float32Array(p.count*2);
    for(let i=0;i<p.count;i++){positions.set([p.getX(i),p.getY(i),p.getZ(i)],i*3);uv.set([u.getX(i),u.getY(i)],i*2)}
    const indices=geometry.index?Uint32Array.from(geometry.index.array):Uint32Array.from({length:p.count},(_,i)=>i);
    mesh.updateMatrix();const matrix=mesh.matrix.clone();let parent=mesh.parent;
    while(parent&&parent!==tiles.group){parent.updateMatrix();matrix.premultiply(parent.matrix);parent=parent.parent}
    matrix.premultiply(tiles.group.matrix);
    const id=++serial,record={content,mesh,material,originalTexture:material.map,originalColor:material.color.clone(),width,height};records.set(id,record);
    queue.push({id,positions,indices,uv,matrix:matrix.toArray(),water:waterRings,bounds,pixels,width,height,flipY:record.originalTexture.flipY});apply(record);
   }catch(e){totals.errors++;console.warn('实景修补跳过不可读纹理：',e.message)}
  }pump();
 }
 function remove(content){for(const [id,r]of records)if(r.content===content){r.repairedTexture?.dispose();if(r.patch){r.mesh.remove(r.patch);r.patch.geometry.dispose();r.patch.material.dispose()}records.delete(id)}}
 return {add,remove,setEnabled(value){enabled=Boolean(value);for(const r of records.values())apply(r)},get enabled(){return enabled},get stats(){return {...totals,pending:queue.length+(busy?1:0),active:records.size,pendingBlackMeshes:[...records.values()].filter(r=>enabled&&!r.repairedTexture&&r.material.map!==null).length}},get details(){return [...records.values()].filter(r=>r.stats).map(r=>r.stats)},dispose(){disposed=true;worker.terminate();for(const r of [...records.values()])remove(r.content);queue.length=0}};
}
