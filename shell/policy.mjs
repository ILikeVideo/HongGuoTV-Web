// 固定宿主边界：远程业务包不能扩大浏览器权限或读取其他站点资料。
export const ADMIN = 'https://tv-admin.curatedlifefinds.com';
export const SITE = ['https://hongguoduanju.com','https://www.hongguoduanju.com'];
export const PLATFORM = ['fqnovel.com','fqnovelvod.com','qznovelvod.com','douyinvod.com','bytecdn.cn','pstatp.com','snssdk.com'];
export const MAX_PACKAGE = 8 * 1024 * 1024;
export function platformUrl(raw) {
  const u = new URL(raw);
  if (u.username || u.password || u.port || !['https:','http:'].includes(u.protocol) || !PLATFORM.some(h => u.hostname === h || u.hostname.endsWith('.'+h))) throw Error('请求地址超出宿主权限');
  return u;
}
export function validateNetwork(input) {
  const u=platformUrl(input.url),method=input.method||'GET',headers=new Headers(input.headers||{});
  if (!['GET','POST','HEAD'].includes(method)) throw Error('请求方法不受支持');
  const media=/\.(?:fqnovelvod|qznovelvod|douyinvod|bytecdn|pstatp)\./.test(u.hostname);
  if ((media || u.protocol==='http:') && method!=='GET' && method!=='HEAD') throw Error('媒体只能读取');
  if (method==='POST' && !['/service/2/device_register/','/novel/player/video_model/v1/'].includes(u.pathname)) throw Error('宿主不允许此写入接口');
  if ([...headers.keys()].some(h=> /^(cookie|authorization|host|origin|referer|proxy-|sec-)/i.test(h))) throw Error('请求不能指定浏览器凭据');
  if (input.body && input.body.length>1024*1024) throw Error('请求正文过大');
  const range=headers.get('range');
  if (range) {const m=/^bytes=(\d+)-(\d+)$/.exec(range);if(!m || +m[2]<+m[1] || +m[2]-+m[1]>4*1024*1024)throw Error('媒体分段范围无效');}
  if (u.protocol==='http:' && !range) throw Error('非 HTTPS 仅限媒体分段');
  return {url:u.href,method,headers};
}
export const hex = bytes => Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
export const digest = async bytes => hex(await crypto.subtle.digest('SHA-256',bytes));
export function validBundle(b,kind) {
  if(b?.schemaVersion!==1 || typeof b.version!=='string' || !/^[\w.-]{1,64}$/.test(b.version))throw Error('动态包版本无效');
  if(kind==='algorithm') {if(typeof b.script!=='string'||!b.config||!Array.isArray(b.tests)||!b.tests.length)throw Error('算法包格式无效');}
  else if(kind==='web') {for(const key of ['content','bridge','service','player','account','media-worker','algorithm-worker','player.html','account.html','content.css','player.css','account.css'])if(typeof b.assets?.[key]!=='string'||!b.assets[key].length)throw Error('功能包文件不完整：'+key);}
  else throw Error('动态包类型无效');
  return b;
}
