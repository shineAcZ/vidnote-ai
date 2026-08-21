# VidNote AI

把 Bilibili / YouTube 视频字幕整理成可阅读、可检索、可跳转的 Markdown 笔记，并导出为 Obsidian Media Extended 兼容文件。

VidNote AI 是一个本地优先、用户自带 API Key（BYOK）的浏览器扩展。扩展本身不提供或代理 AI 服务；字幕只会在用户主动生成笔记时发送给用户配置的 DeepSeek 或其他 OpenAI-compatible API。

当前版本：`0.1.16`

## 功能亮点

- 自动读取 Bilibili、YouTube 可用字幕，也可导入 SRT / VTT。
- 开始生成前强制重新确认当前视频并读取所选字幕，跨视频或读取失败时拒绝创建 AI 任务。
- YouTube 新版 `exp=xpe` 字幕受保护时，自动改用页面原生文字稿接口，并复用播放器已经生成的有效字幕请求。
- 完整字幕列表、搜索、当前播放位置指示和点击跳转。
- DeepSeek V4 Flash / Pro，支持关闭或开启思考模式。
- 兼容其他 OpenAI-compatible `/chat/completions` 服务。
- 默认整份字幕一次生成，不分段、不合并，速度更快且整体结构更连贯。
- 可为超长视频启用分段并发策略，配置 1–2500 并发并自动处理 429 / 503。
- 详尽笔记、精简总结和可编辑的自定义提示词。
- 检测 `finish_reason="length"` 并自动续写，减少长输出截断。
- 同一视频保存多份笔记，可折叠、复制、导出和删除。
- Markdown 标题目录可在笔记内部跳转，并提供当前位置高亮。
- 支持表格、代码块（含语言标签和复制）、任务列表、引用、链接等常用 Markdown 预览样式。
- 导出 Obsidian Media Extended 兼容时间链接。
- 日间、夜间和跟随系统主题。
- 字幕、任务、笔记和设置保存在浏览器本地。
- 保存 API 设置后自动测试连接，并明确显示“已保存且可用”或“已保存但测试失败”。

## 支持的浏览器

| 浏览器 | 源码目录 | 最低版本 | 侧边栏实现 |
|---|---|---:|---|
| Chrome | [`chromium/`](chromium/) | 116 | Chrome Side Panel |
| Microsoft Edge | [`chromium/`](chromium/) | 基于 Chromium 116 或更高版本 | Edge Side Panel |
| Firefox | [`firefox/`](firefox/) | 140 | Firefox Sidebar |

Chrome 和 Edge 使用完全相同的 Chromium 构建。

## 本地安装

### Chrome

1. 下载并解压 Chromium 版本 ZIP。
2. 在地址栏打开 `chrome://extensions`。
3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择解压后包含 `manifest.json` 的目录。
6. 打开视频页面，点击工具栏中的 VidNote AI 图标。

### Microsoft Edge

1. 下载并解压 Chromium 版本 ZIP。
2. 在地址栏打开 `edge://extensions`。
3. 打开“开发人员模式”。
4. 点击“加载解压缩的扩展”。
5. 选择解压后包含 `manifest.json` 的目录。

### Firefox 测试安装

1. 在地址栏打开 `about:debugging`。
2. 选择“此 Firefox”。
3. 点击“临时载入附加组件”。
4. 选择 `firefox/manifest.json` 或未签名测试 XPI。

临时扩展会在 Firefox 重启后消失。面向普通用户分发时，Firefox XPI 必须经过 Mozilla 签名。

## 第一次使用

1. 打开侧边栏的“设置”。
2. 填写 API 地址、API Key 和模型名称。
3. DeepSeek 默认配置：
   - API 地址：`https://api.deepseek.com`
   - 模型：`deepseek-v4-flash`
   - 思考模式：关闭
   - 最大输出：`384000`
4. 点击“保存设置”，扩展会自动测试连接；也可以之后手动重新测试。
5. 打开带字幕的视频，扩展会按设置自动读取字幕。
6. 在“AI 笔记”选择模板并开始生成。

API Key 只保存在浏览器扩展的本地存储中。请勿把真实 API Key 写进源码、截图、Issue 或提交记录。

## 两种生成策略

### 一次性生成

默认策略。只要完整字幕没有超过模型上下文，就会整份只发送一次，不分段、不并发、不执行最终合并，通常速度更快、章节结构也更连贯。

内置模板：

- 详尽视频笔记
- 精简视频总结

