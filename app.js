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

  // Busca (agora na barra secundária)
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

  // Toast
  toast: document.getElementById("toast"),

  // Mini modal de categorias
  catBackdrop: document.getElementById("catBackdrop"),
  closeCat: document.getElementById("closeCat"),
  catGrid: document.getElementById("catGrid"),

  // FAB
  actionFab: document.getElementById("actionFab"),
  actionMenu: document.getElementById("actionMenu"),
  actionContext: document.getElementById("actionContext"),
};
els.indexToggle = null;
els.indexPanel = null;

/* =================== Estado + Storage =================== */
const state = {
  mode: "favorites", // favorites | file
  currentFileUrl: null,
  currentFileLabel: "",
  rawText: "",
  items: [],    // headings + articles
  articles: [], // only articles
  currentArticleIdx: -1,

  currentTokens: [],
  matchArticles: [],
  matchIdx: -1,

  category: "Todos",

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
    store.set(store.keyLast, { ...prev, ...partial });
  },
  getLast() { return store.get(store.keyLast, null); },
  clearLast() { localStorage.removeItem(store.keyLast); },
};

/* =================== Utils =================== */
function notify(msg = "Ok!") {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 1200);
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
const sortByTsDesc = (arr)=>[...arr].sort((a,b)=>(b.ts||0)-(a.ts||0));

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
function getAllOptions() {
  const out = [];
  els.codeSelect.querySelectorAll("option").forEach((opt) => {
    const url = opt.value?.trim();
    const label = opt.textContent?.trim();
    if (url) out.push({ label, value: url });
  });
  return out;
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

  // Detecta: Preâmbulo/Preambulo, Art./Artigo e Súmula
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

  // Conteúdo
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

  // Botões internos (mantidos, porém ocultos via CSS)
  const actions = document.createElement("div");
  actions.className = "art-actions";

  const favBtn = document.createElement("button");
  favBtn.className = "icon-btn";
  favBtn.setAttribute("aria-label", "Favoritar");
  favBtn.dataset.action = "fav";
  favBtn.innerHTML = '<img src="icons/favorito.svg" alt="Favoritar">';
  actions.appendChild(favBtn);

  const studyBtn = document.createElement("button");
  studyBtn.className = "icon-btn";
  studyBtn.setAttribute("aria-label","Estudar com I.A.");
  studyBtn.dataset.action = "study";
  studyBtn.innerHTML = '<img src="icons/estudar.svg" alt="Estudar com I.A.">';
  actions.appendChild(studyBtn);

  const planBtn = document.createElement("button");
  planBtn.className = "icon-btn";
  planBtn.setAttribute("aria-label", "Ver no Planalto");
  planBtn.dataset.action = "planalto";
  planBtn.innerHTML = '<img src="icons/link.svg" alt="Ver no Planalto">';
  actions.appendChild(planBtn);

  const id = store.makeId(el.dataset.fileUrl, el.id);
  if (store.isFavorite(id)) favBtn.classList.add("active");
  if (store.isStudied(id)) studyBtn.classList.add("active");

  el.appendChild(actions);

  wrapParensIn(el);
  return el;
}
function clearArticles(){ els.articles.innerHTML=""; state.currentArticleIdx=-1; }

/* =================== Outline (in-view) =================== */
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

