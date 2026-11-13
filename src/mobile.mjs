// SPDX-License-Identifier: GPL-3.0-only
import {
  sign,
  deviceFields,
  checked,
  id,
  safeJson,
} from "./protocol.mjs";

const API = "https://api5-normal-sinfonlineb.fqnovel.com";
const ACCOUNT_PATHS = new Set([
  "/passport/account/info/v2/",
  "/reading/bookapi/bookshelf/video/info/v",
  "/reading/bookapi/read_history/list/v",
  "/reading/ugc/action/mget/v",
  "/reading/user/subscribe/list/v1/",
]);

export async function mobileRequest(
  path,
  fields = {},
  { signal, session, form } = {},
) {
  const values = deviceFields(ACCOUNT_PATHS.has(path));
  if (session && !path.startsWith("/passport/")) values.user_is_login = "1";
  const base = path.startsWith("/passport/")
    ? "https://security.snssdk.com"
    : path.startsWith("/reading/bookapi/read_history/")
      ? "https://reading.snssdk.com"
      : API;
  const body = form ? new URLSearchParams(fields).toString() : null;
  if (!form) Object.assign(values, fields);
  const req = sign(base + path, values, body);
  if (form)
    req.headers["Content-Type"] =
      "application/x-www-form-urlencoded; charset=UTF-8";
  if (session?.token) req.headers["X-Tt-Token"] = session.token;
  const response = await fetch(req.url, {
    method: form ? "POST" : "GET",
    body,
    headers: req.headers,
    signal: AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(15000),
    ]),
    credentials: session ? "include" : "omit",
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(`红果接口请求失败（HTTP ${response.status}）`);
  const text = await response.text();
  if (!text.trim()) throw new Error("红果接口返回空内容，请重试");
  return {
    root: safeJson(text),
    token: response.headers.get("X-Tt-Token") || "",
  };
}

export async function detail(seriesId, signal) {
  id(seriesId);
  let raw;
  try {
    const response = await mobileRequest(
      "/reading/bookapi/video_tab/video_detail/v1/",
      {
        video_series_id: seriesId,
        vs_id_type: "1",
        source: "7",
        screen_width_px: "1280",
        is_horizontal_screen: "true",
      },
      { signal },
    );
    const data = checked(response.root);
    raw = data.video_data ?? data.video_detail ?? data;
    if (!raw.series_id && !raw.series_id_str && !raw.video_series_id)
      raw = data[seriesId] ?? raw;
    if (raw.disable_play) {
      const error = new Error("本集尚未开放播放");
      error.code = "UNAVAILABLE";
      throw error;
    }
    const vids =
      raw.video_list
        ?.slice()
        .sort((a, b) => Number(a.vid_index) - Number(b.vid_index))
        .map((x) => String(x.vid ?? x.video_id ?? "")) ?? raw.vid_list;
    if (Array.isArray(vids) && vids.length)
      return series(raw, vids, seriesId, data.dir_data?.item_list);
  } catch (e) {
    if (signal?.aborted || e.code) throw e;
  }
  const response = await fetch(
    "https://hongguoduanju.com/detail?series_id=" + seriesId,
    { signal, credentials: "omit" },
  );
  if (!response.ok) throw new Error("剧集详情暂不可用");
  const html = await response.text();
  const marker = html.indexOf("_ROUTER_DATA");
  if (marker < 0) throw new Error("官网详情格式已变化");
  const start = html.indexOf("{", marker);
  let quoted = false,
    escaped = false,
    depth = 0,
    end = start;
  for (; end < html.length; end++) {
    const ch = html[end];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "{" || ch === "[") depth++;
    else if ((ch === "}" || ch === "]") && --depth === 0) {
      end++;
      break;
    }
  }
  const page = safeJson(html.slice(start, end)).loaderData?.detail_page;
  raw = page?.seriesDetail;
  if (!raw?.vid_list?.length) throw new Error("没有取得完整选集");
  return series(raw, raw.vid_list, seriesId);
}

