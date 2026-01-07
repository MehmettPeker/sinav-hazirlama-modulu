/* ===========================
   EXAM APP.JS (FINAL)
   - UI: her soru tipinde Cevap alanı (classic/mc/code/math)
   - TF: her madde için D/Y seçimi
   - Match: her çift için cevap # girişi
   - PDF: Öğrenci PDF + Cevap Anahtarı PDF (Soru üstte / Cevap altta)
   - KaTeX: print sayfasında render + sonra print
   - DnD: sadece başlıktan sürükle
   =========================== */

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

function uiFontPx(pt) {
  return Math.round(pt * 1.1 + 6);
}

/* ===========================
   Add / remove / move
   =========================== */
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

    // öğretmen cevabı (classic/mc/code/math için)
    answerText: "",

    // MC
    options: ["", "", "", ""],
    correctIndex: 0,

    // TF
    tfItems: [""],
    tfAns: [""], // "D" / "Y" / ""

    // Match
    pairs: [{ left: "", right: "", ans: "" }], // ans: "1"..."n"

    // Code
    code: "",

    // öğrenci pdf boşluk
    answerLines: 0,
    answerGapMm: 12,

    // Math
    mathPrompt: "",
    mathExpr: ""
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
   Drag & Drop
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

function cleanupUi() { }

/* ===========================
   Math helpers (UI)
   =========================== */
function insertAtCursor(textarea, snippet) {
  if (!textarea) return;

  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;

  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);

  textarea.value = before + snippet + after;

  const bracePos = snippet.indexOf("{}");
  if (bracePos >= 0) {
    const newPos = start + bracePos + 1;
    textarea.setSelectionRange(newPos, newPos);
  } else {
    const newPos = start + snippet.length;
    textarea.setSelectionRange(newPos, newPos);
  }

  textarea.focus();
}

function normalizeMathInput(expr) {
  const s = (expr || "").trim();
  if (!s) return "";
  return s
    .replace(/^\$\$\s*/, "").replace(/\s*\$\$$/, "")
    .replace(/^\$\s*/, "").replace(/\s*\$$/, "");
}

function renderWithKatex(hostEl, latex) {
  if (!hostEl) return;
  const expr = normalizeMathInput(latex);

  if (!expr) {
    hostEl.classList.add("muted");
    hostEl.textContent = "İfade yazınca burada görünecek.";
    return;
  }

  if (!window.katex) {
    hostEl.classList.add("muted");
    hostEl.textContent = expr;
    return;
  }

  hostEl.classList.remove("muted");
  try {
    window.katex.render(expr, hostEl, { throwOnError: false, displayMode: true });
  } catch (e) {
    hostEl.classList.add("muted");
    hostEl.textContent = expr;
  }
}

