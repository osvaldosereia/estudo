/* =================== PWA =================== */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => console.log("✅ SW", reg.scope))
      .catch((err) => console.error("❌ SW", err));
  });
}
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); });

/* =================== Refs =================== */
const els = {
  // Topbar
  brandBtn: document.getElementById("brandBtn"),
  infoBtn: document.getElementById("infoBtn"),
  infoModal: document.getElementById("infoModal"),
  closeInfo: document.getElementById("closeInfo"),

  // Barra secundária
  catTab: document.getElementById("catTab"),
  favTab: document.getElementById("favTab"),

  // Busca
  searchInput: document.getElementById("searchInput"),
  searchSpinner: document.getElementById("searchSpinner"),
  clearSearch: document.getElementById("clearSearch"),
  searchSuggest: document.getElementById("searchSuggest"),

  // Mini-finder
  finderPop: document.getElementById("finderPop"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  closeFinder: document.getElementById("closeFinder"),
  count: document.getElementById("count"),

  // Conteúdo
  fileLabel: document.getElementById("fileLabel"),
  articles: document.getElementById("articles"),

  // Catálogo
  codeSelect: document.getElementById("codeSelect"),

  // Modal estudo
  studyModal: document.getElementById("studyModal"),
  closeStudy: document.getElementById("closeStudy"),
  modalTitle: document.getElementById("modalTitle"),
  studySub: document.getElementById("studySub"),
  promptPreview: document.getElementById("promptPreview"),
  copyPromptBtn: document.getElementById("copyPromptBtn"),

  // Modais novos
  filesModal: document.getElementById("filesModal"),
  closeFiles: document.getElementById("closeFiles"),
  filesSearch: document.getElementById("filesSearch"),
  filesBody: document.getElementById("filesBody"),

  listsModal: document.getElementById("listsModal"),
  closeLists: document.getElementById("closeLists"),
  newListName: document.getElementById("newListName"),
  createListBtn: document.getElementById("createListBtn"),
  listsBody: document.getElementById("listsBody"),

  saveModal: document.getElementById("saveModal"),
  closeSave: document.getElementById("closeSave"),
  saveNewListName: document.getElementById("saveNewListName"),
  saveCreateListBtn: document.getElementById("saveCreateListBtn"),
  saveListsBody: document.getElementById("saveListsBody"),

  // Toast
  toast: document.getElementById("toast"),

  // Ações
  actionFab: document.getElementById("actionFab"),
  actionMenu: document.getElementById("actionMenu"),
  actionContext: document.getElementById("actionContext"),
  saveToListBtn: document.getElementById("saveToListBtn"),
};

/* =================== Estado + Storage =================== */
const state = {
  mode: "lists", // lists | file
  currentFileUrl: null,
  currentFileLabel: "",
  rawText: "",
  items: [],
  articles: [],
  currentArticleIdx: -1,

  currentTokens: [],
  matchArticles: [],
  matchIdx: -1,

  cache: new Map(),
  urlToLabel: new Map(),

  // buffer p/ “salvar em lista”
  pendingSave: null, // {id, htmlId, fileUrl, fileLabel, text}
};

const store = {
  get(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },

  // Listas
  keyLists: "dl_lists_v2", // {id, name, items:[{id, htmlId, fileUrl, fileLabel, text, ts}]}
  listLists() { return store.get(store.keyLists, []); },
  upsertLists(arr){ store.set(store.keyLists, arr); },
  createList(name){
    const lists = store.listLists();
    const id = "l_" + Math.random().toString(36).slice(2,9);
    lists.unshift({ id, name: (name||"Minha lista"), items: [], ts: Date.now() });
    store.upsertLists(lists);
    return id;
  },
  renameList(id, newName){
    const lists = store.listLists().map(l => l.id===id ? {...l, name:newName} : l);
    store.upsertLists(lists);
  },
  deleteList(id){
    const lists = store.listLists().filter(l => l.id!==id);
    store.upsertLists(lists);
  },
  clearList(id){
    const lists = store.listLists().map(l => l.id===id ? {...l, items: []} : l);
    store.upsertLists(lists);
  },
  addToList(listId, entry){
    if (!entry || !entry.id || !entry.text) return;
    const lists = store.listLists().map(l=>{
      if (l.id!==listId) return l;
      const items = l.items.filter(it=>it.id!==entry.id);
      items.unshift({ ...entry, ts: Date.now() });
      return { ...l, items };
    });
    store.upsertLists(lists);
  },
  removeFromList(listId, entryId){
    const lists = store.listLists().map(l=>{
      if (l.id!==listId) return l;
      return { ...l, items: l.items.filter(it=>it.id!==entryId) };
    });
    store.upsertLists(lists);
  },

  // “Último estado”
  keyLast: "dl_last_view",
  saveLast(partial) {
    const prev = store.get(store.keyLast, {});
    store.set(store.keyLast, { ...prev, ...partial });
  },
  getLast() { return store.get(store.keyLast, null); },
  clearLast() { localStorage.removeItem(store.keyLast); },
};

/* =================== Utils =================== */
function notify(msg = "Ok!") {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 1400);
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
  s.replace(/\u00A0/g, " ").replace(/\t/g, " ").replace(/\s+\n/g, "\n");
function norm(s) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/g, "c")
    .replace(/(\d)[.,](?=\d)/g, "$1")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/* =================== Catálogo =================== */
