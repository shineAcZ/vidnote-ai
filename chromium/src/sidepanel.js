import { AiClient } from "./lib/ai-client.js";
import { get, getAll, put, remove } from "./lib/db.js";
import { headingSlug, markerCount, normalizeTimeMarkers, renderMarkdown, safeFileName, toObsidianMarkdown } from "./lib/markdown.js";
import { ensurePrompts, resetBuiltins, savePrompts } from "./lib/prompts.js";
import { loadSettings, requestApiPermission, saveSettings } from "./lib/settings.js";
import { formatTime, parseSubtitleFile, splitTranscript, transcriptToText } from "./lib/transcript.js";

const chrome = globalThis.chrome;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const aiClient = new AiClient();

const state = {
  activeTabId: null,
  context: null,
  transcript: [],
  track: null,
  settings: null,
  prompts: [],
  currentNote: null,
  savedNotes: [],
  activeJob: null,
  chunkStates: [],
  desiredStatus: null,
  lastActivityAt: null,
  aiPhase: "正在准备",
  editingPromptId: null,
  toastTimer: null,
  previewTimer: null,
  parallelRenderTimer: null,
  preparingJob: false,
  contextLoadSequence: 0,
  transcriptLoadSequence: 0
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  [state.settings, state.prompts] = await Promise.all([loadSettings(), ensurePrompts()]);
  populateSettingsForm();
  populatePromptSelectors();
  await recoverInterruptedJobs();
  await loadContext();
  await renderTasks();
  setInterval(updateElapsed, 1000);
  setInterval(syncPlaybackCue, 800);
}

function bindEvents() {
  $$(".tab").forEach((button) => button.addEventListener("click", () => activateTab(button.dataset.tab)));
  $("#refreshContext").addEventListener("click", loadContext);
  $("#loadTrack").addEventListener("click", () => loadSelectedTrack());
  $("#trackSelect").addEventListener("change", updateGenerationAvailability);
  $("#notePrompt").addEventListener("change", updateGenerationAvailability);
  $("#subtitleFile").addEventListener("change", importSubtitleFile);
  $("#transcriptSearch").addEventListener("input", renderTranscript);
  $("#goCurrentCue").addEventListener("click", () => syncPlaybackCue(true));
  $("#playbackPosition").addEventListener("click", () => syncPlaybackCue(true));
  $("#startGeneration").addEventListener("click", startNewJob);
  $("#pauseGeneration").addEventListener("click", togglePause);
  $("#cancelGeneration").addEventListener("click", cancelJob);
  $("#notePreview").addEventListener("click", handleTimeLink);
  $("#noteLibraryList").addEventListener("click", handleTimeLink);
  $("#copyNote").addEventListener("click", copyNote);
  $("#downloadNote").addEventListener("click", downloadNote);
  $("#settingsForm").addEventListener("submit", handleSettingsSave);
  $("#testConnection").addEventListener("click", () => testConnection());
  $("#provider").addEventListener("change", applyProviderPreset);
  $("#deepseekThinking").addEventListener("change", updateThinkingControls);
  $("#theme").addEventListener("change", handleThemeChange);
  $("#toggleApiKey").addEventListener("click", toggleApiKey);
  $("#temperature").addEventListener("input", () => $("#temperatureValue").textContent = $("#temperature").value);
  $("#promptSelect").addEventListener("change", () => showPrompt($("#promptSelect").value));
  $("#promptSegmented").addEventListener("change", updatePromptStrategyFields);
  $("#promptForm").addEventListener("submit", handlePromptSave);
  $("#newPrompt").addEventListener("click", createPrompt);
  $("#deletePrompt").addEventListener("click", deletePrompt);
  $("#resetPrompts").addEventListener("click", restorePrompts);

  chrome.tabs?.onActivated?.addListener(() => setTimeout(loadContext, 250));
  chrome.tabs?.onUpdated?.addListener((tabId, info) => {
    if (tabId === state.activeTabId && info.status === "complete") setTimeout(loadContext, 500);
  });
}

