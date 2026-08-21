# VidNote AI

[English](README.en.md) | **简体中文**

将 Bilibili 和 YouTube 视频字幕整理成结构清晰、能够跳回原视频的 Markdown 笔记。

VidNote AI 是一个本地优先的开源浏览器扩展。它可以读取视频字幕，在侧边栏中展示完整文字稿，并调用用户自行配置的 DeepSeek 或其他 OpenAI-compatible API 生成视频笔记。生成结果可以在浏览器中保存和阅读，也可以导出给 Obsidian 使用。

> 当前项目处于公开测试阶段，尚未上架浏览器扩展商店。安装开发版前，请阅读下方的安装说明和隐私说明。

## 为什么使用 VidNote AI

- 不只生成简短摘要：可以把字幕整理成接近“视频文字版流程”的详尽笔记。
- 保留内容来源：字幕和笔记中的时间戳都可以跳转到视频对应位置。
- 适合长视频：支持整份字幕一次生成，也支持分段并发和中断恢复。
- 提示词可控：内置详尽笔记和精简总结模板，也可以修改或创建自己的模板。
- 本地优先：字幕、任务、设置和笔记默认保存在当前浏览器中。
- 自带 API Key：扩展不提供 AI 代理服务，用户可以自行选择模型和服务商。

## 主要功能

### 字幕读取

- 自动读取 Bilibili 和 YouTube 页面提供的字幕。
- 支持在多个字幕轨之间选择。
- 支持导入本地 SRT、VTT 文件。
- 完整字幕列表、关键词搜索和当前位置标记。
- 点击任意字幕时间可跳转到视频对应位置。
- 生成笔记前重新读取当前页面和所选字幕，减少跨视频生成错误。

### AI 笔记

- 支持 DeepSeek，并兼容 OpenAI-style `/chat/completions` 接口。
- DeepSeek 思考模式可以单独开启或关闭。
- 支持流式输出、运行时间、当前阶段和分段任务状态显示。
- 支持一次性生成和分段并发两种策略。
- 遇到输出长度限制时自动尝试续写。
- 遇到 429、503 或临时网络错误时自动重试和退避。
- 支持暂停、恢复及保存已完成的分段进度。

### 阅读、保存和导出

- 同一视频可以保存多份笔记，并可折叠、复制、导出或删除。
- 支持标题导航和笔记内部跳转。
- 支持标题、列表、表格、引用、任务列表、链接和代码块等常用 Markdown 样式。
- 代码块支持语言标签和复制。
- 支持日间、夜间和跟随系统主题。
- 导出 Obsidian Media Extended 兼容的时间戳链接。

## 支持的平台

| 浏览器 | 状态 | 源码目录 |
|---|---|---|
| Google Chrome | 支持，开发版安装 | [`chromium/`](chromium/) |
| Microsoft Edge | 支持，开发版安装 | [`chromium/`](chromium/) |
| Firefox Desktop 140+ | 支持，临时安装或 Mozilla 签名版 | [`firefox/`](firefox/) |

Chrome 和 Edge 共用 Chromium 版本。Firefox 使用单独的清单和原生侧边栏实现。

## 安装开发版

