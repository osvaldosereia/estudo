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
  // Removidos: studyBtn, questionsBtn (não existem mais)
  // O visor usa o antigo viewBtn como contador estático (sem click)
  viewBtn: $("#viewBtn"),

  /* leitor */
  readerModal: $("#readerModal"),
  readerBody: $("#readerBody"),
  readerTitle: $("#readerTitle"),
  selCount: $("#selCount"),

  /* selecionados */
  selectedModal: $("#selectedModal"),
  selectedStack: $("#selectedStack"),

  /* toasts */
  toasts: $("#toasts"),
};

/* ---------- estado ---------- */
const MAX_SEL = 3;
const CARD_CHAR_LIMIT = 250;
const PREV_MAX = 60;

const state = {
  selected: new Map(),     // id -> item
  cacheTxt: new Map(),     // url -> string
  cacheParsed: new Map(),  // url -> items[]
  urlToLabel: new Map(),
  // Removidos: promptTpl, promptQTpl, pendingObs, studyIncluded, questionsIncluded
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
  // visor como contador estático (n/MAX_SEL)
  if (els.viewBtn) {
    els.viewBtn.textContent = `${n}/${MAX_SEL}`;
    els.viewBtn.setAttribute("aria-label", `Selecionados: ${n} de ${MAX_SEL}`);
    els.viewBtn.style.pointerEvents = "none"; // não abre modal
  }
  if (els.selCount) els.selCount.textContent = `${n}/${MAX_SEL}`;
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

/* ============================================================
   BUSCA — abreviações & regras
   ============================================================ */

/* Remove pontos de milhar entre dígitos (1.000 → 1000) */
function stripThousandDots(s) {
  return String(s).replace(/(?<=\d)\.(?=\d)/g, "");
}

/* ---------- CÓDIGOS: abreviações/sinônimos → rótulo do <select> ---------- */
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

function numberRespectsWindows(text, n, queryMode /* "art"|"sumula"|null */) {
  const raw = String(text);

  // (a) janela curta ≤12 chars
  const nearRx = new RegExp(String.raw`\b(art\.?|artigo|s[uú]mula)\b[^0-9a-zA-Z]{0,12}(${n})(?:\b|[^0-9])`, "i");
  const nearOK = nearRx.test(stripThousandDots(raw));
  if (!nearOK) return false;

  // (b) se query começa com o marcador → precisa estar nos 15 primeiros chars da linha
  if (!queryMode) return true;

  const lines = raw.split(/\r?\n/);
  const wantStart = queryMode === "art" ? KW_ART_RX : KW_SUM_RX;

  for (const line of lines) {
    if (!wantStart.test(line)) continue;
    const clean = stripThousandDots(norm(line));
    const after = clean.replace(queryMode === "art" ? KW_ART_RX : KW_SUM_RX, "").trimStart();
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
    els.stack.append(block);
    return;
  }

  // Agrupar por arquivo (source)
  const groupsMap = new Map();
  for (const it of items) {
    const label = it.source || "Outros";
    if (!groupsMap.has(label)) groupsMap.set(label, []);
    groupsMap.get(label).push(it);
  }

  // Cria accordion por grupo (tudo colapsado inicialmente)
  const groups = Array.from(groupsMap.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
  groups.forEach(([label, arr]) => {
    const sec = document.createElement("section");
    sec.className = "group";

    const head = document.createElement("button");
    head.className = "group-head";
    head.setAttribute("aria-expanded","false");
    head.innerHTML = `<span class="group-title">${label}</span><span class="group-count">${arr.length}</span><span class="group-caret" aria-hidden="true">▾</span>`;
    sec.appendChild(head);

    const body = document.createElement("div");
    body.className = "group-body";
    body.hidden = true;
    arr.forEach((it)=> body.appendChild(renderCard(it, tokens)));
    sec.appendChild(body);

    head.addEventListener("click", ()=>{
      const open = head.getAttribute("aria-expanded")==="true";
      head.setAttribute("aria-expanded", open ? "false" : "true");
      body.hidden = open;
    });

    block.appendChild(sec);
  });

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
  if (item.source) card.setAttribute("data-source", item.source);

  const left = document.createElement("div");

  // chip do código (não no modal leitor)
  if (item.source && ctx.context !== "reader") {
    const pill = document.createElement("a");
    pill.href = "#";
    pill.className = "pill";
    pill.textContent = `📘 ${item.source} (abrir)`;
    pill.addEventListener("click", (e) => {
      e.preventDefault();
      openReader(item);
    });
    left.append(pill);
  }

  const body = document.createElement("div");
  body.className = "body";
  if (ctx.context === "reader") {
    body.innerHTML = highlight(item.text, tokens);
  } else {
    body.classList.add("is-collapsed");
    body.innerHTML = truncatedHTML(item.text, tokens);
  }
  body.style.cursor = "pointer";
  body.addEventListener("click", () => openReader(item));

  const actions = document.createElement("div");
  actions.className = "actions";

  /* ===== TOGGLE (seta) ALINHADO À ESQUERDA ===== */
  const toggle = document.createElement("button");
  toggle.className = "toggle toggle-left";
  toggle.textContent = "▼";
  toggle.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", expanded ? "false" : "true");
    toggle.textContent = expanded ? "▼" : "▲";
    body.innerHTML = expanded ? truncatedHTML(item.text, tokens)
                              : highlight(item.text, tokens);
    body.classList.toggle("is-collapsed", expanded);
  });

  /* ===== IA: função de query (reuso) ===== */
  const makeQuery = () => {
    const raw = (item.title + " " + item.text).replace(/\s+/g, " ").trim();
    const maxLen = 4000; // segurança p/ URL
    return encodeURIComponent(raw.length > maxLen ? raw.slice(0, maxLen) : raw);
  };

  /* ===== HUB DENTRO DO CARD (inalterado) ===== */
  /* ===== HUB DENTRO DO CARD (com prefixo fixo e bugfix) ===== */
  const hubWrap = document.createElement("div");
  hubWrap.className = "hub-wrap";

  const hubMenu = document.createElement("div");
  hubMenu.className = "hub-menu";

  // Prefixo fixo que será enviado antes do conteúdo do card
  const PREFIX = "Responda como tutor de Direito, cite artigos aplicáveis e proponha 3 questões ao final.";

  // Monta a query do card (prefixo + título + corpo), com compactação e limite para URL
  const makeCardQuery = () => {
    const raw = (item.title + " " + item.text).replace(/\s+/g, " ").trim();
    const body = `${PREFIX}\n\n${raw}`;
    const maxLen = 1800; // segurança para não estourar a URL
    return encodeURIComponent(body.length > maxLen ? body.slice(0, maxLen) : body);
  };

  // === Perplexity
  const hubBtn1 = document.createElement("button");
  hubBtn1.className = "round-btn";
  hubBtn1.setAttribute("aria-label", "perplexity");
  hubBtn1.innerHTML = '<img src="icons/ai-perplexity.png" alt="">';
  hubBtn1.addEventListener("click", () => {
    const q = makeCardQuery();
    window.open(`https://www.perplexity.ai/search?q=${q}`, "_blank", "noopener");
  });

  // === Copilot
  const hubBtn2 = document.createElement("button");
  hubBtn2.className = "round-btn";
  hubBtn2.setAttribute("aria-label", "copilot");
  hubBtn2.innerHTML = '<img src="icons/ai-copilot.png" alt="">';
  hubBtn2.addEventListener("click", () => {
    const q = makeCardQuery();
    window.open(`https://www.bing.com/copilotsearch?q=${q}`, "_blank", "noopener");
  });

  // === Google (AI mode / udm=50)
  const hubBtn3 = document.createElement("button");
  hubBtn3.className = "round-btn";
  hubBtn3.setAttribute("aria-label", "google-ai");
  hubBtn3.innerHTML = '<img src="icons/ai-gemini.png" alt="">';
  hubBtn3.addEventListener("click", () => {
    const q = makeCardQuery();
    window.open(`https://www.google.com/search?q=${q}&udm=50`, "_blank", "noopener");
  });

  hubMenu.append(hubBtn1, hubBtn2, hubBtn3);

  // Botão principal do hub (abre/fecha o menu)
  const hubMain = document.createElement("button");
  hubMain.className = "round-btn hub-main";
  hubMain.setAttribute("aria-label", "Abrir atalhos");
  hubMain.innerHTML = '<img src="icons/ai-hub.png" alt="">';
  hubMain.addEventListener("click", (e) => {
    e.stopPropagation();
    hubMenu.classList.toggle("open");
  });

  // Fecha qualquer menu aberto ao clicar fora (instala uma única vez)
  if (!window.__hubCloserInstalled) {
    document.addEventListener("click", (ev) => {
      document.querySelectorAll(".hub-wrap .hub-menu.open").forEach((menuEl) => {
        if (!menuEl.parentElement.contains(ev.target)) {
          menuEl.classList.remove("open");
        }
      });
    });
    window.__hubCloserInstalled = true;
  }

  hubWrap.append(hubMenu, hubMain);


  /* ===== Check (pilha) — permanece nos cards ===== */
  const chk = document.createElement("button");
chk.className = "chk";
chk.setAttribute("aria-label", "Selecionar bloco");
chk.innerHTML = `
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"/>
  </svg>
`;

  const sync = () => { chk.dataset.checked = state.selected.has(item.id) ? "true" : "false"; };
  sync();
  chk.addEventListener("click", () => {
    if (state.selected.has(item.id)) {
      state.selected.delete(item.id);
      toast(`Removido (${state.selected.size}/${MAX_SEL}).`);
      if (ctx.context === "selected") card.remove();
    } else {
      if (state.selected.size >= MAX_SEL) { toast(`⚠️ Limite de ${MAX_SEL} blocos.`); return; }
      state.selected.set(item.id, { ...item });
      toast(`Adicionado (${state.selected.size}/${MAX_SEL}).`);
    }
    sync();
    updateBottom();
  });

  /* ===== Montagem das ações (cards) ===== */
  actions.append(toggle);
  actions.append(hubWrap, chk);

  left.append(body, actions);
  card.append(left);
  return card;
}

