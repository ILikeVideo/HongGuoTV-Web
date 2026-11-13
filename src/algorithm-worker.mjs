import {loadAlgorithm} from './algorithm-client.mjs';
let algorithm;
onmessage=event=>{const {id,method,input,bundle}=event.data;try{if(method==='init'){algorithm=loadAlgorithm(bundle);postMessage({id,value:true});}else{if(!['selfTest','identityRequest','identityResponse','buildRequest','sign','parse'].includes(method))throw Error();const value=algorithm[method](input);if(JSON.stringify(value).length>1024*1024)throw Error();postMessage({id,value});}}catch{postMessage({id,error:'算法契约或自检失败'});}};
