import {coverUrl,desktopCover} from '../src/cover-policy.mjs';
const cache=new Map(),jobs=new Map();let active=0;const waiting=[];
async function slot(signal){
 if(active<3)active++;else await new Promise((resolve,reject)=>{const entry={resolve:()=>{signal.removeEventListener('abort',abort);resolve();}};const abort=()=>{const i=waiting.indexOf(entry);if(i>=0)waiting.splice(i,1);reject(Error('已取消'));};signal.addEventListener('abort',abort,{once:true});waiting.push(entry);});
 const release=()=>{const next=waiting.shift();if(next)next.resolve();else active--;};if(signal.aborted){release();signal.throwIfAborted();}return release;
}
async function websiteCover(id,signal){
 const response=await fetch('https://hongguoduanju.com/player/'+id,{credentials:'omit',redirect:'error',signal});if(!response.ok)throw Error('官网封面不可用');const reader=response.body.getReader(),decoder=new TextDecoder();let html='',size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>256*1024)break;html+=decoder.decode(part.value,{stream:true});if(/<\/head>/i.test(html))break;}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const url=desktopCover(html);if(!url)throw Error('官网暂无封面');return url;
}
async function imageBlob(url,signal){
 const response=await fetch(url,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal});if(!response.ok)throw Error('封面暂不可用');const mime=response.headers.get('Content-Type')?.split(';')[0];
 if(!['image/png','image/jpeg','image/webp','image/avif','image/gif'].includes(mime)){await response.body.cancel();throw Error('封面格式不兼容');}
 const reader=response.body.getReader(),parts=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3*1024*1024){await reader.cancel();throw Error('封面过大');}parts.push(value);}}finally{reader.releaseLock();}return new Blob(parts,{type:mime});
}
export async function coverImage(value,owner){
 const url=coverUrl(value.url),seriesId=/^\d{1,30}$/.test(value.seriesId)?value.seriesId:'';if((!url&&!seriesId)||typeof value.requestId!=='string'||value.requestId.length>80)throw Error('封面地址无效');
 const cacheKey=seriesId||url,cached=cache.get(cacheKey);if(cached&&Date.now()-cached.time<600000){cache.delete(cacheKey);cache.set(cacheKey,cached);return cached.value;}
 const key=owner+':'+value.requestId,controller=new AbortController();jobs.set(key,controller);let signal,release,blob;
 try{release=await slot(controller.signal);const completed=cache.get(cacheKey);if(completed&&Date.now()-completed.time<600000)return completed.value;signal=AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]);
  // 手机图片可能是浏览器不支持的HEIC。改读同一作品的官网公开封面，不篡改签名。
  try{if(!url)throw Error('缺少手机封面');blob=await imageBlob(url,signal);}catch(error){signal.throwIfAborted();if(!seriesId)throw error;blob=await imageBlob(await websiteCover(seriesId,signal),signal);}
  const bitmap=await createImageBitmap(blob);try{if(bitmap.width>8192||bitmap.height>8192||bitmap.width*bitmap.height>20e6)throw Error('封面尺寸过大');const scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height)),canvas=new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*scale)),Math.max(1,Math.round(bitmap.height*scale)));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);blob=await canvas.convertToBlob({type:'image/webp',quality:.82});}finally{bitmap.close();}signal.throwIfAborted();if(blob.size>512*1024)throw Error('封面过大');const result={mime:blob.type,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};cache.set(cacheKey,{value:result,time:Date.now()});while(cache.size>40)cache.delete(cache.keys().next().value);return result;
 }finally{jobs.delete(key);release?.();}
}
export function cancelCover(id,owner){jobs.get(owner+':'+id)?.abort();}
export function cancelCovers(owner){for(const [key,job]of jobs)if(key.startsWith(owner+':'))job.abort();}
