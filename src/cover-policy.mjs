const hosts=['fqnovelpic.com','byteimg.com','pstatp.com','fqnovel.com','douyinpic.com'];
export function coverUrl(value){
 if(value&&typeof value==='object')value=value.url??value.url_list?.[0]??value.uri??'';
 if(typeof value!=='string'||value.length>4096)return '';
 try{const u=new URL(value.startsWith('//')?'https:'+value:value);if(u.protocol==='http:')u.protocol='https:';return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))?u.href:'';}catch{return '';}
}
export function desktopCover(html){for(const tag of html.match(/<meta\b[^>]*>/gi)??[]){const attrs=Object.fromEntries([...tag.matchAll(/([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(m=>[m[1].toLowerCase(),m[2]??m[3]]));if(['og:image','twitter:image'].includes(attrs.property??attrs.name)){const value=(attrs.content??'').replace(/&amp;/g,'&').replace(/&quot;|&#34;/g,'"');const safe=coverUrl(value);if(safe)return safe;}}return '';}
