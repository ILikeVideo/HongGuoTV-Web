import { chromium } from "playwright";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";

export async function launch(root) {
  await mkdir(path.join(root, "test-results"), { recursive: true });
  const profile = process.env.HG_TEST_PROFILE
    ? path.resolve(process.env.HG_TEST_PROFILE)
    : await mkdtemp(path.join(root, "test-results/profile-"));
  if (!profile.startsWith(path.join(root, "test-results", "profile-")))
    throw new Error("仅允许使用本工程独立测试配置");
  const channel = process.env.HG_TEST_CHANNEL || "chrome";
  const extensionPath = path.join(root, "dist");
  const base = {
    headless: process.env.HG_HEADED !== "1",
    viewport: { width: 1440, height: 1000 },
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  };
  let context, extensionId;
  if (channel === "chromium") {
    context = await chromium.launchPersistentContext(profile, {
      ...base,
      executablePath:
        process.env.HG_TEST_BROWSER ||
        chromium.executablePath(),
      args: [
        ...base.args,
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker", { timeout: 15000 }));
    extensionId = new URL(worker.url()).hostname;
  } else {
    context = await chromium.launchPersistentContext(profile, {
      ...base,
      channel: channel === "edge" ? "msedge" : "chrome",
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [...base.args, "--enable-unsafe-extension-debugging"],
    });
    const client = await context.browser().newBrowserCDPSession();
    const installed = await client.send("Extensions.loadUnpacked", {
      path: extensionPath,
    });
    extensionId = installed.id;
    if(process.env.HG_TEST_PROFILE){
      // 使用扩展管理页的标准重新加载操作，保留官网 Cookie 与扩展本机存储。
      const manager=await context.newPage();await manager.goto('chrome://extensions/');
      const toggle=manager.locator('extensions-toolbar #devMode');
      if(!await toggle.evaluate(node=>node.checked))await toggle.click();
      await manager.locator(`extensions-item#${extensionId} #dev-reload-button`).click();
      await manager.waitForTimeout(300);await manager.close();
    }
  }
  const manager=await context.newPage();await manager.goto('chrome://extensions/?id='+extensionId);
  const info=await manager.evaluate(id=>new Promise(resolve=>chrome.developerPrivate.getExtensionInfo(id,resolve)),extensionId);
  if(info.userScriptsAccess?.isEnabled)await manager.evaluate(id=>new Promise((resolve,reject)=>chrome.developerPrivate.updateExtensionConfiguration({extensionId:id,userScriptsAccess:false},()=>chrome.runtime.lastError?reject(Error(chrome.runtime.lastError.message)):resolve())),extensionId);
  const current=await manager.evaluate(id=>new Promise(resolve=>chrome.developerPrivate.getExtensionInfo(id,resolve)),extensionId);
  if(current.userScriptsAccess?.isEnabled)throw Error('测试要求关闭用户脚本权限');
  await manager.close();
  return { context, extensionId, channel, profile, userScriptsDisabled:!current.userScriptsAccess?.isEnabled };
}
