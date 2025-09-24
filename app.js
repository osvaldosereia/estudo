/* ==========================
   direito.love — app.js (2025-09 • streamlined)
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

  /* leitor */
  readerModal: $("#readerModal"),
  readerBody: $("#readerBody"),
  readerTitle: $("#readerTitle"),

  /* toasts */
  toasts: $("#toasts"),
};

/* ---------- estado ---------- */
const CARD_CHAR_LIMIT = 250;

const state = {
  cacheTxt: new Map(),     // url -> string
  cacheParsed: new Map(),  // url -> items[]
  urlToLabel: new Map(),
};

/* ---------- util ---------- */
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  els.toasts.appendChild(el);
  setTimeout(() => el.remove(), 2400);
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

function stripThousandDots(s) {
  return String(s).replace(/(?<=\d)\.(?=\d)/g, "");
}

/* ---------- CÓDIGOS: abreviações/sinônimos → rótulo do <select> ---------- */
const CODE_ABBREVS = new Map(Object.entries({
  "cf": "CF88","cf88": "CF88","cf/88": "CF88","crfb": "CF88","cr/88": "CF88",
  "constituicao federal": "CF88","constituicao de 1988": "CF88",
  "cc": "Código Civil","codigo civil": "Código Civil","cod civil": "Código Civil",
  "cpc": "Processo Civil","codigo de processo civil": "Processo Civil","cod proc civil": "Processo Civil","proc civil": "Processo Civil",
  "cp": "Código Penal","codigo penal": "Código Penal","cod penal": "Código Penal",
  "cpp": "Processo Penal","codigo de processo penal": "Processo Penal","cod proc penal": "Processo Penal","proc penal": "Processo Penal",
  "cdc": "CDC","codigo de defesa do consumidor": "CDC","defesa do consumidor": "CDC",
  "ce": "Código Eleitoral","codigo eleitoral": "Código Eleitoral","cod eleitoral": "Código Eleitoral",
  "clt": "CLT","consolidacao das leis do trabalho": "CLT",
  "ctn": "Cód. Tributário Nacional","codigo tributario nacional": "Cód. Tributário Nacional","cod trib nacional": "Cód. Tributário Nacional",
  "ctb": "Cód. Trânsito Brasileiro","codigo de transito brasileiro": "Cód. Trânsito Brasileiro","cod transito brasileiro": "Cód. Trânsito Brasileiro",
  "codigo florestal": "Código Florestal","cod florestal": "Código Florestal",
  "cpm": "Cód. Penal Militar","codigo penal militar": "Cód. Penal Militar","cod penal militar": "Cód. Penal Militar",
  "cppm": "Cód. Proc. Penal Militar","codigo de processo penal militar": "Cód. Proc. Penal Militar","cod proc penal militar": "Cód. Proc. Penal Militar",
  "eca": "ECA","estatuto da crianca e do adolescente": "ECA",
  "estatuto da oab": "Estatuto da OAB","oab": "Estatuto da OAB",
  "lei maria da penha": "Lei Maria da Penha","lmp": "Lei Maria da Penha",
  "lei da improbidade administrativa": "Lei da Improbidade Administrativa","lia": "Lei da Improbidade Administrativa","lei de improbidade": "Lei da Improbidade Administrativa",
  "lei de execucao penal": "Lei de Execução Penal","lep": "Lei de Execução Penal",
  "lei de drogas": "Lei de Drogas",
  "mandado de seguranca": "Mandado de Segurança","lei do mandado de seguranca": "Mandado de Segurança",
}));

function detectCodeFromQuery(rawQuery) {
  const q = ` ${norm(rawQuery)} `;
  for (const [abbr, label] of CODE_ABBREVS.entries()) {
    const needle = ` ${abbr} `;
    if (q.includes(needle) || q.trim() === abbr) {
      const keyWords = new Set(abbr.split(/\s+/).filter(Boolean));
      return { label, keyWords };
    }
  }
  return null;
}

/* tokens */
function tokenize(query) {
  const q = norm(query);
  const raw = q.split(/\s+/).filter(Boolean);
  const tokens = [];
  for (const w of raw) {
    if (/^\d{1,4}$/.test(w)) tokens.push(w);
    else if (/^\p{L}{3,}$/u.test(w)) tokens.push(w);
  }
  return Array.from(new Set(tokens));
}
function splitTokens(tokens) {
  const wordTokens = [], numTokens  = [];
  for (const t of tokens) (/^\d{1,4}$/.test(t) ? numTokens : wordTokens).push(t);
  return { wordTokens, numTokens };
}

