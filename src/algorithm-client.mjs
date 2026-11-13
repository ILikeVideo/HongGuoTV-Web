// 与 Android 共用算法源码、JSON 契约及自检向量；此模块仅在沙盒执行。
import CryptoJS from 'crypto-js';
import {gzipSync,Gunzip} from 'fflate';
import {sm3} from './sm3.cjs';
import {encodeFields,parseSources,safeJson,id} from './protocol.mjs';
const decode=s=>Uint8Array.from(atob(s||''),c=>c.charCodeAt(0));
const encode=a=>{let s='';for(const b of a)s+=String.fromCharCode(b);return btoa(s);};
const words=a=>CryptoJS.lib.WordArray.create(Uint8Array.from(a));
const bytes=a=>Uint8Array.from({length:a.sigBytes},(_,i)=>a.words[i>>>2]>>>(24-(i%4)*8)&255);
export function primitive(raw){
 if(new TextEncoder().encode(raw).length>384*1024)throw Error('算法输入过大');
 const x=JSON.parse(raw),data=decode(x.data);let out;
 if(data.length>256*1024)throw Error('算法输入过大');
 if(x.op==='utf8')out=new TextEncoder().encode(x.value);
 else if(x.op==='decodeUtf8')return JSON.stringify({value:new TextDecoder().decode(data)});
 else if(x.op==='random'){if(!Number.isInteger(x.bytes)||x.bytes<1||x.bytes>128)throw Error('随机数长度无效');out=crypto.getRandomValues(new Uint8Array(x.bytes));}
 else if(x.op==='hash'){
  if(x.algorithm==='SM3')out=Uint8Array.from(sm3([...data]).match(/../g),v=>parseInt(v,16));
  else {const fn={'MD5':CryptoJS.MD5,'SHA-256':CryptoJS.SHA256,'SHA-512':CryptoJS.SHA512}[x.algorithm];if(!fn)throw Error('摘要算法不支持');out=bytes(fn(words(data)));}
 }else if(x.op==='hmac'){const fn={'HmacSHA256':CryptoJS.HmacSHA256,'HmacSHA512':CryptoJS.HmacSHA512}[x.algorithm],key=decode(x.key);if(!fn||key.length>128||!key.length)throw Error('HMAC 算法或密钥不支持');out=bytes(fn(words(data),words(key)));}
 else if(x.op==='aes'){
  const key=decode(x.key),iv=decode(x.iv),padded=x.mode==='CBC/PKCS5Padding';if(!['CBC/NoPadding','CBC/PKCS5Padding'].includes(x.mode)||![16,24,32].includes(key.length)||iv.length!==16||!['encrypt','decrypt'].includes(x.direction)||(x.direction==='decrypt'||!padded)&&data.length%16)throw Error('AES 参数无效');
  let input=data;if(padded&&x.direction==='encrypt'){const n=16-data.length%16;input=new Uint8Array(data.length+n);input.set(data);input.fill(n,data.length);}
  const options={iv:words(iv),mode:CryptoJS.mode.CBC,padding:CryptoJS.pad.NoPadding};out=bytes(x.direction==='encrypt'?CryptoJS.AES.encrypt(words(input),words(key),options).ciphertext:CryptoJS.AES.decrypt({ciphertext:words(input)},words(key),options));
  if(padded&&x.direction==='decrypt'){const n=out.at(-1);if(!n||n>16||out.length<n||out.subarray(out.length-n).some(v=>v!==n))throw Error('AES 填充无效');out=out.subarray(0,out.length-n);}
 }else if(x.op==='gzip')out=gzipSync(data,{mtime:0});
 else if(x.op==='gunzip'){const parts=[];let size=0;const unzip=new Gunzip(chunk=>{size+=chunk.length;if(size>256*1024)throw Error('算法解压输出过大');parts.push(chunk);});for(let i=0;i<data.length;i+=1024)unzip.push(data.subarray(i,i+1024),i+1024>=data.length);out=new Uint8Array(size);let offset=0;for(const chunk of parts){out.set(chunk,offset);offset+=chunk.length;}}
 else throw Error('算法原语不支持');
 if(out.length>256*1024)throw Error('算法输出过大');return JSON.stringify({data:encode(out)});
}
export function loadAlgorithm(bundle){
 if(!bundle?.script||!bundle.config||!bundle.tests?.length)throw Error('算法资料不完整');
 const algorithm=new Function('CONFIG','host','globalThis',bundle.script+';return globalThis.Algorithm;')(bundle.config,primitive,{});
 for(const method of ['selfTest','identityRequest','identityResponse','buildRequest','sign','parse'])if(typeof algorithm?.[method]!=='function')throw Error('播放算法契约不完整');
 const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 for(const test of bundle.tests){if(typeof algorithm[test.method]!=='function'||canonical(algorithm[test.method](test.input))!==canonical(test.expected))throw Error('播放算法自检失败');}
 return algorithm;
}
export function playbackClient(bundle,fetcher=(...args)=>fetch(...args),runner){
 const algorithm=runner??loadAlgorithm(bundle);let identity,registering;
 async function send(request,signal){
  signal?.throwIfAborted();const u=new URL(request.url),query=encodeFields(Object.fromEntries(request.query??[]));
  if(query)u.search+=(u.search?'&':'?')+query;
  const body=decode(request.body),wire={url:u.href,query:u.search.slice(1),body:encode(body)};
  const headers={...request.headers};
  if(request.signed)Object.assign(headers,(await algorithm.sign({wire,identity,nowMs:request.nowMs})).headers);
  const response=await fetcher(u.href,{method:request.method,headers,body:request.method==='POST'?body:undefined,credentials:'omit',redirect:'error',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(20000)])});
  if(!response.ok)throw Error('获取播放资料失败（HTTP '+response.status+'）');const text=await response.text();if(!text.trim())throw Error('播放接口返回空内容');return safeJson(text);
 }
 async function register(signal){
  if(identity)return identity;
  if(!registering)registering=(async()=>{const x=await algorithm.identityRequest({nowMs:Date.now(),hostApi:1,device:{platform:'browser'}});const response=await send(x.request);const value=await algorithm.identityResponse({response,state:x.state});if(value.failure)throw Error('匿名播放身份登记失败');identity=value;return value;})().finally(()=>registering=null);
  return registering;
 }
 return async(videoId,signal,platform=3,session=null,contentType=1004)=>{
  id(videoId);if(!Number.isSafeInteger(platform)||platform<1||platform>2147483647)throw Error('视频平台参数无效');
  signal?.throwIfAborted();await register(signal);signal?.throwIfAborted();const nowMs=Date.now();
  try{
   const request=await algorithm.buildRequest({videoId,contentType,videoPlatform:platform,identity,nowMs,hostApi:1});
   let response=await send({...request,signed:true,nowMs},signal),phase='model';
   for(let i=0;i<3;i++){signal?.throwIfAborted();const parsed=await algorithm.parse({response,phase,videoId,identity});if(parsed.failure)throw Error(parsed.failure==='access'?'服务端拒绝提供本集片源':'播放资料解析失败');if(parsed.videoList){const result=parseSources({video_info:{data:{video_list:parsed.videoList,key_seed:parsed.keySeed}}},videoId);if(!result.length)throw Error('本集没有可播放片源');return result;}if(!parsed.followup||i===2)throw Error('播放接口跟随次数超限');response=await send(parsed.followup,signal);phase='fallback';}
  }catch(error){if(!signal?.aborted)identity=null;throw error;}
 };
}
