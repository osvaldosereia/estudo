/* =========================================================
   direito.love — app.js (versão revisada completa)
   - UX/UI alinhado com: TopBar minimalista + Barra Menu (Fav, Arquivos, Busca)
   - Modal "Arquivos" com Categorias → Arquivos
   - Busca só com arquivo aberto; em Favoritos: "Selecione um arquivo para buscar."
   - FAB/hambúrguer secundário alterna "⭐ Favoritar" ↔ "⭐ Remover"
   - Parser e renderização inclusos (cards)
   - Título de página dinâmico
========================================================= */

/* =================== PWA =================== */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => console.log("✅ SW", reg.scope))
      .catch((err) => console.error("❌ SW", err));
  });
}
// Evita prompt automático (PWA)
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); });

/* =================== Elements =================== */
const els = {
  // Topbar
  brandBtn: document.getElementById("brandBtn"),
  infoBtn: document.getElementById("infoBtn"),
  infoModal: document.getElementById("infoModal"),
  closeInfo: document.getElementById("closeInfo"),

  // Barra Menu
  favTab: document.getElementById("favTab"),
  catTab: document.getElementById("catTab"),
  filebarInner: document.getElementById("filebarInner"),

  // Busca
  searchInput: document.getElementById("searchInput"),
  searchSpinner: document.getElementById("searchSpinner"),
  clearSearch: document.getElementById("clearSearch"),
  searchSuggest: document.getElementById("searchSuggest"),

  // Mini finder
  finderPop: document.getElementById("finderPop"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  closeFinder: document.getElementById("closeFinder"),
  count: document.getElementById("count"),

  // Conteúdo
  pageTitle: document.getElementById("pageTitle"),
  articles: document.getElementById("articles"),
  codeSelect: document.getElementById("codeSelect"),

  // Modal Categorias
  catBackdrop: document.getElementById("catBackdrop"),
  closeCat: document.getElementById("closeCat"),
  catGrid: document.getElementById("catGrid"),

  // FAB e menu de ações (hambúrguer secundário)
  actionFab: document.getElementById("actionFab"),
  actionMenu: document.getElementById("actionMenu"),
  actionContext: document.getElementById("actionContext"),

  // Outros opcionais
  studyModal: document.getElementById("studyModal"),
  closeStudy: document.getElementById("closeStudy"),
  modalTitle: document.getElementById("modalTitle"),
  studySub: document.getElementById("studySub"),
  promptPreview: document.getElementById("promptPreview"),
  copyPromptBtn: document.getElementById("copyPromptBtn"),

  moreMenu: document.getElementById("moreMenu"),
  toast: document.getElementById("toast"),
};
els.indexToggle = null;
els.indexPanel = null;

/* =================== Estado + Storage =================== */
const state = {
  mode: "favorites", // "favorites" | "file"
  currentFileUrl: null,
  currentFileLabel: "",
  rawText: "",
  items: [],     // headings + articles
  articles: [],  // somente artigos
  currentArticleIdx: -1,

  // busca
  currentTokens: [],
  matchArticles: [],
  matchIdx: -1,

  // caches
  cache: new Map(),
  urlToLabel: new Map(),
};

const store = {
  get(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },

  keyFav: "dl_favorites",
  keyStud: "dl_studied",
  keyLast: "dl_last_view",

  makeId: (fileUrl, htmlId) => `${fileUrl}::${htmlId}`,

  listFavorites() { return store.get(store.keyFav, []); },
  isFavorite(id) { return store.listFavorites().some((e) => e.id === id); },
  addFavorite(entry) {
    if (!entry || !entry.id || !entry.text) return;
    const list = store.listFavorites().filter((e) => e.id !== entry.id);
    list.unshift({ ...entry, ts: Date.now() });
    store.set(store.keyFav, list);
  },
  removeFavorite(id) {
    const list = store.listFavorites().filter((e) => e.id !== id);
    store.set(store.keyFav, list);
  },

  listStudied() { return store.get(store.keyStud, []); },
  markStudied(entry) {
    if (!entry || !entry.id || !entry.text) return;
    let list = store.listStudied().filter((e) => e.id !== entry.id);
    list.unshift({ ...entry, ts: Date.now() });
    if (list.length > 50) list = list.slice(0, 50);
    store.set(store.keyStud, list);
  },
  isStudied(id) { return store.listStudied().some((e) => e.id === id); },

  saveLast(partial) {
    const prev = store.get(store.keyLast, {});
    const next = { ...prev, ...partial, ts: Date.now() };
    store.set(store.keyLast, next);
  },
  getLast() { return store.get(store.keyLast, null); },
  clearLast() { localStorage.removeItem(store.keyLast); },
};

/* =================== Utils =================== */
function notify(msg = "Ok!") {
  if (els.toast) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    setTimeout(() => els.toast.classList.remove("show"), 1200);
  } else {
    console.log("ℹ️", msg);
  }
}
function setPageTitle(text){
  const el = els.pageTitle;
  if (!el) return;
  if (!text){ el.style.display="none"; el.textContent=""; return; }
  el.style.display="block"; el.textContent=text;
}
async function withBusy(btn, fn) {
  if (btn && btn.classList.contains("busy")) return;
  if (btn) btn.classList.add("busy");
  try {
    const min = 220, t0 = performance.now();
    const res = await fn();
    const dt = performance.now() - t0;
    if (dt < min) await new Promise((r) => setTimeout(r, min - dt));
    return res;
  } finally {
    if (btn) btn.classList.remove("busy");
  }
}
const sanitizeForLayout = (s) =>
  (s || "").replace(/\u00A0/g, " ").replace(/\t/g, " ").replace(/[ \t]+\n/g, "\n").trim();
