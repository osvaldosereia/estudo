/* direito.love — app.js (rev UX/UI — busca ok, chips, consultar) */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

/* Helpers */
const $ = (s) => document.querySelector(s);
const escHTML = (s) => (s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

/* Elements */
const els = {
  form: $("#searchForm"),
  q: $("#searchInput"),
  spinner: $("#searchSpinner"),
  stack: $("#resultsStack"),
  brand: $("#brandBtn"),
  codeSelect: $("#codeSelect"),

  chipsBar: $("#chipsBar"),
  chipsScroll: $("#chipsBar .chips-scroll"),
  chipsPrev: $("#chipsBar .chips-prev"),
  chipsNext: $("#chipsBar .chips-next"),

  studyBtn: $("#studyBtn"),
  questionsBtn: $("#questionsBtn"),
  viewBtn: $("#viewBtn"),

  readerModal: $("#readerModal"),
  readerBody: $("#readerBody"),
  readerTitle: $("#readerTitle"),
  selCount: $("#selCount"),

  selectedModal: $("#selectedModal"),
  selectedStack: $("#selectedStack"),

  studyModal: $("#studyModal"),
  studyList: $("#studyList"),
  studyUpdate: $("#studyUpdate"),
  copyPromptBtn: $("#copyPromptBtn"),

  questionsModal: $("#questionsModal"),
  questionsList: $("#questionsList"),
  questionsUpdate: $("#questionsUpdate"),
  copyQuestionsBtn: $("#copyQuestionsBtn"),
  includeObsBtn: $("#includeObsBtn"),
  questionsObs: $("#questionsObs"),

  toasts: $("#toasts"),
};

/* Estado */
const MAX_SEL = 6;
const CARD_CHAR_LIMIT = 250;
const state = {
  selected: new Map(),
  cacheTxt: new Map(),
  cacheParsed: new Map(),
};

/* Toast */
function toast(msg, ms=2000){
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  els.toasts.appendChild(el);
  setTimeout(()=> el.remove(), ms);
}

/* Busca — tokenização e regras */
function tokenize(query){
  const q = norm(query);
  const raw = q.split(/\s+/).filter(Boolean);
  const tokens = [];
  for (const w of raw) {
    if (/^\d{1,4}$/.test(w)) tokens.push(w);
    else if (/^[a-z]{3,}$/.test(w)) tokens.push(w);
  }
  return Array.from(new Set(tokens));
}
function splitTokens(tokens){
  const wordTokens=[], numTokens=[];
  for (const t of tokens) (/^\d{1,4}$/.test(t) ? numTokens : wordTokens).push(t);
  return {wordTokens,numTokens};
}
function hasExactNumber(bag, n){ return new RegExp(`(?:^|\\D)${n}(?:\\D|$)`,`g`).test(bag); }
function extractLegalRefs(text){
  const rx = /\b(art\.?|artigo|s[uú]mula)\b[^0-9a-zA-Z]{0,12}(\d{1,4}[a-zA-Z\-]?)\b/giu;
  const out = new Set(); let m;
  while ((m = rx.exec(text)) !== null) {
    const puro = (m[2]||"").toLowerCase().match(/^\d{1,4}/)?.[0];
    if (puro) out.add(puro);
  }
  return out;
}
function getBagWords(bag){ return bag.match(/\b[a-z0-9]{3,}\b/g) || []; }
function escapeRx(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }
function withinOneSubstitutionStrict(a,b){
  if (a.length !== b.length) return false;
  if (a.length < 4) return a === b;
  if (a[0]!==b[0] || a[a.length-1]!==b[b.length-1]) return false;
  let diff=0; for(let i=0;i<a.length;i++){ if(a[i]!==b[i] && ++diff>1) return false; }
  return diff===1;
}
function pluralVariants(t){
  const v=new Set([t]);
  if(!t.endsWith("s")){ v.add(t+"s"); v.add(t+"es"); }
  else { v.add(t.slice(0,-1)); }
  if(t.endsWith("m")) v.add(t.slice(0,-1)+"ns");
  if(t.endsWith("ao")){ const base=t.slice(0,-2); v.add(base+"oes"); v.add(base+"aos"); v.add(base+"aes"); }
  return [...v];
}
function bagHasTokenWord(bag, token){
  const words=getBagWords(bag); const vars=pluralVariants(token);
  const rx=new RegExp(`\\b(${vars.map(escapeRx).join("|")})\\b`,`i`);
  if(rx.test(bag)) return true;
  for(const w of words){ for(const v of vars){ if(withinOneSubstitutionStrict(v,w)) return true; } }
  return false;
}
function hasAllWordTokens(bag, wordTokens){ return wordTokens.every(w=> bagHasTokenWord(bag,w)); }
function matchesNumbers(item, numTokens, queryHasLegalKeyword){
  if (!numTokens.length) return true;
  const bag = norm(item.text);
  if (!queryHasLegalKeyword) return numTokens.every(n => hasExactNumber(bag, n));
  const near = extractLegalRefs(item.text);
  return numTokens.every(n => near.has(n));
}

/* Fetch & parse */
function sanitize(s){ return String(s).replace(/\uFEFF/g,"").replace(/\u00A0/g," ").replace(/\r\n?/g,"\n").replace(/[ \t]+\n/g,"\n"); }
async function fetchText(url){
  url = encodeURI(url);
  if (state.cacheTxt.has(url)) return state.cacheTxt.get(url);
  const r = await fetch(url, {cache:"no-cache"});
  if (!r.ok) throw new Error(`fetch-fail ${r.status} ${url}`);
  const t = sanitize(await r.text());
  state.cacheTxt.set(url,t); return t;
}
function splitBlocks(txt){
  return sanitize(txt).split(/^\s*-{5,}\s*$/m).map(s=>s.trim()).filter(Boolean);
}
function parseBlock(block, idx, fileUrl, sourceLabel){
  const lines = block.split("\n");
  const firstIdx = lines.findIndex(l=> l.trim().length>0);
  const first = firstIdx>=0 ? lines[firstIdx].trim() : `Bloco ${idx+1}`;
  const rest  = lines.slice(firstIdx+1).join("\n").trim();
  const full  = [first,rest].filter(Boolean).join("\n");
  return { id:`${fileUrl}::art-${idx}`, htmlId:`art-${idx}`, source:sourceLabel, title:first, body:rest, text:full, fileUrl };
}
async function parseFile(url, sourceLabel){
  if (state.cacheParsed.has(url)) return state.cacheParsed.get(url);
  const txt = await fetchText(url);
  const items = splitBlocks(txt).map((b,i)=> parseBlock(b,i,url,sourceLabel));
  state.cacheParsed.set(url, items);
  return items;
}

/* Respiros (visual) */
function addRespirationsForDisplay(s){
  if (!s) return "";
  const RX_INCISO=/^(?:[IVXLCDM]{1,8})(?:\s*(?:\)|\.|[-–—]))(?:\s+|$)/;
  const RX_PARAGR=/^(?:§+\s*\d+\s*[ºo]?|Par[aá]grafo\s+(?:[Uu]nico|\d+)\s*[ºo]?)(?:\s*[:.\-–—])?(?:\s+|$)/i;
  const RX_ALINEA=/^[a-z](?:\s*(?:\)|\.|[-–—]))(?:\s+|$)/;
  const RX_TITULO=/^(?:T[ÍI]TULO|CAP[ÍI]TULO|SEÇÃO|SUBSEÇÃO|LIVRO)\b/i;
  const lines=String(s).replace(/\r\n?/g,"\n").split("\n"); const out=[];
  for(const ln0 of lines){ const ln=ln0.trim();
    const isMarker = RX_PARAGR.test(ln)||RX_INCISO.test(ln)||RX_ALINEA.test(ln)||RX_TITULO.test(ln);
    if (isMarker && out.length && out[out.length-1] !== "") out.push("");
    if (ln==="" && out.length && out[out.length-1]==="") continue;
    out.push(ln);
  }
  return out.join("\n");
}