/* ===========================
   RENDER
   =========================== */
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

    // sol şerit
    node.classList.remove("type-classic", "type-mc", "type-tf", "type-code", "type-match", "type-math");
    node.classList.add(`type-${q.type}`);

    // drag kapalı
    node.draggable = false;
    node._dragArmed = false;

    const qNoEl = node.querySelector(".qNo");
    const sel = node.querySelector(".qType");
    const points = node.querySelector(".qPoints");
    const qText = node.querySelector(".qText");
    const qTextWrap = node.querySelector(".qTextWrap");

    const fontInp = node.querySelector(".qFont");
    const btnDec = node.querySelector(".qFontDec");
    const btnInc = node.querySelector(".qFontInc");

    const linesInp = node.querySelector(".qLines");
    const qHead = node.querySelector(".qHead");

    // Drag sadece başlıktan
    const isFormEl = (el) => {
      const t = (el?.tagName || "").toLowerCase();
      return t === "input" || t === "textarea" || t === "select" || t === "button" || t === "option";
    };

    if (qHead) {
      qHead.addEventListener("pointerdown", (e) => {
        if (isFormEl(e.target) || e.target.closest("input,textarea,select,button")) {
          node._dragArmed = false;
          node.draggable = false;
          return;
        }
        node._dragArmed = true;
        node.draggable = true;
      });

      const disarm = () => { node._dragArmed = false; node.draggable = false; };
      qHead.addEventListener("pointerup", disarm);
      qHead.addEventListener("pointerleave", disarm);
      qHead.addEventListener("pointercancel", disarm);
    }

    node.addEventListener("dragstart", (e) => {
      if (!node._dragArmed) { e.preventDefault(); node.draggable = false; return; }
      node._dragArmed = false;
      dragId = q.id;
      node.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", q.id);
    });

    node.addEventListener("dragend", () => {
      dragId = null;
      node.classList.remove("dragging");
      node.draggable = false;
      document.querySelectorAll(".qCard.dragOver").forEach(el => el.classList.remove("dragOver"));
    });

    node.addEventListener("dragover", (e) => {
      if (!dragId) return;
      e.preventDefault();
      node.classList.add("dragOver");
      e.dataTransfer.dropEffect = "move";
    });

    node.addEventListener("dragleave", () => node.classList.remove("dragOver"));

    node.addEventListener("drop", (e) => {
      e.preventDefault();
      node.classList.remove("dragOver");
      const fromId = e.dataTransfer.getData("text/plain") || dragId;
      reorderByIds(fromId, node.dataset.qid);
      render();
    });

    // Üst satır değerleri
    if (qNoEl) qNoEl.textContent = `${idx + 1}. Soru`;
    if (sel) sel.value = q.type;
    if (points) points.value = q.points;
    if (qText) qText.value = q.text;

    const applyFont = (v) => {
      q.fontSize = clampFont(v);
      if (fontInp) fontInp.value = q.fontSize;
      if (qNoEl) qNoEl.style.fontSize = `${uiFontPx(q.fontSize) + 2}px`;
      if (qText) {
        qText.style.fontSize = `${uiFontPx(q.fontSize)}px`;
        qText.style.lineHeight = "1.35";
      }
    };

    applyFont(q.fontSize ?? 11);

    fontInp?.addEventListener("input", () => applyFont(fontInp.value));
    fontInp?.addEventListener("change", () => applyFont(fontInp.value));
    btnDec?.addEventListener("click", () => applyFont((q.fontSize ?? 11) - 1));
    btnInc?.addEventListener("click", () => applyFont((q.fontSize ?? 11) + 1));

    if (linesInp) linesInp.value = q.answerLines ?? 0;
    const updateLines = () => { q.answerLines = Math.max(0, Number(linesInp?.value || 0)); };
    linesInp?.addEventListener("input", updateLines);
    linesInp?.addEventListener("change", updateLines);

    // Bodies toggle
    const bodies = {
      classic: node.querySelector(".qBody.classic"),
      mc: node.querySelector(".qBody.mc"),
      tf: node.querySelector(".qBody.tf"),
      match: node.querySelector(".qBody.match"),
      code: node.querySelector(".qBody.code"),
      math: node.querySelector(".qBody.math"),
    };
    Object.values(bodies).forEach(b => b && b.classList.add("hidden"));
    if (bodies[q.type]) bodies[q.type].classList.remove("hidden");

    // Math seçilince soru metni gizle
    if (qTextWrap) {
      if (q.type === "math") qTextWrap.classList.add("hidden");
      else qTextWrap.classList.remove("hidden");
    }

    // ✅ Cevap alanları (hangi body’de varsa)
    node.querySelectorAll(".qAnswer").forEach((ta) => {
      ta.value = q.answerText || "";
      const saveAns = () => { q.answerText = ta.value; };
      ta.addEventListener("input", saveAns);
      ta.addEventListener("change", saveAns);
    });

    // MC
    if (q.type === "mc") {
      const optList = node.querySelector(".optList");
      if (optList) optList.innerHTML = "";

      const corrSel = node.querySelector(".mcCorrect");
      if (corrSel) {
        const letters = q.options.map((_, i) => String.fromCharCode(65 + i));
        corrSel.innerHTML = letters.map(l => `<option value="${l}">${l}</option>`).join("");

        const maxIdx = Math.max(0, q.options.length - 1);
        q.correctIndex = Math.max(0, Math.min(maxIdx, Number(q.correctIndex ?? 0)));
        corrSel.value = letters[q.correctIndex] || "A";

        corrSel.addEventListener("change", () => {
          const idx2 = letters.indexOf(corrSel.value);
          q.correctIndex = idx2 >= 0 ? idx2 : 0;
        });
      }

      q.options.forEach((opt, oi) => {
        const optNode = $("#tplOption").content.firstElementChild.cloneNode(true);
        const inp = optNode.querySelector(".optText");
        inp.value = opt;

        const saveOpt = () => { q.options[oi] = inp.value; };
        inp.addEventListener("input", saveOpt);
        inp.addEventListener("change", saveOpt);

        optNode.querySelector(".optDel")?.addEventListener("click", () => {
          q.options.splice(oi, 1);
          if (q.options.length === 0) q.options.push("");
          if (q.correctIndex >= q.options.length) q.correctIndex = Math.max(0, q.options.length - 1);
          render();
        });

        optList?.appendChild(optNode);
      });

      node.querySelector(".addOption")?.addEventListener("click", () => {
        q.options.push("");
        render();
      });
    }

    // TF
    if (q.type === "tf") {
      const tfList = node.querySelector(".tfList");
      if (tfList) tfList.innerHTML = "";

      if (!Array.isArray(q.tfAns)) q.tfAns = q.tfItems.map(() => "");

      q.tfItems.forEach((t, ti) => {
        const tNode = $("#tplTFItem").content.firstElementChild.cloneNode(true);
        const inp = tNode.querySelector(".tfText");
        const ansSel = tNode.querySelector(".tfAns");

        inp.value = t ?? "";
        if (ansSel) {
          ansSel.value = (q.tfAns[ti] ?? "");
          ansSel.addEventListener("change", () => { q.tfAns[ti] = ansSel.value; });
        }

        const save = () => { q.tfItems[ti] = inp.value; };
        inp.addEventListener("input", save);
        inp.addEventListener("change", save);

        tNode.querySelector(".tfDel")?.addEventListener("click", () => {
          q.tfItems.splice(ti, 1);
          q.tfAns.splice(ti, 1);
          if (q.tfItems.length === 0) { q.tfItems.push(""); q.tfAns.push(""); }
          render();
        });

        tfList?.appendChild(tNode);
      });

      node.querySelector(".addTF")?.addEventListener("click", () => {
        q.tfItems.push("");
        q.tfAns.push("");
        render();
      });
    }

    // Match
    if (q.type === "match") {
      const pairGrid = node.querySelector(".pairGrid");
      if (pairGrid) pairGrid.innerHTML = "";

      q.pairs.forEach((p, pi) => {
        const pNode = $("#tplPair").content.firstElementChild.cloneNode(true);
        const left = pNode.querySelector(".pairLeft");
        const right = pNode.querySelector(".pairRight");
        const ans = pNode.querySelector(".pairAns");

        left.value = p.left ?? "";
        right.value = p.right ?? "";
        if (ans) ans.value = p.ans ?? "";

        const saveL = () => { q.pairs[pi].left = left.value; };
        const saveR = () => { q.pairs[pi].right = right.value; };
        const saveA = () => { q.pairs[pi].ans = ans?.value ?? ""; };

        left.addEventListener("input", saveL);
        left.addEventListener("change", saveL);
        right.addEventListener("input", saveR);
        right.addEventListener("change", saveR);
        ans?.addEventListener("input", saveA);
        ans?.addEventListener("change", saveA);

        pNode.querySelector(".pairDel")?.addEventListener("click", () => {
          q.pairs.splice(pi, 1);
          if (q.pairs.length === 0) q.pairs.push({ left: "", right: "", ans: "" });
          render();
        });

        pairGrid?.appendChild(pNode);
      });

      node.querySelector(".addPair")?.addEventListener("click", () => {
        q.pairs.push({ left: "", right: "", ans: "" });
        render();
      });
    }

    // Code
    if (q.type === "code") {
      const codeArea = node.querySelector(".qCode");
      if (codeArea) codeArea.value = q.code || "";
      const saveCode = () => { q.code = codeArea?.value ?? ""; };
      codeArea?.addEventListener("input", saveCode);
      codeArea?.addEventListener("change", saveCode);
    }

    // Math
    if (q.type === "math") {
      const promptArea = node.querySelector(".mathPrompt");
      const exprArea = node.querySelector(".mathExpr");
      const previewBox = node.querySelector(".mathPreview");

      if (promptArea) promptArea.value = q.mathPrompt || "";
      if (exprArea) exprArea.value = q.mathExpr || "";

      const updatePreview = () => {
        q.mathPrompt = promptArea?.value ?? "";
        q.mathExpr = exprArea?.value ?? "";
        renderWithKatex(previewBox, q.mathExpr);
      };

      promptArea?.addEventListener("input", updatePreview);
      promptArea?.addEventListener("change", updatePreview);
      exprArea?.addEventListener("input", updatePreview);
      exprArea?.addEventListener("change", updatePreview);

      node.querySelectorAll(".mIns").forEach(btn => {
        btn.addEventListener("click", () => {
          const snippet = btn.getAttribute("data-insert") || "";
          insertAtCursor(exprArea, snippet);
          updatePreview();
        });
      });

      updatePreview();
    }

    // Type change
    sel?.addEventListener("change", () => {
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

    const savePts = () => { q.points = Number(points?.value || 0); };
    points?.addEventListener("input", savePts);
    points?.addEventListener("change", savePts);

    const saveText = () => { q.text = qText?.value ?? ""; };
    qText?.addEventListener("input", saveText);
    qText?.addEventListener("change", saveText);

    node.querySelector(".del")?.addEventListener("click", () => removeQuestion(q.id));
    node.querySelector(".up")?.addEventListener("click", () => moveQuestion(q.id, -1));
    node.querySelector(".down")?.addEventListener("click", () => moveQuestion(q.id, +1));

    list.appendChild(node);
  });
}