function norm(s) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/g, "c")
    .replace(/(\d)[.,](?=\d)/g, "$1")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
const sortByTsDesc = (arr)=>[...arr].sort((a,b)=>(b.ts||0)-(a.ts||0));

/* =================== Catálogo =================== */
function buildCatalogMaps() {
  const sel = els.codeSelect;
  if (!sel) return;
  state.urlToLabel.clear();
  sel.querySelectorAll("option").forEach((opt) => {
    const url = opt.value?.trim();
    const label = opt.textContent?.trim();
    if (url) state.urlToLabel.set(url, label);
  });
}
function getCatalogByCategory() {
  const map = new Map();
  const sel = els.codeSelect;
  if (!sel) return map;
  sel.querySelectorAll("optgroup").forEach((og) => {
    const cat = og.getAttribute("label")?.trim() || "Outros";
    const arr = [];
    og.querySelectorAll("option").forEach((opt) => {
      const url = opt.value?.trim();
      const label = opt.textContent?.trim();
      if (url) arr.push({ url, label });
    });
    map.set(cat, arr);
  });
  return map;
}
function getAllOptions() {
  if (!els.codeSelect) return [];
  return [...els.codeSelect.querySelectorAll("option")];
}
function getOptionsByCategory(catLabel){
  if (!els.codeSelect) return [];
  const og = [...els.codeSelect.querySelectorAll("optgroup")]
    .find((g) => (g.getAttribute("label")||"").trim() === catLabel);
  return og ? [...og.querySelectorAll("option")] : [];
}

/* =================== Parser (completo e independente) =================== */
// Divide texto pelos separadores "-----" (em linha própria)
function splitIntoBlocks(txt){
  const cleaned = sanitizeForLayout(
    (txt || "")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
  );
  const parts = cleaned.split(/^\s*-{5,}\s*$/m).map(s => s.trim());
  return parts.filter(Boolean);
}

// Constrói um item "article" simples a partir de um bloco
function parseBlockToItem(block, idx, fileLabel = "Documento"){
  const lines = (block || "").split(/\n/).map(l => l.trim());
  const filtered = lines.filter(Boolean);
  const titleLine = filtered[0] || `Artigo ${idx+1}`;
  const body = filtered.slice(1).join("\n").trim();

  return {
    kind: "article",
    title: titleLine,
    text: block,
    htmlId: `art-${idx}`,
    _split: {
      supra: [],
      epigrafe: "",
      titleText: titleLine,
      body: body || block
    },
    _aidx: idx,
    fileLabel
  };
}

// Parser por URL — hoje igual para todo mundo (padrão "-----")
function parseByUrl(url, txt){
  const blocks = splitIntoBlocks(txt);
  if (!blocks.length) return [parseBlockToItem(txt, 0)];
  return blocks.map((b, i) => parseBlockToItem(b, i, state.urlToLabel.get(url) || "Documento"));
}

