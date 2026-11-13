// 广告只接入官网原 video 的生命周期，不替换播放器、选集或控制栏。
import {parseAds,disabledAds,chooseAd,sideSpaces} from './ad-policy.mjs';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
export class WebAds {
 constructor(context=()=>null){
  this.context=context;this.config=disabledAds();this.nodes=new Map();this.video=null;this.identity='';this.lastUrl=location.href;this.intent=0;this.suppressUntil=0;this.dead=false;this.started=Date.now();this.splashDone=false;this.hiddenIds=new Set();this.selected=new Map();this.ended=new WeakMap();this.route=0;
  this.controller=new AbortController();const signal=this.controller.signal;
  for(const type of ['playing','pause','ended','emptied','loadstart'])document.addEventListener(type,e=>this.mediaEvent(e),{capture:true,signal});
  document.addEventListener('click',e=>{if(e.isTrusted&&!e.target.closest?.('.hg-ad-root,.hg-my,#hg-my-tab'))this.intent=Date.now();},{capture:true,signal});
  document.addEventListener('keydown',e=>{if(e.isTrusted&&[' ','k','K','MediaPlayPause'].includes(e.key))this.intent=Date.now();if(e.key==='Escape'&&this.modal){e.preventDefault();e.stopImmediatePropagation();this.closeModal(false);}},{capture:true,signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear(true);},{signal});
  document.addEventListener('fullscreenchange',()=>this.position(),{signal});addEventListener('resize',()=>this.position(),{signal});addEventListener('scroll',()=>this.position(),{passive:true,signal});
  this.timer=setInterval(()=>this.tick(),500);this.refreshTimer=setInterval(()=>void this.refresh(),60000);void this.refresh();
 }
 async refresh(){try{const result=await chrome.runtime.sendMessage({type:'ShellAdsConfig'});if(this.dead)return;const previous=this.config.version;this.config=parseAds(result?.config);if(previous!==this.config.version){this.selected.clear();this.hiddenIds.clear();this.nextTimes={danmaku:Date.now()+this.delay('danmaku'),corner:Date.now()+this.delay('corner')};this.clear(false);}if(!this.config.enabled){this.clear(false);return;}for(const id of [...this.nodes.keys()])if(!this.config.placements.some(p=>p.id===id&&p.enabled))this.remove(id);this.tick();if(!this.splashDone&&Date.now()-this.started<2000&&!document.hidden){this.splashDone=true;const ad=this.pick('splash');if(ad)this.showModal(ad);}}catch{/* 广告不可用不影响页面与视频。 */}}
 pick(id){return chooseAd(this.config,id);}
 blocked(){return document.hidden||document.body.classList.contains('hg-my-visible')||this.dead;}
 key(video){return video?location.pathname+'|'+(video.dataset.hgVideoId||video.currentSrc||video.src):'';}
 active(){return [...document.querySelectorAll('video')].filter(v=>!v.closest('.hg-ad-root')&&v.isConnected).map(v=>({v,r:v.getBoundingClientRect()})).filter(x=>x.r.width>100&&x.r.height>100&&x.r.bottom>68&&x.r.top<innerHeight&&x.r.right>0&&x.r.left<innerWidth).sort((a,b)=>b.r.width*b.r.height-a.r.width*a.r.height)[0]?.v??null;}
 tick(){
  if(this.dead)return;
  if(location.href!==this.lastUrl){this.lastUrl=location.href;this.route++;this.clear(true);this.identity='';}
  const video=this.active(),key=this.key(video);if(this.modal?.ad.slot.id==='splash'&&this.modal.video===video&&!this.modal.src){this.modal.src=video?.currentSrc;this.modal.key=key;this.identity=key;}if(video!==this.video||key!==this.identity){this.clear(true);this.video=video;this.identity=key;this.hiddenIds.clear();this.selected.clear();this.nextTimes={danmaku:Date.now()+this.delay('danmaku'),corner:Date.now()+this.delay('corner')};}
  if(this.blocked()||!this.config.enabled||this.config.expiresAt<=Date.now()){this.clear(true);return;}
  if(!video||video.paused||video.ended||!video.videoWidth||this.modal){this.clearInline();return;}
  for(const id of ['left','right'])if(!this.hiddenIds.has(id)&&!this.nodes.has(id)){if(!this.selected.has(id))this.selected.set(id,this.pick(id));const ad=this.selected.get(id);if(ad)this.showInline(ad);}
  for(const id of ['danmaku','corner'])if(!this.hiddenIds.has(id)&&!this.nodes.has(id)&&Date.now()>=this.nextTimes[id]){this.nextTimes[id]=Date.now()+this.delay(id);const ad=this.pick(id);if(ad)this.showInline(ad);}
  this.position();
 }
 delay(id){return (this.config.placements.find(p=>p.id===id)?.intervalSeconds??60)*1000;}
 mediaEvent(event){
  const video=event.target;if(!(video instanceof HTMLVideoElement)||video.closest('.hg-ad-root'))return;
  if(event.type==='ended'&&this.replaying)return;
  if(event.type==='ended'&&video===this.active()&&!this.blocked()){
   const current=this.context(),active=video.dataset.hgVideoId||location.pathname.match(/^\/player\/\d+\/(\d+)/)?.[1]||current?.videoId,index=current?.episodes?.indexOf(active),key=this.key(video);
   if(!location.pathname.startsWith('/player/')||!(index>=0)||!current.episodes[index+1]||this.ended.get(video)===key)return;
   this.ended.set(video,key);const ad=this.pick('interstitial');if(!ad)return;
   let count=0;try{count=Number(sessionStorage.getItem('hg-ad-completed-v1'))||0;sessionStorage.setItem('hg-ad-completed-v1',String(++count));}catch{count=1;}
   if(count%ad.slot.intervalEpisodes)return;
   event.stopImmediatePropagation();event.preventDefault();this.video=video;this.identity=key;
   this.showModal(ad,()=>{this.replaying=true;try{const next=video.closest('.xgplayer')?.querySelector('.xgplayer-pc-next');if(next)next.click();else video.dispatchEvent(new Event('ended',{bubbles:true}));}finally{this.replaying=false;}});return;
  }
  if(event.type==='playing'){if(this.modal?.ad.slot.id==='pause')this.closeModal(true);else if(this.modal?.video===video){this.modal.wasPlaying=true;this.modal.src=video.currentSrc;this.modal.key=this.key(video);this.identity=this.modal.key;this.suppressUntil=Date.now()+1500;video.pause();return;}this.ended.delete(video);this.tick();}
  if(event.type==='pause'){this.clearInline();if(video===this.active()&&!this.modal&&!video.ended&&video.currentTime>0&&Date.now()>this.suppressUntil&&Date.now()-this.intent<1500&&!this.blocked()){const ad=this.pick('pause');if(ad){this.video=video;this.identity=this.key(video);this.showModal(ad);}}}
  if(['emptied','loadstart'].includes(event.type)&&video===this.video&&!(this.modal?.ad.slot.id==='splash'&&!this.modal.src))this.clear(true);
 }
 card(ad){
  const root=el('aside',null,'hg-ad-root hg-ad-'+ad.slot.id);root.dataset.hgAd=ad.slot.id;root.setAttribute('aria-label','广告：'+ad.item.title);const label=el('span','广告','hg-ad-label'),close=el('button','×','hg-ad-close');close.type='button';close.setAttribute('aria-label','关闭广告');const link=el('a',null,'hg-ad-link');link.href=ad.item.targetUrl;link.target='_blank';link.rel='noopener noreferrer';link.onclick=e=>{e.preventDefault();e.stopPropagation();void chrome.runtime.sendMessage({type:'ShellAdClick',url:ad.item.targetUrl}).catch(()=>{});};
  if(['image','video'].includes(ad.item.type)){const media=el(ad.item.type==='video'?'video':'img',null,'hg-ad-media');media.src=ad.item.mediaUrl;media.referrerPolicy='no-referrer';if(media instanceof HTMLVideoElement){media.muted=true;media.autoplay=true;media.loop=true;media.playsInline=true;}else media.alt=ad.item.title;media.addEventListener('error',()=>{this.hiddenIds.add(ad.slot.id);if(this.modal?.root===root)this.closeModal(false);else this.remove(ad.slot.id);},{once:true});link.append(media);}
  link.append(el('strong',ad.item.title,'hg-ad-title'));if(ad.item.text)link.append(el('span',ad.item.text,'hg-ad-text'));root.append(label,close,link);root.addEventListener('click',e=>e.stopPropagation());return {root,close};
 }
 targetRoot(){return document.fullscreenElement||document.body;}
 showInline(ad){const {root,close}=this.card(ad);let node=root;close.onclick=e=>{e.preventDefault();this.hiddenIds.add(ad.slot.id);this.remove(ad.slot.id);};if(ad.slot.id==='danmaku'){node=el('div',null,'hg-ad-root hg-ad-track');node.dataset.hgAd='danmaku';node.append(root);root.style.animationDuration=ad.slot.durationSeconds+'s';}this.nodes.set(ad.slot.id,node);this.targetRoot().append(node);if(['corner','danmaku'].includes(ad.slot.id)){node.hgTimer=setTimeout(()=>this.remove(ad.slot.id),ad.slot.durationSeconds*1000);}this.position();}
 showModal(ad,next){
  if(this.modal||this.blocked())return;
  this.clearInline();const video=this.active(),src=video?.currentSrc,wasPlaying=video&&!video.paused&&!video.ended;this.suppressUntil=Date.now()+1500;if(wasPlaying)video.pause();
  const {root,close}=this.card(ad),overlay=el('div',null,'hg-ad-root hg-ad-overlay');overlay.dataset.hgAdModal=ad.slot.id;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','广告');const before=document.activeElement;overlay.append(root);this.targetRoot().append(overlay);
  this.modal={ad,root,overlay,video,src,wasPlaying,next,before,key:this.key(video),route:this.route};close.onclick=e=>{e.preventDefault();this.closeModal(false);};overlay.addEventListener('keydown',e=>{if(e.key==='Tab'){const focusable=[...overlay.querySelectorAll('a,button')];if(!focusable.includes(document.activeElement)||e.shiftKey&&document.activeElement===focusable[0]||!e.shiftKey&&document.activeElement===focusable.at(-1)){e.preventDefault();(e.shiftKey?focusable.at(-1):focusable[0])?.focus();}}});close.focus();
  if(ad.slot.id!=='pause')this.modal.timer=setTimeout(()=>this.closeModal(false),ad.slot.durationSeconds*1000);
 }
 closeModal(cancel){const m=this.modal;if(!m)return;this.modal=null;clearTimeout(m.timer);this.disposeNode(m.overlay);if(m.before?.isConnected)m.before.focus({preventScroll:true});if(cancel||this.blocked()||m.route!==this.route||!m.video?.isConnected||this.key(m.video)!==m.key||m.video.currentSrc!==m.src)return;if(m.next){m.next();return;}if(m.wasPlaying){this.suppressUntil=Date.now()+1000;m.video.play().catch(()=>{});}}
 position(){
  const video=this.video;if(!video)return;const rect=video.getBoundingClientRect(),space=getComputedStyle(video).objectFit==='contain'?sideSpaces(rect,video.videoWidth,video.videoHeight):null;
  for(const [id,node]of this.nodes){if(node.parentNode!==this.targetRoot())this.targetRoot().append(node);if(['left','right'].includes(id)){node.hidden=!space||space.height<100;if(space){Object.assign(node.style,{left:space[id]+'px',top:space.top+'px',width:space.width+'px',maxHeight:space.height+'px'});}}else if(id==='corner'){Object.assign(node.style,{left:Math.max(rect.left+8,rect.right-240)+'px',top:Math.max(rect.top+40,rect.bottom-235)+'px',width:'220px'});}else{Object.assign(node.style,{left:rect.left+'px',top:Math.max(70,rect.top+rect.height*.28)+'px',width:rect.width+'px'});const card=node.firstElementChild;card.style.maxWidth=Math.min(500,rect.width*.7)+'px';card.style.setProperty('--hg-ad-travel',rect.width+500+'px');}}
 }
 disposeNode(node){for(const video of node.querySelectorAll('video')){video.pause();video.removeAttribute('src');video.load();}node.remove();}
 remove(id){const node=this.nodes.get(id);if(node){clearTimeout(node.hgTimer);this.disposeNode(node);this.nodes.delete(id);}}
 clearInline(){for(const id of [...this.nodes.keys()])this.remove(id);}
 clear(cancel){this.closeModal(cancel);this.clearInline();}
 dispose(){if(this.dead)return;this.dead=true;this.clear(true);clearInterval(this.timer);clearInterval(this.refreshTimer);this.controller.abort();}
}