function buildCatalogMaps() {
  const sel = els.codeSelect;
  state.urlToLabel.clear();
  sel.querySelectorAll("option").forEach((opt) => {
    const url = opt.value?.trim();
    const label = opt.textContent?.trim();
    if (url) state.urlToLabel.set(url, label);
  });
}
function getCatalogByCategory() {
  const map = new Map();
  els.codeSelect.querySelectorAll("optgroup").forEach((og) => {
    const cat = og.getAttribute("label")?.trim() || "Outros";
    const arr = [];
    og.querySelectorAll("option").forEach((opt) => {
      const url = opt.value?.trim();
      const label = opt.textContent?.trim();
      if (url) arr.push({ label, value: url });
    });
    map.set(cat, arr);
  });
  return map;
}

/* =================== Parser =================== */
function splitIntoBlocks(txt) {
  const cleaned = sanitizeForLayout(
    txt.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ")
  );
  return cleaned.split(/^\s*-{5,}\s*$/m).map(s=>s.trim()).filter(Boolean);
}
function parseBlockToItem(block, idx) {
  const lines = block.split(/\n/);
  const artIdx = lines.findIndex((l) =>
    /^(Pre[aâ]mbulo|Art(?:igo)?\.?|S[úu]mula)/i.test(l.trim())
  );
  if (artIdx === -1) {
    return { kind: "heading", raw: block, htmlId: `h-${idx}` };
  }
  const pre   = lines.slice(0, artIdx).map((s)=>s.trim()).filter(Boolean);
  const after = lines.slice(artIdx).map((s)=>s.trim()).filter(Boolean);
  const epigrafe  = pre.length ? pre.join("\n") : "";
  const titleLine = after.shift() || "";

  const ensureBlank = (txt)=>
    txt.replace(
      /([^\n])\n(§|Par[aá]grafo|[IVXLCDM]+\s*[-–—.]|[a-z]\))/g,
      (_,a,b)=>`${a}\n${b}`
    );
  const bodyText = ensureBlank(after.join("\n"));
  const textForStorage = [epigrafe ? `Epígrafe: ${epigrafe}` : "", titleLine, bodyText]
    .filter(Boolean).join("\n");

  return {
    kind: "article",
    title: titleLine || `Bloco ${idx+1}`,
    text: textForStorage,
    htmlId: `art-${idx}`,
    _split: { supra: [], titleText: titleLine, body: bodyText, epigrafe },
  };
}
function parseByUrl(url, txt){
  const blocks = splitIntoBlocks(txt);
  const items  = blocks.map((b,i)=>parseBlockToItem(b,i));
  let aidx = 0;
  items.forEach((it)=>{
    if (it.kind === "article"){
      it.htmlId = `art-${aidx}`;
      it._aidx  = aidx;
      aidx++;
    }
  });
  return items;
}

