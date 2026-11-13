import { build } from "esbuild";
import { readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {DEFAULT_SITE_CONFIG} from '../shell/site-config.mjs';

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repo = path.resolve(root, "../..");
const dynamicOnly=process.argv.includes('--dynamic-only');
await mkdir(path.join(root, ".generated"), { recursive: true });
// dist 只包含本次构建结果，避免旧版特权业务脚本残留在交付包。
const output = path.join(root, 'dist');
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw Error('输出路径无效');
if(!dynamicOnly)await rm(output, {recursive:true, force:true});
await mkdir(path.join(root, "dist"), { recursive: true });
const original = await readFile(
  path.join(root, "vendor/hongguo.cjs"),
  "utf8",
);
const names = [
  "DEVICE",
  "APP_UA",
  "VIDEO_UA",
  "pythonUrlEncode",
  "branchOf",
  "xGorgon",
  "helios",
  "buildMedusa",
  "le32",
  "be32",
  "md5",
  "deriveContentKey",
  "decryptSpadeUrl",
];
await writeFile(
  path.join(root, ".generated/protocol.cjs"),
  original + "\nmodule.exports = {" + names.join(",") + "};\n",
  "utf8",
);
const common = {
  bundle: true,
  platform: "browser",
  target: ["chrome138", "edge138"],
  legalComments: "eof",
  tsconfigRaw: {},
  alias: { "node:crypto": path.join(root, "src/crypto-shim.cjs") },
  inject: [path.join(root, "src/buffer-inject.mjs")],
  sourcemap: false,
};
const entries = ['background','player','media-worker','algorithm-worker','account'];
const assets = {};
for (const name of entries) {
  const result = await build({
    ...common,
    entryPoints: [path.join(root, `src/${name==='player'?'native-pipeline':name}.mjs`)],
    write:false,
    minify:true,
    format: 'iife',
  });
  assets[name==='background'?'service':name] = result.outputFiles[0].text;
}
for (const name of ['account.css','account.html']) assets[name]=await readFile(path.join(root,'public',name),'utf8');
assets['player.html']='<!doctype html><html><head></head><body></body></html>';assets['player.css']='/* 使用官网原播放器样式 */';
// 保留旧分发协议的占位字段；官网代码不会装入或执行动态包。
assets.content='/* 官网适配固定在本地扩展 */';assets.bridge='/* MAIN 桥接固定在本地扩展 */';assets['content.css']='/* 官网样式固定在本地扩展 */';
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const webVersion=process.argv.find(a=>a.startsWith('--web-version='))?.slice('--web-version='.length)||'web-'+pkg.version;
if(!/^[\w.-]{1,64}$/.test(webVersion))throw Error('功能包版本格式无效');
const bundle={schemaVersion:1,version:webVersion,siteAdapter:'native-v1',nativeProtocol:1,siteConfig:DEFAULT_SITE_CONFIG,assets};
await writeFile(path.join(root,'.generated/builtin-web.json'),JSON.stringify(bundle),'utf8');
await mkdir(path.join(root,'artifacts'),{recursive:true});
await writeFile(path.join(root,'artifacts',`hongguo-web-function-${webVersion==='web-'+pkg.version?pkg.version:webVersion}.json`),JSON.stringify(bundle),'utf8');
await copyFile(path.join(root,'algorithms/builtin.json'),path.join(root,'artifacts','hongguo-playback-builtin.json'));
if(dynamicOnly){console.log(`仅生成功能包 ${webVersion}，已安装插件及壳版本不变`);process.exit(0);}
for (const name of ['background','host','sandbox']) await build({...common,entryPoints:[path.join(root,`shell/${name}.mjs`)],outfile:path.join(root,`dist/${name}.js`),format:name==='background'?'esm':'iife',loader:{'.hex':'text'},minify:true,plugins:process.env.HG_TEST_PUBLIC_KEY?[{name:'isolated-test-key',setup(b){b.onLoad({filter:/trust-public-key\.hex$/},()=>({contents:process.env.HG_TEST_PUBLIC_KEY,loader:'text'}));}}]:[]});
await build({...common,entryPoints:[path.join(root,'shell/site-entry.mjs')],outfile:path.join(root,'dist/content.js'),format:'iife',minify:true});
await build({...common,entryPoints:[path.join(root,'src/bridge.mjs')],outfile:path.join(root,'dist/bridge.js'),format:'iife',minify:true});
await writeFile(path.join(root,'dist/content.css'),await readFile(path.join(root,'public/content.css'),'utf8')+'\n'+await readFile(path.join(root,'public/ads.css'),'utf8'),'utf8');
if(process.env.HG_TEST_PUBLIC_KEY)await writeFile(path.join(root,'dist/TEST-ONLY'),'测试密钥构建，禁止交付','utf8');
for (const name of ['player','account','offscreen']) await copyFile(path.join(root,'shell/host.html'),path.join(root,`dist/${name}.html`));
for (const name of ['host.css','sandbox.html']) await copyFile(path.join(root,'shell',name),path.join(root,'dist',name));
await build({
  ...common,
  entryPoints: [path.join(root, "src/protocol.mjs")],
  outfile: path.join(root, ".generated/test-protocol.mjs"),
  format: "esm",
});
await build({
  ...common,
  entryPoints: [path.join(root, "src/mobile.mjs")],
  outfile: path.join(root, ".generated/test-mobile.mjs"),
  format: "esm",
});
await build({...common,entryPoints:[path.join(root,'src/algorithm-client.mjs')],outfile:path.join(root,'.generated/test-algorithm.mjs'),format:'esm'});
await copyFile(
  path.join(root, "manifest.json"),
  path.join(root, "dist/manifest.json"),
);
await copyFile(path.join(root, "NOTICE.md"), path.join(root, "dist/NOTICE.md"));
await copyFile(
  path.join(root, "assets/logo.png"),
  path.join(root, "dist/logo.png"),
);
await copyFile(
  path.join(root, "LICENSE"),
  path.join(root, "dist/LICENSE"),
);
await mkdir(path.join(root, "dist/licenses"), { recursive: true });
for (const dependency of [
  "buffer",
  "crypto-js",
  "mp4box",
  "base64-js",
  "ieee754",
  "fflate",
]) {
  await copyFile(
    path.join(root, "node_modules", dependency, "LICENSE"),
    path.join(root, "dist/licenses", dependency + ".txt"),
  );
}
await copyFile(
  path.join(root, "INSTALL.md"),
  path.join(root, "dist/安装说明.md"),
);
await mkdir(path.join(root,'dist/docs/images'),{recursive:true});
for(const name of ['chrome-install.png','edge-install.png'])await copyFile(path.join(root,'docs/images',name),path.join(root,'dist/docs/images',name));
await writeFile(path.join(root,'dist/licenses/qrcode-generator.txt'),`qrcode-generator — Copyright (c) 2009 Kazuhiko Arase\n\nMIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`,'utf8');
console.log(`红果网页增强 ${pkg.version} 动态壳构建完成`);