/* =================== Índice (hambúrguer) =================== */
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

  const panel=document.createElement("div");
  panel.className="index-panel";
  panel.setAttribute("role","menu");
  panel.setAttribute("aria-hidden","true");
  document.body.appendChild(panel);
  els.indexPanel=panel;

  btn.addEventListener("click", ()=>{
    const show=!panel.classList.contains("show");
    panel.classList.toggle("show", show);
    panel.setAttribute("aria-hidden", show ? "false" : "true");
  });

  document.addEventListener("keydown", (e)=>{
    if (e.key==="Escape" && els.indexPanel && els.indexPanel.classList.contains("show")){
      els.indexPanel.classList.remove("show");
      els.indexPanel.setAttribute("aria-hidden","true");
    }
  });
  document.addEventListener("click", (e)=>{
    if (!els.indexPanel) return;
    if (els.indexPanel.classList.contains("show")){
      const onToggle = e.target===els.indexToggle;
      const inside = e.target.closest && e.target.closest(".index-panel");
      if (!onToggle && !inside){
        els.indexPanel.classList.remove("show");
        els.indexPanel.setAttribute("aria-hidden","true");
      }
    }
  }, {capture:true});
}
function renderIndex(){
  if (!els.indexPanel) return;
  els.indexPanel.innerHTML="";
  const headings = state.items.filter(it=>it.kind==="heading");
  if (!headings.length){
    const empty=document.createElement("div"); empty.textContent="Sem índice para este documento.";
    els.indexPanel.appendChild(empty); return;
  }
  headings.forEach((it)=>{
    const d=document.createElement("div");
    const oneLine=it.raw.replace(/\s+/g," ").trim();
    d.textContent=oneLine; d.title=oneLine;
    d.addEventListener("click", ()=>{
      const target=document.getElementById(it.htmlId);
      if (target){
        const topbar=parseInt(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h"));
        const filebar=parseInt(getComputedStyle(document.documentElement).getPropertyValue("--filebar-h"));
        const offset=topbar+filebar+12;
        const y=target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top:y, behavior:"smooth" });
      }
      els.indexPanel.classList.remove("show");
      els.indexPanel.setAttribute("aria-hidden","true");
    });
    els.indexPanel.appendChild(d);
  });
}

/* =================== Render arquivo =================== */
function renderFileItemsProgressive(items, {chunkSize=30}={}){
  clearArticles();
  if (!items.length){
    els.articles.innerHTML='<div style="padding:24px; color:#6c7282; text-align:center;">🤔 Nada aqui.</div>';
    removeIndexUI(); return;
  }
  const first=Math.min(8, items.length);
  const frag=document.createDocumentFragment();
  for (let i=0;i<first;i++){
    const it=items[i];
    frag.appendChild(it.kind==="heading" ? buildHeadingElement(it) : buildArticleElement(it));
  }
  els.articles.appendChild(frag);
  updateCurrentOutline();
  buildIndexButton(); renderIndex();

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
  const frag=document.createDocumentFragment();
  items.forEach((it)=>frag.appendChild(it.kind==="heading" ? buildHeadingElement(it) : buildArticleElement(it)));
  els.articles.appendChild(frag); updateCurrentOutline();
  buildIndexButton(); renderIndex();
}