/* =================== Render helpers =================== */
function wrapParensIn(root){
  const re = /\(([^()]{1,200})\)/g;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes=[]; let n; while((n=walker.nextNode())) nodes.push(n);
  nodes.forEach((node)=>{
    const text=node.nodeValue; if (!re.test(text)){ re.lastIndex=0; return; }
    re.lastIndex=0; const frag=document.createDocumentFragment(); let last=0,m;
    while((m=re.exec(text))){
      const before=text.slice(last,m.index); if (before) frag.appendChild(document.createTextNode(before));
      const span=document.createElement("span"); span.className="paren"; span.textContent="("+m[1]+")"; frag.appendChild(span);
      last=re.lastIndex;
    }
    const after=text.slice(last); if (after) frag.appendChild(document.createTextNode(after));
    node.parentNode.replaceChild(frag, node);
  });
}
function highlightTextNodes(root, tokens){
  if (!tokens?.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes=[]; let n; while((n=walker.nextNode())) nodes.push(n);
  nodes.forEach((node)=>{
    const txt=node.nodeValue; if (!txt.trim()) return;
    const frag=document.createDocumentFragment(); const re=/[\p{L}\p{N}]+/gu; let idx=0,m;
    while((m=re.exec(txt))){
      const before=txt.slice(idx,m.index); if (before) frag.appendChild(document.createTextNode(before));
      const word=m[0]; const hit=tokens.some(t=>norm(word).includes(t));
      if (hit){ const mk=document.createElement("mark"); mk.textContent=word; frag.appendChild(mk); }
      else frag.appendChild(document.createTextNode(word));
      idx=re.lastIndex;
    }
    const tail=txt.slice(idx); if (tail) frag.appendChild(document.createTextNode(tail));
    node.parentNode.replaceChild(frag,node);
  });
}
function buildHeadingElement(item){
  const el=document.createElement("div"); el.className="law-heading"; el.id=item.htmlId;
  const pre=document.createElement("pre"); pre.textContent=item.raw; el.appendChild(pre); return el;
}

/* ===== Planalto ===== */
const planaltoBases = {
  "CF88": "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm",
  "Código Civil": "https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm",
  "Processo Civil": "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm",
  "Código Penal": "https://www.planalto.gov.br/ccivil_03/Decreto-Lei/Del3689.htm",
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
function buildPlanaltoHashFromTitle(titleText){
  if (!titleText) return "";
  const m = titleText.match(/Art(?:igo)?\.?\s*(\d+)\s*([ºo]?)/i);
  if (!m) return "";
  const n = m[1]; const sufixo = m[2]?.toLowerCase() || "";
  if (sufixo === "º") return `#art${n}o`;
  return `#art${n}`;
}
function makePlanaltoUrl(fileLabel, titleText){
  const base = planaltoBases[fileLabel];
  if (!base) return null;
  const h1 = buildPlanaltoHashFromTitle(titleText);
  let h2 = "";
  if (h1 && /#art(\d+)$/.test(h1)) { const n = RegExp.$1; h2 = `#art${n}o`; }
  else if (h1 && /#art(\d+)o$/.test(h1)) { const n = RegExp.$1; h2 = `#art${n}`; }
  return { base, try1: base + (h1 || ""), try2: h2 ? base + h2 : base };
}

/* =================== Artigos =================== */
function buildArticleElement(a){
  const el = document.createElement("article");
  el.dataset.idx = a._aidx;
  el.id = a.htmlId || `art-${a._aidx}`;
  el.dataset.fileUrl = a._fileUrl || state.currentFileUrl || "";
  el.dataset.fileLabel = a._fileLabel || state.currentFileLabel || "";

  const split = a._split;

  const contentWrap = document.createElement("div");
  contentWrap.className = "art-content";

  if (split.epigrafe) {
    const epiTop = document.createElement("div");
    epiTop.className = "art-epigrafe";
    epiTop.textContent = split.epigrafe.replace(/<\/?(strong|b)>/gi, "");
    contentWrap.appendChild(epiTop);
  }

  const head = document.createElement("div");
  head.className = "art-head";
  const titleSpan = document.createElement("span");
  titleSpan.className = "art-title";
  titleSpan.textContent = (split.titleText || a.title || "Artigo").replace(/<\/?(strong|b)>/gi, "");
  head.appendChild(titleSpan);
  contentWrap.appendChild(head);

  const content = document.createElement("div");
  content.className = "art-body";
  let body = (split.body || "")
    .replace(/<\/?(strong|b)>/gi,"")
    .replace(/([^\n])(\n§)/g,"$1\n\n§")
    .replace(/(^|\n)(\s*(?:§|Par[aá]grafo(?:\s+único)?))/gi,"\n$2")
    .replace(/(^|\n)(\s*[IVXLCDM]{1,12}\s*[-–—.]?)/g,"\n$2")
    .replace(/(^|\n)(\s*[a-z]\))/g,"\n$2")
    .replace(/(^|\n)(§\s*[^\n]*)(\n)/g,"$1$2\n\n")
    .replace(/(^|\n)(Par[aá]grafo[^\n]*)(\n)/gi,"$1$2\n\n")
    .replace(/(^|\n)([IVXLCDM]{1,12} ?[-–—.]?\s*[^\n]*)(\n)/g,"$1$2\n\n")
    .replace(/(^|\n)([a-z]\)\s*[^\n]*)(\n)/g,"$1$2\n\n");
  content.innerHTML = body.replace(/\n/g,"<br>");
  contentWrap.appendChild(content);
  el.appendChild(contentWrap);

  // Botões internos ocultos (mantidos por compatibilidade)
  const actions = document.createElement("div"); actions.className = "art-actions";
  el.appendChild(actions);

  wrapParensIn(el);
  return el;
}
function clearArticles(){ els.articles.innerHTML=""; state.currentArticleIdx=-1; }

/* =================== Outline (in-view) — sem índice =================== */
function updateCurrentOutline() {
  const nodes = Array.from(document.querySelectorAll("article[data-idx]"));
  if (!nodes.length) return;
  const topGap = 48;
  const scTop = window.scrollY || document.documentElement.scrollTop || 0;
  const scBottom = scTop + window.innerHeight;
  const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);

  let targetIdx = -1;
  if (scTop <= topGap) targetIdx = 0;
  else if (scBottom >= docH - topGap) targetIdx = nodes.length - 1;
  else {
    const cy = window.innerHeight / 2;
    let best = Infinity, bestIdx = 0;
    nodes.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      const mid = r.top + r.height / 2;
      const d = Math.abs(mid - cy);
      if (d < best) { best = d; bestIdx = i; }
    });
    targetIdx = bestIdx;
  }
  if (targetIdx === -1) return;
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