/* =================== Render =================== */
function buildArticleElement(item){
  const el = document.createElement("article");
  el.className = "card";
  el.id = item.htmlId;
  el.dataset.idx = item._aidx ?? 0;
  el.dataset.fileLabel = state.currentFileLabel || item.fileLabel || "Documento";
  el.dataset.fileUrl   = state.currentFileUrl || "";

  const header = document.createElement("header");
  header.innerHTML = (item._split?.titleText || item.title || "Artigo");

  const epigrafe = document.createElement("div");
  epigrafe.className = "card-epigrafe";
  const epi = (item._split?.epigrafe || "").trim();
  if (epi) epigrafe.textContent = epi; else epigrafe.style.display = "none";

  const body = document.createElement("div");
  body.className = "card-body";
  body.innerHTML = (item._split?.body || item.text || "")
    .replace(/\n{2,}/g, "\n\n")
    .replace(/\n/g, "<br>");

  const actions = document.createElement("div");
  actions.className = "card-actions";
  const fav = document.createElement("button");
  fav.className = "icon-btn";
  fav.dataset.action = "fav";
  fav.textContent = "⭐";
  fav.title = "Favoritar";
  fav.addEventListener("click", ()=>{
    const id = store.makeId(el.dataset.fileUrl, el.id);
    if (store.isFavorite(id)){
      store.removeFavorite(id);
      fav.classList.remove("active");
      notify("⭐ Removido dos favoritos");
      if (state.mode === "favorites") renderFavorites();
    } else {
      store.addFavorite({
        id,
        fileUrl: el.dataset.fileUrl,
        fileLabel: el.dataset.fileLabel,
        htmlId: el.id,
        text: item.text
      });
      fav.classList.add("active");
      notify("⭐ Adicionado aos favoritos");
    }
    updateActionPreview();
  });
  actions.appendChild(fav);

  el.appendChild(header);
  el.appendChild(epigrafe);
  el.appendChild(body);
  el.appendChild(actions);
  return el;
}

function clearArticles(){ if (els.articles) els.articles.innerHTML=""; }

function renderFileItemsProgressive(items){
  if (!els.articles) return;
  const frag = document.createDocumentFragment();
  items.forEach(it=>{
    if (it.kind === "article"){
      frag.appendChild(buildArticleElement(it));
    }
  });
  els.articles.innerHTML = "";
  els.articles.appendChild(frag);
  const first = els.articles.querySelector("article.card");
  if (first) first.classList.add("in-view");
}

function renderFileItemsAll(items){
  // para esta versão, o "all" = mesmo do progressive
  renderFileItemsProgressive(items);
}

