/* ==========================
   direito.love — app.js (modo simples)
   Regras: (1) Cada card é um bloco entre -----  (2) Remover ( ... ) em todo lugar
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

  /* leitor */
  readerModal: $("#readerModal"),
  readerBody: $("#readerBody"),
  readerTitle: $("#readerTitle"),
  selCount: $("#selCount"),

  /* selecionados */
  selectedModal: $("#selectedModal"),
  selectedStack: $("#selectedStack"),

  /* estudar */
  studyModal: $("#studyModal"),
  studyList: $("#studyList"),
  studyUpdate: $("#studyUpdate"),
  copyPromptBtn: $("#copyPromptBtn"),

  /* criar questões */
  questionsModal: $("#questionsModal"),
  questionsList: $("#questionsList"),
  questionsUpdate: $("#questionsUpdate"),
  copyQuestionsBtn: $("#copyQuestionsBtn"),
  includeObsBtn: $("#includeObsBtn"),
  questionsObs: $("#questionsObs"),

  /* toasts */
  toasts: $("#toasts"),
};

/* ---------- estado ---------- */
const MAX_SEL = 6;
const CARD_CHAR_LIMIT = 250;
const PREV_MAX = 60;

const state = {
  selected: new Map(),     // id -> item
  cacheTxt: new Map(),     // url -> string
  cacheParsed: new Map(),  // url -> items[]
  urlToLabel: new Map(),
  promptTpl: null,         // estudo
  promptQTpl: null,        // questões
  pendingObs: "",          // obs do usuário (questões)
  studyIncluded: new Set(),
  questionsIncluded: new Set(),
};

