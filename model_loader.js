export function loadModel(onProgress){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./model_worker.js?v=875bada405be',import.meta.url),{type:'module'});let timer;
  function stop(){clearTimeout(timer);worker.terminate()}
  function reset(){clearTimeout(timer);timer=setTimeout(()=>{stop();reject(Error('模型读取超过60秒没有响应，请重试或检查本地服务。'))},60000)}
  worker.onmessage=({data})=>{reset();if(data.type==='progress')onProgress(data.text);else if(data.type==='ready'){stop();resolve(data)}else if(data.type==='error'){stop();reject(Error(data.message))}};
  worker.onerror=e=>{stop();reject(Error('后台模型读取失败：'+e.message))};reset();worker.postMessage({base:new URL('./',import.meta.url).href});
 });
}