/* highlight para busca */
function highlightTextNodes(root, tokens){
  if (!root || !tokens?.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  texts.forEach(node=>{
    const t = node.nodeValue;
    if (!t || !t.trim()) return;
    let html = t;
    tokens.forEach(tok=>{
      if (!tok) return;
      const re = new RegExp(`(${tok.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')})`, "gi");
      html = html.replace(re, "<strong>$1</strong>");
    });
    if (html !== t){
      const span = document.createElement("span");
      span.innerHTML = html;
      node.parentNode.replaceChild(span, node);
    }
  });
}

/* =================== Seleção do artigo visível =================== */
function updateCurrentOutline(){
  const nodes = [...document.querySelectorAll("article[data-idx]")];
  if (!nodes.length) return;
  const topbar = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 48;
  const filebar = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--filebar-h")) || 56;
  const y = window.scrollY + topbar + filebar + 24;
  let targetIdx = -1;
  for (let i = 0; i < nodes.length; i++){
    const r = nodes[i].getBoundingClientRect();
    const absTop = r.top + window.scrollY;
    if (absTop >= y){ targetIdx = i; break; }
  }
  if (targetIdx === -1) targetIdx = nodes.length - 1;
  if (state.currentArticleIdx === targetIdx) return;

  nodes.forEach((n) => n.classList.remove("in-view"));
  nodes[targetIdx].classList.add("in-view");
  state.currentArticleIdx = targetIdx;

  const art = nodes[targetIdx];
  store.saveLast({
    mode: state.mode,
    fileUrl: state.currentFileUrl,
    articleId: art?.id || null,
    scrollY: window.scrollY || 0,
  });

  updateActionPreview();
}

/* =================== Índice (≡) opcional =================== */
function removeIndexUI(){
  if (els.indexToggle){ els.indexToggle.remove(); els.indexToggle=null; }
  if (els.indexPanel){ els.indexPanel.remove(); els.indexPanel=null; }
}
function buildIndexButton(){
  removeIndexUI();
  if (state.mode!=="file") return;

  const btn=document.createElement("button");
  btn.className="index-toggle";
  btn.type="button";
  btn.setAttribute("aria-label","Abrir índice do documento");
  btn.textContent="≡";
  document.body.appendChild(btn);
  els.indexToggle=btn;

  const panel=document.createElement("aside");
  panel.className="index-panel";
  document.body.appendChild(panel);
  els.indexPanel=panel;

  btn.addEventListener("click", ()=> panel.classList.toggle("show"));
}

/* =================== Filebar tabs helper (simples) =================== */
function arrangeTabsWithMore(wrap, tabs){
  // Nesta versão, apenas insere todos (a barra de arquivos está oculta no CSS).
  tabs.forEach(b => wrap.appendChild(b));
}

/* =================== Abrir arquivo =================== */
function addNormalizedFieldToArticles(items){
  const arts=items.filter(it=>it.kind==="article");
  arts.forEach((a)=>{
    const s=a._split || {};
    const combo=[s.titleText||"", s.epigrafe||"", ...(s.supra||[]), s.body||""].join(" ");
    a._norm = norm(combo);
  });
  return arts;
}

async function fetchTextCached(url){
  if (state.cache.has(url)) return state.cache.get(url);
  const res=await fetch(url, { cache:"no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
  const txt=sanitizeForLayout(await res.text());
  state.cache.set(url, txt);
  return txt;
}

async function loadFile(url, tabBtn){
  if (!url) return;
  await withBusy(tabBtn, async ()=>{
    els.searchSpinner?.classList.add("show");
    try{
      const txt=await fetchTextCached(url);
      state.rawText=txt;
      const items=parseByUrl(url, txt);
      state.currentFileUrl=url;
      state.currentFileLabel=state.urlToLabel.get(url) || "Documento";
      setPageTitle("Arquivo: " + state.currentFileLabel);
      state.items=items;
      state.articles=addNormalizedFieldToArticles(items);
      state.mode="file";

      document.querySelectorAll(".tab").forEach((t)=>t.classList.remove("active"));
      if (tabBtn) tabBtn.classList.add("active");

      renderFileItemsProgressive(items);
      buildIndexButton();
      rebuildSuggestionsIndex();
      store.saveLast({ mode:"file", fileUrl:url, articleId:null, scrollY:0 });
      window.scrollTo({ top:0, behavior:"instant" });
    } catch(err){
      console.error(err);
      notify("Falha ao carregar arquivo.");
    } finally{
      els.searchSpinner?.classList.remove("show");
    }
  });
}

/* =================== Favoritos =================== */
function renderFavorites(){
  clearArticles();
  setPageTitle("Favoritos");
  const favs=store.listFavorites();
  if (!favs.length){
    if (els.articles)
      els.articles.innerHTML='<div style="padding:24px; color:#6c7282; text-align:center;">⭐ Nada nos favoritos ainda.</div>';
    removeIndexUI(); return;
  }
  const order=getAllOptions().map(o=>o.value);
  const byFile=new Map();
  favs.forEach((f)=>{
    const key=f.fileLabel||f.fileUrl||"Arquivo";
    if (!byFile.has(key)) byFile.set(key,[]);
    byFile.get(key).push(f);
  });
  for (const [k,arr] of byFile.entries()) byFile.set(k, sortByTsDesc(arr));

  const groups = [...byFile.entries()].sort((a,b)=>{
    const aUrl=(favs.find(x=>x.fileLabel===a[0])||{}).fileUrl;
    const bUrl=(favs.find(x=>x.fileLabel===b[0])||{}).fileUrl;
    const ai = Math.max(0, order.indexOf(aUrl));
    const bi = Math.max(0, order.indexOf(bUrl));
    return ai - bi;
  });

  const frag=document.createDocumentFragment();
  let idx=0;
  groups.forEach(([fileLabel, arr])=>{
    const h=document.createElement("h3");
    h.className="group";
    h.textContent=fileLabel;
    frag.appendChild(h);
    arr.forEach((entry)=>{
      const item = {
        kind:"article",
        title: entry.text.split("\n")[0] || "Artigo",
        text: entry.text,
        _split: { supra:[], titleText: entry.text.split("\n")[0] || "Artigo", body: entry.text, epigrafe:"" },
        htmlId: entry.htmlId || `fav-${idx}`,
        _aidx: idx
      };
      const el=buildArticleElement(item);
      el.dataset.fileUrl=entry.fileUrl; el.dataset.fileLabel=entry.fileLabel;

      // marca favorito ativo
      const favBtn=el.querySelector('.icon-btn[data-action="fav"]');
      const id=store.makeId(entry.fileUrl, el.id);
      if (store.isFavorite(id)) favBtn?.classList.add("active");

      frag.appendChild(el);
      idx++;
    });
  });

  if (els.articles){
    els.articles.innerHTML="";
    els.articles.appendChild(frag);
  }
  removeIndexUI();
}

/* =================== Sugestões e Busca =================== */
let suggestActiveIndex = -1;
let suggestionsData = []; // {id, title, htmlId}

function rebuildSuggestionsIndex(){
  suggestionsData = state.articles.map(a=>{
    const t   = a._split?.titleText || a.title || "";
    const epi = a._split?.epigrafe   || "";
    const title = (t || epi || "Artigo").replace(/<\/?(strong|b)>/gi,"").trim();
    return { id:a.htmlId, title, htmlId:a.htmlId };
  });
}
function buildQueryTokens(q) {
  return (q || "")
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(tok => (/\d/.test(tok) ? tok.length >= 1 : tok.length >= 3))
    .map(norm);
}
function highlightQuery(text, qOrTokens) {
  const tokens = Array.isArray(qOrTokens) ? qOrTokens : buildQueryTokens(qOrTokens);
  if (!tokens.length) return text;
  return text.replace(/([\p{L}\p{N}]+)/gu, (w) => {
    const hit = tokens.some(t => norm(w).includes(t));
    return hit ? `<strong>${w}</strong>` : w;
  });
}
function renderSuggestions(list, tokens) {
  const box = els.searchSuggest;
  if (!box) return;
  box.innerHTML = "";
  if (!list.length) { box.classList.remove("show"); return; }

  const frag = document.createDocumentFragment();
  list.slice(0, 8).forEach((it, i) => {
    const btn = document.createElement("button");
    btn.className = "suggest-item" + (i === suggestActiveIndex ? " active" : "");
    btn.setAttribute("role", "option");
    btn.type = "button";
    btn.dataset.htmlId = it.htmlId;
    const t = it.title || "Artigo";
    btn.innerHTML = `<div class="sline">${highlightQuery(t, tokens)}</div>`;
    btn.addEventListener("click", ()=>{
      jumpToArticle(it.htmlId);
      box.classList.remove("show");
    });
    frag.appendChild(btn);
  });

  box.appendChild(frag);
  box.classList.add("show");
}
function toggleClear(){ if (els.clearSearch && els.searchInput) els.clearSearch.classList.toggle("show", !!els.searchInput.value); }

/* Input da busca */
function onSearchInput(){
  toggleClear();
  const q = (els.searchInput?.value || "");
  if (state.mode !== "file"){
    els.searchSuggest?.classList.remove("show");
    if (q.trim()) notify("Selecione um arquivo para buscar.");
    return;
  }

  const tokens = buildQueryTokens(q);
  if (!tokens.length){
    renderFileItemsProgressive(state.items);
    state.matchArticles = []; state.matchIdx = -1;
    if (els.count) els.count.textContent = "0/0";
    els.searchSuggest?.classList.remove("show");
    return;
  }

  els.searchSpinner?.classList.add("show");
  try{
    state.currentTokens = tokens;

    // AND entre os tokens
    const matchedMeta = state.articles.filter(a => tokens.every(t => a._norm.includes(t)));

    renderFileItemsAll(state.items);

    requestAnimationFrame(()=>{
      // destaca palavras
      matchedMeta.forEach((m)=>{
        const art = document.getElementById(m.htmlId);
        if (art) highlightTextNodes(art, tokens);
      });

      // cria a lista de nós dos artigos encontrados
      state.matchArticles = matchedMeta.map(m => document.getElementById(m.htmlId)).filter(Boolean);

      // navega para o primeiro, se houver
      if (state.matchArticles.length){
        state.matchIdx = 0;
        const art = state.matchArticles[0];
        art.scrollIntoView({ behavior:"smooth", block:"center" });
      } else {
        state.matchIdx = -1;
      }

      updateCount();
      rebuildSuggestionsIndex();
      // sugestões baseadas no título
      const list = suggestionsData.filter(s => tokens.every(t => norm(s.title).includes(t)));
      suggestActiveIndex = -1;
      renderSuggestions(list, tokens);
    });
  } finally {
    els.searchSpinner?.classList.remove("show");
  }
}

/* Contador e navegação entre ocorrências */
function updateCount(){
  if (!els.count) return;
  if (!state.matchArticles?.length){ els.count.textContent = "0/0"; return; }
  els.count.textContent = `${state.matchIdx+1}/${state.matchArticles.length}`;
}
function gotoNext(){
  if (!state.matchArticles?.length) return;
  state.matchIdx = (state.matchIdx + 1) % state.matchArticles.length;
  const art = state.matchArticles[state.matchIdx];
  art.scrollIntoView({ behavior:"smooth", block:"center" });
  updateCount(); updateCurrentOutline();
}
function gotoPrev(){
  if (!state.matchArticles?.length) return;
  state.matchIdx = (state.matchIdx - 1 + state.matchArticles.length) % state.matchArticles.length;
  const art = state.matchArticles[state.matchIdx];
  art.scrollIntoView({ behavior:"smooth", block:"center" });
  updateCount(); updateCurrentOutline();
}

/* =================== Mini Finder (float) =================== */
els.prevBtn?.addEventListener("click", gotoPrev);
els.nextBtn?.addEventListener("click", gotoNext);
els.closeFinder?.addEventListener("click", ()=> els.finderPop?.classList.remove("show"));

/* =================== Topbar/Favoritos =================== */
els.brandBtn?.addEventListener("click", ()=>{
  document.querySelectorAll(".tab").forEach(c=>c.classList.remove("active"));
  els.favTab?.classList.add("active");
  state.mode="favorites"; renderFavorites(); window.scrollTo({top:0, behavior:"instant"});
});
els.favTab?.addEventListener("click", ()=>{
  document.querySelectorAll(".tab").forEach(c=>c.classList.remove("active"));
  els.favTab?.classList.add("active"); state.mode="favorites"; renderFavorites();
});

/* Busca UI */
els.searchInput?.addEventListener("input", onSearchInput);
toggleClear();

els.searchInput?.addEventListener("focus", ()=>{
  if (window.matchMedia("(max-width: 768px)").matches) document.body.classList.add("search-open");
  els.finderPop?.classList.add("show");
});
els.searchInput?.addEventListener("blur", ()=>{
  if (window.matchMedia("(max-width: 768px)").matches) document.body.classList.remove("search-open");
});
els.clearSearch?.addEventListener("click", ()=>{
  if (!els.searchInput) return;
  els.searchInput.value="";
  els.searchSuggest?.classList.remove("show");
  toggleClear();
  if (state.mode==="file") {
    renderFileItemsProgressive(state.items);
    state.matchArticles=[]; state.matchIdx=-1; updateCount();
  }
});
els.searchInput?.addEventListener("keydown", (e)=>{
  const box = els.searchSuggest;
  if (box?.classList.contains("show")){
    if (e.key==="ArrowDown" || e.key==="ArrowUp"){
      e.preventDefault();
      const items = [...box.querySelectorAll(".suggest-item")]; if (!items.length) return;
      if (e.key==="ArrowDown") suggestActiveIndex=(suggestActiveIndex+1)%items.length;
      else suggestActiveIndex=(suggestActiveIndex-1+items.length)%items.length;
      items.forEach((n,i)=>n.classList.toggle("active", i===suggestActiveIndex));
      return;
    }
    if (e.key==="Enter" && suggestActiveIndex>=0){
      e.preventDefault();
      const sel=box.querySelectorAll(".suggest-item")[suggestActiveIndex];
      if (sel){ jumpToArticle(sel.dataset.htmlId); box.classList.remove("show"); return; }
    }
    if (e.key==="Escape"){
      box.classList.remove("show");
      return;
    }
  }
  if (e.key==="Escape"){
    els.searchInput.blur();
  }
});

/* =================== Pular para artigo =================== */
function jumpToArticle(htmlId){
  const el=document.getElementById(htmlId);
  if (!el) return;
  const topbar=parseInt(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h"))||48;
  const filebar=parseInt(getComputedStyle(document.documentElement).getPropertyValue("--filebar-h"))||56;
  const offset=topbar+filebar+12;
  const y=el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top:y, behavior:"smooth" });
  updateCurrentOutline();
}

/* =================== Modal de Categorias (Arquivos) =================== */
function openCatModal(){
  const catMap = getCatalogByCategory();
  if (!els.catGrid) return;
  els.catGrid.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const [cat, arr] of catMap.entries()){
    const g = document.createElement("div");
    g.className = "cat-group";
    const h = document.createElement("h4");
    h.className = "cat-h";
    h.textContent = cat;
    g.appendChild(h);

    const ul = document.createElement("div");
    ul.className = "cat-list";
    arr.forEach(({url,label})=>{
      const b=document.createElement("button");
      b.type="button"; b.className="cat-item"; b.textContent=label; b.title=label;
      b.addEventListener("click", ()=>{
        closeCatModal();
        const tabBtn=[...document.querySelectorAll(".tab")].find(t=>t.dataset.url===url) || null;
        loadFile(url, tabBtn); // ← carrega o arquivo ao clicar
      });
      ul.appendChild(b);
    });
    g.appendChild(ul);
    frag.appendChild(g);
  }
  els.catGrid.appendChild(frag);
  els.catBackdrop?.setAttribute("aria-hidden","false");
}
function closeCatModal(){ els.catBackdrop?.setAttribute("aria-hidden","true"); }

els.catTab?.addEventListener("click", openCatModal);
els.closeCat?.addEventListener("click", closeCatModal);
els.catBackdrop?.addEventListener("click", (e) => { if (e.target === els.catBackdrop) closeCatModal(); });

/* =================== IA (stubs seguros) =================== */
// Placeholders para evitar erros se o seu HTML não incluir esses modais
function buildPrompt(articleMeta){
  const title = articleMeta?._split?.titleText || articleMeta?.title || "Artigo";
  const body  = articleMeta?._split?.body || articleMeta?.text || "";
  return `Explique didaticamente o seguinte artigo:\n\n${title}\n\n${body}\n\n💚 direito.love`;
}
function openStudyModal(title, prompt){
  if (els.studyModal && els.modalTitle && els.promptPreview){
    els.modalTitle.textContent = title || "Artigo";
    els.promptPreview.value = prompt || "";
    els.studyModal.setAttribute("aria-hidden","false");
  } else {
    navigator.clipboard?.writeText(prompt || "").then(()=> notify("Prompt copiado."));
  }
}
els.copyPromptBtn?.addEventListener("click", ()=>{
  const text = els.promptPreview?.value || "";
  navigator.clipboard?.writeText(text).then(()=> notify("Prompt copiado."));
});
els.closeStudy?.addEventListener("click", ()=> els.studyModal?.setAttribute("aria-hidden","true"));

/* =================== Ações do FAB (hambúrguer secundário) =================== */
const actionFab = els.actionFab;
const actionMenu = els.actionMenu;

function getActiveArticle(){
  // Prioriza o .in-view
  let el = document.querySelector("article.in-view");
  if (!el){
    el = document.querySelector("article[data-idx]");
  }
  if (!el) return null;

  const idx  = Number(el.dataset.idx);
  const meta = state.articles.find(x => x._aidx === idx);
  return { el, meta };
}
function snippetFromArticle(el, max=32){
  if (!el) return "—";
  const raw = (el.querySelector("header")?.textContent || el.textContent || "")
    .replace(/\s+/g," ").trim();
  const cut = raw.length > max ? raw.slice(0, max) + "…" : raw;
  return `“${cut}”`;
}
function updateActionPreview(){
  if (!els.actionContext) return;
  const a = getActiveArticle();
  els.actionContext.textContent = snippetFromArticle(a?.el, 32);
  const favBtn = document.querySelector('#actionMenu [data-action="fav"]');
  if (favBtn && a?.el){
    const id = store.makeId(a.el.dataset.fileUrl, a.el.id);
    favBtn.textContent = store.isFavorite(id) ? "⭐ Remover" : "⭐ Favoritar";
  }
}
function toggleActionMenu(show){
  if (!actionMenu) return;
  if (show === undefined) show = !actionMenu.classList.contains("show");
  actionMenu.classList.toggle("show", show);
  actionMenu.setAttribute("aria-hidden", show ? "false" : "true");
  actionFab?.setAttribute("aria-expanded", show ? "true" : "false");
}
actionFab?.addEventListener("click", ()=>{
  updateActionPreview();
  toggleActionMenu();
});
actionFab?.addEventListener("keydown", (e)=>{
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    updateActionPreview();
    toggleActionMenu();
  }
});
document.addEventListener("click", (e)=>{
  if (!actionMenu) return;
  if (!actionMenu.contains(e.target) && e.target !== actionFab && !actionFab?.contains(e.target)){
    toggleActionMenu(false);
  }
});
window.addEventListener("scroll", ()=>{
  if (actionMenu?.classList.contains("show")) toggleActionMenu(false);
});

