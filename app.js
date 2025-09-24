/* ==========================
   direito.love — app.js (2025-09 • minimal + UX polido)
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

function debounce(fn, ms=150){
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
}

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
};

/* ---------- estado ---------- */
let selectedCard = null;
let selectPausedUntil = 0; // focus-lock
let io, observed = [];

/* ---------- init ---------- */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

function init(){
  setupSplash();
  setupFabCluster();
  setupKeyboardShortcuts();
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
    pulseSearchOnce(); // mostra a lupa com pulse sutil após entrar
  });
}

function setSplashVisible(v){
  if(!els.splash) return;
  els.splash.setAttribute("aria-hidden", v ? "false":"true");
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

  // Ação principal
  els.fabAction?.addEventListener("click", ()=>{
    if(!selectedCard){ blinkCluster(); return; }
    applyPrimaryAction(selectedCard);
    selectPausedUntil = now()+2000; // pausa auto-seleção
  });
}

function setSearchOpen(open){
  els.fabSearchWrap.setAttribute("aria-expanded", open ? "true":"false");
  if(open){
    setTimeout(()=> els.fabSearchInput?.focus(), 10);
  }
}

function pulseSearchOnce(){
  // um "ping" sutil na lupa para descoberta — só 1x
  els.fabSearch?.classList.add("pulse-once");
  els.fabSearch?.addEventListener("animationend", ()=> els.fabSearch?.classList.remove("pulse-once"), {once:true});
}

function blinkCluster(){
  // feedback curto se clicar sem card selecionado
  els.fabCluster?.animate([{transform:"translateY(0)"},{transform:"translateY(-3px)"},{transform:"translateY(0)"}], {duration:180});
}

/* ---------- Busca (stub com estados) ---------- */
async function runSearch(q){
  // Estados: skeleton → resultados/empty → fim
  renderSkeleton();

  // Simula latência leve (trocar depois pela sua busca real)
  await sleep(400);

  // lógica dummy: se consulta muito curta, retorna vazio
  const hasResults = q.length >= 2;
  els.stack.innerHTML = "";

  if(!hasResults){
    renderEmptyState(q);
    return;
  }

  const count = 7; // simulação
  const group = elGroup(`Resultados para “${escapeHtml(q)}”`, count);
  els.stack.appendChild(group);

  // marcador de fim
  renderEndState();

  // Auto-seleção após render
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
function elGroup(title, count){
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
    <span class="group-title">${title}</span>
    <span class="group-meta">${count} itens</span>
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

  for(let i=1;i<=count;i++){
    const c = document.createElement("article");
    c.className = "card";
    c.tabIndex = 0;
    c.innerHTML = `
      <div class="card-title">
        <span class="pill">Penal</span>
        <strong>Título do item ${i}</strong>
      </div>
      <p class="card-text">Trecho inicial do conteúdo ${i}. Texto curto de prévia para leitura rápida…</p>
    `;
    // Clique/foco no card apenas controla seleção (sem botões inline)
    c.addEventListener("click", ()=> { setSelectedCard(c); selectPausedUntil = now()+1200; });
    c.addEventListener("focusin", ()=> { setSelectedCard(c); selectPausedUntil = now()+1200; });
    body.appendChild(c);
  }

  g.append(h, body);
  return g;
}

/* ---------- Ações ---------- */
function applyPrimaryAction(card){
  // Ação padrão: abrir texto (plugue seu modal real aqui)
  const title = cardTitle(card);
  toast(`Abrindo texto de: ${title}`);
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
  // pega os que têm pelo menos 60% visível
  const visibles = entries
    .filter(en => en.isIntersecting && en.intersectionRatio >= .6)
    .map(en => en.target);

  if(!visibles.length) return;

  // seleciona o que está mais embaixo (último aparecendo)
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
  // leitores de tela:
  if(els.live) els.live.textContent = label;
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
    // Esc fecha busca
    if(ev.key === "Escape"){
      if(els.fabSearchWrap.getAttribute("aria-expanded")==="true"){
        setSearchOpen(false);
      }
      return;
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
      applyPrimaryAction(selectedCard);
      selectPausedUntil = now()+2000;
    }
  });
}
function isTextInput(el){
  return ["INPUT","TEXTAREA"].includes(el?.tagName) || el?.isContentEditable;
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

/* ---------- Utils ---------- */
function escapeHtml(s){
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
