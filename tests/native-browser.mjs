// 官网原播放器验收；可选合成媒体仅验证流程，HG_LIVE=1 验证真实锁定集。
import {launch} from './launch.mjs';
import {installFixture} from './fixture.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
process.env.HG_HEADED='1';
// 原站字体 CDN 可能长时间挂起；截图使用当时已渲染字体，不阻塞播放验收。
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const root=path.resolve(import.meta.dirname,'..'),{context,extensionId,channel,userScriptsDisabled}=await launch(root),results=[],errors=[];
const check=(name,value={})=>{results.push({name,passed:true,...value});console.log('通过：'+name,JSON.stringify(value));};
try{
 assert.equal(userScriptsDisabled,true);check('用户脚本开关关闭');
 const account=await context.newPage();await account.goto(`chrome-extension://${extensionId}/account.html`);
 const background=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const fixture=process.env.HG_TEST_FIXTURE==='1',fixtureControl=fixture?await installFixture(root,context,background):null;
 await background.evaluate(()=>{self.hgModelCalls=0;self.hgNativeNetwork=[];const original=fetch;self.fetch=async(raw,init)=>{const u=new URL(String(raw)),range=new Headers(init?.headers).get('range');if(u.pathname.includes('/video_model/v1/'))self.hgModelCalls++;const item={stage:range?'media':u.pathname.includes('/video_model/v1/')?'model':u.pathname.includes('/fplay/')?'fallback':u.pathname.includes('/reading/')?'detail':'other',host:u.hostname,range,started:Date.now()};if(item.stage!=='other')self.hgNativeNetwork.push(item);try{const response=await original(raw,init);item.status=response.status;item.ms=Date.now()-item.started;return response;}catch(error){item.error=error.name;item.ms=Date.now()-item.started;throw error;}};});
 await account.evaluate(()=>chrome.runtime.sendMessage({type:'ShellCheck'}));
 const detail=await account.evaluate(async()=>{const r=await chrome.runtime.sendMessage({type:'GetDetail',seriesId:'7701328280862854168',requestId:'native-detail'});if(!r.ok)throw Error(r.error);return r.value;});
 const page=await context.newPage();page.on('pageerror',error=>{errors.push(error.message);console.log('页面异常',error.stack?.slice(0,600)||error.message);});
 await page.addInitScript(()=>{window.hgNativeEvents=[];addEventListener('message',e=>{if(e.source===window&&['hg-web-bridge','hg-web-host'].includes(e.data?.channel)&&e.data.type.startsWith('native-'))window.hgNativeEvents.push({type:e.data.type,error:e.data.error,urlType:e.data.url?.split(':')[0]});});});
 async function ready(){await page.locator('#hg-my-tab').waitFor({timeout:30000});await page.locator('[class*="close"]').filter({visible:true}).first().click({timeout:1000}).catch(()=>{});}
 async function open(index){await page.goto(`https://hongguoduanju.com/player/${detail.id}/${detail.episodes[index]}`,{waitUntil:'domcontentloaded'});await ready();}
 async function nativePlaying(index,enhanced){
  await page.waitForFunction(({id,enhanced})=>[...document.querySelectorAll('.xgplayer video')].some(v=>(!enhanced||v.dataset.hgVideoId===id)&&v.readyState>=3),{id:detail.episodes[index],enhanced},{timeout:45000});
  const video=page.locator('.xgplayer video').first();await video.evaluate(v=>{v.muted=true;return v.play();});
  await page.waitForTimeout(700);
  const close=page.locator('[class*="pc-backdrop-"] [class*="pc-close-"]').filter({visible:true});if(await close.count()){await close.first().click();await video.evaluate(v=>v.play());}
  await page.waitForFunction(()=>[...document.querySelectorAll('.xgplayer video')].some(v=>v.currentTime>1&&v.videoWidth>0),null,{timeout:45000});
  return video.evaluate(v=>({videoId:v.dataset.hgVideoId,episode:v.dataset.hgEpisode,time:v.currentTime,width:v.videoWidth,height:v.videoHeight}));
 }
 if(process.env.HG_NATIVE_ONLY==='1')await open(4);
 else for(const index of [0,4]){await open(index);check(`原第${index+1}集使用官网播放且不重新取源`,await nativePlaying(index,false));assert.equal(await background.evaluate(()=>self.hgModelCalls),0);assert.equal(await page.locator('.hg-native-host').count(),0);}
 const sixth=page.locator('[data-hg-episode="5"]').first();await sixth.locator('.hg-unlock-icon').waitFor({timeout:15000});assert.equal(await sixth.locator('.hg-unlock-icon').count(),1);assert.equal(await sixth.getAttribute('data-hg-unlocked'),'true');check('原锁定图标为绿色解锁图标');
 await sixth.click();await ready();
 check('锁定第6集在官网原播放器内播放',await nativePlaying(5,true));
 assert.equal(await page.locator('.hg-player-frame').count(),0);assert.equal(await page.locator('.xgplayer video').count(),1);assert.equal(await page.locator('.hg-native-host').count(),1);assert.equal(await page.locator('.hg-native-host').evaluate(n=>n.hidden),true);check('没有自定义播放页面或第二视频元素');
 console.log('锁定集界面',await page.evaluate(()=>({path:location.pathname,guide:document.body.innerText.includes('短剧独家内容，前往App端观看全部内容'),modelVideo:document.querySelector('.xgplayer video')?.dataset.hgVideoId})));
 assert.equal(await page.getByText('短剧独家内容，前往App端观看全部内容',{exact:true}).count(),0);check('锁定剧集App提示弹框未创建');
 await page.screenshot({path:path.join(root,`test-results/native-${channel}-${fixture?'fixture':'live'}.png`)});
 await page.locator('.xgplayer video').hover();await page.locator('.xgplayer-pc-next').click();await ready();check('原下一集按钮进入第7集且无锁定弹框',await nativePlaying(6,true));assert.equal(await page.locator('[class*="pc-ended-"]').count(),0);
 await page.reload({waitUntil:'domcontentloaded'});await ready();check('刷新后仍播放第7集',await nativePlaying(6,true));
 const video=page.locator('.xgplayer video').first();await video.evaluate(v=>{v.pause();v.playbackRate=1.5;});assert.equal(await video.evaluate(v=>v.paused),true);await video.evaluate(v=>v.play());assert.equal(await video.evaluate(v=>v.playbackRate),1.5);check('官网视频暂停、继续和倍速保持可用');
 await page.locator('#hg-my-tab').click();assert.equal(await page.getByRole('button',{name:/返回/}).count(),0);assert.equal(await page.locator('.hg-my').getAttribute('role'),'region');assert.equal(await page.locator('.hg-my [role="tab"]').count(),4);check('我的为四类片单Tab且无返回按钮');
 const styles=await page.evaluate(()=>({panelFont:getComputedStyle(document.querySelector('.hg-my')).fontFamily,siteFont:getComputedStyle(document.body).fontFamily,tabSize:getComputedStyle(document.querySelector('#hg-my-tab')).fontSize,rankSize:getComputedStyle(document.querySelector('header a[href*="/rank/"]')).fontSize,buttonSize:getComputedStyle(document.querySelector('.hg-my [role="tab"]')).fontSize}));assert.equal(styles.panelFont,styles.siteFont);assert.equal(styles.tabSize,styles.rankSize);assert.equal(styles.buttonSize,'16px');console.log('官网字体一致性',styles);await page.screenshot({path:path.join(root,`test-results/native-my-${channel}-final.png`)});
 const modelCalls=await background.evaluate(()=>self.hgModelCalls);await open(4);await nativePlaying(4,false);assert.equal(await background.evaluate(()=>self.hgModelCalls),modelCalls);check('切回原开放剧集继续使用官网接口');
 if(fixture){
  for(const index of [39,79]){await open(index);check(`原页面直接播放第${index+1}集`,await nativePlaying(index,true));}
  await background.evaluate(()=>{self.fixtureModelError=true;});await open(7);await page.getByRole('alert').waitFor({timeout:30000});check('取源失败沿用官网错误界面');
  await background.evaluate(()=>{self.fixtureModelError=false;});await page.reload({waitUntil:'domcontentloaded'});await ready();check('原页面刷新重试仍为第8集',await nativePlaying(7,true));
  await fixtureControl.expireNext();await open(8);check('地址过期刷新一次后播放第9集',await nativePlaying(8,true));
 }
 const status=await account.evaluate(()=>chrome.runtime.sendMessage({type:'ShellStatus'}));
 if(process.env.HG_REMOTE==='1'){assert.equal(status.web,'web-0.2.2');assert.ok(status.webSequence>0&&status.algorithmSequence>0);check('正式后台原生连接包与动态算法启用',{web:status.web,webSequence:status.webSequence,algorithm:status.algorithm});}
 await writeFile(path.join(root,`test-results/native-${channel}-${fixture?'fixture':'live'}.json`),JSON.stringify({browser:context.browser().version(),fixture,results,errors,status},null,2));
 console.log(JSON.stringify({channel,results,errors}));
}catch(error){const background=context.serviceWorkers()[0];if(background)console.log('取流阶段',await background.evaluate(()=>({requests:self.hgNativeNetwork?.slice(-30),phase:self.hgNetworkPhase,fault:self.hgLastFault,update:self.hgUpdateFault})));for(const p of context.pages())if(p.url().startsWith('https://hongguoduanju.com'))console.log('原站失败现场',await p.evaluate(()=>({path:location.pathname,bridge:!!window.__hongguoEnhancerBridge,events:window.hgNativeEvents,frames:document.querySelectorAll('.hg-native-host').length,videos:[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,ready:v.readyState,videoId:v.dataset.hgVideoId,error:v.error?.code})),text:document.body.innerText.slice(0,1000)})));throw error;}
finally{await context.close();}
