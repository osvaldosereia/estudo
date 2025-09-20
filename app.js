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

  // Conteúdo
  fileLabel: document.getElementById("fileLabel"),
  articles: document.getElementById("articles"),

  // Catálogo
  codeSelect: document.getElementById("codeSelect"),

  // Modais centrais
  studyModal: document.getElementById("studyModal"),
  closeStudy: document.getElementById("closeStudy"),
  modalTitle: document.getElementById("modalTitle"),
  studySub: document.getElementById("studySub"),
  promptPreview: document.getElementById("promptPreview"),
  copyPromptBtn: document.getElementById("copyPromptBtn"),

  // Popovers
  filesModal: document.getElementById("filesModal"),
  filesPopover: document.getElementById("filesPopover"),
  filesArrow: document.getElementById("filesArrow"),
  closeFiles: document.getElementById("closeFiles"),
  filesSearch: document.getElementById("filesSearch"),
  filesBody: document.getElementById("filesBody"),

  listsModal: document.getElementById("listsModal"),
  listsPopover: document.getElementById("listsPopover"),
  listsArrow: document.getElementById("listsArrow"),
  closeLists: document.getElementById("closeLists"),
  newListName: document.getElementById("newListName"),
  createListBtn: document.getElementById("createListBtn"),
  listsBody: document.getElementById("listsBody"),

  saveModal: document.getElementById("saveModal"),
  savePopover: document.getElementById("savePopover"),
  saveArrow: document.getElementById("saveArrow"),
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

/* =================== Config UX (fallback estável) =================== */
// Se false, exibe Arquivos/Lista/Salvar como MODAIS CENTRAIS pequenos (estáveis).
// Quando quiser popovers ancorados, mude para true.
const POPUPS_ENABLED = false;

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

  // lista atual aberta (quando em modo lists)
  currentList: null, // {id,name,items:[]}

  // âncora de popover ativa
  currentAnchor: null,
};

const store = {
  get(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },

  // Listas
  keyLists: "dl_lists_v2",
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
    txt.replace(/([^\n])\n(§|Par[aá]grafo|[IVXLCDM]+\s*[-–—.]|[a-z]\))/g, (_,a,b)=>`${a}\n${b}`);
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

  wrapParensIn(el);
  return el;
}
function clearArticles(){ els.articles.innerHTML=""; state.currentArticleIdx=-1; }

/* =================== Outline (in-view) =================== */
let _scrollRAF = null;
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
function onScrollThrottled(){
  if (_scrollRAF) return;
  _scrollRAF = requestAnimationFrame(()=>{ _scrollRAF = null; updateCurrentOutline(); });
}
window.addEventListener("scroll", onScrollThrottled, { passive:true });
window.addEventListener("resize", onScrollThrottled);

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
  state.mode = "lists";
  state.currentList = list;

  if (!list.items.length){
    els.articles.innerHTML='<div style="padding:24px; color:#6c7282; text-align:center;">📂 Lista vazia.</div>';
    updateActionMenuForMode();
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
  updateCurrentOutline();
  updateActionMenuForMode();
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
      state.currentList=null;
      renderFileItemsProgressive(items);
      window.scrollTo({ top:0, behavior:"instant" });
      notify(`Carregado: ${state.currentFileLabel}`);
      store.saveLast({ mode:"file", fileUrl:url, scrollY:0, articleId:null });
      rebuildSuggestionsIndex();
      closeFilesModal();
      updateActionMenuForMode();
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
let suggestionsData = [];
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
  const tokens = buildQueryTokens(q);
  if (!tokens.length){
    renderFileItemsProgressive(state.items);
    state.matchArticles = []; state.matchIdx = -1;
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
      updateCurrentOutline();
    });
  } finally {
    els.searchSpinner.classList.remove("show");
    els.searchSuggest.classList.remove("show");
  }
}