/* Destaque & preview */
function highlight(text, tokens){
  if (!tokens?.length) return escHTML(text||"");
  const srcEsc = escHTML(text||"");
  const srcNFD = srcEsc.normalize("NFD");
  const toDiacriticRx = (t)=> t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\p{L}/gu,(ch)=> ch+"\\p{M}*");
  const parts = tokens.filter(Boolean).map(toDiacriticRx);
  if (!parts.length) return srcEsc;
  const rx = new RegExp(`\\b(${parts.join("|")})\\b`,"giu");
  const markedNFD = srcNFD.replace(rx,"<mark class='hl'>$1</mark>");
  return markedNFD.normalize("NFC");
}
function truncatedHTML(fullText, tokens){
  const base = fullText || "";
  let out = base.slice(0, CARD_CHAR_LIMIT);
  const cut = out.lastIndexOf(" ");
  if (base.length > CARD_CHAR_LIMIT && cut > CARD_CHAR_LIMIT * .7) out = out.slice(0, cut) + "…";
  else if (base.length > CARD_CHAR_LIMIT) out = out.trim() + "…";
  return highlight(escHTML(out), tokens);
}

/* Planalto “consultar” */
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
  ["Código Florestal","https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12651.htm"],
  ["Lei Maria da Penha","https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2006/lei/l11340.htm"],
  ["Lei de Execução Penal","https://www.planalto.gov.br/ccivil_03/leis/l7210.htm"],
  ["Lei de Drogas","https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11343.htm"],
  ["Lei da Improbidade Administrativa","https://www.planalto.gov.br/ccivil_03/leis/l8429.htm"],
  ["Mandado de Segurança","https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2009/lei/l12016.htm"],
  ["ECA","https://www.planalto.gov.br/ccivil_03/leis/l8069.htm"],
  ["Estatuto da OAB","https://www.planalto.gov.br/ccivil_03/leis/l8906.htm"],
  ["Cód. Proc. Penal Militar","https://www.planalto.gov.br/ccivil_03/decreto-lei/del1002.htm"],
  ["Cód. Penal Militar","https://www.planalto.gov.br/ccivil_03/decreto-lei/del1001.htm"]
]);
function extractArticleLabel(title){
  const m = (title||"").match(/Art\.?\s*(\d{1,4}[A-Za-zÀ-ÿ\-]*)/);
  return m ? `Art. ${m[1]}` : null;
}
function planaltoUrlFor(item){
  const base = PLANALTO_MAP.get(item.source) || null;
  const art = extractArticleLabel(item.title || item.text || "");
  if (base && art) return base; // abre a lei base; âncoras variam no Planalto
  const q = encodeURIComponent(`${extractArticleLabel(item.title||item.text||"")||""} ${item.source} site:planalto.gov.br`);
  return `https://www.google.com/search?q=${q}`;
}

