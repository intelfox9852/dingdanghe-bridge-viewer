const report=(text,extra={})=>postMessage({type:'progress',text,...extra});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function unshuffle(blockBytes){
 let pending=new Uint8Array(blockBytes),used=0;
 const decode=bytes=>{const count=bytes.length/8,out=new Uint8Array(bytes.length);for(let i=0,j=0;i<count;i++,j+=8){out[j]=bytes[i];out[j+1]=bytes[count+i];out[j+2]=bytes[2*count+i];out[j+3]=bytes[3*count+i];out[j+4]=bytes[4*count+i];out[j+5]=bytes[5*count+i];out[j+6]=bytes[6*count+i];out[j+7]=bytes[7*count+i]}return out};
 return new TransformStream({transform(chunk,controller){let i=0;while(i<chunk.length){const n=Math.min(blockBytes-used,chunk.length-i);pending.set(chunk.subarray(i,i+n),used);used+=n;i+=n;if(used===blockBytes){controller.enqueue(decode(pending));used=0}}},flush(controller){if(used){if(used%8)throw Error('压缩模型数据长度有误');controller.enqueue(decode(pending.subarray(0,used)))}}});
}
async function compressed(url,label,shuffleBytes=0,knownTotal=0){
 const urls=Array.isArray(url)?url:[url];let part=0,reader=null;
 let received=0,last=0,total=knownTotal;
 const input=new ReadableStream({async pull(controller){try{
  while(part<urls.length){if(!reader){const r=await fetch(urls[part]);if(!r.ok)throw Error(label+'读取失败：HTTP '+r.status);if(!total&&urls.length===1)total=Number(r.headers.get('Content-Length'));reader=r.body.getReader()}
   const {value,done}=await reader.read();if(done){reader.releaseLock();reader=null;part++;continue}controller.enqueue(value);return;
  }controller.close();
 }catch(e){controller.error(e)}},cancel(){return reader?.cancel()}});
 const progress=new TransformStream({transform(chunk,controller){received+=chunk.byteLength;const now=performance.now();if(now-last>120){report(`${label} ${(received/1048576).toFixed(1)}${total?' / '+(total/1048576).toFixed(1):''} MB`);last=now}controller.enqueue(chunk)}});
 let stream=input.pipeThrough(progress).pipeThrough(new DecompressionStream('gzip'));if(shuffleBytes)stream=stream.pipeThrough(unshuffle(shuffleBytes));
 return new Response(stream).arrayBuffer();
}
function normals(pos,index){
 const n=new Float32Array(pos.length);
 for(let i=0;i<index.length;i+=3){const a=index[i]*3,b=index[i+1]*3,c=index[i+2]*3;
  const ux=pos[c]-pos[b],uy=pos[c+1]-pos[b+1],uz=pos[c+2]-pos[b+2],vx=pos[a]-pos[b],vy=pos[a+1]-pos[b+1],vz=pos[a+2]-pos[b+2];
  const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx;
  for(const k of [a,b,c]){n[k]+=x;n[k+1]+=y;n[k+2]+=z}
 }
 for(let i=0;i<n.length;i+=3){const length=Math.hypot(n[i],n[i+1],n[i+2])||1;n[i]/=length;n[i+1]/=length;n[i+2]/=length}
 return n;
}
onmessage=async({data:{base}})=>{try{
 const start=performance.now();let manifest;
 for(let attempt=0;attempt<180;attempt++){
  const r=await fetch(new URL('./runtime/manifest.json',base),{cache:'no-cache'});
  if(r.status===503){report('模型已更新，正在准备快速显示文件…');await wait(1000);continue}
  if(r.status===404){report('正在后台读取原始模型…');const response=await fetch(new URL('./model.json',base));if(!response.ok)throw Error('模型读取失败');const model=await response.json();postMessage({type:'ready',model,cache:null,timing:{fallback:true,total_ms:performance.now()-start}});return}
  if(!r.ok)throw Error('模型索引读取失败：HTTP '+r.status);manifest=await r.json();break;
 }
 if(!manifest)throw Error('模型准备超时，请刷新重试');
 report('正在读取压缩模型…');
 const dataURLs=[].concat(manifest.data).map(name=>new URL('./runtime/'+name,base));
 const [buffer,metadata]=await Promise.all([compressed(dataURLs,'读取桥梁',manifest.shuffleBlockBytes,manifest.dataBytes),compressed(new URL('./runtime/'+manifest.metadata,base),'读取构件属性')]);
 report('正在后台整理构件…');
 const payload=JSON.parse(new TextDecoder().decode(metadata)),types={f64:Float64Array,f32:Float32Array,u32:Uint32Array};
 const view=q=>new types[q.type](buffer,q.offset,q.count);
 for(const m of payload.model.meshes){for(const k of ['v','f','w'])m[k]=view(m.geometry[k]);delete m.geometry}
 const transfers=[buffer];
 for(const batch of Object.values(payload.batches)){
  if(batch.meshIndices){
   const items=batch.meshIndices.map(i=>payload.model.meshes[i]);batch.position=new Float32Array(items.reduce((s,m)=>s+m.v.length,0));batch.faces=new Uint32Array(items.reduce((s,m)=>s+m.f.length,0));batch.edges=new Uint32Array(items.reduce((s,m)=>s+m.w.length,0));batch.ranges=[];
   let vi=0,fi=0,wi=0;
   for(let mi=0;mi<items.length;mi++){const m=items[mi];for(let i=0;i<m.v.length;i+=3){const k=vi*3+i;batch.position[k]=m.v[i];batch.position[k+1]=m.v[i+2];batch.position[k+2]=-m.v[i+1]}
    for(let i=0;i<m.f.length;i++)batch.faces[fi+i]=m.f[i]+vi;for(let i=0;i<m.w.length;i++)batch.edges[wi+i]=m.w[i]+vi;
    batch.ranges.push({start:fi/3,end:(fi+m.f.length)/3,mesh:batch.meshIndices[mi]});fi+=m.f.length;wi+=m.w.length;vi+=m.v.length/3;
   }
   delete batch.meshIndices;transfers.push(batch.position.buffer,batch.faces.buffer,batch.edges.buffer);
  }else{batch.position=view(batch.position);batch.faces=view(batch.faces);batch.edges=view(batch.edges)}
  batch.normal=normals(batch.position,batch.faces);transfers.push(batch.normal.buffer);
 }
 postMessage({type:'ready',model:payload.model,cache:payload.batches,timing:{total_ms:performance.now()-start,sourceBytes:manifest.sourceSize,transferBytes:manifest.dataBytes+manifest.metadataBytes,sourceSHA256:manifest.sourceSHA256}},transfers);
}catch(e){postMessage({type:'error',message:e.message})}};
