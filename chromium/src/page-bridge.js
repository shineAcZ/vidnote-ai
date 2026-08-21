(() => {
  if (window.__vidnoteYouTubeBridgeActive) return;
  Object.defineProperty(window, "__vidnoteYouTubeBridgeActive", { value: true, configurable: false });
  const SOURCE = "vidnote-page-bridge";
  const observedCaptionRequests = [];
  const capturedCaptionPayloads = [];
  installCaptionObservation();

  function installCaptionObservation() {
    try { window.performance?.setResourceTimingBufferSize?.(2000); } catch { /* Keep the default buffer. */ }
    if (typeof PerformanceObserver === "function") {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) rememberCaptionUrl(entry?.name);
        });
        observer.observe({ type: "resource", buffered: true });
      } catch { /* Resource observation is an optional fallback. */ }
    }

    const nativeFetch = window.fetch;
    if (typeof nativeFetch === "function" && !nativeFetch.__vidnoteCaptionObserver) {
      const observedFetch = async function (...args) {
        const response = await nativeFetch.apply(this, args);
        const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url;
        rememberCaptionUrl(response?.url || requestUrl);
        captureFetchResponse(response).catch(() => {});
        return response;
      };
      Object.defineProperty(observedFetch, "__vidnoteCaptionObserver", { value: true });
      window.fetch = observedFetch;
    }

    if (typeof XMLHttpRequest !== "undefined") {
      const prototype = XMLHttpRequest.prototype;
      const nativeOpen = prototype.open;
      if (typeof nativeOpen === "function" && !nativeOpen.__vidnoteCaptionObserver) {
        const requestUrls = new WeakMap();
        const listening = new WeakSet();
        const observedOpen = function (method, url, ...rest) {
          requestUrls.set(this, String(url || ""));
          if (!listening.has(this)) {
            listening.add(this);
            this.addEventListener("loadend", () => captureXhrResponse(this, requestUrls.get(this)), false);
          }
          return nativeOpen.call(this, method, url, ...rest);
        };
        Object.defineProperty(observedOpen, "__vidnoteCaptionObserver", { value: true });
        prototype.open = observedOpen;
      }
    }
  }

  async function captureFetchResponse(response) {
    const url = response?.url;
    if (!response?.ok || !isCaptionUrl(url) || typeof response.clone !== "function") return;
    const text = await response.clone().text();
    rememberCaptionPayload(url, text, response.headers?.get?.("content-type") || "");
  }

  function captureXhrResponse(xhr, requestUrl) {
    const url = xhr?.responseURL || requestUrl;
    rememberCaptionUrl(url);
    if (!isCaptionUrl(url) || Number(xhr?.status) < 200 || Number(xhr?.status) >= 300) return;
    try {
      const text = xhr.responseType === "json" ? JSON.stringify(xhr.response) : xhr.responseText;
      rememberCaptionPayload(url, text, xhr.getResponseHeader?.("content-type") || "");
    } catch { /* This response type does not expose responseText. */ }
  }

  function rememberCaptionUrl(rawUrl) {
    if (!isCaptionUrl(rawUrl)) return;
    const url = new URL(String(rawUrl), location.href).href;
    const index = observedCaptionRequests.indexOf(url);
    if (index >= 0) observedCaptionRequests.splice(index, 1);
    observedCaptionRequests.unshift(url);
    observedCaptionRequests.splice(40);
  }

  function rememberCaptionPayload(rawUrl, value, contentType = "") {
    const text = String(value || "").replace(/^\uFEFF/, "").trim();
    if (!isCaptionUrl(rawUrl) || !looksLikeCaption(text)) return;
    const url = new URL(String(rawUrl), location.href).href;
    const existing = capturedCaptionPayloads.findIndex((item) => item.url === url);
    if (existing >= 0) capturedCaptionPayloads.splice(existing, 1);
    capturedCaptionPayloads.unshift({ url, text, contentType, capturedAt: Date.now() });
    capturedCaptionPayloads.splice(12);
  }

  function isCaptionUrl(rawUrl) {
    try {
      const url = new URL(String(rawUrl || ""), location.href);
      const host = url.hostname.toLocaleLowerCase();
      return url.pathname.includes("/api/timedtext")
        && (host === "youtube.com" || host.endsWith(".youtube.com")
          || host === "googlevideo.com" || host.endsWith(".googlevideo.com"));
    } catch {
      return false;
    }
  }

  function readYouTubeTracks() {
    try {
      const player = document.querySelector("#movie_player");
      const response = player?.getPlayerResponse?.() || window.ytInitialPlayerResponse;
      const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      window.postMessage({
        source: SOURCE,
        type: "YOUTUBE_TRACKS",
        tracks: tracks.map((track, index) => ({
          id: track.vssId || `${track.languageCode}-${index}`,
          language: track.languageCode || "unknown",
          label: track.name?.simpleText || track.name?.runs?.map((run) => run.text).join("") || track.languageCode,
          isAuto: track.kind === "asr",
          baseUrl: track.baseUrl
        }))
      }, "*");
    } catch {
      window.postMessage({ source: SOURCE, type: "YOUTUBE_TRACKS", tracks: [] }, "*");
    }
  }

  async function readYouTubeTranscript(requestId, trackInput) {
    const track = typeof trackInput === "string" ? { baseUrl: trackInput } : (trackInput || {});
    try {
      const failures = [];

      const captured = findCapturedCaption(track);
      if (captured) {
        window.postMessage({
          source: SOURCE,
          type: "YOUTUBE_TRANSCRIPT",
          requestId,
          ok: true,
          text: captured.text,
          contentType: captured.contentType,
          url: captured.url,
          sourceType: "player-captured"
        }, "*");
        return;
      }

      try {
        const transcript = await readTranscriptThroughInnertube(track);
        if (transcript.length) {
          window.postMessage({
            source: SOURCE,
            type: "YOUTUBE_TRANSCRIPT",
            requestId,
            ok: true,
            transcript,
            sourceType: "youtubei"
          }, "*");
          return;
        }
      } catch (error) {
        failures.push(`原生文字稿：${error?.message || "请求失败"}`);
      }

      const urls = buildCaptionUrls(track.baseUrl, track);
      for (const url of urls) {
        try {
          const response = await fetch(url, {
            method: "GET",
            credentials: "include",
            redirect: "follow"
          });
          const text = await response.text();
          if (response.ok && looksLikeCaption(text)) {
            window.postMessage({
              source: SOURCE,
              type: "YOUTUBE_TRANSCRIPT",
              requestId,
              ok: true,
              text,
              contentType: response.headers.get("content-type") || "",
              url
            }, "*");
            return;
          }
          failures.push(response.ok ? "返回空字幕" : `HTTP ${response.status}`);
        } catch (error) {
          failures.push(error?.message || "请求失败");
        }
      }
      throw new Error([...new Set(failures.filter(Boolean))].slice(0, 4).join("；") || "字幕接口没有返回内容");
    } catch (error) {
      window.postMessage({
        source: SOURCE,
        type: "YOUTUBE_TRANSCRIPT",
        requestId,
        ok: false,
        error: error?.message || "YouTube 字幕读取失败"
      }, "*");
    }
  }

  async function readTranscriptThroughInnertube(track) {
    const config = readInnertubeConfig();
    const initialParams = findTranscriptParams();
    if (!initialParams) throw new Error("页面没有提供文字稿请求参数");

    let parsed = parseInnertubeTranscript(await requestInnertubeTranscript(initialParams, config));
    const target = parsed.languages.find((item) => languageItemMatchesTrack(item, track));
    const selectedMatches = languageItemMatchesTrack({ title: parsed.selectedTitle }, track);

    if (target?.continuation && !target.selected) {
      parsed = parseInnertubeTranscript(await requestInnertubeTranscript(target.continuation, config));
    } else if (!target && !selectedMatches && parsed.languages.length > 1 && track.label) {
      throw new Error(`原生文字稿没有找到“${track.label}”轨道`);
    }

    if (!parsed.transcript.length) throw new Error("原生文字稿没有文本片段");
    return parsed.transcript;
  }

  function readInnertubeConfig() {
    const data = window.ytcfg?.data_ || {};
    const context = data.INNERTUBE_CONTEXT || {
      client: {
        clientName: "WEB",
        clientVersion: data.INNERTUBE_CLIENT_VERSION || ""
      }
    };
    const apiKey = data.INNERTUBE_API_KEY;
    const clientVersion = data.INNERTUBE_CONTEXT_CLIENT_VERSION
      || context?.client?.clientVersion
      || data.INNERTUBE_CLIENT_VERSION;
    if (!apiKey || !clientVersion) throw new Error("页面没有提供 YouTube 客户端配置");
    return {
      apiKey,
      context,
      clientName: data.INNERTUBE_CONTEXT_CLIENT_NAME || "1",
      clientVersion,
      visitorData: data.VISITOR_DATA || context?.client?.visitorData || ""
    };
  }

  function findTranscriptParams() {
    const roots = [
      window.ytInitialData,
      document.querySelector("ytd-watch-flexy")?.data,
      document.querySelector("ytd-watch-metadata")?.data
    ];
    for (const root of roots) {
      const endpoint = findDeepObject(root, (value) => Boolean(value?.getTranscriptEndpoint?.params));
      if (endpoint?.getTranscriptEndpoint?.params) return endpoint.getTranscriptEndpoint.params;
    }
    return "";
  }

  async function requestInnertubeTranscript(params, config) {
    const headers = {
      "Content-Type": "application/json",
      "X-YouTube-Client-Name": String(config.clientName),
      "X-YouTube-Client-Version": String(config.clientVersion)
    };
    if (config.visitorData) headers["X-Goog-Visitor-Id"] = config.visitorData;
    const response = await fetch(`/youtubei/v1/get_transcript?key=${encodeURIComponent(config.apiKey)}&prettyPrint=false`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({ context: config.context, params })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.error?.message) throw new Error(payload.error.message);
    return payload;
  }

  function parseInnertubeTranscript(payload) {
    const fixedPanel = payload?.actions?.[0]?.updateEngagementPanelAction?.content
      ?.transcriptRenderer?.content?.transcriptSearchPanelRenderer;
    const holder = fixedPanel ? null : findDeepObject(payload, (value) => Boolean(value?.transcriptSearchPanelRenderer));
    const panel = fixedPanel || holder?.transcriptSearchPanelRenderer;
    if (!panel) throw new Error("YouTube 返回的数据中没有文字稿面板");

    const initialSegments = panel?.body?.transcriptSegmentListRenderer?.initialSegments || [];
    const transcript = initialSegments.map((item, index) => {
      const segment = item?.transcriptSegmentRenderer;
      if (!segment) return null;
      const start = Number(segment.startMs) / 1000;
      const end = Number(segment.endMs) / 1000;
      const text = readText(segment.snippet).replace(/\s+/g, " ").trim();
      return {
        id: index + 1,
        start,
        end: Number.isFinite(end) ? end : start,
        text
      };
    }).filter((item) => item && Number.isFinite(item.start) && item.text);

    const menuItems = panel?.footer?.transcriptFooterRenderer?.languageMenu
      ?.sortFilterSubMenuRenderer?.subMenuItems || [];
    const languages = menuItems.map((item) => ({
      title: readText(item.title),
      selected: Boolean(item.selected),
      continuation: item?.continuation?.reloadContinuationData?.continuation || ""
    }));
    return {
      transcript,
      languages,
      selectedTitle: languages.find((item) => item.selected)?.title || ""
    };
  }

  function findDeepObject(root, predicate) {
    if (!root || typeof root !== "object") return null;
    const queue = [root];
    const seen = new WeakSet();
    for (let index = 0; index < queue.length && index < 100000; index += 1) {
      const value = queue[index];
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      if (predicate(value)) return value;
      try {
        for (const child of Object.values(value)) {
          if (child && typeof child === "object") queue.push(child);
        }
      } catch {
        // Some YouTube page objects expose inaccessible proxy properties.
      }
    }
    return null;
  }

  function readText(value) {
    if (typeof value === "string") return value;
    if (typeof value?.simpleText === "string") return value.simpleText;
    if (Array.isArray(value?.runs)) return value.runs.map((run) => run?.text || "").join("");
    return "";
  }

  function languageItemMatchesTrack(item, track) {
    const desired = normalizeLanguageLabel(track?.label);
    const actual = normalizeLanguageLabel(item?.title);
    return Boolean(desired && actual && desired === actual);
  }

  function normalizeLanguageLabel(value) {
    return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[\s()（）\[\]【】_-]/g, "");
  }

  function buildCaptionUrls(baseUrl, track = {}) {
    const url = new URL(String(baseUrl || ""), location.href);
    const host = url.hostname.toLowerCase();
    const allowed = url.protocol === "https:"
      && (host === "youtube.com" || host.endsWith(".youtube.com")
        || host === "googlevideo.com" || host.endsWith(".googlevideo.com"));
    if (!allowed) throw new Error("字幕地址不是受支持的 YouTube 地址");

    const currentVideoId = new URL(location.href).searchParams.get("v") || "";
    const language = String(track.language || "").toLocaleLowerCase();
    const providedUrls = Array.isArray(track.observedUrls)
      ? track.observedUrls.filter((candidate) => captionUrlMatchesTrack(candidate, currentVideoId, language))
      : [];
    const sources = [...providedUrls, ...observedCaptionUrls(track), url.href].filter(isCaptionUrl);
    const candidates = [];
    for (const source of sources) {
      const sourceUrl = new URL(source, location.href);
      candidates.push(sourceUrl.href);
      for (const format of ["json3", "vtt", "srv3"]) {
        const candidate = new URL(sourceUrl.href);
        candidate.searchParams.set("fmt", format);
        candidates.push(candidate.href);
      }
    }
    return [...new Set(candidates)];
  }

  function observedCaptionUrls(track) {
    const language = String(track?.language || "").toLocaleLowerCase();
    const videoId = new URL(location.href).searchParams.get("v") || "";
    try {
      const performanceUrls = (window.performance?.getEntriesByType("resource") || [])
        .filter((entry) => String(entry.name || "").includes("/api/timedtext"))
        .sort((a, b) => Number(b.startTime) - Number(a.startTime))
        .map((entry) => String(entry.name || ""));
      return [...new Set([...observedCaptionRequests, ...performanceUrls])]
        .filter((rawUrl) => {
          return captionUrlMatchesTrack(rawUrl, videoId, language);
        });
    } catch {
      return [];
    }
  }

  function findCapturedCaption(track) {
    const language = String(track?.language || "").toLocaleLowerCase();
    const videoId = new URL(location.href).searchParams.get("v") || "";
    return capturedCaptionPayloads.find((item) => captionUrlMatchesTrack(item.url, videoId, language)) || null;
  }

  function captionUrlMatchesTrack(rawUrl, videoId, language) {
    try {
      const candidate = new URL(rawUrl, location.href);
      const candidateLanguage = (candidate.searchParams.get("tlang") || candidate.searchParams.get("lang") || "").toLocaleLowerCase();
      return (!videoId || !candidate.searchParams.get("v") || candidate.searchParams.get("v") === videoId)
        && (!language || !candidateLanguage || candidateLanguage === language);
    } catch {
      return false;
    }
  }

  function looksLikeCaption(value) {
    const text = String(value || "").replace(/^\uFEFF/, "").trim();
    if (!text) return false;
    if (/^WEBVTT(?:\s|$)/i.test(text)) return true;
    const jsonText = text.replace(/^\)\]\}'\s*/, "");
    if (/^\{/.test(jsonText)) {
      try {
        return Array.isArray(JSON.parse(jsonText).events);
      } catch {
        return false;
      }
    }
    return /^<\?xml\b/i.test(text) || /^<(?:timedtext|transcript)\b/i.test(text);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "vidnote-extension") return;
    if (event.data.type === "REQUEST_YOUTUBE_TRACKS") readYouTubeTracks();
    if (event.data.type === "REQUEST_YOUTUBE_TRANSCRIPT") {
      readYouTubeTranscript(event.data.requestId, event.data.track || event.data.baseUrl);
    }
  });

  document.addEventListener("yt-navigate-finish", () => setTimeout(readYouTubeTracks, 800));
  setTimeout(readYouTubeTracks, 1000);
})();
