// SPDX-License-Identifier: GPL-3.0-only
// 从 Kotlin MediaCrypto 移植，逐样本解密并保留 MP4 中声明的原始编码。
import CryptoJS from 'crypto-js';
// 不透明沙盒创建的 Worker 未必暴露 SubtleCrypto，使用相同 AES-CTR 字节算法兜底。
export function decryptCtrBytes(input,key,counter){
 const aes=CryptoJS.algo.AES.createEncryptor(CryptoJS.lib.WordArray.create(key),{mode:CryptoJS.mode.ECB,padding:CryptoJS.pad.NoPadding});
 const view=new DataView(counter.buffer,counter.byteOffset,counter.byteLength),count=[0,4,8,12].map(i=>view.getUint32(i)),output=new Uint8Array(input.length);
 for(let offset=0;offset<input.length;offset+=16){const block=count.slice();aes.encryptBlock(block,0);for(let i=0;i<16&&offset+i<input.length;i++)output[offset+i]=input[offset+i]^(block[i>>>2]>>>(24-(i%4)*8)&255);for(let i=3;i>=0;i--){count[i]=(count[i]+1)>>>0;if(count[i])break;}}
 return output;
}
const ascii = (data, at, size = 4) =>
  String.fromCharCode(...data.subarray(at, at + size));
const viewOf = (data) =>
  new DataView(data.buffer, data.byteOffset, data.byteLength);
const u32 = (data, at) => viewOf(data).getUint32(at);
const u64 = (data, at) => {
  const value = viewOf(data).getBigUint64(at);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("MP4 偏移过大");
  return Number(value);
};
function box(data, at, limit = data.length) {
  if (at < 0 || at + 8 > limit) return null;
  let size = u32(data, at),
    header = 8;
  if (size === 1) {
    if (at + 16 > limit) return null;
    size = u64(data, at + 8);
    header = 16;
  }
  if (!size) size = limit - at;
  if (size < header || at + size > limit) return null;
  return {
    start: at,
    end: at + size,
    body: at + header,
    type: ascii(data, at + 4),
  };
}
function find(data, type, start, end) {
  for (let at = start; at + 8 <= end; at++) {
    if (ascii(data, at + 4) !== type) continue;
    const value = box(data, at, end);
    if (value?.type === type) return value;
  }
  return null;
}
export function headerLength(data, total) {
  if (data.length < 16 || ascii(data, 4) !== "ftyp")
    throw new Error("片源不是受支持的 MP4");
  const at = u32(data, 0);
  if (at < 8 || at + 8 > data.length || ascii(data, at + 4) !== "moov")
    return null;
  const end = at + u32(data, at);
  if (end > total || end > 8 * 1024 * 1024) throw new Error("MP4 索引大小异常");
  return end;
}
export function prepareHeader(data, key) {
  const header = data.slice();
  if (!key) return { header, samples: [] };
  const moov = box(data, u32(data, 0));
  if (moov?.type !== "moov") throw new Error("MP4 索引不完整");
  const samples = [];
  let cursor = moov.body;
  while (cursor < moov.end) {
    const track = box(data, cursor, moov.end);
    if (!track) throw new Error("视频轨道格式异常");
    cursor = track.end;
    if (track.type !== "trak") continue;
    const stbl = find(data, "stbl", track.body, track.end);
    if (!stbl) continue;
    const saiz = find(data, "saiz", stbl.body, stbl.end);
    if (!saiz) continue;
    const saio = find(data, "saio", stbl.body, stbl.end);
    const stsz = find(data, "stsz", stbl.body, stbl.end);
    const stsc = find(data, "stsc", stbl.body, stbl.end);
    const chunks =
      find(data, "stco", stbl.body, stbl.end) ??
      find(data, "co64", stbl.body, stbl.end);
    if (!saio || !stsz || !stsc || !chunks) throw new Error("加密视频索引缺失");
    const count = (at, limit) => {
      if (at + 4 > limit || u32(data, at) > 200000)
        throw new Error("MP4 索引越界");
      return u32(data, at);
    };
    const n = count(stsz.body + 8, stsz.end),
      defaultSize = u32(data, stsz.body + 4);
    if (!defaultSize && stsz.body + 12 + n * 4 > stsz.end)
      throw new Error("样本索引截断");
    const sizes = Array.from(
      { length: n },
      (_, i) => defaultSize || u32(data, stsz.body + 12 + i * 4),
    );
    const chunkCount = count(chunks.body + 4, chunks.end),
      width = chunks.type === "co64" ? 8 : 4;
    if (chunks.body + 8 + chunkCount * width > chunks.end)
      throw new Error("块偏移截断");
    const offsets = Array.from({ length: chunkCount }, (_, i) =>
      (width === 8 ? u64 : u32)(data, chunks.body + 8 + i * width),
    );
    const entriesCount = count(stsc.body + 4, stsc.end);
    if (!entriesCount || stsc.body + 8 + entriesCount * 12 > stsc.end)
      throw new Error("块索引截断");
    const entries = Array.from({ length: entriesCount }, (_, i) => [
      u32(data, stsc.body + 8 + i * 12),
      u32(data, stsc.body + 12 + i * 12),
    ]);
    const sizeBase = saiz.body + 4 + (u32(data, saiz.body) & 1 ? 8 : 0);
    if (sizeBase + 5 > saiz.end) throw new Error("辅助索引截断");
    const defaultAux = data[sizeBase],
      auxCount = count(sizeBase + 1, saiz.end);
    if (auxCount !== n || (!defaultAux && sizeBase + 5 + n > saiz.end))
      throw new Error("辅助样本数量不一致");
    const auxSizes = Array.from(
      { length: n },
      (_, i) => defaultAux || data[sizeBase + 5 + i],
    );
    const offsetBase = saio.body + 4 + (u32(data, saio.body) & 1 ? 8 : 0);
    const offsetWidth = data[saio.body] === 1 ? 8 : 4;
    if (
      count(offsetBase, saio.end) !== 1 ||
      offsetBase + 4 + offsetWidth > saio.end
    )
      throw new Error("辅助偏移格式不受支持");
    let aux = (offsetWidth === 8 ? u64 : u32)(data, offsetBase + 4);
    if (aux + auxSizes.reduce((a, b) => a + b, 0) > data.length)
      throw new Error("辅助数据超出索引范围");
    let sampleIndex = 0,
      entry = 0;
    for (let chunk = 0; chunk < offsets.length; chunk++) {
      while (entry + 1 < entries.length && entries[entry + 1][0] <= chunk + 1)
        entry++;
      const number = entries[entry][1];
      if (number > n - sampleIndex || entries[entry][0] > chunk + 1)
        throw new Error("样本与块数量不一致");
      let position = offsets[chunk];
      for (let k = 0; k < number; k++) {
        const length = sizes[sampleIndex],
          auxSize = auxSizes[sampleIndex];
        if (length <= 0 || auxSize < 8) throw new Error("加密样本无效");
        const iv = new Uint8Array(16);
        iv.set(data.subarray(aux, aux + 8));
        if (auxSize === 8)
          samples.push({
            start: position,
            end: position + length,
            iv,
            encryptedOffset: 0,
          });
        else {
          const subs = viewOf(data).getUint16(aux + 8);
          if (auxSize !== 10 + subs * 6) throw new Error("加密子样本索引异常");
          let offset = position,
            encryptedOffset = 0;
          for (let sub = 0; sub < subs; sub++) {
            const at = aux + 10 + sub * 6;
            offset += viewOf(data).getUint16(at);
            const size = u32(data, at + 2);
            if (offset + size > position + length)
              throw new Error("加密子样本越界");
            if (size)
              samples.push({
                start: offset,
                end: offset + size,
                iv,
                encryptedOffset,
              });
            offset += size;
            encryptedOffset += size;
          }
          if (offset !== position + length)
            throw new Error("加密子样本长度异常");
        }
        position += length;
        aux += auxSize;
        sampleIndex++;
      }
    }
    if (sampleIndex !== n) throw new Error("视频样本不完整");
    let at = stbl.body;
    while (at + 8 <= stbl.end) {
      const sinf = find(data, "sinf", at, stbl.end);
      if (!sinf) break;
      const frma = find(data, "frma", sinf.body, sinf.end);
      if (!frma || frma.body + 4 > frma.end) throw new Error("原始编码缺失");
      for (let p = sinf.start - 1; p >= stbl.body; p--) {
        if (["encv", "enca"].includes(ascii(data, p))) {
          header.set(data.subarray(frma.body, frma.body + 4), p);
          break;
        }
      }
      header.set(new TextEncoder().encode("free"), sinf.start + 4);
      header.fill(0, sinf.body, sinf.end);
      at = sinf.end;
    }
  }
  if (!samples.length) throw new Error("视频加密索引不可用");
  samples.sort((a, b) => a.start - b.start);
  if (samples.some((sample, i) => i > 0 && samples[i - 1].end > sample.start))
    throw new Error("视频样本重叠");
  return { header, samples };
}