/* ---------- util ---------- */
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  els.toasts.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}
function updateBottom() {
  const n = state.selected.size;
  els.viewBtn.textContent = `${n} Selecionados – Ver`;
  els.studyBtn.disabled = n === 0;
  els.questionsBtn.disabled = n === 0;
  els.selCount.textContent = `${n}/${MAX_SEL}`;
}
function norm(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/g, "c")
    .toLowerCase();
}
function escHTML(s) {
  return (s || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}
/* Regra 2: remover textos entre parênteses em TODO lugar */
function stripParensAll(s) {
  return (s || "").replace(/\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
}

/* ---------- catálogo (oculto no HTML) ---------- */
(() => {
  els.codeSelect?.querySelectorAll("option").forEach((opt) => {
    const url = opt.value?.trim();
    const label = opt.textContent?.trim();
    if (url) state.urlToLabel.set(label, url);
  });
})();

/* ---------- fetch/parse de arquivos ---------- */
function sanitize(s) {
  return String(s)
    .replace(/\uFEFF/g, "")      // BOM
    .replace(/\u00A0/g, " ")     // nbsp
    .replace(/\r\n?/g, "\n")     // EOL
    .replace(/[ \t]+\n/g, "\n"); // ws final
}
async function fetchText(url) {
  if (state.cacheTxt.has(url)) return state.cacheTxt.get(url);
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(url);
  const t = sanitize(await r.text());
  state.cacheTxt.set(url, t);
  return t;
}

/* Regra 1: cada bloco entre ----- vira um card */
function splitBlocks(txt) {
  return sanitize(txt)
    .split(/^\s*-{5,}\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* Parser minimalista: título = 1ª linha não vazia; corpo = resto.
   Sem dedupe, sem respiro; apenas stripParensAll global. */
function parseBlock(block, idx, fileUrl, sourceLabel) {
  const lines = block.split("\n").map((s) => s.trim());
  const first = lines.find((l) => l.length > 0) || `Bloco ${idx + 1}`;
  const rest = lines.slice(lines.indexOf(first) + 1).join("\n");
  const fullText = [first, rest].filter(Boolean).join("\n");
  const cleaned = stripParensAll(fullText);

  return {
    id: `${fileUrl}::art-${idx}`,
    htmlId: `art-${idx}`,
    source: sourceLabel,
    title: stripParensAll(first),
    body: stripParensAll(rest),
    text: cleaned, // título + corpo, já sem parênteses
    fileUrl,
  };
}

async function parseFile(url, sourceLabel) {
  if (state.cacheParsed.has(url)) return state.cacheParsed.get(url);
  const txt = await fetchText(url);
  const blocks = splitBlocks(txt);
  const items = blocks.map((b, i) => parseBlock(b, i, url, sourceLabel));
  state.cacheParsed.set(url, items);
  return items;
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
  state.promptTpl = "Você é uma I.A. jurídica. Estruture um estudo claro e didático com base nos artigos abaixo.\n";
  return state.promptTpl;
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
els.q?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } });

async function doSearch() {
  const term = (els.q.value || "").trim();
  if (!term) return;

  els.stack.innerHTML = "";
  els.stack.setAttribute("aria-busy", "true");
  const skel = document.createElement("section");
  skel.className = "block";
  const t = document.createElement("div");
  t.className = "block-title";
  t.textContent = `Busca: ‘${term}’ (…)`;
  skel.appendChild(t);
  for (let i = 0; i < 2; i++) {
    const s = document.createElement("div"); s.className = "skel block"; skel.appendChild(s);
  }
  els.stack.append(skel);
  els.spinner.classList.add("show");

  try {
    const tokens = term.split(/\s+/).filter(Boolean).map(norm);

    const results = [];
    const allOptions = Array.from(els.codeSelect?.querySelectorAll("option") || [])
      .map((o) => ({ url: o.value?.trim(), label: o.textContent?.trim() }))
      .filter((o) => o.url);

    for (const { url, label } of allOptions) {
      try {
        const items = await parseFile(url, label);
        items.forEach((it) => {
          const bag = norm(it.text);
          const ok = tokens.every((t) => bag.includes(t));
          if (ok) results.push(it);
        });
      } catch { /* ignora arquivo com erro */ }
    }

    skel.remove();
    renderBlock(term, results, tokens);
    toast(`${results.length} resultado(s) encontrados.`);
  } finally {
    els.stack.setAttribute("aria-busy", "false");
    els.spinner.classList.remove("show");
    els.q.select();
  }
}

function renderBlock(term, items, tokens) {
  const block = document.createElement("section");
  block.className = "block";
  const title = document.createElement("div");
  title.className = "block-title";
  title.textContent = `Busca: ‘${term}’ (${items.length} resultados)`;
  block.appendChild(title);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "block-empty";
    empty.textContent = `Nada por aqui com ‘${term}’. Tente outra palavra.`;
    block.appendChild(empty);
  } else {
    items.forEach((it) => block.appendChild(renderCard(it, tokens)));
  }
  els.stack.append(block);
}

/* ---------- renderização de cards ---------- */
function highlight(text, tokens) {
  let safe = escHTML(text || "");
  tokens.forEach((t) => {
    if (!t) return;
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    safe = safe.replace(re, "<mark>$1</mark>");
  });
  return safe;
}
function truncatedHTML(fullText, tokens) {
  // Regra 2 já aplicada no parse: ainda assim, garantimos aqui
  const base = stripParensAll(fullText || "");
  const truncated = base.length > CARD_CHAR_LIMIT ? base.slice(0, CARD_CHAR_LIMIT).trim() + "…" : base;
  return highlight(escHTML(truncated), tokens);
}
function renderCard(item, tokens = [], ctx = { context: "results" }) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = item.id;

  const left = document.createElement("div");

  const pill = document.createElement("a");
  pill.href = "#";
  pill.className = "pill";
  pill.textContent = item.source;
  pill.addEventListener("click", (e) => { e.preventDefault(); openReader(item); });

  const body = document.createElement("div");
  body.className = "body is-collapsed";
  body.innerHTML = truncatedHTML(item.text, tokens);
  body.style.cursor = "pointer";
  body.addEventListener("click", () => openReader(item));

  const actions = document.createElement("div");
  actions.className = "actions";
  const toggle = document.createElement("button");
  toggle.className = "toggle";
  toggle.textContent = "ver texto";
  toggle.addEventListener("click", () => {
    const collapsed = body.classList.toggle("is-collapsed");
    if (collapsed) {
      body.innerHTML = truncatedHTML(item.text, tokens);
      toggle.textContent = "ver texto";
    } else {
      // Texto completo (já sem parênteses), exatamente como no bloco
      body.textContent = stripParensAll(item.text);
      toggle.textContent = "ocultar";
    }
  });

  left.append(pill, body, actions);
  actions.append(toggle);

  const chk = document.createElement("button");
  chk.className = "chk";
  chk.setAttribute("aria-label", "Selecionar bloco");
  chk.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const sync = () => { chk.dataset.checked = state.selected.has(item.id) ? "true" : "false"; };
  sync();
  chk.addEventListener("click", () => {
    if (state.selected.has(item.id)) {
      state.selected.delete(item.id);
      toast(`Removido (${state.selected.size}/${MAX_SEL}).`);
      if (ctx.context === "selected") card.remove();
    } else {
      if (state.selected.size >= MAX_SEL) { toast("⚠️ Limite de 6 artigos."); return; }
      state.selected.set(item.id, { ...item });
      toast(`Adicionado (${state.selected.size}/${MAX_SEL}).`);
    }
    sync();
    updateBottom();
  });

  card.append(left, chk);
  return card;
}

