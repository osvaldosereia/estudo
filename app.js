/* ==========================
   direito.love — app.js (2025-09, modo ----- + cards)
   Regras:
   1) Delimitador: "-----" separa blocos
   2) Card = bloco que contém linha iniciando com "Art.", "Súmula" ou "Preâmbulo"
      - Se houver cabeçalho (LIVRO/TÍTULO/CAPÍTULO/SEÇÃO) antes, corta e começa no "Art."
   3) Cabeçalhos puros NÃO viram card
   4) Busca: palavras 3+ letras e dígitos de 1 algarismo (isolados); AND estrito; grifa tudo
   5) Modal: só mostra os cards (sem cabeçalhos e sem "-----")
   6) Números com milhares: "Art. 1.000." tratado como um único artigo; id "art-1000"
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
  selected: new Map(),     // id -> card
  cacheTxt: new Map(),     // url -> string
  cacheParsed: new Map(),  // url -> cards[]
  urlToLabel: new Map(),
  promptTpl: null,         // estudo
  promptQTpl: null,        // questões
  pendingObs: "",          // obs do usuário (questões)
  studyIncluded: new Set(),
  questionsIncluded: new Set(),
  searchTokens: [],
};

/* ---------- UI utils ---------- */
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  els.toasts.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}
function updateBottom() {
  const n = state.selected.size;
  els.viewBtn && (els.viewBtn.textContent = `${n} Selecionados – Ver`);
  els.studyBtn && (els.studyBtn.disabled = n === 0);
  els.questionsBtn && (els.questionsBtn.disabled = n === 0);
  els.selCount && (els.selCount.textContent = `${n}/${MAX_SEL}`);
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
function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/* ---------- select: normalização de URLs ---------- */
function toRawGitHub(url){
  if(!url) return url;
  const m = url.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^]+)$/);
  if(m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
  return url;
}
(() => {
  els.codeSelect?.querySelectorAll("option").forEach((opt) => {
    let url = (opt.value || "").trim();
    const label = (opt.textContent || "").trim();
    if (!url) return;
    url = encodeURI(toRawGitHub(url));
    opt.value = url; // corrige no DOM
    state.urlToLabel.set(label, url);
  });
})();

/* ---------- fetch & sanitize ---------- */
function sanitize(s) {
  return String(s)
    .replace(/\uFEFF/g, "")      // BOM
    .replace(/\u00A0/g, " ")     // NBSP
    .replace(/\r\n?/g, "\n")     // EOL
    .replace(/[ \t]+\n/g, "\n"); // trailing ws
}
async function fetchText(url) {
  url = encodeURI(url);
  if (state.cacheTxt.has(url)) return state.cacheTxt.get(url);
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`fetch-fail ${r.status} ${url}`);
  const t = sanitize(await r.text());
  state.cacheTxt.set(url, t);
  return t;
}

/* ---------- delimitadores e padrões ---------- */
// Split por "-----"
function splitBlocksByDashes(txt) {
  return sanitize(txt)
    .split(/^\s*-{5,}\s*$/m)
    .map(s => s.trim())
    .filter(Boolean);
}

// Início de card dentro do bloco
const RX_CARD_START = /^\s*(?:Art\.\b|S[úu]mula\b|Pre[aâ]mbulo\b)/i;

// Cabeçalhos estruturais que queremos ignorar como cards
const RX_LIVRO    = /^\s*LIVRO\b/i;
const RX_TITULO   = /^\s*T[ÍI]TULO\b/i;
const RX_CAPITULO = /^\s*CAP[ÍI]TULO\b/i;
const RX_SECAO    = /^\s*SEÇÃO\b/i;
const RX_SUBSECAO = /^\s*SUBSEÇÃO\b/i;

// Artigo — suporta "1.000", "121", "1º", "1º-A", "121-A", etc.
const RX_ART_EXTRACT =
/^\s*Art\.\s*(?<num>(?:\d{1,3}(?:\.\d{3})*|\d+))\s*(?<ord>[ºo])?(?:\s*-\s*(?<suf>[A-Z]))?\s*\./i;

// Para remover o prefixo "Art. X." (inclusive com milhares) do preview
const RX_ART_PREFIX =
/^\s*Art\.\s*(?:\d{1,3}(?:\.\d{3})*|\d+)\s*(?:[ºo])?(?:\s*-\s*[A-Z])?\s*\.\s*/i;

