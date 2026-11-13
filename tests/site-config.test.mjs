import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {siteConfig,DEFAULT_SITE_CONFIG} from '../shell/site-config.mjs';
test('官网配置只接受有界文字、选择器和合法样式值',()=>{
 const good=siteConfig({myLabel:'我的片单',accent:'#1122aa',cardMinWidth:180});assert.equal(good.myLabel,'我的片单');assert.equal(good.accent,'#1122aa');assert.equal(good.cardMinWidth,180);
 for(const value of [null,[],{myLabel:'x'.repeat(100),accent:'url(javascript:bad)',cardMinWidth:999,rankSelector:'x'.repeat(600)}])assert.deepEqual(siteConfig(value),DEFAULT_SITE_CONFIG);
});
test('安装包官网代码全部本地加载，无用户脚本权限或远程执行入口',async()=>{
 const root=new URL('../dist/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));assert.equal(manifest.version,pkg.version);assert.ok(!manifest.permissions.includes('userScripts'));assert.ok(manifest.content_scripts.some(s=>s.world==='MAIN'&&s.js.includes('bridge.js')));
 const background=await readFile(new URL('background.js',root),'utf8'),content=await readFile(new URL('content.js',root),'utf8');assert.doesNotMatch(background,/chrome\.userScripts|onUserScriptConnect/);assert.doesNotMatch(content,/new Function\(|\beval\(/);
 const bundle=JSON.parse(await readFile(new URL('../.generated/builtin-web.json',import.meta.url),'utf8'));assert.equal(bundle.siteAdapter,'native-v1');assert.equal(bundle.nativeProtocol,1);assert.ok(bundle.assets.content.startsWith('/*'));assert.ok(bundle.assets.bridge.startsWith('/*'));
 assert.equal(Object.keys(bundle.assets).length,12);assert.ok(Object.values(bundle.assets).every(v=>typeof v==='string'&&v.length>0),'与后台非空文件契约一致');
});
