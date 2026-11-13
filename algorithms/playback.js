// SPDX-License-Identifier: GPL-3.0-only
// 播放协议移植自 PhoenixReadApi SignPlayer / OOIUa PlaybackDevice；参见 NOTICE。
// 宿主只提供密码学、字节和压缩原语；参数组装、签名流程和解析均可独立更新。
'use strict';
const primitive = (op, values) => JSON.parse(host(JSON.stringify({op,...values})));
const b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64(a) { let s=''; for(let i=0;i<a.length;i+=3){let n=(a[i]<<16)|((a[i+1]||0)<<8)|(a[i+2]||0);s+=b64chars[n>>>18]+b64chars[(n>>>12)&63]+(i+1<a.length?b64chars[(n>>>6)&63]:'=')+(i+2<a.length?b64chars[n&63]:'=');} return s; }
function un64(s) { if(typeof s!=='string'||s.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw Error('base64');let out=[];for(let i=0;i<s.length;i+=4){let n=(b64chars.indexOf(s[i])<<18)|(b64chars.indexOf(s[i+1])<<12)|((b64chars.indexOf(s[i+2])&63)<<6)|(b64chars.indexOf(s[i+3])&63);out.push(n>>>16);if(s[i+2]!=='=')out.push((n>>>8)&255);if(s[i+3]!=='=')out.push(n&255);}return out; }
const hex=a=>a.map(n=>n.toString(16).padStart(2,'0')).join('');
const fromhex=s=>s.match(/../g).map(n=>parseInt(n,16));
const bytes=s=>un64(primitive('utf8',{value:s}).data);
const random=n=>un64(primitive('random',{bytes:n}).data);
const hash=(algorithm,a)=>un64(primitive('hash',{algorithm,data:b64(a)}).data);
const aes=(data,key,iv)=>un64(primitive('aes',{direction:'encrypt',mode:'CBC/NoPadding',data:b64(data),key:b64(key),iv:b64(iv)}).data);
const gzip=a=>un64(primitive('gzip',{data:b64(a)}).data);
const pad=a=>{let n=16-a.length%16;return a.concat(new Array(n).fill(n));};
const u64=n=>BigInt.asUintN(64,n);
const rol=(n,b)=>u64((n<<BigInt(b))|(n>>BigInt(64-b)));
const ror=(n,b)=>rol(n,64-b);
function le(a,i=0){let n=0n;for(let k=7;k>=0;k--)n=(n<<8n)|BigInt(a[i+k]);return n;}
function putle(a,i,n){for(let k=0;k<8;k++){a[i+k]=Number(n&255n);n>>=8n;}}
function varint(n){n=BigInt(n);let a=[];while(n>=128n){a.push(Number(n&127n)|128);n>>=7n;}a.push(Number(n));return a;}
const vf=(field,n)=>varint(field*8).concat(varint(n));
const bf=(field,a)=>varint(field*8+2).concat(varint(a.length),a);
function gorgon(query,body,ts){let a=hash('MD5',bytes(query)).slice(0,4).concat(hash('MD5',body).slice(0,4),[0,0,0,0,0,6,11,28],[(ts>>>24)&255,(ts>>>16)&255,(ts>>>8)&255,ts&255]);let key=fromhex('44b9b9d9a4aef9fca493aa757ca3c2c4a496938f');a=a.map((v,i)=>v^key[i]);for(let i=0;i<20;i++){let v=(((a[i]<<4)|(a[i]>>>4))&255)^a[(i+1)%20];v=((v&0x55)<<1)|((v&0xaa)>>>1);v=((v&0x33)<<2)|((v&0xcc)>>>2);v=((v<<4)|(v>>>4))&255;a[i]=v^255^20;}return '8404401c0000'+hex(a);}
function argus(query,body,ts,device,nonce){let key=fromhex('ac1adaae95a7af94a5114ab3b3a97dd80050aa0a39314c40528caec95256c28c');let derived=hash('SM3',key.concat(fromhex('3ccc567b'),key));let message=[].concat(vf(1,0x20200929*2),vf(2,2),vf(3,Number(le(nonce.slice(6,10).concat([0,0,0,0]))&0x7fffffffn)),bf(4,bytes('8662')),bf(5,bytes(device)),bf(6,bytes('1611921764')),bf(7,bytes('7.3.5.32')),bf(8,bytes('v04.07.01-ml-android')),vf(9,135135744),bf(10,new Array(8).fill(0)),vf(11,0),vf(12,ts*2),bf(13,hash('SM3',hash('MD5',body)).slice(0,6)),bf(14,hash('SM3',bytes(query)).slice(0,6)),bf(15,[].concat(vf(1,1),vf(2,1),vf(3,1),vf(7,3348294860))),bf(16,[]),bf(20,bytes('none')),vf(21,738),bf(23,[].concat(bf(1,bytes('25053RT47C')),bf(2,bytes('16')),bf(3,bytes('update_64')),vf(4,2147483648))),vf(25,2));
 let data=pad(message),rounds=[0,8,16,24].map(i=>le(derived,i));for(let k=4;k<72;k++){let t=ror(rounds[k-1],3)^rounds[k-3];t^=ror(t,1);rounds[k]=u64(~rounds[k-4]^t^((0x3dc94c3a046d678bn>>BigInt((k-4)%62))&1n)^3n);}
 for(let i=0;i<data.length;i+=16){let l=le(data,i),r=le(data,i+8);for(let round of rounds){let next=l^(rol(r,1)&rol(r,8))^rol(r,2)^round;l=r;r=next;}putle(data,i,l);putle(data,i+8,r);}
 let xor=fromhex('d04ffdffd04ffdff');data=data.map((v,i)=>v^xor[i%8]);let packed=fromhex('a6e783ee7001100918').concat(xor.concat(data).reverse(),[0x56,0x7b]);return b64([0x3c,0xcc].concat(aes(pad(packed),hash('MD5',key.slice(0,16)),hash('MD5',key.slice(16)))));
}
function ladon(aid,ts,prefix){let d=bytes(hex(hash('MD5',prefix.concat(bytes(aid))))),n=le(d),v=le(d,8),queue=[le(d,16),le(d,24)],rounds=[];for(let i=0;i<34;i++){rounds.push(n);let next=u64(ror(v,8)+n)^BigInt(i);queue.push(next);n=next^rol(n,3);v=queue.shift();}let a=pad(bytes(ts+'-1611921764-'+aid));for(let i=0;i<a.length;i+=16){n=le(a,i);v=le(a,i+8);for(let round of rounds){v=round^u64(n+ror(v,8));n=v^rol(n,3);}putle(a,i,n);putle(a,i+8,v);}return b64(prefix.concat(a));}
function uuid(){let a=random(16);a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;let h=hex(a);return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
function encryptRegistration(data){let rnd=random(32),key=hash('SHA-512',hash('SHA-512',rnd).concat(fromhex(CONFIG.registrationSalt))).slice(0,32);return fromhex('746305100000').concat(rnd,aes(pad(hash('SHA-512',data).concat(data)),key.slice(0,16),key.slice(16)));}
function jsonObject(value){if(typeof value==='string')return JSON.parse(value);if(value&&typeof value==='object'&&!Array.isArray(value))return value;throw Error('response_contract');}
function modelFrom(data,id){let entry=data.video_model?data:(data[id]||Object.values(data).find(x=>x&&x.video_model));return jsonObject(entry.video_model);}
globalThis.Algorithm=Object.freeze({
 selfTest(x){return {gorgon:gorgon(x.query,un64(x.body),x.timestamp),argus:argus(x.query,un64(x.body),x.timestamp,x.device,un64(x.nonce)),ladon:ladon('8662',x.timestamp,un64(x.nonce).slice(2,6))};},
 identityRequest(x){let cdid=uuid();let header={...CONFIG.registrationProfile,cdid,openudid:hex(random(8)),clientudid:uuid(),req_id:uuid(),apk_first_install_time:x.nowMs};let body=encryptRegistration(gzip(bytes(JSON.stringify({magic_tag:'ss_app_log',header,_gen_time:x.nowMs}))));return {request:{url:CONFIG.registrationUrl,method:'POST',query:[],body:b64(body),headers:{'User-Agent':CONFIG.registrationUserAgent,'Accept':'application/json','Content-Type':'application/octet-stream;tt-data=a','log-encode-type':'gzip','x-ss-dp':'8662','x-ss-req-ticket':String(x.nowMs),'x-vc-bdturing-sdk-version':'4.0.3.cn','lc':'101','sdk-version':'2','passport-sdk-version':'5051452','x-neptune':'-8|50:51:59:30:40:47:49:39','x-ss-stub':hex(hash('MD5',body)).toUpperCase()}},state:{cdid}};},
 identityResponse(x){let r=jsonObject(x.response);if(Number(r.code||r.Code||0)!==0)return {failure:'access'};let device=String(r.device_id_str||r.device_id||''),install=String(r.install_id_str||r.install_id||'');if(!/^[0-9]{1,30}$/.test(device)||!/[1-9]/.test(device)||!/^[0-9]{1,30}$/.test(install)||!/[1-9]/.test(install))return {failure:'registration'};return {deviceId:device,installId:install,cdid:x.state.cdid};},
 buildRequest(x){let q={...CONFIG.query,device_id:x.identity.deviceId,iid:x.identity.installId,_rticket:String(x.nowMs)};let body={video_id:x.videoId,content_type:x.contentType||1004,biz_param:{need_all_video_definition:true,video_platform:x.videoPlatform}};return {url:CONFIG.modelUrl,method:'POST',query:Object.keys(q).sort().map(k=>[k,String(q[k])]),body:b64(bytes(JSON.stringify(body))),headers:{'Content-Type':'application/json; charset=utf-8'}};},
 sign(x){let ts=Math.floor(x.nowMs/1000),body=un64(x.wire.body),nonce=random(11);return {headers:{'User-Agent':CONFIG.modelUserAgent,'Accept':'application/json','X-XS-From-Web':'0','Sdk-Version':'2','X-Khronos':String(ts),'X-Gorgon':gorgon(x.wire.query,body,ts),'X-SS-Req-Ticket':String(x.nowMs),'X-SS-STUB':hex(hash('MD5',body)).toUpperCase(),'X-Argus':argus(x.wire.query,body,ts,x.identity.deviceId,nonce),'X-Ladon':ladon(CONFIG.query.aid,ts,nonce.slice(2,6))}};},
 parse(x){let r=jsonObject(x.response);if(Number(r.code||r.Code||0)!==0)return {failure:'access'};let info;if(x.phase==='model'){let data=jsonObject(r.data),model=modelFrom(data,x.videoId);let fallback=model.fallback_api;if(typeof fallback==='string'){try{fallback=JSON.parse(fallback);}catch(_){}}if(Array.isArray(fallback))fallback=fallback[0];if(fallback&&typeof fallback==='object')fallback=fallback.fallback_api;if(typeof fallback==='string'&&fallback.startsWith('https://'))return {followup:{url:fallback,method:'GET',query:[],body:'',headers:{'User-Agent':CONFIG.modelUserAgent}}};info=model.video_info||model;}else info=jsonObject(r.video_info||r).data||r.data||r;info=jsonObject(info);if(!info.video_list)return {failure:'parsing'};return {videoList:info.video_list,keySeed:info.key_seed||''};}
});
