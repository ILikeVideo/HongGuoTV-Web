// 实测推荐选集面板的绿色解锁及进入对应正剧集，不替换官网界面。
import {launch} from './launch.mjs';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
process.env.HG_HEADED='1';process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
if(process.argv[2])process.env.HG_TEST_CHANNEL=process.argv[2];
const root=path.resolve(import.meta.dirname,'..'),{context,channel,userScriptsDisabled}=await launch(root);
const background=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
await background.evaluate(()=>{self.hgNetworkTrace=[];const original=fetch;self.fetch=async(raw,options)=>{const host=new URL(String(raw)).hostname,entry={host,start:Date.now()};self.hgNetworkTrace.push(entry);try{const r=await original(raw,options);entry.status=r.status;entry.elapsed=Date.now()-entry.start;return r;}catch(error){entry.error=error.name;entry.elapsed=Date.now()-entry.start;throw error;}};});
try{
 const page=await context.newPage();await page.addInitScript(()=>{window.hgCurrent=null;window.hgTrace=[];addEventListener('message',e=>{if(e.data?.channel==='hg-native-media'&&['ready','source','error'].includes(e.data.type)){window.hgTrace.push({type:'media-'+e.data.type,error:String(e.data.message??'').replace(/https?:\S+/g,'<url>').slice(0,160)});return;}if(e.source!==window||e.data?.channel!=='hg-web-bridge'&&e.data?.channel!=='hg-web-host')return;if(e.data.type==='snapshot')window.hgCurrent=e.data.value;if(['native-source','native-source-result'].includes(e.data.type)){const v=e.data.value??e.data;window.hgTrace.push({type:e.data.type,videoId:v.videoId,error:String(v.error??'').replace(/https?:\S+/g,'<url>').slice(0,160)});}});});
 await page.goto('https://hongguoduanju.com/?tab=feed',{waitUntil:'domcontentloaded'});await page.locator('#hg-my-tab').waitFor({timeout:30000});
 await page.locator('[class*="pc-backdrop-"] [class*="pc-close-"]').filter({visible:true}).first().click({timeout:1000}).catch(()=>{});
 await page.waitForFunction(()=>window.hgCurrent,null,{timeout:30000});
 // 新配置首次会显示官网滚轮教学层，使用真实滚轮完成教学并回到原推荐。
 const entry=await page.evaluate(()=>window.hgCurrent.videoId);
 await page.locator('[data-feed-playback-toggle]').first().hover();await page.mouse.wheel(0,160);
 await page.waitForFunction(id=>window.hgCurrent?.videoId!==id,entry,{timeout:15000});
 await page.waitForTimeout(800);await page.locator('[data-feed-playback-toggle]').first().hover();await page.mouse.wheel(0,-160);
 await page.waitForFunction(id=>window.hgCurrent?.videoId===id,entry,{timeout:15000});
 const current=await page.evaluate(()=>window.hgCurrent);assert.equal(current.accessible,5);
 const cell=page.locator('[class*="pc-episodes-"] > button[data-hg-episode="5"]').filter({visible:true}).first();await cell.waitFor({timeout:20000});
 assert.equal(await cell.getAttribute('data-hg-unlocked'),'true');assert.ok(await cell.locator('.hg-unlock-icon').isVisible());
 assert.equal(await cell.locator('[class*="pc-episodeLock-"]').evaluate(n=>getComputedStyle(n).display),'none');
 assert.equal(await page.locator('[class*="pc-episodes-"] > button[data-hg-episode="0"][data-hg-unlocked]').count(),0);
 await page.screenshot({path:path.join(root,`test-results/feed-episodes-${channel}-unlocked.png`)});
 await cell.click();try{await page.waitForURL(`https://hongguoduanju.com/player/${current.id}/${current.episodes[5]}`,{waitUntil:'domcontentloaded'});}catch(error){console.log('推荐选集点击诊断',await page.evaluate(()=>({url:location.href,current:window.hgCurrent?.id,dialogs:[...document.querySelectorAll('[class*="pc-backdrop-"]')].filter(n=>n.getBoundingClientRect().width).map(n=>n.textContent.slice(0,100)),green:document.querySelector('[class*="pc-episodes-"] button[data-hg-episode="5"]')?.outerHTML.replace(/<img[^>]*>/g,'<img/>')})));await page.screenshot({path:path.join(root,`test-results/feed-episodes-${channel}-failure.png`)});throw error;}
 const played=[];
 const assertPlayed=async index=>{
  await page.waitForFunction(id=>[...document.querySelectorAll('.xgplayer video')].some(v=>v.dataset.hgVideoId===id&&v.readyState>=3&&v.videoWidth>0),current.episodes[index],{timeout:55000});
  const video=page.locator('.xgplayer video').first();await video.evaluate(v=>{v.muted=true;return v.play();});
  await page.waitForFunction(()=>[...document.querySelectorAll('.xgplayer video')].some(v=>v.currentTime>.8),null,{timeout:20000});
  played.push(await video.evaluate(v=>({id:v.dataset.hgVideoId,time:v.currentTime,width:v.videoWidth,height:v.videoHeight})));
 };
 await assertPlayed(5);console.log('推荐侧栏第6集：绿色解锁、原锁图标隐藏、真实取流播放通过');
 await page.evaluate(()=>{window.hgWheels=[];document.addEventListener('wheel',e=>{const ancestors=[];for(let n=e.target;n&&ancestors.length<5;n=n.parentElement)ancestors.push({tag:n.tagName,class:n.className});window.hgWheels.push({delta:e.deltaY,ancestors,prevented:e.defaultPrevented});},true);});
 for(const [direction,index] of [[160,6],[-160,5]]){
  await page.locator('.xgplayer video').first().hover();await page.mouse.wheel(0,direction);
  await page.waitForURL(`https://hongguoduanju.com/player/${current.id}/${current.episodes[index]}`,{waitUntil:'domcontentloaded'});await assertPlayed(index);
 }
 console.log('正剧真实滚轮：第6集→第7集→第6集，画面及时间增长通过');
 assert.equal(await page.locator('.xgplayer video').count(),1);assert.equal(userScriptsDisabled,true);
 await writeFile(path.join(root,`test-results/feed-episodes-${channel}.json`),JSON.stringify({browser:context.browser().version(),userScriptsDisabled,series:current.id,played},null,2));
}catch(error){console.log('动态运行器诊断',JSON.stringify(await background.evaluate(()=>({boot:self.hgBootFault,update:self.hgUpdateFault,last:self.hgLastFault,phase:self.hgNetworkPhase,network:self.hgNetworkTrace}))));for(const p of context.pages())if(p.url().startsWith('https://hongguoduanju.com/')){console.log('推荐到正剧状态',JSON.stringify(await p.evaluate(()=>({path:location.pathname,current:window.hgCurrent?.id,wheels:window.hgWheels,trace:window.hgTrace,cells:[...document.querySelectorAll('[class*="pc-episodes-"]>button')].filter(n=>n.textContent==='6').slice(0,2).map(n=>({ready:n.hasAttribute('data-hg-site-ready'),green:n.dataset.hgUnlocked,react:Object.keys(n).some(k=>k.startsWith('__react'))})),videos:[...document.querySelectorAll('video')].map(v=>({id:v.dataset.hgVideoId,ready:v.readyState,width:v.videoWidth,time:v.currentTime,error:v.error?.code})),message:document.querySelector('.xgplayer-error')?.textContent?.slice(0,140)}))));await p.screenshot({path:path.join(root,`test-results/feed-episodes-${channel}-failure.png`)});}throw error;}finally{await context.close();}
