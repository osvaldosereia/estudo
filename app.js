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

/* ---------- BUSCA: tokens e regras (NOVO) ---------- */
// Palavras 3+ letras e números 1–4 dígitos (número exato)
function tokenize(query) {
  const q = norm(query);
  const raw = q.split(/\s+/).filter(Boolean);
  const tokens = [];
  for (const w of raw) {
    if (/^\d{1,4}$/.test(w)) tokens.push(w);         // número exato
    else if (/^\p{L}{3,}$/u.test(w)) tokens.push(w);  // palavra 3+ letras
  }
  return Array.from(new Set(tokens));
}

function splitTokens(tokens) {
  const wordTokens = [];
  const numTokens  = [];
  for (const t of tokens) (/^\d{1,4}$/.test(t) ? numTokens : wordTokens).push(t);
  return { wordTokens, numTokens };
}

// número "exato" dentro de um texto normalizado (1 não casa 10/100; 11 não casa 1)
function hasExactNumber(bag, n) {
  const rx = new RegExp(`(?:^|\\D)${n}(?:\\D|$)`, "g");
  return rx.test(bag);
}

// números que aparecem perto de "art", "art.", "artigo" ou "súmula" no MESMO card
function extractLegalRefs(text) {
  const rx = /\b(art\.?|artigo|s[uú]mula)\b[^0-9a-zA-Z]{0,12}(\d{1,4}[a-zA-Z\-]?)\b/giu;
  const out = new Set();
  let m;
  while ((m = rx.exec(text)) !== null) {
    const puro = (m[2] || "").toLowerCase().match(/^\d{1,4}/)?.[0];
    if (puro) out.add(puro);
  }
  return out;
}

function hasAllWordTokens(bag, wordTokens) {
  return wordTokens.every((w) => bagHasTokenWord(bag, w));
}

// Regras dos números:
// - Sem “art|artigo|súmula” na query → exigir números exatos em qualquer parte do card
// - Com “art|artigo|súmula” na query → cada número precisa estar próximo desses termos no MESMO card
function matchesNumbers(item, numTokens, queryHasLegalKeyword) {
  if (!numTokens.length) return true;

  const bag = norm(item.text);
  if (!queryHasLegalKeyword) {
    return numTokens.every(n => hasExactNumber(bag, n));
  }
  const legals = extractLegalRefs(item.text); // usa texto cru p/ janela
  return numTokens.every(n => legals.has(n));
}
// Divide o "bag" em palavras normalizadas (3+ letras ou números)
function getBagWords(bag) {
  return bag.match(/\b[a-z0-9]{3,}\b/g) || [];
}

function escapeRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// Variações simples de plural PT-BR
function pluralVariants(t) {
  const v = new Set([t]);
  if (!t.endsWith("s")) { v.add(t + "s"); v.add(t + "es"); }
  else { v.add(t.slice(0, -1)); }            // “tutelas” ↔ “tutela”
  if (t.endsWith("m")) v.add(t.slice(0, -1) + "ns");  // “homem” ↔ “homens”
  if (t.endsWith("ao")) {
    const base = t.slice(0, -2);
    v.add(base + "oes"); v.add(base + "aos"); v.add(base + "aes");
  }
  return [...v];
}

// Distância de edição <= 1 (inserção/remoção/substituição). O( min(n,m) )
// Fuzzy bem restrito: permite APENAS 1 substituição (mesmo tamanho),
// mantendo 1ª e última letra iguais. Evita "preclusao" ≈ "reclusao".
function withinOneSubstitutionStrict(a, b) {
  if (a.length !== b.length) return false;          // sem inserção/remoção
  if (a.length < 4) return a === b;                 // palavras curtas: sem fuzzy
  if (a[0] !== b[0] || a[a.length - 1] !== b[b.length - 1]) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i] && ++diff > 1) return false;
  }
  return diff === 1;                                 // exatamente 1 diferença
}

// Checa se UM token de palavra existe no bag por PALAVRA INTEIRA (com tolerância)
function bagHasTokenWord(bag, token) {
  const words = getBagWords(bag);
  const vars = pluralVariants(token);

  // 1) match EXATO por palavra (singular/plural simples)
  const rx = new RegExp(`\\b(${vars.map(escapeRx).join("|")})\\b`, "i");
  if (rx.test(bag)) return true;

  // 2) fuzzy ULTRA-restrito: 1 substituição (mesmo tamanho, mesma 1ª e última)
  for (const w of words) {
    for (const v of vars) {
      if (withinOneSubstitutionStrict(v, w)) return true;
    }
  }
  return false;
}

/* ---------- catálogo (select) ---------- */
/* Converte automatico URLs do GitHub (blob) em RAW + encodeURI */
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
    opt.value = url; // corrige no DOM (evita 404 e caracteres especiais)
    state.urlToLabel.set(label, url);
  });
})();