/* números exatos + janelas jurídicas */
const KW_RX = /\b(art\.?|artigo|s[uú]mula)\b/iu;
const KW_ART_RX = /^\s*(art\.?|artigo)\b/i;
const KW_SUM_RX = /^\s*s[uú]mula\b/i;

function hasExactNumber(bag, n) {
  const bagNum = stripThousandDots(bag);
  const rx = new RegExp(`(?:^|\\D)${n}(?:\\D|$)`, "g");
  return rx.test(bagNum);
}
function numberRespectsWindows(text, n, queryMode) {
  const raw = String(text);
  const nearRx = new RegExp(String.raw`\b(art\.?|artigo|s[uú]mula)\b[^0-9a-zA-Z]{0,12}(${n})(?:\b|[^0-9])`, "i");
  const nearOK = nearRx.test(stripThousandDots(raw));
  if (!nearOK) return false;

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

/* parsing de arquivos */
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
    text: full,
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

/* ---------- Busca ---------- */
els.form?.addEventListener("submit", (e) => { e.preventDefault(); doSearch(); });
els.q?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } });

function detectQueryMode(normQuery) {
  const trimmed = normQuery.trim();
  if (/^(art\.?\b|artigo\b)/i.test(trimmed)) return "art";
  if (/^s[uú]mula\b/i.test(trimmed)) return "sumula";
  return null;
}
function getBagWords(bag) { return bag.match(/\b[a-z0-9]{3,}\b/g) || []; }
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
  for (const w of words) for (const v of vars) if (withinOneSubstitutionStrict(v, w)) return true;
  return false;
}
function hasAllWordTokens(bag, wordTokens) {
  return wordTokens.every((w) => bagHasTokenWord(bag, w));
}
function matchesNumbers(item, numTokens, queryHasLegalKeyword, queryMode) {
  if (!numTokens.length) return true;
  const bag = norm(stripThousandDots(item.text));
  if (!queryHasLegalKeyword) return numTokens.every((n) => hasExactNumber(bag, n));
  return numTokens.every((n) => numberRespectsWindows(item.text, n, queryMode));
}

