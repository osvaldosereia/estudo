/* ==========================
   direito.love — app.js (2025-09 • fix UX/UI + restore Study)
   ========================== */

/* Service Worker (opcional) */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);
const escHTML = (s) => (s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm = (s) => (s || "").normalize("NFD").toLowerCase().replace(/\p{M}/gu,"");

/* ---------- elementos ---------- */
const els = {
  /* topo/busca */
  form: $("#searchForm"),
  q: $("#searchInput"),
  spinner: $("#searchSpinner"),
  stack: $("#resultsStack"),
  brand: $("#brandBtn"),
  codeSelect: $("#codeSelect"),

  /* chips (filtros) */
  chipsBar: $("#chipsBar"),
  chipsScroll: $("#chipsBar .chips-scroll"),
  chipsPrev: $("#chipsBar .chips-prev"),
  chipsNext: $("#chipsBar .chips-next"),

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
const PLANALTO_MAP = new Map([
  ["CF88","https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm"],
  ["Constituição Federal","https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm"],
  ["Código Civil","https://www.planalto.gov.br/ccivil_03/leis/2002/l10406.htm"],
  ["Processo Civil","https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm"],
  ["Código Penal","https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848.htm"],
  ["Processo Penal","https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689.htm"],
  ["Código de Processo Penal","https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689.htm"],
  ["Código de Processo Penal Militar","https://www.planalto.gov.br/ccivil_03/decreto-lei/del1002.htm"],
  ["CDC","https://www.planalto.gov.br/ccivil_03/leis/l8078.htm"],
  ["Código Eleitoral","https://www.planalto.gov.br/ccivil_03/leis/l4737.htm"],
  ["CLT","https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm"],
  ["Cód. Tributário Nacional","https://www.planalto.gov.br/ccivil_03/leis/l5172.htm"],
  ["Cód. Trânsito Brasileiro","https://www.planalto.gov.br/ccivil_03/leis/l9503.htm"],
  ["Código Florestal","https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12651.htm"]
]);

function extractArticleLabel(title){
  const m = (title||"").match(/Art\.?\s*(\d{1,4}[A-ZÀ-Úa-zà-ú\-]*)/);
  return m ? `Art. ${m[1]}` : null;
}
function planaltoUrlFor(item){
  const base = PLANALTO_MAP.get(item.source) || null;
  const art = extractArticleLabel(item.title || item.text || "");
  if (base && art){ return base; }
  const q = encodeURIComponent(`${extractArticleLabel(item.title||item.text||"")||""} ${item.source} site:planalto.gov.br`);
  return `https://www.google.com/search?q=${q}`;
}

const MAX_SEL = 6;
const CARD_CHAR_LIMIT = 250;

const state = {
  selected: new Map(),     // id -> item
  cacheParsed: new Map(),  // url -> items
};

/* ---------- toasts ---------- */
function toast(msg="OK", ms=1800){
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  els.toasts.appendChild(t);
  setTimeout(()=> t.remove(), ms);
}

/* ---------- texto -> blocos ---------- */
function splitBlocks(txt){
  const raw = (txt || "").replace(/\r\n?/g,"\n");
  return raw.split(/\n-{5,}\n/).map(s => s.trim()).filter(Boolean);
}
function fetchText(url){ return fetch(url).then(r=>r.text()); }

function parseBlock(block, idx, fileUrl, sourceLabel){
  const lines = (block || "").split(/\n+/);
  const first = (lines[0] || "").trim();
  const rest = lines.slice(1).join("\n").trim();
  const full = [first, rest].filter(Boolean).join("\n");
  return { id:`${fileUrl}::art-${idx}`, htmlId:`art-${idx}`, source:sourceLabel, title:first, body:rest, text:full, fileUrl };
}
async function parseFile(url, label) {
  if (state.cacheParsed.has(url)) return state.cacheParsed.get(url);
  const txt = await fetchText(url);
  const items = splitBlocks(txt).map((b,i)=> parseBlock(b,i,url,label));
  state.cacheParsed.set(url, items);
  return items;
}

/* ---------- "Respiros" para Leitor ---------- */
function addRespirationsForDisplay(s) {
  if (!s) return "";
  const RX_INCISO  = /^(?:[IVXLCDM]{1,8})(?:\s*(?:\)|\.|[-–—]))(?:\s+|$)/;
  const RX_PARAGR  = /^(?:§+\s*\d+\s*[ºo]?|Par[aá]grafo\s+(?:[Uu]nico|\d+)\s*[ºo]?)(?:\s*[:.\-–—])?(?:\s+|$)/i;
  const RX_ALINEA  = /^[a-z](?:\s*(?:\)|\.|[-–—]))(?:\s+|$)/;
  const RX_TITULO  = /^(?:T[ÍI]TULO|CAP[ÍI]TULO|SEÇÃO|SUBSEÇÃO|LIVRO)\b/i;

  return s.split("\n").map(line=>{
    if (RX_INCISO.test(line) || RX_PARAGR.test(line) || RX_ALINEA.test(line) || RX_TITULO.test(line)) return "\n"+line;
    return line;
  }).join("\n");
}