/* Clique nas ações do menu */
actionMenu?.addEventListener("click", async (ev)=>{
  const btn = ev.target.closest(".menu-btn");
  if (!btn) return;
  const action = btn.dataset.action;
  const a = getActiveArticle();
  if (!a?.el) { notify("Nenhum artigo ativo."); return; }

  const artEl = a.el;
  const meta  = a.meta;
  const id    = store.makeId(artEl.dataset.fileUrl, artEl.id);

  const entry = {
    id,
    fileUrl: artEl.dataset.fileUrl,
    fileLabel: artEl.dataset.fileLabel,
    htmlId: artEl.id,
    text: meta ? meta.text : (() => {
      const fav  = store.listFavorites().find(e => e.id === id);
      const stud = store.listStudied().find(e => e.id === id);
      return fav?.text || stud?.text || "";
    })(),
  };

  if (action === "study"){
    const useArticle = meta || (entry.text ? {
      text: entry.text,
      _split: { supra:[], titleText:"Artigo", body:entry.text, epigrafe:"" },
      title: "Artigo",
    } : null);
    if (!useArticle?.text){ notify("Não consegui capturar o texto deste artigo."); return; }
    const prompt = buildPrompt(useArticle);
    store.markStudied(entry);
    openStudyModal(useArticle._split?.titleText || useArticle.title || "Artigo", prompt);
    toggleActionMenu(false);
    return;
  }

  if (action === "fav"){
    if (store.isFavorite(id)){
      store.removeFavorite(id);
      notify("⭐ Removido dos favoritos");
      artEl.querySelector('.icon-btn[data-action="fav"]')?.classList.remove("active");
      if (state.mode === "favorites") { renderFavorites(); }
    } else {
      if (!entry.text){ notify("Abra o arquivo para favoritar este artigo."); return; }
      store.addFavorite(entry);
      notify("⭐ Adicionado aos favoritos");
      artEl.querySelector('.icon-btn[data-action="fav"]')?.classList.add("active");
    }
    updateActionPreview();
    toggleActionMenu(false);
    return;
  }

  if (action === "planalto"){
    // Link simples para a lei/código no Planalto (base por rótulo)
    const base = planaltoMap[artEl.dataset.fileLabel];
    const url = base || null;
    if (!url){ notify("Código/lei não mapeado para Planalto."); return; }
    window.open(url, "_blank", "noopener,noreferrer");
    toggleActionMenu(false);
    return;
  }
});

