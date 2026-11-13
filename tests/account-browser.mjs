// 使用虚构会话及只读接口响应验证账号隔离，不创建或登录真实账号。
import { launch } from "./launch.mjs";
import path from "node:path";
import assert from "node:assert/strict";
const { context, extensionId, channel } = await launch(
  path.resolve(import.meta.dirname, ".."),
);
try {
  const account = await context.newPage();
  await account.goto(`chrome-extension://${extensionId}/account.html`);
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() => {
    self.fixtureUid = "111";
    self.fixtureDelay = false;
    self.fixtureWrites = [];
    const original = self.fetch,
      json = (data) =>
        new Response(JSON.stringify({ data }), {
          headers: { "Content-Type": "application/json" },
        });
    self.fetch = async (raw, options) => {
      const url = new URL(String(raw));
      if (
        !/\/(passport\/account|reading\/(bookapi\/(read_history|bookshelf)|ugc\/action|user\/subscribe))/.test(
          url.pathname,
        )
      )
        return original(raw, options);
      if (options?.method === "POST") {
        self.fixtureWrites.push(url.pathname);
        throw new Error("测试禁止写入");
      }
      const owner = self.fixtureUid;
      if (url.pathname.includes("/passport/"))
        return json({
          user_info: { user_id: owner, name: "测试账号" + owner },
        });
      if (self.fixtureDelay)
        await new Promise((resolve) => setTimeout(resolve, 300));
      const item = {
        series_id: "7701328280862854168",
        series_title: "测试片单" + owner,
        series_cover_url: "",
        vid: "7701328441043340313",
        vid_index: 6,
        current_play_position: 1500,
      };
      if (url.pathname.includes("/read_history/")) {
        const offset = Number(url.searchParams.get("offset"));
        return json({
          data_list: Array.from({ length: offset ? 2 : 30 }, () => item),
          has_more: !offset,
          next_offset: offset ? 32 : 30,
        });
      }
      if (url.pathname.includes("/bookshelf/"))
        return json({ video_shelf_info: [item], has_more: false });
      if (url.pathname.includes("/ugc/"))
        return json({
          mixed_data_list: [{ video_data: item }],
          has_more: false,
        });
      return json({
        subscribe_items: [
          {
            subscribe_data: {
              series_id: item.series_id,
              title: "预约" + owner,
              cover: "",
            },
            expected_rec_text: "即将上线",
          },
        ],
        has_more: false,
      });
    };
  });
  const call = (type, fields = {}) =>
    account.evaluate(
      async ({ type, fields }) =>
        chrome.runtime.sendMessage({
          type,
          ...fields,
          requestId: crypto.randomUUID(),
        }),
      { type, fields },
    );
  assert.equal(
    await account.locator("form,input").count(),
    0,
    "插件不能提供登录表单",
  );
  await context.addCookies([
    {
      name: "sessionid",
      value: "hg-fixture-session-A",
      domain: ".hongguoduanju.com",
      path: "/",
      secure: true,
      httpOnly: true,
    },
  ]);
  const linked = await call("SyncWebsiteSession", {
    loggedIn: true,
    phone: "13800138000",
  });
  assert.ok(linked.ok);
  assert.equal(linked.value.phone, "138****8000");
  assert.ok(
    await account.evaluate(async () => {
      const s = await chrome.storage.local.get(["deviceId", "websiteIdentity"]);
      return (
        s.websiteIdentity.phone === "13800138000" &&
        s.deviceId === s.websiteIdentity.deviceId
      );
    }),
  );
  const first = await call("GetLibraryPage", { kind: "history" }),
    second = await call("GetLibraryPage", {
      kind: "history",
      cursor: first.value.next,
    });
  assert.equal(first.value.items.length, 30);
  assert.equal(second.value.items.length, 2);
  assert.equal(second.value.next, null);
  for (const kind of ["favorites", "likes", "reservations"])
    for (const coming of kind === "reservations" ? [false, true] : [false]) {
      const result = await call("GetLibraryPage", { kind, coming });
      assert.ok(result.ok);
      assert.equal(result.value.items.length, 1);
      if (coming) assert.equal(result.value.items[0].playable, false);
    }
  await worker.evaluate(() => {
    self.fixtureDelay = true;
  });
  const old = call("GetLibraryPage", { kind: "history" });
  await account.waitForTimeout(80);
  await worker.evaluate(() => {
    self.fixtureUid = "222";
  });
  await context.addCookies([
    {
      name: "sessionid",
      value: "hg-fixture-session-B",
      domain: ".hongguoduanju.com",
      path: "/",
      secure: true,
      httpOnly: true,
    },
  ]);
  const changed = await call("SyncWebsiteSession", {
    loggedIn: true,
    phone: "13900001234",
  });
  assert.equal(changed.value.id, "222");
  const late = await old;
  assert.equal(late.ok, false);
  assert.match(late.error, /账号已切换/);
  await call("SyncWebsiteSession", { loggedIn: false });
  assert.equal((await call("GetProfile")).value, null);
  assert.deepEqual(await worker.evaluate(() => self.fixtureWrites), []);
  const deprecated = await call("SendSms", { phone: "13800138000" });
  assert.equal(deprecated.ok, false);
  console.log(
    channel +
      "：官网会话关联、号码脱敏、四类只读片单、分页、换号隔离、退出清理均通过（虚构会话夹具）",
  );
} finally {
  await context.close();
}