/* Render */
function renderCard(item, tokens=[], ctx={context:"results"}){
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = item.id;

  const left = document.createElement("div");

  const pill = document.createElement("a");
  pill.href="#"; pill.className="pill"; pill.textContent=item.source;
  pill.addEventListener("click",(e)=>{e.preventDefault(); openReader(item);});

  const body = document.createElement("div");
  body.className="body is-collapsed";
  body.innerHTML = truncatedHTML(item.text, tokens);
  body.style.cursor="pointer";
  body.addEventListener("click", ()=> openReader(item));

  const actions = document.createElement("div");
  actions.className="actions";

  const toggle = document.createElement("button");
  toggle.className="toggle";
  toggle.textContent="ver texto";
  toggle.addEventListener("click", ()=>{
    const collapsed = body.classList.toggle("is-collapsed");
    if (collapsed){ body.innerHTML = truncatedHTML(item.text, tokens); toggle.textContent="ver texto"; }
    else { body.innerHTML = highlight(item.text, tokens); toggle.textContent="ocultar"; }
  });

  const consult = document.createElement("a");
  consult.href="#"; consult.className="toggle"; consult.textContent="consultar";
  consult.addEventListener("click",(e)=>{ e.preventDefault(); window.open(planaltoUrlFor(item), "_blank","noopener"); });

  left.append(pill, body, actions);
  actions.append(toggle, consult);

  const chk = document.createElement("button");
  chk.className="chk";
  chk.setAttribute("aria-label","Selecionar bloco");
  chk.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const sync = ()=>{ chk.dataset.checked = state.selected.has(item.id) ? "true" : "false"; };
  sync();
  chk.addEventListener("click", ()=>{
    if (state.selected.has(item.id)) {
      state.selected.delete(item.id);
      toast(`Removido (${state.selected.size}/${MAX_SEL}).`);
      if (ctx.context === "selected") card.remove();
    } else {
      if (state.selected.size >= MAX_SEL){ toast("⚠️ Limite de 6 blocos."); return; }
      state.selected.set(item.id, {...item});
      toast(`Adicionado (${state.selected.size}/${MAX_SEL}).`);
    }
    sync(); updateBottom();
  });

  card.append(left, chk);
  return card;
}

function renderBlock(term, items, tokens){
  const block = document.createElement("section");
  block.className="block";
  const title = document.createElement("div");
  title.className="block-title";
  title.textContent = `Busca: ‘${term}’ (${items.length} resultados)`;
  block.appendChild(title);

  if (!items.length){
    const empty = document.createElement("div");
    empty.className="block-empty";
    empty.textContent = `Nada por aqui com ‘${term}’. Tente outra palavra.`;
    block.appendChild(empty);
  } else {
    items.forEach(it => block.appendChild(renderCard(it, tokens)));
  }
  els.stack.appendChild(block);
}

