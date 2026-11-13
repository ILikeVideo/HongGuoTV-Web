import test from "node:test";
import assert from "node:assert/strict";
import { parseLibrary } from "../.generated/test-mobile.mjs";
test('首屏空游标仍能读取下一页',()=>{
  assert.equal(parseLibrary('likes',{data:{mixed_data_list:[],has_more:true,next_offset:30}},null).next.offset,30);
  assert.throws(()=>parseLibrary('likes',{data:{mixed_data_list:[],has_more:true,next_offset:'无效'}},null));
});
test("历史保留服务端顺序、重复作品及毫秒进度", () => {
  const row = {
    book_id_str: "7701328280862854168",
    book_name: "中文 & <剧名>",
    vid: "7701328441043340313",
    vid_index: 6,
    current_play_position: 12345,
  };
  const page = parseLibrary("history", {
    code: 0,
    data: { data_list: [row, row], has_more: true, next_offset: 30 },
  });
  assert.equal(page.items.length, 2);
  assert.equal(page.items[0].position, 12345);
  assert.equal(page.items[0].episode, 6);
  assert.equal(page.next.offset, 30);
});
test("收藏与点赞采用响应中的真实卡片字段", () => {
  const row = {
    series_title: "收藏剧",
    series_cover_url: "https://example.com/a.jpg",
    video_data: { series_id: "123", vid: "456" },
  };
  assert.equal(
    parseLibrary("favorites", { data: { video_shelf_info: [row] } }).items[0]
      .title,
    "收藏剧",
  );
  assert.equal(
    parseLibrary("likes", { data: { mixed_data_list: [row] } }).items[0]
      .episodeId,
    "456",
  );
});
test("待上线预约没有作品编号时也能展示，禁止打开播放", () => {
  const row = {
    item_id: "555",
    subscribe_data: { title: "待上线剧", cover: "https://example.com/a.jpg" },
    expected_rec_text: "明日上线",
  };
  const page = parseLibrary(
    "reservations",
    { data: { subscribe_items: [row], has_more: false } },
    {},
    true,
  );
  assert.equal(page.items[0].playable, false);
  assert.equal(page.items[0].publishText, "明日上线");
});
test("错误响应和不前进游标不能伪装空片单", () => {
  assert.throws(() => parseLibrary("history", { code: 1001 }));
  assert.throws(() =>
    parseLibrary(
      "favorites",
      { data: { video_shelf_info: [], has_more: true, next_offset: 30 } },
      { offset: 30 },
    ),
  );
});