/* ===========================
   PRINT helpers
   =========================== */
function defaultInstruction(q) {
  if (q.type === "tf") return "Aşağıdaki ifadeler için doğru olanlara (D), yanlış olanlara (Y) işaretleyiniz.";
  if (q.type === "mc") return "Aşağıdaki çoktan seçmeli soruyu cevaplayınız.";
  if (q.type === "match") return "Aşağıdakileri eşleştiriniz.";
  if (q.type === "code") return "Aşağıdaki kod sorusunu cevaplayınız.";
  if (q.type === "math") return "Aşağıdaki ifadeyi düzenleyiniz / sadeleştiriniz.";
  return "";
}

function getHeaderInfo() {
  const school = ($("#schoolName")?.value || "").trim();
  const yearLine = ($("#schoolYear")?.value || "").trim();
  const courseLine = ($("#courseLine")?.value || "").trim();
  const title = ($("#examTitle")?.value || "").trim();

  const dateRaw = ($("#examDate")?.value || "").trim();
  const date = formatDatePretty(dateRaw);
  const footer = ($("#footerText")?.value || "").trim();
  return { school, yearLine, courseLine, title, date, footer };
}

function injectRenderMathAndPrint() {
  return `
<script>
window.addEventListener("load", async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch(e) {}

  // KaTeX auto render yükle (print sayfası için)
  let ok = false;
  const start = Date.now();

  // auto-render'i dinamik yükle
  if (!document.querySelector("script[data-auto-render]")) {
    const s = document.createElement("script");
    s.defer = true;
    s.src = "https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/contrib/auto-render.min.js";
    s.setAttribute("data-auto-render", "1");
    document.head.appendChild(s);
  }

  while (Date.now() - start < 3500) {
    if (window.renderMathInElement) { ok = true; break; }
    await sleep(80);
  }

  try {
    if (ok) {
      renderMathInElement(document.body, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false }
        ],
        throwOnError: false
      });
    }
  } catch(e) {}

  await sleep(250);
  window.print();
});
</script>`;
}