可以从 [GitHub Releases](https://github.com/shineAcZ/vidnote-ai/releases) 下载发布包；如果暂时没有 Release，也可以克隆仓库后直接加载相应源码目录。

### Chrome

1. 下载并解压 Chromium 版本，或克隆本仓库。
2. 打开 `chrome://extensions`。
3. 开启右上角的“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择解压后包含 `manifest.json` 的目录；从源码安装时选择 `chromium/`。
6. 打开受支持的视频页面，点击工具栏中的 VidNote AI 图标。

### Microsoft Edge

1. 下载并解压 Chromium 版本，或克隆本仓库。
2. 打开 `edge://extensions`。
3. 开启“开发人员模式”。
4. 点击“加载解压缩的扩展”。
5. 选择解压后包含 `manifest.json` 的目录；从源码安装时选择 `chromium/`。

### Firefox

开发测试时：

1. 打开 `about:debugging`。
2. 选择“此 Firefox”。
3. 点击“临时载入附加组件”。
4. 选择 `firefox/manifest.json`。

临时扩展会在 Firefox 重启后消失。普通 Firefox 用户需要安装经过 Mozilla 签名的 XPI；文件名中带有 `unsigned` 的 XPI 不是正式安装包。

## 快速开始

1. 打开 VidNote AI 侧边栏，进入“设置”。
2. 选择 AI 服务商，填写 API 地址、API Key 和模型名称。
3. 点击“保存设置”。扩展会保存配置并自动测试连接。
4. 打开一个带字幕的 Bilibili 或 YouTube 视频。
5. 在“完整字幕”中确认字幕语言和内容是否正确。
6. 进入“AI 笔记”，选择提示词模板并开始生成。
7. 生成完成后，可以阅读、复制或导出 Markdown。

建议为扩展创建单独的 API Key，并在服务商控制台设置预算或用量限制。使用第三方 AI API 可能产生费用。

## AI 服务兼容性

默认支持 DeepSeek，也可以配置其他提供 OpenAI-compatible Chat Completions 接口的服务。

DeepSeek 的常见 API 地址：

```text
https://api.deepseek.com
```

自定义服务通常需要填写：

- API 地址。
- API Key。
- 模型名称。
- 最大输出长度、温度等生成参数。

不同服务商支持的上下文长度、输出上限、并发限制和思考模式参数可能不同，请以对应服务商的文档为准。

## 两种生成策略

### 一次性生成

默认策略。只要完整字幕没有超过模型的上下文限制，扩展就会把整份字幕交给一次生成任务。

适合：

- 短视频和中等长度视频。
- 希望笔记整体结构更连贯的场景。
- 上下文和最大输出能力较大的模型。

### 分段并发

在提示词设置中启用“使用分段生成策略”后，扩展会切分字幕、并行整理各段，再按原顺序合并成最终笔记。

适合：

- 超长视频。
- 模型上下文不足。
- 希望通过并发缩短等待时间。

并发越高不一定越快，还会增加瞬时 Token 消耗和触发服务商限流的概率。遇到限流时，扩展会自动降低实际请求速度并重试。

## 时间戳与 Obsidian

扩展会在生成过程中使用统一的内部时间标记：

```markdown
{{t:4|00:00:04}}
```

导出时会转换成 Obsidian Media Extended 链接，例如：

```markdown
[00:00:04](obsidian://mx-open?url=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBV123&t=4)
```

在 Obsidian 中安装并配置 Media Extended 后，点击时间戳即可从原视频的对应位置打开。

## 数据与隐私

VidNote AI 不运营 AI 中转服务器，也不包含广告、遥测或第三方分析 SDK。

```text
视频页面 ──读取字幕──> 浏览器本地存储
                           │
                  用户主动点击生成
                           │
                           ▼
                    用户选择的 AI API
                           │
                           ▼
                  本地笔记 ──> Markdown 导出
```

- API 配置保存在浏览器扩展的本地存储中。
- 字幕、任务和笔记保存在浏览器本地 IndexedDB 中。
- 只有在测试连接或主动生成笔记时，必要数据才会发送给用户选择的 AI 服务商。
- 页面刷新或重新打开侧边栏后，本地保存的笔记通常仍然存在。
- 卸载扩展或清除扩展数据可能删除本地内容，请提前导出重要笔记。
- 不要在 Issue、截图或提交记录中公开 API Key、Cookie、完整字幕或其他敏感内容。

完整说明请阅读 [隐私政策](PRIVACY.md)。

## 权限用途

<details>
<summary>查看扩展权限说明</summary>

| 权限 | 用途 |
|---|---|
| `activeTab` | 识别当前视频标签页并执行用户触发的交互 |
| `storage` | 保存设置和提示词 |
| `downloads` | 导出 Markdown 文件 |
| `sidePanel`（Chromium） | 在 Chrome 和 Edge 侧边栏显示界面 |
| `webRequest` | 临时识别播放器实际请求的 YouTube 字幕 URL；不修改请求，不读取 Cookie |
| Bilibili / YouTube 主机权限 | 读取视频信息、字幕并进行时间跳转 |
| DeepSeek 主机权限 | 调用用户配置的 DeepSeek API |
| 可选 HTTPS / localhost 权限 | 用户配置其他兼容 API 时按需申请 |

</details>

## 已知限制

- 视频网站可能修改播放器或字幕接口，字幕适配也可能需要随之更新。
- YouTube 某些字幕受到短期令牌、登录状态或地区策略影响，读取结果可能不稳定。
- Firefox 原生侧边栏的打开状态属于浏览器窗口，不完全等同于单个标签页状态。
- AI 输出质量、速度、费用和可用性由用户选择的模型及服务商决定。
- 当前没有云同步；更换浏览器、浏览器配置或设备不会自动同步笔记。

如果遇到问题，请先确认视频播放器本身能够显示字幕，再通过 [GitHub Issues](https://github.com/shineAcZ/vidnote-ai/issues) 提交可复现的问题。

## 开发

项目没有生产依赖，测试需要 Node.js 18 或更高版本。

```bash
git clone git@github.com:shineAcZ/vidnote-ai.git
cd vidnote-ai
```

运行 Chromium smoke test：

```bash
cd chromium
npm test
```

运行 Firefox smoke test：

```bash
cd firefox
npm test
```

项目结构：

```text
.
├─ chromium/          Chrome 与 Edge 扩展
├─ firefox/           Firefox 扩展
├─ docs/              维护和发布文档
├─ PRIVACY.md         隐私政策
├─ LICENSE            MIT License
├─ README.en.md       英文说明
└─ README.md          简体中文说明
```

扩展商店打包、审核和发布说明见 [`docs/STORE_SUBMISSION.md`](docs/STORE_SUBMISSION.md)。

## 贡献与反馈

欢迎提交 Bug 报告、兼容性反馈、文档改进和功能建议。

提交问题时，请尽量包含：

- 浏览器名称和版本。
- VidNote AI 版本。
- 视频平台和字幕类型。
- 可公开访问的测试视频链接。
- 清晰的复现步骤。
- 已脱敏的错误信息和截图。

请勿提交 API Key、Cookie、账号凭据或受版权保护的完整字幕。使用本项目处理视频内容时，也请遵守视频平台规则和适用的版权要求。

## 项目声明

VidNote AI 是独立的开源项目，与 Bilibili、YouTube、Google、Microsoft、Mozilla、DeepSeek、OpenAI、Obsidian 或 Media Extended 的开发者和运营方不存在官方隶属或背书关系。相关名称和商标归各自权利人所有。

## 许可证

本项目采用 [MIT License](LICENSE) 开源。
