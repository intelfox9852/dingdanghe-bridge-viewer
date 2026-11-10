export const mobileDevice=/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&innerWidth<1000);
const requestedQuality=new URLSearchParams(location.search).get('quality');
export const lightweight=requestedQuality==='mobile'||(mobileDevice&&requestedQuality!=='full');
export function loadModel(onProgress){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./model_worker.js?v=3ec7c271a8e5',import.meta.url),{type:'module'});let timer;
  function stop(){clearTimeout(timer);worker.terminate()}
  function reset(){clearTimeout(timer);timer=setTimeout(()=>{stop();reject(Error('模型读取超过60秒没有响应，请重试或检查本地服务。'))},60000)}
  worker.onmessage=({data})=>{reset();if(data.type==='progress')onProgress(data.text);else if(data.type==='ready'){
   stop();let propertiesPromise=null;
   data.loadProperties=()=>propertiesPromise??(propertiesPromise=(async()=>{if(!data.propertiesURL)return;const r=await fetch(data.propertiesURL);if(!r.ok)throw Error('构件属性读取失败');const payload=await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();payload.props.forEach((props,i)=>{data.model.meshes[i].props=props});data.model.meta=payload.meta;data.propertiesLoaded=true})().catch(e=>{propertiesPromise=null;throw e}));
   data.propertiesLoaded=!data.propertiesURL;resolve(data);
  }else if(data.type==='error'){stop();reject(Error(data.message))}};
  worker.onerror=e=>{stop();reject(Error('后台模型读取失败：'+e.message))};reset();worker.postMessage({base:new URL('./',import.meta.url).href,mobile:lightweight});
 });
}
