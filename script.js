/* UX + UI upgrades (incl. Favoritos + Autocomplete):
   - Fechar modal NÃO limpa busca; botão "Limpar" separado
   - Prev/Next percorre resultados quando aberto da busca (toggle Resultados/Código)
   - Toast "Copiado!"
   - Resultados Chips/Lista com snippet + destaque
   - Busca Precisa/Flexível
   - Autocomplete de títulos de artigos (Enter/Setas/Click)
   - Lembrar último código (localStorage) + Favoritar artigo + Modal Favoritos
   - Skeleton em listas; polyfill básico de <dialog>
   - Dark mode via tokens (CSS)
*/

const state = {
  codigo: null,
  termoBusca: '',
  artigoAtualIdx: -1,

  artigosIndex: [],       // [{ titulo, texto, numero, id}, ...]
  artigosData: null,      // texto bruto (quando aplicável)
  lastHits: [],           // resultados da última busca (array de nodes)
  navScope: 'results',    // 'results' | 'all'
  navArray: [],           // array vigente para navegação no modal
  navIndex: 0,            // posição atual no navArray

  ac: {                   // autocomplete
    open: false,
    items: [],
    activeIndex: -1
  },

  prompt: '',

  favs: [],

  videos: {},             // { "Art. X": [ {title, url}, ...] }

};

