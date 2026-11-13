import test from "node:test";
import assert from "node:assert/strict";
import {
  headerLength,
  prepareHeader,
  decryptRange,
  decryptCtrBytes,
} from "../src/media-crypto.mjs";
const keyBytes = Buffer.from("2b7e151628aed2a6abf7158809cf4f3c", "hex");
const iv = Buffer.from("f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff", "hex");
const plain = Buffer.from(
  "6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710",
  "hex",
);
const encrypted = Buffer.from(
  "874d6191b620e3261bef6864990db6ce9806f66b7970fdff8617187bb9fffdff5ae4df3edbd5d35e5b4f09020db03eab1e031dda2fbe03d1792170a0f3009cee",
  "hex",
);
const key = await crypto.subtle.importKey("raw", keyBytes, "AES-CTR", false, [
  "decrypt",
]);
test('不透明沙盒的纯 JS 解密与 NIST、128位计数进位一致',async()=>{assert.deepEqual(Buffer.from(decryptCtrBytes(encrypted,keyBytes,iv)),plain);const counter=Uint8Array.from(Buffer.from('000000000000000000000000fffffffe','hex')),input=new Uint8Array(80);const expected=await crypto.subtle.decrypt({name:'AES-CTR',counter,length:128},key,input);assert.deepEqual(decryptCtrBytes(input,keyBytes,counter),new Uint8Array(expected));});
test("NIST AES-CTR 跨分段及非对齐字节范围", async () => {
  const source = Buffer.concat([
    Buffer.alloc(23, 0x66),
    encrypted,
    Buffer.alloc(12, 0x77),
  ]);
  const expected = Buffer.concat([
    Buffer.alloc(23, 0x66),
    plain,
    Buffer.alloc(12, 0x77),
  ]);
  const prepared = {
    header: new Uint8Array(),
    samples: [{ start: 23, end: 87, iv, encryptedOffset: 0 }],
  };
  for (let start = 0; start < source.length; start++)
    for (const length of [1, 7, 16, 29]) {
      const end = Math.min(source.length, start + length);
      const result = await decryptRange(
        Uint8Array.from(source.subarray(start, end)),
        start,
        key,
        prepared,
      );
      assert.deepEqual(Buffer.from(result), expected.subarray(start, end));
    }
});
test("加密子样本保留明文并接续计数器", async () => {
  const source = Buffer.concat([
    Buffer.from([1, 2, 3]),
    encrypted.subarray(0, 21),
    Buffer.from([4, 5]),
    encrypted.subarray(21),
  ]);
  const expected = Buffer.concat([
    Buffer.from([1, 2, 3]),
    plain.subarray(0, 21),
    Buffer.from([4, 5]),
    plain.subarray(21),
  ]);
  const prepared = {
    header: new Uint8Array(),
    samples: [
      { start: 3, end: 24, iv, encryptedOffset: 0 },
      { start: 26, end: 69, iv, encryptedOffset: 21 },
    ],
  };
  assert.deepEqual(
    Buffer.from(await decryptRange(Uint8Array.from(source), 0, key, prepared)),
    expected,
  );
  assert.deepEqual(
    Buffer.from(
      await decryptRange(
        Uint8Array.from(source.subarray(22, 47)),
        22,
        key,
        prepared,
      ),
    ),
    expected.subarray(22, 47),
  );
});
const word = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const box = (type, ...body) => {
  const bytes = Buffer.concat(body);
  return Buffer.concat([word(bytes.length + 8), Buffer.from(type), bytes]);
};
function fixture(codec = "avc1", auxSize = 8) {
  const ftyp = box("ftyp", Buffer.from("isom0000"));
  function moov(offset) {
    const entry = box(
      "encv",
      Buffer.alloc(78),
      box("sinf", box("frma", Buffer.from(codec))),
    );
    const stsd = box("stsd", Buffer.alloc(4), word(1), entry);
    const stsz = box("stsz", Buffer.alloc(4), word(16), word(1));
    const stsc = box(
      "stsc",
      Buffer.alloc(4),
      word(1),
      word(1),
      word(1),
      word(1),
    );
    const stco = box("stco", Buffer.alloc(4), word(1), word(4096));
    const saiz = box("saiz", Buffer.alloc(4), Buffer.from([auxSize]), word(1));
    const saio = box("saio", Buffer.alloc(4), word(1), word(offset));
    return Buffer.concat([
      box(
        "moov",
        box(
          "trak",
          box(
            "mdia",
            box("minf", box("stbl", stsd, stsz, stsc, stco, saiz, saio)),
          ),
        ),
      ),
      box("free", iv.subarray(0, 8)),
    ]);
  }
  return Buffer.concat([ftyp, moov(ftyp.length + moov(0).length - 8)]);
}
test("原始 AVC 与 HEVC 标签、索引边界正确", () => {
  for (const codec of ["avc1", "hvc1"]) {
    const source = fixture(codec);
    const prepared = prepareHeader(Uint8Array.from(source), keyBytes);
    assert.ok(Buffer.from(prepared.header).includes(Buffer.from(codec)));
    assert.ok(!Buffer.from(prepared.header).includes(Buffer.from("encv")));
    assert.equal(prepared.samples[0].start, 4096);
    assert.equal(prepared.samples[0].end, 4112);
    assert.ok(headerLength(source, 5000) > 0);
  }
  assert.throws(() =>
    prepareHeader(Uint8Array.from(fixture("avc1", 16)), keyBytes),
  );
  assert.throws(() =>
    headerLength(
      Buffer.concat([
        box("ftyp", Buffer.from("isom0000")),
        word(9000000),
        Buffer.from("moov"),
      ]),
      10000000,
    ),
  );
});