/* ===========================
   STUDENT PDF
   =========================== */
function buildPrint() {
  const { school, yearLine, courseLine, title, date, footer } = getHeaderInfo();

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

.katex{font-size:1.05em;}
.mathBlock{margin-top:2mm}
.mathPrompt{font-size:11pt;font-weight:700;margin:0 0 2mm 0}
.mathExpr{display:block;text-align:right;margin:2mm 18mm 1mm 0;}
`;

  let html = `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js"></script>
<style>${css}</style>
</head><body>`;

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
      </div>
      <div class="qPts">(${Number(q.points || 0)} Puan)</div>
    </div>`;

    if ((q.text || "").trim()) {
      html += `<div class="qTitleText" style="font-size:${fs}pt">${escapeHtml(q.text)}</div>`;
    }

    if (q.type === "mc") {
      html += `<div class="mcOpt">`;
      q.options.forEach((o, i) => {
        const letter = String.fromCharCode(65 + i);
        html += `<div class="opt">${letter}) ${escapeHtml(o)}</div>`;
      });
      html += `</div>`;
    }

    if (q.type === "code") {
      const codeText = (q.code || "").trim();
      if (codeText) html += `<pre class="codeBox">${escapeHtml(codeText)}</pre>`;
    }

    if (q.type === "math") {
      const prompt = (q.mathPrompt || "").trim() || defaultInstruction(q);
      const expr = normalizeMathInput(q.mathExpr || "");
      html += `<div class="mathBlock">`;
      html += `<div class="mathPrompt">${escapeHtml(prompt)}</div>`;
      if (expr) html += `<div class="mathExpr">$$${escapeHtml(expr)}$$</div>`;
      html += `</div>`;
    }

    // öğrenci cevap boşlukları
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

    if (inst) html += `<div style="font-size:10.8pt; font-weight:700; margin:0 0 2mm 0;">${escapeHtml(inst)}</div>`;

    const items = (tfBlock.tfItems || []).filter(x => (x || "").trim().length > 0);
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

    if (inst) html += `<div style="font-size:10.8pt; font-weight:700; margin:0 0 2mm 0;">${escapeHtml(inst)}</div>`;

    const pairs = (matchBlock.pairs || []).filter(p => (p.left || "").trim() || (p.right || "").trim());
    const rightCol = pairs.map(p => p.right);

    html += `<table class="matchTable">
      <thead><tr><th class="colL">Sol</th><th class="colR">Sağ</th></tr></thead>
      <tbody><tr>`;

    html += `<td class="colL">`;
    pairs.forEach((p, i) => {
      const L = String.fromCharCode(65 + i);
      html += `<div class="matchItem"><div class="matchLetter">${L})</div><div>${escapeHtml(p.left)} → <span class="blank"></span></div></div>`;
    });
    html += `</td>`;

    html += `<td class="colR">`;
    rightCol.forEach((r, i) => html += `<div>${i + 1}) ${escapeHtml(r)}</div>`);
    html += `</td>`;

    html += `</tr></tbody></table></div>`;
    qNo++;
  }

  html += injectRenderMathAndPrint();
  html += `</body></html>`;
  return html;
}