const appEls = {
  // topbar
  selCodigo: document.getElementById('selCodigo'),
  inpArtigo: document.getElementById('inpArtigo'),
  btnBuscar: document.getElementById('btnBuscar'),
  resultChips: document.getElementById('resultChips'),
  resultList: document.getElementById('resultList'),
  viewToggle: document.getElementById('viewToggle'),
  vtButtons: Array.from(document.querySelectorAll('[data-view]')),
  resultMsg: document.getElementById('resultMsg'),

  // autocomplete
  acPanel: document.getElementById('acPanel'),
  toast: document.getElementById('toast'),

  // modal artigo
  modalArtigo: document.getElementById('modalArtigo'),
  amTitle: document.getElementById('amTitle'),
  amBody: document.getElementById('amBody'),
  amExtras: document.getElementById('amExtras'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnFechar: document.getElementById('btnFechar'),
  amPromptWrap: document.getElementById('amPromptWrap'),
  btnScope: document.getElementById('btnScope'),
  btnFav: document.getElementById('btnFav'),
  presetWrap: document.getElementById('presetWrap'),

  // favoritos
  modalFavs: document.getElementById('modalFavs'),
  favScope: document.getElementById('favScope'),
  favList: document.getElementById('favList'),

  // videos
  modalVideos: document.getElementById('modalVideos'),
  vdTitle: document.getElementById('vdTitle'),
  vdLista: document.getElementById('vdLista'),
  btnVdFechar: document.getElementById('btnVdFechar'),

  // sidebar
  btnSidebar: document.getElementById('btnSidebar'),
  sidebar: document.getElementById('sidebar'),
  btnSideClose: document.getElementById('btnSideClose'),
  sbLinks: Array.from(document.querySelectorAll('[data-modal]')),

  // clear / reset
  btnClear: document.getElementById('btnClear'),

  // modais extras (vocabulário e princípios)
  modalVocab: document.getElementById('modalVocab'),
  vocabSearch: document.getElementById('vocabSearch'),
  vocabList: document.getElementById('vocabList'),
  btnVocabCopy: document.getElementById('btnVocabCopy'),
  vocabPromptWrap: document.getElementById('vocabPromptWrap'),

  modalPrincipios: document.getElementById('modalPrincipios'),
  princSearch: document.getElementById('princSearch'),
  princList: document.getElementById('princList'),
  btnPrincCopy: document.getElementById('btnPrincCopy'),
  princPromptWrap: document.getElementById('princPromptWrap'),

  // reset (topbar)
  btnReset: document.getElementById('btnReset')
};

/* ====== Utils ====== */
const escapeHTML = s => (s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const words = s => (s||'').split(/\s+/).filter(Boolean);
const sleep = ms => new Promise(r=>setTimeout(r,ms));

function showToast(msg='Copiado!'){
  const el = appEls.toast;
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(()=> el.classList.remove('show'), 1300);
}

/* ====== Storage ====== */
function lastCodeKey(){ return 'dl_last_code'; }
function saveLastCode(id){ try{ localStorage.setItem(lastCodeKey(), id||''); }catch{} }
function getLastCode(){ try{ return localStorage.getItem(lastCodeKey()) || ''; }catch{ return '' } }

/* ====== Data Loaders ====== */
async function loadCodigo(id){
  if (!id) return;
  // data filename pattern: codigo_*.json
  const url = `data/${id}.json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Erro ao carregar código: '+id);
  const json = await resp.json();

  // json no formato:
  // { art1: {titulo, texto}, art2: {...}, ... }
  state.artigosIndex = Object.entries(json).map(([key, val])=>{
    const titulo = val.titulo || key;
    const texto = val.texto || '';
    const numero = (titulo.match(/Art\.\s*([\dA-Za-z\.\-]+)/i)||[])[1] || '';
    return { id:key, titulo, texto, numero };
  });

  // construir autocomplete
  buildAutocompleteIndex();

  // limpar resultados e status
  state.lastHits = [];
  appEls.resultChips.innerHTML = '';
  appEls.resultList.innerHTML = '';
  appEls.resultMsg.textContent = '';

  renderResultsMessage([]);
}

function buildAutocompleteIndex(){
  const items = state.artigosIndex.map((n, i)=>({
    label: n.titulo,
    index: i,
    key: norm(n.titulo)
  }));
  state.ac.items = items;
}

/* ====== Views: chips / list ====== */
function switchView(view){
  appEls.vtButtons.forEach(b=>{
    if (b.dataset.view===view) b.classList.add('active'); else b.classList.remove('active');
  });
  if (view==='chips'){
    appEls.resultChips.style.display='block';
    appEls.resultList.style.display='none';
  } else {
    appEls.resultChips.style.display='none';
    appEls.resultList.style.display='block';
  }
}
function renderResultsMessage(hits){
  const extra = hits && hits.length ? (state.navScope==='results' ? ` — mostrando 200/${hits.length})` : '') : '';
  appEls.resultMsg.textContent = `${(hits && hits.length) || 0} artigo(s) encontrado(s)${extra}. Clique para abrir.`;
}

/* ====== Search ====== */
function preciseMatch(node, terms){
  // todas as palavras inteiras
  const txt = ' ' + norm(node.titulo+' '+node.texto) + ' ';
  return terms.every(t=>{
    const w = ' '+norm(t)+' ';
    return txt.includes(w);
  });
}
function flexibleMatch(node, q){
  const W = words(norm(q));
  if (!W.length) return false;
  const txt = norm(node.titulo+' '+node.texto);
  return W.every(w => txt.includes(w));
}
function computeHits(q){
  if (!q || !q.trim()) return [];
  const terms = words(q);
  // precisa ser inteiro? privilegia preciseMatch
  const hits = state.artigosIndex.filter(n=> preciseMatch(n, terms));
  if (hits.length) return hits;
  // fallback para flexível
  return state.artigosIndex.filter(n=> flexibleMatch(n, q));
}

function renderHitsChips(hits){
  const container = appEls.resultChips;
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  hits.slice(0,200).forEach((n, i)=>{
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = n.titulo;
    chip.addEventListener('click', ()=> openArticleModalByNode(n, /*fromSearch*/true));
    frag.appendChild(chip);
  });
  container.appendChild(frag);
}
function highlightSnippet(text, q){
  const t = escapeHTML(text);
  const w = words(q).map(escapeHTML);
  let out = t;
  for (const k of w){
    const re = new RegExp(`(${k})`, 'ig');
    out = out.replace(re, '<mark>$1</mark>');
  }
  return out;
}
function renderHitsList(hits, q){
  const container = appEls.resultList;
  container.innerHTML = '';
  const ul = document.createElement('div');
  ul.className = 'list';
  hits.slice(0,200).forEach((n)=>{
    const row = document.createElement('div');
    row.className = 'list-row';

    const title = document.createElement('div');
    title.className = 'list-title';
    title.innerHTML = escapeHTML(n.titulo);

    const snippet = document.createElement('div');
    snippet.className = 'list-snippet';
    const sample = n.texto.slice(0, 260);
    snippet.innerHTML = highlightSnippet(sample, q);

    const actions = document.createElement('div');
    actions.className = 'list-actions';
    const btnOpen = document.createElement('button');
    btnOpen.type = 'button';
    btnOpen.className = 'btn btn-outline';
    btnOpen.textContent = 'Abrir';
    btnOpen.addEventListener('click', ()=> openArticleModalByNode(n, /*fromSearch*/true));
    actions.appendChild(btnOpen);

    const meta = document.createElement('div');
    meta.className = 'list-meta';
    meta.textContent = n.numero ? `#${n.numero}` : '';

    row.appendChild(title); row.appendChild(snippet); row.appendChild(actions); row.appendChild(meta);
    ul.appendChild(row);
  });

  container.appendChild(ul);
}