/* Chips */
function buildChips(results){
  const set = new Set(results.map(r => r.source));
  const list = ["Todos", ...set];
  els.chipsScroll.innerHTML = "";

  list.forEach((name, i)=>{
    const b = document.createElement("button");
    b.className="chip"; b.type="button"; b.textContent=name;
    b.setAttribute("aria-pressed", i===0 ? "true" : "false");
    b.addEventListener("click", ()=>{
      els.chipsScroll.querySelectorAll(".chip").forEach(x=> x.setAttribute("aria-pressed","false"));
      b.setAttribute("aria-pressed","true");
      filterByChip(name);
    });
    els.chipsScroll.appendChild(b);
  });

  els.chipsBar.hidden = false;
  const scroll = els.chipsScroll;
  els.chipsPrev?.addEventListener("click", ()=> scroll.scrollBy({left:-200, behavior:"smooth"}));
  els.chipsNext?.addEventListener("click", ()=> scroll.scrollBy({left:200, behavior:"smooth"}));
}
function filterByChip(name){
  const cards = els.stack.querySelectorAll(".card");
  if (name==="Todos"){ cards.forEach(c=> c.hidden=false); return; }
  cards.forEach(c=>{
    const pill = c.querySelector(".pill");
    const src = pill ? pill.textContent.trim() : "";
    c.hidden = (src !== name);
  });
}

/* Modais / seleção / base */
function showModal(el){ if (el){ el.hidden=false; document.body.style.overflow="hidden"; } }
function hideModal(el){ if (el){ el.hidden=true; document.body.style.overflow=""; } }
function updateBottom(){
  const n = state.selected.size;
  if (els.viewBtn) els.viewBtn.textContent = `${n} Selecionados – Ver`;
  if (els.studyBtn) els.studyBtn.disabled = n===0;
  if (els.questionsBtn) els.questionsBtn.disabled = n===0;
  if (els.selCount) els.selCount.textContent = `${n}/${MAX_SEL}`;
}

/* Abrir Leitor (mostra arquivo inteiro com respiros) */
async function openReader(item, tokens=[]){
  if (els.readerTitle) els.readerTitle.textContent = item.source;
  if (els.selCount) els.selCount.textContent = `${state.selected.size}/${MAX_SEL}`;
  if (els.readerBody) els.readerBody.innerHTML = "";
  showModal(els.readerModal);

  for (let i=0;i<3;i++){ const s=document.createElement("div"); s.className="skel block"; s.style.margin="10px 0"; els.readerBody.appendChild(s); }

  try{
    const items = await parseFile(item.fileUrl, item.source);
    els.readerBody.innerHTML = "";
    items.forEach((a)=>{
      const row = document.createElement("div");
      row.className="article"; row.id=a.htmlId;

      const chk = document.createElement("button");
      chk.className="chk a-chk"; chk.setAttribute("aria-label","Selecionar bloco");
      chk.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const sync=()=>{ chk.dataset.checked = state.selected.has(a.id) ? "true":"false"; }; sync();
      chk.addEventListener("click", ()=>{
        if (state.selected.has(a.id)) state.selected.delete(a.id);
        else {
          if (state.selected.size >= MAX_SEL){ toast("⚠️ Limite de 6 blocos."); return; }
          state.selected.set(a.id, a);
        }
        if (els.selCount) els.selCount.textContent = `${state.selected.size}/${MAX_SEL}`;
        sync(); updateBottom();
      });

      const body = document.createElement("div");
      const h4 = document.createElement("h4");
      h4.textContent = `${a.title} — ${a.source}`;
      const txt = document.createElement("div");
      txt.className="a-body";
      const withBreaks = addRespirationsForDisplay(a.body || a.text);
      const withMarks  = highlight(withBreaks, tokens);
      txt.innerHTML = withMarks.replace(/\n/g,"<br>");

      body.append(h4, txt);
      row.append(chk, body);
      els.readerBody.appendChild(row);
    });

    const anchor = els.readerBody.querySelector(`#${CSS.escape(item.htmlId)}`);
    if (anchor){ anchor.scrollIntoView({block:"center", behavior:"instant"}); anchor.classList.add("highlight"); setTimeout(()=>anchor.classList.remove("highlight"), 1800); }
    els.readerBody.focus();
  }catch(e){ toast("Erro ao abrir o arquivo."); console.warn(e); hideModal(els.readerModal); }
}

/* Eventos */
els.form?.addEventListener("submit", (e)=>{ e.preventDefault(); doSearch(); });
els.q?.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ e.preventDefault(); doSearch(); }});
els.brand?.addEventListener("click", ()=>{ if(els.q) els.q.value=""; if(els.stack) els.stack.innerHTML=""; toast("Busca reiniciada."); });

