import {repairAtlas,repairMesh} from './oblique_surface_repair_core.mjs?v=a1b9d191607c';
onmessage=({data})=>{
 try{
  const atlas=repairAtlas(data.pixels,data.width,data.height),mesh=repairMesh({...data,pixels:atlas.pixels});
  postMessage({id:data.id,pixels:atlas.pixels,positions:mesh.positions,colors:mesh.colors,stats:{...mesh.stats,paddingPixels:atlas.filled,unresolvedPixels:atlas.unresolved}},[atlas.pixels.buffer,mesh.positions.buffer,mesh.colors.buffer]);
 }catch(error){postMessage({id:data.id,error:error.message})}
};
