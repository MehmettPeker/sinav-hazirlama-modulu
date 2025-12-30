const state = { questions: [] };

const $ = (s, r = document) => r.querySelector(s);

function uid() { return Math.random().toString(16).slice(2) + Date.now().toString(16); }

function escapeHtml(str) {
  return (str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** YYYYMMDD / DDMMYYYY / DD/MM/YYYY -> DD/MM/YYYY */
function formatDatePretty(raw) {
  const s = (raw ?? "").toString().trim();
  if (!s) return "";
  const digits = s.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
}

function bindDateMask() {
  const inp = $("#examDate");
  if (!inp) return;

  const handler = () => {
    const v = inp.value;
    const pretty = formatDatePretty(v);
    if (pretty !== v) inp.value = pretty;
  };

  inp.addEventListener("input", handler);
  inp.addEventListener("blur", handler);
}

function clampFont(v) {
  const n = Number(v || 11);
  return Math.max(8, Math.min(22, n));
}

// UI’da daha belirgin büyüsün diye pt -> px hissi
function uiFontPx(pt) {
  return Math.round(pt * 1.1 + 6);
}

function addQuestion(type = "classic") {
  if (type === "tf" && state.questions.some(q => q.type === "tf")) {
    alert("Doğru/Yanlış bölümü zaten var. Aynı bölümün içine maddeleri ekle.");
    return;
  }
  if (type === "match" && state.questions.some(q => q.type === "match")) {
    alert("Eşleştirme bölümü zaten var. Aynı bölümün içine çiftleri ekle.");
    return;
  }

  const q = {
    id: uid(),
    type,
    points: 10,
    fontSize: 11,
    text: "",
    options: ["", "", "", ""],
    tfItems: [""],
    pairs: [{ left: "", right: "" }],
    code: "",
    answerLines: 0,
    answerGapMm: 12
  };

  state.questions.push(q);
  render();
}

function removeQuestion(id) {
  state.questions = state.questions.filter(q => q.id !== id);
  render();
}

function moveQuestion(id, dir) {
  const i = state.questions.findIndex(q => q.id === id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= state.questions.length) return;
  [state.questions[i], state.questions[j]] = [state.questions[j], state.questions[i]];
  render();
}

/* ===========================
   ✅ Drag & Drop (ikon yok)
   - Sadece qHead üzerinden sürükle
   =========================== */
let dragId = null;

function reorderByIds(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;

  const from = state.questions.findIndex(q => q.id === fromId);
  const to = state.questions.findIndex(q => q.id === toId);
  if (from < 0 || to < 0) return;

  const [moved] = state.questions.splice(from, 1);
  state.questions.splice(to, 0, moved);
}

function cleanupUi() {
  // burada ekstra temizlemek istediğin şey varsa
}

function render() {
  const list = $("#questionList");
  if (!list) return;

  list.innerHTML = "";
  cleanupUi();

  const tpl = $("#tplQuestion");
  state.questions.forEach((q, idx) => {
    if (q.fontSize == null) q.fontSize = 11;

    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.qid = q.id;

    // 🎨 Soru tipine göre renk sınıfı (sol şerit)
    node.classList.remove("type-classic", "type-mc", "type-tf", "type-code", "type-match");
    node.classList.add(`type-${q.type}`);

    // ✅ Drag & Drop: kart draggable
    node.draggable = true;

    const qNoEl = node.querySelector(".qNo");
    const sel = node.querySelector(".qType");
    const points = node.querySelector(".qPoints");
    const qText = node.querySelector(".qText");

    const fontInp = node.querySelector(".qFont");
    const btnDec = node.querySelector(".qFontDec");
    const btnInc = node.querySelector(".qFontInc");

    const linesInp = node.querySelector(".qLines");

    const qHead = node.querySelector(".qHead");

    // Sadece qHead'e basınca “armed” olsun.
    node._dragArmed = false;

    const isFormEl = (el) => {
      const t = (el?.tagName || "").toLowerCase();
      return t === "input" || t === "textarea" || t === "select" || t === "button" || t === "option";
    };

    if (qHead) {
      qHead.addEventListener("pointerdown", (e) => {
        // form elemanı üstünden sürükleme açılmasın
        if (isFormEl(e.target) || e.target.closest("input,textarea,select,button")) {
          node._dragArmed = false;
          return;
        }
        node._dragArmed = true;
      });

      const disarm = () => { node._dragArmed = false; };
      qHead.addEventListener("pointerup", disarm);
      qHead.addEventListener("pointerleave", disarm);
      qHead.addEventListener("pointercancel", disarm);
    }

    node.addEventListener("dragstart", (e) => {
      // sadece qHead ile arm edildiyse başlasın
      if (!node._dragArmed) {
        e.preventDefault();
        return;
      }
      node._dragArmed = false;

      dragId = q.id;
      node.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", q.id);
    });

    node.addEventListener("dragend", () => {
      dragId = null;
      node.classList.remove("dragging");
      document.querySelectorAll(".qCard.dragOver").forEach(el => el.classList.remove("dragOver"));
    });

    node.addEventListener("dragover", (e) => {
      if (!dragId) return;
      e.preventDefault();
      node.classList.add("dragOver");
      e.dataTransfer.dropEffect = "move";
    });

    node.addEventListener("dragleave", () => {
      node.classList.remove("dragOver");
    });

    node.addEventListener("drop", (e) => {
      e.preventDefault();
      node.classList.remove("dragOver");

      const fromId = e.dataTransfer.getData("text/plain") || dragId;
      const toId = node.dataset.qid;

      reorderByIds(fromId, toId);
      render();
    });

    const applyFont = (v) => {
      q.fontSize = clampFont(v);
      if (fontInp) fontInp.value = q.fontSize;

      if (qNoEl) qNoEl.style.fontSize = `${uiFontPx(q.fontSize) + 2}px`;

      if (qText) {
        qText.style.fontSize = `${uiFontPx(q.fontSize)}px`;
        qText.style.lineHeight = "1.35";
      }
    };

    // üst satır değerleri
    if (qNoEl) qNoEl.textContent = `${idx + 1}. Soru`;
    sel.value = q.type;
    points.value = q.points;

    // textarea
    qText.value = q.text;

    // ilk çizimde de uygula
    applyFont(q.fontSize ?? 11);

    // font events
    fontInp?.addEventListener("input", () => applyFont(fontInp.value));
    fontInp?.addEventListener("change", () => applyFont(fontInp.value));
    btnDec?.addEventListener("click", () => applyFont((q.fontSize ?? 11) - 1));
    btnInc?.addEventListener("click", () => applyFont((q.fontSize ?? 11) + 1));

    // boşluk satır ayarı
    if (linesInp) linesInp.value = q.answerLines ?? 0;
    const updateLines = () => { q.answerLines = Math.max(0, Number(linesInp?.value || 0)); };
    linesInp?.addEventListener("input", updateLines);
    linesInp?.addEventListener("change", updateLines);

    // bodies
    const bodies = {
      classic: node.querySelector(".qBody.classic"),
      mc: node.querySelector(".qBody.mc"),
      tf: node.querySelector(".qBody.tf"),
      match: node.querySelector(".qBody.match"),
      code: node.querySelector(".qBody.code"),
    };
    Object.values(bodies).forEach(b => b.classList.add("hidden"));
    bodies[q.type].classList.remove("hidden");

    // MC options
    if (q.type === "mc") {
      const optList = node.querySelector(".optList");
      optList.innerHTML = "";

      q.options.forEach((opt, oi) => {
        const optNode = $("#tplOption").content.firstElementChild.cloneNode(true);
        const inp = optNode.querySelector(".optText");
        inp.value = opt;

        const saveOpt = () => { q.options[oi] = inp.value; };
        inp.addEventListener("input", saveOpt);
        inp.addEventListener("change", saveOpt);

        optNode.querySelector(".optDel").addEventListener("click", () => {
          q.options.splice(oi, 1);
          if (q.options.length === 0) q.options.push("");
          render();
        });

        optList.appendChild(optNode);
      });

      node.querySelector(".addOption").addEventListener("click", () => {
        q.options.push("");
        render();
      });
    }

    // TF items
    if (q.type === "tf") {
      const tfList = node.querySelector(".tfList");
      tfList.innerHTML = "";

      q.tfItems.forEach((t, ti) => {
        const tNode = $("#tplTFItem").content.firstElementChild.cloneNode(true);
        const inp = tNode.querySelector(".tfText");
        inp.value = t;

        const save = () => { q.tfItems[ti] = inp.value; };
        inp.addEventListener("input", save);
        inp.addEventListener("change", save);

        tNode.querySelector(".tfDel").addEventListener("click", () => {
          q.tfItems.splice(ti, 1);
          if (q.tfItems.length === 0) q.tfItems.push("");
          render();
        });

        tfList.appendChild(tNode);
      });

      node.querySelector(".addTF").addEventListener("click", () => {
        q.tfItems.push("");
        render();
      });
    }

    // Match pairs
    if (q.type === "match") {
      const pairGrid = node.querySelector(".pairGrid");
      pairGrid.innerHTML = "";

      q.pairs.forEach((p, pi) => {
        const pNode = $("#tplPair").content.firstElementChild.cloneNode(true);
        const left = pNode.querySelector(".pairLeft");
        const right = pNode.querySelector(".pairRight");
        left.value = p.left;
        right.value = p.right;

        const saveL = () => { q.pairs[pi].left = left.value; };
        const saveR = () => { q.pairs[pi].right = right.value; };
        left.addEventListener("input", saveL);
        left.addEventListener("change", saveL);
        right.addEventListener("input", saveR);
        right.addEventListener("change", saveR);

        pNode.querySelector(".pairDel").addEventListener("click", () => {
          q.pairs.splice(pi, 1);
          if (q.pairs.length === 0) q.pairs.push({ left: "", right: "" });
          render();
        });

        pairGrid.appendChild(pNode);
      });

      node.querySelector(".addPair").addEventListener("click", () => {
        q.pairs.push({ left: "", right: "" });
        render();
      });
    }

    // Code
    if (q.type === "code") {
      const codeArea = node.querySelector(".qCode");
      codeArea.value = q.code;

      const saveCode = () => { q.code = codeArea.value; };
      codeArea.addEventListener("input", saveCode);
      codeArea.addEventListener("change", saveCode);
    }

    // Type change
    sel.addEventListener("change", () => {
      const newType = sel.value;

      if (newType === "tf" && q.type !== "tf" && state.questions.some(x => x.type === "tf")) {
        alert("Doğru/Yanlış bölümü zaten var. İçine madde ekle.");
        sel.value = q.type;
        return;
      }
      if (newType === "match" && q.type !== "match" && state.questions.some(x => x.type === "match")) {
        alert("Eşleştirme bölümü zaten var. İçine çift ekle.");
        sel.value = q.type;
        return;
      }

      q.type = newType;
      render();
    });

    const savePts = () => { q.points = Number(points.value || 0); };
    points.addEventListener("input", savePts);
    points.addEventListener("change", savePts);

    const saveText = () => { q.text = qText.value; };
    qText.addEventListener("input", saveText);
    qText.addEventListener("change", saveText);

    node.querySelector(".del").addEventListener("click", () => removeQuestion(q.id));
    node.querySelector(".up").addEventListener("click", () => moveQuestion(q.id, -1));
    node.querySelector(".down").addEventListener("click", () => moveQuestion(q.id, +1));

    list.appendChild(node);
  });
}

// PDF tarafında KaTeX yok (şimdilik)
function renderInlineMath(s) { return s; }

function defaultInstruction(q) {
  if (q.type === "tf") return "Aşağıdaki ifadeler için doğru olanlara (D), yanlış olanlara (Y) işaretleyiniz.";
  if (q.type === "mc") return "Aşağıdaki çoktan seçmeli soruyu cevaplayınız.";
  if (q.type === "match") return "Aşağıdakileri eşleştiriniz.";
  if (q.type === "code") return "Aşağıdaki kod sorusunu cevaplayınız.";
  return "";
}

function buildPrint() {
  const school = ($("#schoolName")?.value || "").trim();
  const yearLine = ($("#schoolYear")?.value || "").trim();
  const courseLine = ($("#courseLine")?.value || "").trim();
  const title = ($("#examTitle")?.value || "").trim();

  const dateRaw = ($("#examDate")?.value || "").trim();
  const date = formatDatePretty(dateRaw);
  const footer = ($("#footerText")?.value || "").trim();

  const css = `
@page{
  size:A4;
  margin:18mm 16mm 22mm 16mm;
  @bottom-center{
    content:"${escapeHtml(footer)}";
    font-size:11pt;
    font-weight:700;
    color:#222;
  }
  @bottom-right{
    content:"Sayfa " counter(page) " / " counter(pages);
    font-size:10pt;
    color:#444;
  }
}
html,body{margin:0;padding:0}
body{font-family:"DejaVu Sans", Arial, sans-serif;color:#111}

.headerBlock{text-align:center;margin-top:2mm;margin-bottom:6mm}
.headerBlock .l1,.headerBlock .l2,.headerBlock .l3,.headerBlock .l4{
  font-size:12pt;font-weight:800;letter-spacing:.2px;margin-top:1.2mm;text-transform:uppercase;
}

.infoTbl{width:100%;border-collapse:collapse;margin:2mm 0 8mm 0}
.infoTbl td{font-size:11pt;font-weight:700;padding:2mm 0;vertical-align:bottom}
.infoTbl .lbl{width:26mm;white-space:nowrap}
.infoTbl .fillCell{width:auto}
.infoTbl .dateCell{width:55mm;text-align:right;white-space:nowrap}

.qBox{
  border:1px solid #777;border-radius:8px;padding:4mm;margin:6mm 0 8mm 0;
  break-inside:avoid;page-break-inside:avoid;
}
.qHeader{display:flex;align-items:baseline;justify-content:space-between;gap:4mm;margin-bottom:2mm}
.qTitleLeft{flex:1; padding-right:4mm}
.qNo{font-weight:800}
.qPts{min-width:16mm;text-align:right;font-weight:800;white-space:nowrap}

.qTitleText{ font-weight:600; line-height:1.45; text-align:justify; }

.mcOpt{margin-left:4mm}
.mcOpt .opt{margin:1mm 0;font-size:10.8pt}

.codeBox{
  border-radius:8px;
  padding:6px 10px;
  margin:2mm 0 3mm 0;
  font-family:"DejaVu Sans Mono", ui-monospace, Menlo, Monaco, Consolas, monospace;
  font-size:9.6pt; line-height:1.25;
  white-space:pre;
  background:#f7f7f7;border:1px solid #9a9a9a;
  break-inside:avoid;page-break-inside:avoid;
  box-decoration-break:clone;-webkit-box-decoration-break:clone;
}
.ansChunk{display:block;width:100%}

.tfTable,.matchTable{width:100%;border-collapse:collapse;margin-top:2mm}
.tfTable th,.tfTable td,.matchTable td,.matchTable th{
  border:1px solid #777;padding:5px 6px;font-size:10.5pt;vertical-align:top
}
.tfTable th{background:#f4f4f4;text-align:left}
.tfCol{width:9mm;text-align:center}
.box{display:inline-block;width:3.5mm;height:3.5mm;border:1px solid #111}
.matchTable{table-layout:fixed}
.matchTable .colL{width:55%}
.matchTable .colR{width:45%}
.matchItem{display:flex;gap:2mm;margin:1.2mm 0}
.matchLetter{width:7mm;font-weight:800}
.blank{display:inline-block;min-width:18mm;border-bottom:1px solid #111}
`;

  let html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>${css}</style></head><body>`;

  html += `<div class="headerBlock">`;
  if (school) html += `<div class="l1">${escapeHtml(school)}</div>`;
  if (yearLine) html += `<div class="l2">${escapeHtml(yearLine)}</div>`;
  if (courseLine) html += `<div class="l3">${escapeHtml(courseLine)}</div>`;
  if (title) html += `<div class="l4">${escapeHtml(title)}</div>`;
  html += `</div>`;

  html += `
<table class="infoTbl">
  <tr>
    <td class="lbl">İsim Soyisim:</td>
    <td class="fillCell"></td>
    <td class="dateCell">Tarih: ${escapeHtml(date)}</td>
  </tr>
  <tr>
    <td class="lbl">Sınıf / No:</td>
    <td class="fillCell"></td>
    <td class="dateCell"></td>
  </tr>
</table>`;

  let qNo = 1;
  const tfBlock = state.questions.find(q => q.type === "tf");
  const matchBlock = state.questions.find(q => q.type === "match");

  state.questions.forEach(q => {
    if (q.type === "tf" || q.type === "match") return;

    const fs = clampFont(q.fontSize ?? 11);
    const noFs = Math.min(16, fs + 1);

    html += `<div class="qBox">`;
    html += `<div class="qHeader">
      <div class="qTitleLeft">
        <span class="qNo" style="font-size:${noFs}pt">${qNo}. Soru</span>
        ${(q.text || "").trim()
        ? `<span class="qDash"> — </span><span class="qTitleText" style="font-size:${fs}pt">${renderInlineMath(escapeHtml(q.text))}</span>`
        : ""}
      </div>
      <div class="qPts">(${Number(q.points || 0)} Puan)</div>
    </div>`;

    if (q.type === "mc") {
      html += `<div class="mcOpt">`;
      q.options.forEach((o, i) => {
        const letter = String.fromCharCode(65 + i);
        html += `<div class="opt">${letter}) ${renderInlineMath(escapeHtml(o))}</div>`;
      });
      html += `</div>`;
    }

    if (q.type === "code") {
      const codeText = (q.code || "").trim();
      if (codeText) html += `<pre class="codeBox">${escapeHtml(codeText)}</pre>`;
    }

    const lines = Math.max(0, Number(q.answerLines ?? 0));
    const gapMm = Math.max(0, Number(q.answerGapMm ?? 12));
    for (let i = 0; i < lines; i++) html += `<div class="ansChunk" style="height:${gapMm}mm"></div>`;

    html += `</div>`;
    qNo++;
  });

  if (tfBlock) {
    const inst = (tfBlock.text || "").trim() || defaultInstruction(tfBlock);
    html += `<div class="qBox">`;
    html += `<div class="qHeader">
      <div class="qTitleLeft"><span class="qNo">${qNo}. Soru</span></div>
      <div class="qPts">(${Number(tfBlock.points || 0)} Puan)</div>
    </div>`;

    if (inst) {
      html += `<div style="font-size:10.8pt; font-weight:700; margin:0 0 2mm 0;">${renderInlineMath(escapeHtml(inst))}</div>`;
    }

    const items = tfBlock.tfItems.filter(x => (x || "").trim().length > 0);
    html += `
<table class="tfTable">
  <thead><tr><th class="tfCol">D</th><th class="tfCol">Y</th><th>İfade</th></tr></thead>
  <tbody>
    ${items.map(t => `
      <tr>
        <td class="tfCol"><span class="box"></span></td>
        <td class="tfCol"><span class="box"></span></td>
        <td>${escapeHtml(t)}</td>
      </tr>
    `).join("")}
  </tbody>
</table>
</div>`;
    qNo++;
  }

  if (matchBlock) {
    const inst = (matchBlock.text || "").trim() || defaultInstruction(matchBlock);

    html += `<div class="qBox">`;
    html += `<div class="qHeader">
      <div class="qTitleLeft"><span class="qNo">${qNo}. Soru</span></div>
      <div class="qPts">(${Number(matchBlock.points || 0)} Puan)</div>
    </div>`;

    if (inst) {
      html += `<div style="font-size:10.8pt; font-weight:700; margin:0 0 2mm 0;">${renderInlineMath(escapeHtml(inst))}</div>`;
    }

    const pairs = matchBlock.pairs.filter(p => (p.left || "").trim() || (p.right || "").trim());
    const rightCol = pairs.map(p => p.right);

    html += `<table class="matchTable">
      <thead><tr><th class="colL">Sol</th><th class="colR">Sağ</th></tr></thead>
      <tbody><tr>`;

    html += `<td class="colL">`;
    pairs.forEach((p, i) => {
      const L = String.fromCharCode(65 + i);
      html += `<div class="matchItem"><div class="matchLetter">${L})</div><div>${renderInlineMath(escapeHtml(p.left))} → <span class="blank"></span></div></div>`;
    });
    html += `</td>`;

    html += `<td class="colR">`;
    rightCol.forEach((r, i) => {
      html += `<div>${i + 1}) ${renderInlineMath(escapeHtml(r))}</div>`;
    });
    html += `</td>`;

    html += `</tr></tbody></table></div>`;
    qNo++;
  }

  html += `</body></html>`;
  return html;
}

function makePdf() {
  const htmlContent = buildPrint();

  if (!htmlContent || state.questions.length === 0) {
    alert("Lütfen önce soru ekleyin!");
    return;
  }

  // Yeni sekmede aç
  const w = window.open("", "_blank");
  if (!w) {
    alert("Tarayıcı pop-up engelledi. İzin ver.");
    return;
  }

  w.document.open();
  w.document.write(htmlContent);
  w.document.close();

  // Yazdır → PDF Kaydet
  w.onload = () => {
    w.focus();
    w.print();
  };
}


function bind() {
  // üstteki btnAdd yok, sadece alttaki var
  $("#btnAdd2")?.addEventListener("click", () => addQuestion("classic"));
  $("#btnPdf")?.addEventListener("click", makePdf);
  bindDateMask();
  cleanupUi();
}

function seed() {
  if (state.questions.length === 0) addQuestion("classic");
}

bind();
seed();
