import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeMedia} from '../src/native-media.mjs';
test('原视频桥接冷启动与重复释放安全，迟到取消不能释放新来源',()=>{
 const saved=globalThis.addEventListener;globalThis.addEventListener=()=>{};
 try{
  const media=new NativeMedia(()=>{});assert.doesNotThrow(()=>media.dispose());assert.doesNotThrow(()=>media.dispose());
  let removed=0,aborted=0;media.requestId='new-source';media.frame={remove(){removed++;}};media.events={abort(){aborted++;}};
  media.cancel('old-source');assert.equal(removed,0);assert.equal(aborted,0);
  media.cancel('new-source');media.dispose();assert.equal(removed,1);assert.equal(aborted,1);
 }finally{if(saved)globalThis.addEventListener=saved;else delete globalThis.addEventListener;}
});
