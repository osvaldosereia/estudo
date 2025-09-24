/* ==========================
   direito.love — app.js (2025-09 • minimal + IA panel + dataEngine stubs)
   ========================== */

/* Service Worker (opcional) */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const now = () => Date.now();
function debounce(fn, ms=150){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
function escapeHtml(s){ return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function isTextInput(el){ return ["INPUT","TEXTAREA"].includes(el?.tagName) || el?.isContentEditable; }

/* ---------- elementos ---------- */
const els = {
  app: $("#app"),
  stack: $("#resultsStack"),
  live: $("#live"),

  // Splash
  splash: $("#splash"),
  splashForm: $("#splashForm"),
  splashInput: $("#splashInput"),

  // FABs
  fabCluster: $(".fab-cluster"),
  fabLogo: $("#fabLogo"),
  fabAction: $("#fabAction"),
  fabActionLabel: $("#fabActionLabel"),
  fabSearch: $("#fabSearch"),
  fabSearchWrap: $(".fab-search-wrap"),
  fabSearchForm: $("#fabSearchForm"),
  fabSearchInput: $("#fabSearchInput"),

  // IA Sheet
  iaSheet: $("#iaSheet"),
  iaSheetTitle: $("#iaSheetTitle"),
  iaCurrent: $("#iaCurrent"),
};

/* ---------- estado ---------- */
let selectedCard = null;
let selectPausedUntil = 0; // focus-lock
let io, observed = [];

/* ==========================
   dataEngine — STUBS prontos pra plugar /data/
   ========================== */
const dataEngine = {
  /** Carrega índices/arquivos, se precisar */
  async loadIndex(){
    // TODO: aqui você pluga a leitura de /data/ (fetch JSON, etc.)
    // por agora, nada a fazer (stub)
    return true;
  },
  /** Busca por q e retorna { groups: [{title, items:[{title, preview, code, articleId}]}] } */
  async search(q){
    // TODO: substituir por busca real em /data/
    // STUB: um grupo único com 7 itens artificiais
    if(!q || q.trim().length < 2){
      return { groups: [] };
    }
    const items = Array.from({length:7}, (_,i)=>({
      title: `Título do item ${i+1}`,
      preview: `Trecho inicial do conteúdo ${i+1}. Texto curto de prévia para leitura rápida…`,
      code: "Penal",
      articleId: `art_${i+1}`
    }));
    return { groups: [{ title: `Resultados para “${q}”`, items }] };
  },
  /** Abre modal real (texto/código) — placeholder por enquanto */
  async open({code, articleId, mode="text"}){
    toast(`(stub) Abrindo ${mode} — ${code} / ${articleId}`);
  }
};

/* ---------- init ---------- */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

async function init(){
  await dataEngine.loadIndex();
  setupSplash();
  setupFabCluster();
  setupKeyboardShortcuts();
  setupSheet();
  // demo: se não é primeira visita e não há resultados, mostra uma busca inicial
  if(localStorage.getItem("dl_firstVisitDone") === "1" && !els.stack.children.length){
    runSearch("art. 129 CP");
    pulseSearchOnce();
  }
}

/* ---------- Splash ---------- */
function setupSplash(){
  const first = localStorage.getItem("dl_firstVisitDone") !== "1";
  setSplashVisible(first);
  els.splashForm?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const q = (els.splashInput?.value || "").trim();
    if(!q) return;
    await runSearch(q);
    localStorage.setItem("dl_firstVisitDone","1");
    setSplashVisible(false);
    pulseSearchOnce(); // descobre a lupa sutilmente
  });
}
function setSplashVisible(v){
  els.splash?.setAttribute("aria-hidden", v ? "false":"true");
}

/* ---------- FABs ---------- */
function setupFabCluster(){
  // Logo → topo
  els.fabLogo?.addEventListener("click", ()=> window.scrollTo({top:0, behavior:"smooth"}));

  // Lupa retrátil
  els.fabSearch?.addEventListener("click", ()=>{
    const open = els.fabSearchWrap.getAttribute("aria-expanded") === "true";
    setSearchOpen(!open);
  });
  els.fabSearchForm?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const q = (els.fabSearchInput?.value || "").trim();
    if(!q) { setSearchOpen(false); return; }
    await runSearch(q);
    setSearchOpen(false);
    els.fabSearchInput.value = "";
  });

  // Ação principal → abre o painel das IAs
  els.fabAction?.addEventListener("click", ()=>{
    if(!selectedCard){ blinkCluster(); return; }
    openSheet();
    selectPausedUntil = now()+2000; // pausa auto-seleção
  });
}
function setSearchOpen(open){
  els.fabSearchWrap.setAttribute("aria-expanded", open ? "true":"false");
  if(open){ setTimeout(()=> els.fabSearchInput?.focus(), 10); }
}
function pulseSearchOnce(){
  els.fabSearch?.classList.add("pulse-once");
  els.fabSearch?.addEventListener("animationend", ()=> els.fabSearch?.classList.remove("pulse-once"), {once:true});
}
function blinkCluster(){
  els.fabCluster?.animate([{transform:"translateY(0)"},{transform:"translateY(-3px)"},{transform:"translateY(0)"}], {duration:180});
}