/* ---------- Leitor (modal) ---------- */
async function openReader(item, tokens = []) {
  if (els.readerTitle) els.readerTitle.textContent = item.source;
  if (els.selCount) els.selCount.textContent = `${state.selected.size}/${MAX_SEL}`;
  if (els.readerBody) els.readerBody.innerHTML = "";
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
  if (e.target.matches("[data-close-sel]")) hideModal(els.selectedModal);

  if (els.readerModal && e.target === els.readerModal.querySelector(".modal-backdrop")) hideModal(els.readerModal);
  if (els.selectedModal && e.target === els.selectedModal.querySelector(".modal-backdrop")) hideModal(els.selectedModal);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (els.readerModal && !els.readerModal.hidden) hideModal(els.readerModal);
    if (els.selectedModal && !els.selectedModal.hidden) hideModal(els.selectedModal);
  }
});

/* ---------- VER SELECIONADOS (removido o clique do visor) ---------- */
/* Não há mais click no visor; o modal de selecionados pode continuar existente se aberto por outro caminho */

/* ---------- HUB da BASE + Lixeira + Visor ---------- */

// cria/garante o botão de lixeira depois do visor
/* ---------- HUB da BASE + Lixeira + Visor (ordem central) ---------- */

// cria/garante o botão de lixeira
function ensureClearSelectedBtn() {
  const parent = els.viewBtn?.parentElement;
  if (!parent) return;
  if (!document.getElementById("clearSelectedBtn")) {
    const clearBtn = document.createElement("button");
    clearBtn.id = "clearSelectedBtn";
    clearBtn.className = "btn icon-only";
    clearBtn.innerHTML = "🗑️";
    clearBtn.setAttribute("aria-label", "Limpar seleção");
    clearBtn.addEventListener("click", () => {
      state.selected.clear();
      updateBottom();
      toast("Seleção limpa.");
      document.querySelectorAll(".card .chk[data-checked='true']")
        .forEach((b) => b.removeAttribute("data-checked"));
    });
    parent.appendChild(clearBtn);
  }
}

