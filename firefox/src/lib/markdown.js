import { formatTime } from "./transcript.js";

const MARKER = /\{\{t:([\d.]+)\|([^}]+)\}\}/g;

export function toObsidianMarkdown(markdown, videoUrl) {
  const encodedUrl = encodeURIComponent(videoUrl);
  let text = String(markdown).replace(MARKER, (_match, seconds, label) => {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    return `[${label || formatTime(safeSeconds)}](obsidian://mx-open?url=${encodedUrl}&t=${safeSeconds})`;
  });
  const links = [];
  text = text.replace(/\[[^\]]+\]\([^)]+\)/g, (link) => {
    const placeholder = `\u0000OBSIDIANTIME${links.length}\u0000`;
    links.push(link);
    return placeholder;
  });
  text = text.replace(/(?<![\d:])(\d{1,2}:\d{2}(?::\d{2})?)(?![\d:])/g, (_match, label) => {
    const seconds = Math.max(0, Math.floor(timeToSeconds(label)));
    return `[${label}](obsidian://mx-open?url=${encodedUrl}&t=${seconds})`;
  });
  return text.replace(/\u0000OBSIDIANTIME(\d+)\u0000/g, (_match, index) => links[Number(index)] || "");
}

export function renderMarkdown(markdown, options = {}) {
  const lines = String(markdown || "").split("\n");
  const html = [];
  let inCode = false;
  let codeLanguage = "";
  let listType = null;
  const headingCounts = new Map();
  const anchorPrefix = safeAnchorPart(options.anchorPrefix || "note");

  const closeList = () => {
    if (listType) html.push(`</${listType}>`);
    listType = null;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
    const fence = rawLine.trim().match(/^(```|~~~)\s*([^\s`]*)?.*$/);
    if (fence) {
      closeList();
      if (inCode) {
        html.push("</code></pre></div>");
      } else {
        codeLanguage = String(fence[2] || "").replace(/[^\w.+#-]/g, "").slice(0, 30);
        const languageLabel = codeLanguage || "代码";
        html.push(`<div class="code-block"><div class="code-toolbar"><span>${escapeHtml(languageLabel)}</span><button type="button" class="code-copy" title="复制代码">复制</button></div><pre><code${codeLanguage ? ` class="language-${escapeAttribute(codeLanguage)}"` : ""}>`);
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      html.push(`${escapeHtml(rawLine)}\n`);
      continue;
    }

    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      closeList();
      html.push("<hr>");
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const baseSlug = headingSlug(heading[2]);
      const duplicateIndex = headingCounts.get(baseSlug) || 0;
      headingCounts.set(baseSlug, duplicateIndex + 1);
      const slug = duplicateIndex ? `${baseSlug}-${duplicateIndex}` : baseSlug;
      const id = `${anchorPrefix}-${slug}`;
      html.push(`<h${level} id="${escapeAttribute(id)}" class="note-heading" data-note-heading="${escapeAttribute(slug)}" tabindex="-1"><span>${renderInline(heading[2])}</span><a class="heading-anchor note-anchor" href="#${encodeURIComponent(slug)}" data-note-target="${escapeAttribute(slug)}" aria-label="跳转到本节" title="跳转到本节">#</a></h${level}>`);
      continue;
    }

    if (isTableHeader(lines, lineIndex)) {
      closeList();
      const header = splitTableRow(line);
      const alignment = splitTableRow(lines[lineIndex + 1]).map(tableAlignment);
      const rows = [];
      lineIndex += 2;
      while (lineIndex < lines.length && isTableRow(lines[lineIndex])) {
        rows.push(splitTableRow(lines[lineIndex]));
        lineIndex += 1;
      }
      lineIndex -= 1;
      html.push('<div class="table-scroll"><table><thead><tr>');
      header.forEach((cell, index) => html.push(`<th${alignAttribute(alignment[index])}>${renderInline(cell)}</th>`));
      html.push("</tr></thead><tbody>");
      for (const row of rows) {
        html.push("<tr>");
        header.forEach((_cell, index) => html.push(`<td${alignAttribute(alignment[index])}>${renderInline(row[index] || "")}</td>`));
        html.push("</tr>");
      }
      html.push("</tbody></table></div>");
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (ordered || unordered) {
      const wanted = ordered ? "ol" : "ul";
      if (listType !== wanted) {
        closeList();
        listType = wanted;
        html.push(`<${wanted}>`);
      }
      const itemText = (ordered || unordered)[1];
      const task = itemText.match(/^\[([ xX])\]\s+(.+)$/);
      if (task) {
        const checked = task[1].toLocaleLowerCase() === "x";
        html.push(`<li class="task-list-item"><input type="checkbox" disabled${checked ? " checked" : ""}><span>${renderInline(task[2])}</span></li>`);
      } else {
        html.push(`<li>${renderInline(itemText)}</li>`);
      }
      continue;
    }

    closeList();
    if (line.startsWith("> ")) html.push(`<blockquote>${renderInline(line.slice(2))}</blockquote>`);
    else html.push(`<p>${renderInline(line)}</p>`);
  }
  closeList();
  if (inCode) html.push("</code></pre></div>");
  return html.join("");
}

export function headingSlug(value) {
  const cleaned = String(value || "")
    .replace(MARKER, "")
    .replace(/\[([^\]]+)\]\(obsidian:\/\/[^)]+\)/gi, (_match, label) => /^\d{1,2}:\d{2}/.test(label.trim()) ? "" : label)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[\\*_~=#]/g, "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .trim();
  return cleaned
    .replace(/[\p{P}\p{S}\s]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || "section";
}

export function markerCount(markdown) {
  return [...String(markdown || "").matchAll(MARKER)].length;
}

export function normalizeTimeMarkers(markdown) {
  const preserved = [];
  let inCode = false;
  return String(markdown || "").split("\n").map((line) => {
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      return line;
    }
    if (inCode) return line;

    const keep = (value) => {
      const key = `\u0000TIMEMARKER${preserved.length}\u0000`;
      preserved.push(value);
      return key;
    };
    let value = line.replace(MARKER, (marker) => keep(marker));
    value = value.replace(/`[^`]+`/g, (code) => keep(code));
    value = value.replace(/\[([^\]]*?\d{1,2}:\d{2}(?::\d{2})?[^\]]*)\]\(obsidian:\/\/mx-open\?[^)]*?[?&]t=([\d.]+)[^)]*\)/gi,
      (_match, label, seconds) => keep(`{{t:${Math.max(0, Number(seconds) || 0)}|${label}}}`));
    value = value.replace(/\[[^\]]+\]\([^)]+\)/g, (link) => keep(link));
    value = value.replace(/(?<![\d:])(\d{1,2}:\d{2}(?::\d{2})?)(?![\d:])/g,
      (_match, label) => `{{t:${timeToSeconds(label)}|${label}}}`);
    return value.replace(/\u0000TIMEMARKER(\d+)\u0000/g, (_match, index) => preserved[Number(index)] || "");
  }).join("\n");
}

export function safeFileName(value) {
  return String(value || "视频笔记")
    .replace(/[<>:\"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "视频笔记";
}

function renderInline(value) {
  const tokens = [];
  const token = (html) => {
    const key = `\u0000VIDNOTE${tokens.length}\u0000`;
    tokens.push(html);
    return key;
  };
  let source = String(value || "");
  source = source.replace(/`([^`]+)`/g, (_match, code) => token(`<code>${escapeHtml(code)}</code>`));
  source = source.replace(MARKER, (_match, seconds, label) => token(timeButton(seconds, label)));
  source = source.replace(/\[([^\]]*?\d{1,2}:\d{2}(?::\d{2})?[^\]]*)\]\(obsidian:\/\/mx-open\?[^)]*?[?&]t=([\d.]+)[^)]*\)/gi,
    (_match, label, seconds) => token(timeButton(seconds, label)));
  source = source.replace(/(?<![\d:])(\d{1,2}:\d{2}(?::\d{2})?)(?![\d:])/g,
    (_match, label) => token(timeButton(timeToSeconds(label), label)));
  source = source.replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/gi,
    (_match, href) => token(externalLink(href, href)));
  source = source.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g,
    (_match, label, href) => token(markdownLink(label, href)));

  let text = escapeHtml(source);
  text = text.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  text = text.replace(/==([^=]+)==/g, "<mark>$1</mark>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  text = text.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>");
  text = text.replace(/\u0000VIDNOTE(\d+)\u0000/g, (_match, index) => tokens[Number(index)] || "");
  return text;
}

