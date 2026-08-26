(() => {
  const status = document.querySelector("#status");
  const setStatus = message => { status.textContent = message; };
  const copyText = async text => {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      const fallback = document.createElement("textarea");
      fallback.value = text;
      fallback.setAttribute("readonly", "");
      fallback.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(fallback);
      fallback.select();
      const copied = document.execCommand("copy");
      fallback.remove();
      if (!copied) throw error;
    }
  };
  const iastToSiddham = text => {
    const normalized = text.replace(/\[未識別:[^\]]+\]/g, "").replace(/\[猜測:([^\]]+)\]/g, "$1")
      .replace(/[A-Z]/g, character => character.toLowerCase()).replace(/[‐‑‒–—-]/g, " ")
      .replace(/ṃ/g, "ṁ").replace(/\s+/g, " ").trim();
    if (!normalized || !window.BonjiInput) return "";
    return BonjiInput.ascii2siddham(BonjiInput.ascii2symbol(BonjiInput.latin2ascii(normalized)));
  };
  const formatIastForPreview = text => {
    const normalized = text.replace(/[A-Z]/g, character => character.toLowerCase())
      .replace(/[‐‑‒–—-]/g, " ").replace(/ṃ/g, "ṁ").replace(/\s+/g, " ").trim();
    if (!normalized || !window.BonjiInput) return text;
    return BonjiInput.ascii2latin(BonjiInput.latin2ascii(normalized), { transliteration: "IAST" });
  };

  document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach(item => item.classList.toggle("primary", item === button));
    document.querySelectorAll(".panel").forEach(panel => panel.classList.toggle("active", panel.id === button.dataset.tab));
  }));

  const iastInput = document.querySelector("#iastInput");
  const iastOutput = document.querySelector("#iastOutput");
  const iastPreview = document.querySelector("#iastPreview");
  const updateInput = () => {
    iastOutput.textContent = iastToSiddham(iastInput.value);
    iastPreview.textContent = formatIastForPreview(iastInput.value);
  };
  iastInput.addEventListener("input", updateInput);
  const randomSample = Object.assign(document.createElement("button"), {
    type: "button", textContent: "十小咒隨機範例", disabled: !(window.USER_MANTRA_IAST || []).length
  });
  document.querySelector("#iastCopy").before(randomSample);
  randomSample.addEventListener("click", () => {
    const samples = window.USER_MANTRA_IAST || [];
    if (!samples.length) return;
    const sample = samples[Math.floor(Math.random() * samples.length)];
    iastInput.value = sample.iast;
    updateInput();
    setStatus(`已載入十小咒範例：${sample.title}`);
  });
  document.querySelector("#iastCopy").addEventListener("click", async () => {
    try {
      await copyText(iastOutput.textContent || "");
      setStatus("已複製悉曇字。");
    } catch (error) {
      setStatus("複製失敗，請直接選取悉曇文字後複製。");
    }
  });

  const previewOrderLabel = document.createElement("label");
  previewOrderLabel.textContent = "閱讀預覽 ";
  previewOrderLabel.innerHTML += `<select id="siddhamDocumentPreviewOrder">
    <option value="iast-top">IAST 在上（IAST 為主）</option>
    <option value="siddham-top">悉曇在上（悉曇為主）</option>
  </select>`;
  document.querySelector(".appearance").appendChild(previewOrderLabel);

  const previewSpacing = document.createElement("label");
  previewSpacing.className = "preview-spacing-control";
  previewSpacing.title = "0 為預設；負數更靠近，正數更疏";
  previewSpacing.innerHTML = '上下間距 <input id="siddhamDocumentPreviewSpacing" type="number" min="-9" max="12" step="1" value="0" inputmode="numeric" aria-label="逐行閱讀預覽上下間距"> px';
  document.querySelector("#siddhamDocumentPreview").previousElementSibling.appendChild(previewSpacing);

  window.SiddhamDocumentEditor.init({
    convertIast: text => text.split(/\r?\n/).map(iastToSiddham).join("\n"),
    formatIast: formatIastForPreview,
    setStatus
  });
  document.querySelector("#siddhamDocumentSample").textContent = "載入尊勝咒範例";
})();