// cria/garante o HUB da base
// cria/garante o espaçador (reserva área para o menu abrir à esquerda do HUB)
function ensureBaseSpacer() {
  const parent = els.viewBtn?.parentElement;
  if (!parent) return;
  if (!document.getElementById("baseHubSpacer")) {
    const spacer = document.createElement("div");
    spacer.id = "baseHubSpacer";
    spacer.style.flex = "0 0 160px"; // valor padrão; será ajustado no reorder
    spacer.style.height = "1px";     // mínimo, só reserva largura
    parent.appendChild(spacer);
  }
}

// cria/garante o HUB da base antes do visor (mantido)
function ensureBaseHub() {
  const parent = els.viewBtn?.parentElement;
  if (!parent) return;
  if (!document.getElementById("baseHubWrap")) {
    const hubWrap = document.createElement("div");
    hubWrap.id = "baseHubWrap";
    hubWrap.className = "hub-wrap";

    const hubMenu = document.createElement("div");
    hubMenu.className = "hub-menu";

    // prefixo fixo que será incluído antes do conteúdo selecionado
    const PREFIX = "Responda como tutor de Direito, cite artigos aplicáveis e proponha 3 questões ao final.";

    const makeAggregateQuery = () => {
      if (!state.selected.size) { toast("Selecione blocos para usar no HUB."); return null; }
      const parts = [];
      let i = 1;
      for (const it of state.selected.values()) {
        parts.push(`### ${i}. ${it.title} — [${it.source}]`, it.text);
        if (i++ >= MAX_SEL) break;
      }
      // aplica o prefixo + conteúdo agregado
      const rawBody = `${PREFIX}\n\n` + parts.join("\n\n");
      // compacta espaços e limita tamanho para URL
      const raw = rawBody.replace(/\s+/g, " ").trim();
      const maxLen = 1800;
      return encodeURIComponent(raw.length > maxLen ? raw.slice(0, maxLen) : raw);
    };

    const hubBtn1 = document.createElement("button");
    hubBtn1.className = "round-btn";
    hubBtn1.setAttribute("aria-label", "perplexity");
    hubBtn1.innerHTML = '<img src="icons/ai-perplexity.png" alt="">';
    hubBtn1.addEventListener("click", () => {
      const q = makeAggregateQuery(); if (!q) return;
      window.open(`https://www.perplexity.ai/search?q=${q}`, "_blank", "noopener");
    });

    const hubBtn2 = document.createElement("button");
    hubBtn2.className = "round-btn";
    hubBtn2.setAttribute("aria-label", "copilot");
    hubBtn2.innerHTML = '<img src="icons/ai-copilot.png" alt="">';
    hubBtn2.addEventListener("click", () => {
      const q = makeAggregateQuery(); if (!q) return;
      window.open(`https://www.bing.com/copilotsearch?q=${q}`, "_blank", "noopener");
    });

    const hubBtn3 = document.createElement("button");
    hubBtn3.className = "round-btn";
    hubBtn3.setAttribute("aria-label", "google-ai");
    hubBtn3.innerHTML = '<img src="icons/ai-gemini.png" alt="">';
    hubBtn3.addEventListener("click", () => {
      const q = makeAggregateQuery(); if (!q) return;
      window.open(`https://www.google.com/search?q=${q}&udm=50`, "_blank", "noopener");
    });

    hubMenu.append(hubBtn1, hubBtn2, hubBtn3);

    const hubMain = document.createElement("button");
    hubMain.className = "round-btn hub-main";
    hubMain.setAttribute("aria-label", "Abrir atalhos");
    hubMain.innerHTML = '<img src="icons/ai-hub.png" alt="">';
    hubMain.addEventListener("click", (e) => {
      e.stopPropagation();
      hubMenu.classList.toggle("open");
    });

    document.addEventListener("click", (ev) => {
      if (!hubWrap.contains(ev.target)) hubMenu.classList.remove("open");
    });

    hubWrap.append(hubMenu, hubMain);
    parent.appendChild(hubWrap);
  }
}


