// 需要本人在独立官网窗口登录。只保存统计与布尔结果，不保存手机号、会话或片单内容。
import {launch} from './launch.mjs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
process.env.HG_HEADED='1';
if(!process.env.HG_TEST_PROFILE)throw new Error('请指定已经本人官网登录的独立测试配置');
const root=path.resolve(import.meta.dirname,'..');
const {context,extensionId}=await launch(root);
try{
    const account=await context.newPage();await account.goto(`chrome-extension://${extensionId}/account.html`);
    const call=(type,fields={})=>account.evaluate(async({type,fields})=>chrome.runtime.sendMessage({type,...fields,requestId:crypto.randomUUID()}),{type,fields});
    const profile=await call('SyncWebsiteSession');assert.ok(profile.value?.libraryReady,'需要可用的官网账号会话');assert.ok(profile.value.phone);
    const report={browserVersion:context.browser().version(),realAccount:true,phoneAssociated:true,libraries:[]};
    const history=await call('GetLibraryPage',{kind:'history'});assert.ok(history.ok);assert.ok(history.value.items.length);
    const first=history.value.items[0];report.historyFields={episode:Number(first.episode),positionPresent:first.position>0,
        seriesIdValid:/^\d+$/.test(first.id),videoIdValid:/^\d+$/.test(first.episodeId)};
    const page=await context.newPage();await page.goto('https://hongguoduanju.com/?tab=feed',{waitUntil:'domcontentloaded'});
    await page.locator('#hg-my-tab').waitFor();await page.locator('#hg-my-tab').click();
    await page.locator('.hg-library-card').first().waitFor({timeout:25000});
    for(const [kind,label] of [['history','历史'],['favorites','收藏'],['likes','点赞'],['reservations','预约']]){
        await page.getByRole('tab',{name:label,exact:true}).click();
        await page.waitForFunction(()=>{const f=document.querySelector('.hg-library-footer');return f&&!f.textContent.includes('正在加载');});
        let count=await page.locator('.hg-library-card').count();assert.ok(count>0,label+'应有真实片单：'+await page.locator('.hg-library-footer').textContent());
        const more=await page.locator('.hg-library-footer').textContent();
        if(kind==='likes'&&more==='加载更多'){
            await page.locator('.hg-library-footer').click();await page.waitForFunction(n=>document.querySelectorAll('.hg-library-card').length>n,count);
            const next=await page.locator('.hg-library-card').count();assert.ok(next>count);count=next;
        }
        report.libraries.push({kind,count});
        if(kind==='reservations'){
            await page.getByRole('button',{name:'待上线',exact:true}).click();
            await page.waitForFunction(()=>!document.querySelector('.hg-library-footer').textContent.includes('正在加载'));
            report.comingReservations=await page.locator('.hg-library-card').count();
        }
    }
    await page.getByRole('button',{name:'返回观看'}).click();
    await page.goto('https://hongguoduanju.com/player/7701328280862854168/7701328441043340313',{waitUntil:'domcontentloaded'});
    const frame=page.frameLocator('.hg-player-frame');await frame.locator('video').waitFor({timeout:25000});
    try{
        await frame.locator('video').evaluate(v=>new Promise((resolve,reject)=>{const start=Date.now(),timer=setInterval(()=>{
            if(v.currentTime>1&&v.videoWidth>0&&!v.paused){clearInterval(timer);resolve();}
            else if(!document.querySelector('#error').hidden||Date.now()-start>20000){clearInterval(timer);reject(new Error(document.querySelector('#error-text').textContent||'等待真实出画超时'));}
        },100);}));
        const state=await frame.locator('video').evaluate(v=>({videoId:v.dataset.videoId,time:v.currentTime,width:v.videoWidth,height:v.videoHeight}));
        assert.equal(state.videoId,'7701328441043340313');report.realEpisodeSix={passed:true,...state};
    }catch(error){report.realEpisodeSix={passed:false,error:error.message};process.exitCode=1;}
    await writeFile(path.join(root,'test-results/real-account.json'),JSON.stringify(report,null,2),'utf8');
    console.log(JSON.stringify(report));
}finally{await context.close();}
