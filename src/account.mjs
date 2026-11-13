// 账号页仅展示官网状态，插件不提供登录表单和验证码接口。
import { rpc } from "./rpc.mjs";
const status = document.querySelector("#status");
async function refresh(sync = false) {
  status.textContent = "正在读取官网状态…";
  try {
    const profile = await rpc(sync ? "SyncWebsiteSession" : "GetProfile");
    document.querySelector("#signed").hidden = !profile;
    if (profile) {
      document.querySelector("#nickname").textContent = profile.nickname;
      document.querySelector("#phone").textContent =
        profile.phone || "官网暂未提供手机号";
      document.querySelector("#availability").textContent = profile.libraryReady
        ? "手机片单会话已连接"
        : "官网账号已关联，手机片单会话暂不可用";
    }
    status.textContent = profile ? "" : "请在官网右上角登录，成功后自动关联";
  } catch (error) {
    status.textContent = error.message;
  }
}
document.querySelector("#website").onclick = () =>
  rpc("OpenWebsiteLogin").catch((error) => {
    status.textContent = error.message;
  });
document.querySelector("#refresh").onclick = () => refresh(true);
refresh();