/* ====== Prompt ====== */
function renderCopyButton(){
  appEls.amPromptWrap.innerHTML = '<button id="btnCopiarPrompt" class="btn btn-primary" type="button">Copiar Prompt</button>';
  const btn = appEls.amPromptWrap.querySelector('#btnCopiarPrompt');
  btn.addEventListener('click', onCopiarPrompt);
}
function buildSinglePrompt(node){
  const bloco = `### ${node.titulo}\nTexto integral:\n${node.texto}`;
  const presets = appEls.presetWrap ? Array.from(appEls.presetWrap.querySelectorAll('input[type="checkbox"]:checked')).map(i=>i.value) : [];
  const extras = [];
  if (presets.includes('resumo')) extras.push('(a) um resumo doutrinário claro e direto');
  if (presets.includes('checklist')) extras.push('(b) um checklist prático de estudo e revisão');
  if (presets.includes('juris')) extras.push('(c) referências de jurisprudência majoritária (STJ/STF) em linguagem simples');
  const extraTxt = extras.length ? ` Além disso, inclua ${extras.join(', ')}.` : '';
  return `Assuma a persona de um professor de Direito experiente e didático. Explique o artigo abaixo de forma clara, organizada e com exemplos práticos, focando em aprendizado rápido, sem enrolação. Estruture em: Conceito direto; Exemplos práticos; Doutrina (brevíssima); Jurisprudência majoritária; Erros comuns; Revisão final em tópicos.${extraTxt}\n\n${bloco}\n\n💚 direito.love — Gere um novo prompt em https://direito.love`;
}
async function onCopiarPrompt(){
  const scopeArr = getScopeArray();
  const node = scopeArr[state.navIndex];
  if (!node) return;
  const prompt = buildSinglePrompt(node);
  state.prompt = prompt;
  try{ await navigator.clipboard.writeText(prompt); showToast('Prompt copiado!'); }catch{ showToast('Copiado (tente colar)'); }
  renderAIButtons();
}
function renderAIButtons(){
  appEls.amPromptWrap.innerHTML = `
    <div class="ai-buttons">
      <button class="btn btn-outline btn-ia" data-app="gpt" type="button">GPT</button>
      <button class="btn btn-outline btn-ia" data-app="gemini" type="button">GEMINI</button>
      <button class="btn btn-outline btn-ia" data-app="perplexity" type="button">PERPLEXITY</button>
    </div>
    <div class="ai-tip">Cole o prompt na IA escolhida.</div>
  `;
  appEls.amPromptWrap.querySelectorAll('.btn-ia').forEach(b=>{
    b.addEventListener('click', ()=>{
      const app = b.dataset.app;
      // apenas abre a IA em outra aba (ou deixa para o usuário)
      if (app==='gpt') window.open('https://chat.openai.com/', '_blank');
      if (app==='gemini') window.open('https://gemini.google.com/app', '_blank');
      if (app==='perplexity') window.open('https://www.perplexity.ai/', '_blank');
    });
  });
}

/* ====== Modal render ====== */
function renderArticleHTML(node){
  const texto = escapeHTML(node.texto).replace(/\n/g, '<br>');
  return `<div class="artigo-texto">${texto}</div>`;
}
function renderExtras(node){
  const favActive = isFavorite(node) ? 'active' : '';
  appEls.amExtras.innerHTML = `
    <div class="extra-row">
      <button id="btnVtText" class="btn btn-sm btn-ghost" type="button" disabled>Texto</button>
      <button id="btnVtQuiz" class="btn btn-sm btn-ghost" type="button" disabled>Quiz</button>
      <button id="btnVtVideos" class="btn btn-sm btn-ghost" type="button" disabled>Vídeos</button>
      <span class="spacer"></span>
      <button id="btnFav" class="btn btn-sm btn-fav ${favActive}" type="button" title="Favoritar">★</button>
    </div>
  `;
}
function getScopeArray(){
  if (state.navScope==='results' && state.lastHits.length) return state.lastHits;
  return state.artigosIndex;
}

