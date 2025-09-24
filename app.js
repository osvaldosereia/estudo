/* ==========================
   direito.love — app.js (2025-09 • variante FAB + splash)
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

function debounce(fn, ms=150){
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
}

/* ---------- elementos ---------- */
const els = {
  app: $("#app"),
  stack: $("#resultsStack"),

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
const now = () => Date.now();

/* ---------- inicialização ---------- */
init();

function init(){
  setupSplash();
  setupFabCluster();
  setupResultsDemoIfEmpty(); // opcional: para visualizar
}

/* ---------- Splash ---------- */
function setupSplash(){
  const done = localStorage.getItem("dl_firstVisitDone") === "1";
  setSplashVisible(!done);
  els.splashForm?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const q = (els.splashInput?.value || "").trim();
    if(!q) return;
    await runSearch(q);
    localStorage.setItem("dl_firstVisitDone","1");
    setSplashVisible(false);
  });
}

function setSplashVisible(v){
  if(!els.splash) return;
  els.splash.setAttribute("aria-hidden", v ? "false":"true");
}

/* ---------- FAB: logo / action / search retrátil ---------- */
function setupFabCluster(){
  // Logo → scroll to top
  els.fabLogo?.addEventListener("click", ()=> window.scrollTo({top:0, behavior:"smooth"}));

  // Lupa retrátil
  els.fabSearch?.addEventListener("click", ()=>{
    const open = els.fabSearchWrap.getAttribute("aria-expanded") === "true";
    setSearchOpen(!open);
  });
  els.fabSearchForm?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const q = (els.fabSearchInput?.value || "").trim();
    if(!q) return setSearchOpen(false);
    await runSearch(q);
    setSearchOpen(false);
    els.fabSearchInput.value = "";
  });

  // Action → aplicar no item selecionado
  els.fabAction?.addEventListener("click", ()=>{
    if(!selectedCard){ blinkCluster(); return; }
    applyPrimaryAction(selectedCard);
    // foco do usuário → pausa auto-seleção por 2 segundos
    selectPausedUntil = now()+2000;
  });
}

function setSearchOpen(open){
  els.fabSearchWrap.setAttribute("aria-expanded", open ? "true":"false");
  if(open){
    // empurra cluster pra cima se teclado mobile abrir (efeito natural)
    setTimeout(()=> els.fabSearchInput?.focus(), 10);
  }
}

function blinkCluster(){
  els.fabCluster?.animate([{transform:"translateY(0)"},{transform:"translateY(-3px)"},{transform:"translateY(0)"}], {duration:180});
}

/* ---------- Busca (stub: adapte à sua lógica) ---------- */
async function runSearch(q){
  // Aqui você pluga sua lógica real de busca.
  // Mantive um demo simples para testar a UI.
  // TODO: substituir por fetch/parse do seu mecanismo atual.

  // Limpa
  els.stack.innerHTML = "";

  // Agrupinho fake
  const group = elGroup(`Resultados para “${q}”`, 7);
  els.stack.appendChild(group);

  // Auto-seleção só após render
  await sleep(50);
  setupAutoSelection();
  updateFabActionLabel();
}

/* ---------- Grupo/Itens (UI mínima para demo) ---------- */
function elGroup(title, count){
  const g = document.createElement("section");
  g.className = "group";
  g.setAttribute("aria-expanded","false");

  const h = document.createElement("button");
  h.className = "group-h";
  h.type = "button";
  h.innerHTML = `
    <span class="group-title">${title}</span>
    <span class="group-meta">${count} itens</span>
    <svg class="group-chevron" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6"></path>
    </svg>
  `;
  h.addEventListener("click", ()=>{
    const open = g.getAttribute("aria-expanded")==="true";
    g.setAttribute("aria-expanded", open ? "false":"true");
    // reprocessa seleção ao abrir/fechar
    reobserveCards();
  });

  const body = document.createElement("div");
  body.className = "group-body";

  for(let i=1;i<=count;i++){
    const c = document.createElement("article");
    c.className = "card";
    c.tabIndex = 0;
    c.innerHTML = `
      <div>
        <div class="card-title">
          <span class="pill">Penal</span>
          <strong>Título do item ${i}</strong>
        </div>
        <p class="card-text">Trecho inicial do conteúdo ${i}…</p>
      </div>
      <div class="card-actions">
        <button class="btn btn-ghost" data-act="view">Ver Texto</button>
        <button class="btn btn-ghost" data-act="code">Ver Código</button>
        <button class="btn btn-ghost" data-act="planalto">Planalto</button>
      </div>
    `;
    c.addEventListener("click", (ev)=>{
      const actBtn = ev.target.closest("[data-act]");
      if(actBtn){
        // ações de card → lock seleção um pouco
        selectPausedUntil = now()+2000;
        handleInlineAction(c, actBtn.getAttribute("data-act"));
        ev.stopPropagation();
      }
    });
    c.addEventListener("focusin", ()=> { selectPausedUntil = now()+1200; setSelectedCard(c); });
    body.appendChild(c);
  }

  g.append(h, body);
  return g;
}

