/* =================== PWA =================== */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => console.log("✅ SW", reg.scope))
      .catch((err) => console.error("❌ SW", err));
  });
}
// Evita prompt nativo “instalar PWA” atrapalhando o fluxo
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); });

/* =================== Refs (somente o que precisamos aqui) =================== */
const els = {
  // Topbar
  brandBtn: document.getElementById("brandBtn"),
  infoBtn: document.getElementById("infoBtn"),
  infoBackdrop: document.getElementById("infoBackdrop"),
  closeInfo: document.getElementById("closeInfo"),
  okInfo: document.getElementById("okInfo"),

  // Barra abaixo (filebar)
  favTab: document.getElementById("favTab"),
  catTab: document.getElementById("catTab"),
  filebarInner: document.getElementById("filebarInner"),

  // Busca (IDs preservados)
  searchInput: document.getElementById("searchInput"),
  searchSpinner: document.getElementById("searchSpinner"),
  clearSearch: document.getElementById("clearSearch"),
  searchSuggest: document.getElementById("searchSuggest"),

  // Mini-finder (contador flutuante)
  finderPop: document.getElementById("finderPop"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  closeFinder: document.getElementById("closeFinder"),
  count: document.getElementById("count"),

  // Container de cards (mantém o resto do site intacto)
  cards: document.getElementById("cards"),

  // Modal de Categorias (reutilizado pelo botão Arquivos)
  catBackdrop: document.getElementById("catBackdrop"),
  closeCat: document.getElementById("closeCat"),
  applyCat: document.getElementById("applyCat"),
  catBody: document.getElementById("catBody"),
  codeSelect: document.getElementById("codeSelect"),

  // Toast opcional (pode não existir no HTML atual)
  toast: document.getElementById("toast"),
};

/* Cria um toast simples se não existir (para não quebrar notify) */
(function ensureToast(){
  if (!els.toast) {
    const t = document.createElement("div");
    t.id = "toast";
    t.style.cssText = `
      position:fixed; left:50%; bottom:16px; transform:translateX(-50%);
      background:#111; color:#fff; padding:8px 12px; border-radius:10px;
      font-size:12px; opacity:0; pointer-events:none; transition:opacity .2s;
      z-index:2000;
    `;
    document.body.appendChild(t);
    els.toast = t;
  }
})();

/* =================== Estado mínimo só p/ busca & modal =================== */
const state = {
  // Busca inline (mini-finder)
  matches: [],
  matchIdx: -1,
  // Seleção no modal de categorias
  selectedUrl: null,
};

/* =================== Utilidades pequenas =================== */
function notify(msg="Ok!") {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.style.opacity = "1";
  setTimeout(()=> { els.toast.style.opacity = "0"; }, 1200);
}
function debounce(fn, ms=200){
  let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}
function stripHtml(el){
  return (el.textContent || el.innerText || "").trim();
}

/* =============== TOP BAR: modal de informações (abre/fecha) =============== */
function openInfoModal(){ els.infoBackdrop?.setAttribute("aria-hidden","false"); }
function closeInfoModal(){ els.infoBackdrop?.setAttribute("aria-hidden","true"); }
els.infoBtn?.addEventListener("click", openInfoModal);
els.closeInfo?.addEventListener("click", closeInfoModal);
els.okInfo?.addEventListener("click", closeInfoModal);
els.infoBackdrop?.addEventListener("click", (e)=>{ if (e.target === els.infoBackdrop) closeInfoModal(); });

/* ====== BARRA ABAIXO: Favoritos (apenas foco visual, sem mexer no resto) ====== */
els.favTab?.addEventListener("click", ()=>{
  document.querySelectorAll(".tab").forEach(c=>c.classList.remove("active")); // se existirem tabs antigas
  els.favTab.classList.add("active");
  notify("Favoritos");
  // Observação: Não mexemos em como a página de favoritos é renderizada no restante do app.
});

/* =================== Modal de Categorias/Arquivos =================== */
function openCatModal(){
  if (!els.codeSelect || !els.catBody) { notify("Catálogo indisponível."); return; }

  // Monta a lista a partir do <select> oculto (agrupado por <optgroup>)
  els.catBody.innerHTML = "";
  const frag = document.createDocumentFragment();

  [...els.codeSelect.querySelectorAll("optgroup")].forEach((og)=>{
    const group = document.createElement("div");
    group.className = "group";

    const title = document.createElement("div");
    title.className = "group-title";
    title.textContent = og.getAttribute("label") || "Outros";
    group.appendChild(title);

    [...og.querySelectorAll("option")].forEach((opt)=>{
      const item = document.createElement("button");
      item.type = "button";
      item.className = "item";
      item.setAttribute("data-url", opt.value);
      item.setAttribute("data-label", opt.textContent.trim());
      item.innerHTML = `
        <span>${opt.textContent.trim()}</span>
        <span style="font-size:12px;opacity:.65;">abrir</span>
      `;
      item.addEventListener("click", ()=>{
        // marca seleção visual
        [...els.catBody.querySelectorAll(".item")].forEach(i=>i.classList.remove("selected"));
        item.classList.add("selected");
        state.selectedUrl = opt.value;
      });
      group.appendChild(item);
    });

    frag.appendChild(group);
  });

  els.catBody.appendChild(frag);
  state.selectedUrl = null;
  els.catBackdrop.setAttribute("aria-hidden","false");
}
function closeCatModal(){ els.catBackdrop?.setAttribute("aria-hidden","true"); }

els.catTab?.addEventListener("click", openCatModal);
els.closeCat?.addEventListener("click", closeCatModal);
els.catBackdrop?.addEventListener("click", (e)=>{ if (e.target === els.catBackdrop) closeCatModal(); });

els.applyCat?.addEventListener("click", async ()=>{
  if (!state.selectedUrl) { notify("Selecione um arquivo."); return; }
  closeCatModal();
  // Dispara evento customizado para o restante do app escutar (sem reescrever o app)
  window.dispatchEvent(new CustomEvent("dl.open-file", {
    detail: { url: state.selectedUrl }
  }));
  notify("Abrindo arquivo…");
});

/* =================== Busca: destaque + mini-finder =================== */
/* Regras:
   - IDs preservados para não quebrar atalhos pré-existentes (Ctrl+K, '/', etc.)
   - Destaque de ocorrências dentro de #cards, com navegação Prev/Next
*/
const HIGHLIGHT_TAG = "mark-dl";
function clearHighlights(){
  if (!els.cards) return;
  els.cards.querySelectorAll(HIGHLIGHT_TAG).forEach(m=>{
    const parent = m.parentNode;
    parent.replaceChild(document.createTextNode(m.textContent), m);
    parent.normalize();
  });
}
function doSearch(q){
  if (!els.cards) return;
  clearHighlights();
  state.matches = [];
  state.matchIdx = -1;

  const needle = (q||"").trim();
  if (!needle) { updateFinderUI(); return; }

  // percorre textos nos cards
  const walker = document.createTreeWalker(els.cards, NodeFilter.SHOW_TEXT, {
    acceptNode(node){
      const txt = node.nodeValue;
      if (!txt || !txt.trim()) return NodeFilter.FILTER_REJECT;
      return txt.toLowerCase().includes(needle.toLowerCase())
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  const toHighlight = [];
  while (walker.nextNode()) toHighlight.push(walker.currentNode);

  toHighlight.forEach(node=>{
    const idx = node.nodeValue.toLowerCase().indexOf(needle.toLowerCase());
    if (idx < 0) return;
    const before = node.nodeValue.slice(0, idx);
    const match = node.nodeValue.slice(idx, idx + needle.length);
    const after  = node.nodeValue.slice(idx + needle.length);

    const mark = document.createElement(HIGHLIGHT_TAG);
    mark.textContent = match;

    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    frag.appendChild(mark);
    if (after)  frag.appendChild(document.createTextNode(after));

    node.parentNode.replaceChild(frag, node);
    state.matches.push(mark);
  });

  if (state.matches.length) {
    state.matchIdx = 0;
    scrollToMatch(0);
  }
  updateFinderUI();
}
const debouncedSearch = debounce((q)=>{
  els.searchSpinner && (els.searchSpinner.style.display = q ? "block" : "none");
  doSearch(q);
  els.searchSpinner && (els.searchSpinner.style.display = "none");
}, 180);

function updateFinderUI(){
  if (!els.finderPop || !els.count) return;
  const total = state.matches.length;
  const idx = state.matchIdx >= 0 ? state.matchIdx+1 : 0;
  els.count.textContent = `${idx}/${total}`;
  els.finderPop.style.display = total ? "flex" : "none";
}
function scrollToMatch(i){
  const m = state.matches[i];
  if (!m) return;
  m.scrollIntoView({ behavior:"smooth", block:"center" });
}
function goNext(){
  if (!state.matches.length) return;
  state.matchIdx = (state.matchIdx + 1) % state.matches.length;
  scrollToMatch(state.matchIdx);
  updateFinderUI();
}
function goPrev(){
  if (!state.matches.length) return;
  state.matchIdx = (state.matchIdx - 1 + state.matches.length) % state.matches.length;
  scrollToMatch(state.matchIdx);
  updateFinderUI();
}

els.searchInput?.addEventListener("input", (e)=> debouncedSearch(e.target.value));
els.clearSearch?.addEventListener("click", ()=>{
  if (!els.searchInput) return;
  els.searchInput.value = "";
  debouncedSearch("");
});
els.nextBtn?.addEventListener("click", goNext);
els.prevBtn?.addEventListener("click", goPrev);
els.closeFinder?.addEventListener("click", ()=>{
  clearHighlights(); state.matches=[]; state.matchIdx=-1; updateFinderUI();
});

/* ===== Atalhos comuns (mantidos p/ compatibilidade) ===== */
document.addEventListener("keydown", (e)=>{
  // F3 / Ctrl+G: próximo
  if ((e.key === "F3") || (e.ctrlKey && (e.key.toLowerCase() === "g"))) {
    e.preventDefault(); goNext(); return;
  }
  // Shift+F3 / Ctrl+Shift+G: anterior
  if ((e.shiftKey && e.key === "F3") || (e.ctrlKey && e.shiftKey && (e.key.toLowerCase() === "g"))) {
    e.preventDefault(); goPrev(); return;
  }
  // / ou Ctrl+K: foco na busca
  if (e.key === "/" || (e.ctrlKey && e.key.toLowerCase()==="k")) {
    if (document.activeElement !== els.searchInput) {
      e.preventDefault();
      els.searchInput?.focus();
      els.searchInput?.select();
    }
  }
});

/* =================== Bridge (compatibilidade com o app existente) ===================
   - Se o restante do app disparar carregamentos de arquivo, nós ouvimos e não interferimos.
   - Se o restante do app antes montava "tabs" na filebar, agora ignoramos (filebar virou campo de busca).
   ================================================================================ */

// Caso alguma parte do app emita “carregar arquivo”:
window.addEventListener("dl.open-file", (e)=>{
  const { url } = e.detail || {};
  if (!url) return;
  // Se sua app principal tem um handler global, delegue para ele:
  if (window.dlOpenFile) {
    window.dlOpenFile(url);
  } else {
    // Fallback: abre em nova aba (evita travar o fluxo)
    window.open(url, "_blank", "noopener,noreferrer");
  }
});

// Se houver lógica antiga que tentava “renderFilebar(tabs)”, anulamos para não sobrescrever a busca.
window.renderFilebar = function noop(){ /* barras de tabs desativadas por design */ };

// Expor pequena API opcional p/ sua app integrar depois (não obrigatório)
window.dlUI = {
  openCatalog: openCatModal,
  closeCatalog: closeCatModal,
  focusSearch(){ els.searchInput?.focus(); },
  notify,
};

/* =================== Boot =================== */
(function boot(){
  // Estado visual inicial: favoritos “ativo”
  if (els.favTab) {
    document.querySelectorAll(".tab").forEach(c=>c.classList.remove("active"));
    els.favTab.classList.add("active");
  }
  // Limpa qualquer highlight residual
  clearHighlights(); updateFinderUI();

  console.log("✅ UI ajustada: Top Bar e barra abaixo (⭐, 📄, busca). Restante intacto.");
})();