function activateTab(name) {
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${name}`));
  if (name === "tasks") renderTasks();
}

async function loadContext() {
  const loadSequence = ++state.contextLoadSequence;
  setVideoLoading();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("没有找到当前标签页");
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_VIDEO_CONTEXT" });
    if (!response?.ok) throw new Error(response?.error || "无法读取当前视频");
    if (loadSequence !== state.contextLoadSequence) return;

    state.activeTabId = tab.id;
    const changed = state.context?.videoKey !== response.context.videoKey;
    state.context = response.context;
    renderVideoCard();
    populateTracks();

    if (changed) {
      state.transcript = [];
      state.track = null;
      state.currentNote = null;
      state.savedNotes = [];
      const savedVideo = await get("videos", state.context.videoKey);
      if (loadSequence !== state.contextLoadSequence) return;
      if (savedVideo?.transcript?.length && !isObviouslyInvalidTranscript(savedVideo.transcript, state.context.duration)) {
        state.transcript = savedVideo.transcript;
        state.track = savedVideo.track || null;
        renderTranscript();
      } else if (state.context.tracks.length && state.settings.autoReadSubtitles) {
        const preferred = choosePreferredTrack(state.context.tracks);
        $("#trackSelect").value = String(state.context.tracks.indexOf(preferred));
        await loadSelectedTrack(false);
        if (loadSequence !== state.contextLoadSequence) return;
      } else {
        renderTranscript();
      }

      clearNote();
      await refreshNoteLibrary();
      if (loadSequence !== state.contextLoadSequence) return;
    } else if (!state.transcript.length && state.context.tracks.length && state.settings.autoReadSubtitles) {
      await loadSelectedTrack(false);
      if (loadSequence !== state.contextLoadSequence) return;
    }
    updateGenerationAvailability();
  } catch (error) {
    if (loadSequence !== state.contextLoadSequence) return;
    state.context = null;
    state.transcript = [];
    state.currentNote = null;
    state.savedNotes = [];
    $("#noteLibrary").classList.add("hidden");
    clearNote();
    renderVideoError(error.message.includes("Receiving end does not exist")
      ? "请打开 Bilibili 或 YouTube 视频页，然后刷新此面板"
      : error.message);
    updateGenerationAvailability();
  }
}

function setVideoLoading() {
  const card = $("#videoCard");
  card.className = "video-card";
  card.innerHTML = '<div class="skeleton-line wide"></div><div class="skeleton-line"></div><p>正在读取当前视频…</p>';
}

function renderVideoCard() {
  const card = $("#videoCard");
  card.className = "video-card ready";
  card.replaceChildren();
  const text = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = state.context.title;
  const meta = document.createElement("p");
  const duration = state.context.duration ? ` · ${formatTime(state.context.duration)}` : "";
  meta.textContent = `${state.context.tracks.length} 条字幕轨${duration}`;
  text.append(title, meta);
  const badge = document.createElement("span");
  badge.className = "platform-badge";
  badge.textContent = state.context.platform === "bilibili" ? "Bilibili" : "YouTube";
  card.append(text, badge);
}

function renderVideoError(message) {
  const card = $("#videoCard");
  card.className = "video-card error";
  card.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = "尚未连接视频";
  const detail = document.createElement("p");
  detail.textContent = message;
  card.append(title, detail);
}

function populateTracks(selectedTrack = null) {
  const select = $("#trackSelect");
  select.replaceChildren();
  if (!state.context?.tracks?.length) {
    select.add(new Option("网页没有提供可读取的字幕", ""));
    return;
  }
  state.context.tracks.forEach((track, index) => {
    select.add(new Option(`${track.label}${track.isAuto ? "（自动生成）" : ""}`, String(index)));
  });
  const preferred = findEquivalentTrack(state.context.tracks, selectedTrack)
    || choosePreferredTrack(state.context.tracks);
  select.value = String(state.context.tracks.indexOf(preferred));
}

function findEquivalentTrack(tracks, requestedTrack, fallbackIndex = -1, allowIndexFallback = false) {
  if (!requestedTrack) return allowIndexFallback ? tracks[fallbackIndex] || null : null;
  const language = String(requestedTrack.language || "").toLocaleLowerCase();
  const label = String(requestedTrack.label || "").trim().toLocaleLowerCase();
  return tracks.find((track) => String(track.id) === String(requestedTrack.id)
      && String(track.language || "").toLocaleLowerCase() === language)
    || tracks.find((track) => String(track.language || "").toLocaleLowerCase() === language
      && String(track.label || "").trim().toLocaleLowerCase() === label
      && Boolean(track.isAuto) === Boolean(requestedTrack.isAuto))
    || tracks.find((track) => language
      && String(track.language || "").toLocaleLowerCase() === language
      && Boolean(track.isAuto) === Boolean(requestedTrack.isAuto))
    || (allowIndexFallback ? tracks[fallbackIndex] || null : null);
}

function choosePreferredTrack(tracks) {
  return tracks.find((track) => track.isCurrent)
    || tracks.find((track) => /zh|中文|汉语/i.test(`${track.language} ${track.label}`) && !track.isAuto)
    || tracks.find((track) => /zh|中文|汉语/i.test(`${track.language} ${track.label}`))
    || tracks.find((track) => !track.isAuto)
    || tracks[0];
}

function isObviouslyInvalidTranscript(items, duration) {
  if (!items?.length) return true;
  const meaningful = items.filter((item) => {
    const normalized = String(item.text || "")
      .toLocaleLowerCase()
      .replace(/[♪♫♬🎵🎶\s~～·・.。!！?？\-—_()[\]【】]/g, "");
    return !/^(音乐|配乐|背景音乐|music|bgm|instrumental)*$/.test(normalized);
  });
  const coverage = Math.max(...items.map((item) => Number(item.end || item.start) || 0));
  return meaningful.length < Math.max(3, Math.ceil(items.length * 0.25))
    || (duration > 180 && coverage < Math.min(duration * 0.18, 120));
}

async function loadSelectedTrack(showFeedback = true) {
  if (!state.context) return;
  const index = Number($("#trackSelect").value);
  const track = state.context.tracks[index];
  if (!track) {
    if (showFeedback) showToast("请选择字幕语言，或导入 SRT/VTT 文件");
    return;
  }

  const loadSequence = ++state.transcriptLoadSequence;
  const tabId = state.activeTabId;
  const expectedVideoKey = state.context.videoKey;
  const expectedPageIdentity = contextPageIdentity(state.context);
  setTranscriptLoading();
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "GET_TRANSCRIPT",
      track,
      expectedPageIdentity
    });
    if (!response?.ok) throw new Error(response?.error || "字幕读取失败");
    if (loadSequence !== state.transcriptLoadSequence) return false;
    if (state.activeTabId !== tabId || state.context?.videoKey !== expectedVideoKey
      || response.pageIdentity !== expectedPageIdentity) {
      throw new Error("读取字幕期间视频页面已经切换，请重新读取当前视频字幕");
    }
    if (!response.transcript?.length || isObviouslyInvalidTranscript(response.transcript, state.context.duration)) {
      throw new Error("本次没有读取到有效字幕，已停止使用旧字幕");
    }
    state.transcript = response.transcript;
    state.track = track;
    await saveCurrentVideo();
    renderTranscript();
    updateGenerationAvailability();
    if (showFeedback) showToast(`已读取 ${state.transcript.length} 条字幕`);
    return true;
  } catch (error) {
    if (loadSequence !== state.transcriptLoadSequence) return false;
    state.transcript = [];
    state.track = null;
    renderTranscript();
    updateGenerationAvailability();
    showToast(error.message);
    return false;
  }
}

function contextPageIdentity(context) {
  if (!context) return "";
  try {
    const url = new URL(context.url);
    if (context.platform === "youtube") return `youtube:${url.searchParams.get("v") || ""}`;
    const bvid = url.pathname.match(/\/video\/(BV[\w]+)/i)?.[1] || "";
    return `bilibili:${bvid.toLocaleLowerCase()}:p${Math.max(1, Number(url.searchParams.get("p")) || 1)}`;
  } catch {
    return String(context.videoKey || "");
  }
}

function setTranscriptLoading() {
  $("#transcriptSummary").textContent = "正在读取字幕…";
  $("#transcriptList").replaceChildren();
  $("#transcriptEmpty").classList.add("hidden");
}

async function importSubtitleFile(event) {
  const file = event.target.files?.[0];
  if (!file || !state.context) return;
  try {
    state.transcript = parseSubtitleFile(await file.text(), file.name);
    state.track = { id: `import:${file.name}`, label: file.name, language: "imported", imported: true };
    await saveCurrentVideo();
    renderTranscript();
    updateGenerationAvailability();
    showToast(`已导入 ${state.transcript.length} 条字幕`);
  } catch (error) {
    showToast(error.message);
  } finally {
    event.target.value = "";
  }
}

async function saveCurrentVideo() {
  await put("videos", {
    id: state.context.videoKey,
    videoKey: state.context.videoKey,
    context: state.context,
    transcript: state.transcript,
    track: state.track,
    updatedAt: Date.now()
  });
}

function renderTranscript() {
  const list = $("#transcriptList");
  const empty = $("#transcriptEmpty");
  list.replaceChildren();
  if (!state.transcript.length) {
    $("#transcriptSummary").textContent = "尚未读取字幕";
    $("#playbackPosition").classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  $("#playbackPosition").classList.remove("hidden");
  const query = $("#transcriptSearch").value.trim().toLocaleLowerCase();
  const filtered = query
    ? state.transcript.filter((cue) => cue.text.toLocaleLowerCase().includes(query))
    : state.transcript;
  $("#transcriptSummary").textContent = query
    ? `找到 ${filtered.length} 条 · 全部 ${state.transcript.length} 条`
    : `${state.transcript.length} 条字幕 · ${formatTime(state.transcript.at(-1)?.end || 0)}`;

  const fragment = document.createDocumentFragment();
  for (const cue of filtered) {
    const button = document.createElement("button");
    button.className = "cue";
    button.dataset.time = String(cue.start);
    button.dataset.cueId = String(cue.id);
    const time = document.createElement("time");
    time.textContent = formatTime(cue.start);
    const text = document.createElement("span");
    text.className = "cue-text";
    appendHighlightedText(text, cue.text, query);
    button.append(time, text);
    button.addEventListener("click", () => seekTo(cue.start));
    fragment.append(button);
  }
  list.append(fragment);
}

function appendHighlightedText(parent, text, query) {
  if (!query) {
    parent.textContent = text;
    return;
  }
  const lower = text.toLocaleLowerCase();
  let position = 0;
  while (position < text.length) {
    const index = lower.indexOf(query, position);
    if (index < 0) {
      parent.append(document.createTextNode(text.slice(position)));
      break;
    }
    parent.append(document.createTextNode(text.slice(position, index)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(index, index + query.length);
    parent.append(mark);
    position = index + query.length;
  }
}

async function seekTo(seconds) {
  if (!state.activeTabId) return;
  try {
    await chrome.tabs.update(state.activeTabId, { active: true });
    const response = await chrome.tabs.sendMessage(state.activeTabId, {
      type: "SEEK_TO",
      seconds,
      play: state.settings.playOnSeek
    });
    if (!response?.ok) throw new Error(response?.error || "跳转失败");
  } catch (error) {
    showToast(error.message);
  }
}

async function syncPlaybackCue(forceScroll = false) {
  if (!state.activeTabId || !state.transcript.length) return;
  if (!forceScroll && !$("#tab-transcript").classList.contains("active")) return;
  try {
    const playback = await chrome.tabs.sendMessage(state.activeTabId, { type: "GET_CURRENT_TIME" });
    if (!playback?.ok) return;
    updatePlaybackPosition(playback.seconds);
    const cue = findCueAt(playback.seconds);
    if (!cue) return;
    $$(".cue.active").forEach((element) => element.classList.remove("active"));
    const element = document.querySelector(`.cue[data-cue-id="${CSS.escape(String(cue.id))}"]`);
    if (element) {
      element.classList.add("active");
      if (forceScroll) element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  } catch {
    // The active tab may be navigating; the next polling cycle will retry.
  }
}

function updatePlaybackPosition(seconds) {
  const duration = Number(state.context?.duration) || Number(state.transcript.at(-1)?.end) || 0;
  const percent = duration > 0 ? Math.max(0, Math.min(100, (seconds / duration) * 100)) : 0;
  $("#playbackTimeLabel").textContent = `当前 ${formatTime(seconds)}`;
  $("#playbackPercent").textContent = `${Math.round(percent)}%`;
  $("#playbackProgress").style.width = `${percent}%`;
  $("#playbackMarker").style.left = `${percent}%`;
}

function findCueAt(seconds) {
  let low = 0;
  let high = state.transcript.length - 1;
  let candidate = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (state.transcript[middle].start <= seconds) {
      candidate = state.transcript[middle];
      low = middle + 1;
    } else high = middle - 1;
  }
  return candidate && seconds <= candidate.end + 1.5 ? candidate : null;
}

function updateGenerationAvailability() {
  const ready = Boolean(state.context && state.transcript.length
    && !state.activeJob?.status?.includes("running") && !state.preparingJob);
  const prompt = state.prompts.find((item) => item.id === $("#notePrompt").value);
  $("#startGeneration").disabled = !ready;
  $("#generationHint").textContent = state.preparingJob
    ? "正在核对当前视频并重新读取所选字幕，确认无误后才会开始生成…"
    : !state.context
    ? "请先打开支持的视频页面。"
    : !state.transcript.length
      ? "请先读取或导入字幕。"
      : prompt?.oneShot
        ? `已准备 ${state.transcript.length} 条字幕，将整份一次性发送，不执行合并。`
        : `已准备 ${state.transcript.length} 条字幕，将按设置分块并发生成。`;
}

async function startNewJob() {
  if (!state.context || !state.transcript.length || state.preparingJob || state.activeJob?.status === "running") return;
  state.settings = await loadSettings();
  if (!state.settings.apiKey) {
    activateTab("settings");
    showToast("请先填写并测试 API 密钥");
    return;
  }
  state.preparingJob = true;
  updateGenerationAvailability();
  try {
    await refreshTranscriptBeforeGeneration();
  } catch (error) {
    state.transcript = [];
    state.track = null;
    renderTranscript();
    showToast(`未开始生成：${error.message}`);
    return;
  } finally {
    state.preparingJob = false;
    updateGenerationAvailability();
  }
  if (!state.context || !state.transcript.length) return;
  const prompt = state.prompts.find((item) => item.id === $("#notePrompt").value) || state.prompts[0];
  state.currentNote = null;
  clearNote();
  const chunks = prompt.oneShot ? [state.transcript] : splitTranscript(state.transcript, state.settings.chunkChars);
  const now = Date.now();
  const job = {
    id: crypto.randomUUID(),
    videoKey: state.context.videoKey,
    title: state.context.title,
    context: state.context,
    prompt,
    status: "running",
    stage: "准备字幕",
    chunksTotal: chunks.length,
    completedParts: Array(chunks.length).fill(""),
    mergeParts: [],
    currentChunk: 0,
    content: "",
    error: "",
    createdAt: now,
    startedAt: now,
    updatedAt: now
  };
  await put("jobs", job);
  runJob(job);
}

async function refreshTranscriptBeforeGeneration() {
  const previousContext = state.context;
  const previousIndex = Number($("#trackSelect").value);
  const requestedTrack = state.track?.imported
    ? state.track
    : previousContext?.tracks?.[previousIndex] || state.track;
  const previousTranscript = state.transcript;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("没有找到当前标签页");

  ++state.contextLoadSequence;
  const contextResponse = await chrome.tabs.sendMessage(tab.id, { type: "GET_VIDEO_CONTEXT" });
  if (!contextResponse?.ok) throw new Error(contextResponse?.error || "无法确认当前视频");
  const freshContext = contextResponse.context;
  const videoChanged = previousContext?.videoKey !== freshContext.videoKey;

  state.activeTabId = tab.id;
  state.context = freshContext;
  renderVideoCard();

  if (requestedTrack?.imported) {
    populateTracks();
    if (videoChanged) {
      state.transcript = [];
      state.track = null;
      renderTranscript();
      throw new Error("当前视频已经切换，原先导入的字幕不属于这个视频，请重新导入");
    }
    if (!previousTranscript?.length || isObviouslyInvalidTranscript(previousTranscript, freshContext.duration)) {
      state.transcript = [];
      state.track = null;
      renderTranscript();
      throw new Error("导入字幕已经无效，请重新导入后再生成");
    }
    state.transcript = previousTranscript;
    state.track = requestedTrack;
    await saveCurrentVideo();
    return;
  }

  const freshTrack = findEquivalentTrack(
    freshContext.tracks || [],
    requestedTrack,
    previousIndex,
    !videoChanged
  );
  populateTracks(freshTrack);
  state.transcript = [];
  state.track = null;
  renderTranscript();
  if (videoChanged) {
    state.currentNote = null;
    state.savedNotes = [];
    clearNote();
    await refreshNoteLibrary();
  }
  if (!freshTrack) {
    throw new Error("当前视频没有与原选择匹配的字幕轨，请在“完整字幕”中重新选择");
  }

  const loadSequence = ++state.transcriptLoadSequence;
  const expectedPageIdentity = contextPageIdentity(freshContext);
  setTranscriptLoading();
  const transcriptResponse = await chrome.tabs.sendMessage(tab.id, {
    type: "GET_TRANSCRIPT",
    track: freshTrack,
    expectedPageIdentity
  });
  if (loadSequence !== state.transcriptLoadSequence) throw new Error("字幕读取已被新的操作替换");
  if (!transcriptResponse?.ok) throw new Error(transcriptResponse?.error || "字幕读取失败");
  if (transcriptResponse.pageIdentity !== expectedPageIdentity) {
    throw new Error("读取字幕期间视频页面发生了切换");
  }
  if (!transcriptResponse.transcript?.length
    || isObviouslyInvalidTranscript(transcriptResponse.transcript, freshContext.duration)) {
    throw new Error("本次没有读取到有效字幕，旧字幕不会用于生成");
  }

  state.transcript = transcriptResponse.transcript;
  state.track = freshTrack;
  await saveCurrentVideo();
  renderTranscript();
  showToast(`已重新确认当前视频，并读取 ${state.transcript.length} 条字幕`);
}

async function runJob(job) {
  if (state.activeJob?.status === "running" && state.activeJob.id !== job.id) {
    showToast("已有任务正在运行");
    return;
  }
  state.activeJob = job;
  state.activeJob.status = "running";
  state.activeJob.startedAt ||= Date.now();
  state.desiredStatus = null;
  state.lastActivityAt = Date.now();
  state.aiPhase = "正在连接 AI";
  state.chunkStates = [];
  showProgress();
  updateGenerationAvailability();

  const videoRecord = await get("videos", job.videoKey);
  const transcript = videoRecord?.transcript || state.transcript;
  if (!transcript.length) {
    await failJob(job, "找不到这项任务使用的字幕，请重新读取字幕");
    return;
  }
  const oneShot = Boolean(job.prompt?.oneShot);
  const chunks = oneShot ? [transcript] : splitTranscript(transcript, state.settings.chunkChars);

  try {
    await processChunksConcurrently(job, chunks);

    throwIfStopped();
    let finalContent;
    if (oneShot) {
      job.stage = "一次性生成完成，正在检查时间戳";
      finalContent = job.completedParts[0];
      renderProgress(98);
    } else {
      job.stage = "正在组织章节并检查时间戳";
      job.updatedAt = Date.now();
      await put("jobs", job);
      renderProgress(92);
      finalContent = await mergeAllParts(job);
    }
    const content = normalizeTimeMarkers(ensureTitle(finalContent, job.title));
    clearPartialPreview();
    const note = {
      id: crypto.randomUUID(),
      jobId: job.id,
      videoKey: job.videoKey,
      title: job.title,
      content,
      context: job.context,
      promptName: job.prompt.name,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await put("notes", note);
    job.status = "completed";
    job.stage = "笔记生成完成";
    job.noteId = note.id;
    job.content = content;
    job.updatedAt = Date.now();
    await put("jobs", job);
    state.currentNote = note;
    state.activeJob = null;
    clearNote();
    hideProgress();
    await refreshNoteLibrary(note.id);
    showToast("笔记生成完成");
    await renderTasks();
    updateGenerationAvailability();
  } catch (error) {
    clearPartialPreview();
    const limited = error.status === 429 || error.status === 503;
    const status = state.desiredStatus || (error.cancelled || limited ? "paused" : "failed");
    job.status = status;
    job.activeRequests = 0;
    job.stage = limited
      ? "服务限额或拥堵持续存在，任务已暂停，可稍后继续"
      : status === "paused" ? "任务已暂停" : status === "cancelled" ? "任务已停止" : "生成遇到问题";
    job.error = status === "failed" ? error.message : "";
    job.updatedAt = Date.now();
    await put("jobs", job);
    state.activeJob = status === "paused" ? job : null;
    if (state.activeJob) renderProgress();
    else hideProgress();
    renderNote(job.content || completedContent(job), "已保留部分笔记", job);
    showToast(status === "failed" ? error.message : job.stage);
    await renderTasks();
    updateGenerationAvailability();
  }
}

async function processChunksConcurrently(job, chunks) {
  const previous = Array.isArray(job.completedParts) ? job.completedParts : [];
  job.completedParts = Array.from({ length: chunks.length }, (_, index) => previous[index] || "");
  const pending = chunks.map((_, index) => index).filter((index) => !job.completedParts[index]);
  if (!pending.length) return;

  const configured = Math.max(1, Math.min(2500, Number(state.settings.concurrency) || 8));
  const control = {
    configured,
    limit: Math.min(configured, pending.length)
  };
  const partials = new Map();
  const running = new Set();
  let cursor = 0;

  state.chunkStates = chunks.map((chunk, index) => ({
    index,
    start: chunk[0]?.start || 0,
    end: chunk.at(-1)?.end || 0,
    status: job.completedParts[index] ? "completed" : "queued",
    chars: job.completedParts[index]?.length || 0,
    retries: 0,
    startedAt: null,
    lastActivityAt: null,
    error: ""
  }));

  job.effectiveConcurrency = control.limit;
  job.activeRequests = 0;
  job.stage = job.prompt?.oneShot ? "一次性读取并整理完整字幕" : `并行整理字幕 · 并发 ${control.limit}`;
  await put("jobs", job);
  renderProgress();

  const launch = (index) => {
    const chunkState = state.chunkStates[index];
    chunkState.status = "connecting";
    chunkState.startedAt = Date.now();
    chunkState.lastActivityAt = Date.now();
    scheduleParallelRender();
    job.activeRequests += 1;
    const task = processChunk(job, chunks, index, partials, control)
      .catch((error) => {
        chunkState.status = error.cancelled ? "paused" : "failed";
        chunkState.error = error.message;
        scheduleParallelRender();
        throw error;
      })
      .finally(() => {
        job.activeRequests = Math.max(0, job.activeRequests - 1);
        partials.delete(index);
        running.delete(task);
        renderProgress();
      });
    running.add(task);
  };

  while (cursor < pending.length || running.size) {
    throwIfStopped();
    while (cursor < pending.length && running.size < control.limit) launch(pending[cursor++]);
    if (!running.size) break;
    try {
      await Promise.race(running);
    } catch (error) {
      aiClient.cancelAll();
      await Promise.allSettled([...running]);
      throw error;
    }
  }

  job.activeRequests = 0;
  job.currentChunk = completedPartCount(job);
  job.content = completedContent(job);
}

async function processChunk(job, chunks, index, partials, control) {
  let buffer = "";
  const chunkState = state.chunkStates[index];
  const messages = buildChunkMessages(job, chunks[index], index, chunks.length);
  await generateWithRetry(messages, (text) => {
    buffer = text;
    chunkState.status = text ? "writing" : "connecting";
    chunkState.chars = text.length;
    chunkState.lastActivityAt = Date.now();
    partials.set(index, text);
    state.lastActivityAt = Date.now();
    state.aiPhase = "正在生成笔记内容";
    const preview = job.completedParts
      .map((part, partIndex) => part || partials.get(partIndex) || "")
      .filter(Boolean)
      .join("\n\n---\n\n");
    schedulePartialPreview(preview);
    scheduleParallelRender();
  }, {
    onReasoning() {
      chunkState.status = "thinking";
      chunkState.lastActivityAt = Date.now();
      scheduleParallelRender();
    },
    onThrottle(error, delay) {
      const previousLimit = control.limit;
      control.limit = Math.max(1, Math.floor(control.limit / 2));
      job.effectiveConcurrency = control.limit;
      job.stage = `${error.status} 限速：并发 ${previousLimit} → ${control.limit}，${Math.ceil(delay / 1000)} 秒后重试`;
      chunkState.status = "retrying";
      chunkState.retries += 1;
      chunkState.error = error.message;
      chunkState.lastActivityAt = Date.now();
      scheduleParallelRender();
      renderProgress();
    },
    onRetry(error) {
      if (error.status === 429 || error.status === 503) return;
      chunkState.status = "retrying";
      chunkState.retries += 1;
      chunkState.error = error.message;
      chunkState.lastActivityAt = Date.now();
      scheduleParallelRender();
    }
  });
  if (!buffer.trim()) throw new Error(`第 ${index + 1} 个字幕块返回了空内容`);

  job.completedParts[index] = buffer.trim();
  chunkState.status = "completed";
  chunkState.chars = buffer.trim().length;
  chunkState.lastActivityAt = Date.now();
  chunkState.error = "";
  job.currentChunk = completedPartCount(job);
  job.content = completedContent(job);
  job.stage = job.prompt?.oneShot ? "一次性内容已生成" : `并行整理字幕 · 已完成 ${job.currentChunk} / ${chunks.length}`;
  job.updatedAt = Date.now();
  await put("jobs", job);
  scheduleParallelRender();
  renderProgress();
}

function buildChunkMessages(job, chunk, index, total) {
  return [
    { role: "system", content: job.prompt.systemPrompt },
    {
      role: "user",
      content: `${job.prompt.chunkPrompt}\n\n视频标题：${job.title}\n当前片段：${index + 1} / ${total}\n片段时间：${formatTime(chunk[0].start)} - ${formatTime(chunk.at(-1).end)}\n\n字幕内容：\n${transcriptToText(chunk)}`
    }
  ];
}

async function mergeAllParts(job) {
  let parts = job.completedParts.filter(Boolean);
  if (parts.length === 1) return parts[0];
  let round = 1;

  while (parts.length > 1) {
    const groups = groupByCharacters(parts, 480000);
    const merged = [];
    for (let index = 0; index < groups.length; index++) {
      throwIfStopped();
      job.stage = `正在合并笔记 · 第 ${round} 轮 ${index + 1} / ${groups.length}`;
      renderProgress(92 + Math.min(7, (index / groups.length) * 7));
      if (groups[index].length === 1 && groups.length > 1) {
        merged.push(groups[index][0]);
        continue;
      }
      let buffer = "";
      const messages = [
        { role: "system", content: job.prompt.systemPrompt },
        {
          role: "user",
          content: `${job.prompt.mergePrompt}\n\n视频标题：${job.title}\n\n分段笔记：\n${groups[index].join("\n\n--- 分段边界 ---\n\n")}`
        }
      ];
      await generateWithRetry(messages, (text) => {
        buffer = text;
        state.lastActivityAt = Date.now();
        state.aiPhase = "正在生成笔记内容";
        schedulePartialPreview(buffer);
      });
      if (!buffer.trim()) throw new Error("合并笔记时 AI 返回了空内容");
      merged.push(buffer.trim());
    }
    job.mergeParts = merged;
    job.updatedAt = Date.now();
    await put("jobs", job);
    parts = merged;
    round += 1;
    if (round > 6) return parts.join("\n\n---\n\n");
  }
  return parts[0];
}

function groupByCharacters(parts, limit) {
  const groups = [];
  let group = [];
  let length = 0;
  for (const part of parts) {
    if (group.length && length + part.length > limit) {
      groups.push(group);
      group = [];
      length = 0;
    }
    group.push(part);
    length += part.length;
  }
  if (group.length) groups.push(group);
  return groups;
}

async function generateWithRetry(messages, onProgress, options = {}) {
  let combinedText = "";
  let requestMessages = messages;
  for (let continuation = 0; continuation < 3; continuation++) {
    const segment = await generateRequestWithRetry(requestMessages, (text) => onProgress(combinedText + text), options);
    combinedText += segment.text;
    onProgress(combinedText);
    if (segment.finishReason !== "length") return;
    if (continuation >= 2) break;

    if (state.activeJob) {
      state.activeJob.stage = `输出达到长度上限，正在自动续写 · ${continuation + 1} / 2`;
      renderProgress();
    }
    options.onContinuation?.(continuation + 1);
    const tail = combinedText.slice(-24000);
    requestMessages = [
      ...messages,
      {
        role: "user",
        content: `上一次 Markdown 输出因为长度上限被截断。请从截断的位置继续，只输出尚未完成的后续内容，不要重复前文，不要重新写标题，也不要解释。\n\n上一次输出末尾：\n${tail}`
      }
    ];
  }
  throw new Error("AI 连续多次达到输出长度上限；已完成的其他字幕块仍然保留，请减小字幕块后重试");
}

async function generateRequestWithRetry(messages, onProgress, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    throwIfStopped();
    try {
      let attemptText = "";
      onProgress("");
      const result = await aiClient.generate(
        state.settings,
        messages,
        (delta) => {
          state.aiPhase = "正在生成笔记内容";
          attemptText += delta;
          onProgress(attemptText);
        },
        () => {
          state.aiPhase = "AI 正在思考";
          state.lastActivityAt = Date.now();
          options.onReasoning?.();
          renderProgress();
        }
      );
      if (result.finishReason === "content_filter") {
        const error = new Error("AI 因内容安全规则停止了输出");
        error.nonRetryable = true;
        throw error;
      }
      if (result.finishReason === "insufficient_system_resource") {
        const error = new Error("AI 服务推理资源暂时不足");
        error.status = 503;
        throw error;
      }
      return { text: attemptText, finishReason: result.finishReason || "stop" };
    } catch (error) {
      lastError = error;
      const constrained = error.status === 429 || error.status === 503;
      const finalAttempt = constrained ? attempt === 4 : attempt === 2;
      if (error.cancelled || error.nonRetryable || /认证失败|API 密钥|模型权限/.test(error.message) || finalAttempt) throw error;
      const retryAfterSeconds = Number(error.retryAfter);
      const serverDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0;
      const delay = Math.min(30000, serverDelay || (constrained ? 3000 : 2000) * (2 ** attempt) + Math.round(Math.random() * 750));
      if (constrained) options.onThrottle?.(error, delay);
      options.onRetry?.(error, delay);
      if (state.activeJob) {
        if (!constrained) state.activeJob.stage = `连接中断，${Math.ceil(delay / 1000)} 秒后自动重试`;
        renderProgress();
      }
      await wait(delay);
    }
  }
  throw lastError;
}

function throwIfStopped() {
  if (!state.desiredStatus) return;
  const error = new Error("任务已停止");
  error.cancelled = true;
  throw error;
}

function schedulePartialPreview(content) {
  clearTimeout(state.previewTimer);
  const jobId = state.activeJob?.id;
  state.previewTimer = setTimeout(() => {
    state.previewTimer = null;
    if (!state.activeJob || state.activeJob.id !== jobId || state.activeJob.status !== "running") return;
    renderNote(content, "正在生成…", state.activeJob);
  }, 120);
}

function clearPartialPreview() {
  clearTimeout(state.previewTimer);
  state.previewTimer = null;
}

function scheduleParallelRender() {
  clearTimeout(state.parallelRenderTimer);
  state.parallelRenderTimer = setTimeout(() => {
    state.parallelRenderTimer = null;
    renderParallelChunks();
  }, 100);
}

function renderParallelChunks() {
  const list = $("#parallelJobs");
  if (!list) return;
  list.replaceChildren();
  const states = state.chunkStates || [];
  if (!states.length) {
    $("#parallelSummary").textContent = "等待开始";
    return;
  }

  const counts = Object.groupBy
    ? Object.groupBy(states, (item) => item.status)
    : states.reduce((groups, item) => ((groups[item.status] ||= []).push(item), groups), {});
  const active = states.filter((item) => ["connecting", "thinking", "writing", "retrying"].includes(item.status)).length;
  const completed = counts.completed?.length || 0;
  $("#parallelSummary").textContent = `${active} 个进行中 · ${completed}/${states.length} 完成`;

  for (const item of states) {
    const card = document.createElement("div");
    const activeState = ["connecting", "thinking", "writing", "retrying"].includes(item.status);
    card.className = `parallel-job ${activeState ? "active" : item.status}`.trim();

    const index = document.createElement("span");
    index.className = "parallel-index";
    index.textContent = `#${String(item.index + 1).padStart(2, "0")}`;

    const main = document.createElement("div");
    main.className = "parallel-main";
    const range = document.createElement("strong");
    range.textContent = `${formatTime(item.start)} – ${formatTime(item.end)}`;
    const detail = document.createElement("span");
    const elapsed = item.startedAt && activeState ? ` · ${formatShortElapsed(Date.now() - item.startedAt)}` : "";
    const retries = item.retries ? ` · 重试 ${item.retries}` : "";
    detail.textContent = `${item.chars.toLocaleString()} 字符${elapsed}${retries}`;
    if (item.error) detail.title = item.error;
    main.append(range, detail);

    const status = document.createElement("span");
    status.className = `chunk-status ${item.status}`;
    status.textContent = chunkStatusLabel(item.status);
    card.append(index, main, status);
    list.append(card);
  }
}