/* =================== Render arquivo =================== */
function renderFileItemsProgressive(items, {chunkSize=30}={}){
  clearArticles();
  els.fileLabel.style.display = "block";
  els.fileLabel.textContent = state.currentFileLabel || "Documento";

  if (!items.length){
    els.articles.innerHTML='<div style="padding:24px; color:#6c7282; text-align:center;">🤔 Nada aqui.</div>';
    return;
  }
  const first=Math.min(8, items.length);
  const frag=document.createDocumentFragment();
  for (let i=0;i<first;i++){
    const it=items[i];
    frag.appendChild(it.kind==="heading" ? buildHeadingElement(it) : buildArticleElement(it));
  }
  els.articles.appendChild(frag);
  updateCurrentOutline();

  let i=first;
  function appendChunk(){
    const fr=document.createDocumentFragment(); let added=0;
    while(i<items.length && added<chunkSize){
      const it=items[i];
      fr.appendChild(it.kind==="heading" ? buildHeadingElement(it) : buildArticleElement(it));
      i++; added++;
    }
    els.articles.appendChild(fr); updateCurrentOutline();
    if (i<items.length){ ("requestIdleCallback" in window) ? requestIdleCallback(appendChunk) : setTimeout(appendChunk, 0); }
  }
  if (first<items.length){ ("requestIdleCallback" in window) ? requestIdleCallback(appendChunk) : setTimeout(appendChunk, 0); }
}
function renderFileItemsAll(items){
  clearArticles();
  els.fileLabel.style.display = "block";
  els.fileLabel.textContent = state.currentFileLabel || "Documento";
  const frag=document.createDocumentFragment();
  items.forEach((it)=>frag.appendChild(it.kind==="heading" ? buildHeadingElement(it) : buildArticleElement(it)));
  els.articles.appendChild(frag); updateCurrentOutline();
}

