// 独立取源对照，仅输出阶段、状态和片源数，不保存播放地址或身份。
import {readFile} from 'node:fs/promises';
import {playbackClient} from '../.generated/test-algorithm.mjs';
import {detail} from '../.generated/test-mobile.mjs';
const bundle=JSON.parse(await readFile(new URL('../../../kotlin-tv/algorithm-runtime/src/main/assets/algorithms/builtin.json',import.meta.url),'utf8'));
const series=await detail('7701328280862854168');
const sources=playbackClient(bundle,async(...args)=>{const response=await fetch(...args);console.log(JSON.stringify({stage:new URL(String(args[0])).pathname,status:response.status}));return response;});
const id=series.episodes[5];const values=await sources(id,undefined,series.platforms?.[id]??series.platform);console.log(JSON.stringify({episode:6,videoId:id,sources:values.map(s=>({quality:s.quality,codec:s.codec}))}));
