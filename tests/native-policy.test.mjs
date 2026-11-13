import test from 'node:test';
import assert from 'node:assert/strict';
import {installNativeBridge} from '../src/native-bridge.mjs';
test('保留官网真实开放范围，未知范围不接管，权限更新后不沿用旧锁定判定',()=>{
 const keys=['window','location','history','addEventListener','_ROUTER_DATA','rspackChunkhongguo'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try{
  globalThis.window=globalThis;globalThis.location=new URL('https://hongguoduanju.com/');globalThis.history={replaceState(){}};globalThis.addEventListener=()=>{};
  const bridge=installNativeBridge(()=>{}),raw={series_id:'100',vid_list:['101','102','103'],accessible_episode_cnt:1};
  bridge.transform({data:{seriesDetail:raw}});assert.equal(raw.accessible_episode_cnt,1);assert.equal(bridge.locked('100','101'),false);assert.equal(bridge.locked('100','102'),true);
  raw.accessible_episode_cnt=3;bridge.transform({data:{seriesDetail:raw}});assert.equal(bridge.locked('100','102'),false);
  bridge.transform({data:{seriesDetail:{series_id:'200',vid_list:['201','202']}}});assert.equal(bridge.locked('200','202'),false);
 }finally{for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
});
