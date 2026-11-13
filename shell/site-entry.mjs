// 官网适配代码随扩展打包；此处不会下载、eval 或注入远程 JS。
import {siteConfig} from './site-config.mjs';
globalThis.__HG_SITE_CONFIG__=siteConfig();
void import('../src/content.mjs');
chrome.runtime.sendMessage({type:'ShellOpen'}).then(async result=>{
  if(!result?.ok)throw Error(result?.error||'红果网页增强暂不可用，请刷新重试');
  globalThis.__HG_SITE_CONFIG__=siteConfig(result.siteConfig);
  const cfg=globalThis.__HG_SITE_CONFIG__;
  document.documentElement.style.setProperty('--hg-accent',cfg.accent);
  document.documentElement.style.setProperty('--hg-card-min-width',cfg.cardMinWidth+'px');
  dispatchEvent(new Event('hg-site-config'));
}).catch(error=>{
  const node=document.createElement('div');node.textContent=error.message;
  node.style.cssText='position:fixed;right:20px;top:80px;z-index:2147483647;background:#32251d;color:#ffb579;padding:14px;border-radius:10px;max-width:360px';
  document.body.append(node);setTimeout(()=>node.remove(),12000);
});