function openArticleModalByIndexVia(scopeArr, idx){
  if (idx<0 || idx>=scopeArr.length) return;
  const node = scopeArr[idx];
  state.navArray = scopeArr;
  state.navIndex = idx;
  state.artigoAtualIdx = state.artigosIndex.findIndex(n=>n.titulo===node.titulo);

  appEls.amTitle.textContent = node.titulo;
  appEls.amBody.innerHTML = renderArticleHTML(node);
  renderExtras(node);
  renderCopyButton();

  // atualizar botões Prev/Next
  appEls.btnPrev.disabled = state.navIndex<=0;
  appEls.btnNext.disabled = state.navIndex>=scopeArr.length-1;

  // escopo label
  if (appEls.btnScope){
    appEls.btnScope.textContent = state.navScope==='results' ? 'Navegar: Resultados' : 'Navegar: Código';
  }

  openDialog(appEls.modalArtigo);
}
function openArticleModalByNode(node, fromSearch=false){
  if (fromSearch && state.lastHits.length){ state.navScope='results'; }
  const scopeArr = getScopeArray();
  const idx = scopeArr.findIndex(n=>n.titulo===node.titulo);
  if (idx>=0) openArticleModalByIndexVia(scopeArr, idx);
}

/* ====== Favoritos ====== */
function favStoreKeyFor(codeId){ return `dl_favs_${codeId||''}`; }
function favStoreKey(){ return favStoreKeyFor(state.codigo); }
function getFavsRaw(codeId){
  try{ return JSON.parse(localStorage.getItem(favStoreKeyFor(codeId))||'[]'); }catch{return []}
}
function getFavs(){ return getFavsRaw(state.codigo); }
function isFavorite(node){ return getFavs().some(t=>t===node.titulo); }
function toggleFavorite(){
  const scopeArr = getScopeArray();
  const node = scopeArr[state.navIndex];
  if (!node) return;
  let favs = getFavs();
  if (isFavorite(node)){
    favs = favs.filter(t=>t!==node.titulo);
  } else {
    favs.push(node.titulo);
  }
  try{ localStorage.setItem(favStoreKey(), JSON.stringify(favs)); }catch{}
  renderExtras(node);
}
function openFavsModal(scope='all'){
  const list = document.createElement('div');
  list.className = 'fav-list';
  const favs = getFavs();
  const arr = scope==='all' ? state.artigosIndex : state.lastHits;
  const nodes = arr.filter(n=> favs.includes(n.titulo));
  if (!nodes.length){
    list.innerHTML = '<div class="empty">Nenhum favorito encontrado.</div>';
  } else {
    nodes.forEach(n=>{
      const item = document.createElement('div');
      item.className = 'fav-item';
      item.textContent = n.titulo;
      item.addEventListener('click', ()=> openArticleModalByNode(n, /*fromSearch*/scope!=='all'));
      list.appendChild(item);
    });
  }
  appEls.favList.innerHTML = '';
  appEls.favList.appendChild(list);
  openDialog(appEls.modalFavs);
}

/* ====== Videos ====== */
function loadVideos(){
  // estrutura opcional; se não houver, manter vazio
  // videos/<codigo>_videos.json
  const id = state.codigo;
  if (!id) return;
  fetch(`videos/${id}_videos.json`).then(r=>{
    if (!r.ok) return {};
    return r.json();
  }).then(json=>{
    state.videos = json || {};
  }).catch(()=>{});
}
function openVideosForNode(node){
  const items = state.videos[node.titulo] || [];
  appEls.vdTitle.textContent = node.titulo;
  if (!items.length){
    appEls.vdLista.innerHTML = '<div class="empty">Sem vídeos cadastrados para este artigo.</div>';
  } else {
    const list = document.createElement('div');
    list.className = 'vd-list';
    items.forEach(v=>{
      const row = document.createElement('a');
      row.className = 'vd-item';
      row.href = v.url;
      row.target = '_blank';
      row.rel = 'noopener';
      row.textContent = v.title || v.url;
      list.appendChild(row);
    });
    appEls.vdLista.innerHTML = '';
    appEls.vdLista.appendChild(list);
  }
  openDialog(appEls.modalVideos);
}

