// 在原站已有的普通片源分支提供来源；不创建播放器或改变原站控制栏。
export function installNativeBridge(emit) {
  const originals = new Map(), requests = new Map(), wrapped = new WeakMap(),pages=new WeakMap(),views=new Set(),originalReqs=new WeakMap();let viewReady=false;
  const entry = new URL(location.href), seriesId = entry.pathname.match(/^\/player\/(\d+)/)?.[1];
  const entryVideo = entry.searchParams.get('pc_locked_episode') || entry.pathname.match(/^\/player\/\d+\/(\d+)/)?.[1];
  const id = value => typeof value === 'string' && /^[1-9]\d{0,29}$/.test(value);
  function remember(raw) {
    if (!raw || !id(String(raw.series_id)) || !Array.isArray(raw.vid_list) || !raw.vid_list.every(id)) return null;
    const key=String(raw.series_id);
    if (Number.isInteger(raw.accessible_episode_cnt) && raw.accessible_episode_cnt >= 0) {
      const previous=originals.get(key);
      if(!previous||previous.accessible!==raw.accessible_episode_cnt||previous.ids.length!==raw.vid_list.length||previous.ids.some((v,i)=>v!==raw.vid_list[i]))originals.set(key,{ids:raw.vid_list.slice(),accessible:raw.accessible_episode_cnt});
      if(originals.size>40)originals.delete(originals.keys().next().value);
    }
    return originals.get(key) ?? null;
  }
  function locked(series, video) {
    const info=originals.get(String(series)), index=info?.ids.indexOf(String(video)) ?? -1;
    return index>=0 && index>=info.accessible;
  }
  function transform(root) {
    const seen=new WeakSet();
    function visit(value,depth=0){
      if(!value||typeof value!=='object'||depth>10||seen.has(value))return;
      seen.add(value);
      remember(value);
      if(value.seriesDetail && String(value.seriesDetail.series_id)===seriesId){
        views.add(value);
        if(locked(seriesId,entryVideo)&&value.req){
          if(!originalReqs.has(value))originalReqs.set(value,value.req);
          if(!viewReady){const req=originalReqs.get(value);value.req={...req,pcAuthenticatedPlayback:false,pcPlaybackAuthState:req.pcPlaybackAuthState==='guest'?'extension-pending':req.pcPlaybackAuthState};}
        }
      }
      for(const child of Object.values(value))if(child && typeof child==='object')visit(child,depth+1);
    }
    // 先登记整个对象中的原始开放范围，避免父节点先于详情被处理。
    function collect(value,depth=0){if(!value||typeof value!=='object'||depth>10)return;remember(value);for(const child of Object.values(value))if(child&&typeof child==='object')collect(child,depth+1);}
    collect(root);visit(root);if(viewReady)activateView();
    if(seriesId&&id(entryVideo)&&locked(seriesId,entryVideo)&&entry.searchParams.has('pc_locked_episode')){
      const url=new URL(location.href);url.pathname=`/player/${seriesId}/${entryVideo}`;url.searchParams.delete('pc_locked_episode');history.replaceState(history.state,'',url);
    }
    return root;
  }
  function activateView(){
    if(!seriesId||!id(entryVideo)||!locked(seriesId,entryVideo))return;
    for(const value of views){value.vid=entryVideo;if(value.req)value.req={...(originalReqs.get(value)??value.req),pcAuthenticatedPlayback:false,pcLoginRequired:false};value.video_player_info=undefined;}
  }
  function pageView(original,require){
    if(!seriesId||!id(entryVideo)||!locked(seriesId,entryVideo))return original;
    if(!pages.has(original)){
      const React=require('Hw8'),jsx=require('ZT').jsx;
      const View=props=>{const [,refresh]=React.useState(0);React.useEffect(()=>{viewReady=true;activateView();refresh(1);},[]);return jsx(original,{...props});};
      pages.set(original,View);
    }
    return pages.get(original);
  }
  let router=window._ROUTER_DATA;
  if(router)transform(router);
  Object.defineProperty(window,'_ROUTER_DATA',{configurable:true,get:()=>router,set:value=>{router=transform(value);}});
  function source(series, video, signal){
    signal?.throwIfAborted();
    const requestId=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const cancel=()=>{requests.delete(requestId);clearTimeout(timer);emit('native-cancel',{requestId});reject(new DOMException('请求已取消','AbortError'));};
      const timer=setTimeout(()=>{requests.delete(requestId);signal?.removeEventListener('abort',cancel);emit('native-cancel',{requestId});reject(Error('片源获取超时，请重试'));},45000);
      const accessible=originals.get(String(series)).accessible;
      requests.set(requestId,{seriesId:String(series),videoId:String(video),accessible,resolve:value=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);resolve(value);},reject:reason=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(Error(reason));}});
      signal?.addEventListener('abort',cancel,{once:true});
      emit('native-source',{requestId,seriesId:String(series),videoId:String(video),accessible});
    });
  }
  function resolver(original){
    if(!wrapped.has(original))wrapped.set(original,function(series,video,signal){
      if(!seriesId||String(series)!==seriesId||!locked(seriesId,entryVideo))return original.apply(this,arguments);
      // 等待官网组件在水合完成后切到真正的锁定集；首集占位请求只等待取消。
      if(String(series)===seriesId&&locked(seriesId,entryVideo)&&String(video)!==entryVideo)return new Promise((resolve,reject)=>{if(signal?.aborted)return reject(new DOMException('请求已取消','AbortError'));const timer=setTimeout(()=>reject(Error('官网剧集上下文未就绪，请刷新')),45000);signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('请求已取消','AbortError'));},{once:true});});
      return source(series,video,signal);
    });
    return wrapped.get(original);
  }
  const patched=new WeakSet();
  function chunk(value){
    const modules=value?.[1];if(!modules||typeof modules!=='object')return;
    for(const [key,factory] of Object.entries(modules)){
      if(typeof factory!=='function'||patched.has(factory))continue;
      const code=factory.toString(),isResolver=code.includes('/api/video/protected/play-info')&&code.includes('resolveProtectedOptions'),isPage=code.includes('pc_locked_episode')&&code.includes('video_player_info')&&code.includes('pcAuthenticatedPlayback');
      if(!isResolver&&!isPage)continue;
      const replacement=function(module,exports,require){
        const adapted=function(...args){return require.apply(this,args);};Object.setPrototypeOf(adapted,require);
        adapted.d=(target,definitions)=>{const get=definitions.resolveProtectedOptions,next={...definitions};if(isResolver&&get)next.resolveProtectedOptions=()=>resolver(get());if(isPage&&definitions.A){const page=definitions.A;next.A=()=>pageView(page(),require);}return require.d(target,next);};
        return factory.call(this,module,exports,adapted);
      };
      patched.add(replacement);modules[key]=replacement;
    }
  }
  function hook(array){
    if(array.__hgNativeHook)return array;
    Object.defineProperty(array,'__hgNativeHook',{value:true});array.forEach(chunk);
    let push=array.push;
    // 每次读取捕获当时的 push，避免 Rspack 安装回调后的父链递归。
    Object.defineProperty(array,'push',{configurable:true,get(){const original=push;return function(...items){items.forEach(chunk);return original.apply(this,items);};},set:value=>{push=value;}});
    return array;
  }
  let chunks=hook(window.rspackChunkhongguo || []);
  Object.defineProperty(window,'rspackChunkhongguo',{configurable:true,get:()=>chunks,set:value=>{chunks=hook(value);}});
  addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.channel!=='hg-web-host')return;
    const m=event.data;
    if(m.type==='snapshot')for(const [requestId,r] of requests)emit('native-source',{requestId,seriesId:r.seriesId,videoId:r.videoId,accessible:r.accessible});
    if(m.type!=='native-source-result')return;
    const request=requests.get(m.requestId);if(!request)return;
    requests.delete(m.requestId);
    if(m.error)return request.reject(String(m.error).slice(0,200));
    if(typeof m.url!=='string'||!m.url.startsWith('blob:'+location.origin+'/'))return request.reject('片源桥接地址无效');
    request.resolve({mode:'legacy',url:m.url,width:m.width,height:m.height,duration:m.duration});
  });
  return {transform,originalAccessible:raw=>remember(raw)?.accessible,locked};
}
