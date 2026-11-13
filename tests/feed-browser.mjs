// 官网推荐原片保持原逻辑；原锁定集使用官网分集播放页。
import {launch} from './launch.mjs';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
process.env.HG_HEADED='1';
if(process.argv[2])process.env.HG_TEST_CHANNEL=process.argv[2];
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const root=path.resolve(import.meta.dirname,'..'),{context,extensionId,channel,userScriptsDisabled}=await launch(root);
try{
 assert.equal(userScriptsDisabled,true);
 const account=await context.newPage();await account.goto(`chrome-extension://${extensionId}/account.html`);
 const background=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 await background.evaluate(()=>{self.hgFeedModels=0;const original=fetch;self.fetch=(raw,options)=>{if(new URL(String(raw)).pathname.includes('/video_model/v1/'))self.hgFeedModels++;return original(raw,options);};});
 await account.evaluate(()=>chrome.runtime.sendMessage({type:'ShellCheck'}));
 const page=await context.newPage();await page.addInitScript(()=>{window.hgCurrent=null;addEventListener('message',e=>{if(e.source===window&&e.data?.channel==='hg-web-bridge'&&e.data.type==='snapshot')window.hgCurrent=e.data.value;});});
 await page.goto('https://hongguoduanju.com/?tab=feed',{waitUntil:'domcontentloaded'});await page.locator('#hg-my-tab').waitFor({timeout:30000});
 await page.waitForTimeout(800);await page.locator('[class*="pc-backdrop-"] [class*="pc-close-"]').filter({visible:true}).first().click({timeout:1000}).catch(()=>{});
 await page.waitForFunction(()=>window.hgCurrent&&[...document.querySelectorAll('.swiper-slide-active video')].some(v=>v.currentTime>1&&v.videoWidth>0),null,{timeout:45000});
 assert.equal(await background.evaluate(()=>self.hgFeedModels),0,'推荐原片不得重新取源');
 const original=await page.evaluate(()=>window.hgCurrent);
 await page.locator('[data-feed-playback-toggle]').first().hover();await page.mouse.wheel(0,160);
 await page.waitForFunction(id=>window.hgCurrent?.videoId&&window.hgCurrent.videoId!==id,original.videoId,{timeout:15000});
 await page.waitForTimeout(800);await page.locator('[data-feed-playback-toggle]').first().hover();await page.mouse.wheel(0,-160);
 await page.waitForFunction(id=>window.hgCurrent?.videoId===id,original.videoId,{timeout:15000});
 console.log('真实推荐滚轮：下一部、上一部通过');
 await page.locator('#hg-my-tab').click();assert.equal(await page.locator('.hg-my').getAttribute('role'),'region');assert.equal(await page.getByRole('button',{name:/返回/}).count(),0);
 const style=await page.evaluate(()=>({panelFont:getComputedStyle(document.querySelector('.hg-my')).fontFamily,siteFont:getComputedStyle(document.body).fontFamily,tabSize:getComputedStyle(document.querySelector('#hg-my-tab')).fontSize,rankSize:getComputedStyle(document.querySelector('header a[href*="/rank/"]')).fontSize,buttonSize:getComputedStyle(document.querySelector('.hg-my [role="tab"]')).fontSize}));assert.equal(style.panelFont,style.siteFont);assert.equal(style.tabSize,style.rankSize);assert.equal(style.buttonSize,'16px');
 await page.screenshot({path:path.join(root,`test-results/native-my-${channel}.png`)});
 await page.locator('header').getByRole('link',{name:'推荐',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.hg-my'));
 assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('hg-my-visible')),false);
 await page.waitForFunction(()=>[...document.querySelectorAll('.swiper-slide-active video')].some(v=>!v.paused&&v.currentTime>1),null,{timeout:30000});
 const result={browser:context.browser().version(),userScriptsDisabled,fixture:false,nativeRecommendationPlayed:true,originalRecommendationNoMobileSource:true,recommendationWheel:true,myTabWithoutBack:true,topNavigationUsable:true,style,series:original.title};
 await writeFile(path.join(root,`test-results/native-feed-${channel}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await context.close();}
