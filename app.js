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
  els.viewBtn && (els.viewBtn.textContent = `${n} ✔️ – Ver`);
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

/* ===== Planalto (links) ===== */
function makePlanaltoURL(title, source) {
  const match = title.match(/\d{1,4}[A-Za-zº-]?/);
  const artNum = match ? match[0].replace("º", "") : "";

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

/* ============================================================
   BUSCA — abreviações & regras
   ============================================================ */

/* Remove pontos de milhar entre dígitos (1.000 → 1000) */
function stripThousandDots(s) {
  return String(s).replace(/(?<=\d)\.(?=\d)/g, "");
}

/* ---------- CÓDIGOS: abreviações/sinônimos → rótulo do <select> ---------- */
/* Lado direito = rótulo EXATO do <option> do seu <select id="codeSelect"> */
const CODE_ABBREVS = new Map(Object.entries({
  // CF88
  "cf": "CF88",
  "cf88": "CF88",
  "cf/88": "CF88",
  "crfb": "CF88",
  "cr/88": "CF88",
  "constituicao federal": "CF88",
  "constituicao de 1988": "CF88",

  // Código Civil
  "cc": "Código Civil",
  "codigo civil": "Código Civil",
  "cod civil": "Código Civil",

  // Processo Civil
  "cpc": "Processo Civil",
  "codigo de processo civil": "Processo Civil",
  "cod proc civil": "Processo Civil",
  "proc civil": "Processo Civil",

  // Código Penal
  "cp": "Código Penal",
  "codigo penal": "Código Penal",
  "cod penal": "Código Penal",

  // Processo Penal
  "cpp": "Processo Penal",
  "codigo de processo penal": "Processo Penal",
  "cod proc penal": "Processo Penal",
  "proc penal": "Processo Penal",

  // CDC
  "cdc": "CDC",
  "codigo de defesa do consumidor": "CDC",
  "defesa do consumidor": "CDC",

  // Código Eleitoral
  "ce": "Código Eleitoral",
  "codigo eleitoral": "Código Eleitoral",
  "cod eleitoral": "Código Eleitoral",

  // CLT
  "clt": "CLT",
  "consolidacao das leis do trabalho": "CLT",

  // CTN
  "ctn": "Cód. Tributário Nacional",
  "codigo tributario nacional": "Cód. Tributário Nacional",
  "cod trib nacional": "Cód. Tributário Nacional",

  // CTB
  "ctb": "Cód. Trânsito Brasileiro",
  "codigo de transito brasileiro": "Cód. Trânsito Brasileiro",
  "cod transito brasileiro": "Cód. Trânsito Brasileiro",

  // Código Florestal
  "codigo florestal": "Código Florestal",
  "cod florestal": "Código Florestal",

  // Militares
  "cpm": "Cód. Penal Militar",
  "codigo penal militar": "Cód. Penal Militar",
  "cod penal militar": "Cód. Penal Militar",

  "cppm": "Cód. Proc. Penal Militar",
  "codigo de processo penal militar": "Cód. Proc. Penal Militar",
  "cod proc penal militar": "Cód. Proc. Penal Militar",

  // ECA / OAB
  "eca": "ECA",
  "estatuto da crianca e do adolescente": "ECA",

  "estatuto da oab": "Estatuto da OAB",
  "oab": "Estatuto da OAB",

  // Leis (rótulo = option)
  "lei maria da penha": "Lei Maria da Penha",
  "lmp": "Lei Maria da Penha",

  "lei da improbidade administrativa": "Lei da Improbidade Administrativa",
  "lia": "Lei da Improbidade Administrativa",
  "lei de improbidade": "Lei da Improbidade Administrativa",

  "lei de execucao penal": "Lei de Execução Penal",
  "lep": "Lei de Execução Penal",

  "lei de drogas": "Lei de Drogas",

  "mandado de seguranca": "Mandado de Segurança",
  "lei do mandado de seguranca": "Mandado de Segurança",
}));

/* Detecta se a query contém uma dica de código (abreviação/sinônimo) */
function detectCodeFromQuery(rawQuery) {
  const q = ` ${norm(rawQuery)} `; // acolchoado para evitar falsos positivos
  for (const [abbr, label] of CODE_ABBREVS.entries()) {
    const needle = ` ${abbr} `;
    if (q.includes(needle) || q.trim() === abbr) {
      const keyWords = new Set(abbr.split(/\s+/).filter(Boolean));
      return { label, keyWords };
    }
  }
  return null;
}

/* Palavras 3+ letras e números 1–4 dígitos */
function tokenize(query) {
  const q = norm(query);
  const raw = q.split(/\s+/).filter(Boolean);
  const tokens = [];
  for (const w of raw) {
    if (/^\d{1,4}$/.test(w)) tokens.push(w);          // número exato (1–4 dígitos)
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

/* número "exato" dentro de um texto normalizado (1 não casa 10/100; 11 ≠ 1)
   Trata pontos de milhar: "1.000" ≡ "1000" */
function hasExactNumber(bag, n) {
  const bagNum = stripThousandDots(bag);
  const rx = new RegExp(`(?:^|\\D)${n}(?:\\D|$)`, "g");
  return rx.test(bagNum);
}

/* keyword proximity (≤12 chars) e regra "linha começa com" (≤15 chars) */
const KW_RX = /\b(art\.?|artigo|s[uú]mula)\b/iu;
const KW_ART_RX = /^\s*(art\.?|artigo)\b/i;
const KW_SUM_RX = /^\s*s[uú]mula\b/i;

/* retorna true se o número N:
   (a) está a ≤12 chars da keyword (art/art./artigo/súmula), e
   (b) SE a query começar por "art|art.|artigo|súmula":
       o número aparece nos 15 primeiros caracteres da linha que começa com esse marcador. */
function numberRespectsWindows(text, n, queryMode /* "art"|"sumula"|null */) {
  const raw = String(text);

  // (a) janela curta ≤12 chars
  // captura "KW ... N" com até 12 não-alfa-num entre o fim da KW e o primeiro dígito
  const nearRx = new RegExp(String.raw`\b(art\.?|artigo|s[uú]mula)\b[^0-9a-zA-Z]{0,12}(${n})(?:\b|[^0-9])`, "i");
  const nearOK = nearRx.test(stripThousandDots(raw));
  if (!nearOK) return false;

  // (b) se query começa com o marcador → precisa estar nos 15 primeiros chars da linha
  if (!queryMode) return true;

  const lines = raw.split(/\r?\n/);
  const wantStart = queryMode === "art" ? KW_ART_RX : KW_SUM_RX;

  for (const line of lines) {
    if (!wantStart.test(line)) continue;
    const clean = stripThousandDots(norm(line)); // normaliza e remove "1.000"
    // pega a parte da linha após o marcador inicial
    const after = clean.replace(queryMode === "art" ? KW_ART_RX : KW_SUM_RX, "").trimStart();
    // índice do número (como string) após o marcador
    const idx = after.indexOf(n);
    if (idx !== -1 && idx <= 15) return true;
  }
  return false;
}

function extractLegalRefsToSet(text) {
  const rx = /\b(art\.?|artigo|s[uú]mula)\b[^0-9a-zA-Z]{0,12}(\d{1,4}[a-zA-Z\-]?)/giu;
  const out = new Set();
  let m;
  while ((m = rx.exec(text)) !== null) {
    const puro = (m[2] || "").toLowerCase().match(/^\d{1,4}/)?.[0];
    if (puro) out.add(puro);
  }
  return out;
}

function getBagWords(bag) {
  return bag.match(/\b[a-z0-9]{3,}\b/g) || [];
}
function escapeRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function pluralVariants(t) {
  const v = new Set([t]);
  if (!t.endsWith("s")) { v.add(t + "s"); v.add(t + "es"); }
  else { v.add(t.slice(0, -1)); }
  if (t.endsWith("m")) v.add(t.slice(0, -1) + "ns");
  if (t.endsWith("ao")) {
    const base = t.slice(0, -2);
    v.add(base + "oes"); v.add(base + "aos"); v.add(base + "aes");
  }
  return [...v];
}
function withinOneSubstitutionStrict(a, b) {
  if (a.length !== b.length) return false;
  if (a.length < 4) return a === b;
  if (a[0] !== b[0] || a[a.length - 1] !== b[b.length - 1]) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i] && ++diff > 1) return false;
  }
  return diff === 1;
}
function bagHasTokenWord(bag, token) {
  const words = getBagWords(bag);
  const vars = pluralVariants(token);
  const rx = new RegExp(`\\b(${vars.map(escapeRx).join("|")})\\b`, "i");
  if (rx.test(bag)) return true;
  for (const w of words) {
    for (const v of vars) {
      if (withinOneSubstitutionStrict(v, w)) return true;
    }
  }
  return false;
}

