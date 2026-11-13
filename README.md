# 红果TV · 网页增强插件

为 [红果短剧官网](https://hongguoduanju.com/) 提供 Chrome、Edge 网页增强，沿用官网原页面、原播放器和原控制栏。

[下载插件](https://github.com/ILikeVideo/HongGuoTV-Web/releases) · [图文安装教程](https://hongguotv.curatedlifefinds.com/web-extension/install/) · [功能介绍](https://hongguotv.curatedlifefinds.com/web-extension/) · [红果TV官网](https://hongguotv.curatedlifefinds.com/)

**当前发布：0.2.3 开发预览。** Chrome 已完成真实播放回归；Edge 样本第 6、7 集真实播放通过，但部分视频地址存在间歇超时／加载失败，整体播放回归尚未全部通过。不能将绿色解锁图标理解为所有片源均保证可播。完整证据和未覆盖项见 [VALIDATION.md](VALIDATION.md)。

## 功能

- 推荐页和正剧页提供完整选集入口，保持官网原视频、控制栏和页面布局。
- “榜单”右侧增加“我的”：历史、收藏、点赞、预约；预约分已上线、待上线，支持分页与已有云端进度续播。
- 使用官网登录，不提供独立登录表单；片单仅读取，不主动写回收藏、点赞、预约或历史。
- 提供红果TV官网入口与二维码，方便在电视上观看。
- 兼容的业务与取流算法通过后台签名配置更新；外壳、权限或底层官网适配变更仍需更新 ZIP。

## 安装

支持**电脑 Chrome / Edge 138+**。无需开启“允许用户脚本”，暂未上架 Chrome Web Store 或 Edge Add-ons。手机浏览器、Safari、Firefox 不在本版支持范围。

1. 在 [Releases](https://github.com/ILikeVideo/HongGuoTV-Web/releases) 的 Assets 下载 `hongguo-web-0.2.3.zip`，解压到固定目录。不要下载 GitHub 自动生成的 Source code 作为安装包。
2. 复制下表地址到对应浏览器的**地址栏**，按回车。
3. 开启开发者模式，点击加载按钮，选择**直接包含 `manifest.json`** 的解压目录。
4. 确认插件已启用，刷新红果官网；顶部“榜单”右侧、“下载”左侧出现“我的”。

| 浏览器 | 扩展管理页地址 | 开关位置 | 加载入口 |
| --- | --- | --- | --- |
| Google Chrome | `chrome://extensions/` | 右上角“开发者模式” | 左上角“加载已解压的扩展程序” |
| Microsoft Edge | `edge://extensions/` | 左下角“开发人员模式” | 上方“加载解压缩的扩展” |

内部地址不能从普通网页直接打开，请复制到地址栏；不要粘贴到搜索框。组织管理的浏览器可能禁止加载，请联系管理员。

![Chrome：1 开发者模式，2 加载目录，3 重新加载](docs/images/chrome-install.png)

![Edge：1 开发人员模式，2 加载目录，3 重新加载](docs/images/edge-install.png)

截图为 Chrome 157、Edge 155 中文管理页的真实截图，橙框是操作标注。浏览器版本不同，菜单名称和位置可能变化。

[Chrome 官方下载](https://www.google.com/chrome/) · [Chrome 官方安装说明](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) · [Edge 官方下载](https://www.microsoft.com/edge/download) · [Edge 官方安装说明](https://learn.microsoft.com/microsoft-edge/extensions/getting-started/extension-sideloading)

## 更新、隐私和问题排查

ZIP 更新：关闭红果官网标签页，把新版本文件完整替换到**原固定目录**，在扩展管理页点“重新加载”，然后重新打开官网。无需卸载；卸载会删除本机插件资料。不要移动或删除加载目录，也不要同时启用多个版本。

兼容的业务与算法会检查后台更新，经签名与摘要验证后启用；断网使用最后确认版本或内置版本。ZIP 本身仍需手动更新。

账号登录、验证码、退出与换号均在官网完成。关联资料与会话保存在本机扩展存储，不云同步、不上传红果TV后台；官网退出后清除当前关联。请勿在反馈中提交手机号、验证码、Cookie、密钥或完整播放地址。

- **缺少 manifest.json：**先解压，再选择直接包含该文件的目录，不能选择 ZIP 或父目录。
- **官网没有“我的”：**确认插件已启用、允许访问官网，重新加载后刷新标签页。
- **选集后无法播放：**可能是地址超时、接口拒绝、下架或格式兼容问题。请反馈剧名、集数、浏览器版本与错误提示；当前 Edge 偶发加载失败仍在观察。
- **卸载：**扩展管理页 → 红果网页增强 → 移除，不会删除官网账号或云端片单。

## 源码与版本管理

本仓库 `extension/` 是与 Release ZIP 对应的可加载目录；也可独立构建：

```sh
npm ci
npm run build
npm test
```

构建后加载 `dist/`。`src/` 为官网与业务模块，`shell/` 为固定宿主、验签、缓存和消息边界，`algorithms/` 为公开算法与信任公钥，`vendor/` 保留上游源码与许可证。无需 Android 或后台源码。

安装包由红果TV后台独立管理。正式发布后同步本仓库源码、`extension/`、GitHub Release 和 [红果TV发布频道](https://t.me/HongGuoTVPublish)；开发预览不发正式公告。电视 APK 与插件版本互不影响。

本项目遵循 GPL-3.0-only，依赖许可证随包保留，详见 [NOTICE.md](NOTICE.md)。第三方工具，与红果短剧官方无隶属关系，请在合法授权范围内使用。
