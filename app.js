/* ==========================
   direito.love — app.js (2025-09 • estável + patches)
   Regras:
   1) Cada card = bloco entre linhas "-----"
   2) Texto preservado como no .txt (parênteses incluídos)
   3) "Respiros" (linhas em branco) apenas na visualização do leitor
   ========================== */

/* Service Worker (opcional) */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);

const els = {
  /* topo/busca */
  form: $("#searchForm"),
  q: $("#searchInput"),
  spinner: $("#searchSpinner"),
  stack: $("#resultsStack"),
  brand: $("#brandBtn"),
  codeSelect: $("#codeSelect"),

  /* barra inferior */
  studyBtn: $("#studyBtn"),
  questionsBtn: $("#questionsBtn"),
  viewBtn: $("#viewBtn"),
  selBadge: $("#selBadge"),
  clearSelBtn: $("#clearSelBtn"),

  /* leitor */
  readerModal: $("#readerModal"),
  readerBody: $("#readerBody"),
  readerTitle: $("#readerTitle"),
  selCount: $("#selCount"),

  /* selecionados */
  selectedModal: $("#selectedModal"),
  selectedStack: $("#selectedStack"),

  /* selecionados ações */
  clearAllBtn: $("#clearAllBtn"),

  /* estudar */
  studyModal: $("#studyModal"),
  studyList: $("#studyList"),
  modeDeep: $("#modeDeep"),
  modeQuick: $("#modeQuick"),
  modeQuestions: $("#modeQuestions"),

  /* criar questões */
  questionsModal: $("#questionsModal"),
  questionsList: $("#questionsList"),
  questionsUpdate: $("#questionsUpdate"),
  copyQuestionsBtn: $("#copyQuestionsBtn"),
  includeObsBtn: $("#includeObsBtn"),
  questionsObs: $("#questionsObs"),

  /* estudar ações */
  studyUpdate: $("#studyUpdate"),
  copyPromptBtn: $("#copyPromptBtn"),

  /* toasts */
  toasts: $("#toasts"),
};

/* ---------- estado ---------- */
const MAX_SEL = 6;
const state = {
  fileUrl: "",
  source: "",
  tokens: [],
  selected: new Map(),        // id -> item selecionado
  studyIncluded: new Set(),
  questionsIncluded: new Set(),
};

/* ---------- util ---------- */
let lastSelectionSnapshot = null;
function clearSelection(withConfirm=true){
  const n = state.selected.size;
  if (!n) return;
  if (withConfirm && !confirm(`Limpar ${n} item(ns) selecionado(s)?`)) return;
  lastSelectionSnapshot = new Set(state.selected);
  state.selected.clear();
  updateBottom();
  toast("Seleção limpa.");
  if (els.selectedStack) els.selectedStack.innerHTML = "";
}
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  els.toasts.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}
function updateBottom() {
  const n = state.selected.size;
  if (els.selBadge) els.selBadge.textContent = String(n);
  if (els.viewBtn) els.viewBtn.disabled = false;
  if (els.studyBtn) els.studyBtn.disabled = n === 0;
  if (els.clearSelBtn) els.clearSelBtn.style.display = n ? "" : "none";
}

/* ---------- modal helpers ---------- */
function showModal(modalEl) { modalEl.hidden = false; }
function hideModal(modalEl) { modalEl.hidden = true; }

/* ---------- parsing ---------- */
const RX_ART = /^(Art\.?|art\.?)\s*\d+[A-Za-z\-]*/;
const RX_SUM = /^(S[úu]mula)\s+\d+/i;
const RX_TITULO = /^(T[íi]tulo|Cap[íi]tulo|Se[cç][aã]o|Subse[cç][aã]o)/i;
const RX_PARAGR = /^§\s*\d+º/;
const RX_INCISO = /^[IVXLCDM]+\s*[-–.]/;
const RX_ALINEA = /^[a-z]\)/;

async function fetchText(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error("Falha ao carregar arquivo.");
  return await r.text();
}