如果 API 返回 `finish_reason="length"`，扩展仍会尝试自动续写；这属于截断恢复，不是最终合并。

### 分段并发

适合超过模型上下文的超长视频。在提示词编辑器中勾选“使用分段生成策略”后，字幕会按照设置的字符数切分，各段并行生成、按原顺序归位，最后由 AI 合并为一份笔记。

内置模板：

- 分段·详尽视频笔记
- 分段·精简视频总结

每完成一个字幕段就会保存进度；遇到 429 / 503 会自动退避并降低实际并发，中断后可以从已完成部分继续。

## 时间戳与 Obsidian

扩展内部时间标记：

```markdown
{{t:4|00:00:04}}
```

导出后：

```markdown
[00:00:04](obsidian://mx-open?url=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBV123&t=4)
```

在 Obsidian 安装并配置 Media Extended 后，可以通过时间链接回到原视频位置。

## 数据保存

- API 设置：浏览器扩展本地存储。
- 字幕、笔记和任务：浏览器 IndexedDB。
- 页面刷新或重新打开侧边栏后，已保存笔记仍然存在。
- 卸载扩展或清除扩展站点数据可能删除本地内容，请先导出重要笔记。
- 不包含云同步、开发者遥测、广告或分析 SDK。

完整说明见 [`PRIVACY.md`](PRIVACY.md)。

## 权限说明

| 权限 | 用途 |
|---|---|
| `activeTab` | 读取用户当前打开的视频页面并执行跳转 |
| `storage` | 保存设置和提示词 |
| `downloads` | 导出 Markdown 文件 |
| `sidePanel`（Chromium） | 显示 Chrome / Edge 侧边栏 |
| `webRequest` | 临时观察当前标签页实际请求过的 YouTube 字幕 URL，以复用带短期令牌的有效字幕地址；不读取响应头或 Cookie，不持久化 |
| Bilibili / YouTube 主机权限 | 获取视频信息和字幕 |
| DeepSeek 主机权限 | 调用用户配置的 DeepSeek API |
| 可选 HTTPS / localhost 权限 | 用户选择其他兼容 API 时按需申请 |

## 项目结构

```text
.
├─ chromium/          Chrome 与 Edge 源码
├─ firefox/           Firefox 源码
├─ docs/              发布说明
├─ PRIVACY.md         隐私政策
└─ README.md
```

两个浏览器目录都包含：

```text
src/
├─ background.js      AI 请求、流式响应与字幕下载
├─ content.js         视频页面与字幕适配
├─ sidepanel.html     侧边栏结构
├─ sidepanel.css      界面样式
├─ sidepanel.js       笔记、任务和交互逻辑
└─ lib/               数据库、提示词、Markdown、设置等模块
```

## 开发与测试

需要 Node.js 18 或更高版本。项目没有生产依赖。

```powershell
cd chromium
npm test
```

Firefox 版本：

```powershell
cd firefox
npm test
```

发布前还应在真实登录环境中分别测试：

- Bilibili 单字幕、多字幕及自动生成字幕。
- YouTube 人工字幕和自动字幕。
- DeepSeek Flash / Pro，思考与非思考模式。
- 一次性生成、分块并发、暂停、继续和 429 退避。
- Chrome、Edge、Firefox 的时间跳转和文件下载。

## 给普通用户分发

最简单的测试方式是在 GitHub Releases 提供 ZIP，由用户解压后通过浏览器开发者模式加载。面向非技术用户，建议分别发布到 Chrome Web Store、Microsoft Edge Add-ons 和 Firefox Add-ons。

详细步骤见 [`docs/STORE_SUBMISSION.md`](docs/STORE_SUBMISSION.md)。

## 已知限制

- Firefox 原生侧边栏的打开状态属于浏览器窗口，而不是单个标签页。
- 网站更新播放器或字幕接口后，字幕适配可能需要更新。
- AI 输出质量、速度、费用和可用性由用户选择的服务商决定。
- 高并发会增加浏览器资源占用和瞬时 Token 消耗。
- 本项目目前没有云同步，换浏览器或换设备不会自动同步笔记。

## 贡献

欢迎通过 [GitHub Issues](https://github.com/shineAcZ/vidnote-ai/issues) 提交可复现的问题。请包含浏览器版本、扩展版本、视频平台、字幕类型、操作步骤和已脱敏的错误信息。不要提交 API Key、Cookie、账号信息或受版权保护的完整字幕。

## 许可证

本项目采用 [MIT License](LICENSE) 开源。
