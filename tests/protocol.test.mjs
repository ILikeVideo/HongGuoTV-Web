import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  vendor,
  sign,
  safeJson,
  mediaHost,
  parseSources,
  encodeFields,
} from "../.generated/test-protocol.mjs";
const require = createRequire(import.meta.url);
const { sm3 } = require("../src/sm3.cjs");
test('查询编码与 Kotlin URLEncoder 保留星号及空格规则一致',()=>{
  assert.equal(encodeFields({resolution:'1280*2772',q:'中文 !()~'}),'resolution=1280*2772&q=%E4%B8%AD%E6%96%87%20%21%28%29~');
});
test('签名与 Kotlin 使用的固定 oracle 完整一致',()=>{
  const rows=JSON.parse(readFileSync(new URL('./fixtures/signing.json',import.meta.url),'utf8'));
  const savedRandom=Math.random,savedNow=Date.now;
  try{for(const row of rows){let seed=17;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    Date.now=()=>row.ts*1000;const body=row.body===null?null:Buffer.from(row.body);
    assert.equal(vendor.helios(row.ts),row.helios);assert.equal(vendor.buildMedusa(row.url,body,row.ts),row.medusa);
  }}finally{Math.random=savedRandom;Date.now=savedNow;}
});

test("SM3 与平台实现、中文及长消息一致", () => {
  for (const value of ["", "abc", "短剧与特殊字符😀", "abcd".repeat(1024)]) {
    const data = Buffer.from(value);
    assert.equal(
      sm3(data),
      crypto.createHash("sm3").update(data).digest("hex"),
    );
  }
});
test("浏览器签名适配与现有协议输出一致", () => {
  const source = readFileSync(
    new URL("../vendor/hongguo.cjs", import.meta.url),
    "utf8",
  );
  const context = vm.createContext({
    require: () => crypto,
    Buffer,
    URL,
    URLSearchParams,
    Math,
  });
  vm.runInContext(
    source + "\nthis.reference={branchOf,xGorgon,buildMedusa,helios};",
    context,
  );
  const url =
    "https://api5-normal-sinfonlineb.fqnovel.com/reading/test/?keyword=%E7%9F%AD%E5%89%A7&ts=1770000000";
  assert.equal(
    vendor.branchOf(url, null, 1770000000),
    context.reference.branchOf(url, null, 1770000000),
  );
  assert.equal(
    vendor.xGorgon(url.split("?")[1], null, 1770000000, 12345),
    context.reference.xGorgon(url.split("?")[1], null, 1770000000, 12345),
  );
  const signed = sign(
    "https://security.snssdk.com/passport/account/info/v2/",
    { name: "中文 空格" },
    null,
    1770000000000,
  );
  assert.equal(vendor.branchOf(signed.url, null, 1770000000), 0);
  assert.ok(signed.headers["x-medusa"].length > 200);
  const savedRandom = Math.random,
    savedNow = Date.now;
  try {
    Math.random = () => 0.25;
    Date.now = () => 1770000000000;
    context.Date = { now: () => 1770000000000 };
    for (let t = 1770000000; t < 1770000004; t++) {
      assert.equal(vendor.helios(t), context.reference.helios(t), "Helios");
      assert.equal(
        vendor.buildMedusa(url, null, t),
        context.reference.buildMedusa(url, null, t),
        "Medusa",
      );
    }
  } finally {
    Math.random = savedRandom;
    Date.now = savedNow;
  }
});
test("长 ID 保留精度，简介中的数字与转义不被改写", () => {
  const json = safeJson(
    '{"id":7701328426518465561,"text":"a:123456789123456789,b\\\"","n":1.25}',
  );
  assert.equal(json.id, "7701328426518465561");
  assert.equal(json.text, 'a:123456789123456789,b"');
  assert.equal(json.n, 1.25);
});
test("媒体请求限制在官方媒体主机", () => {
  assert.ok(
    mediaHost("https://v26-hgweb.qznovelvod.com/video/").startsWith("https:"),
  );
  for (const url of [
    "https://evil.example/",
    "https://qznovelvod.com.evil.example/",
    "file:///etc/passwd",
    "https://user:pwd@qznovelvod.com/",
  ])
    assert.throws(() => mediaHost(url));
});
test("缺少播放资料不能当作可播放", () => {
  assert.throws(() => parseSources({}, "123"));
});