function normalizeText(txt) {
  const lines = txt.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  for (const raw of lines) {
    const ln = raw.trimEnd();
    const isMarker =
      RX_ART.test(ln) ||
      RX_SUM.test(ln) ||
      RX_PARAGR.test(ln) ||
      RX_INCISO.test(ln) ||
      RX_ALINEA.test(ln) ||
      RX_TITULO.test(ln);

    if (isMarker && out.length && out[out.length - 1] !== "") out.push("");
    if (ln === "" && out.length && out[out.length - 1] === "") continue;

    out.push(ln);
  }
  return out.join("\n");
}

/* ---------- templates de prompt ---------- */
async function loadPromptTemplate() {
  if (state.promptTpl) return state.promptTpl;
  const CANDIDATES = [
    "data/prompts/prompt_estudar.txt",
    "data/prompt/prompt_estudar.txt",
  ];
  for (const p of CANDIDATES) {
    try {
      const r = await fetch(p, { cache: "no-cache" });
      if (r.ok) { state.promptTpl = (await r.text()).trim(); return state.promptTpl; }
    } catch {}
  }
  state.promptTpl = "Você é uma I.A. jurídica. Estruture um estudo claro e didático com base nos blocos abaixo.\n";
  return state.promptTpl;
}
async function loadQuickTemplate() {
  if (state.promptQuickTpl) return state.promptQuickTpl;
  const CANDIDATES = [
    "data/prompts/prompt_estudar_2min.txt",
    "data/prompt/prompt_estudar_2min.txt",
  ];
  for (const p of CANDIDATES) {
    try {
      const r = await fetch(p, { cache: "no-cache" });
      if (r.ok) { state.promptQuickTpl = (await r.text()).trim(); return state.promptQuickTpl; }
    } catch {}
  }
  state.promptQuickTpl = "Você é uma I.A. jurídica. Faça um resumo executivo (6–8 bullets), direto ao ponto, com foco de revisão rápida, usando os blocos abaixo.\n";
  return state.promptQuickTpl;
}
async function loadQuestionsTemplate() {
  if (state.promptQTpl) return state.promptQTpl;
  const PATH = "data/prompts/prompt_questoes.txt";
  try {
    const r = await fetch(PATH, { cache: "no-cache" });
    if (!r.ok) throw new Error();
    state.promptQTpl = (await r.text()).trim();
  } catch {
    state.promptQTpl = "";
    toast("Não encontrei data/prompts/prompt_questoes.txt");
  }
  return state.promptQTpl;
}

/* ---------- busca ---------- */
els.form?.addEventListener("submit", (e) => { e.preventDefault(); doSearch(); });
els.q?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); }});
els.codeSelect?.addEventListener("change", () => doSearch());

async function doSearch() {
  const q = (els.q?.value || "").trim();
  const fileUrl = els.codeSelect?.value || "data/codigo_penal.txt";
  const source = els.codeSelect?.selectedOptions?.[0]?.textContent || "Código Penal";

  els.spinner?.removeAttribute("hidden");
  try {
    const raw = await fetchText(fileUrl);
    const txt = normalizeText(raw);
    state.fileUrl = fileUrl;
    state.source = source;
    renderResults(txt, q);
  } catch (e) {
    toast("Erro ao carregar o arquivo.");
  } finally {
    els.spinner?.setAttribute("hidden", "");
  }
}

