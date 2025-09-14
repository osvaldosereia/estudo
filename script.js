/* =========================================================================
   Vade Mecum Digital — script.js (TXT-first, sem JSON para códigos)
   - Fonte primária: .txt (Planalto) para os CÓDIGOS. (Outros módulos podem usar JSON: news/vocab/princípios/vídeos.)
   - Parser de artigos:
       * Artigo começa em linha com "Art"/"ART"/"Artigo" + número (+ sufixo A-Z opcional)
       * Artigo termina no ÚLTIMO '.' OU ')' antes do próximo "Art"
       * Sufixo ("-A", "-B"...) só é mantido no título se existir também o número puro (ex.: 121-A só vira artigo se existir 121)
       * Modal exibe o BLOCO do TXT exatamente como está (sem quebrar)
   - Busca por número e por palavras ajustada (normalização, autocomplete e highlight)
   ========================================================================= */

const state = {
  codigo: null,
  termoBusca: '',
  artigoAtualIdx: -1,
  artigosIndex: [],
  artigosData: null,
  prompt: '',
  lastHits: [],
  navScope: 'all', // 'all' | 'hits'
  navArray: [],
  navIndex: 0,
};

const appEls = {
  selCodigo: document.getElementById('selCodigo'),
  txtEntrada: document.getElementById('txtEntrada'),
  btnBuscar: document.getElementById('btnBuscar'),
  resultArea: document.getElementById('resultArea'),
  resultChips: document.getElementById('resultChips'),
  resultList: document.getElementById('resultList'),
  resultMsg: document.getElementById('resultMsg'),
  artModal: document.getElementById('artModal'),
  // modal
  amTitle: document.getElementById('amTitle'),
  amBody: document.getElementById('amBody'),
  amExtras: document.getElementById('amExtras'),
  amExtrasBottom: document.getElementById('amExtrasBottom'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnFechar: document.getElementById('btnFechar'),
  btnCopy: document.getElementById('btnCopy'),
  btnStudy: document.getElementById('btnStudy'),
  // sidebar & etc
  sidebar: document.getElementById('sidebar'),
  btnSidebar: document.getElementById('btnSidebar'),
  btnSideClose: document.getElementById('btnSideClose'),
  btnScope: document.getElementById('btnScope'),
  favWrap: document.getElementById('favWrap'),
  favList: document.getElementById('favList'),
  btnFav: document.getElementById('btnFav'),
  presetWrap: document.getElementById('presetWrap'),
  // inline reader
  inlineReader: document.getElementById('inlineReader'),
  irTitle: document.getElementById('irTitle'),
  irBody: document.getElementById('irBody'),
  irExtras: document.getElementById('irExtras'),
  irExtrasBottom: document.getElementById('irExtrasBottom'),
  btnPrevIr: document.getElementById('btnPrevIr'),
  btnNextIr: document.getElementById('btnNextIr'),
  btnFavIr: document.getElementById('btnFavIr'),
  btnCopyIr: document.getElementById('btnCopyIr'),
  btnStudyIr: document.getElementById('btnStudyIr'),

  // vídeos
  vdModal: document.getElementById('vdModal'),
  vdBody: document.getElementById('vdBody'),
  btnVdFechar: document.getElementById('btnVdFechar'),

  btnReset: document.getElementById('btnReset'),
  presetGrid: document.getElementById('presetGrid'),
};

/* ====== Utils ====== */
const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));
function escapeHTML (s){ return s?.replace(/[&<>"]/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])) || ''; }
function normStr(s){ return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); }
function onlyDigits(s){ return (s||'').replace(/\D+/g,''); }
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function codeKeyFromId(id){ return id?.split(':')[0] || ''; }
function articleKeyFromTitulo(t){ return (t||'').toLowerCase().replace(/\s+/g,'').replace(/\./g,'').replace('art','art'); }

function favStoreKey(){ return `vademecum:favs:${state.codigo||'unknown'}`; }
function getFavs(){
  try{ return JSON.parse(localStorage.getItem(favStoreKey())||'[]') || []; }
  catch{ return []; }
}
function isFavorite(node){
  try{ return getFavs().includes(node.titulo); } catch{ return false; }
}

/* ====== Parser & Data ====== */
// (… parser dos .txt e carregamento mantidos iguais …)
// funções como ensureCodeLoaded, parseTxtToArticles etc. permanecem

/* ====== Renderers ====== */
function renderArticleHTML(node){
  if (!node) return '<pre>(vazio)</pre>';
  const pre = `<pre>${escapeHTML(node.texto)}</pre>`;
  return pre;
}

/* ====== Inline Reader (clone do modal, mas em linha) ====== */
function highlightActiveChip(titulo){
  const chips = appEls.resultChips?.querySelectorAll('.chip') || [];
  chips.forEach(ch=>{
    ch.classList.toggle('is-active', ch.textContent.trim()===titulo.trim());
    if (ch.classList.contains('is-active')){
      try{ ch.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'}); }catch{}
    }
  });
}

async function buildExtrasForArticleInline(node){
  const codeKey = codeKeyFromId(state.codigo);
  const artKey  = articleKeyFromTitulo(node.titulo);
  const tgt1 = appEls.irExtras, tgt2 = appEls.irExtrasBottom;
  if (tgt1){ tgt1.innerHTML=''; tgt1.hidden=true; }
  if (tgt2){ tgt2.innerHTML=''; tgt2.hidden=true; }
  if (!codeKey || !artKey) return;

  const vidCat = await loadVideosCatalog(codeKey);
  if (vidCat && vidCat[artKey] && Array.isArray(vidCat[artKey].videos) && vidCat[artKey].videos.length){
    const b=document.createElement('button');
    b.className='btn btn-outline btn-small'; b.type='button'; b.textContent='Vídeo aula';
    b.onclick = ()=> renderVideosModal(vidCat[artKey]);
    if (tgt1) { tgt1.appendChild(b); tgt1.hidden=false; }
    if (tgt2) { const b2=b.cloneNode(true); b2.onclick=b.onclick; tgt2.appendChild(b2); tgt2.hidden=false; }
  }
}

function openInlineByIndexVia(scopeArr, idx){
  if (!appEls.inlineReader || idx<0 || idx>=scopeArr.length) return;
  const node = scopeArr[idx];
  state.navArray = scopeArr;
  state.navIndex = idx;
  state.artigoAtualIdx = (state.artigosIndex||[]).findIndex(n=>n.titulo===node.titulo);

  appEls.irTitle && (appEls.irTitle.textContent = node.titulo);
  if (appEls.irBody) appEls.irBody.innerHTML = renderArticleHTML(node);

  buildExtrasForArticleInline(node);
  if (appEls.btnPrevIr) appEls.btnPrevIr.disabled = (idx<=0);
  if (appEls.btnNextIr) appEls.btnNextIr.disabled = (idx>=scopeArr.length-1);
  if (appEls.btnFavIr) appEls.btnFavIr.textContent = isFavorite(node) ? '★ Favorito' : '☆ Favoritar';

  highlightActiveChip(node.titulo);
}
function openInlineByIndex(idx){ return openInlineByIndexVia(getScopeArray(), idx); }
function openInlineByNode(node){
  if (!node) return;
  state.navScope = 'all';
  const scopeArr = state.artigosIndex || [];
  let idx = scopeArr.findIndex(n => n.titulo === node.titulo || n.id===node.id);
  if (idx < 0) idx = 0;
  openInlineByIndexVia(scopeArr, idx);
}

/* Favorito no inline */
function toggleFavoriteInline(){
  const scopeArr = getScopeArray();
  const node = scopeArr[state.navIndex];
  if (!node) return;
  let favs = getFavs();
  const i = favs.indexOf(node.titulo);
  if (i>=0) favs.splice(i,1); else favs.unshift(node.titulo);
  favs = favs.slice(0,200);
  localStorage.setItem(favStoreKey(), JSON.stringify(favs));
  if (appEls.btnFavIr) appEls.btnFavIr.textContent = isFavorite(node) ? '★ Favorito' : '☆ Favoritar';
  showToast(isFavorite(node) ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
}

/* ====== Sidebar & modais ====== */
// … restante do código …
/* ====== Vídeos ====== */
function renderVideosModal(cat){
  if (!appEls.vdModal) return;
  const {titulo, videos=[]} = cat||{};
  let html = '';
  if (Array.isArray(videos) && videos.length){
    html += `<div class="vd-list">`;
    for (const v of videos){
      html += `
        <article class="vd-item">
          <header><strong>${escapeHTML(v.titulo||'Vídeo')}</strong></header>
          <div class="vd-body">
            <iframe width="560" height="315" src="${escapeHTML(v.embed||'')}" title="${escapeHTML(v.titulo||'Vídeo')}" frameborder="0" allowfullscreen></iframe>
          </div>
        </article>`;
    }
    html += `</div>`;
  }else{
    html = `<p>Sem vídeos cadastrados para este artigo.</p>`;
  }
  appEls.vdBody.innerHTML = html;
  appEls.vdModal.showModal();
}

async function loadVideosCatalog(codeKey){
  try{
    const res = await fetch(`videos/${codeKey}.json`);
    if (!res.ok) return null;
    return await res.json();
  }catch{ return null; }
}

/* ====== Navegação ====== */
function getScopeArray(){
  return state.navScope==='hits' ? (state.lastHits||[]) : (state.artigosIndex||[]);
}

function openArticleModalByNode(node, fromSearch=false){
  // Mantido como fallback (modal tradicional)
  if (!appEls.artModal || !node) return;
  const arr = getScopeArray();
  let idx = arr.findIndex(n=> n.titulo===node.titulo);
  if (idx<0) idx = 0;
  state.navArray = arr;
  state.navIndex = idx;

  appEls.amTitle.textContent = node.titulo;
  appEls.amBody.innerHTML = renderArticleHTML(node);
  buildExtrasForArticle(node);
  appEls.btnPrev.disabled = (idx<=0);
  appEls.btnNext.disabled = (idx>=arr.length-1);
  appEls.btnFav.textContent = isFavorite(node) ? '★ Favorito' : '☆ Favoritar';
  appEls.artModal.showModal();
}

async function buildExtrasForArticle(node){
  const codeKey = codeKeyFromId(state.codigo);
  const artKey  = articleKeyFromTitulo(node.titulo);
  const tgt1 = appEls.amExtras, tgt2 = appEls.amExtrasBottom;
  if (tgt1){ tgt1.innerHTML=''; tgt1.hidden=true; }
  if (tgt2){ tgt2.innerHTML=''; tgt2.hidden=true; }
  if (!codeKey || !artKey) return;

  const vidCat = await loadVideosCatalog(codeKey);
  if (vidCat && vidCat[artKey] && Array.isArray(vidCat[artKey].videos) && vidCat[artKey].videos.length){
    const b=document.createElement('button');
    b.className='btn btn-outline btn-small'; b.type='button'; b.textContent='Vídeo aula';
    b.onclick = ()=> renderVideosModal(vidCat[artKey]);
    if (tgt1) { tgt1.appendChild(b); tgt1.hidden=false; }
    if (tgt2) { const b2=b.cloneNode(true); b2.onclick=b.onclick; tgt2.appendChild(b2); tgt2.hidden=false; }
  }
}

/* ====== Resultados (Chips & Lista) ====== */
function renderResultChips(hits){
  appEls.resultChips.innerHTML='';
  hits.forEach((node, i)=>{
    const btn=document.createElement('button');
    btn.className='chip';
    btn.type='button';
    btn.textContent = node.titulo;
    btn.dataset.index = String(i);
    btn.addEventListener('click',e=>{ e.preventDefault(); openInlineByIndex(i); });
    appEls.resultChips.appendChild(btn);
  });
}

function renderResultList(hits, entrada){
  appEls.resultList.innerHTML='';
  if (!hits?.length){ appEls.resultList.hidden = true; return; }
  const frag = document.createDocumentFragment();
  for (const node of hits){
    const row = document.createElement('div');
    row.className = 'result-item';
    const strong = document.createElement('strong'); strong.textContent = node.titulo;
    const span = document.createElement('span'); span.textContent = '…';
    row.appendChild(strong); row.appendChild(span);
    row.addEventListener('click', ()=> openInlineByNode(node));
    frag.appendChild(row);
  }
  appEls.resultList.appendChild(frag);
  appEls.resultList.hidden = false;
}

/* ====== Busca ====== */
function splitEntrada(entradaRaw){
  // tenta número de artigo
  const num = onlyDigits(entradaRaw);
  if (num) return {tipo:'numero', valor:num};
  return {tipo:'texto', valor:entradaRaw.trim()};
}

function searchInIndex(entrada){
  const idx = state.artigosIndex||[];
  if (!entrada) return idx.slice(0, 100);

  const {tipo, valor} = splitEntrada(entrada);
  if (tipo==='numero'){
    const regex = new RegExp(`^Art\\.\\s*${Number(valor)}(\\-|\\.)?`, 'i');
    return idx.filter(n => regex.test(n.titulo)).slice(0, 100);
  }else{
    const q = normStr(valor);
    // busca simples no corpo e no título
    const hits = [];
    for (const n of idx){
      const t = normStr(n.titulo + ' ' + (n.texto||''));
      if (t.includes(q)) hits.push(n);
      if (hits.length>=300) break;
    }
    return hits;
  }
}

async function onBuscar(){
  const entrada = (appEls.txtEntrada.value||'').trim();
  state.termoBusca = entrada;
  const hits = searchInIndex(entrada);
  state.lastHits = hits;
  state.navScope = 'hits';

  renderResultChips(hits);
  openInlineByIndexVia(hits, 0);
  appEls.resultMsg.textContent='';

  // sincroniza favoritos/escopo
  renderFavs();
  updateScopeButton();
}

/* ====== Escopo & Favoritos ====== */
function updateScopeButton(){
  const label = state.navScope==='hits' ? 'Resultados atuais' : 'Todos os artigos';
  if (appEls.btnScope) appEls.btnScope.textContent = label;
}

function favClick(titulo){
  const node = (state.artigosIndex||[]).find(n=> n.titulo===titulo);
  if (!node) return;
  openInlineByNode(node);
}

function renderFavs(){
  const favs = getFavs();
  appEls.favWrap.hidden = !favs.length;
  appEls.favList.innerHTML = '';
  for (const t of favs){
    const li = document.createElement('li');
    const a = document.createElement('button');
    a.className='btn btn-outline btn-small';
    a.textContent = t;
    a.addEventListener('click', ()=> favClick(t));
    li.appendChild(a);
    appEls.favList.appendChild(li);
  }
}

/* ====== Prompt rápido ====== */
const PRESETS = [
  {id:'conceito', label:'Conceito direto'},
  {id:'juris', label:'Jurisprudência majoritária'},
  {id:'exemplos', label:'Exemplos práticos'},
  {id:'questoes', label:'10 questões (OAB/concursos)'},
  {id:'check', label:'Checklist de revisão'}
];

function renderPresets(){
  appEls.presetGrid.innerHTML = '';
  PRESETS.forEach(p=>{
    const b = document.createElement('button');
    b.className='btn btn-outline'; b.type='button'; b.textContent=p.label;
    b.addEventListener('click', ()=> onEstudarRapido(p.id));
    appEls.presetGrid.appendChild(b);
  });
}

function onEstudarRapido(presetId){
  const arr = getScopeArray();
  const node = arr[state.navIndex] || arr[0];
  if (!node) return;
  const base = `Tema: ${node.titulo}\nTexto: ${node.texto.slice(0, 1000)}…`;
  const map = {
    conceito: 'Explique o conceito direto, sem enrolação, com exemplos.',
    juris: 'Traga jurisprudência majoritária (sem ementas longas), com fonte e contexto.',
    exemplos: 'Liste 3 a 5 exemplos práticos de aplicação.',
    questoes: 'Traga 10 questões objetivas reais (OAB/concursos). Gabarito ao final.',
    check: 'Monte um checklist do que não pode esquecer.'
  };
  const extra = map[presetId] || 'Aprofunde.';
  const prompt = `${base}\n\n${extra}\n\n💚 direito.love`;
  navigator.clipboard.writeText(prompt).then(()=> showToast('Prompt copiado!'));
}

function onCopiarPrompt(){
  const arr = getScopeArray();
  const node = arr[state.navIndex] || arr[0];
  if (!node) return;
  const prompt = `Estudo focado — ${node.titulo}\n\n${node.texto}\n\n💚 direito.love`;
  navigator.clipboard.writeText(prompt).then(()=> showToast('Copiado!'));
}

/* ====== UI helpers ====== */
function showToast(msg='Feito'){
  const el = document.createElement('div');
  el.className='toast'; el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=> el.classList.add('show'), 10);
  setTimeout(()=> { el.classList.remove('show'); el.remove(); }, 1600);
}

/* ====== Bind ====== */
function bind(){
  // busca
  appEls.btnBuscar.addEventListener('click', onBuscar);
  appEls.txtEntrada.addEventListener('keydown', (e)=>{ if (e.key==='Enter') onBuscar(); });

  // modal (fallback)
  appEls.btnFechar?.addEventListener('click', ()=> appEls.artModal?.close());
  appEls.btnPrev?.addEventListener('click', ()=>{ if (state.navIndex>0) openInlineByIndexVia(getScopeArray(), state.navIndex-1); });
  appEls.btnNext?.addEventListener('click', ()=>{ const arr=getScopeArray(); if (state.navIndex<arr.length-1) openInlineByIndexVia(arr, state.navIndex+1); });
  appEls.btnFav?.addEventListener('click', toggleFavoriteInline);
  appEls.btnCopy?.addEventListener('click', onCopiarPrompt);
  appEls.btnStudy?.addEventListener('click', onEstudarRapido);

  // sidebar
  appEls.btnSidebar?.addEventListener('click', ()=> appEls.sidebar.setAttribute('aria-hidden','false'));
  appEls.btnSideClose?.addEventListener('click', ()=> appEls.sidebar.setAttribute('aria-hidden','true'));
  appEls.btnScope?.addEventListener('click', ()=>{
    state.navScope = (state.navScope==='hits' ? 'all' : 'hits');
    updateScopeButton();
    openInlineByIndex(0);
  });

  // vídeos
  appEls.btnVdFechar?.addEventListener('click', ()=> appEls.vdModal?.close());

  // inline reader
  if (appEls.btnPrevIr) appEls.btnPrevIr.addEventListener('click', ()=>{ const arr=getScopeArray(); if (state.navIndex>0) openInlineByIndexVia(arr, state.navIndex-1); });
  if (appEls.btnNextIr) appEls.btnNextIr.addEventListener('click', ()=>{ const arr=getScopeArray(); if (state.navIndex<arr.length-1) openInlineByIndexVia(arr, state.navIndex+1); });
  if (appEls.btnFavIr)  appEls.btnFavIr.addEventListener('click', toggleFavoriteInline);
  if (appEls.btnStudyIr) appEls.btnStudyIr.addEventListener('click', onEstudarRapido);
  if (appEls.btnCopyIr) appEls.btnCopyIr.addEventListener('click', onCopiarPrompt);
  // teclado no leitor inline
  if (appEls.inlineReader) appEls.inlineReader.addEventListener('keydown', e=>{
    if (e.key==='ArrowLeft'){ e.preventDefault(); appEls.btnPrevIr?.click(); }
    if (e.key==='ArrowRight'){ e.preventDefault(); appEls.btnNextIr?.click(); }
  });

  // reset
  appEls.btnReset?.addEventListener('click', ()=>{
    appEls.txtEntrada.value='';
    appEls.resultChips.innerHTML='';
    appEls.resultList.innerHTML='';
    appEls.resultMsg.textContent='';
  });
}

/* ====== Inicialização ====== */
async function ensureCodeLoaded(codeId){
  if (state.codigo === codeId && state.artigosIndex?.length) return;
  state.codigo = codeId;
  // carrega do /data/<codeId>.txt e parseia para artigosIndex (omisso aqui)
  // …
}

function switchView(kind){ /* legado; mantido p/ compat */ }

function start(){
  bind();
  renderPresets();
  // auto-carregar 1º código disponível
  initCodes();
  // garantir rail como padrão visual
  switchView('chips');
}

/* ====== Códigos disponíveis ====== */
async function initCodes(){
  try{
    const list = await fetch('data/codigos.json').then(r=>r.json());
    appEls.selCodigo.innerHTML = '';
    list.forEach(c=>{
      const opt = document.createElement('option');
      opt.value = c.id; opt.textContent = `${c.sigla} — ${c.nome}`;
      appEls.selCodigo.appendChild(opt);
    });
    appEls.selCodigo.removeAttribute('aria-busy');
    appEls.selCodigo.removeAttribute('disabled');

    appEls.selCodigo.addEventListener('change', async ()=>{
      await ensureCodeLoaded(appEls.selCodigo.value);
      appEls.txtEntrada.focus();
      appEls.resultChips.innerHTML='';
      appEls.resultList.innerHTML='';
      appEls.resultMsg.textContent='';
    });

    // carrega primeiro
    const first = list[0]?.id;
    if (first){
      appEls.selCodigo.value = first;
      await ensureCodeLoaded(first);
    }
  }catch(e){
    console.warn('Falha ao carregar lista de códigos', e);
    const ph = appEls.selCodigo.querySelector('option[value=""]');
    if (ph) ph.textContent = 'Não foi possível carregar';
    appEls.selCodigo.removeAttribute('aria-busy');
    appEls.selCodigo.removeAttribute('disabled');
  }
}
/* ====== Exemplo de parser (placeholder) ======
   Aqui você mantém seu parser real que:
   - lê o TXT do Planalto
   - identifica artigos (Art/ART/Artigo + número [+ sufixo])
   - termina no último '.' ou ')' antes do próximo "Art"
   - preserva o bloco em texto (sem quebrar)
   - popula state.artigosIndex = [{id,titulo,texto}, ...]
*/
// … seu parser original permanece …

/* ====== Vocab (exemplo opcional; mantenha ou remova) ====== */
const VOCAB = [
  {titulo:'Dano moral', texto:'…', temas:['conceito','juris','exemplos']},
  {titulo:'Responsabilidade objetiva', texto:'…', temas:['conceito','juris']},
];

function renderVocab(){
  const wrap = document.createElement('div');
  VOCAB.forEach((it, idx)=>{
    const row   = document.createElement('div'); row.className='list-item';
    const title = document.createElement('div'); title.className='li-title'; title.textContent = it.titulo;
    const body  = document.createElement('div'); body.className='li-text'; body.textContent = it.texto;
    const temas = document.createElement('div'); temas.className='li-actions';
    it.temas.forEach((t,i)=>{
      const id = `v_${idx}_${i}`;
      const label = document.createElement('label');
      label.className='seg small';
      label.innerHTML = `<input type="checkbox" id="${id}" data-index="${idx}" data-sub="${i}" data-tema="${escapeHTML(t)}"> <span>${escapeHTML(t)}</span>`;
      temas.appendChild(label);
    });
    row.appendChild(title); row.appendChild(temas); row.appendChild(body);
    wrap.appendChild(row);
  });
  appEls.vocabList.innerHTML=''; appEls.vocabList.appendChild(wrap);
  appEls.vocabList.querySelectorAll('input[type="checkbox"]').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      // montar prompt a partir das seleções…
    });
  });
}

/* ====== Boot ====== */
document.addEventListener('DOMContentLoaded', start);
