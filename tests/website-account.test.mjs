import test from "node:test";
import assert from "node:assert/strict";
import {
  accountSignal,
  normalizePhone,
  maskPhone,
  preferredPhone,
} from "../src/website-account.mjs";
test("官网完整或脱敏手机号保留，显示时脱敏", () => {
  assert.equal(normalizePhone("+86 138-0013-8000"), "13800138000");
  assert.equal(maskPhone("13800138000"), "138****8000");
  assert.equal(normalizePhone("138****8000"), "138****8000");
  assert.equal(normalizePhone("unknown"), "");
  assert.equal(preferredPhone("138****8000", "13800138000"), "13800138000");
  assert.equal(preferredPhone("139****1234", "13800138000"), "139****1234");
});
test("只有成功登录关联号码，失败或发验证码不能当作登录成功", () => {
  assert.deepEqual(
    accountSignal("/passport/web/sms_login/", {
      message: "success",
      data: { user_id: "123", mobile: "138****8000" },
    }),
    {
      loggedIn: true,
      phone: "138****8000",
      userId: "123",
      loginSucceeded: true,
    },
  );
  assert.equal(
    accountSignal("/passport/web/sms_login/", {
      message: "error",
      data: { error_code: 1001, mobile: "13800138000" },
    }),
    null,
  );
  assert.equal(
    accountSignal("/passport/web/send_code/", { message: "success", data: {} }),
    null,
  );
  assert.deepEqual(
    accountSignal("/passport/web/logout/", { message: "success" }),
    { loggedIn: false },
  );
});
