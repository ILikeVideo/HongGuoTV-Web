import {ADMIN,MAX_PACKAGE,digest,validBundle} from './policy.mjs';
export class Updates {
  constructor(store,builtin,key,shellVersion,client,fetcher=(...args)=>fetch(...args),accept=()=>true){Object.assign(this,{store,builtin,key,shellVersion,client,fetcher,accept});this.checking=null;}
  async current(kind){const s=await this.store.get(['dynamic:'+kind]);const item=s['dynamic:'+kind];return item?.active??{bundle:this.builtin[kind],sequence:0,sha256:'builtin'};}
  async check(){if(this.checking)return this.checking;return this.checking=this.run().finally(()=>this.checking=null);}
  async run(){
    const r=await this.fetcher(ADMIN+'/api/public/extensions/config?client='+this.client+'&shell='+this.shellVersion,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!r.ok)throw Error('更新服务暂不可用');const config=await r.json();
    for(const kind of ['algorithm','web']){
      if(config.disabledKinds?.includes(kind)){const state=(await this.store.get('dynamic:'+kind))['dynamic:'+kind];if(state)await this.store.set({['dynamic:'+kind]:{...state,active:null,previous:null,pending:null}});}
      else if(config[kind])await this.install(kind,config[kind]);
    }
  }
  async install(kind,envelope){
    const raw=Uint8Array.from(atob(envelope.payload),x=>x.charCodeAt(0));
    const key=await crypto.subtle.importKey('raw',Uint8Array.from(this.key.match(/../g),x=>parseInt(x,16)),{name:'Ed25519'},false,['verify']);
    if(!await crypto.subtle.verify('Ed25519',key,Uint8Array.from(atob(envelope.signature),x=>x.charCodeAt(0)),raw))throw Error('动态包签名不正确');
    const m=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
    const state=(await this.store.get('dynamic:'+kind))['dynamic:'+kind]??{};
    if(m.schemaVersion!==1||m.kind!==kind||m.clientType!==this.client||m.hostApi!==1||this.shellVersion<m.minShell||this.shellVersion>m.maxShell||!Number.isSafeInteger(m.sequence)||m.sequence<1||!Number.isInteger(m.bytes)||m.bytes<1||m.bytes>MAX_PACKAGE||!/^\w{64}$/.test(m.sha256)||m.url!==ADMIN+'/api/public/extensions/bundles/'+m.sha256)throw Error('动态包不兼容当前插件');
    if(m.sequence<(state.highest??0))throw Error('拒绝旧发布序号');
    if(m.sequence===(state.highest??0)){if(m.sha256!==state.sha256)throw Error('同序号摘要冲突');return false;}
    if(!Number.isFinite(m.activateBefore)||m.activateBefore<Date.now()||m.issuedAt>Date.now()+300000)throw Error('动态包激活期限已过');
    const response=await this.fetcher(m.url,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('动态包下载失败');
    const reader=response.body.getReader(),parts=[];let size=0;
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>m.bytes){await reader.cancel();throw Error('动态包超过声明大小');}parts.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const v of parts){bytes.set(v,offset);offset+=v.length;}
    if(size!==m.bytes||await digest(bytes)!==m.sha256)throw Error('动态包摘要不正确');
    const bundle=validBundle(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),kind);
    if(!this.accept(kind,bundle))throw Error('动态包不兼容当前官网适配器');
    if(bundle.version!==m.version)throw Error('动态包版本不匹配');
    await this.store.set({['dynamic:'+kind]:{...state,pending:{bundle,sequence:m.sequence,sha256:m.sha256},highest:m.sequence,sha256:m.sha256}});
    return true;
  }
  async activate(kind,verify){
    const state=(await this.store.get('dynamic:'+kind))['dynamic:'+kind];if(!state?.pending)return false;
    try{await verify(state.pending.bundle);await this.store.set({['dynamic:'+kind]:{...state,previous:state.active,active:state.pending,pending:null}});return true;}
    catch{await this.store.set({['dynamic:'+kind]:{...state,pending:null,rejected:state.pending.sha256}});throw Error('动态包自检失败，继续使用已确认版本');}
  }
  async rollback(kind){const s=(await this.store.get('dynamic:'+kind))['dynamic:'+kind];if(s?.active)await this.store.set({['dynamic:'+kind]:{...s,active:s.previous,previous:null,rejected:s.active.sha256}});}
}