function series(raw, vids, expected, directory = []) {
  const seriesId = String(
    raw.series_id_str ?? raw.series_id ?? raw.video_series_id ?? expected,
  );
  if (seriesId !== expected) throw new Error("剧集编号不匹配");
  const episodes = vids.map((x) => id(String(x)));
  if (!episodes.length || new Set(episodes).size !== episodes.length)
    throw new Error("选集资料不完整");
  const platforms = {},
    unavailable = {};
  for (const row of raw.video_list ?? []) {
    const vid = String(row.vid ?? row.video_id ?? "");
    if (episodes.includes(vid)) {
      platforms[vid] = Number(row.video_platform ?? raw.video_platform ?? 3);
      if (row.disable_play) unavailable[vid] = "本集尚未开放播放";
    }
  }
  for (const row of directory ?? [])
    if (
      row.need_unlock &&
      episodes.includes(String(row.vid ?? row.item_id ?? ""))
    )
      unavailable[String(row.vid ?? row.item_id)] = "本集尚未开放播放";
  return {
    id: seriesId,
    title: raw.series_title ?? raw.series_name ?? "",
    platform: Number(raw.video_platform ?? 3),
    platforms,
    unavailable,
    cover: raw.series_cover_url ?? raw.series_cover ?? "",
    description: raw.series_intro ?? "",
    episodes,
    accessible: Number(raw.accessible_episode_cnt ?? 0),
  };
}

export async function accountRequest(path, fields, options) {
  if (!ACCOUNT_PATHS.has(path) || options?.form)
    throw new Error("账号操作不受支持");
  return mobileRequest(path, fields, options);
}

export function parseLibrary(kind, root, cursor = {}, coming = false) {
  cursor??={};
  const data = checked(root);
  let rows;
  if (kind === "history") rows = data.data_list;
  if (kind === "favorites") rows = data.video_shelf_info;
  if (kind === "likes")
    rows = data.mixed_data_list ?? (data.count === 0 ? [] : undefined);
  if (kind === "reservations") rows = data.subscribe_items;
  if (!Array.isArray(rows)) throw new Error("片单资料格式已变化");
  const items = rows
    .filter((x) => !x.is_delete)
    .map((row) => {
      const video = row.subscribe_data?.video_detail ?? row.video_data ?? row;
      const reserved = row.subscribe_data ?? {};
      const seriesId = String(
        reserved.series_id ??
          video.series_id ??
          row.book_id_str ??
          row.book_id ??
          "",
      );
      const episodeId = String(row.vid ?? video.vid ?? "");
      const title =
        reserved.title ??
        row.series_title ??
        row.book_name ??
        video.video_detail?.series_title ??
        video.series_title ??
        video.series_name ??
        video.title ??
        row.name ??
        "";
      return {
        id: seriesId,
        title,
        cover:
          reserved.cover ??
          row.series_cover_url ??
          row.thumb_url ??
          video.cover ??
          video.series_cover_url ??
          video.series_cover ??
          row.cover ??
          "",
        episodeId,
        episode: Number(row.vid_index ?? video.vid_index ?? 0),
      position: Number.isFinite(Number(row.current_play_position))?Math.max(0,Number(row.current_play_position)):0,
        count: Number(video.episode_cnt ?? video.total_episode_count ?? 0),
        publishText: row.expected_rec_text ?? row.expected_publish_time ?? "",
        playable: !coming && /^[1-9][0-9]{0,29}$/.test(seriesId),
      };
    })
    .filter((x) => x.title);
  const more = Boolean(data.has_more);
  const nextOffset = Number(data.next_offset ?? -1);
  if (more && (!Number.isSafeInteger(nextOffset)||nextOffset <= Number(cursor.offset ?? 0)))
    throw new Error("片单分页没有前进，请刷新");
  return {
    items,
    next: more
      ? {
          offset: nextOffset,
          sessionId: data.session_id ?? cursor.sessionId ?? "",
        }
      : null,
    onlineTotal: data.online_total_count ?? null,
    comingTotal: data.offline_total_count ?? null,
  };
}
