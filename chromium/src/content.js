(() => {
  const chrome = globalThis.chrome;
  let youtubeTracks = [];
  let youtubeRequestSequence = 0;
  const youtubeTranscriptRequests = new Map();

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "vidnote-page-bridge") return;
    if (event.data.type === "YOUTUBE_TRACKS") youtubeTracks = event.data.tracks || [];
    if (event.data.type === "YOUTUBE_TRANSCRIPT") {
      const pending = youtubeTranscriptRequests.get(event.data.requestId);
      if (!pending) return;
      youtubeTranscriptRequests.delete(event.data.requestId);
      clearTimeout(pending.timer);
      if (event.data.ok) pending.resolve(event.data);
      else pending.reject(new Error(event.data.error || "YouTube 页面没有返回字幕"));
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "GET_VIDEO_CONTEXT") {
      getVideoContext()
        .then((context) => sendResponse({ ok: true, context }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === "GET_TRANSCRIPT") {
      getTranscriptForPage(message.track, message.expectedPageIdentity)
        .then(({ transcript, pageIdentity }) => sendResponse({ ok: true, transcript, pageIdentity }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === "SEEK_TO") {
      const video = document.querySelector("video");
      if (!video) {
        sendResponse({ ok: false, error: "当前页面没有找到视频播放器" });
        return false;
      }
      video.currentTime = Math.max(0, Number(message.seconds) || 0);
      if (message.play) video.play().catch(() => {});
      video.scrollIntoView({ behavior: "smooth", block: "center" });
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "GET_CURRENT_TIME") {
      const video = document.querySelector("video");
      sendResponse({ ok: Boolean(video), seconds: video?.currentTime || 0, playing: video ? !video.paused : false });
      return false;
    }

    return false;
  });

  async function getVideoContext() {
    const host = location.hostname;
    const video = document.querySelector("video");

    if (host.includes("bilibili.com")) {
      const info = await getBilibiliInfo();
      return {
        platform: "bilibili",
        videoKey: `bilibili:${info.bvid}:${info.cid}`,
        title: cleanTitle(document.querySelector("h1")?.textContent || document.title),
        url: `https://www.bilibili.com/video/${info.bvid}${info.page > 1 ? `?p=${info.page}` : ""}`,
        duration: Number(video?.duration) || 0,
        tracks: info.tracks
      };
    }

    if (host.includes("youtube.com") || host === "youtu.be") {
      window.postMessage({ source: "vidnote-extension", type: "REQUEST_YOUTUBE_TRACKS" }, "*");
      await wait(350);
      if (!youtubeTracks.length) youtubeTracks = readFirefoxYouTubeTracks();
      const id = new URL(location.href).searchParams.get("v") || location.pathname.split("/").filter(Boolean)[0];
      return {
        platform: "youtube",
        videoKey: `youtube:${id}`,
        title: cleanTitle(document.querySelector("h1.ytd-watch-metadata")?.textContent || document.title.replace(/\s*-\s*YouTube$/, "")),
        url: `https://www.youtube.com/watch?v=${id}`,
        duration: Number(video?.duration) || 0,
        tracks: youtubeTracks
      };
    }

    throw new Error("当前版本支持 Bilibili 和 YouTube 视频页");
  }

  async function getTranscript(track) {
    if (!track) throw new Error("请选择字幕语言，或导入 SRT/VTT 字幕文件");
    if (location.hostname.includes("bilibili.com")) return fetchBilibiliTranscript(track);
    return fetchYouTubeTranscript(track);
  }

  async function getTranscriptForPage(track, expectedPageIdentity) {
    const before = getPageVideoIdentity();
    if (expectedPageIdentity && before !== expectedPageIdentity) {
      throw new Error("当前页面已经切换到另一个视频，拒绝读取旧字幕轨");
    }
    const transcript = await getTranscript(track);
    const after = getPageVideoIdentity();
    if (before !== after || (expectedPageIdentity && after !== expectedPageIdentity)) {
      throw new Error("读取字幕期间视频发生了切换，本次字幕已丢弃");
    }
    return { transcript, pageIdentity: after };
  }

  function getPageVideoIdentity() {
    const host = location.hostname;
    if (host.includes("youtube.com") || host === "youtu.be") {
      const id = new URL(location.href).searchParams.get("v") || location.pathname.split("/").filter(Boolean)[0] || "";
      return `youtube:${id}`;
    }
    const bvid = location.pathname.match(/\/video\/(BV[\w]+)/i)?.[1] || "";
    const page = Math.max(1, Number(new URL(location.href).searchParams.get("p")) || 1);
    return `bilibili:${bvid.toLocaleLowerCase()}:p${page}`;
  }

  async function getBilibiliInfo() {
    const match = location.pathname.match(/\/video\/(BV[\w]+)/i);
    if (!match) throw new Error("无法识别当前 Bilibili 视频编号");
    const bvid = match[1];
    const page = Math.max(1, Number(new URL(location.href).searchParams.get("p")) || 1);
    const pageResponse = await fetch(`https://api.bilibili.com/x/player/pagelist?bvid=${encodeURIComponent(bvid)}`, { credentials: "include" });
    const pagePayload = await pageResponse.json();
    const pageInfo = pagePayload?.data?.[page - 1] || pagePayload?.data?.[0];
    if (!pageInfo?.cid) throw new Error("无法读取视频分 P 信息");

    const playerPayload = await getBilibiliPlayerData(bvid, pageInfo.cid);
    const subtitles = playerPayload?.data?.subtitle?.subtitles || [];
    const apiTracks = subtitles.map((item, index) => ({
      id: String(item.id || index),
      language: item.lan || "unknown",
      label: item.lan_doc || item.lan || `字幕 ${index + 1}`,
      isAuto: item.type === 1 || item.ai_type === 1 || Boolean(item.ai_status),
      isCurrent: item.lan === playerPayload?.data?.subtitle?.lan,
      source: "api",
      url: normalizeUrl(item.subtitle_url)
    }));

    const playerUrls = getBilibiliPlayerSubtitleUrls();
    const currentLanguage = playerPayload?.data?.subtitle?.lan || "zh";
    const currentTracks = playerUrls.map((url, index) => ({
      id: `player-${index}`,
      language: currentLanguage,
      label: index === 0 ? "播放器当前字幕（推荐）" : `播放器已加载字幕 ${index + 1}`,
      isAuto: false,
      isCurrent: index === 0,
      source: "player",
      url
    }));
    const tracks = dedupeTracks([...currentTracks, ...apiTracks]);

    return { bvid, cid: pageInfo.cid, page, tracks };
  }

  async function fetchBilibiliTranscript(track) {
    const requestedUrl = normalizeUrl(track.url);
    const payload = await fetchTranscriptThroughBackground(requestedUrl);
    let transcript = parseBilibiliSubtitlePayload(payload);
    const videoDuration = Number(document.querySelector("video")?.duration) || 0;

    if (isSuspiciousTranscript(transcript, videoDuration)) {
      const alternatives = getBilibiliPlayerSubtitleUrls()
        .filter((url) => subtitleUrlKey(url) !== subtitleUrlKey(requestedUrl));
      let best = transcript;
      for (const url of alternatives) {
        try {
          const candidate = parseBilibiliSubtitlePayload(await fetchTranscriptThroughBackground(url));
          if (transcriptQuality(candidate, videoDuration) > transcriptQuality(best, videoDuration)) best = candidate;
        } catch {
          // Try the next subtitle resource observed in the player.
        }
      }
      transcript = best;
    }

    if (isSuspiciousTranscript(transcript, videoDuration)) {
      throw new Error("Bilibili 返回的字幕轨几乎只有音乐标记或只覆盖视频开头。请先在播放器中切换到正常中文字幕，播放几秒，再刷新扩展并选择“播放器当前字幕（推荐）”。");
    }
    return transcript;
  }

  function parseBilibiliSubtitlePayload(payload) {
    return (payload.body || []).map((item, index) => ({
      id: index + 1,
      start: Number(item.from) || 0,
      end: Number(item.to) || Number(item.from) || 0,
      text: String(item.content || "").trim()
    })).filter((item) => item.text);
  }

  async function getBilibiliPlayerData(bvid, cid) {
    const params = `bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid)}`;
    let fallbackPayload = null;
    for (const endpoint of ["/x/player/wbi/v2", "/x/player/v2"]) {
      try {
        const response = await fetch(`https://api.bilibili.com${endpoint}?${params}`, { credentials: "include" });
        const payload = await response.json();
        if (payload?.code === 0 && payload?.data) {
          fallbackPayload ||= payload;
          if (payload.data.subtitle?.subtitles?.length) return payload;
        }
      } catch {
        // Fall back to the legacy player endpoint.
      }
    }
    if (fallbackPayload) return fallbackPayload;
    throw new Error("无法读取 Bilibili 播放器字幕信息");
  }

  function getBilibiliPlayerSubtitleUrls() {
    const entries = performance.getEntriesByType("resource") || [];
    const urls = entries
      .filter((entry) => isBilibiliSubtitleUrl(entry.name))
      .sort((a, b) => Number(b.startTime) - Number(a.startTime))
      .map((entry) => normalizeUrl(entry.name));
    return [...new Map(urls.map((url) => [subtitleUrlKey(url), url])).values()];
  }

  function isBilibiliSubtitleUrl(rawUrl) {
    try {
      const url = new URL(normalizeUrl(rawUrl));
      return (url.hostname === "hdslb.com" || url.hostname.endsWith(".hdslb.com"))
        && (url.pathname.includes("/bfs/subtitle/") || url.pathname.includes("/bfs/ai_subtitle/"));
    } catch {
      return false;
    }
  }

  function subtitleUrlKey(rawUrl) {
    try {
      const url = new URL(normalizeUrl(rawUrl));
      return `${url.hostname}${url.pathname}`;
    } catch {
      return String(rawUrl || "");
    }
  }

  function dedupeTracks(tracks) {
    const result = [];
    const seen = new Set();
    for (const track of tracks) {
      if (!track.url) continue;
      const key = subtitleUrlKey(track.url);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(track);
    }
    return result;
  }

  function isSuspiciousTranscript(items, duration) {
    if (!items.length) return true;
    const meaningful = items.filter((item) => !isMusicOnlyCue(item.text));
    const coverage = Math.max(...items.map((item) => item.end || item.start || 0));
    const mostlyMusic = meaningful.length < Math.max(3, Math.ceil(items.length * 0.25));
    const endsVeryEarly = duration > 180 && coverage < Math.min(duration * 0.18, 120);
    return mostlyMusic || endsVeryEarly;
  }

  function transcriptQuality(items, duration) {
    if (!items.length) return 0;
    const meaningful = items.filter((item) => !isMusicOnlyCue(item.text));
    const coverage = Math.max(...items.map((item) => item.end || item.start || 0));
    const coverageRatio = duration > 0 ? Math.min(1, coverage / duration) : 0;
    return meaningful.length * 10 + items.length + coverageRatio * 500;
  }

  function isMusicOnlyCue(text) {
    const normalized = String(text || "")
      .toLocaleLowerCase()
      .replace(/[♪♫♬🎵🎶\s~～·・.。!！?？\-—_()[\]【】]/g, "");
    return /^(音乐|配乐|背景音乐|music|bgm|instrumental)*$/.test(normalized);
  }

  async function fetchYouTubeTranscript(track) {
    const baseUrl = String(track?.baseUrl || "");
    if (!baseUrl) throw new Error("当前 YouTube 字幕轨没有可用的下载地址，请刷新视频页面后重试");
    const failures = [];
    const observedUrls = await getObservedYouTubeCaptionUrls();

    try {
      const result = await fetchYouTubeTranscriptThroughPage({ ...track, observedUrls });
      const transcript = Array.isArray(result.transcript)
        ? normalizeYouTubeTranscript(result.transcript)
        : parseYouTubeTranscriptText(result.text, result.contentType);
      if (transcript.length) return transcript;
    } catch (error) {
      failures.push(error?.message || "页面请求失败");
    }

    const urls = buildYouTubeCaptionUrls(baseUrl, track, observedUrls);
    for (const url of urls) {
      try {
        const response = await fetch(url, { credentials: "include", redirect: "follow" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const transcript = parseYouTubeTranscriptText(await response.text(), response.headers.get("content-type") || "");
        if (transcript.length) return transcript;
      } catch (error) {
        failures.push(error?.message || "扩展页面请求失败");
      }
    }

    for (const url of urls) {
      try {
        const result = await fetchTranscriptTextThroughBackground(url);
        const transcript = parseYouTubeTranscriptText(result.text, result.contentType);
        if (transcript.length) return transcript;
      } catch (error) {
        failures.push(error?.message || "后台请求失败");
      }
    }

    const reason = [...new Set(failures.filter(Boolean))].slice(0, 3).join("；");
    throw new Error(`YouTube 没有返回可读取的字幕。请确认播放器中能打开字幕，播放几秒后刷新扩展再试${reason ? `（${reason}）` : ""}`);
  }

  function fetchYouTubeTranscriptThroughPage(track) {
    return new Promise((resolve, reject) => {
      const requestId = `youtube-${Date.now()}-${++youtubeRequestSequence}`;
      const timer = setTimeout(() => {
        youtubeTranscriptRequests.delete(requestId);
        reject(new Error("等待 YouTube 页面返回字幕超时"));
      }, 12000);
      youtubeTranscriptRequests.set(requestId, { resolve, reject, timer });
      window.postMessage({
        source: "vidnote-extension",
        type: "REQUEST_YOUTUBE_TRANSCRIPT",
        requestId,
        track: {
          id: String(track?.id || ""),
          language: String(track?.language || ""),
          label: String(track?.label || ""),
          isAuto: Boolean(track?.isAuto),
          baseUrl: String(track?.baseUrl || ""),
          observedUrls: Array.isArray(track?.observedUrls) ? track.observedUrls.slice(0, 40) : []
        }
      }, "*");
    });
  }

  function buildYouTubeCaptionUrls(baseUrl, track = {}, observedUrls = []) {
    const url = new URL(baseUrl, location.href);
    const host = url.hostname.toLowerCase();
    const allowed = url.protocol === "https:"
      && (host === "youtube.com" || host.endsWith(".youtube.com")
        || host === "googlevideo.com" || host.endsWith(".googlevideo.com"));
    if (!allowed) throw new Error("字幕地址不是受支持的 YouTube 地址");
    const videoId = new URL(location.href).searchParams.get("v") || "";
    const language = String(track.language || "").toLocaleLowerCase();
    const sources = [...observedUrls.filter((candidate) => youtubeCaptionUrlMatchesTrack(candidate, videoId, language)), url.href];
    const urls = [];
    for (const source of sources) {
      urls.push(source);
      for (const format of ["json3", "vtt", "srv3"]) {
        const candidate = new URL(source);
        candidate.searchParams.set("fmt", format);
        urls.push(candidate.href);
      }
    }
    return [...new Set(urls)];
  }

  async function getObservedYouTubeCaptionUrls() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_OBSERVED_YOUTUBE_CAPTION_URLS" });
      return response?.ok && Array.isArray(response.urls) ? response.urls : [];
    } catch {
      return [];
    }
  }

  function youtubeCaptionUrlMatchesTrack(rawUrl, videoId, language) {
    try {
      const candidate = new URL(rawUrl, location.href);
      const host = candidate.hostname.toLocaleLowerCase();
      if (!candidate.pathname.includes("/api/timedtext")
        || !(host === "youtube.com" || host.endsWith(".youtube.com")
          || host === "googlevideo.com" || host.endsWith(".googlevideo.com"))) return false;
      const candidateLanguage = (candidate.searchParams.get("tlang") || candidate.searchParams.get("lang") || "").toLocaleLowerCase();
      return (!videoId || !candidate.searchParams.get("v") || candidate.searchParams.get("v") === videoId)
        && (!language || !candidateLanguage || candidateLanguage === language);
    } catch {
      return false;
    }
  }

  function normalizeYouTubeTranscript(items) {
    const transcript = items.map((item, index) => {
      const start = Number(item?.start);
      const end = Number(item?.end);
      return {
        id: index + 1,
        start,
        end: Number.isFinite(end) ? end : start,
        text: String(item?.text || "").replace(/\s+/g, " ").trim()
      };
    }).filter((item) => Number.isFinite(item.start) && item.text);
    if (!transcript.length) throw new Error("YouTube 原生文字稿中没有文本片段");
    return transcript;
  }

  function parseYouTubeTranscriptText(value, contentType = "") {
    const text = String(value || "").replace(/^\uFEFF/, "").trim();
    if (!text) throw new Error("YouTube 字幕接口返回了空内容");

    if (/^WEBVTT(?:\s|$)/i.test(text) || /text\/vtt/i.test(contentType)) return parseYouTubeVtt(text);
    if (/^<\?xml\b/i.test(text) || /^<(?:timedtext|transcript)\b/i.test(text)) return parseYouTubeXml(text);

    const jsonText = text.replace(/^\)\]\}'\s*/, "");
    let payload;
    try {
      payload = JSON.parse(jsonText);
    } catch {
      throw new Error("YouTube 字幕接口返回了无法识别的内容");
    }
    const transcript = (payload.events || []).filter((event) => event.segs?.length).map((event, index) => {
      const start = Number(event.tStartMs || 0) / 1000;
      const duration = Number(event.dDurationMs || 0) / 1000;
      return {
        id: index + 1,
        start,
        end: start + duration,
        text: event.segs.map((segment) => segment.utf8 || "").join("").replace(/\n/g, " ").trim()
      };
    }).filter((item) => item.text);
    if (!transcript.length) throw new Error("YouTube 返回的字幕中没有文本片段");
    return transcript;
  }

  function parseYouTubeVtt(value) {
    const items = [];
    const blocks = value.replace(/\r/g, "").split(/\n{2,}/);
    for (const block of blocks) {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) continue;
      const [startText, endPart] = lines[timingIndex].split("-->");
      const start = parseYouTubeTime(startText);
      const end = parseYouTubeTime(String(endPart || "").trim().split(/\s+/)[0]);
      const text = decodeYouTubeText(lines.slice(timingIndex + 1).join(" "));
      if (!Number.isFinite(start) || !text) continue;
      items.push({ id: items.length + 1, start, end: Number.isFinite(end) ? end : start, text });
    }
    if (!items.length) throw new Error("YouTube 返回的 WebVTT 字幕中没有文本片段");
    return items;
  }

  function parseYouTubeXml(value) {
    const documentNode = new DOMParser().parseFromString(value, "application/xml");
    if (documentNode.querySelector("parsererror")) throw new Error("YouTube 返回的 XML 字幕格式无效");
    const legacy = Array.from(documentNode.querySelectorAll("text"));
    const nodes = legacy.length ? legacy : Array.from(documentNode.querySelectorAll("p"));
    const items = nodes.map((node, index) => {
      const legacyFormat = node.tagName.toLowerCase() === "text";
      const start = legacyFormat ? Number(node.getAttribute("start")) : Number(node.getAttribute("t")) / 1000;
      const duration = legacyFormat ? Number(node.getAttribute("dur")) : Number(node.getAttribute("d")) / 1000;
      return {
        id: index + 1,
        start,
        end: start + (Number.isFinite(duration) ? duration : 0),
        text: decodeYouTubeText(node.textContent || "")
      };
    }).filter((item) => Number.isFinite(item.start) && item.text);
    if (!items.length) throw new Error("YouTube 返回的 XML 字幕中没有文本片段");
    return items;
  }

  function parseYouTubeTime(value) {
    const parts = String(value || "").trim().replace(",", ".").split(":").map(Number);
    if (!parts.length || parts.some((part) => !Number.isFinite(part))) return NaN;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  function decodeYouTubeText(value) {
    const withoutTags = String(value || "").replace(/<[^>]*>/g, "");
    const parsed = new DOMParser().parseFromString(`<!doctype html><body>${withoutTags}`, "text/html");
    return String(parsed.body.textContent || "").replace(/\s+/g, " ").trim();
  }

  async function fetchTranscriptTextThroughBackground(url) {
    const response = await chrome.runtime.sendMessage({ type: "FETCH_TRANSCRIPT_TEXT", url });
    if (!response?.ok) throw new Error(response?.error || "字幕文件下载失败");
    return response.data;
  }

  function normalizeUrl(url) {
    if (!url) return "";
    if (url.startsWith("//")) return `https:${url}`;
    return url;
  }

  async function fetchTranscriptThroughBackground(url) {
    const response = await chrome.runtime.sendMessage({ type: "FETCH_TRANSCRIPT_JSON", url });
    if (!response?.ok) throw new Error(response?.error || "字幕文件下载失败");
    return response.data;
  }

  function cleanTitle(value) {
    return String(value || "未命名视频").replace(/\s+/g, " ").trim();
  }

  function readFirefoxYouTubeTracks() {
    try {
      const pageWindow = window.wrappedJSObject;
      if (!pageWindow) return [];
      const playerElement = pageWindow.document?.querySelector("#movie_player");
      const player = playerElement?.wrappedJSObject || playerElement;
      const response = player?.getPlayerResponse?.() || pageWindow.ytInitialPlayerResponse;
      const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      return Array.from(tracks, (track, index) => ({
        id: String(track.vssId || `${track.languageCode}-${index}`),
        language: String(track.languageCode || "unknown"),
        label: String(track.name?.simpleText || Array.from(track.name?.runs || [], (run) => run.text).join("") || track.languageCode),
        isAuto: track.kind === "asr",
        baseUrl: String(track.baseUrl || "")
      })).filter((track) => track.baseUrl);
    } catch {
      return [];
    }
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