function markdownLink(label, href) {
  const text = escapeHtml(String(label || ""));
  const rawHref = String(href || "").trim();
  if (rawHref.startsWith("#")) {
    let decoded = rawHref.slice(1);
    try { decoded = decodeURIComponent(decoded); } catch { /* Keep the original fragment. */ }
    const target = headingSlug(decoded);
    return `<a class="note-anchor" href="#${encodeURIComponent(target)}" data-note-target="${escapeAttribute(target)}">${text}</a>`;
  }
  if (/^(?:https?:\/\/|mailto:)/i.test(rawHref)) return externalLink(rawHref, label);
  return text;
}

function externalLink(href, label) {
  return `<a class="external-link" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function timeButton(seconds, label) {
  const time = Math.max(0, Number(seconds) || 0);
  const text = label || formatTime(time);
  return `<button class="time-link" data-time="${time}" title="跳转到 ${escapeAttribute(text)}">${escapeHtml(text)}</button>`;
}

function timeToSeconds(label) {
  const parts = String(label).split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
}

function isTableHeader(lines, index) {
  if (index + 1 >= lines.length || !isTableRow(lines[index])) return false;
  const separators = splitTableRow(lines[index + 1]);
  return separators.length > 0 && separators.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function isTableRow(line) {
  const value = String(line || "").trim();
  return value.includes("|") && !value.startsWith("```");
}

function splitTableRow(line) {
  let value = String(line || "").trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  const cells = [];
  let current = "";
  let inMarker = false;
  let inCode = false;
  for (let index = 0; index < value.length; index++) {
    if (!inCode && value.startsWith("{{", index)) inMarker = true;
    if (value[index] === "`" && !inMarker && value[index - 1] !== "\\") inCode = !inCode;
    if (value[index] === "|" && !inMarker && !inCode && value[index - 1] !== "\\") {
      cells.push(current.trim().replace(/\\\|/g, "|"));
      current = "";
      continue;
    }
    current += value[index];
    if (!inCode && value.startsWith("}}", index)) inMarker = false;
  }
  cells.push(current.trim().replace(/\\\|/g, "|"));
  return cells;
}

function tableAlignment(separator) {
  const value = String(separator || "").trim();
  if (value.startsWith(":") && value.endsWith(":")) return "center";
  if (value.endsWith(":")) return "right";
  return "left";
}

function alignAttribute(alignment) {
  return alignment && alignment !== "left" ? ` style="text-align:${alignment}"` : "";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function safeAnchorPart(value) {
  return String(value || "note").replace(/[^\w-]/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "") || "note";
}