/* ---------- Busca (usa dataEngine) ---------- */
async function runSearch(q){
  renderSkeleton();
  await sleep(200); // latência leve
  const res = await dataEngine.search(q);
  els.stack.innerHTML = "";

  if(!res.groups.length){
    renderEmptyState(q);
    return;
  }

  for(const g of res.groups){
    els.stack.appendChild(elGroup(g.title, g.items));
  }
  renderEndState();

  await sleep(30);
  setupAutoSelection();
  updateFabActionLabel();
}

/* ---------- UI: Skeleton / Empty / End ---------- */
function renderSkeleton(){
  els.stack.innerHTML = `
    <div class="skel" aria-hidden="true">
      <div class="skel-card">
        <div class="skel-line w60"></div>
        <div class="skel-line w80"></div>
        <div class="skel-line w40"></div>
      </div>
      <div class="skel-card">
        <div class="skel-line w60"></div>
        <div class="skel-line w80"></div>
        <div class="skel-line w40"></div>
      </div>
    </div>
  `;
}
function renderEmptyState(q){
  els.stack.innerHTML = `
    <div class="group" role="region" aria-label="Sem resultados">
      <div class="state-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 015.292 13.708l4 4a1 1 0 11-1.414 1.414l-4-4A8 8 0 1110 2zm0 2a6 6 0 100 12 6 6 0 000-12z"/></svg>
        Nenhum resultado para <strong>${escapeHtml(q || "")}</strong>.<br/>
        Tente: <em>art. 129</em> ou <em>insignificância</em>.
      </div>
    </div>
  `;
}
function renderEndState(){
  const end = document.createElement("div");
  end.className = "state-end";
  end.textContent = "— fim —";
  els.stack.appendChild(end);
}

/* ---------- UI: Grupo/Itens (flat, sem botões nos cards) ---------- */
let groupCounter = 0;
function elGroup(title, items){
  const gid = `group_${++groupCounter}`;

  const g = document.createElement("section");
  g.className = "group";
  g.setAttribute("aria-expanded","false");
  g.setAttribute("aria-labelledby", `${gid}_h`);

  const h = document.createElement("button");
  h.className = "group-h";
  h.type = "button";
  h.id = `${gid}_h`;
  h.setAttribute("aria-controls", `${gid}_body`);
  h.setAttribute("aria-expanded", "false");
  h.innerHTML = `
    <span class="group-title">${escapeHtml(title)}</span>
    <span class="group-meta">${items.length} itens</span>
    <span class="chev" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M6 9l6 6 6-6"/></svg>
    </span>
  `;
  h.addEventListener("click", ()=>{
    const open = g.getAttribute("aria-expanded")==="true";
    g.setAttribute("aria-expanded", open ? "false":"true");
    h.setAttribute("aria-expanded", open ? "false":"true");
    reobserveCards();
  });

  const body = document.createElement("div");
  body.className = "group-body";
  body.id = `${gid}_body`;

  for(const it of items){
    const c = document.createElement("article");
    c.className = "card";
    c.tabIndex = 0;
    c.dataset.code = it.code || "";
    c.dataset.articleId = it.articleId || "";
    c.innerHTML = `
      <div class="card-title">
        <span class="pill">${escapeHtml(it.code || "—")}</span>
        <strong>${escapeHtml(it.title || "Item")}</strong>
      </div>
      <p class="card-text">${escapeHtml(it.preview || "")}</p>
    `;
    // Clique/foco no card apenas controla seleção
    c.addEventListener("click", ()=> { setSelectedCard(c); selectPausedUntil = now()+1200; });
    c.addEventListener("focusin", ()=> { setSelectedCard(c); selectPausedUntil = now()+1200; });
    body.appendChild(c);
  }

  g.append(h, body);
  return g;
}

