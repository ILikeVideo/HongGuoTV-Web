export const AD_ORIGIN='https://tv-admin.curatedlifefinds.com';
export const AD_SLOTS=['splash','interstitial','left','right','pause','danmaku','corner'];
export const disabledAds=()=>({schemaVersion:1,enabled:false,version:0,expiresAt:0,placements:[]});
export function adHttps(raw){try{const u=new URL(raw);return typeof raw==='string'&&raw.length<=2048&&u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&u.hostname.includes('.')&&!/^[\d.]+$/.test(u.hostname)&&!u.hostname.includes(':')&&!/\.(local|lan|internal)$/.test(u.hostname)?u.href:'';}catch{return '';}}
export function parseAds(v,now=Date.now()){
 if(!v||v.schemaVersion!==1||typeof v.enabled!=='boolean'||!Number.isSafeInteger(v.version)||!Number.isFinite(v.expiresAt)||v.expiresAt<=now||v.expiresAt>now+150000||!Array.isArray(v.placements)||v.placements.length>7)return disabledAds();
 const integer=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max;
 const text=(x,max)=>typeof x==='string'?x.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max):'';
 const placements=[],seen=new Set();
 for(const p of v.placements){
  if(!AD_SLOTS.includes(p.id)||seen.has(p.id)||typeof p.enabled!=='boolean'||!integer(p.intervalEpisodes,1,100)||!integer(p.intervalSeconds,15,3600)||!integer(p.durationSeconds,1,120)||!Array.isArray(p.sources)||p.sources.length>30)return disabledAds();seen.add(p.id);
  const sources=[];
  for(const s of p.sources){if(typeof s.id!=='string'||!integer(s.weight,1,10000)||!Array.isArray(s.items)||s.items.length>100)continue;const items=[];
   for(const c of s.items){const targetUrl=adHttps(c.targetUrl),type=c.type;let mediaUrl='';if(['image','video'].includes(type)){try{const u=new URL(c.mediaUrl);if(u.origin===AD_ORIGIN&&/^\/web-ad-media\/[a-f0-9-]{36}$/.test(u.pathname)&&!u.search&&!u.hash)mediaUrl=u.href;}catch{}}
    if(!targetUrl||!['text','image','video','web'].includes(type)||!integer(c.weight,1,10000)||typeof c.id!=='string'||(['image','video'].includes(type)&&!mediaUrl)||(p.id==='danmaku'&&type==='video'))continue;
    items.push({id:text(c.id,36),title:text(c.title,80),text:text(c.text,300),type,targetUrl,mediaUrl,weight:c.weight});
   }if(items.length)sources.push({id:text(s.id,36),weight:s.weight,items});
  }placements.push({id:p.id,enabled:p.enabled,intervalEpisodes:p.intervalEpisodes,intervalSeconds:p.intervalSeconds,durationSeconds:p.durationSeconds,sources});
 }
 return {schemaVersion:1,enabled:v.enabled,version:v.version,expiresAt:v.expiresAt,placements};
}
export function weighted(rows,random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296){const total=rows.reduce((sum,x)=>sum+x.weight,0);if(!total)return null;let point=Math.max(0,Math.min(.999999999,random()))*total;for(const x of rows){point-=x.weight;if(point<0)return x;}return rows.at(-1);}
export function chooseAd(config,id,now=Date.now(),random){if(!config.enabled||config.expiresAt<=now)return null;const slot=config.placements.find(p=>p.id===id&&p.enabled);if(!slot)return null;const source=weighted(slot.sources,random),item=source&&weighted(source.items,random);return item?{slot,item,sourceId:source.id}:null;}
export function sideSpaces(rect,width,height){if(!(width>0&&height>0&&rect.width>0&&rect.height>0))return null;const scale=Math.min(rect.width/width,rect.height/height),space=(rect.width-width*scale)/2;return space>=108?{width:Math.min(240,space-16),height:Math.max(0,rect.height-130),left:rect.left+8,right:rect.right-Math.min(240,space-16)-8,top:rect.top+40}:null;}
