# VidNote AI Chromium 版

适用于 Google Chrome 116+ 与基于相同 Chromium 能力的 Microsoft Edge。当前版本：`0.1.17`。

完整功能、隐私和发布说明请查看 GitHub 仓库根目录 README。本目录是可直接加载和打包的 Chromium Manifest V3 扩展源码。

## 本地安装

Chrome：

1. 打开 `chrome://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录。

Edge：

1. 打开 `edge://extensions`。
2. 开启“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择本目录。

## 第一次使用

1. 打开 Bilibili 或 YouTube 视频。
2. 点击工具栏中的 VidNote AI 图标打开侧边栏。
3. 在“设置”中填写 DeepSeek 或其他 OpenAI-compatible API。
4. 测试连接，读取字幕并生成笔记。

YouTube 使用带 `exp=xpe` 的新版受保护字幕地址时，本版本会自动改用页面原生文字稿接口，并回退复用播放器实际加载的有效字幕请求。

0.1.12 增加笔记内容导航跳转和标题定位高亮，并完善代码块复制、任务列表、引用、链接、强调等常用 Markdown 预览样式。

0.1.13 在每次开始生成前重新确认当前视频并重读所选字幕，拒绝跨视频或无效字幕结果；API 设置保存后会自动测试连接并显示结果。

0.1.14 修复默认高级数值触发浏览器表单校验、导致“保存设置”无反应的问题，并改用带明确错误提示的插件内校验。

0.1.15 默认使用整份字幕一次生成；提示词编辑器可主动开启分段策略，内置模板按“两个一次生成、两个分段生成”的顺序排列。

0.1.16 提前捕获播放器成功返回的 YouTube 字幕正文，并通过临时网络观察复用带短期令牌的实际字幕 URL，提高字幕读取稳定性。

0.1.17 启用新的电视与 AI 电路项目图标，并同步更新中英文公开项目文档。

请勿把真实 API Key 写进源码或提交到 GitHub。

## 测试

```powershell
npm test
```

## 打包

将本目录中的 `manifest.json`、`src/`、`assets/`、`tests/`、`package.json` 和 README 直接压缩，确保 `manifest.json` 位于 ZIP 根目录。该 ZIP 可同时提交 Chrome Web Store 和 Microsoft Edge Add-ons。