/* ---------- Auto-seleção (IntersectionObserver) ---------- */
function setupAutoSelection(){
  cleanupObserver();
  io = new IntersectionObserver(onIntersect, {
    root:null, rootMargin:"0px", threshold:[0,.25,.5,.6,.75,1]
  });
  reobserveCards();
  window.addEventListener("scroll", debounce(updateFabActionLabel, 120), {passive:true});
}
function cleanupObserver(){
  if(io && observed.length){ observed.forEach(el=> io.unobserve(el)); }
  observed = [];
}
function reobserveCards(){
  if(!io) return;
  observed.forEach(el=> io.unobserve(el));
  observed = $$(".group[aria-expanded='true'] .card");
  observed.forEach(el=> io.observe(el));
  if(selectedCard && !observed.includes(selectedCard)){
    setSelectedCard(null);
  }
}
const onIntersect = debounce((entries)=>{
  if(now() < selectPausedUntil) return; // focus-lock
  const visibles = entries
    .filter(en => en.isIntersecting && en.intersectionRatio >= .6)
    .map(en => en.target);
  if(!visibles.length) return;
  const byBottom = visibles
    .map(el => ({el, rect: el.getBoundingClientRect()}))
    .sort((a,b)=> (a.rect.bottom - b.rect.bottom));
  const last = byBottom[byBottom.length-1]?.el;
  if(last) setSelectedCard(last);
}, 140);

/* ---------- Seleção, rótulo e Live region ---------- */
function setSelectedCard(card){
  if(card === selectedCard) return;
  if(selectedCard) selectedCard.classList.remove("is-selected");
  selectedCard = card || null;
  if(selectedCard) selectedCard.classList.add("is-selected");
  updateFabActionLabel();
}
function updateFabActionLabel(){
  const title = cardTitle(selectedCard);
  const label = title ? `Ver texto — ${title}` : `Selecione um item`;
  els.fabActionLabel.textContent = label;
  els.live && (els.live.textContent = label);
}
function cardTitle(card){
  return card?.querySelector("strong")?.textContent?.trim() || "";
}

/* ---------- Teclado ---------- */
function setupKeyboardShortcuts(){
  document.addEventListener("keydown", (ev)=>{
    // "/" abre busca
    if(ev.key === "/" && !isTextInput(ev.target)){
      ev.preventDefault();
      setSearchOpen(true);
      return;
    }
    // Esc fecha busca ou sheet
    if(ev.key === "Escape"){
      if(els.iaSheet.getAttribute("aria-hidden")==="false"){ closeSheet(); return; }
      if(els.fabSearchWrap.getAttribute("aria-expanded")==="true"){ setSearchOpen(false); return; }
    }
    // Navegação por setas entre cards visíveis
    if(ev.key === "ArrowDown" || ev.key === "ArrowUp"){
      const visible = $$(".group[aria-expanded='true'] .card");
      if(!visible.length) return;
      let idx = selectedCard ? visible.indexOf(selectedCard) : -1;
      if(ev.key === "ArrowDown") idx = Math.min(idx+1, visible.length-1);
      if(ev.key === "ArrowUp") idx = Math.max(idx-1, 0);
      setSelectedCard(visible[idx]);
      visible[idx].focus();
      ev.preventDefault();
    }
    // Enter/Space ativa ação se estiver num card
    if((ev.key === "Enter" || ev.key === " ") && selectedCard && !isTextInput(ev.target)){
      ev.preventDefault();
      openSheet();
      selectPausedUntil = now()+2000;
    }
  });
}

/* ---------- IA Sheet ---------- */
function setupSheet(){
  // fechar por backdrop/ícone
  els.iaSheet?.addEventListener("click", (e)=>{
    if(e.target.matches("[data-sheet-dismiss]")) closeSheet();
  });
  els.iaSheet?.querySelector(".sheet-close")?.addEventListener("click", closeSheet);

  // clicks nas IAs (sem integração real ainda)
  $$(".chip-ia").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const ia = btn.getAttribute("data-ia");
      const title = cardTitle(selectedCard) || "Item";
      toast(`(stub) ${ia} — usando “${title}”`);
      // manter sheet aberto ou fechar? Vamos fechar para fluxo limpo
      closeSheet();
    });
  });
}
function openSheet(){
  const title = cardTitle(selectedCard) || "Item selecionado";
  $("#iaCurrent").textContent = title;
  els.iaSheet.setAttribute("aria-hidden","false");
}
function closeSheet(){
  els.iaSheet.setAttribute("aria-hidden","true");
}

/* ---------- Toast simples ---------- */
let toastT;
function toast(text){
  clearTimeout(toastT);
  let el = $("#toast");
  if(!el){
    el = document.createElement("div");
    el.id = "toast";
    Object.assign(el.style,{
      position:"fixed",left:"50%",bottom:"calc(var(--safe) + 88px)",transform:"translateX(-50%)",
      background:"#111",color:"#fff",padding:"10px 14px",borderRadius:"10px",
      zIndex:9999,fontSize:"14px",maxWidth:"80vw",textAlign:"center",opacity:"0",transition:"opacity .15s ease"
    });
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = "1";
  toastT = setTimeout(()=> el.style.opacity = "0", 1400);
}