/* ---------- Ações ---------- */
function handleInlineAction(card, act){
  switch(act){
    case "view": openReader(card, {mode:"text"}); break;
    case "code": openReader(card, {mode:"code"}); break;
    case "planalto": openPlanalto(card); break;
  }
}
function applyPrimaryAction(card){
  // Ação padrão: "Ver Texto"
  openReader(card, {mode:"text"});
}
function openReader(card, {mode}={}){
  const title = card.querySelector("strong")?.textContent || "Item";
  const msg = `Abrindo ${mode==="code"?"o CÓDIGO":"o TEXTO"} de: ${title}`;
  toast(msg);
}
function openPlanalto(card){
  toast("Abrindo no Planalto (placeholder)"); // plugue seu link real aqui
}

/* ---------- Auto-seleção por IntersectionObserver ---------- */
let observer, observed = [];
function setupAutoSelection(){
  cleanupObserver();
  observer = new IntersectionObserver(onIntersect, {
    root:null, rootMargin:"0px", threshold:[0, .25, .5, .6, .75, 1]
  });
  reobserveCards();
  // evita selecionar “o primeiro lá no topo” sem interação: só após pequeno scroll
  window.addEventListener("scroll", debounce(updateFabActionLabel, 150), {passive:true});
}

function reobserveCards(){
  if(!observer) return;
  observed.forEach(el=> observer.unobserve(el));
  observed = $$(".group[aria-expanded='true'] .card");
  observed.forEach(el=> observer.observe(el));
  // limpa seleção se o card sumiu
  if(selectedCard && !observed.includes(selectedCard)){
    setSelectedCard(null);
  }
}

const onIntersect = debounce((entries)=>{
  if(now() < selectPausedUntil) return; // focus-lock
  // filtra visíveis com ratio >= .6
  const visibles = entries
    .filter(en => en.isIntersecting && en.intersectionRatio >= .6)
    .map(en => en.target);

  if(!visibles.length) return;

  // pega o que está mais embaixo (último na tela)
  const byBottom = visibles
    .map(el => ({el, rect: el.getBoundingClientRect()}))
    .sort((a,b)=> (a.rect.bottom - b.rect.bottom));

  const last = byBottom[byBottom.length-1]?.el;
  if(last) setSelectedCard(last);
}, 150);

function setSelectedCard(card){
  if(card === selectedCard) return;
  if(selectedCard) selectedCard.classList.remove("is-selected");
  selectedCard = card;
  if(selectedCard) selectedCard.classList.add("is-selected");
  updateFabActionLabel();
}

function updateFabActionLabel(){
  const title = selectedCard?.querySelector("strong")?.textContent || "";
  els.fabActionLabel.textContent = title ? `Ver Texto — ${title}` : "Ver Texto";
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
      boxShadow:"0 8px 20px rgba(0,0,0,.2)",zIndex:9999,fontSize:"14px",maxWidth:"80vw",textAlign:"center"
    });
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = "1";
  toastT = setTimeout(()=> el.style.opacity = "0", 1600);
}

/* ---------- Demo inicial se quiser ver sem back ---------- */
function setupResultsDemoIfEmpty(){
  if(els.stack.children.length) return;
  // mostra splash na primeira visita; se não for primeira, mostra uma pesquisa demo
  if(localStorage.getItem("dl_firstVisitDone") === "1"){
    runSearch("art. 129 CP");
  }else{
    setSplashVisible(true);
  }
}