/* ---------- catálogo (select) ---------- */
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
    opt.value = url;
    state.urlToLabel.set(label, url);
  });
})();

/* ---------- fetch/parse ---------- */
function sanitize(s) {
  return String(s)
    .replace(/\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n");
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
function splitBlocks(txt) {
  return sanitize(txt)
    .split(/^\s*-{5,}\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}
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

function detectQueryMode(normQuery) {
  const trimmed = normQuery.trim();
  if (/^(art\.?\b|artigo\b)/i.test(trimmed)) return "art";
  if (/^s[uú]mula\b/i.test(trimmed)) return "sumula";
  return null;
}

/* Palavras: TODAS; Números: exatos; Proximidade: ≤12; Se começa com Art/Súmula: ≤15 no início da linha */
function hasAllWordTokens(bag, wordTokens) {
  return wordTokens.every((w) => bagHasTokenWord(bag, w));
}
function matchesNumbers(item, numTokens, queryHasLegalKeyword, queryMode) {
  if (!numTokens.length) return true;

  const bag = norm(stripThousandDots(item.text));

  if (!queryHasLegalKeyword) {
    return numTokens.every((n) => hasExactNumber(bag, n));
  }

  // com keyword jurídica na query: precisa (a) proximidade ≤12 e (b) (se houver) regra ≤15 no início da linha
  return numTokens.every((n) => numberRespectsWindows(item.text, n, queryMode));
}

async function doSearch() {
  const termRaw = (els.q.value || "").trim();
  if (!termRaw) return;

  // trata 1.000 → 1000 na query
  const term = stripThousandDots(termRaw);

  els.stack.innerHTML = "";
  els.stack.setAttribute("aria-busy", "true");
  const skel = document.createElement("section");
  skel.className = "block";
  const t = document.createElement("div");
  t.className = "block-title";
  t.textContent = `Busca: ‘${termRaw}’ (…)`;
  skel.appendChild(t);
  for (let i = 0; i < 2; i++) {
    const s = document.createElement("div"); s.className = "skel block"; skel.appendChild(s);
  }
  els.stack.append(skel);
  els.spinner?.classList.add("show");

  try {
    const normQuery = norm(term);
    const queryMode = detectQueryMode(normQuery); // "art" | "sumula" | null

    // dica de código (cc, cp, cpc, "codigo civil", etc.)
    const codeInfo = detectCodeFromQuery(normQuery);

    // tokens válidos (palavras 3+ e números 1–4)
    let tokens = tokenize(normQuery);
    if (!tokens.length) {
      skel.remove();
      renderBlock(termRaw, [], []);
      toast("Use palavras com 3+ letras ou números (1–4 dígitos).");
      return;
    }

    // se houve codeInfo, remove do conjunto de palavras os termos que só serviram p/ identificar o código
    if (codeInfo) {
      tokens = tokens.filter((tk) => !codeInfo.keyWords.has(tk));
    }

    const queryHasLegalKeyword = KW_RX.test(normQuery);
    const { wordTokens, numTokens } = splitTokens(tokens);

    // monta a lista de arquivos; se codeInfo → filtra pelo rótulo do <option>
    let allOptions = Array.from(els.codeSelect?.querySelectorAll("option") || [])
      .map((o) => ({ url: (o.value || "").trim(), label: (o.textContent || "").trim() }))
      .filter((o) => o.url);

    if (codeInfo) {
      allOptions = allOptions.filter((o) => o.label === codeInfo.label);
      if (!allOptions.length) {
        toast(`Não achei o arquivo para “${codeInfo.label}”. Confira o rótulo do catálogo.`);
      }
    }

    const results = [];
    for (const { url, label } of allOptions) {
      try {
        const items = await parseFile(url, label);
        for (const it of items) {
          const bag = norm(stripThousandDots(it.text));

          const okWords = hasAllWordTokens(bag, wordTokens);
          const okNums  = matchesNumbers(it, numTokens, queryHasLegalKeyword, queryMode);

          if (okWords && okNums) results.push(it);
        }
      } catch (e) {
        toast(`⚠️ Não carreguei: ${label}`);
        console.warn("Falha ao buscar:", e);
      }
    }

    skel.remove();
    renderBlock(termRaw, results, tokens);
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

/* ---------- cards ---------- */
function highlight(text, tokens) {
  if (!tokens?.length) return escHTML(text || "");
  const srcEsc = escHTML(text || "");
  const srcNFD = srcEsc.normalize("NFD");
  const toDiacriticRx = (t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
     .replace(/\p{L}/gu, (ch) => ch + "\\p{M}*");
  const parts = tokens.filter(Boolean).map(toDiacriticRx);
  if (!parts.length) return srcEsc;
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

function renderCard(item, tokens = [], ctx = { context: "results" }) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = item.id;

  const left = document.createElement("div");

  // chip do código (não no modal leitor)
  if (item.source && ctx.context !== "reader") {
    const pill = document.createElement("a");
    pill.href = "#";
    pill.className = "pill";
    pill.textContent = item.source;
    pill.addEventListener("click", (e) => { 
      e.preventDefault(); 
      openReader(item); 
    });
    left.append(pill);
  }

  const body = document.createElement("div");
  body.className = "body is-collapsed";
  body.innerHTML = truncatedHTML(item.text, tokens);
  body.style.cursor = "pointer";
  body.addEventListener("click", () => openReader(item));

  const actions = document.createElement("div");
  actions.className = "actions";

  // ver texto
  const toggle = document.createElement("button");
  toggle.className = "toggle";
  toggle.textContent = "ver texto";
  toggle.addEventListener("click", () => {
    const collapsed = body.classList.toggle("is-collapsed");
    if (collapsed) {
      body.innerHTML = truncatedHTML(item.text, tokens);
      toggle.textContent = "ver texto";
    } else {
      body.innerHTML = highlight(item.text, tokens);
      toggle.textContent = "ocultar";
    }
  });

  // Planalto
  const planaltoBtn = document.createElement("button");
  planaltoBtn.className = "toggle";
  planaltoBtn.textContent = "Planalto";
  planaltoBtn.addEventListener("click", () => {
    window.open(makePlanaltoURL(item.title, item.source), "_blank", "noopener,noreferrer");
  });

  actions.append(toggle, planaltoBtn);
  left.append(body, actions);

  // check à direita
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
      const card = renderCard(a, tokens, { context: "reader" });
      card.id = a.htmlId;
      els.readerBody.appendChild(card);
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
    parts.push(it.text, "");
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
  if (opts.includes("casos2"))                  prefLines.push("- Inclua 2 Casos Concretos.");
  if (opts.includes("dissertativas2"))          prefLines.push("- Inclua 2 Dissertativas.");
  if (opts.includes("vf2"))                     prefLines.push("- Inclua 2 V ou F.");
  if (opts.includes("mcq_1correta"))            prefLines.push("- Questões múltipla escolha A–E com apenas 1 correta (sem 'todas' ou 'nenhuma').");
  if (opts.includes("dificuldade_balanceada"))  prefLines.push("- Balancear dificuldade: 3 fáceis, 4 médias e 3 difíceis.");
  if (opts.includes("bloom_mix"))               prefLines.push("- Distribuir pelo modelo Bloom: 30% lembrar, 40% aplicar, 30% analisar.");
  if (opts.includes("enunciado_autossuficiente")) prefLines.push("- Enunciados devem ser autossuficientes e neutros.");
  if (opts.includes("distratores_plausiveis"))  prefLines.push("- Distratores devem ser plausíveis (erros típicos OAB/FGV).");
  if (opts.includes("alternativas_padronizadas")) prefLines.push("- Alternativas com extensão padronizada (variação ≤ 15%).");
  if (opts.includes("tempo_alvo"))              prefLines.push("- Considerar tempo-alvo: objetivas 1,5–2 min; discursivas 8–10 min.");
  if (opts.includes("pegadinhas"))              prefLines.push("- Misturar entendimentos para criar pegadinhas recorrentes.");

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