/* =================== Listas (exibição) =================== */
function renderListItems(list){
  clearArticles();
  els.fileLabel.style.display = "block";
  els.fileLabel.textContent = `Lista: ${list.name}`;
  if (!list.items.length){
    els.articles.innerHTML='<div style="padding:24px; color:#6c7282; text-align:center;">📂 Lista vazia.</div>';
    return;
  }
  const frag = document.createDocumentFragment(); let idx=0;
  list.items.forEach((entry)=>{
    const parts = splitIntoBlocks(entry.text);
    if (!parts.length) return;
    const item = parseBlockToItem(parts[0], 0);
    if (!item || item.kind!=="article") return;
    item._fileUrl = entry.fileUrl;
    item._fileLabel = entry.fileLabel;
    item.htmlId = entry.htmlId || item.htmlId;
    item._aidx = idx++;
    const el = buildArticleElement(item);
    el.dataset.fileUrl=entry.fileUrl; el.dataset.fileLabel=entry.fileLabel;
    frag.appendChild(el);
  });
  els.articles.appendChild(frag);
  window.scrollTo({top:0, behavior:"instant"});
  state.mode="lists";
  updateCurrentOutline();
}

/* =================== Loader =================== */
async function fetchTextCached(url){
  if (state.cache.has(url)) return state.cache.get(url);
  const res = await fetch(url, { cache:"no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
  const txt=sanitizeForLayout(await res.text());
  state.cache.set(url, txt);
  return txt;
}
function addNormalizedFieldToArticles(items){
  const arts=items.filter(it=>it.kind==="article");
  arts.forEach((a)=>{
    const s=a._split;
    const combo=[s.titleText||"", s.epigrafe||"", ...(s.supra||[]), s.body||""].join(" ");
    a._norm = norm(combo);
  });
  return arts;
}
async function loadFile(url, triggerBtn){
  if (!url) return;
  await withBusy(triggerBtn, async ()=>{
    els.searchSpinner.classList.add("show");
    try{
      const txt=await fetchTextCached(url);
      state.rawText=txt;
      const items=parseByUrl(url, txt);
      state.currentFileUrl=url;
      state.currentFileLabel=state.urlToLabel.get(url) || "Documento";
      state.items=items;
      state.articles=addNormalizedFieldToArticles(items);
      state.mode="file";
      renderFileItemsProgressive(items);
      window.scrollTo({ top:0, behavior:"instant" });
      notify(`Carregado: ${state.currentFileLabel}`);
      store.saveLast({ mode:"file", fileUrl:url, scrollY:0, articleId:null });
      rebuildSuggestionsIndex();
      closeFilesModal();
    } catch(err){
      console.error(err);
      els.articles.innerHTML=`<div style="padding:24px; color:#a33; border:1px dashed #e7bcbc; border-radius:12px">
        Falha ao carregar:<br><code>${(err&&err.message)||"Erro desconhecido"}</code></div>`;
      notify("Erro ao carregar arquivo");
    } finally {
      els.searchSpinner.classList.remove("show");
    }
  });
}

/* =================== Busca + Sugestões =================== */
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
  box.innerHTML = "";
  if (!list.length) { box.classList.remove("show"); return; }

  const frag = document.createDocumentFragment();
  list.slice(0, 8).forEach((it, i) => {
    const btn = document.createElement("button");
    btn.className = "suggest-item" + (i === suggestActiveIndex ? " active" : "");
    btn.setAttribute("role", "option");
    btn.type = "button";
    btn.dataset.htmlId = it.htmlId;

    const safeTitle = highlightQuery(it.title, tokens);
    const el = document.getElementById(it.htmlId);
    const bodyTxt = el?.querySelector(".art-body")?.innerText || "";
    const snip = bodyTxt.replace(/\s+/g, " ").slice(0, 120);

    btn.innerHTML = `
      <div class="sug-title">${safeTitle}</div>
      <p class="sug-snippet">${snip}</p>
    `;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      jumpToArticle(it.htmlId);
      box.classList.remove("show");
    });
    frag.appendChild(btn);
  });

  box.appendChild(frag);
  box.classList.add("show");
}
function jumpToArticle(htmlId){
  const el=document.getElementById(htmlId);
  if (el){
    const topbar=parseInt(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h"));
    const filebar=parseInt(getComputedStyle(document.documentElement).getPropertyValue("--filebar-h"));
    const offset=topbar+filebar+12;
    const y=el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top:y, behavior:"smooth" });
    updateCurrentOutline();
  }
}
function toggleClear(){
  const has = (els.searchInput.value || "").length>0;
  els.clearSearch.classList.toggle("show", has);
}
function onSearchInput(){
  toggleClear();
  const q = els.searchInput.value || "";
  if (state.mode !== "file"){ els.searchSuggest.classList.remove("show"); return; }
  const tokens = buildQueryTokens(q);
  if (!tokens.length){ els.searchSuggest.classList.remove("show"); return; }
  const list = suggestionsData.filter(s => {
    const nTitle = norm(s.title);
    return tokens.every(t => nTitle.includes(t));
  });
  suggestActiveIndex = -1;
  renderSuggestions(list, tokens);
}
async function runLocalSearch(){
  if (state.mode !== "file"){ notify("Abra um arquivo para buscar."); return; }
  const q = els.searchInput.value.trim();
  els.finderPop?.classList.add("show");
  const tokens = buildQueryTokens(q);
  if (!tokens.length){
    renderFileItemsProgressive(state.items);
    state.matchArticles = []; state.matchIdx = -1;
    els.count && (els.count.textContent = "0/0");
    els.searchSuggest.classList.remove("show");
    return;
  }
  els.searchSpinner.classList.add("show");
  try{
    state.currentTokens = tokens;
    const matchedMeta = state.articles.filter(a => tokens.every(t => a._norm.includes(t)));
    renderFileItemsAll(state.items);
    requestAnimationFrame(()=>{
      matchedMeta.forEach((m)=>{
        const art = document.getElementById(m.htmlId);
        if (art) highlightTextNodes(art, tokens);
      });
      state.matchArticles = matchedMeta.map(m => document.getElementById(m.htmlId)).filter(Boolean);
      if (state.matchArticles.length){
        state.matchIdx = 0;
        state.matchArticles[0].scrollIntoView({ behavior:"smooth", block:"center" });
      } else {
        state.matchIdx = -1;
        notify("Nenhum resultado com todas as palavras.");
      }
      updateCount();
      updateCurrentOutline();
    });
  } finally {
    els.searchSpinner.classList.remove("show");
    els.searchSuggest.classList.remove("show");
  }
}
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

