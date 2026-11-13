// 验证线上广告配置与插件实际交互；画面使用 Canvas 视频，不访问推广落地页。
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {launch} from './launch.mjs';

const root=path.resolve(import.meta.dirname,'..');
const response=await fetch('https://tv-admin.curatedlifefinds.com/api/public/web-ads/config');
assert.equal(response.status,200);
const config=await response.json(),corner=config.placements.find(p=>p.id==='corner');
assert.ok(config.enabled&&corner.enabled);
assert.equal(config.placements.filter(p=>p.enabled).length,1);
const items=corner.sources.flatMap(s=>s.items),targets=new Set(items.map(i=>i.targetUrl));
assert.equal(targets.size,2);
assert.ok(items.every(i=>i.title==='男士深夜福利合集'&&i.type==='image'));
if(process.argv[2])process.env.HG_TEST_CHANNEL=process.argv[2];
const {context,channel}=await launch(root),result={channel,configVersion:config.version,videoFixture:'canvas',checks:[]};
try{
 await context.route('https://hongguoduanju.com/plugin-corner-preview',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#111;color:#eee;font-family:Arial}header{height:68px}video{display:block;margin:24px auto;width:1100px;height:650px;object-fit:contain}canvas{display:none}</style></head><body><header>插件广告交互检查</header><video id="video" autoplay muted playsinline data-hg-video-id="preview-one"></video><canvas width="640" height="360"></canvas><script>const c=document.querySelector('canvas'),g=c.getContext('2d');let frame=0;setInterval(()=>{g.fillStyle='#162a39';g.fillRect(0,0,640,360);g.fillStyle='#fff';g.font='30px sans-serif';g.fillText('正在播放 '+(++frame),30,170)},40);const video=document.querySelector('video');video.srcObject=c.captureStream(25);video.play();</script></body></html>`}));
 for(const target of targets)await context.route(target,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>跳转已核验</title>'}));
 const page=await context.newPage();await page.goto('https://hongguoduanju.com/plugin-corner-preview');
 const video=page.locator('#video'),ad=page.locator('[data-hg-ad="corner"]');
 await ad.waitFor({state:'visible',timeout:50000});
 assert.equal(await page.locator('[data-hg-ad-modal]').count(),0);
 assert.equal(await page.locator('[data-hg-ad]').count(),1);
 const t=await video.evaluate(v=>v.currentTime);await page.waitForTimeout(1200);
 assert.ok(await video.evaluate(v=>!v.paused&&v.currentTime>0));assert.ok(await video.evaluate(v=>v.currentTime)>t+.5);
 const boxes=await page.evaluate(()=>{const a=document.querySelector('[data-hg-ad="corner"]').getBoundingClientRect(),v=document.querySelector('#video').getBoundingClientRect();return{a:{left:a.left,right:a.right,bottom:a.bottom,width:a.width},v:{left:v.left,right:v.right,bottom:v.bottom}};});
 assert.ok(boxes.a.width<=240&&boxes.a.left>=boxes.v.left&&boxes.a.right<=boxes.v.right&&boxes.a.bottom<boxes.v.bottom-50);
 assert.equal(await ad.locator('img').evaluate(i=>i.complete&&i.naturalWidth>0),true);
 result.checks.push('线上卡片、图片和右下角位置正确，视频时间持续增长');
 await mkdir(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,`test-results/corner-live-${channel}.png`)});
 await ad.locator('.hg-ad-close').click();await page.waitForTimeout(1000);assert.equal(await ad.count(),0);assert.equal(await video.evaluate(v=>v.paused),false);
 result.checks.push('关闭不暂停视频、不触发其他广告位');
 await page.waitForTimeout(31000);assert.equal(await ad.count(),0);result.checks.push('关闭后同条视频不再弹出');
 await video.evaluate(v=>v.dataset.hgVideoId='preview-two');await ad.waitFor({state:'visible',timeout:40000});
 const opened=context.waitForEvent('page');await ad.locator('.hg-ad-link').click();const tab=await opened;await tab.waitForURL(url=>targets.has(url.href),{timeout:15000});await tab.waitForLoadState('domcontentloaded');assert.ok(targets.has(tab.url()));await tab.close();
 result.checks.push('点击在新标签打开原有地址，未访问推广落地内容');
 await writeFile(path.join(root,`test-results/corner-live-${channel}.json`),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await context.close();}
