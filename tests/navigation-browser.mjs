import {launch} from './launch.mjs';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
if(process.argv[2])process.env.HG_TEST_CHANNEL=process.argv[2];
process.env.HG_HEADED='1';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const root=path.resolve(import.meta.dirname,'..'),{context,channel,extensionId,userScriptsDisabled}=await launch(root),checks=[];
context.setDefaultTimeout(20000);
const check=name=>{checks.push(name);console.log('通过：'+name);};
try{
 const cdp=await context.browser().newBrowserCDPSession();
 const page=await context.newPage();
 await page.addInitScript(()=>{window.__hgClicks=[];addEventListener('click',e=>window.__hgClicks.push(e.target.closest?.('a')?.id??e.target.tagName),true);});
 await page.goto('https://hongguoduanju.com/',{waitUntil:'domcontentloaded'});
 await page.locator('#hg-my-tab').waitFor({timeout:30000});
 await page.locator('header').getByRole('link',{name:'首页',exact:true}).click();
 await page.locator('#hg-tv-download').waitFor({timeout:30000});
 await page.locator('#hg-tv-tab').waitFor();
 assert.equal(await page.locator('#hg-tv-tab').innerText(),'红果TV电视版');
 const original=page.url();
 for(const id of ['#hg-tv-download','#hg-tv-tab','.hg-tv-direct-download']){
  if(id==='.hg-tv-direct-download'){
   await page.locator('header').getByText('下载',{exact:true}).hover();await page.locator(id).waitFor({state:'visible'});
   assert.equal(await page.locator(id).innerText(),'直接官网下载');assert.equal(await page.locator(id).evaluate(n=>getComputedStyle(n).fontSize),'18px');
   const qr=await page.locator('.hg-tv-qr-link').boundingBox(),direct=await page.locator(id).boundingBox();
   await page.locator(id).hover();await page.screenshot({path:path.join(root,`test-results/navigation-${channel}-download.png`),animations:'disabled'});
   if(direct.y<qr.y+qr.height)console.log('下载布局诊断',JSON.stringify(await page.locator('[data-hg-tv-card]').evaluate(n=>({html:n.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g,'<svg/>'),rects:[...n.children].map(c=>{const s=getComputedStyle(c);return {tag:c.tagName,class:c.className,rect:c.getBoundingClientRect().toJSON(),position:s.position,order:s.order,transform:s.transform,margin:s.margin};})}))));
   assert.ok(direct.y>=qr.y+qr.height,'直接下载文字应位于二维码下方');
   assert.equal(await page.locator('.hg-tv-download-brand strong').innerText(),'红果TV电视版');
   assert.equal(await page.getByText(/红果短剧电视版/).count(),0);
  }
  console.log('点击验证',id);
  await page.screenshot({path:path.join(root,`test-results/click-${id.slice(1)}-${channel}.png`)});
  assert.equal(await page.locator(id).evaluate(n=>getComputedStyle(n).pointerEvents),'auto');
  const before=new Set((await cdp.send('Target.getTargets')).targetInfos.map(t=>t.targetId));
  const box=await page.locator(id).boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  let opened;
  for(let i=0;i<50&&!opened;i++){opened=(await cdp.send('Target.getTargets')).targetInfos.find(t=>!before.has(t.targetId)&&t.type==='page'&&/^https:\/\/hongguotv(?:-|\.)/.test(t.url));if(!opened)await new Promise(r=>setTimeout(r,100));}
  assert.ok(opened,'点击后必须创建电视官网标签页');assert.equal(page.url(),original);console.log('新标签已打开',id);await cdp.send('Target.closeTarget',{targetId:opened.targetId});
 }
 check('电视版名称统一，首页按钮、电视Tab和二维码下大字链接均新开官网，原页面不跳转');
 await page.mouse.move(20,800);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>!!document.elementFromPoint(500,300)?.closest('.hg-tv-download-group')),false,'收起的下载弹框不能遮挡页面交互');
 await page.screenshot({path:path.join(root,`test-results/navigation-${channel}-home.png`)});
 const sample='https://hongguoduanju.com/player/7703818616537369625/7703818627450932248';
 const errors=[];
 for(let i=0;i<3;i++){
  const view=await context.newPage();view.on('pageerror',e=>errors.push(e.message));
  await view.goto(sample,{waitUntil:'domcontentloaded'});
  await view.locator('#hg-my-tab').waitFor({timeout:30000});
  await view.locator('[data-hg-unlocked="true"]').first().waitFor({timeout:20000});
  assert.equal(await view.locator('#hg-my-tab').count(),1);assert.equal(await view.locator('#hg-tv-tab').count(),1);
  if(i===1){await view.reload({waitUntil:'domcontentloaded'});await view.locator('[data-hg-unlocked="true"]').first().waitFor({timeout:20000});}
  if(i===2){
   const info=await view.evaluate(()=>Object.values(window._ROUTER_DATA.loaderData).find(d=>d?.seriesDetail)?.seriesDetail);
   const next=info.vid_list[1];
   const first=`https://hongguoduanju.com/player/${info.series_id}/${info.vid_list[0]}`;
   if(view.url()!==first){await view.goto(first,{waitUntil:'domcontentloaded'});await view.locator('#hg-my-tab').waitFor();}
   const close=view.locator('[class*="pc-backdrop-"] [class*="pc-close-"]').filter({visible:true});if(await close.count())await close.first().click();
   await view.locator('.xgplayer video').first().waitFor({timeout:20000});
   const dismiss=async()=>{await view.locator('[class*="pc-backdrop-"] [class*="pc-close-"]').filter({visible:true}).first().click({timeout:700}).catch(()=>{});};
   await dismiss();await view.locator('.xgplayer video').first().hover({timeout:3000}).catch(async()=>{await dismiss();await view.locator('.xgplayer video').first().hover();});await view.mouse.wheel(0,160);
   await view.waitForURL(new RegExp('/'+next+'(?:[?#]|$)'),{timeout:20000});
   await view.locator('#hg-my-tab').waitFor({timeout:30000});
   await dismiss();await view.locator('.xgplayer video').first().hover({timeout:3000}).catch(async()=>{await dismiss();await view.locator('.xgplayer video').first().hover();});await view.mouse.wheel(0,-160);
   await view.waitForURL(url=>url.pathname===`/player/${info.series_id}`||url.pathname===new URL(first).pathname,{timeout:20000});
   check('原播放画布滚轮向下到下一集、向上回上一集');
   await view.goto('https://hongguoduanju.com/category/real-drama',{waitUntil:'domcontentloaded'});
   await view.goBack({waitUntil:'domcontentloaded'});await view.locator('[data-hg-unlocked="true"]').first().waitFor({timeout:20000});
   check('浏览器返回后仍有解锁入口');
  }
  await view.close();
 }
 check('三次新开、二次刷新均恢复我的与绿色解锁，入口不重复');
 const delayed=await context.newPage();
 await delayed.addInitScript(()=>{const since=Date.now();addEventListener('message',event=>{if(Date.now()-since<1800&&event.source===window&&event.data?.channel==='hg-web-bridge'&&['bridge-ready','ready','snapshot'].includes(event.data.type))event.stopImmediatePropagation();},true);});
 await delayed.goto(sample,{waitUntil:'domcontentloaded'});await delayed.locator('[data-hg-unlocked="true"]').first().waitFor({timeout:20000});
 assert.equal(await delayed.locator('#hg-my-tab').count(),1);await delayed.close();check('故障注入：启动握手丢失后自动恢复增强入口');
 const metadata=await context.newPage();
 await metadata.addInitScript(()=>{window.__hgMetadata=null;addEventListener('message',event=>{if(event.source===window&&event.data?.channel==='hg-web-bridge'&&event.data.type==='snapshot')window.__hgMetadata={accessible:event.data.value.accessible,count:event.data.value.episodes.length};});});
 await metadata.goto(sample,{waitUntil:'domcontentloaded'});await metadata.locator('[data-hg-unlocked="true"]').first().waitFor();
 const previous=await metadata.evaluate(()=>{const data=Object.values(window._ROUTER_DATA.loaderData).find(v=>v?.seriesDetail).seriesDetail;const previous=data.accessible_episode_cnt;data.accessible_episode_cnt=data.vid_list.length;return previous;});
 await metadata.waitForFunction(()=>window.__hgMetadata?.accessible===window.__hgMetadata?.count);
 assert.equal(await metadata.locator('[data-hg-unlocked="true"]').count(),0);
 await metadata.evaluate(value=>{Object.values(window._ROUTER_DATA.loaderData).find(v=>v?.seriesDetail).seriesDetail.accessible_episode_cnt=value;},previous);
 await metadata.locator('[data-hg-unlocked="true"]').first().waitFor();await metadata.close();check('故障注入：同网址的开放范围变化及时更新选集状态');
 assert.deepEqual(errors,[]);assert.equal(userScriptsDisabled,true);
 await writeFile(path.join(root,`test-results/navigation-${channel}.json`),JSON.stringify({checks,userScriptsDisabled,errors},null,2));
}catch(error){for(const p of context.pages())if(p.url().startsWith('https://hongguoduanju.com/'))console.log('导航诊断',await p.evaluate(()=>({clicks:window.__hgClicks,path:location.pathname,tv:document.querySelector('#hg-tv-tab')?.outerHTML,my:!!document.querySelector('#hg-my-tab')})));throw error;}
finally{await context.close();}
