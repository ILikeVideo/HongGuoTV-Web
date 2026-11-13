// SPDX-License-Identifier: GPL-3.0-only
import { detail, accountRequest, parseLibrary } from "./mobile.mjs";
import { playbackClient } from './algorithm-client.mjs';
const sources = playbackClient(globalThis.__HG_ALGORITHM__,undefined,globalThis.__HG_ALGO_RUNNER__?.(globalThis.__HG_ALGORITHM__));
import { checked, id, mobileUserAgent } from "./protocol.mjs";
import {
  normalizePhone,
  maskPhone,
  preferredPhone,
} from "./website-account.mjs";

const jobs = new Map();
const officialHosts = [
  "security.snssdk.com",
  "reading.snssdk.com",
  "api5-normal-sinfonlineb.fqnovel.com",
  "api5-normal-sinfonlinec.fqnovel.com",
];
const siteUrls = [
  "https://hongguoduanju.com/*",
  "https://www.hongguoduanju.com/*",
];
const extensionOrigin = chrome.runtime.getURL("").replace(/\/$/, "");
const cookieNames = new Set([
  "sessionid",
  "sessionid_ss",
  "sid_tt",
  "sid_guard",
  "uid_tt",
  "uid_tt_ss",
]);
let generation = 0,
  accountChanges = Promise.resolve();

