(function () {
  "use strict";

  const STORAGE_KEY = "opencc.siddhamDocumentEditor.v1";
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  const APP_VERSION = "1.0.0";
  let controls = null;
  let convertIast = null;
  let formatIast = text => text;
  let reportStatus = null;
  let saveTimer = null;

  const IAST_FONTS = {
    "noto-sans": '"Noto Sans", "Segoe UI", "Arial Unicode MS", sans-serif',
    "noto-serif": '"Noto Serif", "Times New Roman", serif',
    "eb-garamond": '"EB Garamond", "Noto Serif", "Times New Roman", serif',
    "system-serif": 'Georgia, "Times New Roman", serif'
  };

  const SIDDHAM_FONTS = {
    noto: '"Noto Sans Siddham Local", "Noto Sans Siddham", "Segoe UI Historic", sans-serif',
    mukta: '"Mukta Siddham Unicode Local", "Noto Sans Siddham Local", "Noto Sans Siddham", "Segoe UI Historic", sans-serif',
    "ap-brush": '"Ap Siddham Brush Local", "Noto Sans Siddham Local", "Noto Sans Siddham", "Segoe UI Historic", sans-serif',
    "ap-siddham-152": '"Ap Deva Siddham 1.52 Local", "Noto Sans Siddham Local", "Noto Sans Siddham", "Segoe UI Historic", sans-serif'
  };
  const AP_BRUSH_LOAD_FONTS = {
    "ap-brush": '"Ap Siddham Brush Local"',
    "ap-siddham-152": '"Ap Deva Siddham 1.52 Local"'
  };

  function isApBrushFont(fontKey) {
    return fontKey === "ap-brush" || fontKey === "ap-siddham-152";
  }

  function isLegacySiddhamFont(fontKey) {
    return fontKey === "mukta" || isApBrushFont(fontKey);
  }

  const DEVANAGARI_VOWELS = "अआइईउऊऋॠऌॡएऐओऔ";
  const DEVANAGARI_CONSONANTS = "कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह";
  const SIDDHAM_SIGNS_TO_DEVANAGARI = {
    0x115AF: "ा", 0x115B0: "ि", 0x115B1: "ी", 0x115B2: "ु", 0x115B3: "ू",
    0x115B4: "ृ", 0x115B5: "ॄ", 0x115B8: "े", 0x115B9: "ै", 0x115BA: "ो",
    0x115BB: "ौ", 0x115BC: "ँ", 0x115BD: "ं", 0x115BE: "ः", 0x115BF: "्",
    0x115C0: "़", 0x115C2: "।", 0x115C3: "॥"
  };

  function siddhamToApDisplay(text) {
    return Array.from(text, character => {
      const codePoint = character.codePointAt(0);
      if (codePoint >= 0x11580 && codePoint <= 0x1158D) {
        return DEVANAGARI_VOWELS[codePoint - 0x11580];
      }
      if (codePoint >= 0x1158E && codePoint <= 0x115AE) {
        return DEVANAGARI_CONSONANTS[codePoint - 0x1158E];
      }
      return SIDDHAM_SIGNS_TO_DEVANAGARI[codePoint] || character;
    }).join("");
  }

  function apNeedsNativeFallback(word) {
    // The original Ap face is a legacy Devanagari-mapped font.  It draws
    // single letters and simple vowel signs well, but does not contain every
    // consonant-conjunct needed by Unicode Siddham (for example trai / kya).
    // Keep those words in Noto instead of showing separated brush glyphs.
    return /[\u{1158E}-\u{115AE}]\u{115BF}[\u{1158E}-\u{115AE}]/u.test(word);
  }

  function siddhamToApHtml(text) {
    return text.split(/(\s+)/).map(part => {
      if (!part) return "";
      if (/^\s+$/.test(part)) return escapeHtml(part);
      if (apNeedsNativeFallback(part)) {
        return `<span class="siddham-native-fallback" lang="sa-Siddh">${escapeHtml(part)}</span>`;
      }
      return escapeHtml(siddhamToApDisplay(part));
    }).join("");
  }

  function currentAppearance() {
    return {
      iastFont: controls.iastFont.value,
      siddhamFont: controls.siddhamFont.value,
      glyphStyle: controls.glyphStyle.value,
      siddhamSize: controls.fontSize.value,
      previewOrder: controls.previewOrder.value,
      previewSpacing: controls.previewSpacing.value
    };
  }

  function applyAppearance(appearance) {
    const selected = appearance || {};
    controls.iastFont.value = IAST_FONTS[selected.iastFont] ? selected.iastFont : "noto-sans";
    controls.siddhamFont.value = SIDDHAM_FONTS[selected.siddhamFont] ? selected.siddhamFont : "noto";
    controls.glyphStyle.value = /^(standard|ss0[1-4])$/.test(selected.glyphStyle || "")
      ? selected.glyphStyle
      : "standard";
    controls.fontSize.value = /^(24|28|32|36|42)$/.test(String(selected.siddhamSize || ""))
      ? String(selected.siddhamSize)
      : "28";
    controls.previewOrder.value = selected.previewOrder === "siddham-top" ? "siddham-top" : "iast-top";
    controls.previewSpacing.value = /^-?(?:[0-9]|1[0-2])$/.test(String(selected.previewSpacing || ""))
      ? String(selected.previewSpacing)
      : "0";
    const features = ['"liga" 1', '"dlig" 1', '"clig" 1', '"ccmp" 1'];
    if (controls.glyphStyle.value !== "standard") {
      features.push(`"${controls.glyphStyle.value}" 1`);
    }
    controls.view.style.setProperty("--editor-iast-font", IAST_FONTS[controls.iastFont.value]);
    controls.view.style.setProperty("--editor-siddham-font", SIDDHAM_FONTS[controls.siddhamFont.value]);
    controls.view.style.setProperty("--editor-siddham-features", features.join(", "));
    controls.view.style.setProperty("--editor-siddham-size", `${controls.fontSize.value}px`);
    const previewBaseSize = Number(controls.fontSize.value);
    const iastPrimary = controls.previewOrder.value === "iast-top";
    controls.view.style.setProperty("--editor-preview-iast-size", `${Math.round(previewBaseSize * (iastPrimary ? 0.75 : 0.57))}px`);
    controls.view.style.setProperty("--editor-preview-siddham-size", `${previewBaseSize}px`);
    controls.view.style.setProperty("--editor-preview-spacing-adjust", `${controls.previewSpacing.value}px`);
    controls.view.classList.toggle("preview-siddham-top", !iastPrimary);
    const previewLabel = document.querySelector("#siddhamDocumentPreviewLabel");
    if (previewLabel) previewLabel.textContent = iastPrimary ? "IAST 在上、悉曇在下" : "悉曇在上、IAST 在下";
    controls.glyphStyle.disabled = controls.siddhamFont.value !== "noto";
    controls.glyphStyle.title = controls.glyphStyle.disabled
      ? "樣式 1–4 是 Noto Sans Siddham 專用字形"
      : "";
    syncLegacyOutput();
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function previewIastWords(text) {
    return formatIast(text).match(/[^\s‐‑‒–—-]+[‐‑‒–—-]?/g) || [];
  }

  function exportSiddhamWord(siddham, legacyShaping, apBrush) {
    if (!legacyShaping) return escapeHtml(siddham);
    return apBrush ? siddhamToApHtml(siddham) : escapeHtml(siddhamToApDisplay(siddham));
  }

  // Establish one visual writing line from each fully shaped word. In this
  // legacy brush font, later letters can reposition the opening glyph.
  function applyApPreviewOpticalBaseline() {
    if (!isLegacySiddhamFont(controls.siddhamFont.value)) return;
    const diagnosticStatus = document.createElement("div");
    diagnosticStatus.style.cssText = "margin:0 0 12px;padding:8px 12px;border-bottom:1px dashed #c9bfb5;background:#fff8e8;font:14px/1.55 ui-monospace,Consolas,monospace;color:#4b4038";
    diagnosticStatus.textContent = "毛筆起筆除錯：量測中…";
    controls.preview.prepend(diagnosticStatus);
    document.fonts.ready.then(() => {
      try {
      const diagnostics = [];
      controls.preview.querySelectorAll(".siddham-pair-word-grid").forEach((grid, gridIndex) => {
        const targets = Array.from(grid.querySelectorAll(".siddham-pair-script")).map(node =>
          node.querySelector(".siddham-native-fallback") || node
        );
        if (!targets.length) return;
        const metrics = targets.map(node => {
          const style = getComputedStyle(node);
          const segments = new Intl.Segmenter("sa", { granularity: "grapheme" }).segment(node.textContent);
          const firstGlyph = segments[Symbol.iterator]().next().value?.segment || node.textContent;
          const shapedWord = node.textContent;
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { willReadFrequently: true });
          const font = [style.fontStyle, style.fontVariant, style.fontWeight, style.fontSize, style.fontFamily].join(" ");
          context.font = font;
          canvas.width = Math.max(64, Math.ceil(context.measureText(shapedWord).width) + 40);
          canvas.height = 240;
          context.font = font;
          context.textBaseline = "alphabetic";
          context.fillStyle = "#000";
          context.fillText(shapedWord, 20, 160);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const rowInk = Array.from({ length: canvas.height }, () => 0);
          for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
              if (pixels[(y * canvas.width + x) * 4 + 3] > 20) {
                rowInk[y] += 1;
              }
            }
          }
          const top = rowInk.findIndex(count => count > 0);
          return { node, firstGlyph, top: top < 0 ? 0 : top };
        });
        const startingLine = Math.max(...metrics.map(item => item.top));
        metrics.forEach(item => {
          const offset = startingLine - item.top;
          item.node.style.display = "inline-block";
          item.node.style.transform = offset ? `translateY(${offset.toFixed(2)}px)` : "";
          if (gridIndex === 0) {
            diagnostics.push({
              iast: item.node.closest(".siddham-pair-word")?.querySelector(".siddham-pair-iast")?.textContent || "",
              glyph: item.firstGlyph,
              top: item.top,
              offset,
              startingLine
            });
          }
        });
      });
      if (diagnostics.length) {
        const panel = document.createElement("details");
        panel.open = true;
        panel.style.cssText = diagnosticStatus.style.cssText;
        const summary = document.createElement("summary");
        summary.textContent = `毛筆起筆除錯（第一行共同線：${diagnostics[0].startingLine}）`;
        const rows = document.createElement("div");
        rows.style.cssText = "display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:6px";
        diagnostics.forEach(item => {
          const cell = document.createElement("span");
          cell.textContent = `${item.iast}｜${item.glyph}｜起筆 ${item.top}｜位移 ${item.offset >= 0 ? "+" : ""}${item.offset}`;
          rows.appendChild(cell);
        });
        panel.append(summary, rows);
        diagnosticStatus.replaceWith(panel);
      }
      } catch (error) {
        diagnosticStatus.textContent = `毛筆起筆除錯失敗：${error?.message || error}`;
      }
    }).catch(error => {
      diagnosticStatus.textContent = `毛筆字型載入失敗：${error?.message || error}`;
    });
  }

  function buildHtmlExport() {
    const appearance = currentAppearance();
    const usesLegacyShaping = isLegacySiddhamFont(appearance.siddhamFont);
    const iastLines = controls.iast.value.split(/\r?\n/);
    const siddhamLines = controls.siddham.value.split(/\r?\n/);
    const rows = [];
    for (let index = 0; index < Math.max(iastLines.length, siddhamLines.length); index += 1) {
      const iast = iastLines[index] || "";
      const siddham = siddhamLines[index] || "";
      if (!iast.trim() && !siddham.trim()) continue;
      const renderedLanguage = usesLegacyShaping ? "sa-Deva" : "sa-Siddh";
      const iastWords = previewIastWords(iast);
      const siddhamWords = siddham.match(/\S+/g) || [];
      if (iastWords.length && iastWords.length === siddhamWords.length) {
        const words = iastWords.map((iastWord, wordIndex) => `<div class="word">
  <div class="iast" lang="sa-Latn">${escapeHtml(iastWord)}</div>
  <div class="siddham" lang="${renderedLanguage}" data-unicode-siddham="${escapeHtml(siddhamWords[wordIndex])}">${exportSiddhamWord(siddhamWords[wordIndex], usesLegacyShaping, isApBrushFont(appearance.siddhamFont))}</div>
</div>`).join("\n");
        rows.push(`<section class="pair word-grid">${words}</section>`);
      } else {
        rows.push(`<section class="pair line-pair">
  <div class="iast" lang="sa-Latn">${escapeHtml(formatIast(iast))}</div>
  <div class="siddham" lang="${renderedLanguage}" data-unicode-siddham="${escapeHtml(siddham)}">${exportSiddhamWord(siddham, usesLegacyShaping, isApBrushFont(appearance.siddhamFont))}</div>
</section>`);
      }
    }
    const features = ['"liga" 1', '"dlig" 1', '"clig" 1', '"ccmp" 1'];
    if (appearance.glyphStyle !== "standard") features.push(`"${appearance.glyphStyle}" 1`);
    const notoFont = window.SIDDHAM_FONT_DATA_URL || "";
    const muktaFont = window.MUKTA_SIDDHAM_FONT_DATA_URL || "";
    const apBrushFont = window.AP_SIDDHAM_BRUSH_FONT_DATA_URL || "";
    const ap152Font = window.AP_DEVA_SIDDHAM_152_FONT_DATA_URL || "";
    const fontFaces = [];
    if (notoFont) {
      fontFaces.push(`@font-face { font-family: "Embedded Noto Siddham"; src: url("${notoFont}") format("truetype"); font-display: swap; }`);
      fontFaces.push(`@font-face { font-family: "Embedded Noto Siddham Ap Fallback"; src: url("${notoFont}") format("truetype"); ascent-override: 64%; descent-override: 36%; line-gap-override: 0%; font-display: swap; }`);
    }
    if (appearance.siddhamFont === "mukta" && muktaFont) {
      fontFaces.push(`@font-face { font-family: "Embedded Mukta Siddham"; src: url("${muktaFont}") format("woff2"); font-display: swap; }`);
    }
    if (appearance.siddhamFont === "ap-brush" && apBrushFont) {
      fontFaces.push(`@font-face { font-family: "Embedded Ap Siddham Brush"; src: url("${apBrushFont}") format("woff2"); font-display: swap; }`);
    }
    if (appearance.siddhamFont === "ap-siddham-152" && ap152Font) {
      fontFaces.push(`@font-face { font-family: "Embedded Ap Deva Siddham 1.52"; src: url("${ap152Font}") format("woff2"); font-display: swap; }`);
    }
    const exportSiddhamFont = appearance.siddhamFont === "mukta"
      ? '"Embedded Mukta Siddham", "Embedded Noto Siddham", "Noto Sans Siddham", sans-serif'
      : appearance.siddhamFont === "ap-brush"
        ? '"Embedded Ap Siddham Brush", "Embedded Noto Siddham", "Noto Sans Siddham", sans-serif'
        : appearance.siddhamFont === "ap-siddham-152"
          ? '"Embedded Ap Deva Siddham 1.52", "Embedded Noto Siddham", "Noto Sans Siddham", sans-serif'
        : '"Embedded Noto Siddham", "Noto Sans Siddham", sans-serif';
    const siddhamTop = appearance.previewOrder === "siddham-top";
    const previewIastSize = Math.round(Number(appearance.siddhamSize) * (siddhamTop ? 0.57 : 0.75));
    return `<!doctype html>
<!-- Siddham IAST Studio v${APP_VERSION} · final preview-matched export -->
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Uṣṇīṣa Vijaya Dhāraṇī — IAST／悉曇</title>
  <style>
    ${fontFaces.join("\n    ")}
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { max-width: 980px; margin: 40px auto; padding: 0 26px; color: #302a27; background: #f6f2ec; font-family: ${IAST_FONTS[appearance.iastFont]}; }
    h1 { margin: 0 0 28px; font-size: 1.55rem; font-weight: 600; }
    h1 small { color: #786f69; font-size: .66em; font-weight: 400; }
    .pair { margin: 0 0 1.35rem; padding: 15px 18px; border: 1px solid #d9d1c8; border-radius: 8px; background: #fffdf9; break-inside: avoid; }
    .word-grid { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 14px 22px; }
    .word { display: grid; gap: 4px; min-width: max-content; text-align: center; }
    .iast { font-size: ${previewIastSize}px; line-height: 1.25; }
    .siddham { font-family: ${exportSiddhamFont}; font-size: ${appearance.siddhamSize}px; line-height: 1.45; font-feature-settings: ${features.join(", ")}; text-rendering: optimizeLegibility; }
    .word .siddham { white-space: nowrap; }
    .siddham-top .word { gap: 1px; }
    .siddham-top .word .siddham { order: 1; height: 1.1em; line-height: 1.1; display: flex; align-items: flex-end; justify-content: center; }
    .siddham-top .word .iast { order: 2; margin-top: calc(-.35em + ${appearance.previewSpacing || 0}px); line-height: 1.1; }
    .siddham-top .line-pair { display: flex; flex-direction: column; }
    .siddham-top .line-pair .siddham { order: 1; }
    .siddham-top .line-pair .iast { order: 2; margin-top: 4px; }
    .siddham-native-fallback { font-family: "Embedded Noto Siddham Ap Fallback", "Embedded Noto Siddham", "Noto Sans Siddham", sans-serif; font-size: .84em; font-feature-settings: "liga" 1, "dlig" 1, "clig" 1, "ccmp" 1; }
    @media print { body { margin: 0 auto; background: white; } .pair { border-color: #ddd; } }
  </style>
</head>
<body class="${siddhamTop ? "siddham-top" : "iast-top"}">
  <h1>Uṣṇīṣa Vijaya Dhāraṇī<br><small>IAST／悉曇逐行對照</small></h1>
  ${rows.join("\n  ")}
  <footer style="margin:28px 0 0;color:#786f69;font-size:.78rem">Siddham IAST Studio v${APP_VERSION} · 離線定版</footer>
  ${usesLegacyShaping ? `<script>
    document.addEventListener("copy", event => {
      const node = window.getSelection()?.anchorNode;
      const row = node?.parentElement?.closest?.(".siddham") || node?.parentNode?.closest?.(".siddham");
      if (!row?.dataset.unicodeSiddham) return;
      event.clipboardData.setData("text/plain", row.dataset.unicodeSiddham);
      event.preventDefault();
    });
  <\/script>` : ""}
</body>
</html>
`;
  }

  function hasSiddham(text) {
    return Array.from(text).some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint >= 0x11580 && codePoint <= 0x115ff;
    });
  }

  function parsePairedText(text) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    const iastLines = [];
    const siddhamLines = [];
    let foundSiddham = false;
    for (const line of lines) {
      if (hasSiddham(line)) {
        siddhamLines.push(line);
        foundSiddham = true;
      } else if (line.trim()) {
        iastLines.push(line);
      } else if (iastLines.length && iastLines[iastLines.length - 1] !== "") {
        iastLines.push("");
        if (foundSiddham) siddhamLines.push("");
      }
    }
    return {
      iast: iastLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      siddham: foundSiddham ? siddhamLines.join("\n").replace(/\n{3,}/g, "\n\n").trim() : ""
    };
  }

  function renderPairs() {
    const iastLines = controls.iast.value.split(/\r?\n/);
    const siddhamLines = controls.siddham.value.split(/\r?\n/);
    const fragment = document.createDocumentFragment();
    controls.preview.replaceChildren();

    for (let index = 0; index < Math.max(iastLines.length, siddhamLines.length); index += 1) {
      const iast = iastLines[index] || "";
      const readableIast = formatIast(iast);
      const siddham = siddhamLines[index] || "";
      if (!iast.trim() && !siddham.trim()) continue;
      const row = document.createElement("div");
      row.className = "siddham-pair-row";
      // A hyphen is converted to a word boundary before Siddham rendering.
      // Split it here too, retaining the hyphen visually, so the two rows
      // continue to align word-for-word (e.g. amṛta-abhisekair).
      const iastWords = readableIast.match(/[^\s‐‑‒–—-]+[‐‑‒–—-]?/g) || [];
      const siddhamWords = siddham.match(/\S+/g) || [];
      const canAlignWords = iastWords.length > 0 && iastWords.length === siddhamWords.length;
      const legacyFont = isLegacySiddhamFont(controls.siddhamFont.value);

      if (canAlignWords) {
        row.classList.add("siddham-pair-word-grid");
        iastWords.forEach((iastWord, wordIndex) => {
          const word = document.createElement("div");
          word.className = "siddham-pair-word";
          const roman = document.createElement("div");
          roman.className = "siddham-pair-iast";
          roman.textContent = iastWord;
          const script = document.createElement("div");
          script.className = "siddham-pair-script siddham-text";
          script.lang = legacyFont ? "sa-Deva" : "sa-Siddh";
          if (isApBrushFont(controls.siddhamFont.value)) {
            script.innerHTML = siddhamToApHtml(siddhamWords[wordIndex]);
          } else {
            script.textContent = legacyFont ? siddhamToApDisplay(siddhamWords[wordIndex]) : siddhamWords[wordIndex];
          }
          word.append(roman, script);
          row.appendChild(word);
        });
        fragment.appendChild(row);
        continue;
      }

      const roman = document.createElement("div");
      roman.className = "siddham-pair-iast";
      roman.textContent = readableIast;
      const script = document.createElement("div");
      script.className = "siddham-pair-script siddham-text";
      script.lang = legacyFont ? "sa-Deva" : "sa-Siddh";
      if (isApBrushFont(controls.siddhamFont.value)) {
        script.innerHTML = siddhamToApHtml(siddham);
      } else {
        script.textContent = legacyFont ? siddhamToApDisplay(siddham) : siddham;
      }
      row.append(roman, script);
      fragment.appendChild(row);
    }
    controls.preview.appendChild(fragment);
    renderFontGallery();
  }

  function renderFontGallery() {
    if (!controls.fontGallery) return;
    const fontChoices = [
      ["noto", "Noto 標準"], ["mukta", "Mukta 傳統"], ["ap-brush", "Ap 弐式"],
      ["ap-siddham-152", "ApDeva 1.52"]
    ];
    const vowels = ["a", "ā", "i", "ī", "u", "ū", "ṛ", "ṝ", "ḷ", "ḹ", "e", "ai", "o", "au"];
    const consonants = ["ka", "kha", "ga", "gha", "ṅa", "ca", "cha", "ja", "jha", "ña", "ṭa", "ṭha", "ḍa", "ḍha", "ṇa", "ta", "tha", "da", "dha", "na", "pa", "pha", "ba", "bha", "ma", "ya", "ra", "la", "va", "śa", "ṣa", "sa", "ha"];
    const samples = [];
    vowels.forEach((label, index) => samples.push({ label, text: String.fromCodePoint(0x11580 + index) }));
    consonants.forEach((label, index) => samples.push({ label, text: String.fromCodePoint(0x1158E + index) }));
    const carrier = String.fromCodePoint(0x1158E);
    for (let point = 0x115AF; point <= 0x115C3; point += 1) {
      samples.push({ label: `U+${point.toString(16).toUpperCase()}`, text: point >= 0x115C1 ? String.fromCodePoint(point) : carrier + String.fromCodePoint(point) });
    }
    controls.fontGallery.replaceChildren();
    const summary = document.createElement("summary");
    summary.textContent = "悉曇全字形對照（同一橫線比較）";
    controls.fontGallery.appendChild(summary);
    const note = document.createElement("div");
    note.textContent = "紅線是共同起筆參考線；比較同一列的點、月牙與筆畫位置。";
    note.style.cssText = "margin:6px 0;color:#786f69;font-size:13px";
    controls.fontGallery.appendChild(note);
    const table = document.createElement("div");
    table.style.cssText = "display:grid;grid-template-columns:92px repeat(5,minmax(112px,1fr));min-width:690px;border:1px solid #d8d0c6;background:#fffdfa;overflow:hidden";
    const addTextCell = (text, style) => { const cell = document.createElement("div"); cell.textContent = text; cell.style.cssText = style; table.appendChild(cell); };
    addTextCell("字形", "padding:7px;border-bottom:1px solid #d8d0c6;background:#eee9e2;font-size:13px");
    fontChoices.forEach(([, label]) => addTextCell(label, "padding:7px;border-left:1px solid #d8d0c6;border-bottom:1px solid #d8d0c6;background:#eee9e2;font-size:13px;text-align:center"));
    samples.forEach(sample => {
      addTextCell(sample.label, "padding:8px;border-bottom:1px solid #eee8e0;font:13px/1.2 ui-monospace,Consolas,monospace;color:#5c514a");
      fontChoices.forEach(([key]) => {
        const cell = document.createElement("div");
        cell.style.cssText = "min-height:52px;padding:5px;border-left:1px solid #eee8e0;border-bottom:1px solid #eee8e0;text-align:center";
        const glyph = document.createElement("div");
        glyph.lang = isLegacySiddhamFont(key) ? "sa-Deva" : "sa-Siddh";
        glyph.style.cssText = `min-height:43px;background:linear-gradient(#c76a62,#c76a62) top/100% 1px no-repeat;font-family:${SIDDHAM_FONTS[key]};font-size:28px;line-height:1.45;white-space:nowrap`;
        if (isApBrushFont(key)) glyph.innerHTML = siddhamToApHtml(sample.text);
        else glyph.textContent = isLegacySiddhamFont(key) ? siddhamToApDisplay(sample.text) : sample.text;
        cell.appendChild(glyph);
        table.appendChild(cell);
      });
    });
    const scroller = document.createElement("div");
    scroller.style.cssText = "overflow:auto;max-height:620px;margin-top:8px";
    scroller.appendChild(table);
    controls.fontGallery.appendChild(scroller);
  }

  function syncLegacyOutput() {
    if (!controls?.apOutput || !controls?.siddham || !controls?.view) return;
    const legacyFont = isLegacySiddhamFont(controls.siddhamFont.value);
    controls.view.classList.toggle("legacy-siddham-active", legacyFont);
    controls.apOutput.hidden = !legacyFont;
    if (legacyFont) {
      if (isApBrushFont(controls.siddhamFont.value)) {
        controls.apOutput.innerHTML = siddhamToApHtml(controls.siddham.value);
      } else {
        controls.apOutput.textContent = siddhamToApDisplay(controls.siddham.value);
      }
    }
  }

  function saveLocal() {
    const project = {
      version: 1,
      iast: controls.iast.value,
      siddham: controls.siddham.value,
      appearance: currentAppearance(),
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    controls.saved.textContent = "已自動儲存";
  }

  function scheduleSave() {
    controls.saved.textContent = "儲存中…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveLocal, 250);
  }

  function updateFromIast() {
    controls.siddham.value = convertIast(controls.iast.value);
    syncLegacyOutput();
    renderPairs();
    scheduleSave();
  }

  function setDocument(project) {
    if (project.appearance) applyAppearance(project.appearance);
    controls.iast.value = project.iast || "";
    controls.siddham.value = convertIast(controls.iast.value);
    syncLegacyOutput();
    renderPairs();
    scheduleSave();
  }

  function restoreLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.iast) {
        setDocument(saved);
        controls.saved.textContent = "已恢復上次內容";
        return;
      }
    } catch (error) {
      console.warn("無法恢復悉曇編輯器內容", error);
    }
    setDocument({ iast: window.USNISA_VIJAYA_IAST || "" });
  }

  function init(options) {
    convertIast = options.convertIast;
    formatIast = typeof options.formatIast === "function" ? options.formatIast : (text => text);
    reportStatus = options.setStatus || function () {};
    controls = {
      iast: document.querySelector("#siddhamDocumentIast"),
      siddham: document.querySelector("#siddhamDocumentOutput"),
      apOutput: document.querySelector("#siddhamDocumentApOutput"),
      preview: document.querySelector("#siddhamDocumentPreview"),
      saved: document.querySelector("#siddhamDocumentSaved"),
      file: document.querySelector("#siddhamDocumentFile"),
      view: document.querySelector("#siddhamEditorView"),
      iastFont: document.querySelector("#siddhamDocumentIastFont"),
      siddhamFont: document.querySelector("#siddhamDocumentFont"),
      glyphStyle: document.querySelector("#siddhamDocumentGlyphStyle"),
      fontSize: document.querySelector("#siddhamDocumentFontSize"),
      previewOrder: document.querySelector("#siddhamDocumentPreviewOrder"),
      previewSpacing: document.querySelector("#siddhamDocumentPreviewSpacing")
    };
    if (!controls.iast || !controls.siddham || !controls.preview) return;
    const gallery = document.createElement("details");
    gallery.open = true;
    gallery.style.cssText = "margin:12px 0;padding:11px 13px;border:1px solid #d8d0c6;border-radius:9px;background:#eee9e2";
    document.querySelector(".appearance")?.insertAdjacentElement("afterend", gallery);
    controls.fontGallery = gallery;

    controls.iast.addEventListener("input", updateFromIast);
    controls.apOutput.addEventListener("copy", event => {
      event.clipboardData.setData("text/plain", controls.siddham.value);
      event.preventDefault();
      reportStatus("已複製原始 Unicode 悉曇字。");
    });
    [controls.iastFont, controls.siddhamFont, controls.glyphStyle, controls.fontSize, controls.previewOrder, controls.previewSpacing].forEach((control) => {
      control.addEventListener("change", () => {
        applyAppearance(currentAppearance());
        syncLegacyOutput();
        renderPairs();
        scheduleSave();
        reportStatus(isLegacySiddhamFont(controls.siddhamFont.value)
          ? (isApBrushFont(controls.siddhamFont.value)
            ? "已套用 Ap 毛筆字型；複雜連字會自動以 Noto 顯示，複製仍是 Unicode 悉曇。"
            : "已套用傳統悉曇字型；畫面使用原生組字規則，複製仍是 Unicode 悉曇。")
          : "已套用字型與悉曇字形設定。");
      });
    });
    document.querySelector("#siddhamDocumentCopy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(controls.siddham.value);
        reportStatus("已複製悉曇字輸出。");
      } catch (error) {
        controls.siddham.focus();
        controls.siddham.select();
        document.execCommand("copy");
        reportStatus("已嘗試複製悉曇字輸出。");
      }
    });
    document.querySelector("#siddhamDocumentSample").addEventListener("click", () => {
      setDocument({ iast: window.USNISA_VIJAYA_IAST || "" });
      reportStatus("已載入佛頂尊勝陀羅尼依貝葉經書校正版。");
    });
    document.querySelector("#siddhamDocumentClear").addEventListener("click", () => {
      setDocument({ iast: "" });
      reportStatus("已清空悉曇對照編輯器。");
      controls.iast.focus();
    });
    document.querySelector("#siddhamDocumentOpen").addEventListener("click", () => controls.file.click());
    controls.file.addEventListener("change", async () => {
      const file = controls.file.files?.[0];
      if (!file) return;
      try {
        if (file.size > MAX_IMPORT_BYTES) {
          throw new Error("檔案超過 2 MB 的匯入上限");
        }
        const text = await file.text();
        if (file.name.toLowerCase().endsWith(".json")) {
          const project = JSON.parse(text);
          if (!project || typeof project !== "object") {
            throw new Error("JSON 專案格式無效");
          }
          setDocument(project);
        } else {
          const parsed = parsePairedText(text);
          setDocument({ iast: parsed.iast });
        }
        reportStatus(`已開啟 ${file.name}。`);
      } catch (error) {
        console.warn("無法開啟悉曇專案檔", error);
        reportStatus(`無法開啟 ${file.name}：${error.message || "檔案格式錯誤"}`);
      } finally {
        controls.file.value = "";
      }
    });
    document.querySelector("#siddhamDocumentSave").addEventListener("click", () => {
      const project = JSON.stringify({
        version: 1,
        title: "Uṣṇīṣa Vijaya Dhāraṇī",
        iast: controls.iast.value,
        siddham: controls.siddham.value,
        appearance: currentAppearance()
      }, null, 2);
      downloadFile("siddham-iast-project.json", project + "\n", "application/json");
      reportStatus("已下載可繼續編輯的 JSON 專案檔。");
    });
    document.querySelector("#siddhamDocumentExportHtml").addEventListener("click", async () => {
      await document.fonts.ready;
      if (isApBrushFont(controls.siddhamFont.value)) {
        await document.fonts.load(`${controls.fontSize.value}px ${AP_BRUSH_LOAD_FONTS[controls.siddhamFont.value]}`);
      }
      downloadFile(
        "USNISA-VIJAYA-DHARANI-IAST-Siddham.html",
        buildHtmlExport(),
        "text/html"
      );
      reportStatus("已匯出內嵌悉曇字型的離線 HTML。");
    });

    applyAppearance(currentAppearance());
    restoreLocal();
  }

  window.SiddhamDocumentEditor = { init };
})();