/* ====== Sidebar ====== */
function bindSidebar(){
  if (!appEls.btnSidebar || !appEls.sidebar) return;
  appEls.btnSidebar.addEventListener('click', ()=>{
    appEls.sidebar.classList.add('open');
  });
  appEls.btnSideClose.addEventListener('click', ()=>{
    appEls.sidebar.classList.remove('open');
  });
  appEls.sbLinks.forEach(link=>{
    link.addEventListener('click', ()=>{
      const modalId = link.dataset.modal;
      const modal = document.getElementById(modalId);
      if (modal) openDialog(modal);
    });
  });
}

/* ====== Modal helpers ====== */
function polyfillDialog(el){
  if (!el.showModal){
    el.showModal = function(){
      el.setAttribute('open','');
      document.body.classList.add('modal-open');
    };
    el.close = function(){
      el.removeAttribute('open');
      document.body.classList.remove('modal-open');
    };
  }
}
function openDialog(el){ polyfillDialog(el); el.showModal(); }
function closeDialog(el){ el.close(); }

/* ====== Autocomplete ====== */
function acCompute(q){
  const k = norm(q);
  return state.ac.items.filter(it=> it.key.includes(k)).slice(0, 20);
}
function acOpen(items){
  appEls.acPanel.innerHTML = items.map((it, idx)=>`
    <div class="ac-item ${idx===0?'active':''}" data-index="${it.index}">
      ${escapeHTML(it.label)}
    </div>
  `).join('');
  appEls.acPanel.style.display = 'block';
  state.ac.open = true;
  state.ac.activeIndex = 0;
}
function acClose(){
  appEls.acPanel.style.display = 'none';
  appEls.acPanel.innerHTML = '';
  state.ac.open = false;
  state.ac.activeIndex = -1;
}
function acSetActive(idx){
  const items = appEls.acPanel.querySelectorAll('.ac-item');
  if (!items.length) return;
  if (idx<0) idx = 0;
  if (idx>=items.length) idx = items.length-1;
  items.forEach(i=> i.classList.remove('active'));
  items[idx].classList.add('active');
  state.ac.activeIndex = idx;
}
function acBind(){
  appEls.inpArtigo.addEventListener('input', ()=>{
    const q = appEls.inpArtigo.value;
    if (q.trim().length<1){ acClose(); return; }
    const items = acCompute(q);
    if (!items.length){ acClose(); return; }
    acOpen(items);
  });
  appEls.inpArtigo.addEventListener('blur', ()=> setTimeout(acClose, 150));
  appEls.acPanel.addEventListener('mousedown', (e)=>{
    const item = e.target.closest('.ac-item');
    if (!item) return;
    const idx = parseInt(item.dataset.index, 10);
    const node = state.artigosIndex[idx];
    if (node){
      openArticleModalByNode(node, /*fromSearch*/false);
      acClose();
    }
  });
}

/* ====== Busca ====== */
async function onBuscar(){
  const q = appEls.inpArtigo.value || '';
  state.termoBusca = q;
  if (!state.codigo){
    appEls.resultMsg.textContent = 'Selecione um Código primeiro.';
    return;
  }
  if (!q.trim()){
    appEls.resultMsg.textContent = 'Digite um número de artigo ou palavras inteiras.';
    return;
  }
  try{
    appEls.resultMsg.textContent = 'Procurando...';
    await sleep(50);
    const hits = computeHits(q);
    state.lastHits = hits;
    renderResultsMessage(hits);
    if (document.querySelector('[data-view].active')?.dataset.view==='list'){
      renderHitsList(hits, q);
    } else {
      renderHitsChips(hits);
    }
    if (hits.length===1){
      openArticleModalByNode(hits[0], /*fromSearch*/true);
    }
  }catch(err){
    console.error(err); appEls.resultMsg.textContent='Erro ao carregar os dados.';
  }
}