/* ---------- busca: tokens ---------- */
function splitTokens(tokens){ const wordTokens=[], numTokens=[]; for (const t of tokens){ if (/^\d{1,4}[a-z]?$/.test(t)) numTokens.push(t); else wordTokens.push(t);} return {wordTokens,numTokens}; }
function hasExactNumber(bag,n){ return new RegExp(`(?:^|\\D)${n}(?:\\D|$)`,"g").test(bag); }
function extractLegalRefs(text){
  const rx = /\b(art\.?|artigo|s[uú]mula)\b[^0-9a-zA-Z]{0,12}(\d{1,4}[a-zA-Z\-]?)\b/giu;
  const out = new Set(); let m;
  while ((m = rx.exec(text)) !== null) { const puro=(m[2]||"").toLowerCase().match(/^\d{1,4}/)?.[0]; if (puro) out.add(puro); }
  return out;
}
function bagHasTokenWord(bag, token) {
  const t = token.normalize("NFD").replace(/\p{M}/gu,"");
  return new RegExp(`\\b${t}\\b`, "i").test(bag);
}
function hasAllWordTokens(bag, wordTokens){ return wordTokens.every(w=> bagHasTokenWord(bag,w)); }
function matchesNumbers(item, numTokens, queryHasLegalKeyword){
  if (!numTokens.length) return true;
  const bag = norm(item.text);
  if (!queryHasLegalKeyword) return numTokens.every(n => hasExactNumber(bag, n));
  const near = extractLegalRefs(item.text);
  return numTokens.every(n => near.has(n));
}

/* ---------- busca ---------- */
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
  for (let i = 0; i < 2; i++) { const s = document.createElement("div"); s.className = "skel block"; skel.appendChild(s); }
  els.stack.appendChild(skel);
  els.spinner?.classList.add("show");

  try {
    const tokens = (term.split(/\s+/) || []).filter(Boolean);
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
          const okWords = hasAllWordTokens(bag, wordTokens);
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
    buildChips(results);
    toast(`${results.length} resultado(s) encontrados.`);
  } finally {
    els.stack.setAttribute("aria-busy", "false");
    els.spinner?.classList.remove("show");
    els.q?.select();
  }
}

/* ---------- chips (isolados) ---------- */
function buildChips(results){
  try{
    const set = new Set(results.map(r => r.source));
    const list = ["Todos", ...Array.from(set)];
    els.chipsScroll.innerHTML = "";
    list.forEach((name, i)=>{
      const b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.textContent = name;
      b.setAttribute("aria-pressed", i===0 ? "true" : "false");
      b.addEventListener("click", ()=>{
        for(const x of els.chipsScroll.querySelectorAll(".chip")) x.setAttribute("aria-pressed","false");
        b.setAttribute("aria-pressed","true");
        filterByChip(name);
      });
      els.chipsScroll.appendChild(b);
    });
    els.chipsBar.hidden = false;
    const scroll = els.chipsScroll;
    els.chipsPrev?.addEventListener("click", ()=> scroll.scrollBy({left:-200, behavior:"smooth"}));
    els.chipsNext?.addEventListener("click", ()=> scroll.scrollBy({left:200, behavior:"smooth"}));
  }catch(e){ console.warn("chips error", e); }
}
function filterByChip(name){
  const cards = els.stack.querySelectorAll(".card");
  if (!cards.length) return;
  if (name==="Todos"){ cards.forEach(c=> c.hidden = false); return; }
  cards.forEach(c=>{
    const pill = c.querySelector(".pill");
    const src = pill ? pill.textContent.trim() : "";
    c.hidden = (src !== name);
  });
}

