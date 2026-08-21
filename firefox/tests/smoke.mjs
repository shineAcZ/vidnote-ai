import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { headingSlug, normalizeTimeMarkers, renderMarkdown, toObsidianMarkdown } from "../src/lib/markdown.js";
import { BUILTIN_PROMPTS, migratePromptPresets } from "../src/lib/prompts.js";
import { DEFAULT_SETTINGS } from "../src/lib/settings.js";
import { formatTime, parseSubtitleFile, splitTranscript, transcriptToText } from "../src/lib/transcript.js";

assert.equal(formatTime(3661), "01:01:01");

const cues = parseSubtitleFile(`1
00:00:04,000 --> 00:00:08,000
第一条字幕

2
00:00:08,500 --> 00:00:12,000
第二条字幕
`, "demo.srt");
assert.equal(cues.length, 2);
assert.equal(cues[0].start, 4);
assert.match(transcriptToText(cues), /\{\{t:4\|00:00:04\}\}/);
assert.equal(splitTranscript(cues, 2000).length, 1);

const exported = toObsidianMarkdown("内容 {{t:4|00:00:04}}", "https://www.bilibili.com/video/BV123?p=2");
assert.match(exported, /obsidian:\/\/mx-open\?url=/);
assert.match(exported, /&t=4\)/);
assert.match(exported, /BV123%3Fp%3D2/);

const exportedBareTime = toObsidianMarkdown("| 时间 | 内容 |\n|---|---|\n| 00:01:30 | 示例 |", "https://example.com/video");
assert.match(exportedBareTime, /\[00:01:30\]\(obsidian:\/\/mx-open\?url=.*&t=90\)/);

const safeHtml = renderMarkdown("# 标题\n\n<img src=x onerror=alert(1)> {{t:4|00:00:04}}");
assert.doesNotMatch(safeHtml, /<img/);
assert.match(safeHtml, /class="time-link"/);

const tableHtml = renderMarkdown("| 时间段 | 内容 |\n|:---|---:|\n| 00:01:30 - {{t:100|00:01:40}} | 示例 |");
assert.match(tableHtml, /<table>/);
assert.match(tableHtml, /<th/);
assert.equal((tableHtml.match(/class="time-link"/g) || []).length, 2);
assert.match(tableHtml, /data-time="90"/);
assert.match(tableHtml, /data-time="100"/);
assert.equal((tableHtml.match(/<td/g) || []).length, 2);

assert.equal(headingSlug("一、软件下载安装避坑"), "一-软件下载安装避坑");
const navigationHtml = renderMarkdown(`# 内容导航

1. [软件下载安装避坑](#一-软件下载安装避坑)

## 一、软件下载安装避坑

\`\`\`javascript
const canJump = 1 < 2;
\`\`\`

- [x] 已完成
`, { anchorPrefix: "test-note" });
assert.match(navigationHtml, /class="note-anchor"/);
assert.match(navigationHtml, /data-note-target="一-软件下载安装避坑"/);
assert.match(navigationHtml, /class="note-heading"/);
assert.match(navigationHtml, /data-note-heading="一-软件下载安装避坑"/);
assert.match(navigationHtml, /id="test-note-一-软件下载安装避坑"/);
assert.match(navigationHtml, /class="code-block"/);
assert.match(navigationHtml, /class="code-copy"/);
assert.match(navigationHtml, /language-javascript/);
assert.match(navigationHtml, /1 &lt; 2/);
assert.match(navigationHtml, /task-list-item/);

const oneShotPrompts = BUILTIN_PROMPTS.filter((prompt) => prompt.oneShot);
assert.equal(oneShotPrompts.length, 2);
assert.ok(oneShotPrompts.every((prompt) => prompt.chunkPrompt && prompt.mergePrompt === ""));
assert.deepEqual(BUILTIN_PROMPTS.map((prompt) => prompt.name), [
  "详尽视频笔记",
  "精简视频总结",
  "分段·详尽视频笔记",
  "分段·精简视频总结"
]);
assert.deepEqual(BUILTIN_PROMPTS.map((prompt) => prompt.oneShot), [true, true, false, false]);
const migratedPrompts = migratePromptPresets([
  { ...BUILTIN_PROMPTS[2], name: "详尽视频笔记", systemPrompt: "保留用户修改", oneShot: false },
  { id: "custom-old", builtin: false, name: "旧自定义", oneShot: false },
  { id: "custom-new", builtin: false, name: "新自定义", oneShot: true }
]);
assert.deepEqual(migratedPrompts.slice(0, 4).map((prompt) => prompt.id), [
  "builtin-oneshot-detailed",
  "builtin-oneshot-summary",
  "builtin-detailed",
  "builtin-summary"
]);
assert.equal(migratedPrompts[2].name, "分段·详尽视频笔记");
assert.equal(migratedPrompts[2].systemPrompt, "保留用户修改");
assert.equal(migratedPrompts.at(-2).oneShot, false);
assert.equal(migratedPrompts.at(-1).oneShot, true);
assert.deepEqual(migratePromptPresets(migratedPrompts), migratedPrompts);