/* ---------- Leitor (modal) ---------- */
async function openReader(item) {
  els.readerTitle.textContent = item.source;
  els.selCount.textContent = `${state.selected.size}/${MAX_SEL}`;
  els.readerBody.innerHTML = "";
  showModal(els.readerModal);

  // skeleton
  for (let i = 0; i < 3; i++) {
    const s = document.createElement("div");
    s.className = "skel block";
    s.style.margin = "10px 0";
    els.readerBody.appendChild(s);
  }

  try {
    const items = await parseFile(item.fileUrl, item.source);
    els.readerBody.innerHTML = "";
    items.forEach((a) => {
      const row = document.createElement("div");
      row.className = "article";
      row.id = a.htmlId;

      const chk = document.createElement("button");
      chk.className = "chk a-chk";
      chk.setAttribute("aria-label", "Selecionar bloco");
      chk.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const sync = () => { chk.dataset.checked = state.selected.has(a.id) ? "true" : "false"; };
      sync();
      chk.addEventListener("click", () => {
        if (state.selected.has(a.id)) {
          state.selected.delete(a.id);
          toast(`Removido (${state.selected.size}/${MAX_SEL}).`);
        } else {
          if (state.selected.size >= MAX_SEL) { toast("⚠️ Limite de 6 artigos."); return; }
          state.selected.set(a.id, a);
          toast(`Adicionado (${state.selected.size}/${MAX_SEL}).`);
        }
        els.selCount.textContent = `${state.selected.size}/${MAX_SEL}`;
        sync();
        updateBottom();
      });

      const body = document.createElement("div");
      const h4 = document.createElement("h4");
      h4.textContent = `${a.title} — ${a.source}`;
      const txt = document.createElement("div");
      txt.className = "a-body";
      txt.textContent = stripParensAll(a.text); // leitor também SEM parênteses
      body.append(h4, txt);

      row.append(chk, body);
      els.readerBody.appendChild(row);
    });

    const anchor = els.readerBody.querySelector(`#${CSS.escape(item.htmlId)}`);
    if (anchor) {
      anchor.scrollIntoView({ block: "center", behavior: "instant" });
      anchor.classList.add("highlight");
      setTimeout(() => anchor.classList.remove("highlight"), 1800);
    }
    els.readerBody.focus();
  } catch {
    toast("Erro ao abrir o código. Tente novamente.");
    hideModal(els.readerModal);
  }
}

/* ---------- MODAIS: helpers ---------- */
function showModal(el) { if (el) { el.hidden = false; document.body.style.overflow = "hidden"; } }
function hideModal(el) { if (el) { el.hidden = true; document.body.style.overflow = ""; } }

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
    for (const it of state.selected.values()) {
      const card = renderCard(it, [], { context: "selected" });
      els.selectedStack.appendChild(card);
    }
  }
  showModal(els.selectedModal);
});