function tokenize(q) {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

function renderResults(txt, q) {
  const tokens = tokenize(q);
  state.tokens = tokens;

  const blocks = txt.split(/^-----\s*$/m).map((b) => b.trim()).filter(Boolean);

  els.stack.innerHTML = "";
  let count = 0;

  for (const block of blocks) {
    const item = parseBlock(block, state.source);
    if (!item) continue;

    // filtro por tokens
    if (tokens.length) {
      const hay = (item.title + " " + item.text).toLowerCase();
      const ok = tokens.every((t) => hay.includes(t));
      if (!ok) continue;
    }

    const card = renderCard(item, tokens, { context: "results" });
    els.stack.appendChild(card);
    count++;
  }

  if (count === 0) {
    const empty = document.createElement("div");
    empty.className = "block-empty";
    empty.textContent = "Nenhum resultado para sua busca.";
    els.stack.appendChild(empty);
  }
}

function parseBlock(block, source) {
  const lines = block.split("\n").filter(Boolean);
  if (!lines.length) return null;

  const title = lines[0].trim();
  const text = lines.slice(1).join("\n").trim();

  const id = crypto.randomUUID();
  const htmlId = "blk_" + id.slice(0, 8);

  return { id, htmlId, title, text, source, fileUrl: state.fileUrl };
}

function renderCard(item, tokens, { context }) {
  const el = document.createElement("article");
  el.className = "card";

  const h = document.createElement("h3");
  h.className = "title";
  h.textContent = item.title;
  el.appendChild(h);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = item.source;
  el.appendChild(meta);

  const pre = document.createElement("pre");
  pre.textContent = highlightTokens(item.text, tokens);
  el.appendChild(pre);

  const acts = document.createElement("div");
  acts.className = "actions";

  const open = document.createElement("button");
  open.className = "act";
  open.textContent = "Abrir no leitor";
  open.addEventListener("click", () => openReader(item, tokens));
  acts.appendChild(open);

  const sel = document.createElement("label");
  sel.className = "check";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.addEventListener("change", () => {
    if (cb.checked) {
      if (state.selected.size >= MAX_SEL) { cb.checked = false; toast("Máximo de 6 selecionados."); return; }
      state.selected.set(item.id, item);
    } else {
      state.selected.delete(item.id);
    }
    updateBottom();
  });
  sel.appendChild(cb);
  acts.appendChild(sel);

  el.appendChild(acts);

  // guarda referência p/ rolar no leitor
  item.htmlId = item.htmlId;

  return el;
}

function highlightTokens(txt, tokens) {
  if (!tokens?.length) return txt;
  let out = txt;
  tokens.forEach((t) => {
    out = out.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (m) => `[${m}]`);
  });
  return out;
}

async function openReader(item, tokens) {
  els.readerBody.innerHTML = "";

  const s = document.createElement("div");
  s.className = "block-empty";
  s.textContent = "Carregando…";
  s.style.margin = "10px 0";
  els.readerBody.appendChild(s);

  try {
    const items = await parseFile(item.fileUrl, item.source);
    els.readerBody.innerHTML = "";

    items.forEach((a) => {
      const card = renderCard(a, tokens, { context: "reader" });
      card.id = a.htmlId;
      els.readerBody.appendChild(card);
    });

    const anchor = els.readerBody.querySelector(`#${CSS.escape(item.htmlId)}`);
    if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });

    els.selCount.textContent = `${state.selected.size}/${MAX_SEL}`;
    showModal(els.readerModal);
  } catch (e) {
    toast("Falha ao abrir o leitor.");
  }
}

async function parseFile(fileUrl, source) {
  const raw = await fetchText(fileUrl);
  const txt = normalizeText(raw);

  const blocks = txt.split(/^-----\s*$/m).map((b) => b.trim()).filter(Boolean);
  const items = blocks.map((block) => {
    const b = parseBlock(block, source);
    const numMatch = (b.title.match(/(\d{1,4})/) || [])[1];
    const artNum = numMatch ? numMatch : "";
    b.anchor = buildPlanaltoAnchor(source, artNum);
    b.htmlId = "blk_" + crypto.randomUUID().slice(0, 8);
    return b;
  });
  return items;
}

function buildPlanaltoAnchor(source, artNum) {
  const bases = {
    "Código Penal": "https://www.planalto.gov.br/ccivil_03/decreto-lei/Del2848compilado.htm",
    "Código Civil": "https://www.planalto.gov.br/ccivil_03/leis/2002/L10406compilada.htm",
    "Processo Civil": "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/L13105compilada.htm",
    "CF88": "https://www.planalto.gov.br/ccivil_03/constituicao/ConstituicaoCompilado.htm",
    "CLT": "https://www.planalto.gov.br/ccivil_03/decreto-lei/Del5452compilado.htm",
    "CDC": "https://www.planalto.gov.br/ccivil_03/leis/L8078compilado.htm",
    "Código de Trânsito Brasileiro": "https://www.planalto.gov.br/ccivil_03/leis/L9503Compilado.htm",
    "ECA": "https://www.planalto.gov.br/ccivil_03/leis/L8069compilado.htm",
  };
  const baseUrl = bases[source] || "https://www.planalto.gov.br/ccivil_03/";
  return artNum ? `${baseUrl}#art${artNum}` : baseUrl;
}

