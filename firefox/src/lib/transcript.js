export function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

export function transcriptToText(items) {
  return items.map((item) => {
    const seconds = Math.max(0, Math.round(Number(item.start) || 0));
    return `{{t:${seconds}|${formatTime(seconds)}}} [至 ${formatTime(item.end)}] ${item.text}`;
  }).join("\n");
}

export function splitTranscript(items, maxChars = 9000) {
  const chunks = [];
  let current = [];
  let length = 0;

  for (const item of items) {
    const lineLength = item.text.length + 32;
    if (current.length && length + lineLength > maxChars) {
      chunks.push(current);
      const overlap = current.slice(-2);
      current = [...overlap];
      length = overlap.reduce((sum, cue) => sum + cue.text.length + 32, 0);
    }
    current.push(item);
    length += lineLength;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function parseSubtitleFile(text, fileName = "") {
  const normalized = String(text).replace(/\r/g, "").replace(/^WEBVTT[^\n]*\n+/, "");
  const blocks = normalized.split(/\n{2,}/);
  const cues = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex < 0) continue;
    const match = lines[timeIndex].match(/([^\s]+)\s*-->\s*([^\s]+)/);
    if (!match) continue;
    const start = parseTime(match[1]);
    const end = parseTime(match[2]);
    const cueText = lines.slice(timeIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cueText || !Number.isFinite(start)) continue;
    cues.push({ id: cues.length + 1, start, end: Number.isFinite(end) ? end : start, text: cueText });
  }

  if (!cues.length) throw new Error(`无法从 ${fileName || "文件"} 中识别 SRT/VTT 字幕`);
  return cues;
}

function parseTime(value) {
  const clean = String(value).replace(",", ".");
  const parts = clean.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}
