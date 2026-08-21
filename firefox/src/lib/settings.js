const chrome = globalThis.browser;

export const DEFAULT_SETTINGS = {
  settingsVersion: 2,
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  apiKey: "",
  model: "deepseek-v4-flash",
  deepseekThinking: false,
  reasoningEffort: "high",
  concurrency: 8,
  temperature: 0.2,
  maxTokens: 384000,
  chunkChars: 30000,
  autoReadSubtitles: true,
  playOnSeek: true,
  theme: "system"
};

export async function loadSettings() {
  const result = await chrome.storage.local.get("settings");
  const stored = result.settings || null;
  const settings = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  if (stored && Number(stored.settingsVersion || 1) < DEFAULT_SETTINGS.settingsVersion) {
    if (Number(stored.maxTokens) === 8192) settings.maxTokens = DEFAULT_SETTINGS.maxTokens;
    if (Number(stored.chunkChars) === 9000) settings.chunkChars = DEFAULT_SETTINGS.chunkChars;
    settings.deepseekThinking = false;
    settings.settingsVersion = DEFAULT_SETTINGS.settingsVersion;
    await chrome.storage.local.set({ settings });
  }
  return settings;
}

export async function saveSettings(settings) {
  const clean = {
    ...DEFAULT_SETTINGS,
    ...settings,
    baseUrl: String(settings.baseUrl || "").trim().replace(/\/+$/, ""),
    apiKey: String(settings.apiKey || "").trim(),
    model: String(settings.model || "").trim(),
    deepseekThinking: Boolean(settings.deepseekThinking),
    reasoningEffort: settings.reasoningEffort === "max" ? "max" : "high",
    concurrency: Math.max(1, Math.min(2500, Number(settings.concurrency) || 8)),
    temperature: Number(settings.temperature),
    maxTokens: Math.max(512, Math.min(384000, Number(settings.maxTokens) || DEFAULT_SETTINGS.maxTokens)),
    chunkChars: Math.max(2000, Math.min(800000, Number(settings.chunkChars) || DEFAULT_SETTINGS.chunkChars)),
    theme: ["system", "light", "dark"].includes(settings.theme) ? settings.theme : "system",
    settingsVersion: DEFAULT_SETTINGS.settingsVersion
  };
  await chrome.storage.local.set({ settings: clean });
  return clean;
}

export async function requestApiPermission(baseUrl) {
  const url = new URL(baseUrl);
  const origin = `${url.protocol}//${url.host}/*`;
  const alreadyGranted = await chrome.permissions.contains({ origins: [origin] });
  if (alreadyGranted) return true;
  return chrome.permissions.request({ origins: [origin] });
}
