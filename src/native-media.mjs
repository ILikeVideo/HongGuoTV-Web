// 固定官网适配器：将动态沙盒产生的标准片段送入官网原视频元素。
export class NativeMedia {
 constructor(onError){this.onError=onError;this.revision=0;this.tracks=new Map();this.listener=e=>this.message(e);addEventListener('message',this.listener);}
 send(type,value={}){this.frame?.contentWindow?.postMessage({channel:'hg-host',token:this.token,type,requestId:this.requestId,attempt:this.attempt,...value},new URL(chrome.runtime.getURL('/')).origin);}
 prepare(value){
  this.dispose();this.requestId=value.requestId;this.videoId=value.videoId;this.episode=value.episode;this.token=crypto.randomUUID();this.attempt=0;this.config=value;
  const frame=document.createElement('iframe');frame.hidden=true;frame.className='hg-native-host';frame.title='片源处理';frame.src=chrome.runtime.getURL('player.html')+'#'+new URLSearchParams({token:this.token,origin:location.origin});this.frame=frame;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.fail('片源处理启动超时，请重试'),40000);this.pending={resolve,reject,timer};document.body.append(frame);});
 }
 findVideo(){return [...document.querySelectorAll('video')].find(v=>v.getAttribute('src')===this.url||v.currentSrc===this.url);}
 replaceMedia(info){
  const previous=this.video,replace=previous?.isConnected&&(previous.getAttribute('src')===this.url||previous.currentSrc===this.url);
  this.position=replace?previous.currentTime:this.config.position??0;this.wasPlaying=replace?!previous.paused:true;this.speed=previous?.playbackRate??1;
  this.clearMedia();this.media=new MediaSource();this.url=URL.createObjectURL(this.media);const media=this.media,revision=this.revision;
  media.addEventListener('sourceopen',()=>{if(this.media!==media||revision!==this.revision)return;this.video=this.findVideo();if(!this.video)return this.fail('未找到官网原视频元素');this.bindVideo();this.send('media-open');},{once:true});
  if(replace){previous.src=this.url;previous.load();}
  if(this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.resolve({url:this.url,width:info.width,height:info.height,duration:info.duration});}
 }
 bindVideo(){
  const v=this.video,signal=(this.events=new AbortController()).signal;
  v.dataset.hgVideoId=this.videoId;v.dataset.hgEpisode=String(this.episode);
  v.addEventListener('timeupdate',()=>this.drained(),{signal});
  v.addEventListener('seeking',()=>{this.ended=false;if(![...Array(v.buffered.length)].some((_,i)=>v.currentTime>=v.buffered.start(i)&&v.currentTime<v.buffered.end(i)))this.send('seek',{position:v.currentTime});},{signal});
  v.addEventListener('error',()=>this.send('media-error',{message:'浏览器视频解码失败'}),{signal});
  v.addEventListener('loadedmetadata',()=>{if(this.position>0)v.currentTime=this.position;v.playbackRate=this.speed;},{signal});
  v.addEventListener('canplay',()=>{if(this.wasPlaying)v.play().catch(()=>{});},{once:true,signal});
 }
 message(event){
  const d=event.data;
  if(event.source!==this.frame?.contentWindow||event.origin!==new URL(chrome.runtime.getURL('/')).origin||d?.channel!=='hg-native-media'||d.token!==this.token)return;
  if(d.type==='ready'){this.send('load',this.config);return;}
  if(d.session!==this.requestId)return;
  if(d.type==='source'){if(!Number.isSafeInteger(d.attempt)||d.attempt<=this.attempt)return;this.attempt=d.attempt;this.replaceMedia(d);return;}
  if(d.attempt!==this.attempt)return;
  if(d.type==='error'){this.fail(String(d.message||'片源暂不可用'));return;}
  const media=this.media,revision=this.revision;
  if(media?.readyState!=='open')return;
  if(d.type==='track'){
    if(this.tracks.size>=4||!Number.isSafeInteger(d.id)||typeof d.mime!=='string'||!/^(video|audio)\/mp4; codecs="[\w. -]+"$/.test(d.mime)||!MediaSource.isTypeSupported(d.mime)){this.send('media-error',{message:'浏览器不支持当前片源编码'});return;}
    try{if(Number.isFinite(d.duration)&&d.duration>0)media.duration=d.duration;const buffer=media.addSourceBuffer(d.mime),track={buffer,queue:[],media,revision};this.tracks.set(d.id,track);buffer.addEventListener('updateend',()=>this.append(track));buffer.addEventListener('error',()=>{if(media===this.media)this.send('media-error',{message:'浏览器视频缓冲失败'});});}catch{this.send('media-error',{message:'无法创建视频缓冲区'});}
  }else if(d.type==='segment'){
    const track=this.tracks.get(d.id);if(!track||!(d.buffer instanceof ArrayBuffer)||d.buffer.byteLength>4*1024*1024)return;
    track.queue.push(d.buffer);if(track.queue.reduce((n,b)=>n+b.byteLength,0)>16*1024*1024)return this.fail('视频缓冲超过上限');this.append(track);
  }else if(d.type==='chunk'){this.chunkPending=true;this.drained();}
  else if(d.type==='end'){this.ended=true;this.drained();}
 }
 append(track){
  if(track.media!==this.media||track.revision!==this.revision||track.buffer.updating||this.media.readyState!=='open')return;
  try{
   if(track.queue.length)track.buffer.appendBuffer(track.queue.shift());
   else if(this.video?.currentTime>45&&track.buffer.buffered.length&&track.buffer.buffered.start(0)<this.video.currentTime-35)track.buffer.remove(0,this.video.currentTime-30);
   else this.drained();
  }catch{this.send('media-error',{message:'视频缓冲失败'});}
 }
 drained(){
  if(!this.media||this.media.readyState!=='open'||![...this.tracks.values()].every(t=>!t.buffer.updating&&!t.queue.length))return;
  if(this.ended){try{this.media.endOfStream();}catch{}return;}
  const v=this.video,ahead=v?.buffered.length?v.buffered.end(v.buffered.length-1)-v.currentTime:0;
  if(this.chunkPending&&(ahead<30||v?.readyState<3)){this.chunkPending=false;this.send('continue');}
 }
 fail(reason){if(this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.reject(Error(reason));}else this.onError?.(reason);this.send('stop');}
 clearMedia(){this.events?.abort();this.events=null;if(this.video&&this.video.dataset.hgVideoId===this.videoId){delete this.video.dataset.hgVideoId;delete this.video.dataset.hgEpisode;}if(this.url)URL.revokeObjectURL(this.url);this.url=null;this.tracks.clear();this.media=null;this.video=null;this.chunkPending=false;this.ended=false;}
 cancel(requestId){if(this.requestId===requestId)this.dispose();}
 dispose(){this.revision++;this.send('stop');if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(new DOMException('请求已取消','AbortError'));this.pending=null;}this.frame?.remove();this.frame=null;this.clearMedia();}
}
