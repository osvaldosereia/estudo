/* =========================================================================
   Vade Mecum Digital — script.js
   Estratégia: TXT-first (Planalto). Parser robusto + rail de chips + leitor inline.
   ========================================================================= */

// ======= State =======
const state = {
  codigo: null,
  termoBusca: '',
  artigoAtualIdx: -1,
  artigosIndex: [],   // [{id,titulo,texto}]
  prompt: '',
  lastHits: [],
  navScope: 'all', // 'all' | 'hits'
  navArray: [],
  navIndex: 0,
};

// ======= Elements =======
const appEls = {
  selCodigo: document.getElementById('selCodigo'),
  txtEntrada: document.getElementById('txtEntrada'),
  btnBuscar: document.getElementById('btnBuscar'),
  resultArea: document.getElementById('resultArea'),
  resultChips: document.getElementById('resultChips'),
  resultList: document.getElementById('resultList'),
  resultMsg: document.getElementById('resultMsg'),

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

  // sidebar & modal fallback
  sidebar: document.getElementById('sidebar'),
  btnSidebar: document.getElementById('btnSidebar'),
  btnSideClose: document.getElementById('btnSideClose'),
  btnScope: document.getElementById('btnScope'),
  favWrap: document.getElementById('favWrap'),
  favList: document.getElementById('favList'),
  presetWrap: document.getElementById('presetWrap'),
  presetGrid: document.getElementById('presetGrid'),
  artModal: document.getElementById('artModal'),
  amTitle: document.getElementById('amTitle'),
  amBody: document.getElementById('amBody'),
  amExtras: document.getElementById('amExtras'),
  amExtrasBottom: document.getElementById('amExtrasBottom'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnFechar: document.getElementById('btnFechar'),
  btnCopy: document.getElementById('btnCopy'),
  btnStudy: document.getElementById('btnStudy'),

  btnReset: document.getElementById('btnReset'),
};

// ======= Utils =======
const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));
const escapeHTML = (s)=> s?.replace(/[&<>"]/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])) || '';
const normStr = (s)=> (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
const onlyDigits = (s)=> (s||'').replace(/\D+/g,'');
const clamp = (n,a,b)=> Math.max(a, Math.min(b, n));

const codeKeyFromId = (id)=> id?.split(':')[0] || '';
const articleKeyFromTitulo = (t)=> (t||'').toLowerCase().replace(/\s+/g,'').replace(/\./g,'').replace('art','art');

const favStoreKey = ()=> `vademecum:favs:${state.codigo||'unknown'}`;
const getFavs = ()=> { try{ return JSON.parse(localStorage.getItem(favStoreKey())||'[]')||[]; }catch{ return []; } };
const isFavorite = (node)=> { try{ return getFavs().includes(node.titulo); }catch{ return false; } };

// ======= Parser =======
// Regras: Art inicia em ^(Art\.?|ART|Artigo)\s*\d{1,4}([A-Z]|-[A-Z])?  (aceita º/o)
const ART_START = /^(Art\.?|ART|Artigo)\s*\.?\s*(\d{1,4})(?:\s*º|\s*o)?(?:-([A-Z]))?/i;

// "Um artigo termina no ÚLTIMO '.' OU ')' antes do próximo Art"
function parseTxtToArticles(txt){
  const out = [];
  const lines = txt.replace(/\r\n/g,'\n').split('\n');

  let i=0;
  while(i < lines.length){
    const line = lines[i];
    const m = line.match(ART_START);
    if(!m){ i++; continue; }

    // cola linhas até o próximo início de Art
    const buf = [line];
    let j = i+1;
    while(j < lines.length && !ART_START.test(lines[j])){
      buf.push(lines[j]);
      j++;
    }
    const block = buf.join('\n');

    // título
    const num = m[2];
    const sufx = m[3] ? `-${m[3]}` : '';
    const titulo = `Art. ${Number(num)}${sufx}.`;

    // corpo: até o último '.' ou ')' do bloco
    let body = block.slice(line.length).trimStart();
    const lastDot = body.lastIndexOf('.');
    const lastParen = body.lastIndexOf(')');
    const cut = Math.max(lastDot, lastParen);
    if (cut > -1) body = body.slice(0, cut+1);

    body = body.replace(/[ \t]+$/gm,''); // tira espaços à direita

    out.push({ id:`art${num}${sufx?'-'+sufx.replace('-',''):''}`, titulo, texto: `${titulo} ${body}`.trim() });
    i = j;
  }
  return out;
}

// ======= Data loading =======
async function fetchTextOrNull(url){
  try{
    const r = await fetch(url, {cache:'no-store'});
    if(!r.ok) return null;
    return await r.text();
  }catch{ return null; }
}

// Fallback que garante o app ligado mesmo sem /data
const FALLBACK_LIST = [{id:'cdc', sigla:'CDC', nome:'Código de Defesa do Consumidor'}];
const FALLBACK_TXT = `Art. 1º O presente código estabelece normas de proteção e defesa do consumidor.

Art. 2º Consumidor é toda pessoa física ou jurídica que adquire ou utiliza produto ou serviço como destinatário final.
Parágrafo único. Equipara-se a consumidor a coletividade de pessoas, ainda que indetermináveis, que haja intervindo nas relações de consumo.`;

async function ensureCodeLoaded(codeId){
  if (state.codigo === codeId && state.artigosIndex?.length) return;
  state.codigo = codeId;
  state.artigosIndex = [];
  state.lastHits = [];
  state.navScope = 'all';
  const url = `data/${codeId}.txt`;
  let raw = await fetchTextOrNull(url);
  if(!raw){ raw = FALLBACK_TXT; } // fallback
  state.artigosIndex = parseTxtToArticles(raw);
  if(!state.artigosIndex.length){
    state.artigosIndex = parseTxtToArticles(FALLBACK_TXT);
  }
}

// ======= Render =======
function renderArticleHTML(node){
  if (!node) return '<pre>(vazio)</pre>';
  return `<pre>${escapeHTML(node.texto)}</pre>`;
}

// Inline reader helpers
function highlightActiveChip(titulo){
  const chips = appEls.resultChips?.querySelectorAll('.chip') || [];
  chips.forEach(ch=>{
    ch.classList.toggle('is-active', ch.textContent.trim()===titulo.trim());
    if (ch.classList.contains('is-active')){
      try{ ch.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'}); }catch{}
    }
  });
}

async function loadVideosCatalog(codeKey){
  try{
    const res = await fetch(`videos/${codeKey}.json`);
    if (!res.ok) return null;
    return await res.json();
  }catch{ return null; }
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

// vídeos modal
function renderVideosModal(cat){
  if (!appEls.vdModal) return;
  const {videos=[]} = cat||{};
  let html = '';
  if (Array.isArray(videos) && videos.length){
    html += `<div class="vd-list">`;
    for (const v of videos){
      html += `<article class="vd-item"><header><strong>${escapeHTML(v.titulo||'Vídeo')}</strong></header>
      <div class="vd-body"><iframe width="560" height="315" src="${escapeHTML(v.embed||'')}" title="${escapeHTML(v.titulo||'Vídeo')}" frameborder="0" allowfullscreen></iframe></div></article>`;
    }
    html += `</div>`;
  }else{
    html = `<p>Sem vídeos cadastrados para este artigo.</p>`;
  }
  appEls.vdBody.innerHTML = html;
  appEls.vdModal.showModal();
}

// ======= Resultados (chips & lista) =======
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

function renderResultList(hits){
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

// ======= Busca =======
function splitEntrada(entradaRaw){
  const num = onlyDigits(entradaRaw);
  if (num) return {tipo:'numero', valor:num};
  return {tipo:'texto', valor:(entradaRaw||'').trim()};
}

function searchInIndex(entrada){
  const idx = state.artigosIndex||[];
  if (!entrada) return idx.slice(0, 100);

  const {tipo, valor} = splitEntrada(entrada);
  if (tipo==='numero'){
    const regex = new RegExp(`^Art\\.\\s*${Number(valor)}(\\-|\\.)?`, 'i');
    return idx.filter(n => regex.test(n.titulo)).slice(0, 200);
  }else{
    const q = normStr(valor);
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

  renderFavs();
  updateScopeButton();
}

// ======= Escopo & Favoritos =======
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

/* Favorito no inline */
function toggleFavoriteInline(){
  const arr = getScopeArray();
  const node = arr[state.navIndex];
  if (!node) return;
  let favs = getFavs();
  const i = favs.indexOf(node.titulo);
  if (i>=0) favs.splice(i,1); else favs.unshift(node.titulo);
  favs = favs.slice(0,200);
  localStorage.setItem(favStoreKey(), JSON.stringify(favs));
  if (appEls.btnFavIr) appEls.btnFavIr.textContent = isFavorite(node) ? '★ Favorito' : '☆ Favoritar';
  showToast(isFavorite(node) ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
}

function getScopeArray(){
  return state.navScope==='hits' ? (state.lastHits||[]) : (state.artigosIndex||[]);
}

// ======= Presets & Prompt =======
const PRESETS = [
  {id:'conceito', label:'Conceito direto'},
  {id:'juris', label:'Jurisprudência majoritária'},
  {id:'exemplos', label:'Exemplos práticos'},
  {id:'questoes', label:'10 questões (OAB/concursos)'},
  {id:'check', label:'Checklist de revisão'},
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
    check: 'Monte um checklist do que não pode esquecer.',
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

// ======= UI helpers =======
function showToast(msg='Feito'){
  const el = document.createElement('div');
  el.className='toast'; el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=> el.classList.add('show'), 10);
  setTimeout(()=> { el.classList.remove('show'); el.remove(); }, 1600);
}

// ======= Bind =======
function bind(){
  // busca
  appEls.btnBuscar.addEventListener('click', onBuscar);
  appEls.txtEntrada.addEventListener('keydown', (e)=>{ if (e.key==='Enter') onBuscar(); });

  // sidebar
  appEls.btnSidebar?.addEventListener('click', ()=> appEls.sidebar.setAttribute('aria-hidden','false'));
  appEls.btnSideClose?.addEventListener('click', ()=> appEls.sidebar.setAttribute('aria-hidden','true'));
  appEls.btnScope?.addEventListener('click', ()=>{
    state.navScope = (state.navScope==='hits' ? 'all' : 'hits');
    updateScopeButton();
    openInlineByIndex(0);
  });

  // inline reader
  appEls.btnPrevIr?.addEventListener('click', ()=>{ const arr=getScopeArray(); if (state.navIndex>0) openInlineByIndexVia(arr, state.navIndex-1); });
  appEls.btnNextIr?.addEventListener('click', ()=>{ const arr=getScopeArray(); if (state.navIndex<arr.length-1) openInlineByIndexVia(arr, state.navIndex+1); });
  appEls.btnFavIr?.addEventListener('click', toggleFavoriteInline);
  appEls.btnCopyIr?.addEventListener('click', onCopiarPrompt);
  appEls.btnStudyIr?.addEventListener('click', onEstudarRapido);
  // teclado no leitor inline
  appEls.inlineReader?.addEventListener('keydown', e=>{
    if (e.key==='ArrowLeft'){ e.preventDefault(); appEls.btnPrevIr?.click(); }
    if (e.key==='ArrowRight'){ e.preventDefault(); appEls.btnNextIr?.click(); }
  });

  // vídeos
  appEls.btnVdFechar?.addEventListener('click', ()=> appEls.vdModal?.close());

  // modal fallback
  appEls.btnFechar?.addEventListener('click', ()=> appEls.artModal?.close());
  appEls.btnPrev?.addEventListener('click', ()=>{ if (state.navIndex>0) openInlineByIndexVia(getScopeArray(), state.navIndex-1); });
  appEls.btnNext?.addEventListener('click', ()=>{ const arr=getScopeArray(); if (state.navIndex<arr.length-1) openInlineByIndexVia(arr, state.navIndex+1); });
  appEls.btnFav?.addEventListener('click', toggleFavoriteInline);
  appEls.btnCopy?.addEventListener('click', onCopiarPrompt);
  appEls.btnStudy?.addEventListener('click', onEstudarRapido);

  // reset
  appEls.btnReset?.addEventListener('click', ()=>{
    appEls.txtEntrada.value='';
    appEls.resultChips.innerHTML='';
    appEls.resultList.innerHTML='';
    appEls.resultMsg.textContent='';
  });
}

// ======= Init =======
async function initCodes(){
  let list = null;
  try{
    list = await fetch('data/codigos.json', {cache:'no-store'}).then(r=> r.ok ? r.json() : null);
  }catch{ /* noop */ }
  if(!Array.isArray(list) || !list.length){
    list = FALLBACK_LIST; // garante que o app sobe
  }
  appEls.selCodigo.innerHTML = '';
  list.forEach(c=>{
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = `${c.sigla} — ${c.nome}`;
    appEls.selCodigo.appendChild(opt);
  });

  appEls.selCodigo.addEventListener('change', async ()=>{
    await ensureCodeLoaded(appEls.selCodigo.value);
    appEls.txtEntrada.focus();
    appEls.resultChips.innerHTML='';
    appEls.resultList.innerHTML='';
    appEls.resultMsg.textContent='';
  });

  // carrega 1º
  const first = list[0]?.id;
  if (first){
    appEls.selCodigo.value = first;
    await ensureCodeLoaded(first);
  }
}

function updateScopeButton(){ const label = state.navScope==='hits' ? 'Resultados atuais' : 'Todos os artigos'; if (appEls.btnScope) appEls.btnScope.textContent = label; }
function switchView(){ /* legado, não usado */ }
function start(){ bind(); renderPresets(); initCodes(); switchView('chips'); }
document.addEventListener('DOMContentLoaded', start);