document.addEventListener("click", (e)=>{
  if (e.target.matches("[data-close-modal]")) hideModal(els.readerModal);
  if (e.target.matches("[data-close-study]")) hideModal(els.studyModal);
  if (e.target.matches("[data-close-questions]")) hideModal(els.questionsModal);
  if (e.target.matches("[data-close-sel]")) hideModal(els.selectedModal);

  if (els.readerModal && e.target === els.readerModal.querySelector(".modal-backdrop")) hideModal(els.readerModal);
  if (els.studyModal && e.target === els.studyModal.querySelector(".modal-backdrop")) hideModal(els.studyModal);
  if (els.questionsModal && e.target === els.questionsModal.querySelector(".modal-backdrop")) hideModal(els.questionsModal);
  if (els.selectedModal && e.target === els.selectedModal.querySelector(".modal-backdrop")) hideModal(els.selectedModal);
});
document.addEventListener("keydown", (e)=>{
  if (e.key==="Escape"){
    if (els.readerModal && !els.readerModal.hidden) hideModal(els.readerModal);
    if (els.studyModal && !els.studyModal.hidden) hideModal(els.studyModal);
    if (els.questionsModal && !els.questionsModal.hidden) hideModal(els.questionsModal);
    if (els.selectedModal && !els.selectedModal.hidden) hideModal(els.selectedModal);
  }
});

/* Ver / Estudar / Questões */
els.viewBtn?.addEventListener("click", ()=>{
  const container = els.selectedStack; if (!container) return;
  container.innerHTML = "";
  if (!state.selected.size){
    const empty = document.createElement("div"); empty.className="block-empty"; empty.textContent="Nenhum bloco selecionado."; container.appendChild(empty);
  } else {
    for (const it of state.selected.values()){
      const c = renderCard(it, [], {context:"selected"});
      container.appendChild(c);
    }
  }
  showModal(els.selectedModal);
});
els.studyBtn?.addEventListener("click", ()=>{ if (state.selected.size) showModal(els.studyModal); });
els.questionsBtn?.addEventListener("click", ()=>{ if (state.selected.size) showModal(els.questionsModal); });

/* Execução da busca */
async function doSearch(){
  const term = (els.q?.value || "").trim();
  if (!term) return;

  els.stack.innerHTML="";
  els.stack.setAttribute("aria-busy","true");
  const skel=document.createElement("section"); skel.className="block";
  const t=document.createElement("div"); t.className="block-title"; t.textContent=`Busca: ‘${term}’ (…)`; skel.appendChild(t);
  for(let i=0;i<2;i++){ const s=document.createElement("div"); s.className="skel block"; skel.appendChild(s); }
  els.stack.appendChild(skel);
  els.spinner?.classList.add("show");

  try{
    const tokens = tokenize(term);
    const normQuery = norm(term);
    const queryHasLegalKeyword = /\b(art|art\.|artigo|s[uú]mula)\b/i.test(normQuery);
    const {wordTokens, numTokens} = splitTokens(tokens);

    const results = [];
    const allOptions = Array.from(els.codeSelect?.querySelectorAll("option")||[])
      .map(o=>({url:(o.value||"").trim(), label:(o.textContent||"").trim()}))
      .filter(o=>o.url);

    for (const {url,label} of allOptions){
      try{
        const items = await parseFile(url, label);
        for (const it of items){
          const bag = norm(it.text);
          const okWords = hasAllWordTokens(bag, wordTokens);
          const okNums  = matchesNumbers(it, numTokens, queryHasLegalKeyword);
          if (okWords && okNums) results.push(it);
        }
      }catch(e){ console.warn("Falha ao buscar:", label, e); }
    }

    skel.remove();
    renderBlock(term, results, tokens);
    buildChips(results);
    toast(`${results.length} resultado(s) encontrados.`);
  } finally {
    els.stack.setAttribute("aria-busy","false");
    els.spinner?.classList.remove("show");
    els.q?.select();
  }
}
/* ===== Altura real da topbar no mobile (duas faixas) ===== */
function setMobileTopbarHeight() {
  if (!window.matchMedia('(max-width: 767px)').matches) return;
  const tb = document.querySelector('.topbar');
  if (!tb) return;
  const h = tb.offsetHeight || 112; // fallback
  document.documentElement.style.setProperty('--topbar-mobile-h', h + 'px');
}

/* recalcula quando muda o layout */
window.addEventListener('load', setMobileTopbarHeight);
window.addEventListener('resize', setMobileTopbarHeight);
new MutationObserver(setMobileTopbarHeight).observe(document.body, {subtree:true, childList:true});

/* init */
updateBottom();
setMobileTopbarHeight();

