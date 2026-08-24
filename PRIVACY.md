---
title: VidNote AI 隐私政策 / Privacy Policy
description: Privacy Policy for the VidNote AI browser extension
permalink: /privacy/
---

# VidNote AI 隐私政策 / Privacy Policy

生效日期及最后更新：2026 年 8 月 24 日
Effective and last updated: August 24, 2026

[简体中文](#简体中文) · [English](#english)

## 简体中文

### 1. 适用范围

本隐私政策适用于 VidNote AI 的 Microsoft Edge、Google Chrome、Chromium 和 Mozilla Firefox 浏览器扩展版本（以下简称“本扩展”）。本扩展用于读取受支持视频页面的字幕、显示可搜索且带时间戳的完整字幕，并通过用户自行选择和配置的 AI 服务生成 Markdown 视频笔记。

本扩展采用本地优先设计。维护者不运营接收用户 API Key、字幕、视频信息、提示词或生成笔记的中转服务器，也不在扩展中使用广告、遥测或第三方分析服务。

### 2. 本扩展访问和处理的数据

#### 2.1 API 配置与认证信息

用户可以填写 AI 服务商、API 地址、API Key、模型名称和生成参数。这些配置保存在当前浏览器的扩展本地存储中。API Key 不会发送给 VidNote AI 维护者；只有当用户主动保存并测试接口或开始生成笔记时，API Key 才会作为认证信息直接发送给用户选择的 AI 服务商。

本扩展不会额外加密浏览器本地存储中的 API Key。建议用户为本扩展创建独立密钥，并在 AI 服务商控制台设置预算和用量限制。

#### 2.2 视频页面、网址与字幕

在 Bilibili 和 YouTube 等受支持的视频页面上，本扩展会访问当前视频的标题、网址、时长、字幕轨以及用户选择的字幕内容。这些信息仅用于显示字幕、按时间戳跳转、关联本地笔记和执行用户主动发起的 AI 生成功能。本扩展不读取完整浏览历史。

用户也可以主动导入本地 SRT 或 VTT 字幕文件。导入内容默认只保存在浏览器本地，除非用户随后使用该内容发起 AI 生成。

#### 2.3 提示词、生成任务与笔记

用户选择或编写的提示词、字幕缓存、生成任务、部分进度和生成笔记会保存在浏览器本地。设置和提示词使用扩展本地存储；字幕、任务和笔记使用本地 IndexedDB。本扩展不会自动将这些内容同步到维护者或其他设备。

#### 2.4 临时 YouTube 字幕请求信息

为兼容 YouTube 带短期访问令牌的字幕接口，本扩展会在浏览器运行期间观察 YouTube 字幕接口的请求 URL，以复用播放器已经成功使用的字幕地址。每个标签页最多在扩展后台内存中临时保存最近 40 条相关 URL，标签页关闭或浏览器退出后即消失。

该功能不修改网络请求，不读取 Cookie，不读取请求头或账号凭据，不保存响应正文，也不观察与 YouTube 字幕无关的一般网络流量。这些临时 URL 不会发送给 VidNote AI 维护者。

### 3. 数据如何发送给第三方 AI 服务

只有在用户主动测试 AI 连接或开始生成笔记时，本扩展才会直接向用户配置的 AI 服务发送请求。根据具体操作，请求可能包含：

- API Key、API 地址和模型名称；
- 视频标题；
- 用户选择或导入的字幕内容及时间信息；
- 用户选择或自定义的提示词；
- 用户设置的生成参数。

默认可使用 DeepSeek，用户也可以配置其他 OpenAI-compatible 服务。本扩展不通过维护者服务器转发请求。第三方 AI 服务如何记录、保留、使用或跨境处理请求数据，由该服务自身的服务条款和隐私政策决定。用户应在配置服务前阅读对应政策。

如字幕或提示词包含第三人的个人信息，用户应确保自己有权将其提交给所选 AI 服务。

### 4. 数据用途与禁止用途

上述数据仅用于提供字幕读取、字幕搜索、视频时间跳转、AI 笔记生成、任务恢复、本地笔记管理和 Markdown 导出等用户可见功能。

VidNote AI 维护者不会：

- 出售、出租或进行数据经纪；
- 将数据用于广告、跨网站追踪、用户画像或营销；
- 将数据用于信用评估、借贷、保险、就业或其他资格判断；
- 使用遥测或第三方分析 SDK 收集使用情况；
- 未经用户主动操作将字幕或笔记上传到第三方。

### 5. 权限用途

- 视频网站访问权限：识别当前视频、读取字幕并响应时间戳跳转。
- AI 服务地址权限：执行用户主动发起的接口测试和笔记生成；自定义服务地址会按需请求权限。
- 本地存储权限：保存 API 配置、提示词、界面设置、字幕、任务和笔记。
- 下载权限：在用户点击导出后保存 Markdown 文件。
- 侧边栏权限：在浏览器侧边栏显示本扩展界面。
- 网络请求观察权限：仅观察 YouTube 字幕请求 URL，不修改请求或读取 Cookie、请求头。

### 6. 数据保留、控制与删除

- 本地设置、字幕、任务和笔记会一直保留，直到用户在扩展内删除、清除浏览器扩展数据或卸载扩展。
- 用户可以删除单份笔记及相关任务，并可停止正在执行的生成任务。
- 用户可以删除 API Key、改用其他服务商，或不再发起 AI 请求，从而停止向原服务商发送后续数据。
- 用户可以通过 Microsoft Edge 或其他浏览器的扩展数据管理功能清除全部本地数据。
- 卸载扩展通常会删除本地扩展数据，具体行为由浏览器决定。操作前请导出需要保留的 Markdown 笔记。
- 已经发送给第三方 AI 服务的数据应按照该服务商提供的机制查询或删除；VidNote AI 维护者无法访问或代为删除这些数据。

### 7. 数据安全

本扩展默认使用 HTTPS 连接外部 AI 服务；只有用户主动配置本机 `localhost` 或 `127.0.0.1` 服务时才允许本地 HTTP 地址。请勿使用来源不明的安装包或 API 地址，也不要在 GitHub Issues、截图或其他公开位置提交 API Key、Cookie、账号信息或完整字幕。

如果怀疑 API Key 泄露，请立即在对应 AI 服务商控制台撤销该密钥并创建新密钥。

### 8. 儿童隐私

本扩展不以儿童为目标，也不会主动要求用户提供年龄信息或故意收集儿童个人信息。用户处理视频字幕时仍应遵守当地适用法律以及视频平台的规则。

### 9. 政策变更

如果未来加入云同步、维护者服务器、账号系统、遥测、广告或其他新的数据处理方式，本政策和扩展商店的数据披露会在相关版本发布前更新。页面顶部的更新日期会同步修改。

### 10. 联系方式

隐私或数据处理问题请发送邮件至 [1223030128@qq.com](mailto:1223030128@qq.com)，或通过 [GitHub Issues](https://github.com/shineAcZ/vidnote-ai/issues) 联系 VidNote AI 维护者。公开提交 Issue 时，请勿附带 API Key、Cookie、账号信息、完整字幕或其他敏感信息。

---

## English

### 1. Scope

This Privacy Policy applies to the Microsoft Edge, Google Chrome, Chromium, and Mozilla Firefox versions of VidNote AI (the “Extension”). The Extension reads subtitles from supported video pages, displays searchable timestamped transcripts, and generates Markdown video notes through an AI service selected and configured by the user.

VidNote AI is local-first. The maintainer does not operate an intermediary server that receives users' API keys, subtitles, video information, prompts, or generated notes. The Extension contains no advertising, telemetry, or third-party analytics service.

### 2. Data accessed and processed

#### 2.1 API configuration and authentication information

Users may provide an AI provider, API endpoint, API key, model name, and generation settings. These settings are stored in the current browser's local extension storage. The API key is not sent to the VidNote AI maintainer. It is sent directly to the AI provider selected by the user only when the user saves and tests the connection or starts note generation.

The API key is not additionally encrypted within browser local extension storage. Users should create a dedicated key and configure budget or usage limits with their AI provider.

#### 2.2 Video pages, URLs, and transcripts

On supported Bilibili and YouTube pages, the Extension accesses the current video's title, URL, duration, available subtitle tracks, and the subtitle content selected by the user. This information is used only to display and search transcripts, seek to timestamps, associate locally stored notes with the video, and perform user-initiated AI generation. The Extension does not read the user's complete browsing history.

Users may also import local SRT or VTT files. Imported content remains local unless the user later initiates AI generation with that content.

#### 2.3 Prompts, jobs, and notes

User-selected or custom prompts, transcript caches, generation jobs, partial progress, and generated notes are stored locally in the browser. Settings and prompts use extension local storage; transcripts, jobs, and notes use local IndexedDB. The Extension does not automatically synchronize this content with the maintainer or another device.

#### 2.4 Temporary YouTube subtitle request information

To support YouTube subtitle URLs containing short-lived tokens, the Extension observes request URLs for YouTube subtitle endpoints and may reuse a subtitle URL already used successfully by the player. At most 40 recent relevant URLs per tab are retained temporarily in extension background memory and disappear when the tab or browser is closed.

This feature does not modify requests, read cookies, inspect request headers or account credentials, store response bodies, or observe general network traffic unrelated to YouTube subtitles. These temporary URLs are not sent to the VidNote AI maintainer.

### 3. Data sent to third-party AI services

The Extension sends a request directly to the AI service configured by the user only when the user explicitly tests the connection or starts note generation. Depending on the action, the request may contain:

- the API key, API endpoint, and model name;
- the video title;
- selected or imported subtitle text and timestamps;
- selected or custom prompts; and
- generation parameters selected by the user.

DeepSeek is available as a default option, and users may configure another OpenAI-compatible service. Requests do not pass through a server operated by the maintainer. Each AI provider's own terms and privacy policy govern how that provider logs, retains, uses, or internationally processes request data. Users should review the selected provider's policy before configuration.

If a transcript or prompt contains another person's personal information, the user is responsible for ensuring that they have the right to submit it to the selected AI service.

### 4. Purposes and prohibited uses

Data is processed only to provide user-facing transcript reading, transcript search, timestamp navigation, AI note generation, task recovery, local note management, and Markdown export.

The VidNote AI maintainer does not:

- sell, rent, or broker user data;
- use data for advertising, cross-site tracking, profiling, or marketing;
- use data for credit, lending, insurance, employment, or other eligibility decisions;
- collect usage data through telemetry or third-party analytics SDKs; or
- upload transcripts or notes without an explicit user action.

### 5. Permission purposes

- Video website access identifies the current video, reads available subtitles, and handles timestamp seeking.
- AI service host access performs user-initiated connection tests and note generation. Access to a custom endpoint is requested only when needed.
- Local storage saves API configuration, prompts, interface settings, transcripts, jobs, and notes.
- Download access saves a Markdown file only after the user requests an export.
- Side-panel access displays the Extension interface.
- Network request observation is limited to YouTube subtitle request URLs and does not modify requests or inspect cookies or headers.

### 6. Retention, controls, and deletion

- Local settings, transcripts, jobs, and notes remain until the user deletes them, clears extension data, or uninstalls the Extension.
- Users can delete individual notes and related jobs and can stop a generation task in progress.
- Users can remove their API key, select another provider, or stop initiating AI requests to prevent future transmission to the previous provider.
- Users can clear all local data through Microsoft Edge or the applicable browser's extension data controls.
- Uninstalling the Extension normally removes local extension data, subject to browser behavior. Important Markdown notes should be exported first.
- Data already sent to an AI provider is subject to that provider's access and deletion mechanisms. The VidNote AI maintainer cannot access or delete that data on the user's behalf.

### 7. Security

The Extension uses HTTPS for external AI services by default. Local HTTP is allowed only when the user explicitly configures a service at `localhost` or `127.0.0.1`. Users should not install untrusted packages or configure untrusted API endpoints, and should never post API keys, cookies, account information, or full transcripts in public issues or screenshots.

If an API key may have been exposed, revoke it immediately in the provider's console and create a new key.

### 8. Children's privacy

The Extension is not directed to children and does not request age information or intentionally collect children's personal information. Users remain responsible for complying with applicable local law and video-platform rules when processing transcript content.

### 9. Changes to this policy

If a future version adds cloud synchronization, maintainer-operated servers, accounts, telemetry, advertising, or another new data practice, this policy and the applicable extension-store disclosures will be updated before that version is released. The date at the top of this page will also be updated.

### 10. Contact

For privacy or data-processing questions, email [1223030128@qq.com](mailto:1223030128@qq.com) or contact the VidNote AI maintainer through [GitHub Issues](https://github.com/shineAcZ/vidnote-ai/issues). Do not include API keys, cookies, account information, full transcripts, or other sensitive information in a public issue.
