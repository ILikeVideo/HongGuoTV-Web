// 官网导航、片单与原播放器片源桥接；不替换页面或控制栏。
import {rpc} from './rpc.mjs';
import {normalizePhone} from './website-account.mjs';
import {siteConfig,DEFAULT_SITE_CONFIG} from '../shell/site-config.mjs';
import {NativeMedia} from './native-media.mjs';
import {WebAds} from './ads.mjs';
import {CoverLoader} from './covers.mjs';
import {tvDownloads} from './tv-downloads.mjs';
import {installWheelNavigation} from './wheel-navigation.mjs';
import {EPISODE_CELL_SELECTOR} from './episode-cells.mjs';
let appearance=siteConfig(globalThis.__HG_SITE_CONFIG__),current=null,uiReady=false,lastUrl=location.href;
let myPanel=null,myRevision=0,myVideos=[],pendingPhone='',websiteLoggedIn,accountFingerprint='',loginRequested=false;
let myOriginalUrl='',myUrl='';const hiddenNative=new Set();
const seriesCache=new Map(),processing=new Set(),requests=new Map();let enhanceTimer;
const host=(type,value={})=>window.postMessage({channel:'hg-web-host',type,...value},location.origin);
let bridgeSeen=false,bridgeAttempts=0,bridgeTimer;
function requestBridge(){
 clearTimeout(bridgeTimer);host('snapshot');if(uiReady)return;
 if(++bridgeAttempts===2&&!bridgeSeen)void chrome.runtime.sendMessage({type:'ShellEnsureBridge'}).then(()=>host('snapshot')).catch(()=>{});
 if(bridgeAttempts<12)bridgeTimer=setTimeout(requestBridge,1000);
}
const native=new NativeMedia(hint);
const ads=new WebAds(()=>current);
const element=(tag,text,cls='')=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,fn,cls='')=>{const n=element('button',text,cls);n.type='button';n.onclick=fn;return n;};
function hint(text){let n=document.querySelector('#hg-hint');if(!n){n=element('div','','hg-hint');n.id='hg-hint';n.setAttribute('role','status');document.body.append(n);}n.textContent=text;setTimeout(()=>n.remove(),6000);}
async function source(value){
 if(!value||!/^\d{1,30}$/.test(value.seriesId)||!/^\d{1,30}$/.test(value.videoId)||typeof value.requestId!=='string'||processing.has(value.requestId))return;
 processing.add(value.requestId);const signal=new AbortController();requests.set(value.requestId,signal);
 try{
  let detail=seriesCache.get(value.seriesId);if(!detail){detail=await rpc('GetDetail',{seriesId:value.seriesId},signal.signal);seriesCache.set(value.seriesId,detail);if(seriesCache.size>20)seriesCache.delete(seriesCache.keys().next().value);}
  signal.signal.throwIfAborted();
  const index=detail.episodes.indexOf(value.videoId);
  if(index<0||!Number.isInteger(value.accessible)||index<value.accessible)throw Error('仅对官网原本锁定的剧集提供片源');
  const fragment=new URLSearchParams(location.hash.slice(1)),position=Number(fragment.get('hg-position'));
  const info=await native.prepare({requestId:value.requestId,videoId:value.videoId,platform:detail.platforms?.[value.videoId]??detail.platform,episode:index+1,position:Number.isFinite(position)&&position>0?position:0});
  signal.signal.throwIfAborted();host('native-source-result',{requestId:value.requestId,...info});
 }catch(error){if(!signal.signal.aborted)host('native-source-result',{requestId:value.requestId,error:error.message});}
 finally{processing.delete(value.requestId);requests.delete(value.requestId);}
}
function enhanceEpisodes(){
 if(!current||!uiReady)return;
 let waiting=false;
 const feed=location.pathname==='/'&&document.querySelector('[data-home-feed]');
 for(const cell of document.querySelectorAll(EPISODE_CELL_SELECTOR)){
  if(!cell.querySelector('[class*="episode-text"],[class*="episodeText"]')&&!/^(A|BUTTON)$/.test(cell.tagName))continue;
  const text=cell.textContent.trim();if(!/^\d+$/.test(text))continue;
  const rect=cell.getBoundingClientRect();if(feed&&(rect.width===0||rect.right<=0||rect.left>=innerWidth))continue;
  const index=Number(text)-1;if(index<0||index>=current.episodes.length)continue;
  if(!cell.hasAttribute('data-hg-site-ready')){waiting=true;continue;}
  cell.dataset.hgEpisode=String(index);
  if(index<current.accessible){cell.removeAttribute('data-hg-unlocked');cell.querySelector('.hg-unlock-icon')?.remove();if(cell.getAttribute('aria-label')?.endsWith('，已解锁'))cell.setAttribute('aria-label',`第${index+1}集`);continue;}
  cell.dataset.hgUnlocked='true';
  if(cell.hasAttribute('aria-label')&&cell.getAttribute('aria-label')!==`第${index+1}集，已解锁`)cell.setAttribute('aria-label',`第${index+1}集，已解锁`);
  if(!cell.querySelector('.hg-unlock-icon')){
   const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('class','hg-unlock-icon');icon.setAttribute('aria-label','已解锁');
   const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d','M7 10V7a5 5 0 0 1 9.6-2M5 10h14v11H5zM12 14v3');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','2');path.setAttribute('stroke-linecap','round');icon.append(path);
   cell.append(icon);
  }
 }
 if(waiting&&!enhanceTimer)enhanceTimer=setTimeout(()=>{enhanceTimer=null;enhanceEpisodes();},100);
}
function navigation(){
 if(!uiReady)return;
 let tab=document.querySelector('#hg-my-tab');
 if(tab){if(tab.textContent!==appearance.myLabel)tab.textContent=appearance.myLabel;return;}
 let rank;try{rank=document.querySelector(appearance.rankSelector);}catch{}
 rank??=document.querySelector(DEFAULT_SITE_CONFIG.rankSelector);rank??=[...document.querySelectorAll('header a,header button,header [class*="link"],header [class*="nav"]')].find(n=>n.textContent.trim()==='榜单');if(!rank)return;
 tab=element('a',appearance.myLabel,rank.className+' hg-my-tab');tab.id='hg-my-tab';tab.href='#hg-my';tab.onclick=event=>{event.preventDefault();void showMy();};
 const wrapper=rank.closest('[class*="dropdown-nav"]')||rank;wrapper.parentElement?.setAttribute('data-hg-site-tabs','true');wrapper.insertAdjacentElement('afterend',tab);
 if(myPanel)tab.setAttribute('aria-current','page');
}
function syncMyLayout(){
 if(!myPanel)return;let node=document.querySelector('header');if(!node)return;
 const header=node;let mount=null;
 while(node?.parentElement&&node.parentElement!==document.body){const parent=node.parentElement;
  for(const sibling of parent.children)if(sibling!==node&&sibling!==myPanel&&!sibling.contains(myPanel)&&!['SCRIPT','STYLE','LINK'].includes(sibling.tagName)){sibling.setAttribute('data-hg-my-hidden','true');hiddenNative.add(sibling);}
  if(!mount&&parent.children.length>1&&!parent.matches('header,nav')&&node.contains(header))mount=parent;
  if(parent.id==='root')break;node=parent;
 }
 if(mount&&myPanel.parentElement!==mount)mount.append(myPanel);
}
addEventListener('hg-site-config',()=>{appearance=siteConfig(globalThis.__HG_SITE_CONFIG__);navigation();if(uiReady)tvDownloads(appearance);const title=myPanel?.querySelector('h1');if(title)title.textContent=appearance.myTitle;});
addEventListener('message',event=>{
 if(event.source!==window||event.origin!==location.origin||event.data?.channel!=='hg-web-bridge')return;
 const {type,value}=event.data;
 if(type==='bridge-ready'){bridgeSeen=true;return;}
 if(type==='native-source'){void source(value);return;}
 if(type==='native-cancel'){requests.get(value?.requestId)?.abort();native.cancel(value?.requestId);return;}
 if(type==='ready'){uiReady=true;clearTimeout(bridgeTimer);navigation();tvDownloads(appearance);enhanceEpisodes();checkWebsiteAccount();if(location.hash==='#hg-my')void showMy(false);if(location.hash==='#hg-login'&&!loginRequested){loginRequested=true;openWebsiteLogin();}}
 if(type==='snapshot'&&value&&/^\d+$/.test(value.id)&&Array.isArray(value.episodes)){current=value;enhanceEpisodes();}
 if(type==='account'){
  if(!value||typeof value.loggedIn!=='boolean')return;
  const phone=normalizePhone(value.phone)||(value.loginSucceeded?pendingPhone:''),fingerprint=JSON.stringify([value.loggedIn,value.userId,phone]);
  if(fingerprint!==accountFingerprint){accountFingerprint=fingerprint;rpc('SyncWebsiteSession',{phone,userId:String(value.userId??''),loggedIn:value.loggedIn}).catch(()=>{});}
  if(value.loginSucceeded)pendingPhone='';
 }
});
async function showMy(push=true){
 if(myPanel)return;
 document.body.classList.add('hg-my-visible');myOriginalUrl=location.href.replace(/#hg-my$/,'');if(push)history.pushState({...history.state,hgMy:true},'','#hg-my');myUrl=location.href;lastUrl=location.href;
 myVideos=[...document.querySelectorAll('video')].map(video=>({video,src:video.currentSrc,playing:!video.paused}));for(const {video} of myVideos)video.pause();
 const mine=++myRevision,panel=element('section',undefined,'hg-my');myPanel=panel;panel.hgCovers=new CoverLoader();panel.setAttribute('role','region');panel.setAttribute('aria-label','我的红果片单');document.querySelector('#hg-my-tab')?.setAttribute('aria-current','page');
 const header=element('div',undefined,'hg-my-header');header.append(element('h1',appearance.myTitle));panel.append(header);
 const profileLine=element('div','正在读取账号…','hg-profile'),tabs=element('div',undefined,'hg-tabs'),secondary=element('div',undefined,'hg-tabs hg-secondary'),list=element('div',undefined,'hg-library-grid');panel.append(profileLine,tabs,secondary,list);
 const footer=button('加载更多',()=>loadPage(),'hg-library-footer');panel.append(footer);document.body.append(panel);syncMyLayout();
 let kind='history',coming=false,cursor=null,busy=false,done=false,revision=0;
 async function change(nextKind,nextComing=false){kind=nextKind;coming=nextComing;revision++;cursor=null;done=false;busy=false;panel.hgCovers.dispose();panel.hgCovers=new CoverLoader();list.replaceChildren();secondary.replaceChildren();for(const item of tabs.children)item.setAttribute('aria-selected',String(item.dataset.kind===kind));if(kind==='reservations')secondary.append(button('已上线',()=>change(kind,false),coming?'':'active'),button('待上线',()=>change(kind,true),coming?'active':''));await loadPage();}
 function card(item){
  const row=button('',()=>{if(!item.playable){hint(item.publishText||'本剧暂未上线');return;}const vid=/^\d+$/.test(item.episodeId)?'/'+item.episodeId:'';location.href=`/player/${item.id}${vid}`+(kind==='history'?'#hg-position='+item.position/1000:'');},'hg-library-card');
  const frame=element('div',undefined,'hg-cover-frame'),image=element('img'),fallback=element('span','暂无封面','hg-cover-placeholder');frame.append(image,fallback);panel.hgCovers.add(image,item.cover,item.id);const text=element('div');text.append(element('strong',item.title));text.append(element('p',kind==='history'?`第 ${item.episode||1} 集 · ${Math.floor(item.position/60000)}分${Math.floor(item.position/1000)%60}秒`:item.publishText||(item.count?`全 ${item.count} 集`:'')));row.append(frame,text);return row;
 }
 async function loadPage(){
  if(busy||done||myPanel!==panel)return;const ticket=revision;busy=true;footer.textContent='正在加载…';footer.disabled=true;
  try{const page=await rpc('GetLibraryPage',{kind,coming,cursor});if(ticket!==revision||mine!==myRevision)return;page.items.forEach(item=>list.append(card(item)));cursor=page.next;done=!page.next;footer.textContent=done?(list.children.length?'没有更多了':'暂无记录'):'加载更多';}
  catch(error){if(ticket===revision)footer.textContent=error.message+' · 点击重试';}
  finally{if(ticket===revision){busy=false;footer.disabled=done;}}
 }
 for(const [key,label] of [['history','历史'],['favorites','收藏'],['likes','点赞'],['reservations','预约']]){const tab=button(label,()=>change(key));tab.dataset.kind=key;tab.setAttribute('role','tab');tabs.append(tab);}
 const observer=new IntersectionObserver(entries=>{if(entries[0].isIntersecting&&list.children.length)void loadPage();},{root:null,rootMargin:'100px'});observer.observe(footer);panel.hgObserver=observer;
 try{
  let profile=await rpc('GetProfile');if(!profile){try{profile=await rpc('SyncWebsiteSession');}catch{}}
  if(myPanel!==panel)return;profileLine.replaceChildren();
  if(profile){profileLine.append(element('span',profile.nickname+(profile.phone?' · '+profile.phone:'')),button('账号信息',()=>rpc('OpenAccount')));await change('history');}
  else{profileLine.append(element('span','请先在红果官网登录，查看手机片单'),button('前往官网登录',()=>{closeMy();openWebsiteLogin();}));footer.textContent='登录后显示历史、收藏、点赞和预约';footer.disabled=true;}
 }catch(error){profileLine.textContent=error.message;}
}
function closeMy(restoreUrl=true){myRevision++;myPanel?.hgObserver?.disconnect();myPanel?.hgCovers?.dispose();myPanel?.remove();myPanel=null;for(const node of hiddenNative)node.removeAttribute('data-hg-my-hidden');hiddenNative.clear();document.body.classList.remove('hg-my-visible');document.querySelector('#hg-my-tab')?.removeAttribute('aria-current');if(restoreUrl&&location.href===myUrl)history.replaceState(history.state,'',myOriginalUrl);for(const {video,src,playing} of myVideos)if(playing&&video.isConnected&&video.currentSrc===src)video.play().catch(()=>{});myVideos=[];}
addEventListener('popstate',()=>{if(myPanel&&location.href!==myUrl)closeMy(false);else if(!myPanel&&location.hash==='#hg-my')void showMy(false);});
document.addEventListener('click',event=>{if(!myPanel||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const link=event.target.closest?.('header a,nav a');if(link&&link.id!=='hg-my-tab'&&new URL(link.href,location.href).origin===location.origin)closeMy(false);},true);
function nextLocked(event){
 if(!current)return;
 const fromVideo=event.type==='ended',video=fromVideo?event.target:document.querySelector('.xgplayer video');
 if(fromVideo&&!video?.dataset.hgVideoId)return;
 if(!fromVideo&&!event.target.closest?.('.xgplayer-pc-next'))return;
 const active=video?.dataset.hgVideoId||location.pathname.match(/^\/player\/\d+\/(\d+)/)?.[1]||current.videoId,index=current.episodes.indexOf(active),next=current.episodes[index+1];
 if(index<0||!next||index+1<current.accessible)return;
 event.preventDefault();event.stopImmediatePropagation();location.href=`/player/${current.id}/${next}`;
}
// 推荐栏有原站捕获阶段的锁定动作，在 React 根节点之前处理已解锁选集。
document.addEventListener('click',event=>{const cell=event.target.closest?.('[data-hg-unlocked="true"][data-hg-episode]');if(!cell)return;const target=current,selected=Number(cell.dataset.hgEpisode);if(!target||!Number.isInteger(selected)||selected<target.accessible||!target.episodes[selected])return;event.preventDefault();event.stopImmediatePropagation();location.href=`/player/${target.id}/${target.episodes[selected]}`;},true);
document.addEventListener('click',nextLocked,true);document.addEventListener('ended',nextLocked,true);
installWheelNavigation({disabled:()=>!!myPanel||!uiReady,episode:direction=>{
 const match=location.pathname.match(/^\/player\/(\d+)(?:\/(\d+))?\/?$/);if(!match||current?.id!==match[1])return false;
 const active=document.querySelector('.xgplayer video')?.dataset.hgVideoId||match[2]||current.videoId||current.episodes[0],index=current.episodes.indexOf(active),next=current.episodes[index+direction];
 if(index<0||!next)return false;
 const cell=document.querySelector(`[data-hg-episode="${index+direction}"]`);
 if(index+direction>=current.accessible||!cell)location.href=`/player/${current.id}/${next}`;else cell.click();
 return true;
},feed:direction=>{if(!document.querySelector('.swiper-slide-active'))return false;host('wheel-feed',{direction});return true;}});
function captureLoginPhone(event){const submit=event.type==='submit'||event.target.closest?.('button,[role="button"]')?.textContent?.match(/登录|注册/);if(!submit)return;const phone=[...document.querySelectorAll('input[type="tel"],input[placeholder*="手机号"],input[name="mobile"],input[name="phone"]')].map(input=>normalizePhone(input.value)).find(Boolean);if(phone)pendingPhone=phone;}
for(const type of ['submit','click','mousedown'])document.addEventListener(type,captureLoginPhone,true);
function openWebsiteLogin(){const login=[...document.querySelectorAll('header button,header a')].find(n=>n.textContent.trim()==='登录');if(login)login.click();else hint('请使用官网右上角账号入口管理登录');}
function checkWebsiteAccount(){
 if(!uiReady)return;const header=document.querySelector('header');if(!header)return;const loggedIn=![...header.querySelectorAll('button,a')].some(n=>n.textContent.trim()==='登录');if(loggedIn===websiteLoggedIn)return;const previously=websiteLoggedIn;websiteLoggedIn=loggedIn;const visible=(header.textContent.match(/1[3-9]\d(?:\d{8}|[*•xX]{4,6}\d{2,4})/)??[])[0],phone=normalizePhone(visible)||(previously===false&&loggedIn?pendingPhone:'');const state={phone};if(loggedIn||previously===true)state.loggedIn=loggedIn;rpc('SyncWebsiteSession',state).catch(()=>{});if(loggedIn)pendingPhone='';
}
chrome.runtime.onMessage.addListener(message=>{if(message.type==='account-changed'&&myPanel){closeMy();void showMy();}if(message.type==='open-website-login')openWebsiteLogin();});
let scheduled=false;
new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;navigation();if(uiReady)tvDownloads(appearance);enhanceEpisodes();checkWebsiteAccount();if(myPanel){if(location.href!==myUrl)closeMy(false);else syncMyLayout();}if(location.href!==lastUrl){lastUrl=location.href;host('snapshot');}});}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','data-feed-item','data-hg-site-ready']});
addEventListener('pagehide',event=>{clearTimeout(bridgeTimer);if(event.persisted)return;for(const controller of requests.values())controller.abort();myPanel?.hgCovers?.dispose();native.dispose();ads.dispose();});
addEventListener('pageshow',event=>{if(event.persisted){bridgeSeen=false;bridgeAttempts=0;requestBridge();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(!bridgeSeen||!uiReady)){bridgeAttempts=0;requestBridge();}});
requestBridge();