function chunkStatusLabel(status) {
  return ({
    queued: "等待中",
    connecting: "连接中",
    thinking: "思考中",
    writing: "生成中",
    retrying: "重试中",
    completed: "已完成",
    paused: "已暂停",
    failed: "失败"
  })[status] || status;
}

function formatShortElapsed(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function showProgress() {
  $("#progressCard").classList.remove("hidden");
  $("#noteEmpty").classList.add("hidden");
  renderProgress();
}

function renderProgress(forcedPercent) {
  const job = state.activeJob;
  if (!job) return;
  const completed = completedPartCount(job);
  const base = job.chunksTotal ? (completed / job.chunksTotal) * 90 : 0;
  const percent = Math.max(0, Math.min(100, forcedPercent ?? (job.status === "completed" ? 100 : base)));
  $("#progressStage").textContent = job.stage;
  $("#progressPercent").textContent = `${Math.round(percent)}%`;
  $("#progressBar").style.width = `${percent}%`;
  const parallel = job.activeRequests ? ` · 正在并行 ${job.activeRequests}/${job.effectiveConcurrency || 1}` : "";
  $("#progressChunk").textContent = `字幕块 ${completed} / ${job.chunksTotal}${parallel}`;
  $("#progressActivity").textContent = state.lastActivityAt
    ? `${state.aiPhase} · 最近响应 ${Math.max(0, Math.round((Date.now() - state.lastActivityAt) / 1000))} 秒前`
    : "正在准备…";
  const paused = job.status === "paused";
  $("#pauseGeneration").textContent = paused ? "继续生成" : "暂停";
  $("#cancelGeneration").classList.toggle("hidden", job.status !== "running" && !paused);
  scheduleParallelRender();
}

function hideProgress() {
  $("#progressCard").classList.add("hidden");
}

function updateElapsed() {
  const job = state.activeJob;
  if (!job) return;
  const seconds = Math.max(0, Math.floor((Date.now() - job.startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  $("#progressElapsed").textContent = `已运行 ${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  renderProgress();
}

function togglePause() {
  if (!state.activeJob) return;
  if (state.activeJob.status === "paused") {
    state.desiredStatus = null;
    runJob(state.activeJob);
    return;
  }
  state.desiredStatus = "paused";
  aiClient.cancelAll();
}

function cancelJob() {
  if (!state.activeJob) return;
  state.desiredStatus = "cancelled";
  aiClient.cancelAll();
}

async function failJob(job, message) {
  job.status = "failed";
  job.error = message;
  job.stage = "生成遇到问题";
  job.updatedAt = Date.now();
  await put("jobs", job);
  state.activeJob = null;
  showToast(message);
  await renderTasks();
}

function ensureTitle(content, title) {
  const text = String(content || "").trim();
  if (/^#\s+/m.test(text)) return text;
  return `# ${title}\n\n${text}`;
}

function renderNote(content, statusTitle = "笔记", metadata = {}) {
  if (!content?.trim()) return;
  $("#noteEmpty").classList.add("hidden");
  $("#noteResult").classList.remove("hidden");
  $("#noteStatusTitle").textContent = statusTitle;
  const savedState = metadata.promptName ? " · 已保存到本地" : metadata.completedParts ? " · 进度已保存" : "";
  $("#noteStats").textContent = `${content.length.toLocaleString()} 字符 · ${markerCount(content)} 个时间戳${savedState}`;
  $("#notePreview").innerHTML = renderMarkdown(content, { anchorPrefix: "current-note" });
  $("#copyNote").disabled = !state.context;
  $("#downloadNote").disabled = !state.context;
  if (metadata.content && !state.currentNote && metadata.status === "completed") state.currentNote = metadata;
}

function clearNote() {
  $("#noteResult").classList.add("hidden");
  $("#notePreview").replaceChildren();
  updateNoteEmpty();
}

async function refreshNoteLibrary(openNoteId = null) {
  if (!state.context) {
    state.savedNotes = [];
    $("#noteLibrary").classList.add("hidden");
    updateNoteEmpty();
    return;
  }
  const notes = await getAll("notes");
  state.savedNotes = notes
    .filter((note) => note.videoKey === state.context.videoKey)
    .sort((a, b) => Number(b.createdAt || b.updatedAt) - Number(a.createdAt || a.updatedAt));
  state.currentNote = state.savedNotes[0] || null;
  renderNoteLibrary(openNoteId || state.savedNotes[0]?.id);
}

function renderNoteLibrary(openNoteId = null) {
  const library = $("#noteLibrary");
  const list = $("#noteLibraryList");
  list.replaceChildren();
  library.classList.toggle("hidden", !state.savedNotes.length);
  $("#noteLibraryCount").textContent = `${state.savedNotes.length} 份`;

  state.savedNotes.forEach((note, index) => {
    const normalizedContent = normalizeTimeMarkers(note.content);
    const details = document.createElement("details");
    details.className = "saved-note";
    details.dataset.noteId = note.id;

    const summary = document.createElement("summary");
    const title = document.createElement("div");
    title.className = "saved-note-title";
    const name = document.createElement("strong");
    name.textContent = note.promptName || `视频笔记 ${state.savedNotes.length - index}`;
    const metadata = document.createElement("span");
    metadata.textContent = `${formatDate(note.createdAt)} · ${normalizedContent.length.toLocaleString()} 字符 · ${markerCount(normalizedContent)} 个时间戳`;
    title.append(name, metadata);
    const badge = document.createElement("span");
    badge.className = "saved-note-badge";
    badge.textContent = index === 0 ? "最新" : `第 ${state.savedNotes.length - index} 份`;
    summary.append(title, badge);

    const body = document.createElement("div");
    body.className = "saved-note-body";
    const actions = document.createElement("div");
    actions.className = "saved-note-actions";
    actions.append(
      savedNoteButton("复制", () => copySavedNote(note)),
      savedNoteButton("导出 Obsidian", () => downloadSavedNote(note), "primary-compact"),
      savedNoteButton("删除", () => deleteSavedNote(note), "danger")
    );
    const preview = document.createElement("article");
    preview.className = "saved-note-preview markdown-body";
    body.append(actions, preview);
    details.append(summary, body);

    const renderContent = () => {
      if (details.open && !preview.childNodes.length) {
        preview.innerHTML = renderMarkdown(normalizedContent, { anchorPrefix: `saved-${note.id}` });
      }
    };
    details.addEventListener("toggle", renderContent);
    if (note.id === openNoteId) {
      details.open = true;
      renderContent();
    }
    list.append(details);
  });
  updateNoteEmpty();
}

function savedNoteButton(label, onClick, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `compact-button ${extraClass}`.trim();
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

async function deleteSavedNote(note) {
  if (!confirm(`确定删除“${note.promptName || "这份笔记"}”吗？删除后不能恢复。`)) return;
  await remove("notes", note.id);
  if (note.jobId) await remove("jobs", note.jobId);
  if (state.currentNote?.id === note.id) state.currentNote = null;
  await refreshNoteLibrary();
  await renderTasks();
  showToast("笔记已删除");
}

function updateNoteEmpty() {
  const hasPreview = !$("#noteResult").classList.contains("hidden");
  $("#noteEmpty").classList.toggle("hidden", hasPreview || state.savedNotes.length > 0);
}

async function handleTimeLink(event) {
  const copyButton = event.target.closest(".code-copy");
  if (copyButton) {
    event.preventDefault();
    const code = copyButton.closest(".code-block")?.querySelector("code")?.textContent || "";
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      copyButton.textContent = "已复制";
      copyButton.classList.add("copied");
      setTimeout(() => {
        copyButton.textContent = "复制";
        copyButton.classList.remove("copied");
      }, 1400);
    } catch {
      showToast("复制失败，请手动选择代码复制");
    }
    return;
  }

  const button = event.target.closest(".time-link");
  if (button) {
    event.preventDefault();
    seekTo(Number(button.dataset.time));
    return;
  }

  const anchor = event.target.closest(".note-anchor");
  if (!anchor) return;
  event.preventDefault();
  const preview = anchor.closest(".markdown-body");
  if (!preview) return;
  const wanted = headingSlug(anchor.dataset.noteTarget || anchor.getAttribute("href")?.replace(/^#/, "") || "");
  const headings = [...preview.querySelectorAll(".note-heading[data-note-heading]")];
  const target = headings.find((heading) => heading.dataset.noteHeading === wanted)
    || headings.find((heading) => heading.dataset.noteHeading.endsWith(`-${wanted}`) || wanted.endsWith(`-${heading.dataset.noteHeading}`));
  if (!target) {
    showToast("没有找到对应标题，可能是 AI 生成的目录名称与正文标题不一致");
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.focus({ preventScroll: true });
  target.classList.remove("note-heading-flash");
  void target.offsetWidth;
  target.classList.add("note-heading-flash");
  target.addEventListener("animationend", () => target.classList.remove("note-heading-flash"), { once: true });
}

function currentNoteContent() {
  return state.currentNote?.content || state.activeJob?.content || (state.activeJob ? completedContent(state.activeJob) : "");
}

function completedPartCount(job) {
  return job?.completedParts?.filter((part) => Boolean(part?.trim())).length || 0;
}

function completedContent(job) {
  return job?.completedParts?.filter((part) => Boolean(part?.trim())).join("\n\n---\n\n") || "";
}

function exportedMarkdown() {
  return exportedMarkdownFor({
    title: state.context.title,
    content: currentNoteContent(),
    context: state.context
  });
}

function exportedMarkdownFor(note) {
  const context = note.context || state.context;
  const content = note.content || "";
  const generatedAt = new Date().toISOString();
  const frontmatter = `---\ntitle: ${JSON.stringify(note.title || context.title)}\nsource: ${JSON.stringify(context.url)}\nplatform: ${context.platform}\ngenerated: ${generatedAt}\n---\n\n`;
  return frontmatter + toObsidianMarkdown(content, context.url);
}

async function copyNote() {
  if (!currentNoteContent() || !state.context) return;
  await navigator.clipboard.writeText(exportedMarkdown());
  showToast("已复制 Obsidian 兼容 Markdown");
}

async function downloadNote() {
  if (!currentNoteContent() || !state.context) return;
  const blob = new Blob([exportedMarkdown()], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: `${safeFileName(state.context.title)}.md`,
      saveAs: true
    });
    showToast("已生成 Obsidian Markdown");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

async function copySavedNote(note) {
  await navigator.clipboard.writeText(exportedMarkdownFor(note));
  showToast("已复制这份笔记");
}

async function downloadSavedNote(note) {
  const context = note.context || state.context;
  const blob = new Blob([exportedMarkdownFor(note)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: `${safeFileName(note.title || context.title)} - ${safeFileName(note.promptName || "视频笔记")}.md`,
      saveAs: true
    });
    showToast("已导出这份笔记");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

async function renderTasks() {
  const jobs = (await getAll("jobs")).sort((a, b) => b.updatedAt - a.updatedAt);
  const list = $("#taskList");
  list.replaceChildren();
  $("#taskEmpty").classList.toggle("hidden", jobs.length > 0);
  for (const job of jobs) {
    const card = document.createElement("article");
    card.className = "task-card";
    const top = document.createElement("div");
    top.className = "task-card-top";
    const heading = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = job.title;
    const meta = document.createElement("p");
    meta.textContent = `${job.prompt?.name || "AI 笔记"} · ${completedPartCount(job)}/${job.chunksTotal || 0} 个字幕块 · ${formatDate(job.updatedAt)}`;
    heading.append(title, meta);
    const status = document.createElement("span");
    status.className = `status-pill ${job.status}`;
    status.textContent = statusLabel(job.status);
    top.append(heading, status);

    const actions = document.createElement("div");
    actions.className = "task-actions";
    if (job.noteId || job.content) {
      const view = document.createElement("button");
      view.className = "compact-button";
      view.textContent = "查看";
      view.addEventListener("click", () => viewTask(job));
      actions.append(view);
    }
    if (["paused", "failed", "cancelled"].includes(job.status)) {
      const resume = document.createElement("button");
      resume.className = "compact-button primary-compact";
      resume.textContent = "继续";
      resume.addEventListener("click", () => resumeTask(job));
      actions.append(resume);
    }
    const discard = document.createElement("button");
    discard.className = "compact-button";
    discard.textContent = "删除记录";
    discard.addEventListener("click", async () => {
      await remove("jobs", job.id);
      await renderTasks();
    });
    actions.append(discard);
    card.append(top, actions);
    list.append(card);
  }
}

async function viewTask(job) {
  const note = job.noteId ? await get("notes", job.noteId) : null;
  const content = note?.content || job.content;
  if (!content) return;
  state.currentNote = note || { content, context: job.context };
  if (state.context?.videoKey === job.videoKey) {
    if (note) {
      clearNote();
      await refreshNoteLibrary(note.id);
    } else renderNote(content, statusLabel(job.status), job);
  } else showToast("请先打开这项任务对应的视频，再使用时间跳转和导出");
  activateTab("note");
}

async function resumeTask(job) {
  if (!state.context || state.context.videoKey !== job.videoKey) {
    showToast("请先打开这项任务对应的视频页面");
    return;
  }
  state.settings = await loadSettings();
  if (!state.settings.apiKey) {
    activateTab("settings");
    showToast("请先填写 API 密钥");
    return;
  }
  activateTab("note");
  runJob(job);
}

async function recoverInterruptedJobs() {
  const jobs = await getAll("jobs");
  for (const job of jobs.filter((item) => item.status === "running")) {
    job.status = "paused";
    job.stage = "浏览器上次关闭，任务已安全暂停";
    job.updatedAt = Date.now();
    await put("jobs", job);
  }
}

function populateSettingsForm() {
  for (const key of ["provider", "baseUrl", "apiKey", "model", "deepseekThinking", "reasoningEffort", "temperature", "maxTokens", "chunkChars", "concurrency", "autoReadSubtitles", "playOnSeek", "theme"]) {
    const element = $(`#${key}`);
    if (!element) continue;
    if (element.type === "checkbox") element.checked = Boolean(state.settings[key]);
    else element.value = state.settings[key];
  }
  $("#temperatureValue").textContent = state.settings.temperature;
  updateThinkingControls();
  applyTheme(state.settings.theme);
}

function readSettingsForm() {
  return {
    provider: $("#provider").value,
    baseUrl: $("#baseUrl").value,
    apiKey: $("#apiKey").value,
    model: $("#model").value,
    deepseekThinking: $("#deepseekThinking").checked,
    reasoningEffort: $("#reasoningEffort").value,
    temperature: $("#temperature").value,
    maxTokens: $("#maxTokens").value,
    chunkChars: $("#chunkChars").value,
    concurrency: $("#concurrency").value,
    autoReadSubtitles: $("#autoReadSubtitles").checked,
    playOnSeek: $("#playOnSeek").checked,
    theme: $("#theme").value
  };
}

function validateSettingsValues(values) {
  let apiUrl;
  try {
    apiUrl = new URL(String(values.baseUrl || "").trim());
  } catch {
    throw new Error("请输入有效的 API 地址，例如 https://api.deepseek.com");
  }
  if (!["https:", "http:"].includes(apiUrl.protocol)) throw new Error("API 地址必须使用 HTTP 或 HTTPS");
  if (!String(values.model || "").trim()) throw new Error("请填写模型名称");
  const checks = [
    ["单次最大输出 Token", values.maxTokens, 512, 384000],
    ["每个字幕块字符数", values.chunkChars, 2000, 800000],
    ["并发请求数", values.concurrency, 1, 2500],
    ["随机性", values.temperature, 0, 1]
  ];
  for (const [label, rawValue, minimum, maximum] of checks) {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new Error(`${label}应在 ${minimum}–${maximum} 之间`);
    }
  }
}

async function handleSettingsSave(event) {
  event.preventDefault();
  setSettingsStatus("正在保存…");
  const saveButton = $("#settingsForm button[type=submit]");
  saveButton.disabled = true;
  let saved = false;
  try {
    const values = readSettingsForm();
    validateSettingsValues(values);
    state.settings = await saveSettings(values);
    saved = true;
    applyTheme(state.settings.theme);
    if (state.settings.autoReadSubtitles && state.context && !state.transcript.length && state.context.tracks.length) {
      await loadSelectedTrack(false);
    }
    setSettingsStatus("设置已保存 · 正在自动测试接口…", "success");
    showToast("设置已保存，正在测试 AI 接口");
    const granted = await requestApiPermission(state.settings.baseUrl);
    if (!granted) throw new Error("未允许扩展访问该 API 地址");
    const result = await runConnectionTest(state.settings);
    setSettingsStatus(`设置已保存 · 接口可用 · ${result}`, "success");
    showToast("设置已保存，AI 接口连接成功");
  } catch (error) {
    const prefix = saved ? "设置已保存，但自动测试失败：" : "保存失败：";
    setSettingsStatus(`${prefix}${error.message}`, "error");
    if (saved) showToast("设置已经保存，但 AI 接口暂不可用");
  } finally {
    saveButton.disabled = false;
  }
}

async function testConnection() {
  setSettingsStatus("正在连接 AI 服务…");
  $("#testConnection").disabled = true;
  try {
    const values = readSettingsForm();
    validateSettingsValues(values);
    const granted = await requestApiPermission(values.baseUrl);
    if (!granted) throw new Error("未获得 API 地址访问权限");
    state.settings = await saveSettings(values);
    const result = await runConnectionTest(state.settings);
    setSettingsStatus(`连接成功 · ${result}`, "success");
  } catch (error) {
    setSettingsStatus(error.message, "error");
  } finally {
    $("#testConnection").disabled = false;
  }
}

async function runConnectionTest(config) {
  if (!String(config?.apiKey || "").trim()) throw new Error("请填写 API 密钥");
  const response = await chrome.runtime.sendMessage({ type: "AI_TEST", config });
  if (!response?.ok) throw new Error(response?.error || "连接测试失败");
  return response.result || "服务已响应";
}

function applyProviderPreset() {
  if ($("#provider").value === "deepseek") {
    $("#baseUrl").value = "https://api.deepseek.com";
    $("#model").value = "deepseek-v4-flash";
  }
  updateThinkingControls();
}

function updateThinkingControls() {
  const isDeepSeek = $("#provider").value === "deepseek";
  $("#deepseekThinkingGroup").classList.toggle("hidden", !isDeepSeek);
  $("#reasoningEffort").disabled = !isDeepSeek || !$("#deepseekThinking").checked;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = ["light", "dark"].includes(theme) ? theme : "system";
}

async function handleThemeChange() {
  const theme = $("#theme").value;
  applyTheme(theme);
  state.settings = await saveSettings({ ...state.settings, theme });
  setSettingsStatus("主题已保存", "success");
}

function toggleApiKey() {
  const input = $("#apiKey");
  input.type = input.type === "password" ? "text" : "password";
  $("#toggleApiKey").textContent = input.type === "password" ? "显示" : "隐藏";
}

function setSettingsStatus(message, type = "") {
  const element = $("#settingsStatus");
  element.textContent = message;
  element.className = `form-status ${type}`.trim();
}

function populatePromptSelectors(selectedId) {
  for (const id of ["notePrompt", "promptSelect"]) {
    const select = $(`#${id}`);
    select.replaceChildren();
    for (const prompt of state.prompts) {
      const suffix = !prompt.oneShot && !prompt.name.startsWith("分段") ? " · 分段" : "";
      select.add(new Option(`${prompt.name}${suffix}`, prompt.id));
    }
    if (selectedId && state.prompts.some((item) => item.id === selectedId)) select.value = selectedId;
  }
  const initial = selectedId || state.prompts[0]?.id;
  if (initial) showPrompt(initial);
}

function showPrompt(id) {
  const prompt = state.prompts.find((item) => item.id === id);
  if (!prompt) return;
  state.editingPromptId = prompt.id;
  $("#promptSelect").value = prompt.id;
  $("#promptName").value = prompt.name;
  $("#promptMode").value = prompt.mode;
  $("#promptSegmented").checked = !prompt.oneShot;
  $("#systemPrompt").value = prompt.systemPrompt;
  $("#chunkPrompt").value = prompt.chunkPrompt;
  $("#mergePrompt").value = prompt.mergePrompt;
  updatePromptStrategyFields();
  $("#deletePrompt").disabled = Boolean(prompt.builtin);
}

function createPrompt() {
  state.editingPromptId = null;
  $("#promptName").value = "我的新模板";
  $("#promptMode").value = "detailed";
  $("#promptSegmented").checked = false;
  $("#systemPrompt").value = "你是一名严谨的视频笔记整理员。只能根据字幕内容输出中文 Markdown，不得编造。";
  $("#chunkPrompt").value = "请按字幕顺序整理下面的内容，并为关键内容保留 {{t:秒数|HH:MM:SS}} 时间标记。";
  $("#mergePrompt").value = "请合并分段笔记，保留所有实质内容与时间标记，统一 Markdown 标题层级。";
  updatePromptStrategyFields();
  $("#deletePrompt").disabled = true;
  $("#promptName").focus();
}

async function handlePromptSave(event) {
  event.preventDefault();
  const existing = state.prompts.find((item) => item.id === state.editingPromptId);
  const prompt = {
    id: existing?.id || `custom-${crypto.randomUUID()}`,
    builtin: Boolean(existing?.builtin),
    name: $("#promptName").value.trim(),
    mode: $("#promptMode").value,
    oneShot: !$("#promptSegmented").checked,
    systemPrompt: $("#systemPrompt").value.trim(),
    chunkPrompt: $("#chunkPrompt").value.trim(),
    mergePrompt: $("#mergePrompt").value.trim()
  };
  if (!prompt.name || !prompt.systemPrompt || !prompt.chunkPrompt || (!prompt.oneShot && !prompt.mergePrompt)) {
    showToast("请填写完整的模板内容");
    return;
  }
  if (existing) state.prompts = state.prompts.map((item) => item.id === existing.id ? prompt : item);
  else state.prompts.push(prompt);
  await savePrompts(state.prompts);
  populatePromptSelectors(prompt.id);
  $("#notePrompt").value = prompt.id;
  showToast("提示词模板已保存");
}

function updatePromptStrategyFields() {
  const segmented = $("#promptSegmented").checked;
  $("#chunkPromptLabel").textContent = segmented ? "分段整理提示词" : "完整字幕生成提示词";
  $("#mergePromptFields").classList.toggle("hidden", !segmented);
  $("#mergePrompt").required = segmented;
}

async function deletePrompt() {
  const prompt = state.prompts.find((item) => item.id === state.editingPromptId);
  if (!prompt || prompt.builtin) return;
  state.prompts = state.prompts.filter((item) => item.id !== prompt.id);
  await savePrompts(state.prompts);
  populatePromptSelectors(state.prompts[0]?.id);
  showToast("自定义模板已删除");
}

async function restorePrompts() {
  state.prompts = await resetBuiltins(state.prompts);
  populatePromptSelectors(state.prompts[0]?.id);
  showToast("内置提示词已恢复");
}

function statusLabel(status) {
  return ({
    running: "生成中",
    paused: "已暂停",
    cancelled: "已停止",
    failed: "需要处理",
    completed: "已完成"
  })[status] || status;
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
