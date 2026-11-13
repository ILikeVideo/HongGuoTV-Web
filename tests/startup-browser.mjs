// 并发账号读取与冷启动共用同一就绪屏障，未登录时均返回空资料而非丢失请求。
import {launch} from './launch.mjs';
import path from 'node:path';
import assert from 'node:assert/strict';
if(process.argv[2])process.env.HG_TEST_CHANNEL=process.argv[2];
const root=path.resolve(import.meta.dirname,'..'),{context,extensionId,channel,userScriptsDisabled}=await launch(root);
try{
 const page=await context.newPage();await page.goto(`chrome-extension://${extensionId}/account.html`,{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const start=Date.now(),calls=Array.from({length:16},()=>chrome.runtime.sendMessage({type:'GetProfile',requestId:crypto.randomUUID()}));
  const rows=await Promise.race([Promise.all(calls),new Promise((_,reject)=>setTimeout(()=>reject(Error('冷启动请求未在20秒内完成')),20000))]);
  return {count:rows.length,allReturned:rows.every(r=>r?.ok===true),elapsed:Date.now()-start};
 });
 assert.equal(result.count,16);assert.equal(result.allReturned,true);assert.equal(userScriptsDisabled,true);
 console.log(channel,'冷启动16路并发读取通过',result);
}finally{await context.close();}
