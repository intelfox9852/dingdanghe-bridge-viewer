// Visible quality and memory budgets change together; only the view is refined.
export function applyObliqueQuality(tiles,value,mobile){
 const error=Number(value)||16;
 const profile=error>=64?{depth:3,minMB:12,maxMB:24,items:24}:
  error>=32?{depth:4,minMB:24,maxMB:40,items:40}:
  error>=16?{depth:6,minMB:36,maxMB:64,items:64}:{depth:6,minMB:48,maxMB:80,items:96};
 tiles.errorTarget=error;tiles.maxDepth=mobile?profile.depth:Infinity;
 if(mobile){tiles.lruCache.minSize=8;tiles.lruCache.maxSize=profile.items;tiles.lruCache.minBytesSize=profile.minMB*1048576;tiles.lruCache.maxBytesSize=profile.maxMB*1048576}
 return {error,maxDepth:tiles.maxDepth,maxMB:mobile?profile.maxMB:null};
}
