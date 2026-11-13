// SPDX-License-Identifier: GPL-3.0-only
// MAIN 世界只接触官网播放器与公开作品资料，账号凭据由扩展后台保管。
import { accountSignal } from "./website-account.mjs";
import {installNativeBridge} from './native-bridge.mjs';
import {snapshotKey} from './bridge-state.mjs';
import {EPISODE_CELL_SELECTOR} from './episode-cells.mjs';
(() => {
  if (window.__hongguoEnhancerBridge) return;
  let latest = null,
    fingerprint = "",
    pauseRecord = [],
    suppressed = false,
    hydrated = false;
  const knownSeries = new Map();
  const entryUrl = new URL(location.href);
  const entrySeries = entryUrl.pathname.match(/^\/player\/(\d+)/)?.[1];
  const entryVideoId =
    entryUrl.searchParams.get("pc_locked_episode") ||
    entryUrl.pathname.match(/^\/player\/\d+\/(\d+)/)?.[1];
  const emit = (type, value) =>
    window.postMessage(
      { channel: "hg-web-bridge", type, value },
      location.origin,
    );
  const native=installNativeBridge(emit);
  function accept(raw, videoId = "") {
    if (
      !raw ||
      !Array.isArray(raw.vid_list) ||
      !raw.vid_list.length ||
      !raw.series_id
    )
      return;
    if (
      !raw.vid_list.every(
        (x) => typeof x === "string" && /^[1-9][0-9]{0,29}$/.test(x),
      )
    )
      return;
    const series = {
      id: String(raw.series_id),
      title: String(raw.series_name ?? raw.series_title ?? ""),
      cover: String(raw.series_cover ?? ""),
      description: String(raw.series_intro ?? ""),
      episodes: raw.vid_list.slice(),
      accessible: native.originalAccessible(raw) ?? Number(raw.accessible_episode_cnt ?? 0),
      videoId: String(videoId || ""),
      entryVideoId:
        String(raw.series_id) === entrySeries ? entryVideoId : undefined,
    };
    if (!series.title) return;
    knownSeries.set(series.id, series);
    if (knownSeries.size > 30)
      knownSeries.delete(knownSeries.keys().next().value);
    publishCurrent();
  }
  function publishCurrent() {
    const routeSeries = location.pathname.match(/^\/player\/(\d+)/)?.[1];
    const activeId = document
      .querySelector(".swiper-slide-active [data-feed-item]")
      ?.getAttribute("data-feed-item");
    let series;
    if (routeSeries) series = knownSeries.get(routeSeries);
    else if (activeId)
      series = [...knownSeries.values()].find(
        (item) => item.videoId === activeId || item.episodes.includes(activeId),
      );
    if (!series) return;
    if (activeId) series = { ...series, videoId: activeId };
    const key = snapshotKey(series,location.href);
    latest = series;
    if (key !== fingerprint) {
      fingerprint = key;
      emit("snapshot", series);
    }
  }
  function inspect(value, depth = 0) {
    if (!value || typeof value !== "object" || depth > 5) return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 40)) inspect(item, depth + 1);
      return;
    }
    if (value.detail) accept(value.detail, value.item_id);
    if (value.seriesDetail) accept(value.seriesDetail, value.vid);
    if (value.data?.seriesDetail)
      accept(value.data.seriesDetail, value.data.vid);
    if (value.data?.detail) accept(value.data.detail, value.data.item_id);
    for (const key of ["initialHomeFeed", "items", "entries", "list", "data"])
      if (value[key] && value[key] !== value) inspect(value[key], depth + 1);
  }
  function scan() {
    const rank = document.querySelector('header a[href*="/rank/"]')??[...document.querySelectorAll('header a,header button,header [class*="link"],header [class*="nav"]')].find(n=>n.textContent.trim()==='榜单');
    if (
      !hydrated &&
      rank &&
      Object.keys(rank).some(
        (key) =>
          key.startsWith("__reactFiber$") || key.startsWith("__reactProps$"),
      )
    ) {
      hydrated = true;
      emit("ready", null);
    }
    const loaders = window._ROUTER_DATA?.loaderData;
    if (loaders)
      for (const value of Object.values(loaders)) {
        inspect(value);
        const user =
          value?.req?.userInfo ?? value?.req?.user_info ?? value?.userInfo;
        if (user) {
          const info = accountSignal("/user/info", {
            data: { user_info: user },
          });
          if (info) emit("account", info);
        }
      }
    for(const node of document.querySelectorAll(EPISODE_CELL_SELECTOR))if(!node.hasAttribute('data-hg-site-ready')&&Object.keys(node).some(k=>k.startsWith('__reactFiber')||k.startsWith('__reactProps')))node.setAttribute('data-hg-site-ready','true');
    for(const node of document.querySelectorAll('button[class*="pc-hero-download-"],[class*="pc-download-"] [class*="pc-guide-box-"]'))if(!node.hasAttribute('data-hg-site-ready')&&Object.keys(node).some(k=>k.startsWith('__reactFiber')||k.startsWith('__reactProps')))node.setAttribute('data-hg-site-ready','true');
    publishCurrent();
  }
  const originalFetch = window.fetch;
  function inspectAccount(url, root) {
    if (
      (url.hostname === "hongguoduanju.com" ||
        url.hostname.endsWith(".hongguoduanju.com")) &&
      /(?:login|logout|user\/info|user_info|account\/info)/i.test(url.pathname)
    ) {
      const info = accountSignal(url.pathname, root);
      if (info) emit("account", info);
    }
  }
  window.fetch = function (...args) {
    let result = originalFetch.apply(this, args);
    const raw = args[0] instanceof Request ? args[0].url : String(args[0]);
    let url;
    try {
      url = new URL(raw, location.href);
    } catch {
      return result;
    }
    if (
      url.origin === location.origin &&
      (url.pathname.includes("/api/home/") ||
        url.pathname.includes("/api/video/")) && !url.pathname.includes('/protected/')
    ) {
      result=result.then(async response=>{
        if(!response.ok)return response;
        try{const value=native.transform(await response.clone().json());inspect(value);return new Response(JSON.stringify(value),{status:response.status,statusText:response.statusText,headers:response.headers});}catch{return response;}
      });
    }
    if (
      (url.hostname === "hongguoduanju.com" ||
        url.hostname.endsWith(".hongguoduanju.com")) &&
      /(?:login|logout|user\/info|user_info|account\/info)/i.test(url.pathname)
    ) {
      result
        .then((response) => {
          if (response.ok)
            response
              .clone()
              .json()
              .then((root) => {
                inspectAccount(url, root);
              })
              .catch(() => {});
        })
        .catch(() => {});
    }
    return result;
  };
  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, raw, ...rest) {
    let url;
    try {
      url = new URL(raw, location.href);
    } catch {}
    if(this.__hgResponseRewritten){delete this.response;delete this.responseText;this.__hgResponseRewritten=false;}
    if(url?.origin===location.origin&&/\/api\/(?:home|video)\//.test(url.pathname)&&!url.pathname.includes('/protected/')){
      const rewrite=()=>{
        if(this.readyState!==4)return;this.removeEventListener('readystatechange',rewrite,true);
        if(this.status<200||this.status>=300||!['','text','json'].includes(this.responseType))return;
        try{
          const value=native.transform(this.responseType==='json'?this.response:JSON.parse(this.responseText));
          if(this.responseType==='json')Object.defineProperty(this,'response',{configurable:true,value});
          else{const text=JSON.stringify(value);Object.defineProperty(this,'responseText',{configurable:true,value:text});Object.defineProperty(this,'response',{configurable:true,value:text});}
          this.__hgResponseRewritten=true;
        }catch{}
      };
      this.addEventListener('readystatechange',rewrite,true);
    }
    if (
      url &&
      ((url.origin === location.origin &&
        /\/api\/(?:home|video)\//.test(url.pathname)) ||
        ((url.hostname === "hongguoduanju.com" ||
          url.hostname.endsWith(".hongguoduanju.com")) &&
          /(?:login|logout|user\/info|user_info|account\/info)/i.test(
            url.pathname,
          )))
    )
      this.addEventListener(
        "load",
        () => {
          if (this.status < 200 || this.status >= 300) return;
          try {
            const root =
              this.responseType === "json"
                ? this.response
                : JSON.parse(this.responseText);
            inspectAccount(url, root);
            if (
              url.origin === location.origin &&
              /\/api\/(?:home|video)\//.test(url.pathname)
            )
              inspect(root);
          } catch {}
        },
        { once: true },
      );
    return xhrOpen.call(this, method, raw, ...rest);
  };
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.channel !== "hg-web-host"
    )
      return;
    const message = event.data;
    if(message.type==='wheel-feed'&&[-1,1].includes(message.direction)){
      const active=document.querySelector('.swiper-slide-active');
      const swiper=active?.closest('.swiper')?.swiper;
      const move=message.direction>0?swiper?.slideNext:swiper?.slidePrev;
      if(typeof move==='function')move.call(swiper);
    }
    if (message.type === "snapshot") {
      emit('bridge-ready',null);
      scan();
      if (hydrated) emit("ready", null);
      if (latest) emit("snapshot", latest);
    }
    if (message.type === "suppress") suppressed = true;
    if (message.type === "unsuppress") suppressed = false;
    if (message.type === "pause") {
      if (!pauseRecord.length)
        pauseRecord = [...document.querySelectorAll("video")].map((video) => ({
          video,
          playing: !video.paused,
          src: video.currentSrc,
        }));
      for (const { video } of pauseRecord) video.pause();
    }
    if (message.type === "resume") {
      for (const { video, playing, src } of pauseRecord)
        if (playing && video.isConnected && video.currentSrc === src)
          video.play().catch(() => {});
      pauseRecord = [];
    }
  });
  document.addEventListener(
    "play",
    (event) => {
      if (suppressed && event.target instanceof HTMLVideoElement)
        event.target.pause();
    },
    true,
  );
  document.addEventListener("DOMContentLoaded", scan);
  window.addEventListener("popstate", () => {
    fingerprint = "";
    scan();
  });
  let scheduled = false;
  new MutationObserver(() => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        publishCurrent();
      });
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "data-feed-item"],
  });
  setInterval(scan, 500);
  window.__hongguoEnhancerBridge = true;
  emit('bridge-ready',null);
})();
