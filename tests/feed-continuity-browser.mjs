// 推荐原页内连续选集、节点重建及免费序列末集滚轮回归。
import {launch} from './launch.mjs';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
process.env.HG_HEADED='1';process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
if(process.argv[2])process.env.HG_TEST_CHANNEL=process.argv[2];
const action=process.argv[3]??'wheel',root=path.resolve(import.meta.dirname,'..'),{context,channel,userScriptsDisabled}=await launch(root),checks=[];
let page;
const background=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
async function checkUnlocked(){
 await page.waitForFunction(()=>[...document.querySelectorAll('[class*="pc-episodes-"] >button')].filter(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.top<innerHeight&&r.width;}).every(n=>Number(n.textContent.trim())<=5||n.dataset.hgUnlocked==='true'),null,{timeout:10000});
 const cells=await page.locator('[class*="pc-episodes-"] >button').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.top<innerHeight&&r.width;}).map(n=>({episode:Number(n.textContent.trim()),green:n.dataset.hgUnlocked,disabled:n.disabled,locks:[...n.querySelectorAll('[class*="pc-episodeLock-"]')].map(l=>getComputedStyle(l).display)})));
 assert.ok(cells.length>=10);assert.ok(cells.every(n=>!n.disabled));assert.ok(cells.filter(n=>n.episode>5).every(n=>n.green==='true'&&n.locks.every(x=>x==='none')));
 assert.equal(await page.locator('[class*="pc-backdrop-"]').filter({visible:true}).count(),0,'不得弹出原站下载锁定层');
}
try{
 page=await context.newPage();page.on('pageerror',e=>console.log('页面错误',e.message.replace(/https?:\S+/g,'<url>').slice(0,200)));page.on('console',m=>{if(m.type()==='error'&&/React|Hydrat|#418|#425/.test(m.text()))console.log('页面水合状态',m.text().replace(/https?:\S+/g,'<url>').slice(0,220));});
 await page.addInitScript(()=>{window.hgCurrent=null;window.hgWheels=[];window.hgClicks=[];window.hgTrace=[];addEventListener('message',e=>{const d=e.data;if(e.source===window&&d?.channel==='hg-web-bridge'&&d.type==='snapshot')window.hgCurrent=d.value;if(d?.channel==='hg-native-media'&&['ready','source','error'].includes(d.type)||['hg-web-host','hg-web-bridge'].includes(d?.channel)&&['native-source','native-source-result'].includes(d.type))window.hgTrace.push({type:d.type,channel:d.channel,id:d.value?.videoId,error:String(d.message??d.error??d.value?.error??'').replace(/https?:\S+/g,'<url>').slice(0,120)});});document.addEventListener('click',e=>{const b=e.target.closest?.('button');window.hgClicks.push({tag:e.target.tagName,class:e.target.className,button:b?.getAttribute('aria-label'),green:b?.dataset.hgUnlocked,text:b?.textContent.slice(0,40)});},true);document.addEventListener('wheel',e=>{const nodes=[];for(let n=e.target;n&&nodes.length<5;n=n.parentElement)nodes.push([n.tagName,n.className]);window.hgWheels.push({delta:e.deltaY,nodes});},true);});
 await page.goto('https://hongguoduanju.com/?tab=feed',{waitUntil:'domcontentloaded'});await page.locator('#hg-my-tab').waitFor({timeout:30000});
 await page.locator('[class*="pc-backdrop-"] [class*="pc-close-"]').filter({visible:true}).first().click({timeout:1000}).catch(()=>{});
 await page.getByText('滚动鼠标滚轮，查看更多视频',{exact:true}).filter({visible:true}).click({timeout:1000}).catch(()=>{});
 await page.waitForFunction(()=>window.hgCurrent,null,{timeout:30000});await checkUnlocked();
 // 首次滚轮教学消费第一次交互；在首项向上滚动关闭教学，不改变推荐。
 await page.locator('[data-feed-playback-toggle]').first().hover();await page.mouse.wheel(0,-160);await page.waitForTimeout(800);
 await page.waitForFunction(()=>[...document.querySelectorAll('.swiper-slide-active video')].some(v=>v.readyState>=3&&v.videoWidth>0),null,{timeout:30000});
 const series=await page.evaluate(()=>window.hgCurrent);assert.ok(series.episodes[6]);
 for(const episode of [2,3,5]){
  await page.getByRole('button',{name:`第${episode}集`,exact:true}).filter({visible:true}).first().click();
  if(episode===2){await page.waitForTimeout(350);if(await page.evaluate(id=>window.hgCurrent.videoId!==id,series.episodes[1])){console.log('首个点击状态',await page.evaluate(()=>({clicks:window.hgClicks,hint:[...document.querySelectorAll('*')].filter(n=>n.textContent==='滚动鼠标滚轮，查看更多视频').map(n=>({class:n.className,rect:n.getBoundingClientRect().toJSON()}))})));await page.getByRole('button',{name:'第2集',exact:true}).filter({visible:true}).first().click();}}
  await page.waitForFunction(id=>window.hgCurrent?.videoId===id,series.episodes[episode-1],{timeout:20000});
  await checkUnlocked();checks.push(`第${episode}集重建后保持解锁`);console.log(checks.at(-1));
 }
 assert.equal(await page.evaluate(()=>window.hgCurrent.mode),'episodes');
 await page.getByText(/^16\s*[-–—]\s*30$/).filter({visible:true}).first().click();await checkUnlocked();checks.push('16-30集新分组选集全部保持解锁');
 await page.getByText(/^1\s*[-–—]\s*15$/).filter({visible:true}).first().click();await checkUnlocked();
 await page.screenshot({path:path.join(root,`test-results/feed-continuity-${channel}-fifth.png`),animations:'disabled'});
 const area=await page.locator('.swiper-slide-active video').boundingBox();assert.ok(area);await page.mouse.move(area.x+area.width/2,area.y+area.height/2);
 if(action==='end'){
  const active=page.locator('.swiper-slide-active video');await page.waitForFunction(()=>{const v=document.querySelector('.swiper-slide-active video');return v?.readyState>=3&&Number.isFinite(v.duration)&&v.duration>1;},null,{timeout:30000});await active.evaluate(v=>{v.muted=true;v.currentTime=v.duration-.4;return v.play();});
 }else if(action==='next'){
  const candidates=page.getByRole('button',{name:'下一集',exact:true});const index=await candidates.evaluateAll(nodes=>nodes.findIndex(n=>{const r=n.getBoundingClientRect();return r.width&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}));assert.ok(index>=0);await candidates.nth(index).click();
 }else await page.mouse.wheel(0,160);
 await page.waitForURL(`https://hongguoduanju.com/player/${series.id}/${series.episodes[5]}`,{waitUntil:'domcontentloaded',timeout:10000});
 if(action==='end'){await page.waitForTimeout(5000);console.log('片尾取流跟踪',await page.evaluate(()=>window.hgTrace));console.log('宿主阶段',await background.evaluate(()=>({phase:self.hgNetworkPhase,boot:self.hgBootFault,last:self.hgLastFault})));}
 await page.waitForFunction(id=>[...document.querySelectorAll('.xgplayer video')].some(v=>v.dataset.hgVideoId===id&&v.readyState>=3&&v.videoWidth>0),series.episodes[5],{timeout:55000});
 const video=page.locator('.xgplayer video').first();await video.evaluate(v=>{v.muted=true;return v.play();});await page.waitForFunction(()=>document.querySelector('.xgplayer video')?.currentTime>.8);
 checks.push(`推荐内第5集${action==='next'?'点击下一集':action==='end'?'自然片尾':'滚轮'}进入真实第6集`);console.log(checks.at(-1));
 await video.hover();await page.mouse.wheel(0,-160);await page.waitForURL(`https://hongguoduanju.com/player/${series.id}/${series.episodes[4]}`,{waitUntil:'domcontentloaded'});checks.push('正剧滚轮返回第5集');
 assert.equal(userScriptsDisabled,true);await writeFile(path.join(root,`test-results/feed-continuity-${channel}-${action}.json`),JSON.stringify({browser:context.browser().version(),userScriptsDisabled,checks},null,2));
}catch(error){if(page){console.log('连续换集状态',JSON.stringify(await page.evaluate(()=>({path:location.pathname,current:window.hgCurrent&&{id:window.hgCurrent.id,vid:window.hgCurrent.videoId,mode:window.hgCurrent.mode},clicks:window.hgClicks,groups:[...document.querySelectorAll('button,a,span')].filter(n=>/^\s*\d+\s*[-–—]\s*\d+\s*$/.test(n.textContent)).map(n=>({text:n.textContent,tag:n.tagName,class:n.className})),wheels:window.hgWheels,video:[...document.querySelectorAll('video')].map(v=>({ready:v.readyState,width:v.videoWidth,time:v.currentTime})),dialogs:[...document.querySelectorAll('[class*="pc-backdrop-"]')].filter(n=>n.getBoundingClientRect().width).map(n=>n.textContent.slice(0,100))}))));await page.screenshot({path:path.join(root,`test-results/feed-continuity-${channel}-failure.png`)});}throw error;}finally{await context.close();}
