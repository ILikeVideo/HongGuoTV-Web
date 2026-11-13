import builtin from '../.generated/builtin-web.json';
import builtinAlgorithm from '../algorithms/builtin.json';
import publicKey from '../algorithms/trust-public-key.hex';
import {Updates} from './updater.mjs';
import {SITE,validateNetwork,digest} from './policy.mjs';
import {siteConfig} from './site-config.mjs';
import {AD_ORIGIN,parseAds,disabledAds,adHttps} from '../src/ad-policy.mjs';
import {openOfficialSite} from './toolbar.mjs';
import {coverImage,cancelCover,cancelCovers} from './covers.mjs';
const base=chrome.runtime.getURL(''),extensionOrigin=base.slice(0,-1),client=/Edg\//.test(navigator.userAgent)?'edge':'chrome';
const compatible=(kind,bundle)=>kind!=='web'||bundle?.siteAdapter==='native-v1'&&bundle.nativeProtocol===1;
const updater=new Updates(chrome.storage.local,{web:builtin,algorithm:builtinAlgorithm},publicKey.trim(),203,client,undefined,compatible);
const storageReady=(async()=>{const result=await chrome.storage.local.get('dynamic:web'),state=result['dynamic:web'];if(!state)return;let changed=false;for(const key of ['active','previous','pending'])if(state[key]&&!compatible('web',state[key].bundle)){state[key]=null;changed=true;}if(changed)await chrome.storage.local.set({'dynamic:web':state});})();
const ports=new Set(),jobs=new Map(),networkJobs=new Map();let service,creating,selected,checkedAt=0,networkRule=100;
void chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
const stateKeys=new Set(['deviceId','account','websiteIdentity']);
const cookieNames=new Set(['sessionid','sessionid_ss','sid_tt','sid_guard','uid_tt','uid_tt_ss']);
async function siteCookies(opaque=true){const rows=(await chrome.cookies.getAll({domain:'hongguoduanju.com'})).filter(c=>cookieNames.has(c.name));return opaque?Promise.all(rows.map(async c=>({name:c.name,value:await digest(new TextEncoder().encode(c.value))}))):[...new Map(rows.map(c=>[c.name,c.value]))].map(([k,v])=>k+'='+v).join('; ');}
const trusted=sender=>sender.id===chrome.runtime.id&&sender.url?.startsWith(base);
const site=sender=>sender.id===chrome.runtime.id&&sender.tab?.id&&SITE.includes(new URL(sender.url).origin);
const send=(port,data)=>{try{port.postMessage(data);}catch{}};
let adsCache,adsPending,adsChecked=0;
async function adsConfig(){
 if(adsCache&&Date.now()-adsChecked<60000&&adsCache.expiresAt>Date.now())return adsCache;
 if(adsPending)return adsPending;
 return adsPending=(async()=>{try{const response=await fetch(AD_ORIGIN+'/api/public/web-ads/config',{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(1800)});if(!response.ok)throw Error('配置暂不可用');const reader=response.body.getReader();let size=0,raw='';const decoder=new TextDecoder();try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw Error('配置过大');}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock();}adsCache=parseAds(JSON.parse(raw));adsChecked=Date.now();return adsCache;}catch{return adsCache?.expiresAt>Date.now()?adsCache:disabledAds();}finally{adsPending=null;}})();
}
async function ensureService(){
 await storageReady;
 if(service)return service;if(creating)return creating;
 creating=(async()=>{for(let attempt=0;attempt<3;attempt++){
  selected={web:(await updater.current('web')).bundle,algorithm:(await updater.current('algorithm')).bundle};
  const states=await chrome.storage.local.get(['dynamic:web','dynamic:algorithm']);
  const web=states['dynamic:web']?.pending?.bundle??selected.web,algorithm=states['dynamic:algorithm']?.pending?.bundle??selected.algorithm;
  selected={web,algorithm};
  const existing=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']});
  if(existing.length)await chrome.offscreen.closeDocument();
  const waiting=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('动态运行器启动超时')),20000);globalThis.serviceReady={resolve:()=>{clearTimeout(timer);resolve(service);},reject:e=>{clearTimeout(timer);reject(e);}};});
  await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['IFRAME_SCRIPTING'],justification:'隔离运行已校验的动态业务代码及播放算法'});
  try{
   await waiting;
   await updater.activate('algorithm',async()=>{});await updater.activate('web',async()=>{});
   return service;
  }catch(error){
   globalThis.hgBootFault=error.message;
   service=null;await chrome.offscreen.closeDocument().catch(()=>{});
   const hasPending=!!(states['dynamic:web']?.pending||states['dynamic:algorithm']?.pending);
   for(const kind of ['web','algorithm']){
    if(states['dynamic:'+kind]?.pending)await updater.activate(kind,async()=>{throw error;}).catch(()=>{});
    else if(!hasPending)await updater.rollback(kind);
   }
   if(attempt===2)throw error;
  }
 }})().finally(()=>creating=null);
 return creating;
}
async function checkUpdate(force=false){
 await storageReady;
 if(force||Date.now()-checkedAt>=30000){checkedAt=Date.now();await updater.check().catch(error=>{globalThis.hgUpdateFault=error.message;});}
 if(service&&!jobs.size&&![...ports].some(p=>p.name==='shell-player')){
  const latest={web:(await updater.current('web')).bundle,algorithm:(await updater.current('algorithm')).bundle},states=await chrome.storage.local.get(['dynamic:web','dynamic:algorithm']);
  if(states['dynamic:web']?.pending||states['dynamic:algorithm']?.pending||latest.web.version!==selected.web.version||latest.algorithm.version!==selected.algorithm.version){service=null;await chrome.offscreen.closeDocument().catch(()=>{});}
 }
}
async function invoke(message,sender){
 const port=await ensureService(),id=crypto.randomUUID();
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{jobs.delete(id);reject(Error('业务请求超时'));},45000);jobs.set(id,{resolve,reject,timer,type:message.type});send(port,{shell:'request',id,message,sender});});
}
async function network(args,owner){
 globalThis.hgNetworkPhase={host:new URL(args.url).hostname,range:!!args.headers?.range};
 const {url,method,headers}=validateNetwork(args),controller=new AbortController(),key=owner+':'+args.requestId;
 networkJobs.set(key,controller);
 let rule;
 try{
  const ua=headers.get('User-Agent');if(ua){rule=++networkRule;await chrome.declarativeNetRequest.updateSessionRules({addRules:[{id:rule,priority:10,action:{type:'modifyHeaders',requestHeaders:[{header:'User-Agent',operation:'set',value:ua},...['Origin','Referer','Sec-Fetch-Site','Sec-Fetch-Mode','Sec-Fetch-Dest'].map(header=>({header,operation:'remove'}))]},condition:{regexFilter:'^'+url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$',initiatorDomains:[chrome.runtime.id],resourceTypes:['xmlhttprequest']}}]});headers.delete('User-Agent');}
  const response=await fetch(url,{method,headers,body:args.body?Uint8Array.from(args.body):undefined,credentials:'omit',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
  const limit=headers.has('range')?4*1024*1024:4*1024*1024;
  const reader=response.body?.getReader(),parts=[];let size=0;
  if(reader)for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('上游响应超过宿主上限');}parts.push(value);}
  const bytes=new Uint8Array(size);let p=0;for(const chunk of parts){bytes.set(chunk,p);p+=chunk.length;}
  return {status:response.status,headers:Object.fromEntries([...response.headers].filter(([k])=>!['set-cookie','set-cookie2','x-tt-token'].includes(k))),bytes:Array.from(bytes)};
 }finally{networkJobs.delete(key);if(rule)await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[rule]}).catch(()=>{});}
}
async function capability({name,args=[]},sender){
 switch(name){
  case 'state.get':case 'state.remove':{const keys=args[0]==null?[...stateKeys]:Array.isArray(args[0])?args[0]:[args[0]];if(keys.some(k=>!stateKeys.has(k)))throw Error('存储键无效');if(name==='state.remove')return chrome.storage.local.remove(keys);const state=await chrome.storage.local.get(keys);if(state.account)state.account={...state.account,cookie:state.account.cookie?'host-session':'',token:''};return state;}
  case 'state.set':if(Object.keys(args[0]??{}).some(k=>!stateKeys.has(k))||JSON.stringify(args[0]).length>65536)throw Error('存储内容无效');if(args[0].account)args[0].account={...args[0].account,cookie:args[0].account.cookie?'host-session':'',token:''};return chrome.storage.local.set(args[0]);
  case 'site.cookies':return siteCookies();
  case 'site.tabs':return chrome.tabs.query({url:SITE.map(x=>x+'/*')});
  case 'site.open':{const u=new URL(args[0].url);if(!SITE.includes(u.origin)&&!u.href.startsWith(base))throw Error('打开地址无效');return chrome.tabs.create({url:u.href});}
  case 'site.focus':{const tab=await chrome.tabs.get(args[0]);if(!SITE.includes(new URL(tab.url).origin))throw Error('标签页无效');return chrome.tabs.update(tab.id,{active:true});}
  case 'site.window':return chrome.windows.update(args[0],{focused:true});
  case 'site.message':{const tab=await chrome.tabs.get(args[0]);if(!SITE.includes(new URL(tab.url).origin)||!['account-changed','open-website-login'].includes(args[1]?.type))throw Error('标签页消息无效');await chrome.tabs.sendMessage(tab.id,args[1]).catch(()=>{});return true;}
  case 'session.rules':{
   // 固定可修改的请求域名及请求头，拒绝动态规则扩大权限。
   const input=args[0];if(!Array.isArray(input?.addRules)||input.addRules.length>3)throw Error('会话规则无效');
   for(const rule of input.addRules){if(![1,2,3].includes(rule.id)||rule.action.type!=='modifyHeaders'||rule.condition?.initiatorDomains?.[0]!==chrome.runtime.id||rule.condition.initiatorDomains.length!==1||rule.condition?.resourceTypes?.join()!=='xmlhttprequest'||rule.condition.requestDomains?.some(h=>!['security.snssdk.com','reading.snssdk.com','api5-normal-sinfonlineb.fqnovel.com','api5-normal-sinfonlinec.fqnovel.com'].includes(h))||rule.action.requestHeaders?.some(h=>!['User-Agent','Cookie'].includes(h.header)||h.operation!=='set')||rule.action.responseHeaders)throw Error('会话规则超出宿主边界');}
   const cookie=await siteCookies(false);for(const rule of input.addRules)rule.action.requestHeaders=rule.action.requestHeaders.map(h=>h.header==='Cookie'?{...h,value:cookie}:h).filter(h=>h.header!=='Cookie'||cookie);
   return chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[1,2,3],addRules:input.addRules.filter(r=>r.action.requestHeaders.length)});
  }
  default:throw Error('宿主能力不受支持');
 }
}
function connected(port){
 const sender=port.sender,owner=crypto.randomUUID();
 if(!trusted(sender)||!['shell-service','shell-player','shell-account'].includes(port.name))return;
 ports.add(port);
 port.onDisconnect.addListener(()=>{ports.delete(port);if(service===port){service=null;for(const job of jobs.values()){clearTimeout(job.timer);job.reject(Error('动态运行器已断开'));}jobs.clear();}for(const [key,job] of networkJobs)if(key.startsWith(owner+':'))job.abort();});
 port.onMessage.addListener(async d=>{
  try{
   if(d.shell==='hello'){
    if(port.name==='shell-service'){service=port;send(port,{shell:'init',mode:'service',extensionId:chrome.runtime.id,assets:{...selected.web.assets,algorithm:selected.algorithm,base}});}
    else{await checkUpdate();await ensureService();send(port,{shell:'init',mode:port.name==='shell-player'?'player':'account',extensionId:chrome.runtime.id,assets:{...selected.web.assets,base}});}
   }else if(d.shell==='ready'&&port===service)globalThis.serviceReady?.resolve();
   else if(d.shell==='failed'&&port===service)globalThis.serviceReady?.reject(Error(d.reason||'动态代码或算法自检失败'));
   else if(d.shell==='business-reply'&&port===service){const job=jobs.get(d.id);if(job){jobs.delete(d.id);clearTimeout(job.timer);job.resolve(d.value);if(job.type==='GetPlayback'&&!d.value?.ok&&/算法执行超时|算法运行器异常|算法契约或自检失败/.test(d.value?.error??''))void updater.rollback('algorithm').then(async()=>{service=null;await chrome.offscreen.closeDocument().catch(()=>{});});}}
   else if(d.shell==='call'){
    let value;
    if(d.op==='business'&&port!==service)value=await invoke(d.args,sender);
    else if(d.op==='network')value=await network(d.args,owner);
    else if(d.op==='cancelNetwork'){networkJobs.get(owner+':'+d.args.requestId)?.abort();value=true;}
    else if(d.op==='capability'&&port===service)value=await capability(d.args,sender);
    else throw Error('调用来源或能力无效');
    send(port,{shell:'reply',id:d.id,value});
   }
  }catch(error){const reason=/^(请求|媒体|非 HTTPS|宿主|存储|会话|标签页|打开|算法)/.test(error.message)?error.message:'宿主操作失败，请重试';globalThis.hgLastFault={op:d.op,reason};if(d.shell==='call')send(port,{shell:'reply',id:d.id,error:reason});}
 });
}
chrome.runtime.onConnect.addListener(connected);
chrome.action.onClicked.addListener(()=>{void openOfficialSite().catch(()=>{});});
chrome.tabs.onRemoved.addListener(id=>cancelCovers(String(id)));
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
 if((site(sender)||trusted(sender))&&m?.type==='ShellCover'){coverImage(m,String(sender.tab?.id??sender.url)).then(value=>reply({ok:true,value}),()=>reply({ok:false,error:'封面暂未加载'}));return true;}
 if((site(sender)||trusted(sender))&&m?.type==='ShellCancelCover'){cancelCover(m.requestId,String(sender.tab?.id??sender.url));reply({ok:true});return;}
 if((site(sender)||trusted(sender))&&m?.type==='ShellAdsConfig'){adsConfig().then(config=>reply({ok:true,config}));return true;}
 if(site(sender)&&m?.type==='ShellAdClick'){const url=adHttps(m.url);if(url)chrome.tabs.create({url,active:true}).then(()=>reply({ok:true}),()=>reply({ok:false}));else reply({ok:false});return true;}
 if(trusted(sender)&&m?.type==='ShellCheck'){(async()=>{await checkUpdate(true);await ensureService();return {ok:true,web:(await updater.current('web')).bundle.version,algorithm:(await updater.current('algorithm')).bundle.version};})().then(reply,()=>reply({ok:false,error:'更新未能启用，已保留本地版本'}));return true;}
 if(m?.type==='ShellOpen'&&site(sender)){
  (async()=>{await checkUpdate();await ensureService();return {ok:true,siteConfig:siteConfig(selected.web.siteConfig)};})().then(reply,()=>reply({ok:false,error:'红果网页增强启动失败，请刷新重试'}));return true;
 }
 if(trusted(sender)&&m?.type==='ShellStatus'){Promise.all([updater.current('web'),updater.current('algorithm')]).then(([web,algorithm])=>reply({ok:true,web:web.bundle.version,algorithm:algorithm.bundle.version,webSequence:web.sequence,algorithmSequence:algorithm.sequence,client}));return true;}
 if(trusted(sender)){invoke(m,sender).then(reply,()=>reply({ok:false,error:'动态运行器暂不可用'}));return true;}
 if(site(sender)&&['GetDetail','GetProfile','SyncWebsiteSession','OpenWebsiteLogin','OpenAccount','GetLibraryPage','Cancel'].includes(m?.type)){invoke(m,sender).then(reply,()=>reply({ok:false,error:'动态业务暂不可用，请刷新重试'}));return true;}
});
chrome.cookies.onChanged.addListener(({cookie})=>{if(/(^|\.)hongguoduanju\.com$/.test(cookie.domain)&&service)void invoke({type:'SyncWebsiteSession',requestId:crypto.randomUUID()},{id:chrome.runtime.id,url:base+'offscreen.html'}).catch(()=>{});});