/* ---------- Parser por ----- (apenas cards) ---------- */
function parseBlocksCardsOnly(rawTxt, fileUrl, sourceLabel) {
  const blocks = splitBlocksByDashes(rawTxt);
  const out = [];

  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i];
    const lines = blk.split("\n");

    // Bloco só de cabeçalho? (primeiras linhas) → ignora
    const firstNonEmpty = lines.find(l => l.trim().length);
    if (firstNonEmpty && (
      RX_LIVRO.test(firstNonEmpty) ||
      RX_TITULO.test(firstNonEmpty) ||
      RX_CAPITULO.test(firstNonEmpty) ||
      RX_SECAO.test(firstNonEmpty) ||
      RX_SUBSECAO.test(firstNonEmpty)
    )) {
      // Só descartamos se NÃO houver Art./Súmula/Preâmbulo adiante
      if (!lines.some(l => RX_CARD_START.test(l))) continue;
    }

    // acha a 1ª linha que começa com "Art.", "Súmula" ou "Preâmbulo"
    const startIdx = lines.findIndex(l => RX_CARD_START.test(l));
    if (startIdx === -1) continue; // não é card

    // corta tudo antes do início do card
    const eff = lines.slice(startIdx);
    const headLine = eff[0] || "";
    const body = eff.slice(1).join("\n").trim();      // corpo sem o título
    const text = [headLine, body].filter(Boolean).join("\n"); // título + corpo

    // Título do card = a própria primeira linha (sem mexer)
    const title = headLine.trim();

    // Tenta extrair número se for "Art."
    let numero = "";
    const m = headLine.match(RX_ART_EXTRACT);
    if (m && m.groups) {
      const base = (m.groups.num || "").replace(/\./g, ""); // 1.000 -> "1000"
      const ord  = m.groups.ord || "";
      const suf  = m.groups.suf || "";
      numero = base + (ord || "") + (suf ? "-" + suf : "");
    }

    // ancora previsível
    const htmlId = numero
      ? ("art-" + numero.replace(/[^\w\-]/g, "").toLowerCase())
      : ("blk-" + (i + 1));

    out.push({
      id: `${fileUrl}::${htmlId}`,
      htmlId,
      source: sourceLabel,
      numeroOriginal: m?.groups?.num || "", // ex.: "1.000" (se for artigo)
      numero,                                // ex.: "1000" (para id)
      title,      // mostrado no card
      text,       // título + corpo
      body,       // só corpo (para modal sem duplicar título)
      fileUrl,
    });
  }

  return out;
}

/* ---------- parseFile: sempre por ----- ---------- */
async function parseFile(url, label) {
  if (state.cacheParsed.has(url)) return state.cacheParsed.get(url);
  const raw = await fetchText(url);

  const items = parseBlocksCardsOnly(raw, url, label);

  state.cacheParsed.set(url, items);
  return items;
}

/* ---------- "Respiros" (visual) ---------- */
function addRespirationsForDisplay(s) {
  if (!s) return "";
  const RX_INCISO  = /^(?:[IVXLCDM]{1,8})(?:\s*(?:\)|\.|[-–—]))(?:\s+|$)/;
  const RX_PARAGR  = /^(?:§+\s*\d+\s*[ºo]?|Par[aá]grafo\s+(?:[Uu]nico|\d+)\s*[ºo]?)(?:\s*[:.\-–—])?(?:\s+|$)/i;
  const RX_ALINEA  = /^[a-z](?:\s*(?:\)|\.|[-–—]))(?:\s+|$)/;
  const RX_TIT     = /^(?:T[ÍI]TULO|CAP[ÍI]TULO|SEÇÃO|SUBSEÇÃO|LIVRO)\b/i;

  const lines = String(s).split("\n");
  const out = [];
  for (const rawLine of lines) {
    const ln = rawLine.replace(/\r$/, "");
    const bare = ln.trim();
    const isMarker =
      RX_PARAGR.test(bare) || RX_INCISO.test(bare) || RX_ALINEA.test(bare) || RX_TIT.test(bare);

    if (isMarker && out.length && out[out.length - 1] !== "") out.push("");
    if (bare === "" && out.length && out[out.length - 1] === "") continue;

    out.push(ln);
  }
  return out.join("\n");
}

/* ---------- Busca: tokens, checagem e highlight ---------- */
function buildSearchTokens(term) {
  // Palavras com 3+ letras OU número de 1 dígito
  return (term || "")
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => (/^\d$/.test(t) || t.length >= 3));
}
function containsAllTokens(text, tokens) {
  const raw = String(text || "");
  const bagNorm = norm(raw);

  return tokens.every(t => {
    if (/^\d$/.test(t)) {
      // dígito isolado
      const re = new RegExp(`(^|[^0-9])${t}([^0-9]|$)`);
      return re.test(raw);
    }
    return bagNorm.includes(norm(t));
  });
}
function highlight(text, tokens) {
  const valid = (tokens || []).filter(t => /^\d$/.test(t) || t.length >= 3);
  let safe = escHTML(text || "");

  for (const t of valid) {
    if (/^\d$/.test(t)) {
      const re = new RegExp(`(^|[^0-9])(${t})(?=[^0-9]|$)`, "g");
      safe = safe.replace(re, (_, a, mid) => `${a}<mark>${mid}</mark>`);
    } else {
      const re = new RegExp(`(${escapeRegExp(t)})`, "gi");
      safe = safe.replace(re, "<mark>$1</mark>");
    }
  }
  return safe;
}

