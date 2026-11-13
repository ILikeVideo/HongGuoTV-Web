// 两次新开真实后续集，按原视频编号、实际画面和播放时间确认；不输出媒体签名地址。
import {launch} from './launch.mjs';import path from 'node:path';import {writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
if(process.argv[2])process.env.HG_TEST_CHANNEL=process.argv[2];
process.env.HG_HEADED='1';
const root=path.resolve(import.meta.dirname,'..'),{context,channel,userScriptsDisabled}=await launch(root),results=[];
const faults=[];context.on('page',page=>page.on('pageerror',error=>faults.push(error.message.split('\n')[0])));
context.setDefaultTimeout(20000);
try{
 const source=await context.newPage();await source.goto('https://hongguoduanju.com/player/7701328280862854168',{waitUntil:'domcontentloaded'});await source.locator('#hg-my-tab').waitFor();
 const detail=await source.evaluate(()=>Object.values(window._ROUTER_DATA.loaderData).find(v=>v?.seriesDetail)?.seriesDetail);assert.ok(detail?.vid_list?.[5]);await source.close();
 for(let attempt=1;attempt<=2;attempt++){
  const page=await context.newPage();await page.goto(`https://hongguoduanju.com/player/${detail.series_id}/${detail.vid_list[5]}`,{waitUntil:'domcontentloaded'});
  await page.locator('#hg-my-tab').waitFor();await page.locator('[data-hg-unlocked="true"]').first().waitFor();
  await page.waitForFunction(id=>[...document.querySelectorAll('.xgplayer video')].some(v=>v.dataset.hgVideoId===id&&v.readyState>=3&&v.videoWidth>0),detail.vid_list[5],{timeout:55000});
  const video=page.locator('.xgplayer video').first();await video.evaluate(v=>{v.muted=true;return v.play();});
  await page.waitForFunction(()=>[...document.querySelectorAll('.xgplayer video')].some(v=>v.currentTime>.8),null,{timeout:20000});
  const result=await video.evaluate(v=>({id:v.dataset.hgVideoId,time:v.currentTime,width:v.videoWidth,height:v.videoHeight}));results.push(result);console.log('真实第6集新开播放通过',attempt,result);
  assert.equal(await page.locator('.xgplayer video').count(),1);await page.close();
 }
 await writeFile(path.join(root,`test-results/reopen-playback-${channel}.json`),JSON.stringify({userScriptsDisabled,results},null,2));
}catch(error){console.log('真实播放验收失败',error.message.split('\n')[0],faults);for(const p of context.pages())if(p.url().startsWith('https://hongguoduanju.com/player/')){console.log('当前播放状态',await p.evaluate(()=>({bridge:!!window.__hongguoEnhancerBridge,router:!!window._ROUTER_DATA,rank:[...document.querySelectorAll('header a')].filter(n=>n.textContent.trim()==='榜单').map(n=>({href:n.getAttribute('href'),fiber:Object.keys(n).some(k=>k.startsWith('__react'))})),videos:[...document.querySelectorAll('video')].map(v=>({ready:v.readyState,width:v.videoWidth,time:v.currentTime,error:v.error?.code})),message:document.querySelector('.xgplayer-error')?.textContent?.slice(0,160),my:!!document.querySelector('#hg-my-tab')})));await p.screenshot({path:path.join(root,`test-results/reopen-playback-failure-${channel}.png`)});}process.exitCode=1;}
finally{await context.close();}