/* ---------- fechar modais ---------- */
document.addEventListener("click", (e) => {
  if (e.target.matches("[data-close-modal]")) hideModal(els.readerModal);
  if (e.target.matches("[data-close-study]")) hideModal(els.studyModal);
  if (e.target.matches("[data-close-questions]")) hideModal(els.questionsModal);
  if (e.target.matches("[data-close-sel]")) hideModal(els.selectedModal);

  if (els.readerModal && e.target === els.readerModal.querySelector(".modal-backdrop")) hideModal(els.readerModal);
  if (els.studyModal && e.target === els.studyModal.querySelector(".modal-backdrop")) hideModal(els.studyModal);
  if (els.questionsModal && e.target === els.questionsModal.querySelector(".modal-backdrop")) hideModal(els.questionsModal);
  if (els.selectedModal && e.target === els.selectedModal.querySelector(".modal-backdrop")) hideModal(els.selectedModal);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (els.readerModal && !els.readerModal.hidden) hideModal(els.readerModal);
    if (els.studyModal && !els.studyModal.hidden) hideModal(els.studyModal);
    if (els.questionsModal && !els.questionsModal.hidden) hideModal(els.questionsModal);
    if (els.selectedModal && !els.selectedModal.hidden) hideModal(els.selectedModal);
  }
});

/* ---------- VER SELECIONADOS ---------- */
els.viewBtn?.addEventListener("click", () => {
  els.selectedStack.innerHTML = "";
  if (!state.selected.size) {
    const empty = document.createElement("div");
    empty.className = "block-empty";
    empty.textContent = "Nenhum bloco selecionado.";
    els.selectedStack.appendChild(empty);
  } else {
    for (const [id, it] of state.selected) {
      const row = document.createElement("div");
      row.className = "card";
      const t = document.createElement("div");
      t.className = "title";
      t.textContent = it.title;
      row.appendChild(t);

      const m = document.createElement("div");
      m.className = "meta";
      m.textContent = it.source;
      row.appendChild(m);

      const un = document.createElement("button");
      un.className = "act";
      un.textContent = "Remover";
      un.addEventListener("click", () => {
        state.selected.delete(id);
        row.remove();
        updateBottom();
      });
      row.appendChild(un);

      els.selectedStack.appendChild(row);
    }
  }
  showModal(els.selectedModal);
});

/* ---------- limpar seleção rápida ---------- */
els.clearSelBtn?.addEventListener("click", () => clearSelection(true));
els.clearAllBtn?.addEventListener("click", () => clearSelection(true));

/* ---------- modos de estudo (chips) ---------- */
state.studyMode = "deep"; // deep | quick
function setStudyMode(m){
  state.studyMode = m;
  // visual active
  [els.modeDeep, els.modeQuick, els.modeQuestions].forEach((b)=>b&&b.classList.remove("active"));
  if (m==="deep") els.modeDeep?.classList.add("active");
  if (m==="quick") els.modeQuick?.classList.add("active");
}
els.modeDeep?.addEventListener("click", ()=> setStudyMode("deep"));
els.modeQuick?.addEventListener("click", ()=> setStudyMode("quick"));
els.modeQuestions?.addEventListener("click", async ()=>{
  hideModal(els.studyModal);
  if (!state.selected.size) return;
  state.questionsIncluded = new Set([...state.selected.keys()]);
  buildMiniList(els.questionsList, state.questionsIncluded);
  showModal(els.questionsModal);
  const prompt = await buildQuestionsPrompt(state.questionsIncluded);
  copyToClipboard(prompt);
});

/* ---------- Estudar ---------- */
els.studyBtn?.addEventListener("click", async () => {
  if (!state.selected.size) return;
  state.studyIncluded = new Set([...state.selected.keys()]);
  buildMiniList(els.studyList, state.studyIncluded);
  showModal(els.studyModal);
  setStudyMode("deep");
  const prompt = await buildStudyPrompt(state.studyIncluded, false);
  copyToClipboard(prompt);
});
els.studyUpdate?.addEventListener("click", async () => {
  const prompt = await buildStudyPrompt(state.studyIncluded, state.studyMode==="quick");
  copyToClipboard(prompt);
  toast("Lista atualizada e prompt copiado.");
});
els.copyPromptBtn?.addEventListener("click", async () => {
  const prompt = await buildStudyPrompt(state.studyIncluded, state.studyMode==="quick");
  copyToClipboard(prompt);
});

