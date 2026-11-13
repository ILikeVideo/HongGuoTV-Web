# 开源声明

本插件遵循 GPL-3.0-only。签名及地址解密在构建时复用本仓库
`server/vendor/hongguo.cjs`，来源 drpys 提交
`22261adfa31435e3b3ef5a730b8a2a75bcaf1715`。新媒体索引实现依据本项目 Kotlin
`MediaCrypto.kt`，保留 AVC/HEVC 原始编码和加密子样本语义。

播放算法复用本项目 Android 动态算法包，协议来源与归属见仓库 `kotlin-tv/NOTICE.md`。浏览器适配不分发 Android JNI 二进制。

依赖的 Buffer、CryptoJS、fflate、MP4Box.js 和 qrcode-generator 保留各自许可证。qrcode-generator 的版权属于 Kazuhiko Arase，采用 MIT 许可证；完整文本随包放在 `licenses/qrcode-generator.txt`。
扩展属于第三方网页工具。