/* ---------- Estudar ---------- */
els.studyBtn?.addEventListener("click", async () => {
  if (!state.selected.size) return;
  state.studyIncluded = new Set([...state.selected.keys()]);
  buildMiniList(els.studyList, state.studyIncluded);
  showModal(els.studyModal);
  const prompt = await buildStudyPrompt(state.studyIncluded);
  copyToClipboard(prompt);
});
els.studyUpdate?.addEventListener("click", async () => {
  const prompt = await buildStudyPrompt(state.studyIncluded);
  copyToClipboard(prompt);
  toast("Lista atualizada e prompt copiado.");
});
els.copyPromptBtn?.addEventListener("click", async () => {
  const prompt = await buildStudyPrompt(state.studyIncluded);
  copyToClipboard(prompt);
});
async function buildStudyPrompt(includedSet) {
  const tpl = await loadPromptTemplate();
  const parts = [tpl.trim(), ""];
  let i = 1;
  for (const id of includedSet) {
    const it = state.selected.get(id);
    if (!it) continue;
    parts.push(`### ${i}. ${it.title} — [${it.source}]`);
    parts.push(stripParensAll(it.text), ""); // sem parênteses
    if (i++ >= MAX_SEL) break;
  }
  return parts.join("\n");
}

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
  if (opts.includes("casos2"))         prefLines.push("- Inclua 2 Casos Concretos.");
  if (opts.includes("dissertativas2")) prefLines.push("- Inclua 2 Dissertativas.");
  if (opts.includes("vf2"))            prefLines.push("- Inclua 2 V ou F.");
  if (opts.includes("pegadinhas"))     prefLines.push("- Misture os entendimentos para criar pegadinhas.");
  const prefs = prefLines.join("\n");

  const parts = [tpl.trim(), ""];
  if (prefs) parts.push("Preferências:", prefs, "");
  if (state.pendingObs) parts.push("Observação do usuário:", state.pendingObs, "");

  let i = 1;
  parts.push("Blocos-base:");
  for (const id of includedSet) {
    const it = state.selected.get(id);
    if (!it) continue;
    parts.push(`### ${i}. ${it.title} — [${it.source}]`);
    parts.push(stripParensAll(it.text), "");
    if (i++ >= MAX_SEL) break;
  }
  return parts.join("\n");
}

/* ---------- mini-lists (modais) ---------- */
function buildMiniList(container, includedSet) {
  container.innerHTML = "";
  const items = [...state.selected.values()];
  items.forEach((it) => {
    const li = document.createElement("li");
    li.className = "mini-item";

    const chk = document.createElement("button");
    chk.className = "chk";
    chk.setAttribute("aria-label", "Incluir/excluir do prompt");
    chk.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const sync = () => { chk.dataset.checked = includedSet.has(it.id) ? "true" : "false"; };
    sync();
    chk.addEventListener("click", () => {
      if (includedSet.has(it.id)) includedSet.delete(it.id);
      else includedSet.add(it.id);
      sync();
    });

    const title = document.createElement("div");
    title.className = "mini-title";
    const preview = (it.title.slice(0, PREV_MAX) + (it.title.length > PREV_MAX ? "…" : ""));
    title.textContent = `${preview} — ${it.source}`;

    li.append(chk, title);
    container.appendChild(li);
  });
}

/* ---------- copiar com toast ---------- */
function copyToClipboard(txt) {
  navigator.clipboard?.writeText(txt).then(
    () => toast("✅ Prompt copiado. Cole na sua I.A. preferida."),
    () => toast("Copie manualmente na sua I.A.")
  );
}

/* ---------- logo: reset ---------- */
els.brand?.addEventListener("click", () => {
  els.q.value = "";
  els.stack.innerHTML = "";
  els.q.focus();
  toast("Busca reiniciada.");
});

/* ---------- init ---------- */
updateBottom();
