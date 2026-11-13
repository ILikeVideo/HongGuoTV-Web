// SPDX-License-Identifier: GPL-3.0-only
// GB/T 32905 SM3，签名协议要求同步散列，输出与 Kotlin 的 BouncyCastle 实现一致。
const rotate = (x, n) => (x << (n & 31)) | (x >>> ((32 - n) & 31));
exports.sm3 = function sm3(input) {
  const length = input.length;
  const padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
  padded.set(input);
  padded[length] = 128;
  const view = new DataView(padded.buffer);
  view.setBigUint64(padded.length - 8, BigInt(length) * 8n);
  const state = [
    0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600, 0xa96f30bc, 0x163138aa,
    0xe38dee4d, 0xb0fb0e4e,
  ];
  const w = new Int32Array(68);
  for (let start = 0; start < padded.length; start += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getInt32(start + j * 4);
    for (let j = 16; j < 68; j++) {
      const x = w[j - 16] ^ w[j - 9] ^ rotate(w[j - 3], 15);
      w[j] =
        x ^ rotate(x, 15) ^ rotate(x, 23) ^ rotate(w[j - 13], 7) ^ w[j - 6];
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let j = 0; j < 64; j++) {
      const a12 = rotate(a, 12);
      const ss1 = rotate(
        (a12 + e + rotate(j < 16 ? 0x79cc4519 : 0x7a879d8a, j)) | 0,
        7,
      );
      const ss2 = ss1 ^ a12;
      const ff = j < 16 ? a ^ b ^ c : (a & b) | (a & c) | (b & c);
      const gg = j < 16 ? e ^ f ^ g : (e & f) | (~e & g);
      const tt1 = (ff + d + ss2 + (w[j] ^ w[j + 4])) | 0;
      const tt2 = (gg + h + ss1 + w[j]) | 0;
      d = c;
      c = rotate(b, 9);
      b = a;
      a = tt1;
      h = g;
      g = rotate(f, 19);
      f = e;
      e = tt2 ^ rotate(tt2, 9) ^ rotate(tt2, 17);
    }
    [a, b, c, d, e, f, g, h].forEach((x, i) => {
      state[i] ^= x;
    });
  }
  return state.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
};
