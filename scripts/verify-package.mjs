// 核对交付ZIP的版本、文件、权限、正式公钥与摘要，不运行归档中的代码。
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const name=`hongguo-web-${pkg.version}.zip`,bytes=await readFile(path.join(root,'artifacts',name)),files=unzipSync(bytes),names=Object.keys(files);
assert.ok(names.every(n=>!n.startsWith('/')&&!n.split('/').includes('..')));
assert.ok(!names.some(n=>n.includes('TEST-ONLY')||n.endsWith('.map')));
const manifest=JSON.parse(strFromU8(files['manifest.json']));assert.equal(manifest.version,pkg.version);assert.ok(!manifest.permissions.includes('userScripts'));
for(const file of [manifest.background.service_worker,...manifest.content_scripts.flatMap(s=>[...(s.js??[]),...(s.css??[])])])assert.ok(files[file],`缺少安装文件：${file}`);
const key=(await readFile(path.resolve(root,'algorithms/trust-public-key.hex'),'utf8')).trim();assert.ok(strFromU8(files['background.js']).includes(key),'归档必须使用正式信任公钥');
assert.ok(files['安装说明.md']);assert.ok(files['验证说明.md']);
const sha256=createHash('sha256').update(bytes).digest('hex');assert.equal((await readFile(path.join(root,'artifacts/SHA256SUMS'),'utf8')).trim(),sha256+'  '+name);
const bundle=await readFile(path.join(root,'artifacts',`hongguo-web-function-${pkg.version}.json`)),functionSha256=createHash('sha256').update(bundle).digest('hex');
console.log(JSON.stringify({version:manifest.version,bytes:bytes.length,files:names.length,userScriptsPermission:false,productionTrustKey:true,sha256,functionSha256}));