/* ---------- templates (estudo/questões) ---------- */
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
  els.spinner?.classList.add("show");

  try {
    const tokens = buildSearchTokens(term);
    state.searchTokens = tokens.slice();

    const results = [];
    const allOptions = Array.from(els.codeSelect?.querySelectorAll("option") || [])
      .map((o) => ({ url: (o.value || "").trim(), label: (o.textContent || "").trim() }))
      .filter((o) => o.url);

    for (const { url, label } of allOptions) {
      try {
        const cards = await parseFile(url, label);
        cards.forEach((it) => {
          if (containsAllTokens(it.text, tokens)) results.push(it);
        });
      } catch (e) {
        toast(`⚠️ Não carreguei: ${label}`);
        console.warn("Falha ao buscar:", e);
      }
    }

    skel.remove();
    renderBlock(term, results, tokens);
    toast(`${results.length} resultado(s) encontrados.`);
  } finally {
    els.stack.setAttribute("aria-busy", "false");
    els.spinner?.classList.remove("show");
    els.q?.select();
  }
}

/* ---------- render: lista de cards ---------- */
function truncatedHTML(fullText, tokens) {
  const base = fullText || "";
  let out = base.slice(0, CARD_CHAR_LIMIT);
  const cut = out.lastIndexOf(" ");
  if (base.length > CARD_CHAR_LIMIT && cut > CARD_CHAR_LIMIT * 0.7) {
    out = out.slice(0, cut) + "…";
  } else if (base.length > CARD_CHAR_LIMIT) {
    out = out.trim() + "…";
  }
  return highlight(escHTML(out), tokens);
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

  const title = document.createElement("h4");
  title.className = "title";
  title.textContent = item.title; // ex.: "Art. 1.000." | "Súmula 123..."

  const body = document.createElement("div");
  body.className = "body is-collapsed";
  // preview: primeira linha do corpo (mais limpo)
  const firstLine = (item.body || item.text).split("\n").find(l => l.trim()) || "";
  body.innerHTML = truncatedHTML(firstLine, tokens);
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
      body.innerHTML = truncatedHTML(firstLine, tokens);
      toggle.textContent = "ver texto";
    } else {
      body.innerHTML = highlight(escHTML(item.text), tokens); // integral (sem "-----")
      toggle.textContent = "ocultar";
    }
  });

  left.append(pill, title, body, actions);
  actions.append(toggle);

  const chk = document.createElement("button");
  chk.className = "chk";
  chk.setAttribute("aria-label", "Selecionar artigo");
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

/* ---------- Leitor (modal) ---------- */
async function openReader(item) {
  els.readerTitle && (els.readerTitle.textContent = item.source);
  els.selCount && (els.selCount.textContent = `${state.selected.size}/${MAX_SEL}`);
  els.readerBody && (els.readerBody.innerHTML = "");
  showModal(els.readerModal);

  // skeleton
  for (let i = 0; i < 3; i++) {
    const s = document.createElement("div");
    s.className = "skel block";
    s.style.margin = "10px 0";
    els.readerBody.appendChild(s);
  }

  try {
    const cards = await parseFile(item.fileUrl, item.source);
    els.readerBody.innerHTML = "";
    cards.forEach((a) => {
      const row = document.createElement("div");
      row.className = "article";
      row.id = a.htmlId;

      const chk = document.createElement("button");
      chk.className = "chk a-chk";
      chk.setAttribute("aria-label", "Selecionar artigo");
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
        els.selCount && (els.selCount.textContent = `${state.selected.size}/${MAX_SEL}`);
        sync();
        updateBottom();
      });

      const body = document.createElement("div");
      const h4 = document.createElement("h4");
      h4.textContent = `${a.title} — ${a.source}`;
      const txt = document.createElement("div");
      txt.className = "a-body";
      // só o corpo (sem duplicar o título e sem cabeçalhos)
      const shown = addRespirationsForDisplay(a.body || a.text);
      txt.innerHTML = highlight(escHTML(shown), state.searchTokens || []);
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
  } catch (e) {
    toast("Erro ao abrir o arquivo. Veja o console.");
    console.warn(e);
    hideModal(els.readerModal);
  }
}

/* ---------- MODAIS ---------- */
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
    empty.textContent = "Nenhum artigo selecionado.";
    els.selectedStack.appendChild(empty);
  } else {
    for (const it of state.selected.values()) {
      const card = renderCard(it, state.searchTokens || [], { context: "selected" });
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
    parts.push(it.text, ""); // texto integral
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
  parts.push("Artigos-base:");
  for (const id of includedSet) {
    const it = state.selected.get(id);
    if (!it) continue;
    parts.push(`### ${i}. ${it.title} — [${it.source}]`);
    parts.push(it.text, "");
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
  els.q && (els.q.value = "");
  els.stack && (els.stack.innerHTML = "");
  els.q?.focus();
  toast("Busca reiniciada.");
});

/* ---------- init ---------- */
updateBottom();