const normalized = normalizeTimeMarkers("普通 00:01:30，已有 {{t:100|00:01:40}}");
assert.match(normalized, /\{\{t:90\|00:01:30\}\}/);
assert.equal((normalized.match(/\{\{t:/g) || []).length, 2);

await testYouTubeInnertubeFallback();
await testCapturedYouTubeCaptionResponse();
await testTranscriptPageGuard();

const sidepanelSource = await readFile(new URL("../src/sidepanel.js", import.meta.url), "utf8");
const sidepanelHtml = await readFile(new URL("../src/sidepanel.html", import.meta.url), "utf8");
const backgroundSource = await readFile(new URL("../src/background.js", import.meta.url), "utf8");
const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
assert.match(sidepanelSource, /await refreshTranscriptBeforeGeneration\(\)/);
assert.match(sidepanelSource, /设置已保存 · 正在自动测试接口/);
assert.match(sidepanelSource, /await runConnectionTest\(state\.settings\)/);
assert.match(sidepanelSource, /validateSettingsValues\(values\)/);
assert.match(sidepanelSource, /oneShot:\s*!\$\("#promptSegmented"\)\.checked/);
assert.match(sidepanelHtml, /<form id="settingsForm"[^>]*novalidate/);
assert.match(sidepanelHtml, /id="promptSegmented"/);
assert.doesNotMatch(sidepanelHtml, /id="promptOneShot"/);
assertNumberInputAcceptsDefault(sidepanelHtml, "maxTokens", DEFAULT_SETTINGS.maxTokens);
assertNumberInputAcceptsDefault(sidepanelHtml, "chunkChars", DEFAULT_SETTINGS.chunkChars);
assertNumberInputAcceptsDefault(sidepanelHtml, "concurrency", DEFAULT_SETTINGS.concurrency);
const mainWorldBridge = manifest.content_scripts.find((entry) => entry.js?.includes("src/page-bridge.js"));
assert.equal(mainWorldBridge?.world, "MAIN");
assert.equal(mainWorldBridge?.run_at, "document_start");
assert.ok(manifest.permissions.includes("webRequest"));
assert.match(backgroundSource, /GET_OBSERVED_YOUTUBE_CAPTION_URLS/);
assert.match(backgroundSource, /webRequest\?\.onBeforeRequest/);
assert.doesNotMatch(contentSource, /createElement\("script"\)/);

async function testYouTubeInnertubeFallback() {
  const bridgeSource = await readFile(new URL("../src/page-bridge.js", import.meta.url), "utf8");
  const listeners = new Map();
  const messages = [];
  const requests = [];
  const transcriptPayload = {
    actions: [{
      updateEngagementPanelAction: {
        content: {
          transcriptRenderer: {
            content: {
              transcriptSearchPanelRenderer: {
                body: {
                  transcriptSegmentListRenderer: {
                    initialSegments: [
                      { transcriptSegmentRenderer: { startMs: "500", endMs: "2100", snippet: { runs: [{ text: "First line" }] } } },
                      { transcriptSegmentRenderer: { startMs: "2200", endMs: "4000", snippet: { runs: [{ text: "Second line" }] } } }
                    ]
                  }
                },
                footer: {
                  transcriptFooterRenderer: {
                    languageMenu: {
                      sortFilterSubMenuRenderer: {
                        subMenuItems: [{ title: "英语（美国）", selected: true }]
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }]
  };
  const fakeWindow = {
    ytcfg: {
      data_: {
        INNERTUBE_API_KEY: "test-key",
        INNERTUBE_CONTEXT_CLIENT_NAME: 1,
        INNERTUBE_CONTEXT_CLIENT_VERSION: "2.test",
        INNERTUBE_CONTEXT: { client: { clientName: "WEB", clientVersion: "2.test" } }
      }
    },
    ytInitialData: { panel: { continuationEndpoint: { getTranscriptEndpoint: { params: "test-params" } } } },
    addEventListener(type, listener) { listeners.set(type, listener); },
    postMessage(message) { messages.push(message); },
    performance: { getEntriesByType() { return []; } }
  };
  const fakeDocument = {
    querySelector() { return null; },
    addEventListener() {}
  };
  const context = vm.createContext({
    window: fakeWindow,
    document: fakeDocument,
    location: { href: "https://www.youtube.com/watch?v=aF0ThrmI0D4" },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, json: async () => transcriptPayload, text: async () => "" };
    },
    URL,
    WeakSet,
    setTimeout() { return 1; },
    clearTimeout() {},
    console
  });
  vm.runInContext(bridgeSource, context);
  listeners.get("message")({
    source: fakeWindow,
    data: {
      source: "vidnote-extension",
      type: "REQUEST_YOUTUBE_TRANSCRIPT",
      requestId: "test-request",
      track: { language: "en-US", label: "英语（美国）", baseUrl: "https://www.youtube.com/api/timedtext?v=aF0ThrmI0D4&exp=xpe&lang=en-US" }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const result = messages.find((message) => message.type === "YOUTUBE_TRANSCRIPT");
  assert.equal(result?.ok, true);
  assert.equal(result?.sourceType, "youtubei");
  assert.equal(result?.transcript?.length, 2);
  assert.equal(result?.transcript?.[0]?.start, 0.5);
  assert.match(String(requests[0]?.url), /youtubei\/v1\/get_transcript/);
  assert.equal(JSON.parse(requests[0].options.body).params, "test-params");
}

async function testCapturedYouTubeCaptionResponse() {
  const bridgeSource = await readFile(new URL("../src/page-bridge.js", import.meta.url), "utf8");
  const listeners = new Map();
  const messages = [];
  const captionUrl = "https://www.youtube.com/api/timedtext?v=captured-video&lang=en&pot=fresh-token&fmt=json3";
  const captionText = JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "Captured caption" }] }] });
  const response = {
    ok: true,
    status: 200,
    url: captionUrl,
    headers: { get: () => "application/json" },
    clone() { return { text: async () => captionText }; }
  };
  const fakeWindow = {
    fetch: async () => response,
    addEventListener(type, listener) { listeners.set(type, listener); },
    postMessage(message) { messages.push(message); },
    performance: { getEntriesByType() { return []; }, setResourceTimingBufferSize() {} }
  };
  const context = vm.createContext({
    window: fakeWindow,
    document: { addEventListener() {}, querySelector() { return null; } },
    location: { href: "https://www.youtube.com/watch?v=captured-video" },
    URL,
    WeakMap,
    WeakSet,
    setTimeout() { return 1; },
    clearTimeout() {},
    console
  });
  vm.runInContext(bridgeSource, context);
  await fakeWindow.fetch(captionUrl);
  await new Promise((resolve) => setImmediate(resolve));
  listeners.get("message")({
    source: fakeWindow,
    data: {
      source: "vidnote-extension",
      type: "REQUEST_YOUTUBE_TRANSCRIPT",
      requestId: "captured-request",
      track: { language: "en", label: "English", baseUrl: captionUrl }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  const result = messages.find((message) => message.requestId === "captured-request");
  assert.equal(result?.ok, true);
  assert.equal(result?.sourceType, "player-captured");
  assert.equal(result?.text, captionText);
}

async function testTranscriptPageGuard() {
  const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");
  let messageListener;
  const fakeScript = { addEventListener() {}, remove() {} };
  const fakeDocument = {
    head: { append() {} },
    documentElement: { append() {} },
    createElement() { return fakeScript; },
    querySelector() { return null; }
  };
  const fakeWindow = {
    addEventListener() {},
    postMessage() {}
  };
  const context = vm.createContext({
    browser: {
      runtime: {
        getURL: (path) => path,
        onMessage: { addListener(listener) { messageListener = listener; } },
        sendMessage: async () => ({ ok: false })
      }
    },
    window: fakeWindow,
    document: fakeDocument,
    location: { hostname: "www.youtube.com", href: "https://www.youtube.com/watch?v=current-video", pathname: "/watch" },
    URL,
    fetch: async () => { throw new Error("guard should reject before fetch"); },
    setTimeout,
    clearTimeout,
    performance: { getEntriesByType() { return []; } },
    console
  });
  vm.runInContext(contentSource, context);
  let response;
  const pending = messageListener({
    type: "GET_TRANSCRIPT",
    expectedPageIdentity: "youtube:another-video",
    track: { language: "en", url: "https://example.com/subtitle" }
  }, {}, (value) => { response = value; });
  assert.equal(pending, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(response?.ok, false);
  assert.match(response?.error || "", /另一个视频/);
}

function assertNumberInputAcceptsDefault(html, id, defaultValue) {
  const input = html.match(new RegExp(`<input[^>]+id="${id}"[^>]*>`))?.[0] || "";
  assert.ok(input, `missing #${id}`);
  const minimum = Number(input.match(/\bmin="([^"]+)"/)?.[1] || 0);
  const maximum = Number(input.match(/\bmax="([^"]+)"/)?.[1] || Number.POSITIVE_INFINITY);
  const step = Number(input.match(/\bstep="([^"]+)"/)?.[1] || 1);
  assert.ok(defaultValue >= minimum && defaultValue <= maximum, `${id} default is outside min/max`);
  assert.ok(Math.abs((defaultValue - minimum) / step - Math.round((defaultValue - minimum) / step)) < 1e-9,
    `${id} default does not satisfy step`);
}

console.log("VidNote AI smoke tests passed");