/* ===========================
   ANSWER KEY PDF
   - Soru üstte, cevap altta
   =========================== */
function questionStemHtml(q, no) {
  const t = (q.text || "").trim();

  if (q.type === "mc") {
    const opts = (q.options || []).map((o, i) => {
      const L = String.fromCharCode(65 + i);
      const txt = (o || "").trim();
      return txt ? `<div class="optLine"><b>${L})</b> ${escapeHtml(txt)}</div>` : "";
    }).join("");

    return `
      <div class="stemTitle"><b>${no}.</b> ${t ? escapeHtml(t) : "<span class='muted2'>(Soru metni yok)</span>"}</div>
      <div class="opts">${opts}</div>
    `;
  }

  if (q.type === "code") {
    const code = (q.code || "").trim();
    return `
      <div class="stemTitle"><b>${no}.</b> ${t ? escapeHtml(t) : "<span class='muted2'>(Soru metni yok)</span>"}</div>
      ${code ? `<pre class="codeBox">${escapeHtml(code)}</pre>` : ""}
    `;
  }

  if (q.type === "math") {
    const prompt = (q.mathPrompt || "").trim();
    const expr = normalizeMathInput(q.mathExpr || "");
    return `
      <div class="stemTitle"><b>${no}.</b> ${escapeHtml(prompt || t || "Matematik Sorusu")}</div>
      ${expr ? `<div class="mathExpr">$$${escapeHtml(expr)}$$</div>` : ""}
    `;
  }

  return `<div class="stemTitle"><b>${no}.</b> ${t ? escapeHtml(t) : "<span class='muted2'>(Soru metni yok)</span>"}</div>`;
}