// reordena e mantém tudo em UMA LINHA, centralizado
function reorderBaseControlsAndCenter() {
  const parent = els.viewBtn?.parentElement;
  if (!parent || !els.viewBtn) return;

  const clearBtn = document.getElementById("clearSelectedBtn");
  const hubWrap  = document.getElementById("baseHubWrap");
  const spacer   = document.getElementById("baseHubSpacer");

  // --- layout do grupo (central, sem ocupar a tela toda) ---
  parent.style.display = "flex";
  parent.style.flexWrap = "nowrap";
  parent.style.alignItems = "center";
  parent.style.gap = (window.innerWidth <= 420 ? "6px" : "8px");

  // CENTRALIZA o grupo e limita a largura
  parent.style.width = "auto";                // <- remove 100%
  parent.style.maxWidth = "min(520px, 96vw)"; // <- largura máx do grupo
  parent.style.margin = "0 auto";             // <- centraliza na barra
  parent.style.justifyContent = "center";

  // respiro lateral menor no mobile
  parent.style.paddingLeft  = (window.innerWidth <= 420 ? "6px" : "8px");
  parent.style.paddingRight = (window.innerWidth <= 420 ? "6px" : "8px");

  // espaçador: ajusta para caber os 3 botões do menu
  if (spacer) {
    let basis = 160;                 // desktop
    if (window.innerWidth <= 480) basis = 120;
    if (window.innerWidth <= 380) basis = 96;
    if (window.innerWidth <= 340) basis = 84;
    spacer.style.flex = `0 0 ${basis}px`;
    spacer.style.height = "1px";
  }

  // impede que os itens encolham/estiquem
  [clearBtn, els.viewBtn, hubWrap, spacer].forEach(el => {
    if (el) { el.style.flexShrink = "0"; el.style.flexGrow = "0"; }
  });

  // ordem: limpar | contador | espaçador | hub
  if (clearBtn) parent.appendChild(clearBtn);
  parent.appendChild(els.viewBtn);
  if (spacer) parent.appendChild(spacer);
  if (hubWrap) parent.appendChild(hubWrap);
}



/* ---------- init ---------- */
updateBottom();

// Remover quaisquer restos de botões antigos, se existirem no DOM
document.getElementById("studyBtn")?.remove();
document.getElementById("questionsBtn")?.remove();

ensureBaseHub();
ensureClearSelectedBtn();
ensureBaseSpacer();
reorderBaseControlsAndCenter();
window.addEventListener("resize", reorderBaseControlsAndCenter);