/* =================== Popover core =================== */
function anchorPopover({backdrop, panel, arrow, anchorEl, placement="bottom-start", gap=8}){
  if (!backdrop || !panel || !anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  let x = rect.left, y = rect.bottom + gap;

  const pw = panel.offsetWidth || 360;
  const ph = panel.offsetHeight || 300;
  const vw = window.innerWidth, vh = window.innerHeight;

  if (placement.startsWith("bottom")) y = Math.min(y, vh - ph - 12);
  if (placement.endsWith("start")){
    x = Math.max(12, Math.min(x, vw - pw - 12));
  } else if (placement.endsWith("end")){
    x = Math.max(12, Math.min(rect.right - pw, vw - pw - 12));
  }

  panel.style.left = `${x}px`;
  panel.style.top  = `${y}px`;

  if (arrow){
    const ax = Math.min(Math.max(rect.left + rect.width/2 - 7, x + 12), x + pw - 24);
    const ay = y - 7;
    arrow.style.left = `${ax}px`;
    arrow.style.top  = `${ay}px`;
  }
}
function openPopover(backdrop){ if (backdrop) backdrop.setAttribute("aria-hidden","false"); }
function closePopover(backdrop){ if (backdrop) backdrop.setAttribute("aria-hidden","true"); }

/* =================== Arquivos: abrir/fechar =================== */
function openFilesModal(anchorEl){
  buildFilesModal();
  if (POPUPS_ENABLED) {
    anchorPopover({backdrop:els.filesModal, panel:els.filesPopover, arrow:els.filesArrow, anchorEl, placement:"bottom-start", gap:8});
    openPopover(els.filesModal);
    state.currentAnchor = anchorEl;
  } else {
    els.filesModal.classList.add("as-modal");
    els.filesModal.setAttribute("aria-hidden","false");
  }
}
function closeFilesModal(){
  if (POPUPS_ENABLED) closePopover(els.filesModal);
  else els.filesModal.setAttribute("aria-hidden","true");
  requestAnimationFrame(updateCurrentOutline);
}

/* =================== Listas: abrir/fechar =================== */
function openListsModal(anchorEl){
  renderListsModal();
  if (POPUPS_ENABLED) {
    anchorPopover({backdrop:els.listsModal, panel:els.listsPopover, arrow:els.listsArrow, anchorEl, placement:"bottom-end", gap:8});
    openPopover(els.listsModal);
    state.currentAnchor = anchorEl;
  } else {
    els.listsModal.classList.add("as-modal");
    els.listsModal.setAttribute("aria-hidden","false");
  }
}
function closeListsModal(){
  if (POPUPS_ENABLED) closePopover(els.listsModal);
  else els.listsModal.setAttribute("aria-hidden","true");
  requestAnimationFrame(updateCurrentOutline);
}

/* =================== Salvar em lista: abrir/fechar =================== */
function openSaveModalFor(entry, anchorEl){
  state.pendingSave = entry;
  renderSaveLists();
  if (POPUPS_ENABLED) {
    anchorPopover({backdrop:els.saveModal, panel:els.savePopover, arrow:els.saveArrow, anchorEl, placement:"bottom-end", gap:8});
    openPopover(els.saveModal);
    state.currentAnchor = anchorEl;
  } else {
    els.saveModal.classList.add("as-modal");
    els.saveModal.setAttribute("aria-hidden","false");
  }
}
function closeSaveModal(){
  if (POPUPS_ENABLED) closePopover(els.saveModal);
  else els.saveModal.setAttribute("aria-hidden","true");
  state.pendingSave = null;
  requestAnimationFrame(updateCurrentOutline);
}

/* Reposiciona popovers ativos em scroll/resize */
function repositionActivePopovers(){
  if (!POPUPS_ENABLED) return;
  if (els.filesModal.getAttribute("aria-hidden")==="false" && state.currentAnchor){
    anchorPopover({backdrop:els.filesModal, panel:els.filesPopover, arrow:els.filesArrow, anchorEl:state.currentAnchor, placement:"bottom-start", gap:8});
  }
  if (els.listsModal.getAttribute("aria-hidden")==="false" && state.currentAnchor){
    anchorPopover({backdrop:els.listsModal, panel:els.listsPopover, arrow:els.listsArrow, anchorEl:state.currentAnchor, placement:"bottom-end", gap:8});
  }
  if (els.saveModal.getAttribute("aria-hidden")==="false" && state.currentAnchor){
    anchorPopover({backdrop:els.saveModal, panel:els.savePopover, arrow:els.saveArrow, anchorEl:state.currentAnchor, placement:"bottom-end", gap:8});
  }
}
window.addEventListener("resize", repositionActivePopovers);
window.addEventListener("scroll", repositionActivePopovers, { passive:true });

/* =================== Build de conteúdos =================== */
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
        item.addEventListener("click", ()=> { loadFile(value, item); closeFilesModal(); });
        group.appendChild(item);
      });
    frag.appendChild(group);
  }
  els.filesBody.appendChild(frag);
}
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
    const addBtn = btn("Adicionar", ()=>{
      if (!state.pendingSave) return;
      store.addToList(l.id, state.pendingSave);
      notify(`Salvo em: ${l.name}`); closeSaveModal();
      requestAnimationFrame(updateCurrentOutline);
    });
    // Clique na linha inteira também salva
    row.addEventListener("click", ()=>{
      if (!state.pendingSave) return;
      store.addToList(l.id, state.pendingSave);
      notify(`Salvo em: ${l.name}`); closeSaveModal();
      requestAnimationFrame(updateCurrentOutline);
    });
    row.append(label, addBtn);
    frag.appendChild(row);
  });
  body.appendChild(frag);
}
function btn(label, onClick){
  const b=document.createElement("button"); b.className="small-btn"; b.textContent=label; b.addEventListener("click", (e)=>{ e.stopPropagation(); onClick(); }); return b;
}

