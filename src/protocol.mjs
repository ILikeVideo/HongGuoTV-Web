// SPDX-License-Identifier: GPL-3.0-only
import vendor from "../.generated/protocol.cjs";
const {
  DEVICE,
  APP_UA,
  pythonUrlEncode,
  branchOf,
  xGorgon,
  helios,
  buildMedusa,
  be32,
  le32,
  md5,
} = vendor;
export { vendor };
export function encodeFields(fields){
  // 与 Kotlin Signer.encode 一致：URLEncoder 保留星号，空格转换为 %20。
  const encode=value=>encodeURIComponent(String(value??'')).replace(/[!'()]/g,ch=>'%'+ch.charCodeAt(0).toString(16).toUpperCase());
  return Object.entries(fields).map(([key,value])=>encode(key)+'='+encode(value)).join('&');
}

export function sign(base, fields = {}, body = null, now = Date.now()) {
  const timestamp = Math.floor(now / 1000);
  const binary = body == null ? null : Buffer.from(body);
  let ticket = now;
  let query;
  let url;
  for (let offset = 0; offset < 128; offset++) {
    ticket = now + offset;
    query = encodeFields({
      ...fields,
      ts: String(timestamp),
      _rticket: String(ticket),
    });
    url = base + "?" + query;
    if (branchOf(url, binary, timestamp) === 0) break;
    if (offset === 127) throw new Error("无法生成请求签名");
  }
  const headers = {
    Accept: "application/json; charset=utf-8,application/x-protobuf",
    "x-ss-req-ticket": String(ticket),
    "x-tt-request-tag": "t=0;n=0",
    "sdk-version": "2",
    "passport-sdk-version": "50561",
    "x-xs-from-web": "0",
    "x-khronos": String(timestamp),
    "x-ladon": be32(timestamp).toString("base64"),
    "x-argus": le32(timestamp).toString("base64"),
    "x-gorgon": xGorgon(
      query,
      binary,
      timestamp,
      Math.floor(Math.random() * 65536),
    ),
    "x-helios": helios(timestamp),
    "x-medusa": buildMedusa(url, binary, timestamp),
    "x-tt-dt": "",
  };
  if (body != null)
    Object.assign(headers, {
      "Content-Type": "application/json; charset=UTF-8",
      "x-vc-bdturing-sdk-version": "3.7.2.cn",
      "x-ss-stub": md5(binary).toUpperCase(),
    });
  return { url, headers, body };
}

export function deviceFields(account = false) {
  const { iid, device_id, ...fields } = DEVICE;
  if (account) return { ...fields, "passport-sdk-version": "50561" };
  return {
    ...fields,
    version_code: "73932",
    version_name: "7.3.9.32",
    manifest_version_code: "73932",
    update_version_code: "73932",
    pv_player: "73932",
  };
}
export const mobileUserAgent = APP_UA;

export function checked(root) {
  const data = root.data ?? root;
  const error = Number(
    data.error_code ?? root.code ?? root.Code ?? root.status_code ?? 0,
  );
  if (
    [1105, 1108, 2003, 2030].includes(error) ||
    data.verify_ticket ||
    data.verify_center_decision_conf
  ) {
    throw new Error("账号需要安全验证，请先在红果官方页面或 App 完成验证");
  }
  if (error || ["fail", "error"].includes(root.message)) {
    const problem = new Error(
      [1001, 1002, 1005, 2001].includes(error)
        ? "登录已失效，请重新登录"
        : `红果接口暂不可用（${error || "响应异常"}）`,
    );
    problem.code = error;
    throw problem;
  }
  return data;
}

export function id(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,29}$/.test(value))
    throw new Error("作品或视频编号无效");
  return value;
}

export function safeJson(text) {
  // 官方个别账号接口同时给出数字与字符串 ID，提前保留超出 JS 精度的整数。
  return JSON.parse(
    text.replace(
      /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
      (token) => (/^-?\d{16,}$/.test(token) ? JSON.stringify(token) : token),
    ),
  );
}

export function mediaHost(url) {
  const u = new URL(url);
  const allowed = [
    "fqnovel.com",
    "fqnovelvod.com",
    "qznovelvod.com",
    "douyinvod.com",
    "bytecdn.cn",
    "pstatp.com",
    "snssdk.com",
  ];
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    !allowed.some(
      (host) => u.hostname === host || u.hostname.endsWith("." + host),
    )
  )
    throw new Error("片源域名不受支持");
  return u.href;
}

export function parseSources(response, videoId) {
  const info = response.video_info?.data;
  if (!info?.video_list) throw new Error("播放地址数据不完整");
  const entries = Object.values(info.video_list);
  const decodeUrl = (value) => {
    if (!value) return "";
    const decoded = info.key_seed
      ? vendor.decryptSpadeUrl(value, Buffer.from(info.key_seed, "base64"))
      : value;
    return mediaHost(decoded);
  };
  return entries.flatMap((entry) => {
    const urls = [entry.main_url, entry.backup_url]
      .filter(Boolean)
      .map(decodeUrl);
    if (!urls.length) return [];
    return [
      {
        videoId,
        urls: [...new Set(urls)],
        quality: String(entry.definition ?? entry.vheight ?? "未知"),
        codec: String(entry.codec_type ?? entry.codec ?? ""),
        width: Number(entry.vwidth ?? entry.width ?? 0),
        height: Number(entry.vheight ?? entry.height ?? 0),
        size: Number(entry.size ?? 0),
        key: entry.spade_a ? [...vendor.deriveContentKey(entry.spade_a)] : null,
      },
    ];
  });
}