/* =================== Planalto (bases simples) =================== */
const planaltoMap = {
  "CF88": "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm",
  "Código Civil": "https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm",
  "Processo Civil": "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm",
  "Código Penal": "https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm",
  "Processo Penal": "https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689.htm",
  "CDC": "https://www.planalto.gov.br/ccivil_03/leis/l8078.htm",
  "CLT": "https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm",
  "Código Tributário Nacional": "https://www.planalto.gov.br/ccivil_03/leis/l5172.htm",
  "Código de Trânsito Brasileiro": "https://www.planalto.gov.br/ccivil_03/leis/l9503.htm",
  "Código Florestal": "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12651.htm",
  "Código Penal Militar": "https://www.planalto.gov.br/ccivil_03/decreto-lei/del1001.htm",
  "Lei Maria da Penha": "https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11340.htm",
  "Lei de Execução Penal": "https://www.planalto.gov.br/ccivil_03/leis/l7210.htm",
  "Lei de Drogas": "https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11343.htm",
  "Lei LGPD": "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm",
  "Marco Civil da Internet": "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm",
  "Lei dos Crimes Hediondos": "https://www.planalto.gov.br/ccivil_03/leis/l8072.htm",
  "ECA - Est. da Criança e Adolescente": "https://www.planalto.gov.br/ccivil_03/leis/l8069.htm",
  "Est. do Desarmamento": "https://www.planalto.gov.br/ccivil_03/leis/2003/l10826.htm",
  "Est. do Idoso": "https://www.planalto.gov.br/ccivil_03/leis/2003/l10741.htm",
  "Est. da Juventude": "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/lei/l12852.htm",
  "Est. da Pessoa com Deficiência": "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm",
  "Est. da Oab": "https://www.planalto.gov.br/ccivil_03/leis/l8906.htm"
};