/* =================== Arquivos: modal melhorado =================== */
function openFilesModal(){
  buildFilesModal(); els.filesModal.setAttribute("aria-hidden","false");
}
function closeFilesModal(){
  els.filesModal.setAttribute("aria-hidden","true");
}
function buildFilesModal(){
  const map = getCatalogByCategory();
  const q = (els.filesSearch.value || "").trim().toLowerCase();
  const frag = document.createDocumentFragment();
  els.filesBody.innerHTML = "";
  for (const [cat, arr] of map.entries()){
    const group = document.createElement("div"); group.className = "files-group";
    const h = document.createElement("h4"); h.textContent = cat; group.appendChild(h);
    arr
      .filter(({label})=>!q || label.toLowerCase().includes(q))
      .forEach(({label,value})=>{
        const item = document.createElement("div");
        item.className = "files-item"; item.textContent = label;
        item.addEventListener("click", ()=> loadFile(value, item));
        group.appendChild(item);
      });
    frag.appendChild(group);
  }
  els.filesBody.appendChild(frag);
}

/* =================== Listas: modal principal =================== */
function openListsModal(){ renderListsModal(); els.listsModal.setAttribute("aria-hidden","false"); }
function closeListsModal(){ els.listsModal.setAttribute("aria-hidden","true"); }
function renderListsModal(){
  const lists = store.listLists();
  els.listsBody.innerHTML = "";
  if (!lists.length){
    els.listsBody.innerHTML = '<div class="section-empty">Você ainda não tem listas.</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  lists.forEach((l)=>{
    const row = document.createElement("div"); row.className="list-row";
    const left = document.createElement("div");
    left.innerHTML = `<span class="list-name">${l.name}</span> <small>(${l.items.length})</small>`;
    const actions = document.createElement("div"); actions.className="list-actions";
    const openBtn = btn("Abrir", ()=>{ closeListsModal(); renderListItems(l); });
    const clearBtn = btn("Limpar", ()=>{ store.clearList(l.id); renderListsModal(); notify("Lista limpa"); });
    const delBtn = btn("Excluir", ()=>{ if (confirm("Excluir esta lista?")){ store.deleteList(l.id); renderListsModal(); notify("Lista excluída"); }});
    actions.append(openBtn, clearBtn, delBtn);
    row.append(left, actions);
    frag.appendChild(row);
  });
  els.listsBody.appendChild(frag);
}
function btn(label, onClick){
  const b=document.createElement("button"); b.className="small-btn"; b.textContent=label; b.addEventListener("click", onClick); return b;
}