/* =================== Ações / FAB =================== */
let studyAllBtn = null;
function updateActionPreview(){
  const node = document.querySelector("article.in-view");
  const title = node?.querySelector(".art-title")?.textContent?.trim() || "—";
  els.actionContext.textContent = title;
}
function updateActionMenuForMode(){
  const isLists = state.mode === "lists";
  if (els.saveToListBtn) els.saveToListBtn.style.display = isLists ? "none" : "block";

  if (isLists){
    if (!studyAllBtn){
      studyAllBtn = document.createElement("button");
      studyAllBtn.className = "menu-btn";
      studyAllBtn.dataset.action = "studyAll";
      studyAllBtn.textContent = "🧩 Estudar todos";
      els.actionMenu.appendChild(studyAllBtn);
      studyAllBtn.addEventListener("click", (e)=> handleAction("studyAll", e.currentTarget));
    }
    studyAllBtn.style.display = "block";
  } else {
    if (studyAllBtn) studyAllBtn.style.display = "none";
  }

  const btnStudy = els.actionMenu.querySelector('.menu-btn[data-action="study"]');
  if (btnStudy) btnStudy.textContent = "📖 Estudar";
}
function toggleActionMenu(force){
  const show = (force !== undefined) ? !!force : els.actionMenu.getAttribute("aria-hidden")==="true";
  if (show) { updateActionPreview(); updateActionMenuForMode(); }
  els.actionMenu.setAttribute("aria-hidden", show ? "false" : "true");
  els.actionFab.setAttribute("aria-expanded", show ? "true" : "false");
}
function buildStudyPrompt({title, epi, body}){
  const supra = epi ? `Epígrafe: ${epi}\n` : "";
  return `Assuma a persona de um professor de Direito experiente convidado pelo direito.love.
Explique detalhadamente seguindo: (1) conceito; (2) checklist; (3) mini exemplo; (4) princípios; (5) pontos de atenção; (6) erros comuns; (7) artigos correlatos.
Responda em português claro, objetivo e didático.

Tema: "${title}"

${supra}${body}

💚 direito.love`;
}
function buildStudyPromptForList(list){
  const parts = list.items.map((entry, idx)=>{
    const [maybeEpiAndTitle, ...rest] = (entry.text||"").split("\n");
    const title = (maybeEpiAndTitle||"Artigo").includes("Epígrafe:")
      ? (rest[0] || "Artigo")
      : (maybeEpiAndTitle || "Artigo");
    const epi = (entry.text||"").includes("Epígrafe:") ? (entry.text.split("\n")[0].replace(/^Epígrafe:\s*/, "")) : "";
    const body = (entry.text||"").split("\n").slice(1).join("\n");
    return `### ${idx+1}. ${title}\n${epi ? `Epígrafe: ${epi}\n` : ""}${body}`;
  });
  return `Você é um professor de Direito convidado pelo direito.love.
Crie um MATERIAL ÚNICO de estudo cobrindo TODOS os itens abaixo, mantendo estrutura por tópicos, mas integrando conceitos para revisão rápida.

Para cada item:
- Conceito direto
- Checklist de prova
- Mini exemplo prático
- Princípios relacionados
- Pontos de atenção e erros comuns
- Referências cruzadas (artigos correlatos)

ITENS:
${parts.join("\n\n")}

💚 direito.love`;
}
function handleAction(action, anchorEl){
  const node = document.querySelector("article.in-view");
  if (!node && action!=="studyAll") return notify("Nenhum artigo em foco.");

  if (action==="save"){
    const htmlId = node.id;
    const fileUrl = node.dataset.fileUrl || state.currentFileUrl || "";
    const fileLabel = node.dataset.fileLabel || state.currentFileLabel || "";
    const id = `${fileUrl}::${htmlId}`;
    const text = node.innerText || "";
    openSaveModalFor({ id, htmlId, fileUrl, fileLabel, text }, anchorEl || els.actionFab);

  } else if (action==="study"){
    const title = node.querySelector(".art-title")?.textContent?.trim() || "Artigo";
    const body  = node.querySelector(".art-body")?.innerText?.trim() || "";
    const epi   = node.querySelector(".art-epigrafe")?.innerText?.trim() || "";
    const prompt = buildStudyPrompt({title, epi, body});
    els.modalTitle.textContent = "Estude com I.A.";
    els.promptPreview.textContent = prompt;
    els.studySub.textContent = "Prompt gerado. Copie e cole na sua IA preferida.";
    els.studyModal.setAttribute("aria-hidden","false");

  } else if (action==="studyAll"){
    if (state.mode!=="lists" || !state.currentList || !state.currentList.items?.length){
      return notify("Abra uma lista com itens para usar “Estudar todos”.");
    }
    const prompt = buildStudyPromptForList(state.currentList);
    els.modalTitle.textContent = `Estudar todos — ${state.currentList.name}`;
    els.promptPreview.textContent = prompt;
    els.studySub.textContent = "Prompt com todos os itens da lista.";
    els.studyModal.setAttribute("aria-hidden","false");

  } else if (action==="planalto"){
    const title = node?.querySelector(".art-title")?.textContent?.trim() || "";
    const u = makePlanaltoUrl(node?.dataset.fileLabel || state.currentFileLabel, title);
    if (u?.try1) window.open(u.try1, "_blank");
    else if (u?.try2) window.open(u.try2, "_blank");
    else notify("Link indisponível para este documento.");
  }
}