function answerHtml(q) {
  const toLines = (s) => escapeHtml(s).replace(/\n/g, "<br>");

  if (q.type === "mc") {
    const letters = (q.options || []).map((_, i) => String.fromCharCode(65 + i));
    const idx = Math.max(0, Math.min(letters.length - 1, Number(q.correctIndex ?? 0)));
    const ans = letters[idx] || "-";
    const note = (q.answerText || "").trim();
    return `
      <div class="ansMain"><b>Doğru Şık:</b> <span class="badge">${escapeHtml(ans)}</span></div>
      ${note ? `<div class="ansNote">${toLines(note)}</div>` : ""}
    `;
  }

  if (q.type === "math") {
    const a = normalizeMathInput(q.answerText || "");
    return a ? `<div class="ansMain">$$${escapeHtml(a)}$$</div>` : `<div class="muted2">-</div>`;
  }

  // ✅ kod cevapları blok olarak çıksın (okunaklı)
  if (q.type === "code") {
    const a = (q.answerText || "").trim();
    return a ? `<pre class="codeBox">${escapeHtml(a)}</pre>` : `<div class="muted2">-</div>`;
  }

  const a = (q.answerText || "").trim();
  return a ? `<div class="ansMain">${toLines(a)}</div>` : `<div class="muted2">-</div>`;
}