/* =================== Favoritos =================== */
function renderFavorites(){
  clearArticles();
  const favs=store.listFavorites();
  if (!favs.length){
    els.articles.innerHTML='<div style="padding:24px; color:#6c7282; text-align:center;">⭐ Nada nos favoritos ainda.</div>';
    removeIndexUI(); return;
  }
  const order=getAllOptions().map(o=>o.value);
  const byFile=new Map();
  favs.forEach((f)=>{ const key=f.fileLabel||f.fileUrl||"Arquivo"; if (!byFile.has(key)) byFile.set(key,[]); byFile.get(key).push(f); });
  for (const [k,arr] of byFile.entries()) byFile.set(k, sortByTsDesc(arr));

  const groups = [...byFile.entries()].sort((a,b)=>{
    const aUrl=(favs.find(x=>x.fileLabel===a[0])||{}).fileUrl;
    const bUrl=(favs.find(x=>x.fileLabel===b[0])||{}).fileUrl;
    const ai=aUrl?order.indexOf(aUrl):Infinity; const bi=bUrl?order.indexOf(bUrl):Infinity;
    if (ai!==bi) return ai-bi; return a[0].localeCompare(b[0]);
  });

  const frag=document.createDocumentFragment(); let idx=0;
  groups.forEach(([label,list])=>{
    const h=document.createElement("div"); h.className="section-title"; h.textContent=label; frag.appendChild(h);
    list.forEach((entry)=>{
      const p=splitIntoBlocks(entry.text); if (!p.length) return;
      const item=parseBlockToItem(p[0],0); if (!item || item.kind!=="article") return;
      item._fileUrl=entry.fileUrl; item._fileLabel=entry.fileLabel;
      item.htmlId = entry.htmlId || item.htmlId;
      item._aidx = idx++;
      const el=buildArticleElement(item);
      el.dataset.fileUrl=entry.fileUrl; el.dataset.fileLabel=entry.fileLabel;
      const favBtn=el.querySelector('.icon-btn[data-action="fav"]');
      const id=store.makeId(entry.fileUrl, item.htmlId);
      if (store.isFavorite(id)) favBtn.classList.add("active");
      frag.appendChild(el);
    });
  });

  els.articles.appendChild(frag);
  window.scrollTo({top:0, behavior:"instant"});
  state.mode="favorites";
  store.saveLast({ mode:"favorites", fileUrl:null, scrollY:0, articleId:null });
  updateCurrentOutline();
  removeIndexUI();
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
    } catch(err){
      console.error(err);
      els.articles.innerHTML=`<div style="padding:24px; color:#a33; border:1px dashed #e7bcbc; border-radius:12px">
        Falha ao carregar:<br><code>${(err&&err.message)||"Erro desconhecido"}</code></div>`;
      notify("Erro ao carregar arquivo");
      removeIndexUI();
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
  els.finderPop.classList.add("show");

  const tokens = buildQueryTokens(q);
  if (!tokens.length){
    renderFileItemsProgressive(state.items);
    state.matchArticles = []; state.matchIdx = -1;
    els.count.textContent = "0/0";
    els.searchSuggest.classList.remove("show");
    return;
  }

  els.searchSpinner.classList.add("show");
  try{
    state.currentTokens = tokens;

    // AND
    const matchedMeta = state.articles.filter(a => tokens.every(t => a._norm.includes(t)));

    renderFileItemsAll(state.items);

    requestAnimationFrame(()=>{
      // destaca
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

/* =================== Mini Modal de Categorias =================== */
function openCat(){
  els.catBackdrop.setAttribute("aria-hidden","false");
}
function closeCatModal(){
  els.catBackdrop.setAttribute("aria-hidden","true");
}
function mountCatGrid(){
  const map = getCatalogByCategory();
  const frag = document.createDocumentFragment();
  for (const [cat, arr] of map.entries()){
    const h = document.createElement("div");
    h.className = "section-title";
    h.textContent = cat;
    frag.appendChild(h);
    arr.forEach(({label, value})=>{
      const btn = document.createElement("button");
      btn.className="cat-btn";
      btn.innerHTML = `<img src="icons/arquivo.svg" alt=""><span class="label">${label}</span>`;
      btn.addEventListener("click", async ()=>{
        closeCatModal();
        await loadFile(value, btn);
      });
      frag.appendChild(btn);
    });
  }
  els.catGrid.innerHTML="";
  els.catGrid.appendChild(frag);
}

/* =================== FAB (ações do artigo em foco) =================== */
function updateActionPreview(){
  const node = document.querySelector("article.in-view");
  const title = node?.querySelector(".art-title")?.textContent?.trim() || "—";
  els.actionContext.textContent = title;
}
function toggleActionMenu(force){
  const show = (force !== undefined) ? !!force : els.actionMenu.getAttribute("aria-hidden")==="true";
  els.actionMenu.setAttribute("aria-hidden", show ? "false" : "true");
  els.actionFab.setAttribute("aria-expanded", show ? "true" : "false");
}
function handleAction(action){
  const node = document.querySelector("article.in-view");
  if (!node) return notify("Nenhum artigo em foco.");
  const htmlId = node.id;
  const fileUrl = node.dataset.fileUrl || state.currentFileUrl || "";
  const fileLabel = node.dataset.fileLabel || state.currentFileLabel || "";
  const id = store.makeId(fileUrl, htmlId);

  if (action==="fav"){
    if (store.isFavorite(id)){
      store.removeFavorite(id);
      notify("Removido dos favoritos");
    } else {
      const text = node.innerText || "";
      store.addFavorite({ id, htmlId, fileUrl, fileLabel, text });
      notify("Adicionado aos favoritos");
    }
  } else if (action==="study"){
    const title = node.querySelector(".art-title")?.textContent?.trim() || "Artigo";
    const body  = node.querySelector(".art-body")?.innerText?.trim() || "";
    const epi   = node.querySelector(".art-epigrafe")?.innerText?.trim() || "";
    const supra = epi ? `Epígrafe: ${epi}\n` : "";
    const tema  = title;
    const prompt =
`Assuma a persona de um professor de Direito experiente convidado pelo direito.love e prepare um material de estudo.
Explique detalhadamente o artigo, súmula ou tema abaixo, sem reescrevê-lo, cobrindo:
(1) conceito detalhado; (2) checklist para provas; (3) mini exemplo prático;
(4) princípios relacionados; (5) pontos de atenção; (6) erros comuns; (7) artigos correlatos.
Responda em português claro, objetivo e didático.

Tema: "${tema}"

${supra}${title}
${body}

💚 direito.love`;
    els.promptPreview.textContent = prompt;
    els.studyModal.setAttribute("aria-hidden","false");
  } else if (action==="planalto"){
    const titleText = node.querySelector(".art-title")?.textContent?.trim() || "";
    const m = makePlanaltoUrl(fileLabel, titleText);
    if (!m) return notify("Documento não mapeado para o Planalto.");
    // tenta #artN e #artNo
    window.open(m.try1, "_blank") || window.location.assign(m.try1);
    setTimeout(()=>{ window.open(m.try2, "_blank"); }, 350);
  }
}

/* =================== Eventos =================== */
function bindEvents(){
  // Topbar
  els.brandBtn?.addEventListener("click", renderFavorites);
  els.infoBtn?.addEventListener("click", ()=> els.infoModal.setAttribute("aria-hidden","false"));
  els.closeInfo?.addEventListener("click", ()=> els.infoModal.setAttribute("aria-hidden","true"));

  // Barra secundária
  els.catTab?.addEventListener("click", ()=>{ mountCatGrid(); openCat(); });
  els.favTab?.addEventListener("click", renderFavorites);

  // Busca
  els.searchInput?.addEventListener("input", onSearchInput);
  els.searchInput?.addEventListener("keydown", (e)=>{
    if (e.key==="Enter"){ runLocalSearch(); }
    else if (e.key==="Escape"){ els.searchSuggest.classList.remove("show"); }
  });
  els.clearSearch?.addEventListener("click", ()=>{
    els.searchInput.value=""; toggleClear(); els.searchSuggest.classList.remove("show");
  });
  document.addEventListener("click", (e)=>{
    if (!e.target.closest(".search")) els.searchSuggest.classList.remove("show");
  });

  // Mini-finder
  els.prevBtn?.addEventListener("click", gotoPrev);
  els.nextBtn?.addEventListener("click", gotoNext);
  els.closeFinder?.addEventListener("click", ()=> els.finderPop.classList.remove("show"));

  // Modal estudo
  els.closeStudy?.addEventListener("click", ()=> els.studyModal.setAttribute("aria-hidden","true"));
  els.copyPromptBtn?.addEventListener("click", async ()=>{
    const txt = els.promptPreview.textContent || "";
    try { await navigator.clipboard.writeText(txt); notify("✅ Prompt copiado!"); }
    catch { notify("Não foi possível copiar."); }
  });
  document.querySelectorAll(".ia-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{ window.open(btn.dataset.url, "_blank"); });
  });

  // Modal categorias
  els.closeCat?.addEventListener("click", closeCatModal);
  els.catBackdrop?.addEventListener("click", (e)=>{ if (e.target===els.catBackdrop) closeCatModal(); });

  // FAB
  els.actionFab?.addEventListener("click", ()=> toggleActionMenu());
  document.getElementById("actionMenu")?.addEventListener("click", (e)=>{
    const btn = e.target.closest(".menu-btn");
    if (!btn) return;
    handleAction(btn.dataset.action);
    toggleActionMenu(false);
  });
  document.addEventListener("click", (e)=>{
    if (!e.target.closest("#actionMenu") && !e.target.closest("#actionFab")){
      toggleActionMenu(false);
    }
  });

  // Scroll / Outline
  window.addEventListener("scroll", updateCurrentOutline, {passive:true});
  window.addEventListener("resize", updateCurrentOutline);
}

/* =================== Boot =================== */
(function init(){
  buildCatalogMaps();
  bindEvents();

  // Inicia em Favoritos (como combinado)
  renderFavorites();

  // Restaura último arquivo, se quiser (opcional)
  const last = store.getLast();
  if (last?.mode==="file" && last.fileUrl){
    // comentar a linha abaixo caso deseje sempre começar em Favoritos
    // loadFile(last.fileUrl);
  }
})();
