# 发布与分发指南

## 1. GitHub 测试分发

适合早期测试用户：

1. 创建公开或私有 GitHub 仓库。
2. 上传本项目源码，但不要上传 API Key、测试账号、Cookie 或个人字幕。
3. 创建与清单版本一致的 Release，例如 `v0.1.18`。
4. 上传 Chromium 通用 ZIP 和经过 Mozilla 签名的 Firefox XPI；审核前也可附带 Firefox 源 ZIP。
5. 在 Release Notes 中写明版本、安装方法、已知限制和 SHA-256。

Chrome/Edge 用户必须先解压 ZIP，然后在开发者模式中“加载已解压的扩展”。普通 Chrome/Edge 默认不会把 GitHub ZIP 当作商店扩展永久安装。

Firefox 正式版通常不能永久安装未签名 XPI；即使选择站外分发，也需要 Mozilla 签名。

## 2. Chrome Web Store

1. 注册 Chrome Web Store 开发者账号并完成一次性注册费用。
2. 压缩 `chromium/` 目录中的内容，确保 `manifest.json` 位于 ZIP 根目录。
3. 在开发者控制台创建新项目并上传 ZIP。
4. 填写名称、简短说明、详细说明、分类、语言、支持邮箱和隐私政策 URL。
5. 上传商店图标和真实功能截图。
6. 准确声明字幕、视频网址和 API Key 的处理方式。
7. 解释所有权限用途，并提交审核。

官方文档：https://developer.chrome.com/docs/webstore/

## 3. Microsoft Edge Add-ons

1. 注册 Microsoft Partner Center / Edge 扩展开发者账号。
2. 使用与 Chrome 相同的 Chromium ZIP。
3. 创建新扩展、上传 ZIP并完成可用地区、属性、商店列表和隐私声明。
4. 提供测试说明，说明 AI 功能由用户自带 API Key。
5. 提交认证。

官方文档：https://learn.microsoft.com/microsoft-edge/extensions/publish/publish-extension

## 4. Firefox Add-ons

有两种方式：

- Listed：发布在 addons.mozilla.org，用户可以搜索、安装并自动更新。
- Unlisted：不公开展示，但仍提交 Mozilla 签名，然后由你自行分发签名 XPI。

无论哪种方式，面向 Firefox 正式版用户的 XPI 都需要 Mozilla 签名。上传前确认 `browser_specific_settings.gecko.id` 保持稳定，后续版本号必须递增。

官方入口：https://addons.mozilla.org/developers/

## 5. 商店素材清单

- 128×128 主图标及浏览器所需的小尺寸图标。
- 清晰展示字幕、并行进度、笔记和设置页面的截图。
- 一段简短说明和一段详细功能介绍。
- 隐私政策公开 URL。
- 支持邮箱或 Issue 地址。
- 权限用途说明。
- 测试步骤和已知限制。
- 版本更新说明。

## 6. 发布前安全检查

- 搜索仓库中是否包含 `sk-`、Bearer Token、邮箱、Cookie 或本地绝对路径。
- 确认 ZIP 根目录直接包含 `manifest.json`。
- 分别运行 `chromium/` 和 `firefox/` 中的 `npm test`。
- 检查 Manifest JSON 能被解析。
- 在干净浏览器配置中实际安装和测试。
- 确认隐私政策与商店数据披露一致。
- 为公开源码选择并添加许可证。