/* =================== Salvar em lista (mini-modal) =================== */
function openSaveModalFor(entry){
  state.pendingSave = entry;
  renderSaveLists();
  els.saveModal.setAttribute("aria-hidden","false");
}
function closeSaveModal(){
  els.saveModal.setAttribute("aria-hidden","true");
  state.pendingSave = null;
}
function renderSaveLists(){
  const lists = store.listLists();
  const body = els.saveListsBody;
  body.innerHTML = "";
  if (!lists.length){
    body.innerHTML = '<div class="section-empty">Nenhuma lista. Crie uma acima.</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  lists.forEach((l)=>{
    const row = document.createElement("div"); row.className="save-row";
    const label = document.createElement("div"); label.textContent = `${l.name} (${l.items.length})`;
    const add = btn("Adicionar", ()=>{
      if (!state.pendingSave) return;
      store.addToList(l.id, state.pendingSave);
      notify(`Salvo em: ${l.name}`); closeSaveModal();
    });
    row.append(label, add);
    frag.appendChild(row);
  });
  body.appendChild(frag);
}

/* =================== Eventos globais =================== */
function buildCatalogMapsAndRestore(){
  buildCatalogMaps();
  const last = store.getLast();
  if (last?.mode === "file" && last.fileUrl){
    loadFile(last.fileUrl);
  } else {
    // iniciar em Listas
    renderListsModal();
    openListsModal();
  }
}

/* ===== Ações / FAB ===== */
function updateActionPreview(){
  const node = document.querySelector("article.in-view");
  const title = node?.querySelector(".art-title")?.textContent?.trim() || "—";
  els.actionContext.textContent = title;
}
function toggleActionMenu(force){
  const show = (force !== undefined) ? !!force : els.actionMenu.getAttribute("aria-hidden")==="true";
  if (show) updateActionPreview();
  els.actionMenu.setAttribute("aria-hidden", show ? "false" : "true");
  els.actionFab.setAttribute("aria-expanded", show ? "true" : "false");
}
function handleAction(action){
  const node = document.querySelector("article.in-view");
  if (!node) return notify("Nenhum artigo em foco.");

  const htmlId = node.id;
  const fileUrl = node.dataset.fileUrl || state.currentFileUrl || "";
  const fileLabel = node.dataset.fileLabel || state.currentFileLabel || "";
  const id = `${fileUrl}::${htmlId}`;
  const text = node.innerText || "";

  if (action==="save"){
    openSaveModalFor({ id, htmlId, fileUrl, fileLabel, text });
  } else if (action==="study"){
    const title = node.querySelector(".art-title")?.textContent?.trim() || "Artigo";
    const body  = node.querySelector(".art-body")?.innerText?.trim() || "";
    const epi   = node.querySelector(".art-epigrafe")?.innerText?.trim() || "";
    const supra = epi ? `Epígrafe: ${epi}\n` : "";
    const tema  = title;
    const prompt =
`Assuma a persona de um professor de Direito experiente convidado pelo direito.love.
Explique detalhadamente seguindo: (1) conceito; (2) checklist; (3) mini exemplo; (4) princípios; (5) pontos de atenção; (6) erros comuns; (7) artigos correlatos.
Responda em português claro, objetivo e didático.

Tema: "${tema}"

${supra}${body}

💚 direito.love`;
    els.modalTitle.textContent = "Estude com I.A.";
    els.promptPreview.textContent = prompt;
    els.studySub.textContent = "Prompt gerado. Copie e cole na sua IA preferida.";
    els.studyModal.setAttribute("aria-hidden","false");
  } else if (action==="planalto"){
    const title = node.querySelector(".art-title")?.textContent?.trim() || "";
    const u = makePlanaltoUrl(node.dataset.fileLabel || state.currentFileLabel, title);
    if (u?.try1) window.open(u.try1, "_blank");
    else if (u?.try2) window.open(u.try2, "_blank");
    else notify("Link indisponível para este documento.");
  }
}

