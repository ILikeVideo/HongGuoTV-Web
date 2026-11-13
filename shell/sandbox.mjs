// 所有动态代码仅在无扩展权限的沙盒中执行；凭据消息不经过官网页面。
const pending=new Map();let parentOrigin,assets={},owner,workers=new Set();
function call(op,args){const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('宿主请求超时'));},45000);pending.set(id,{resolve,reject,timer});parent.postMessage({shell:'call',owner,id,op,args},'*');});}
const runtime={sendMessage:message=>call('business',message),getURL:path=>path==='media-worker.js'?makeWorker():assets.base+path.replace(/^\//,''),onMessage:{addListener(){}}};
function makeWorker(){
 const prefix=`crypto.randomUUID ||= ()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');const __pending=new Map();globalThis.fetch=async(url,init={})=>{const id=crypto.randomUUID();let cancel;const result=await new Promise((resolve,reject)=>{__pending.set(id,{resolve,reject});cancel=()=>{__pending.delete(id);postMessage({shell:'cancel-fetch',id});reject(new DOMException('请求已取消','AbortError'));};init.signal?.addEventListener('abort',cancel,{once:true});postMessage({shell:'fetch',id,url:String(url),init:{method:init.method,headers:Object.fromEntries(new Headers(init.headers)),credentials:'omit'}});});init.signal?.removeEventListener('abort',cancel);return new Response(Uint8Array.from(result.bytes),{status:result.status,headers:result.headers});};addEventListener('message',e=>{if(e.data.shell!=='fetch-reply')return;const p=__pending.get(e.data.id);if(p){__pending.delete(e.data.id);e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data.value);}});`;
 return URL.createObjectURL(new Blob([prefix,assets['media-worker']],{type:'text/javascript'}));
}
const NativeWorker=Worker;
globalThis.Worker=class extends NativeWorker{constructor(...args){super(...args);this.requests=new Set();if(String(args[0]).startsWith('blob:'))URL.revokeObjectURL(args[0]);workers.add(this);this.addEventListener('message',e=>{if(e.data?.shell==='fetch'){this.requests.add(e.data.id);call('network',{...e.data.init,url:e.data.url,requestId:e.data.id}).then(value=>this.postMessage({shell:'fetch-reply',id:e.data.id,value}),error=>this.postMessage({shell:'fetch-reply',id:e.data.id,error:error.message})).finally(()=>this.requests.delete(e.data.id));}if(e.data?.shell==='cancel-fetch')void call('cancelNetwork',{requestId:e.data.id});});}terminate(){workers.delete(this);for(const id of this.requests)void call('cancelNetwork',{requestId:id});this.requests.clear();super.terminate();}};
globalThis.addEventListener('message',async event=>{
 if(event.source!==parent)return;const data=event.data;
 if(data?.shell==='reply'){const p=pending.get(data.id);if(p){pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(Error(data.error)):p.resolve(data.value);}return;}
 if(data?.shell==='site-message'){dispatchEvent(new MessageEvent('message',{data:data.value,origin:parentOrigin,source:parent}));return;}
 if(data?.shell!=='init'||owner)return;
 owner=data.owner;assets=data.assets;parentOrigin=data.parentOrigin;
 try{
  if(data.mode==='service'){
   globalThis.__HG_ALGORITHM__=assets.algorithm;
   globalThis.__HG_ALGO_RUNNER__=bundle=>{
    const url=URL.createObjectURL(new Blob([assets['algorithm-worker']],{type:'text/javascript'}));const worker=new NativeWorker(url);URL.revokeObjectURL(url);const calls=new Map();let dead=false;
    const call=(method,input)=>new Promise((resolve,reject)=>{if(dead)return reject(Error('算法运行器已停止'));const id=crypto.randomUUID();const timer=setTimeout(()=>{dead=true;worker.terminate();for(const c of calls.values()){clearTimeout(c.timer);c.reject(Error('算法执行超时'));}calls.clear();},1500);calls.set(id,{resolve,reject,timer});worker.postMessage({id,method,input,bundle:method==='init'?bundle:undefined});});
    worker.onmessage=e=>{const c=calls.get(e.data.id);if(c){calls.delete(e.data.id);clearTimeout(c.timer);e.data.error?c.reject(Error(e.data.error)):c.resolve(e.data.value);}};
    worker.onerror=()=>{dead=true;for(const c of calls.values()){clearTimeout(c.timer);c.reject(Error('算法运行器异常'));}calls.clear();worker.terminate();};
    const initialized=call('init');globalThis.__HG_ALGO_READY__=initialized;return Object.fromEntries(['selfTest','identityRequest','identityResponse','buildRequest','sign','parse'].map(method=>[method,async input=>{await initialized;return call(method,input);} ]));
   };
   const listeners=[];
   const api=name=>(...args)=>call('capability',{name,args});
   const chrome={runtime:{id:data.extensionId,getURL:path=>assets.base+path.replace(/^\//,''),onMessage:{addListener:fn=>listeners.push(fn)}},storage:{local:{get:api('state.get'),set:api('state.set'),remove:api('state.remove'),setAccessLevel:async()=>{}}},cookies:{getAll:api('site.cookies'),onChanged:{addListener(){}}},tabs:{query:api('site.tabs'),create:api('site.open'),update:api('site.focus'),sendMessage:api('site.message')},windows:{update:api('site.window')},declarativeNetRequest:{updateSessionRules:api('session.rules')}};
   globalThis.fetch=async(url,init={})=>{const id=crypto.randomUUID();const cancel=()=>void call('cancelNetwork',{requestId:id});init.signal?.addEventListener('abort',cancel,{once:true});try{init.signal?.throwIfAborted();const v=await call('network',{url:String(url),method:init.method,headers:Object.fromEntries(new Headers(init.headers)),body:init.body?Array.from(typeof init.body==='string'?new TextEncoder().encode(init.body):new Uint8Array(init.body)):null,requestId:id});init.signal?.throwIfAborted();return new Response(Uint8Array.from(v.bytes),{status:v.status,headers:v.headers});}finally{init.signal?.removeEventListener('abort',cancel);}};
   new Function('chrome',assets.service)(chrome);
   await globalThis.__HG_ALGO_READY__;await globalThis.__HG_SERVICE_READY__;
   addEventListener('message',e=>{if(e.source!==parent||e.data?.shell!=='request')return;const {id,message,sender}=e.data;let done=false;const reply=value=>{if(!done){done=true;parent.postMessage({shell:'business-reply',owner,id,value},'*');}};for(const listener of listeners)listener(message,sender,reply);});
  }else{
   const html=new DOMParser().parseFromString(assets[data.mode+'.html'],'text/html');document.body.innerHTML=html.body.innerHTML;document.querySelectorAll('script').forEach(n=>n.remove());const style=document.createElement('style');style.textContent=assets[data.mode+'.css'];document.head.append(style);
   globalThis.__HG_SITE_POST__=value=>parent.postMessage({shell:'site-event',owner,value},'*');
   new Function('chrome',assets[data.mode])({runtime});
  }
  parent.postMessage({shell:'ready',owner},'*');
 }catch(error){parent.postMessage({shell:'failed',owner,reason:/^(算法|播放算法|动态|宿主|会话)/.test(error.message)?error.message:'动态包启动失败'},'*');}
});
