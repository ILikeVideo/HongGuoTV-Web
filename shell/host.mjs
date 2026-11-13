const mode=location.pathname.endsWith('/offscreen.html')?'service':location.pathname.endsWith('/player.html')?'player':'account';
const qs=new URLSearchParams(location.hash.slice(1)),siteOrigin=qs.get('origin'),token=qs.get('token');
if(mode==='player'&&!['https://hongguoduanju.com','https://www.hongguoduanju.com'].includes(siteOrigin))throw Error('播放页面来源无效');
const frame=document.querySelector('iframe'),owner=crypto.randomUUID();let port,ready=false;const queued=[];
const send=value=>frame.contentWindow.postMessage(value,'*');
async function connect(){
 port=chrome.runtime.connect({name:'shell-'+mode});
 port.onMessage.addListener(data=>{if(data.shell==='init')send({...data,owner,parentOrigin:siteOrigin});else if(data.shell==='request')send(data);else send({...data,owner});});
 port.onDisconnect.addListener(()=>{ready=false;document.querySelector('#status').textContent='连接已断开，请刷新页面';});
 port.postMessage({shell:'hello',mode});
}
addEventListener('message',event=>{
 if(event.source===frame.contentWindow){const d=event.data;if(d?.owner!==owner)return;
  if(d.shell==='ready'){ready=true;document.querySelector('#status').hidden=true;for(const value of queued.splice(0))send({shell:'site-message',value});}
  if(d.shell==='site-event'&&mode==='player')parent.postMessage(d.value,siteOrigin);
  else if(['call','business-reply','ready','failed'].includes(d.shell))port?.postMessage(d);
 }else if(mode==='player'&&event.source===parent&&event.origin===siteOrigin&&event.data?.channel==='hg-host'&&event.data.token===token){if(ready)send({shell:'site-message',value:event.data});else queued.push(event.data);}
});
frame.src=chrome.runtime.getURL('sandbox.html')+location.hash;
frame.addEventListener('load',()=>void connect(),{once:true});