/* ---------- render ---------- */
function highlight(text, tokens) {
  if (!tokens?.length) return escHTML(text || "");
  const srcEsc = escHTML(text || "");
  const srcNFD = srcEsc.normalize("NFD");
  const toDiacriticRx = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\p{L}/gu, (ch) => ch + "\\p{M}*");
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
  if (base.length > CARD_CHAR_LIMIT && cut > CARD_CHAR_LIMIT * 0.7) out = out.slice(0, cut) + "…";
  else if (base.length > CARD_CHAR_LIMIT) out = out.trim() + "…";
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
    if (collapsed) { body.innerHTML = truncatedHTML(item.text, tokens); toggle.textContent = "ver texto"; }
    else { body.innerHTML = highlight(item.text, tokens); toggle.textContent = "ocultar"; }
  });

  const consult = document.createElement("a");
  consult.className = "toggle alt";
  consult.textContent = "consultar";
  consult.href = "#";
  consult.addEventListener("click", (e)=>{e.preventDefault(); const url = planaltoUrlFor(item); window.open(url, "_blank","noopener");});

  left.append(pill, body, actions);
  actions.append(toggle, consult);

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

/* ---------- leitor ---------- */
function openReader(item){
  if (!item) return;
  els.readerTitle.textContent = item.title || "Leitor";
  els.readerBody.innerHTML = `<pre>${escHTML(addRespirationsForDisplay(item.text))}</pre>`;
  els.readerModal.hidden = false;
  els.readerBody.focus();
}
function hideModal(node){ if (node) node.hidden = true; }

/* ---------- selecionados / ações inferiores ---------- */
function updateBottom(){
  const n = state.selected.size;
  els.viewBtn.textContent = `${n} Selecionados – Ver`;
  els.studyBtn.disabled = n === 0;
  els.questionsBtn.disabled = n === 0;
  if (els.selCount) els.selCount.textContent = `${n}/${MAX_SEL}`;
}
function renderSelected(){
  els.selectedStack.innerHTML = "";
  for (const [_, a] of state.selected) {
    const row = document.createElement("article");
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
        row.remove();
        updateBottom();
      } else {
        if (state.selected.size >= MAX_SEL) { toast("⚠️ Limite de 6 blocos."); return; }
        state.selected.set(a.id, { ...a });
        toast(`Adicionado (${state.selected.size}/${MAX_SEL}).`);
      }
      sync();
    });

    const h = document.createElement("div");
    h.innerHTML = `<div class="pill">${a.source}</div><div class="body">${escHTML(a.title)}</div>`;
    row.append(h, chk);
    els.selectedStack.appendChild(row);
  }
}

/* ---------- eventos ---------- */
els.form?.addEventListener("submit", (e)=>{ e.preventDefault(); doSearch(); });
els.brand?.addEventListener("click", ()=>{ window.scrollTo({top:0, behavior:"smooth"}); });

els.viewBtn?.addEventListener("click", ()=>{ renderSelected(); els.selectedModal.hidden = false; });
els.studyBtn?.addEventListener("click", ()=>{ 
  // abrir modal de estudo (restaurado)
  renderSelected(); // usa a lista atual como base do prompt
  if (els.studyModal) els.studyModal.hidden = false; 
});
els.questionsBtn?.addEventListener("click", ()=>{ els.questionsModal.hidden = false; });

els.includeObsBtn?.addEventListener("click", ()=>{
  const v = (els.questionsObs?.value || "").trim();
  if (!v) { toast("Digite algo no campo para incluir."); return; }
  const li = document.createElement("li");
  li.textContent = v;
  els.questionsList.appendChild(li);
  els.questionsObs.value = "";
});

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

/* ---------- init ---------- */
updateBottom();