/* =================== Eventos globais =================== */
// Topbar
els.infoBtn.addEventListener("click", ()=> els.infoModal.setAttribute("aria-hidden","false"));
els.closeInfo.addEventListener("click", ()=> els.infoModal.setAttribute("aria-hidden","true"));
els.brandBtn.addEventListener("click", ()=> { renderListsModal(); openListsModal(els.brandBtn); });

// Barra secundária
els.catTab.addEventListener("click", ()=> openFilesModal(els.catTab));
els.favTab.addEventListener("click", ()=> openListsModal(els.favTab));

// Arquivos popover/modal
els.closeFiles.addEventListener("click", closeFilesModal);
els.filesSearch?.addEventListener("input", buildFilesModal);

// Listas popover/modal
els.closeLists.addEventListener("click", closeListsModal);
els.createListBtn.addEventListener("click", ()=>{
  const name = (els.newListName.value||"").trim();
  if (!name) return notify("Dê um nome para a lista.");
  store.createList(name); els.newListName.value=""; renderListsModal(); notify("Lista criada");
});

// Salvar popover/modal
els.closeSave.addEventListener("click", closeSaveModal);
els.saveCreateListBtn.addEventListener("click", ()=>{
  const name = (els.saveNewListName.value||"").trim();
  if (!name) return notify("Dê um nome para a lista.");
  const id = store.createList(name); els.saveNewListName.value="";
  if (state.pendingSave){ store.addToList(id, state.pendingSave); notify(`Salvo em: ${name}`); closeSaveModal(); }
  renderSaveLists();
});

// Fechar popovers clicando fora
[els.filesModal, els.listsModal, els.saveModal].forEach(backdrop=>{
  backdrop.addEventListener("click",(e)=>{
    if (e.target===backdrop) { closePopover(backdrop); requestAnimationFrame(updateCurrentOutline); }
  });
});

// ESC fecha tudo
document.addEventListener("keydown",(e)=>{
  if (e.key !== "Escape") return;
  if (els.studyModal.getAttribute("aria-hidden")==="false") els.studyModal.setAttribute("aria-hidden","true");
  if (els.infoModal.getAttribute("aria-hidden")==="false") els.infoModal.setAttribute("aria-hidden","true");
  [els.filesModal, els.listsModal, els.saveModal].forEach(b=>{
    if (b.getAttribute("aria-hidden")==="false") closePopover(b);
  });
  toggleActionMenu(false);
  requestAnimationFrame(updateCurrentOutline);
});

// Busca
els.searchInput.addEventListener("input", onSearchInput);
els.searchInput.addEventListener("keydown", (e)=>{ if (e.key==="Enter") runLocalSearch(); });
els.clearSearch.addEventListener("click", ()=>{ els.searchInput.value=""; onSearchInput(); });

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
  handleAction(btn.dataset.action, btn);
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

/* =================== Catálogo + Restore =================== */
function buildCatalogMapsAndRestore(){
  buildCatalogMaps();
  const last = store.getLast();
  if (last?.mode === "file" && last.fileUrl){
    loadFile(last.fileUrl);
  } else {
    renderListsModal();
    // fallback: abre como modal central estável
    openListsModal(els.favTab);
  }
}
buildCatalogMapsAndRestore();
