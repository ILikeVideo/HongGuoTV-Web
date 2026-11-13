// 只保存官网实际提供的完整或脱敏手机号，不根据脱敏内容推测号码。
export function normalizePhone(value) {
  const phone = String(value ?? "")
    .trim()
    .replace(/^\+?86[ -]?/, "")
    .replace(/[\s-]/g, "");
  return /^1[3-9]\d{9}$/.test(phone) || /^1\d{2}[*•xX]{4,6}\d{2,4}$/.test(phone)
    ? phone
    : "";
}
export function maskPhone(value) {
  const phone = normalizePhone(value);
  return /^1\d{10}$/.test(phone)
    ? phone.slice(0, 3) + "****" + phone.slice(-4)
    : phone;
}
export function preferredPhone(current, previous) {
  const next = normalizePhone(current),
    old = normalizePhone(previous);
  if (
    /^1\d{10}$/.test(old) &&
    /[*•xX]/.test(next) &&
    old.startsWith(next.slice(0, 3)) &&
    old.endsWith(next.slice(-4))
  )
    return old;
  return next || old;
}
export function accountSignal(url, root) {
  if (!root || typeof root !== "object") return null;
  const data = root.data ?? root;
  const code = Number(data.error_code ?? root.code ?? root.status_code ?? 0);
  if (code || ["fail", "error"].includes(root.message)) return null;
  if (/(?:logout|sign_out)/i.test(url)) return { loggedIn: false };
  const user = data.user_info ?? data.userInfo ?? data.user ?? data;
  const phone = normalizePhone(
    user.mobile ??
      user.phone ??
      user.mobile_phone ??
      user.phone_number ??
      user.mobilePhone ??
      user.mobile_mask ??
      "",
  );
  const userId = String(user.user_id_str ?? user.user_id ?? user.uid ?? "");
  const login =
    /\/(?:[^/]*login|login)[^/]*(?:\/|\?|$)/i.test(url) &&
    !/(?:send_code|send_sms)/i.test(url);
  if (
    !phone &&
    !/^[1-9]\d{0,29}$/.test(userId) &&
    !(login && root.message === "success")
  )
    return null;
  return {
    loggedIn: true,
    phone,
    userId: /^[1-9]\d{0,29}$/.test(userId) ? userId : "",
    loginSucceeded: login,
  };
}
