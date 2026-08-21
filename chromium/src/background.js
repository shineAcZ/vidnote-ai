const chrome = globalThis.chrome;
const activeRequests = new Map();
const observedYouTubeCaptionUrls = new Map();

chrome.webRequest?.onBeforeRequest?.addListener(
  (details) => rememberYouTubeCaptionRequest(details),
  { urls: ["*://*.youtube.com/api/timedtext*", "*://*.googlevideo.com/api/timedtext*"] }
);
chrome.tabs?.onRemoved?.addListener((tabId) => observedYouTubeCaptionUrls.delete(tabId));

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "vidnote-ai") return;

  port.onMessage.addListener(async (message) => {
    if (message.type === "cancel") {
      activeRequests.get(message.requestId)?.controller.abort();
      return;
    }

    if (message.type !== "generate") return;
    const controller = new AbortController();
    activeRequests.set(message.requestId, { controller, port });

    try {
      await streamCompletion(message, controller.signal, (event) => {
        port.postMessage({ requestId: message.requestId, ...event });
      });
    } catch (error) {
      const cancelled = error?.name === "AbortError";
      port.postMessage({
        requestId: message.requestId,
        type: cancelled ? "cancelled" : "error",
        error: cancelled ? "请求已停止" : friendlyError(error),
        status: error?.status || null,
        retryAfter: error?.retryAfter || null
      });
    } finally {
      activeRequests.delete(message.requestId);
    }
  });

  port.onDisconnect.addListener(() => {
    for (const [requestId, request] of activeRequests.entries()) {
      if (request.port !== port) continue;
      request.controller.abort();
      activeRequests.delete(requestId);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_OBSERVED_YOUTUBE_CAPTION_URLS") {
    const tabId = sender?.tab?.id;
    sendResponse({ ok: true, urls: Number.isInteger(tabId) ? observedYouTubeCaptionUrls.get(tabId) || [] : [] });
    return false;
  }

  if (message.type === "AI_TEST") {
    testConnection(message.config)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: friendlyError(error) }));
    return true;
  }

  if (message.type === "FETCH_TRANSCRIPT_JSON") {
    fetchTranscriptJson(message.url)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: friendlyError(error) }));
    return true;
  }

  if (message.type === "FETCH_TRANSCRIPT_TEXT") {
    fetchTranscriptText(message.url)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: friendlyError(error) }));
    return true;
  }

  return false;
});

function rememberYouTubeCaptionRequest(details) {
  if (!Number.isInteger(details?.tabId) || details.tabId < 0 || !details.url) return;
  const urls = observedYouTubeCaptionUrls.get(details.tabId) || [];
  const next = [details.url, ...urls.filter((url) => url !== details.url)].slice(0, 40);
  observedYouTubeCaptionUrls.set(details.tabId, next);
}

async function fetchTranscriptJson(rawUrl) {
  const result = await fetchTranscriptText(rawUrl);
  const text = result.text.replace(/^\uFEFF/, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("字幕接口没有返回有效的 JSON 数据");
  }
}

async function fetchTranscriptText(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("字幕文件地址无效");
  }

  if (url.protocol !== "https:" || !isAllowedTranscriptHost(url.hostname)) {
    throw new Error("字幕文件来自未授权的域名");
  }

  const response = await fetch(url.href, {
    method: "GET",
    credentials: "omit",
    redirect: "follow",
    headers: { "Accept": "application/json,text/plain,*/*" }
  });
  if (!response.ok) {
    const error = new Error(`字幕文件下载失败（HTTP ${response.status}）`);
    error.status = response.status;
    throw error;
  }
  const text = await response.text();
  if (!text.trim()) throw new Error("字幕接口返回了空内容");
  return {
    text,
    contentType: response.headers.get("content-type") || "",
    url: response.url || url.href
  };
}

