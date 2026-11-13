// 动态沙盒只取流、解密和重封装；视频元素和全部控件由官网拥有。
import {rpc} from './rpc.mjs';
const query=new URLSearchParams(location.hash.slice(1)),token=query.get('token');
let session='',attempt=0,worker,controller,candidates=[],index=0,request,refreshed=false,opened=false,pending=[];
const notify=(type,value={})=>globalThis.__HG_SITE_POST__({channel:'hg-native-media',token,type,session,attempt,...value});
function stop(){worker?.terminate();worker=null;controller?.abort();controller=null;}
function order(rows){return rows.slice().sort((a,b)=>{const av=/avc|h264/i.test(a.codec),bv=/avc|h264/i.test(b.codec);if(av!==bv)return bv-av;const qa=Number(String(a.quality).match(/\d+/)?.[0]||0),qb=Number(String(b.quality).match(/\d+/)?.[0]||0);if((qa<=720)!==(qb<=720))return qa<=720?-1:1;return qa<=720?qb-qa:qa-qb;});}
function announce(){
 worker?.terminate();worker=null;attempt++;
 const candidate=candidates[index];
 if(!candidate||candidate.videoId!==request.videoId)throw Error('片源视频编号不匹配');
 opened=false;pending=[];
 const active=new Worker(chrome.runtime.getURL('media-worker.js')),own=session,step=attempt;worker=active;let announced=false;
 active.onmessage=event=>{
  if(worker!==active||session!==own||attempt!==step)return;const d=event.data;
  if(d.type==='error'){void fallback(d.message);return;}
  if(d.type==='track'&&!announced&&Number.isInteger(d.width)&&d.width>0&&Number.isInteger(d.height)&&d.height>0&&Number.isFinite(d.duration)&&d.duration>0){announced=true;notify('source',{width:d.width,height:d.height,duration:d.duration,codec:candidate.codec,quality:candidate.quality});}
  const value={id:d.id,mime:d.mime,duration:d.duration,buffer:d.buffer};if(opened)notify(d.type,value);else pending.push([d.type,value]);
 };
 active.onerror=()=>{if(worker===active)void fallback('视频处理失败，请重试');};
 active.postMessage({type:'start',source:candidate});
}
async function load(value,refresh=false){
 const same=session===value.requestId;stop();request=value;session=value.requestId;if(!same)attempt=0;index=0;refreshed=refresh;
 const own=session,signal=(controller=new AbortController()).signal;
 try{candidates=order(await rpc('GetPlayback',{videoId:value.videoId,platform:value.platform??3},signal));if(own!==session||signal.aborted)return;if(!candidates.length)throw Error('没有可用片源');announce();}
 catch(error){if(own===session&&!signal.aborted)notify('error',{message:error.message});}
}
async function fallback(message){
 worker?.terminate();worker=null;
 if(++index<Math.min(6,candidates.length)){announce();return;}
 if(!refreshed&&/403|404|410/.test(message)){await load(request,true);return;}
 notify('error',{message});
}
addEventListener('message',event=>{
 const m=event.data;
 if(event.source!==parent||m?.channel!=='hg-host'||m.token!==token)return;
 if(m.type==='load'){void load(m);return;}
 if(m.requestId!==session||m.attempt!==attempt)return;
 if(m.type==='media-open'){
   if(opened)return;opened=true;for(const [type,value] of pending.splice(0))notify(type,value);
 }else if(m.type==='continue'||m.type==='seek')worker?.postMessage({type:m.type,position:m.position});
 else if(m.type==='media-error')void fallback(m.message||'浏览器无法播放当前片源');
 else if(m.type==='stop'){session='';stop();}
});
notify('ready');