function buildAnswerKeyPrint() {
  const { school, yearLine, courseLine, title, date, footer } = getHeaderInfo();

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
.infoLine{margin:2mm 0 7mm 0; font-size:11pt; font-weight:700; display:flex; justify-content:space-between}

.akItem{
  border:1px solid #777;
  border-radius:10px;
  padding:10px 12px;
  margin:0 0 8mm 0;
  break-inside:avoid;
  page-break-inside:avoid;
}
.akTop{
  display:flex;
  justify-content:space-between;
  align-items:baseline;
  gap:10mm;
  margin-bottom:4mm;
}
.akNo{font-weight:900;font-size:12.5pt}
.akPts{font-weight:800;font-size:11pt;white-space:nowrap}

.stemTitle{font-size:11.5pt;font-weight:800;line-height:1.35;margin-bottom:2mm}
.opts{margin:1mm 0 0 0}
.optLine{font-size:11pt;line-height:1.35;margin:1mm 0}

.sep{ height:1px; background:#bbb; margin:5mm 0 4mm 0; }

.ansLabel{font-size:11pt;font-weight:900;margin-bottom:2mm}
.ansMain{font-size:11pt;line-height:1.45}
.ansNote{font-size:10.6pt;line-height:1.4;margin-top:2mm;color:#222}
.muted2{color:#666;font-size:10.6pt}

.badge{
  display:inline-block;
  padding:2px 8px;
  border:1px solid #111;
  border-radius:999px;
  font-weight:900;
}

.codeBox{
  border-radius:8px;
  padding:6px 10px;
  margin:2mm 0 0 0;
  font-family:"DejaVu Sans Mono", ui-monospace, Menlo, Monaco, Consolas, monospace;
  font-size:9.6pt; line-height:1.25;
  white-space:pre;
  background:#f7f7f7;border:1px solid #9a9a9a;
}

.katex{font-size:1.05em;}
.mathExpr{margin-top:2mm}

/* ===========================
   ANSWER KEY – OKUNAKLILIK
   =========================== */

.ansMain{
  background:#f8f8f8;
  padding:8px 10px;
  border-radius:8px;
  border:1px solid #bbb;
}

.ansNote{
  margin-top:6px;
  font-size:10.5pt;
  line-height:1.45;
}

/* Kod cevapları taşmasın */
.codeBox{
  white-space:pre-wrap;     /* satır aşağı insin */
  word-break:break-word;
  overflow-wrap:anywhere;
}


`;

  let html = `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js"></script>
<style>${css}</style>
</head><body>`;

  html += `<div class="headerBlock">`;
  if (school) html += `<div class="l1">${escapeHtml(school)}</div>`;
  if (yearLine) html += `<div class="l2">${escapeHtml(yearLine)}</div>`;
  if (courseLine) html += `<div class="l3">${escapeHtml(courseLine)}</div>`;
  if (title) html += `<div class="l4">${escapeHtml(title)}</div>`;
  html += `</div>`;

  html += `<div class="infoLine"><div>Tarih: ${escapeHtml(date)}</div><div>CEVAP ANAHTARI</div></div>`;

  let qNo = 1;
  const tfBlock = state.questions.find(q => q.type === "tf");
  const matchBlock = state.questions.find(q => q.type === "match");

  state.questions.forEach(q => {
    if (q.type === "tf" || q.type === "match") return;

    html += `<div class="akItem">`;
    html += `<div class="akTop">
      <div class="akNo">Soru ${qNo}</div>
      <div class="akPts">(${Number(q.points || 0)} Puan)</div>
    </div>`;

    html += questionStemHtml(q, qNo);

    html += `<div class="sep"></div>`;
    html += `<div class="ansLabel">Cevap</div>`;
    html += answerHtml(q);

    html += `</div>`;
    qNo++;
  });

  if (tfBlock) {
    const items = (tfBlock.tfItems || []).filter(x => (x || "").trim().length > 0);
    if (!Array.isArray(tfBlock.tfAns)) tfBlock.tfAns = (tfBlock.tfItems || []).map(() => "");

    html += `<div class="akItem">`;
    html += `<div class="akTop">
      <div class="akNo">Soru ${qNo}</div>
      <div class="akPts">(${Number(tfBlock.points || 0)} Puan)</div>
    </div>`;

    html += `<div class="stemTitle"><b>${qNo}.</b> Doğru / Yanlış</div>`;
    html += `<div class="sep"></div><div class="ansLabel">Cevap</div>`;

    html += `<div class="ansMain">` + (items.map((t, i) => {
      const a = (tfBlock.tfAns[i] || "-") || "-";
      return `<div>${i + 1}) ${escapeHtml(t)} — <b>${escapeHtml(a)}</b></div>`;
    }).join("") || `<div class="muted2">-</div>`) + `</div>`;

    html += `</div>`;
    qNo++;
  }

  if (matchBlock) {
    const pairs = (matchBlock.pairs || []).filter(p => (p.left || "").trim() || (p.right || "").trim());

    html += `<div class="akItem">`;
    html += `<div class="akTop">
      <div class="akNo">Soru ${qNo}</div>
      <div class="akPts">(${Number(matchBlock.points || 0)} Puan)</div>
    </div>`;

    html += `<div class="stemTitle"><b>${qNo}.</b> Eşleştirme</div>`;
    html += `<div class="sep"></div><div class="ansLabel">Cevap</div>`;

    html += `<div class="ansMain">` + (pairs.map((p, i) => {
      const L = String.fromCharCode(65 + i);
      const a = (p.ans ?? "").toString().trim() || "-";
      return `<div>${L}) ${escapeHtml(p.left)} → <b>${escapeHtml(a)}</b></div>`;
    }).join("") || `<div class="muted2">-</div>`) + `</div>`;

    html += `</div>`;
    qNo++;
  }

  html += injectRenderMathAndPrint();
  html += `</body></html>`;
  return html;
}

/* ===========================
   Print window
   =========================== */
function openPrintWindow(htmlContent) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Tarayıcı pop-up engelledi. İzin ver.");
    return;
  }
  w.document.open();
  w.document.write(htmlContent);
  w.document.close();
}

function makePdf() {
  if (state.questions.length === 0) return alert("Lütfen önce soru ekleyin!");
  openPrintWindow(buildPrint());
}

function makeAnswerKeyPdf() {
  if (state.questions.length === 0) return alert("Lütfen önce soru ekleyin!");
  openPrintWindow(buildAnswerKeyPrint());
}

/* ===========================
   Bind
   =========================== */
function bind() {
  $("#btnAdd2")?.addEventListener("click", () => addQuestion("classic"));
  $("#btnPdf")?.addEventListener("click", makePdf);
  $("#btnKey")?.addEventListener("click", makeAnswerKeyPdf);
  bindDateMask();
  cleanupUi();
}

function seed() {
  if (state.questions.length === 0) addQuestion("classic");
}

bind();
seed();