function isAllowedTranscriptHost(hostname) {
  const host = String(hostname).toLowerCase();
  return host === "hdslb.com"
    || host.endsWith(".hdslb.com")
    || host === "youtube.com"
    || host.endsWith(".youtube.com")
    || host === "googlevideo.com"
    || host.endsWith(".googlevideo.com");
}

async function testConnection(config) {
  validateConfig(config);
  const response = await fetch(completionUrl(config.baseUrl), {
    method: "POST",
    headers: requestHeaders(config),
    body: JSON.stringify(buildCompletionBody(
      config,
      [{ role: "user", content: "只回复：连接成功" }],
      { stream: false, maxTokens: 128, temperature: 0 }
    ))
  });
  const payload = await readResponse(response);
  return payload?.choices?.[0]?.message?.content || "连接成功";
}

async function streamCompletion(message, signal, emit) {
  const { config, messages } = message;
  validateConfig(config);

  const body = buildCompletionBody(config, messages, { stream: true });

  const response = await fetch(completionUrl(config.baseUrl), {
    method: "POST",
    headers: requestHeaders(config),
    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) await readResponse(response);
  if (!response.body) throw new Error("AI 服务没有返回可读取的数据流");

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const payload = await response.json();
    const choice = payload?.choices?.[0];
    const text = choice?.message?.content || "";
    if (text) emit({ type: "delta", text });
    emit({ type: "done", usage: payload?.usage || null, finishReason: choice?.finish_reason || "stop" });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage = null;
  let finishReason = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const event = JSON.parse(data);
        usage = event.usage || usage;
        const choice = event?.choices?.[0];
        finishReason = choice?.finish_reason || finishReason;
        const delta = choice?.delta;
        if (delta?.reasoning_content) emit({ type: "reasoning" });
        const text = delta?.content;
        if (text) emit({ type: "delta", text });
      } catch {
        // Ignore provider keep-alive or non-JSON event lines.
      }
    }
  }

  emit({ type: "done", usage, finishReason: finishReason || "stop" });
}

function buildCompletionBody(config, messages, options = {}) {
  const deepseek = config.provider === "deepseek";
  const thinking = deepseek && Boolean(config.deepseekThinking);
  const body = {
    model: config.model,
    messages,
    stream: Boolean(options.stream),
    max_tokens: Number(options.maxTokens ?? config.maxTokens ?? 384000)
  };

  if (deepseek) {
    body.thinking = { type: thinking ? "enabled" : "disabled" };
    if (thinking) body.reasoning_effort = config.reasoningEffort === "max" ? "max" : "high";
  }

  // DeepSeek 思考模式会忽略随机性参数，省略它可避免给用户造成错误预期。
  if (!thinking) body.temperature = Number(options.temperature ?? config.temperature ?? 0.2);
  return body;
}

function requestHeaders(config) {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${config.apiKey}`,
    ...(config.extraHeaders || {})
  };
}

function completionUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

function validateConfig(config) {
  if (!config?.apiKey) throw new Error("请先填写 API 密钥");
  if (!config?.model) throw new Error("请填写模型名称");

  let url;
  try {
    url = new URL(completionUrl(config.baseUrl));
  } catch {
    throw new Error("API 地址格式不正确");
  }

  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new Error("API 必须使用 HTTPS；本地 localhost 服务可以使用 HTTP");
  }
}

async function readResponse(response) {
  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail = payload?.error?.message || raw.slice(0, 300) || response.statusText;
    const error = new Error(detail);
    error.status = response.status;
    error.retryAfter = response.headers.get("retry-after");
    throw error;
  }
  return payload;
}

function friendlyError(error) {
  if (error?.status === 401 || error?.status === 403) return "认证失败，请检查 API 密钥和模型权限";
  if (error?.status === 429) return "AI 服务请求过多或额度不足，请稍后重试";
  if (error?.status >= 500) return "AI 服务暂时不可用，已完成的内容不会丢失";
  if (String(error?.message).includes("Failed to fetch")) return "无法连接到 AI 服务，请检查网络和 API 地址权限";
  return error?.message || "AI 请求失败";
}