/* =================== Teclado global =================== */
document.addEventListener("keydown", (e)=>{
  if (e.key === "F3" || (e.ctrlKey && e.key.toLowerCase() === "g")) { e.preventDefault(); gotoNext(); }
  if ((e.shiftKey && e.key === "F3") || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "g")) { e.preventDefault(); gotoPrev(); }
  if (e.key === "Escape"){ els.searchSuggest?.classList.remove("show"); }
});

/* =================== Restauração =================== */
function restoreViewAfterRender() {
  const last = store.getLast();
  if (!last) return;

  if (last.mode === "file" && last.articleId) {
    const el = document.getElementById(last.articleId);
    if (el) {
      const topbar = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 48;
      const filebar = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--filebar-h")) || 56;
      const offset = topbar + filebar + 12;
      const y = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: y, behavior: "instant" });
      updateCurrentOutline();
    }
  }
}

/* =================== Boot =================== */
function renderFilebar(category){
  // Mantemos a área oculta por CSS, mas deixo a função consistente
  const options = category==="Todos" ? getAllOptions() : getOptionsByCategory(category);
  const wrap = els.filebarInner;
  if (!wrap) return;
  wrap.innerHTML = "";

  const tabs = options.map((opt)=>{
    const btn = document.createElement("button");
    btn.className = "tab";
    btn.type = "button";
    btn.dataset.url = opt.value;
    btn.textContent = opt.textContent;
    btn.title = opt.textContent;
    btn.addEventListener("click", ()=> loadFile(opt.value, btn));
    return btn;
  });
  arrangeTabsWithMore(wrap, tabs);
}

async function boot() {
  buildCatalogMaps();
  renderFilebar("Todos"); // usamos o modal de categorias; esta linha apenas prepara eventuais tabs

  const last = store.getLast();
  if (last?.mode === "file" && last?.fileUrl) {
    const btn = [...(els.filebarInner?.querySelectorAll(".tab")||[])]
      .find((t) => t.dataset.url === last.fileUrl) || null;
    await loadFile(last.fileUrl, btn || null);
    restoreViewAfterRender();
  } else {
    els.favTab?.classList.add("active");
    renderFavorites();
    restoreViewAfterRender();
  }

  rebuildSuggestionsIndex();
  updateActionPreview();
}
boot();

/* =================== Scroll listener para artigo em foco =================== */
window.addEventListener("scroll", () => {
  if (state.mode === "file") updateCurrentOutline();
});
