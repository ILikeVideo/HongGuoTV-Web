// SPDX-License-Identifier: GPL-3.0-only
// 让仓库既有签名算法在扩展中运行；仅实现该协议用到的同步密码学接口。
const CryptoJS = require("crypto-js");
const { sm3 } = require("./sm3.cjs");
const { Buffer } = require("buffer");

function words(bytes) {
  return CryptoJS.lib.WordArray.create(Uint8Array.from(bytes));
}

function bytes(value) {
  const output = Buffer.alloc(value.sigBytes);
  for (let i = 0; i < output.length; i++)
    output[i] = value.words[i >>> 2] >>> (24 - (i % 4) * 8);
  return output;
}

exports.createHash = function createHash(algorithm) {
  const chunks = [];
  return {
    update(value) {
      chunks.push(Buffer.from(value));
      return this;
    },
    digest(encoding) {
      const input = Buffer.concat(chunks);
      const result =
        algorithm === "sm3"
          ? Buffer.from(sm3([...input]), "hex")
          : bytes(
              {
                md5: CryptoJS.MD5,
                sha512: CryptoJS.SHA512,
                sha256: CryptoJS.SHA256,
              }[algorithm](words(input)),
            );
      return encoding ? result.toString(encoding) : result;
    },
  };
};

exports.createDecipheriv = function createDecipheriv(algorithm, key, iv) {
  if (algorithm !== "aes-128-cbc") throw new Error("不支持的协议加密模式");
  return {
    setAutoPadding() {
      return this;
    },
    update(value) {
      return bytes(
        CryptoJS.AES.decrypt({ ciphertext: words(value) }, words(key), {
          iv: words(iv),
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.NoPadding,
        }),
      );
    },
    final() {
      return Buffer.alloc(0);
    },
  };
};