export async function decryptRange(data, start, key, prepared) {
  const output = data.slice(),
    end = start + output.length;
  if (start < prepared.header.length)
    output.set(
      prepared.header.subarray(start, Math.min(end, prepared.header.length)),
    );
  if (!key) return output;
  let low = 0,
    high = prepared.samples.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (prepared.samples[mid].end <= start) low = mid + 1;
    else high = mid;
  }
  const work = [];
  for (let i = low; i < prepared.samples.length; i++) {
    const sample = prepared.samples[i];
    if (sample.start >= end) break;
    const begin = Math.max(start, sample.start),
      stop = Math.min(end, sample.end);
    if (begin >= stop) continue;
    const relative = begin - sample.start + sample.encryptedOffset,
      skip = relative % 16;
    const iv = Uint8Array.from(sample.iv),
      ivView = viewOf(iv);
    let counter = (ivView.getBigUint64(0) << 64n) | ivView.getBigUint64(8);
    counter = BigInt.asUintN(128, counter + BigInt(Math.floor(relative / 16)));
    ivView.setBigUint64(0, counter >> 64n);
    ivView.setBigUint64(8, BigInt.asUintN(64, counter));
    const input = new Uint8Array(skip + stop - begin);
    input.set(output.subarray(begin - start, stop - start), skip);
    work.push(
      (key instanceof Uint8Array ? Promise.resolve(decryptCtrBytes(input,key,iv)) : crypto.subtle
        .decrypt({ name: "AES-CTR", counter: iv, length: 128 }, key, input))
        .then((result) =>
          output.set(new Uint8Array(result).subarray(skip), begin - start),
        ),
    );
  }
  await Promise.all(work);
  return output;
}