/* ---------- fetch/parse ---------- */
function sanitize(s) {
  return String(s)
    .replace(/\uFEFF/g, "")      // BOM
    .replace(/\u00A0/g, " ")     // NBSP
    .replace(/\r\n?/g, "\n")     // EOL
    .replace(/[ \t]+\n/g, "\n"); // ws final
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

/* Split: cada linha com 5+ hifens (-----) separa blocos */
function splitBlocks(txt) {
  return sanitize(txt)
    .split(/^\s*-{5,}\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* Parser minimalista: título = 1ª linha; corpo = resto (preservado) */
function parseBlock(block, idx, fileUrl, sourceLabel) {
  const lines = block.split("\n");
  const firstIdx = lines.findIndex((l) => l.trim().length > 0);
  const first = firstIdx >= 0 ? lines[firstIdx].trim() : `Bloco ${idx + 1}`;
  const rest  = lines.slice(firstIdx + 1).join("\n").trim();
  const full  = [first, rest].filter(Boolean).join("\n");

  return {
    id: `${fileUrl}::art-${idx}`,
    htmlId: `art-${idx}`,
    source: sourceLabel,
    title: first,
    body: rest,
    text: full, // título + corpo
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

/* ---------- "Respiros" (só no leitor) ---------- */
function addRespirationsForDisplay(s) {
  if (!s) return "";
  const RX_INCISO  = /^(?:[IVXLCDM]{1,8})(?:\s*(?:\)|\.|[-–—]))(?:\s+|$)/;
  const RX_PARAGR  = /^(?:§+\s*\d+\s*[ºo]?|Par[aá]grafo\s+(?:[Uu]nico|\d+)\s*[ºo]?)(?:\s*[:.\-–—])?(?:\s+|$)/i;
  const RX_ALINEA  = /^[a-z](?:\s*(?:\)|\.|[-–—]))(?:\s+|$)/;
  const RX_TITULO  = /^(?:T[ÍI]TULO|CAP[ÍI]TULO|SEÇÃO|SUBSEÇÃO|LIVRO)\b/i;

  const lines = String(s).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    const isMarker =
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
    // NOVO: tokens válidos (palavras 3+ e números 1–4 dígitos)
    const tokens = tokenize(term);
    if (!tokens.length) {
      skel.remove();
      renderBlock(term, [], []);
      toast("Use palavras com 3+ letras ou números (1–4 dígitos).");
      return;
    }

    const normQuery = norm(term);
    const queryHasLegalKeyword = /\b(art|art\.|artigo|s[uú]mula)\b/i.test(normQuery);
    const { wordTokens, numTokens } = splitTokens(tokens);

    const results = [];
    const allOptions = Array.from(els.codeSelect?.querySelectorAll("option") || [])
      .map((o) => ({ url: (o.value || "").trim(), label: (o.textContent || "").trim() }))
      .filter((o) => o.url);

    for (const { url, label } of allOptions) {
      try {
        const items = await parseFile(url, label);
        for (const it of items) {
          const bag = norm(it.text);

          // Palavras: exige TODAS
          const okWords = hasAllWordTokens(bag, wordTokens);

          // Números: exatos; e, se “art|artigo|súmula” presente, próximos no mesmo card
          const okNums = matchesNumbers(it, numTokens, queryHasLegalKeyword);

          if (okWords && okNums) results.push(it);
        }
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

/* ---------- destaque/preview ---------- */
function highlight(text, tokens) {
  if (!tokens?.length) return escHTML(text || "");

  // Trabalha em NFD para casar base + diacrítico; volta a NFC no fim
  const srcEsc = escHTML(text || "");
  const srcNFD = srcEsc.normalize("NFD");

  const toDiacriticRx = (t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
     .replace(/\p{L}/gu, (ch) => ch + "\\p{M}*");

  const parts = tokens.filter(Boolean).map(toDiacriticRx);
  if (!parts.length) return srcEsc;

  // borda de palavra: evita “art” em “partido”
  const rx = new RegExp(`\\b(${parts.join("|")})\\b`, "giu");
  const markedNFD = srcNFD.replace(rx, "<mark>$1</mark>");
  return markedNFD.normalize("NFC");
}

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

/* ---------- LINK DO PLANALTO (novo) ---------- */
// Mapa de fontes -> URL base no Planalto
const PLANALTO_BASE = {
  "CF88": "http://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm",
  "Código Civil": "http://www.planalto.gov.br/ccivil_03/leis/2002/L10406.htm",
  "Processo Civil": "http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm",
  "Código Penal": "http://www.planalto.gov.br/ccivil_03/decreto-lei/del2848.htm",
  "Processo Penal": "http://www.planalto.gov.br/ccivil_03/decreto-lei/del3689.htm",
  "CDC": "http://www.planalto.gov.br/ccivil_03/leis/l8078.htm",
  "Código Eleitoral": "http://www.planalto.gov.br/ccivil_03/leis/l4737.htm",
  "CLT": "http://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm",
  "Cód. Tributário Nacional": "http://www.planalto.gov.br/ccivil_03/leis/l5172.htm",
  "Cód. Trânsito Brasileiro": "http://www.planalto.gov.br/ccivil_03/leis/l9503.htm",
  "Código Florestal": "http://www.planalto.gov.br/ccivil_03/leis/l12651.htm",
  "Cód. Proc. Penal Militar": "http://www.planalto.gov.br/ccivil_03/decreto-lei/del1002.htm",
  "Cód. Penal Militar": "http://www.planalto.gov.br/ccivil_03/decreto-lei/del1001.htm",
  "Estatuto da OAB": "http://www.planalto.gov.br/ccivil_03/leis/l8906.htm",
  "Lei Maria da Penha": "http://www.planalto.gov.br/ccivil_03/leis/l11340.htm",
  "Lei da Improbidade Administrativa": "http://www.planalto.gov.br/ccivil_03/leis/l8429.htm",
  "Lei de Execução Penal": "http://www.planalto.gov.br/ccivil_03/leis/l7210.htm",
  "Lei de Drogas": "http://www.planalto.gov.br/ccivil_03/leis/l11343.htm",
  "Mandado de Segurança": "http://www.planalto.gov.br/ccivil_03/_ato2007-2010/2009/lei/l12016.htm"
};

// Extrai nº do artigo ("Art. 123", "Art. 123-A") → "123"
function getArticleNumberFromTitle(title = "") {
  const m = title.match(/\bArt\.?\s*(\d{1,4})\b/i);
  return m ? m[1] : null;
}

// Gera fragmento de rolagem: usa o começo do título como âncora de texto
function buildTextFragmentSnippet(title = "") {
  // pega até ~80 chars do título (o texto mais único possível)
  const snippet = (title || "").trim().slice(0, 80);
  return snippet ? `#:~:text=${encodeURIComponent(snippet)}` : "";
}

// Fallback para busca precisa no Planalto
function buildFallbackSearch(source, artNum) {
  const q = [`site:planalto.gov.br`, source || "", artNum ? `Art. ${artNum}` : ""]
    .filter(Boolean)
    .join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

// URL final para o botão "Planalto"
function generatePlanaltoURL(item) {
  const base = PLANALTO_BASE[item.source];
  const art = getArticleNumberFromTitle(item.title || item.text || "");
  if (base) {
    // tenta rolar usando Scroll-To-Text Fragment (Chromium)
    const frag = buildTextFragmentSnippet(item.title || item.text || "");
    return `${base}${frag}`;
  }
  // sem base conhecida → busca no Google, focada no artigo
  return buildFallbackSearch(item.source, art);
}

/* ---------- cards ---------- */
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

  // Botão "Planalto" (novo)
  const plan = document.createElement("a");
  plan.className = "toggle";
  plan.textContent = "Planalto";
  plan.href = generatePlanaltoURL(item);
  plan.target = "_blank";
  plan.rel = "noopener";

  const toggle = document.createElement("button");
  toggle.className = "toggle";
  toggle.textContent = "ver texto";
  toggle.addEventListener("click", () => {
    const collapsed = body.classList.toggle("is-collapsed");
    if (collapsed) {
      body.innerHTML = truncatedHTML(item.text, tokens);
      toggle.textContent = "ver texto";
    } else {
      // mantém destaque também no modo expandido
      body.innerHTML = highlight(item.text, tokens);
      toggle.textContent = "ocultar";
    }
  });

  left.append(pill, body, actions);
  actions.append(toggle, plan); // mantém ordem: "ver texto" e, ao lado, "Planalto"

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
      if (state.selected.size >= MAX_SEL) { toast("⚠️ Limite de 6 blocos."); return; }
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
async function openReader(item, tokens = []) {
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
          if (state.selected.size >= MAX_SEL) { toast("⚠️ Limite de 6 blocos."); return; }
          state.selected.set(a.id, a);
          toast(`Adicionado (${state.selected.size}/${MAX_SEL}).`);
        }
        els.selCount && (els.selCount.textContent = `${state.selected.size}/${MAX_SEL}`);
        sync();
        updateBottom();
      });

      const body = document.createElement("div");
      const h4 = document.createElement("h4");
      // 👉 título sem repetir a fonte (o cabeçalho do modal já mostra a fonte)
      h4.textContent = a.title;
      h4.style.fontWeight = "normal";

      // 👉 corpo SEM a primeira linha (título), mesmo se a.body vier vazio
      const onlyBody = (a.body && a.body.trim())
        ? a.body
        : (a.text || "").replace(/^[^\n]*\n?/, "");

      const txt = document.createElement("div");
      txt.className = "a-body";
      const withBreaks = addRespirationsForDisplay(onlyBody);
      const withMarks  = highlight(withBreaks, tokens);
      txt.innerHTML    = withMarks.replace(/\n/g, "<br>");

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
  parts.push("Blocos-base:");
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