async function configureRules(session) {
  const rules = [
    {
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "User-Agent", operation: "set", value: mobileUserAgent },
        ],
      },
      condition: {
        requestDomains: officialHosts,
        initiatorDomains: [chrome.runtime.id],
        resourceTypes: ["xmlhttprequest"],
        regexFilter: '^https://[^/]+/(reading/|passport/)',
      },
    },
  ];
  if (session?.cookie)
    rules.push({
      id: 2,
      priority: 2,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "Cookie", operation: "set", value: session.cookie },
        ],
      },
      condition: {
        requestDomains: officialHosts,
        initiatorDomains: [chrome.runtime.id],
        resourceTypes: ["xmlhttprequest"],
        regexFilter:
          "^https://[^/]+/(passport/|reading/(bookapi/(bookshelf/|read_history/)|ugc/action/mget/|user/subscribe/list/))",
      },
    });
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1, 2, 3],
    addRules: rules,
  });
}
async function getSession() {
  return (await chrome.storage.local.get("account")).account ?? null;
}
async function initialize() {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  const state = await chrome.storage.local.get("deviceId");
  if (!state.deviceId)
    await chrome.storage.local.set({ deviceId: crypto.randomUUID() });
  await configureRules(await getSession());
}
const ready = initialize();
globalThis.__HG_SERVICE_READY__=ready;
function allowed(sender) {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  const origin = new URL(sender.url).origin;
  return (
    origin === extensionOrigin ||
    ["https://hongguoduanju.com", "https://www.hongguoduanju.com"].includes(
      origin,
    )
  );
}
function trusted(sender) {
  return sender.url?.startsWith(extensionOrigin + "/");
}
async function notifyAccount() {
  for (const tab of await chrome.tabs.query({ url: siteUrls }))
    chrome.tabs
      .sendMessage(tab.id, { type: "account-changed" })
      .catch(() => {});
}
async function publicAccount() {
  const state = await chrome.storage.local.get(["account", "websiteIdentity"]);
  const session = state.account,
    identity = state.websiteIdentity;
  if (!session && !identity) return null;
  return {
    id: session?.id ?? identity?.userId ?? "",
    nickname: session?.nickname ?? "官网账号",
    phone: maskPhone(identity?.phone),
    libraryReady: !!session,
  };
}
async function profile(session, signal) {
  const { root } = await accountRequest(
    "/passport/account/info/v2/",
    {},
    { session, signal },
  );
  const data = checked(root),
    user = data.user_info ?? data;
  return {
    ...session,
    id: id(String(user.user_id_str ?? user.user_id ?? user.uid ?? "")),
    nickname: String(user.name ?? user.screen_name ?? "红果用户"),
    phone: normalizePhone(user.mobile ?? user.phone ?? ""),
  };
}
function changeAccount(signal, action) {
  const task = accountChanges.then(async () => {
    signal?.throwIfAborted();
    try {
      return await action();
    } finally {
      await configureRules(await getSession());
    }
  });
  accountChanges = task.catch(() => {});
  return task;
}
async function syncWebsite(message = {}, signal) {
  return changeAccount(signal, async () => {
    const cookies =
      message.loggedIn === false
        ? []
        : await chrome.cookies.getAll({ domain: "hongguoduanju.com" });
    const unique = new Map(
      cookies
        .filter((x) => cookieNames.has(x.name))
        .map((x) => [x.name, x.value]),
    );
    const previous = await chrome.storage.local.get([
      "account",
      "websiteIdentity",
      "deviceId",
    ]);
    if (
      !unique.has("sessionid") &&
      !unique.has("sessionid_ss") &&
      !unique.has("sid_tt")
    ) {
      const phone = normalizePhone(message.phone),
        userId = /^[1-9]\d{0,29}$/.test(String(message.userId ?? ""))
          ? String(message.userId)
          : "";
      if (message.loggedIn === true && (phone || userId)) {
        const same = userId && previous.websiteIdentity?.userId === userId;
        if(!same)generation++;
        await chrome.storage.local.set({
          account: null,
          websiteIdentity: {
            deviceId: previous.deviceId,
            userId,
            phone: preferredPhone(
              phone,
              same ? previous.websiteIdentity?.phone : "",
            ),
            fingerprint: "website:" + userId,
            savedAt: Date.now(),
          },
        });
        await notifyAccount();
        return publicAccount();
      }
      if(previous.account||previous.websiteIdentity)generation++;
      await chrome.storage.local.remove(["account", "websiteIdentity"]);
      if (previous.account || previous.websiteIdentity) await notifyAccount();
      return null;
    }
    const cookie = [...unique]
      .map(([key, value]) => key + "=" + value)
      .join("; ");
    const owner =
      unique.get("sessionid") ||
      unique.get("sessionid_ss") ||
      unique.get("sid_tt");
    const fingerprint = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(owner)),
      ),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    const same = previous.websiteIdentity?.fingerprint === fingerprint;
    if(!same)generation++;
    let verified =
      same && previous.account ? { ...previous.account, cookie } : null;
    if (!verified) {
      const candidate = { cookie, token: "" };
      await configureRules(candidate);
      try {
        verified = await profile(candidate, signal);
        if (message.userId && String(message.userId) !== verified.id)
          verified = null;
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
    signal?.throwIfAborted();
    if (!verified && !same && message.loggedIn !== true) return null;
    const phone = preferredPhone(
      normalizePhone(message.phone) || verified?.phone,
      same ? previous.websiteIdentity?.phone : "",
    );
    const identity = {
      deviceId: previous.deviceId,
      phone,
      userId: verified?.id || (/^[1-9]\d{0,29}$/.test(String(message.userId??''))?String(message.userId):''),
      fingerprint,
      savedAt: Date.now(),
    };
    await chrome.storage.local.set({
      account: verified ?? null,
      websiteIdentity: identity,
    });
    if (!same || previous.websiteIdentity?.phone !== phone)
      await notifyAccount();
    return publicAccount();
  });
}
async function openWebsiteLogin() {
  const existing = (await chrome.tabs.query({ url: siteUrls }))[0];
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    await chrome.tabs
      .sendMessage(existing.id, { type: "open-website-login" })
      .catch(() => {});
  } else
    await chrome.tabs.create({ url: "https://hongguoduanju.com/#hg-login" });
  return true;
}
async function handle(message, sender, signal) {
  switch (message.type) {
    case "GetDetail":
      return detail(id(message.seriesId), signal);
    case "GetPlayback": {
      if (!trusted(sender)) throw new Error("播放资料只能由扩展播放器读取");
      const owner = generation;
      const value = await sources(
        id(message.videoId),
        signal,
        Number(message.platform ?? 3),
        await getSession(),
        Number(message.contentType ?? 1004),
      );
      if (owner !== generation) throw new Error("账号已切换，请重试");
      return value;
    }
    case "GetProfile":
      return publicAccount();
    case "SyncWebsiteSession":
      return syncWebsite(message, signal);
    case "OpenWebsiteLogin":
      return openWebsiteLogin();
    case "OpenAccount":
      await chrome.tabs.create({ url: chrome.runtime.getURL("account.html") });
      return true;
    case "GetLibraryPage": {
      await accountChanges;
      signal.throwIfAborted();
      const session = await getSession();
      if (!session)
        throw new Error("官网会话暂不能读取手机片单，请在官网重新登录后刷新");
      const owner = generation,
        offset = Number(message.cursor?.offset ?? 0),
        kind = message.kind;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
        throw new Error("分页参数无效");
      const paths = {
        favorites: "/reading/bookapi/bookshelf/video/info/v",
        history: "/reading/bookapi/read_history/list/v",
        likes: "/reading/ugc/action/mget/v",
        reservations: "/reading/user/subscribe/list/v1/",
      };
      if (!paths[kind]) throw new Error("片单分类无效");
      const fields = { offset: String(offset), count: "30", limit: "30" };
      if (kind === "history")
        Object.assign(fields, {
          book_type: "2",
          full_field: "true",
          query_soft_deleted: "false",
          is_first_load: String(offset === 0),
          last_min_read_timestamp_ms: "0",
        });
      if (kind === "likes")
        Object.assign(fields, { action_type: "3", object_type_list: "6,15" });
      if (kind === "reservations")
        Object.assign(fields, {
          is_online: String(!message.coming),
          tab_type: "13",
          session_id: String(message.cursor?.sessionId ?? "").slice(0, 4096),
        });
      const response = await accountRequest(paths[kind], fields, {
        session,
        signal,
      });
      if (owner !== generation) throw new Error("账号已切换，请刷新");
      return parseLibrary(kind, response.root, message.cursor, message.coming);
    }
    default:
      throw new Error("扩展请求不受支持");
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!allowed(sender) || !message || typeof message.type !== "string")
    return false;
  const key = `${sender.tab?.id ?? "extension"}:${sender.documentId ?? sender.frameId}:${message.requestId ?? ""}`;
  if (message.type === "Cancel") {
    jobs.get(key)?.abort();
    reply({ ok: true });
    return false;
  }
  const controller = new AbortController();
  jobs.get(key)?.abort();
  jobs.set(key, controller);
  ready
    .then(() => handle(message, sender, controller.signal))
    .then(
      (value) => reply({ ok: true, value }),
      (error) =>
        reply({
          ok: false,
          error: controller.signal.aborted
            ? "请求已取消"
            : error.message || "请求失败",
        }),
    )
    .finally(() => {
      if (jobs.get(key) === controller) jobs.delete(key);
    });
  return true;
});
let cookieTimer;
chrome.cookies.onChanged.addListener(({ cookie }) => {
  if (
    !cookieNames.has(cookie.name) ||
    !/(?:^|\.)(?:hongguoduanju|snssdk)\.com$/.test(
      cookie.domain.replace(/^\./, ""),
    )
  )
    return;
  clearTimeout(cookieTimer);
  cookieTimer = setTimeout(
    () => ready.then(() => syncWebsite()).catch(() => {}),
    500,
  );
});