/* ---------- Criar Questões ---------- */
els.questionsBtn?.addEventListener("click", async () => {
  if (!state.selected.size) return;
  state.questionsIncluded = new Set([...state.selected.keys()]);
  buildMiniList(els.questionsList, state.questionsIncluded);
  showModal(els.questionsModal);
  const prompt = await buildQuestionsPrompt(state.questionsIncluded);
  copyToClipboard(prompt);
});
els.questionsUpdate?.addEventListener("click", async () => {
  const prompt = await buildQuestionsPrompt(state.questionsIncluded);
  copyToClipboard(prompt);
  toast("Lista atualizada e prompt copiado.");
});
els.copyQuestionsBtn?.addEventListener("click", async () => {
  const prompt = await buildQuestionsPrompt(state.questionsIncluded);
  copyToClipboard(prompt);
});
els.includeObsBtn?.addEventListener("click", () => {
  state.pendingObs = (els.questionsObs.value || "").trim();
  toast("Observação incluída.");
});

async function buildQuestionsPrompt(includedSet) {
  const tpl = await loadQuestionsTemplate();

  const opts = Array.from(document.querySelectorAll(".qopt"))
    .filter((i) => i.checked)
    .map((i) => i.value);

  const prefLines = [];
  if (opts.includes("casos2"))                  prefLines.push("- Inclua 2 Casos Concretos.");
  if (opts.includes("vf1"))                     prefLines.push("- Inclua 1 questão de Verdadeiro/Falso.");
  if (opts.includes("bloom"))                   prefLines.push("- Varie níveis cognitivos (Taxonomia de Bloom).");
  if (opts.includes("tempo"))                   prefLines.push("- Informe um tempo-alvo de resolução por questão.");

  const obs = (state.pendingObs || "").trim();
  const obsLine = obs ? `\nObservação do usuário:\n${obs}\n` : "";

  const parts = [tpl.trim(), "", prefLines.join("\n"), obsLine, "Itens selecionados:\n"];
  let i = 1;
  for (const id of includedSet) {
    const it = state.selected.get(id);
    if (!it) continue;
    parts.push(`### ${i}. ${it.title} — [${it.source}]`);
    parts.push(it.text, "");
    if (i++ >= MAX_SEL) break;
  }
  return parts.join("\n");
}

/* ---------- mini-list ---------- */
function buildMiniList(ul, includedSet) {
  ul.innerHTML = "";
  if (!includedSet.size) {
    const empty = document.createElement("li");
    empty.className = "block-empty";
    empty.textContent = "Nada selecionado ainda.";
    ul.appendChild(empty);
    return;
  }
  for (const [id, it] of state.selected) {
    const li = document.createElement("li");
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = includedSet.has(id);
    chk.addEventListener("change", () => {
      if (chk.checked) includedSet.add(id); else includedSet.delete(id);
    });
    const lb = document.createElement("label");
    lb.textContent = it.title;
    li.appendChild(chk);
    li.appendChild(lb);
    ul.appendChild(li);
  }
}

/* ---------- prompts de estudo ---------- */
async function buildStudyPrompt(includedSet, quick=false) {
  const tpl = quick ? await loadQuickTemplate() : await loadPromptTemplate();
  const parts = [tpl.trim(), ""];
  let i = 1;
  for (const id of includedSet) {
    const it = state.selected.get(id);
    if (!it) continue;
    parts.push(`### ${i}. ${it.title} — [${it.source}]`);
    parts.push(it.text, "");
    if (i++ >= MAX_SEL) break;
  }
  return parts.join("\n");
}

/* ---------- copiar ---------- */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("✅ Prompt copiado. Cole na sua I.A.");
  } catch {
    toast("Copie manualmente na sua I.A.");
  }
}

/* ---------- logo: reset ---------- */
els.brand?.addEventListener("click", () => {
  els.q && (els.q.value = "");
  els.stack && (els.stack.innerHTML = "");
  els.q?.focus();
  toast("Busca reiniciada.");
});

/* ---------- init ---------- */
updateBottom();