function bind(){
  ['btnPrev','btnNext','btnFechar','btnBuscar','btnSidebar','btnSideClose','btnVdFechar','btnReset','btnClear','btnScope','btnFav']
    .forEach(k=>appEls[k] && appEls[k].setAttribute('type','button'));

  // [ajuste] esconder e desativar o botão 'Navegar: Resultados/Código'
  if (appEls.btnScope) { appEls.btnScope.style.display = 'none'; appEls.btnScope.disabled = true; }

  // busca
  appEls.btnBuscar.addEventListener('click', onBuscar);
  appEls.inpArtigo.addEventListener('keydown', e=>{ 
    if(e.key==='Enter'){
      if (state.ac.open && state.ac.activeIndex>=0){
        const el = appEls.acPanel.querySelectorAll('.ac-item')[state.ac.activeIndex];
        el?.click(); return;
      }
      e.preventDefault(); onBuscar(); 
    } 
    if (state.ac.open && (e.key==='ArrowDown' || e.key==='ArrowUp')){
      e.preventDefault();
      const delta = e.key==='ArrowDown'?1:-1;
      acSetActive(state.ac.activeIndex + delta);
    }
    if (e.key==='Escape'){ acClose(); }
  });
  appEls.inpArtigo.addEventListener('input', ()=>{
    const q = appEls.inpArtigo.value;
    if (q.trim().length<1){ acClose(); return; }
    const items = acCompute(q);
    if (!items.length){ acClose(); return; }
    acOpen(items);
  });

  // autocomplete panel (já tem mousedown)
  acBind();

  // view toggle
  appEls.vtButtons.forEach(b=> b.addEventListener('click', ()=> switchView(b.dataset.view)));

  // modal artigo
  appEls.btnFechar.addEventListener('click', ()=>{ closeDialog(appEls.modalArtigo); });
  appEls.btnPrev.addEventListener('click', ()=>{ const arr=getScopeArray(); if(state.navIndex>0) openArticleModalByIndexVia(arr, state.navIndex-1); });
  appEls.btnNext.addEventListener('click', ()=>{ const arr=getScopeArray(); if(state.navIndex<arr.length-1) openArticleModalByIndexVia(arr, state.navIndex+1); });
  if (appEls.btnScope && !appEls.btnScope.disabled) appEls.btnScope.addEventListener('click', ()=>{
    state.navScope = state.navScope==='results' ? 'all' : 'results';
    appEls.btnScope.textContent = state.navScope==='results' ? 'Navegar: Resultados' : 'Navegar: Código';
    const curr = state.navArray[state.navIndex];
    openArticleModalByNode(curr, /*fromSearch*/state.navScope==='results');
  });
  appEls.btnFav && appEls.btnFav.addEventListener('click', toggleFavorite);

  // vídeos
  appEls.btnVdFechar && appEls.btnVdFechar.addEventListener('click', ()=> closeDialog(appEls.modalVideos));

  // sidebar
  bindSidebar();

  // limpar
  appEls.btnClear && appEls.btnClear.addEventListener('click', ()=>{
    appEls.inpArtigo.value = '';
    appEls.resultChips.innerHTML='';
    appEls.resultList.innerHTML='';
    renderResultsMessage([]);
    acClose();
    appEls.inpArtigo.focus();
  });

  // reset (recarregar UI limpa, mantendo último código)
  appEls.btnReset && appEls.btnReset.addEventListener('click', ()=>{
    appEls.inpArtigo.value = '';
    appEls.resultChips.innerHTML='';
    appEls.resultList.innerHTML='';
    renderResultsMessage([]);
    acClose();
    state.lastHits = [];
    state.navScope = 'results';
    showToast('Pronto!');
  });

  // select de código
  appEls.selCodigo.addEventListener('change', async ()=>{
    const id = appEls.selCodigo.value;
    if (!id) return;
    state.codigo = id;
    saveLastCode(id);
    appEls.resultMsg.textContent = 'Carregando código...';
    try{
      await loadCodigo(id);
      loadVideos();
      appEls.resultMsg.textContent = 'Código carregado. Digite o artigo ou palavras inteiras.';
    }catch(err){
      console.error(err);
      appEls.resultMsg.textContent = 'Erro ao carregar o código selecionado.';
    }
  });

  // favoritos modal
  appEls.favScope && appEls.favScope.addEventListener('change', ()=>{
    const scope = appEls.favScope.value || 'all';
    openFavsModal(scope);
  });

  // extras (vocabulário / princípios)
  bindVocab();
  bindPrincipios();
}

