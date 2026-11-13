// SPDX-License-Identifier: GPL-3.0-only
import { createFile } from "mp4box";
import { headerLength, prepareHeader, decryptRange } from "./media-crypto.mjs";
import { mediaHost } from "./protocol.mjs";

let run = 0,
  controller,
  release,
  parser,
  source,
  prepared,
  key,
  total,
  next;
let pumping = false,
  seekRevision = 0;
const chunkSize = 1024 * 1024;
function post(type, value = {}, transfer = []) {
  self.postMessage({ type, run, ...value }, transfer);
}

async function range(start, end, signal) {
  let last;
  for (const raw of source.urls) {
    try {
      const response = await fetch(mediaHost(raw), {
        headers: { Range: `bytes=${start}-${end}` },
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      });
      if (response.status !== 206)
        throw new Error(`片源范围读取失败（HTTP ${response.status}）`);
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
        response.headers.get("Content-Range") ?? "",
      );
      if (!match || Number(match[1]) !== start || Number(match[2]) > end)
        throw new Error("片源范围响应不匹配");
      const data = new Uint8Array(await response.arrayBuffer());
      if (data.length !== Number(match[2]) - start + 1)
        throw new Error("片源分段长度不匹配");
      if (total && total !== Number(match[3]))
        throw new Error("备用片源长度不一致");
      total = Number(match[3]);
      if (!Number.isSafeInteger(total) || total <= 0)
        throw new Error("片源长度无效");
      return data;
    } catch (error) {
      if (signal.aborted) throw error;
      last = error;
    }
  }
  throw last;
}

async function pump(ticket, signal) {
  pumping = true;
  try {
    while (ticket === run && !signal.aborted && next < total) {
      const seekTicket = seekRevision;
      const start = next;
      const raw = await range(
        start,
        Math.min(total - 1, start + chunkSize - 1),
        signal,
      );
      const clear = await decryptRange(raw, start, key, prepared);
      if (ticket !== run || signal.aborted) return;
      if (seekTicket !== seekRevision) continue;
      const buffer = clear.buffer;
      buffer.fileStart = start;
      const offset = parser.appendBuffer(buffer);
      next = Math.max(start + raw.length, Number.isFinite(offset) ? offset : 0);
      await new Promise((resolve) => {
        release = resolve;
        post("chunk");
      });
    }
    if (ticket === run && !signal.aborted) {
      parser.flush();
      post("end");
    }
  } finally {
    pumping = false;
  }
}

async function start(value, ticket) {
  source = value;
  total = 0;
  controller = new AbortController();
  const signal = controller.signal;
  let header = await range(0, 4095, signal);
  let length = headerLength(header, total);
  if (length === null) throw new Error("片源索引没有位于文件开头");
  if (length > header.length) header = await range(0, length - 1, signal);
  else header = header.subarray(0, length);
  prepared = prepareHeader(header, source.key);
  key = source.key
    ? crypto.subtle ? await crypto.subtle.importKey(
        "raw",
        Uint8Array.from(source.key),
        "AES-CTR",
        false,
        ["decrypt"],
      ) : Uint8Array.from(source.key)
    : null;
  if (ticket !== run) return;
  parser = createFile();
  parser.onError = () => {
    controller.abort();
    post("error", { message: "片源索引或视频封装解析失败" });
  };
  parser.onReady = (info) => {
    for (const track of info.tracks) {
      const mime = `${track.video ? "video" : "audio"}/mp4; codecs="${track.codec}"`;
      parser.setSegmentOptions(track.id, null, {
        nbSamples: 40,
        nbSamplesPerFragment: 40,
        rapAlignement: true,
      });
      post("track", {
        id: track.id,
        mime,
        duration: info.duration / info.timescale,
        width: track.video?.width,
        height: track.video?.height,
      });
    }
    for (const init of parser.initializeSegmentation("per-track")) {
      post("segment", { id: init.id, buffer: init.buffer }, [init.buffer]);
    }
    parser.start();
  };
  parser.onSegment = (id, user, buffer, sampleNumber) => {
    if (ticket !== run) return;
    post("segment", { id, buffer }, [buffer]);
    parser.releaseUsedSamples(id, sampleNumber);
  };
  const initial = prepared.header.slice().buffer;
  initial.fileStart = 0;
  parser.appendBuffer(initial);
  next = length;
  await pump(ticket, signal);
}

self.onmessage = (event) => {
  const value = event.data;
  if (value.type === "start") {
    run++;
    controller?.abort();
    release?.();
    release = null;
    seekRevision = 0;
    const ticket = run;
    start(value.source, ticket).catch((error) => {
      if (ticket === run && error.name !== "AbortError")
        post("error", { message: error.message });
    });
  } else if (value.type === "continue") {
    const done = release;
    release = null;
    done?.();
  } else if (
    value.type === "seek" &&
    parser &&
    Number.isFinite(value.position)
  ) {
    seekRevision++;
    next = parser.seek(Math.max(0, value.position), true).offset;
    const done = release;
    release = null;
    done?.();
    if (!pumping)
      pump(run, controller.signal).catch((error) => {
        if (error.name !== "AbortError")
          post("error", { message: error.message });
      });
  } else if (value.type === "stop") {
    run++;
    controller?.abort();
    release?.();
    release = null;
    parser?.stop();
  }
};