/* =================== Wire-up =================== */
// Topbar
els.infoBtn.addEventListener("click", ()=> els.infoModal.setAttribute("aria-hidden","false"));
els.closeInfo.addEventListener("click", ()=> els.infoModal.setAttribute("aria-hidden","true"));
els.brandBtn.addEventListener("click", ()=> { renderListsModal(); openListsModal(); });

// Barra secundária
els.catTab.addEventListener("click", openFilesModal);
els.favTab.addEventListener("click", openListsModal);

// Arquivos modal
els.closeFiles.addEventListener("click", closeFilesModal);
els.filesSearch.addEventListener("input", buildFilesModal);

// Listas modal
els.closeLists.addEventListener("click", closeListsModal);
els.createListBtn.addEventListener("click", ()=>{
  const name = (els.newListName.value||"").trim();
  if (!name) return notify("Dê um nome para a lista.");
  store.createList(name); els.newListName.value=""; renderListsModal(); notify("Lista criada");
});

// Mini-modal salvar
els.closeSave.addEventListener("click", closeSaveModal);
els.saveCreateListBtn.addEventListener("click", ()=>{
  const name = (els.saveNewListName.value||"").trim();
  if (!name) return notify("Dê um nome para a lista.");
  const id = store.createList(name); els.saveNewListName.value="";
  if (state.pendingSave){ store.addToList(id, state.pendingSave); notify(`Salvo em: ${name}`); closeSaveModal(); }
  renderSaveLists();
});

// Busca
els.searchInput.addEventListener("input", onSearchInput);
els.searchInput.addEventListener("keydown", (e)=>{
  if (e.key==="Enter") runLocalSearch();
});
els.clearSearch.addEventListener("click", ()=>{ els.searchInput.value=""; onSearchInput(); });

// Mini-finder (se visível no DOM)
if (els.prevBtn) els.prevBtn.addEventListener("click", gotoPrev);
if (els.nextBtn) els.nextBtn.addEventListener("click", gotoNext);
if (els.closeFinder) els.closeFinder.addEventListener("click", ()=> els.finderPop.classList.remove("show"));

// Ações / FAB
els.actionFab.addEventListener("click", ()=> toggleActionMenu());
document.addEventListener("click",(e)=>{
  if (!els.actionMenu) return;
  const inside = e.target.closest && e.target.closest("#actionMenu, #actionFab");
  if (!inside && els.actionMenu.getAttribute("aria-hidden")==="false"){
    toggleActionMenu(false);
  }
});
els.actionMenu.addEventListener("click",(e)=>{
  const btn = e.target.closest(".menu-btn");
  if (!btn) return;
  handleAction(btn.dataset.action);
});

// IA buttons
document.addEventListener("click",(e)=>{
  const b = e.target.closest(".ia-btn.btn");
  if (!b) return;
  const url = b.dataset.url;
  if (url) window.open(url, "_blank");
});
els.closeStudy.addEventListener("click", ()=> els.studyModal.setAttribute("aria-hidden","true"));
els.copyPromptBtn.addEventListener("click", async ()=>{
  try{ await navigator.clipboard.writeText(els.promptPreview.textContent||""); notify("Prompt copiado!"); }
  catch{ notify("Falha ao copiar"); }
});

/* =================== Start =================== */
buildCatalogMapsAndRestore();