/* ====== Vocabulário (extra) ====== */
function vocabData(){
  // simples demonstrativo; pode ser expandido
  return [
    { termo: 'Dano moral', explicacao: 'Prejuízo de ordem não patrimonial, atingindo direitos da personalidade.' },
    { termo: 'Dano estético', explicacao: 'Deformidade ou alteração permanente da aparência física.' },
    { termo: 'Culpa', explicacao: 'Conduta imprudente, negligente ou imperita, sem intenção de causar o resultado.' },
    { termo: 'Dolo', explicacao: 'Vontade livre e consciente de realizar a conduta e produzir o resultado.' }
  ];
}
function renderVocabList(list){
  const frag = document.createDocumentFragment();
  list.forEach(item=>{
    const row = document.createElement('div');
    row.className = 'kv-row';
    const t = document.createElement('div');
    t.className = 'kv-term';
    t.textContent = item.termo;
    const v = document.createElement('div');
    v.className = 'kv-exp';
    v.textContent = item.explicacao;
    row.appendChild(t); row.appendChild(v);
    frag.appendChild(row);
  });
  appEls.vocabList.innerHTML = '';
  appEls.vocabList.appendChild(frag);
}
function bindVocab(){
  if (!appEls.modalVocab) return;
  renderVocabList(vocabData());
  appEls.vocabSearch.addEventListener('input', ()=>{
    const q = norm(appEls.vocabSearch.value);
    const base = vocabData();
    const list = base.filter(it=> norm(it.termo+' '+it.explicacao).includes(q));
    renderVocabList(list);
  });
  appEls.btnVocabCopy && appEls.btnVocabCopy.addEventListener('click', async ()=>{
    const list = vocabData().map(it=>`- **${it.termo}**: ${it.explicacao}`).join('\n');
    const txt = `Vocabulário-chave jurídico (resumo pessoal):\n\n${list}\n\n💚 direito.love — Gere um novo prompt em https://direito.love`;
    try{ await navigator.clipboard.writeText(txt); showToast('Copiado!'); }catch{ showToast('Copiado (tente colar)'); }
  });
}

/* ====== Princípios (extra) ====== */
function principiosData(){
  return [
    { nome: 'Legalidade', desc: 'Só há obrigação e sanção quando houver lei anterior que as defina.' },
    { nome: 'Contraditório e Ampla Defesa', desc: 'Direito de ser ouvido e de contrariar alegações em processo.' },
    { nome: 'Proporcionalidade', desc: 'Medidas devem ser adequadas, necessárias e proporcionais ao fim.' },
    { nome: 'Dignidade da Pessoa Humana', desc: 'Valor-fonte da ordem jurídica, orientando interpretação e aplicação do direito.' }
  ];
}
function renderPrincipiosList(list){
  const frag = document.createDocumentFragment();
  list.forEach(item=>{
    const row = document.createElement('div');
    row.className = 'kv-row';
    const t = document.createElement('div');
    t.className = 'kv-term';
    t.textContent = item.nome;
    const v = document.createElement('div');
    v.className = 'kv-exp';
    v.textContent = item.desc;
    row.appendChild(t); row.appendChild(v);
    frag.appendChild(row);
  });
  appEls.princList.innerHTML = '';
  appEls.princList.appendChild(frag);
}
function bindPrincipios(){
  if (!appEls.modalPrincipios) return;
  renderPrincipiosList(principiosData());
  appEls.princSearch.addEventListener('input', ()=>{
    const q = norm(appEls.princSearch.value);
    const base = principiosData();
    const list = base.filter(it=> norm(it.nome+' '+it.desc).includes(q));
    renderPrincipiosList(list);
  });
  appEls.btnPrincCopy && appEls.btnPrincCopy.addEventListener('click', async ()=>{
    const list = principiosData().map(it=>`- **${it.nome}**: ${it.desc}`).join('\n');
    const txt = `Princípios essenciais (resumo pessoal):\n\n${list}\n\n💚 direito.love — Gere um novo prompt em https://direito.love`;
    try{ await navigator.clipboard.writeText(txt); showToast('Copiado!'); }catch{ showToast('Copiado (tente colar)'); }
  });
}

/* ====== Init ====== */
async function init(){
  // restaura o último código
  const last = getLastCode();
  if (last){
    appEls.selCodigo.value = last;
    state.codigo = last;
    try{
      await loadCodigo(last);
      loadVideos();
      appEls.resultMsg.textContent = 'Código carregado. Digite o artigo ou palavras inteiras.';
    }catch{
      appEls.resultMsg.textContent = 'Selecione um Código.';
    }
  }

  // view padrão
  switchView('chips');

  bind();
}

document.addEventListener('DOMContentLoaded', init);