async function doSearch() {
  const termRaw = (els.q.value || "").trim();
  if (!termRaw) return;

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
    const queryMode = detectQueryMode(normQuery);
    const codeInfo = detectCodeFromQuery(normQuery);

    let tokens = tokenize(normQuery);
    if (!tokens.length) {
      skel.remove();
      renderBlock(termRaw, [], []);
      toast("Use palavras com 3+ letras ou números (1–4 dígitos).");
      return;
    }
    if (codeInfo) tokens = tokens.filter((tk) => !codeInfo.keyWords.has(tk));

    const queryHasLegalKeyword = KW_RX.test(normQuery);
    const { wordTokens, numTokens } = splitTokens(tokens);

    let allOptions = Array.from(els.codeSelect?.querySelectorAll("option") || [])
      .map((o) => ({ url: (o.value || "").trim(), label: (o.textContent || "").trim() }))
      .filter((o) => o.url);

    if (codeInfo) {
      allOptions = allOptions.filter((o) => o.label === codeInfo.label);
      if (!allOptions.length) toast(`Não achei o arquivo para “${codeInfo.label}”. Confira o rótulo do catálogo.`);
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

/* ---------- renderização ---------- */
function highlight(text, tokens) {
  if (!tokens?.length) return escHTML(text || "");
  const srcEsc = escHTML(text || "");
  const srcNFD = srcEsc.normalize("NFD");
  const toDiacriticRx = (t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\p{L}/gu, (ch) => ch + "\\p{M}*");
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

  const groupsMap = new Map();
  for (const it of items) {
    const label = it.source || "Outros";
    if (!groupsMap.has(label)) groupsMap.set(label, []);
    groupsMap.get(label).push(it);
  }

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

function renderCard(item, tokens = [], ctx = { context: "results" }) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = item.id;
  if (item.source) card.setAttribute("data-source", item.source);

  const left = document.createElement("div");

  if (item.source && ctx.context !== "reader") {
    const pill = document.createElement("a");
    pill.href = "#";
    pill.className = "pill";
    pill.textContent = `📘 ${item.source} (abrir)`;
    pill.addEventListener("click", (e) => { e.preventDefault(); openReader(item); });
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

  /* ---- botão de expandir (seta) — à ESQUERDA ---- */
  const text = (item.text || "").trim();
  const hasExpandable =
    (ctx?.context !== "reader") &&
    (text.length > CARD_CHAR_LIMIT || (item.body && item.body.trim().length > 0));

  if (hasExpandable) {
    const toggle = document.createElement("button");
    toggle.className = "toggle";
    toggle.textContent = "▼";
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", expanded ? "false" : "true");
      toggle.textContent = expanded ? "▼" : "▲";
      body.innerHTML = expanded ? truncatedHTML(item.text, tokens)
                                : highlight(item.text, tokens);
      body.classList.toggle("is-collapsed", expanded);
    });
    actions.append(toggle);
  }

  /* ---- AI-Hub à DIREITA + barra horizontal para a ESQUERDA ---- */
  const aiMenu = document.createElement("div");
  aiMenu.className = "ai-menu";

  const aiTrigger = document.createElement("button");
  aiTrigger.className = "btn btn--icon ai-trigger";
  aiTrigger.setAttribute("aria-label", "Abrir atalhos de I.A.");
  aiTrigger.setAttribute("aria-expanded", "false");
  aiTrigger.innerHTML = `<img src="icons/ai-hub.png" alt="">`;

  const aiBar = document.createElement("div");
  aiBar.className = "ai-bar";
  aiBar.setAttribute("role", "menu");
  aiBar.setAttribute("aria-hidden", "true");

  const iaButtons = [
    { label: "Abrir no ChatGPT",    icon: "icons/ai-chatgpt.png" },
    { label: "Abrir no Gemini",     icon: "icons/ai-gemini.png" },
    { label: "Abrir no Copilot",    icon: "icons/ai-copilot.png" },
    { label: "Abrir no Perplexity", icon: "icons/ai-perplexity.png" },
  ];

  iaButtons.forEach(({ label, icon }) => {
    const a = document.createElement("a");
    a.href = "#";
    a.className = `btn btn--icon ai-item`;
    a.setAttribute("aria-label", label);
    a.innerHTML = `<img src="${icon}" alt="">`;
    a.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); /* links virão depois */ });
    aiBar.appendChild(a);
  });

  aiMenu.append(aiTrigger, aiBar);
  actions.append(aiMenu); // fica à direita (CSS margin-left:auto no .ai-menu)

  // abrir/fechar
  const closeMenu = () => {
    aiMenu.classList.remove("is-open");
    aiTrigger.setAttribute("aria-expanded", "false");
    aiBar.setAttribute("aria-hidden", "true");
  };
  aiTrigger.addEventListener("click", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const isOpen = aiMenu.classList.toggle("is-open");
    aiTrigger.setAttribute("aria-expanded", String(isOpen));
    aiBar.setAttribute("aria-hidden", String(!isOpen));
  });
  document.addEventListener("click", (ev) => { if (!aiMenu.contains(ev.target)) closeMenu(); });
  aiMenu.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeMenu(); });

  left.append(body, actions);
  card.append(left);
  return card;
}

/* ---------- Leitor (modal) ---------- */
async function openReader(item, tokens = []) {
  els.readerTitle && (els.readerTitle.textContent = item.source);
  els.readerBody && (els.readerBody.innerHTML = "");
  showModal(els.readerModal);

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

/* ---------- MODAIS (apenas leitor) ---------- */
function showModal(el) { if (el) { el.hidden = false; document.body.style.overflow = "hidden"; } }
function hideModal(el) { if (el) { el.hidden = true; document.body.style.overflow = ""; } }

document.addEventListener("click", (e) => {
  if (e.target.matches("[data-close-modal]")) hideModal(els.readerModal);
  if (els.readerModal && e.target === els.readerModal.querySelector(".modal-backdrop")) hideModal(els.readerModal);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (els.readerModal && !els.readerModal.hidden) hideModal(els.readerModal);
  }
});

/* ---------- logo: reset ---------- */
els.brand?.addEventListener("click", () => {
  els.q && (els.q.value = "");
  els.stack && (els.stack.innerHTML = "");
  els.q?.focus();
  toast("Busca reiniciada.");
});
