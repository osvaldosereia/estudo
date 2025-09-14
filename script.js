/* =========================================================================
   Vade Mecum Digital — script.js (TXT-first)
   Consolidado (PASSOS 1–7):
   - Descoberta paralela + placeholder "Carregando Códigos…" → "Códigos/Leis"
   - fetch cache-friendly, HEAD com timeout e fallback Range
   - Cache de sessão (sessionStorage) do parse
   - Resultados com skeleton + renderização incremental
   - Acessibilidade: foco automático + focus trap em dialog
   - Modo leitura, Modo foco (página) e atalhos de teclado
   - Deep-link no hash (slug humano) + copiar link + copiar citação
   ========================================================================= */

const state = {
  codigo: null,
  termoBusca: '',
  artigoAtualIdx: -1,
  artigosIndex: [],
  artigosData: null,
  prompt: '',
  lastHits: [],
  viewMode: 'chips', // 'chips' | 'list'
  searchMode: 'precise', // 'precise' | 'flex'
  navScope: 'results', // 'results' | 'all'
  navArray: [],
  navIndex: -1,
  codePaths: {}, // id -> path .txt
  catalogs: { videos: {} },
  vocab: { data: [], selected: [] },
  princ: { data: [], selected: [] },
  news: { data: [] },
  ac: { open:false, items:[], activeIndex:-1 },
  readingMode: false,
  focusMode: false
};

const appEls = {
  // busca
  selCodigo: document.getElementById('selCodigo'),
  inpArtigo: document.getElementById('inpArtigo'),
  btnBuscar: document.getElementById('btnBuscar'),
  btnClear: document.getElementById('btnClear'),
  resultArea: document.getElementById('resultArea'),
  resultChips: document.getElementById('resultChips'),
  resultList: document.getElementById('resultList'),
  resultMsg: document.getElementById('resultMsg'),
  vtButtons: document.querySelectorAll('.vt-btn'),
  modeRadios: document.querySelectorAll('input[name="mode"]'),
  acPanel: document.getElementById('acPanel'),
  toast: document.getElementById('toast'),

  // modal artigo
  modalArtigo: document.getElementById('modalArtigo'),
  amTitle: document.getElementById('amTitle'),
  amBody: document.getElementById('amBody'),
  amExtras: document.getElementById('amExtras'),
  amMeta: document.getElementById('amMeta'),
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

  // vídeos
  modalVideos: document.getElementById('modalVideos'),
  vdTitle: document.getElementById('vdTitle'),
  vdLista: document.getElementById('vdLista'),
  btnVdFechar: document.getElementById('btnVdFechar'),

  // sidebar
  btnSidebar: document.getElementById('btnSidebar'),
  btnSideClose: document.getElementById('btnSideClose'),
  sidebar: document.getElementById('sidebar'),
  sideBackdrop: document.getElementById('sideBackdrop'),

  // side modals
  modalCursos: document.getElementById('modalCursos'),
  cursosBody: document.getElementById('cursosBody'),

  modalNoticias: document.getElementById('modalNoticias'),
  newsSearch: document.getElementById('newsSearch'),
  newsList: document.getElementById('newsList'),

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

  // mini-modal Estudar Rápido
  modalIA: document.getElementById('modalIA'),
  btnIaClose: document.getElementById('btnIaClose'),
  btnIaGPT: document.getElementById('btnIaGPT'),
  btnIaGemini: document.getElementById('btnIaGemini'),
  btnIaCopilot: document.getElementById('btnIaCopilot'),
  btnIaPplx: document.getElementById('btnIaPplx'),

  // reset (topbar)
  btnReset: document.getElementById('btnReset')
};

/* ====== Utils ====== */
const escapeHTML = s => (s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
const norm = s => (s||'').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ')
  .replace(/\s+/g,' ').trim();
const words = s => { const n=norm(s); return n?n.split(' ').filter(Boolean):[]; };
const onlyDigits = s => { const m=String(s||'').match(/\d{1,4}/); return m?m[0]:null; };
const codeKeyFromId = id => String(id||'').replace(/^codigo_/,'').trim();
function articleKeyFromTitulo(t){
  const m=(t||'').toLowerCase().match(/art\.?\s*(\d{1,4})(?:[\s\-]*([a-z]))?/i);
  return m?`art${m[1]}${m[2]||''}`:null;
}
function showToast(msg){
  if(!appEls.toast) return;
  appEls.toast.textContent=msg;
  appEls.toast.classList.add('show');
  setTimeout(()=>appEls.toast.classList.remove('show'), 1600);
}

/* ---- SVG helpers ---- */
function svgIcon(name){
  switch(name){
    case 'star':
      return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 17.3l-5.6 3.3 1.5-6.4L3 9.8l6.6-.6L12 3l2.4 6.2 6.6.6-4.9 4.4 1.5 6.4z"/></svg>';
    case 'star-outline':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3l2.4 6.2 6.6.6-4.9 4.4 1.5 6.4L12 17.3 6.4 20.6l1.5-6.4L3 9.8l6.6-.6L12 3z"/></svg>';
    case 'trash':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6h10z"/></svg>';
    case 'open':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 3h7v7M21 3l-9 9"/><path d="M10 7H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-4"/></svg>';
    case 'play':
      return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    case 'book':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4v15.5A2.5 2.5 0 0 1 6.5 22H20V6a2 2 0 0 0-2-2H6"/></svg>';
    case 'news':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h7M7 12h10M7 16h6"/></svg>';
    case 'link':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l2.8-2.8a5 5 0 1 0-7.1-7.1L11 4"/><path d="M14 11a5 5 0 0 0-7.1 0L4 13.8a5 5 0 0 0 7.1 7.1L13 20"/></svg>';
    default: return '';
  }
}

/* ------- fetch helpers com cache normal (sem cache-buster) ------- */
async function getJSON(path){
  const r = await fetch(path, { cache:'default' });
  if (!r.ok) throw new Error(`Erro ${r.status} ao carregar ${path}`);
  return r.json();
}
async function getHTML(path){
  const r = await fetch(path, { cache:'default' });
  if (!r.ok) throw new Error(`Erro ${r.status} ao carregar ${path}`);
  return r.text();
}
/** HEAD "cache-friendly" + timeout + fallback GET parcial se HEAD não for aceito */
async function fileExists(path, { timeoutMs = 4000 } = {}){
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const r = await fetch(path, { method:'HEAD', cache:'default', signal: ctrl.signal });
    if (r.ok) return true;
    if (r.status===405 || r.status===501){ // fallback: alguns hosts não suportam HEAD
      const r2 = await fetch(path, { method:'GET', headers:{'Range':'bytes=0-0'}, cache:'default', signal: ctrl.signal });
      return r2.ok || r2.status===206;
    }
    return false;
  }catch{
    return false;
  }finally{
    clearTimeout(timer);
  }
}

/* ====== TXT-first loader ================================================= */
async function getText(path){
  const r = await fetch(path, { cache:'default' });
  if (!r.ok) throw new Error(`Erro ${r.status} ao carregar ${path}`);
  return r.text();
}
function normalizeNewlines(s){ return String(s||'').replace(/\r\n?/g, '\n'); }

/**
 * Parser TXT → artigos (com pós-processamento para sufixos "A/B/C").
 * - O bloco completo do artigo é guardado em `full` (igual ao TXT, cortado no último '.' ou ')').
 * - `titulo`: "Art. N" ou "Art. N-A" SOMENTE se existir "Art. N" no conjunto.
 * - `texto`: corpo sem o cabeçalho; no modal e no prompt usamos `full`.
 */
function parseTxtToArtigos(txt){
  const text = normalizeNewlines(txt).replace(/<[^>]+>/g, ''); // remove tags HTML residuais

  // 1) Detectar todos os cabeçalhos
  const reHeader = /(^|\n)\s*(Art(?:\.|igo)?)\s*([0-9]{1,4})\s*(?:[-–—]?\s*([A-Za-z]))?\s*(?:º|o)?\s*(?:\.|:)?/gi;
  const headers = [];
  let m;
  while ((m = reHeader.exec(text)) !== null) {
    const newlineLen = m[1] ? m[1].length : 0;
    headers.push({ start: m.index + newlineLen, word: m[2], num: m[3], suf: (m[4]||'').toUpperCase() });
  }
  if (!headers.length) return {};

  // 2) Montar blocos e cortar no último '.' ou ')'
  const blocks = headers.map((h, i) => {
    const nextStart = i < headers.length - 1 ? headers[i+1].start : text.length;
    let block = text.slice(h.start, nextStart);
    const lastDot  = block.lastIndexOf('.');
    const lastParen= block.lastIndexOf(')');
    const lastPos = Math.max(lastDot, lastParen);
    if (lastPos >= 0) block = block.slice(0, lastPos + 1);

    const headerLineMatch = block.match(/^\s*(Art(?:\.|igo)?)\s*([0-9]{1,4})\s*(?:[-–—]?\s*([A-Za-z]))?\s*(?:º|o)?\s*(?:\.|:)?\s*/i);
    const headerEnd = headerLineMatch ? headerLineMatch[0].length : 0;
    const body = block.slice(headerEnd).replace(/^\s+/, '');
    return { ...h, block, body };
  });

  // 3) Pré-títulos com sufixo (provisório)
  const prelim = blocks.map(b => {
    const key = `art${b.num}${(b.suf||'').toLowerCase()}`;
    const titulo = `Art. ${b.num}${b.suf?('-'+b.suf):''}`;
    return { id:key, num:b.num, suf:b.suf, titulo, full:b.block, texto:b.body };
  });

  // 4) Desambiguar sufixos
  const byNum = new Map();
  prelim.forEach(n => { const arr = byNum.get(n.num) || []; arr.push(n); byNum.set(n.num, arr); });
  const hasPlain = new Map();
  byNum.forEach((arr, num) => { hasPlain.set(num, arr.some(n => !n.suf)); });

  const data = {};
  prelim.forEach(n => {
    if (n.suf && !hasPlain.get(n.num)) { // falso 121-A -> vira 121
      n.titulo = `Art. ${n.num}`;
      n.id = `art${n.num}`;
    }
    data[n.id] = { id:n.id, titulo:n.titulo, texto:n.texto, full:n.full };
  });

  return data;
}

/* ================= Descoberta automática de códigos (SOMENTE TXT) ================ */

/** Opção incremental no <select> */
function ensureSelectPlaceholder(){
  const sel = appEls.selCodigo;
  if (!sel) return;
  // garante opção placeholder
  const hasPh = !!sel.querySelector('option[value=""]');
  if (!hasPh){
    const opt = document.createElement('option');
    opt.value = '';
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = 'Carregando Códigos…';
    sel.appendChild(opt);
  }else{
    const ph = sel.querySelector('option[value=""]');
    if (ph) { ph.disabled = true; ph.selected = true; ph.textContent='Carregando Códigos…'; }
  }
  sel.setAttribute('disabled','true');
  sel.setAttribute('aria-busy','true');
}
function addCodeOption(c){
  const opt = document.createElement('option');
  opt.value = c.id;
  opt.textContent = c.label;
  appEls.selCodigo.appendChild(opt);
}
function finalizeSelectPlaceholder(){
  const ph = appEls.selCodigo.querySelector('option[value=""]');
  if (ph) ph.textContent = 'Códigos/Leis';
  appEls.selCodigo.removeAttribute('disabled');
  appEls.selCodigo.removeAttribute('aria-busy');
}

async function autoDiscoverCodes(){
  const candidates = [
    { id:'Constituicao_Federal_88', label:'Constituição Federal 88',                  txt:['data/Constituicao_Federal_88.txt','data/constituicao_federal_88.txt'] },
    { id:'codigo_Penal',            label:'Código Penal',                              txt:['data/codigo_penal.txt','data/codigo_Penal.txt'] },
    { id:'codigo_Civil',            label:'Código Civil',                              txt:['data/codigo_civil.txt','data/codigo_Civil.txt'] },
    { id:'codigo_Processo_Penal',   label:'Código de Processo Penal',                  txt:['data/codigo_processo_penal.txt','data/codigo_Processo_Penal.txt','data/codigo_cpp.txt'] },
    { id:'codigo_Processo_Civil',   label:'Código de Processo Civil',                  txt:['data/codigo_processo_civil.txt','data/codigo_Processo_Civil.txt'] },
    { id:'codigo_Consumidor',       label:'CDC — Código de Defesa do Consumidor',      txt:['data/codigo_consumidor.txt','data/codigo_Consumidor.txt'] }
    // adicione novos códigos aqui no mesmo formato
  ];

  state.codePaths = {};
  const found = [];

  ensureSelectPlaceholder();

  // dispara verificações em paralelo e já vai inserindo as opções
  const tasks = candidates.map(async (c) => {
    let chosen = null;
    for (const p of (c.txt || [])){
      if (await fileExists(p)) { chosen = p; break; }
    }
    if (chosen){
      state.codePaths[c.id] = chosen;
      found.push({ id:c.id, label:c.label });
      addCodeOption({ id:c.id, label:c.label }); // feedback imediato
    }
  });

  await Promise.allSettled(tasks);
  finalizeSelectPlaceholder();
  return found;
}

// compat antigo
function renderCodeSelect(codes){
  const el = appEls.selCodigo;
  const last = localStorage.getItem('dl_last_code');
  const opts = (codes||[]).map(c=>`<option value="${c.id}" ${last===c.id?'selected':''}>${escapeHTML(c.label)}</option>`).join('');
  el.innerHTML = `<option value="" ${last?'':'selected'} disabled>Códigos/Leis</option>${opts}`;
}

/* =================== Cache de sessão do parse =================== */
function cacheKey(codeId){ return 'dl_cache_v1_' + codeId; }
function tryLoadFromCache(codeId){
  try{ const s = sessionStorage.getItem(cacheKey(codeId)); return s ? JSON.parse(s) : null; }catch{ return null; }
}
function saveToCache(codeId, data){
  try{ sessionStorage.setItem(cacheKey(codeId), JSON.stringify(data)); }catch{}
}

/* =================== Load de código TXT =================== */
async function tryLoadCodeTxt(codeId){
  const path = state.codePaths && state.codePaths[codeId];
  if (!path) throw new Error('Arquivo .txt do código não encontrado.');
  const raw = await getText(path);
  return parseTxtToArtigos(raw);
}

async function ensureCodeLoaded(codeId){
  if (state.codigo===codeId && state.artigosData) return;
  state.codigo = codeId;

  const cached = tryLoadFromCache(codeId);
  if (cached){
    state.artigosData = cached;
  }else{
    state.artigosData = await tryLoadCodeTxt(codeId);
    saveToCache(codeId, state.artigosData);
  }

  state.artigosIndex = Object.values(state.artigosData);
  state.artigosIndex.forEach(n=>{
    n._nt = norm(n.titulo||'');           // ex.: "art 121 a"
    n._ns = n._nt.replace(/[\s\-]+/g,''); // ex.: "art121a"
  });
}

/* ====== Vídeos (opcional) ====== */
async function loadVideosCatalog(codeKey){
  if (state.catalogs.videos[codeKey]!==undefined) return state.catalogs.videos[codeKey];
  const tries=[`videos/${codeKey}_videos.json`,`videos/${codeKey}.json`,`videos/${codeKey}_video.json`];
  for (const p of tries){ try{ const d=await getJSON(p); state.catalogs.videos[codeKey]=d; return d; }catch{} }
  state.catalogs.videos[codeKey]=null; return null;
}

/* ====== Busca ====== */
function nodeHasAllWholeWords(node, entrada){
  const toks = words(entrada).filter(w => w.length>=2 && !/^\d+$/.test(w));
  if (!toks.length) return false;
  const textoWords = new Set(words((node.full || node.texto || '')));
  return toks.every(t => textoWords.has(t));
}
function nodeContainsAny(node, entrada){
  const toks = words(entrada).filter(w => w.length>=3);
  if (!toks.length) return false;
  const texto = norm((node.full||node.texto||'')) + ' ' + norm(node.titulo||'');
  return toks.some(t => texto.includes(t));
}
async function searchArticles(codeId, entrada){
  await ensureCodeLoaded(codeId);
  const nodes = state.artigosIndex.slice();
  const raw = entrada.trim();

  // procura direta por número/título
  const numMatch = raw.match(/^\s*(?:art\.?\s*)?(\d{1,4})([a-z])?\s*$/i);
  if (numMatch){
    const base = numMatch[1];
    const suf  = (numMatch[2]||'').toLowerCase();
    const target = `art${base}${suf}`;
    const byNs = nodes.find(n => (n._ns||'') === target);
    if (byNs) return [byNs];

    const contains = nodes.find(n => (n._ns||'').startsWith(`art${base}`));
    if (contains) return [contains];
  }

  // busca textual
  if (state.searchMode==='precise' || /^[A-Za-zÀ-ÿ\s]+$/.test(raw)){
    const precise = nodes.filter(n => nodeHasAllWholeWords(n, raw));
    if (precise.length) return precise;
  }
  const flex = nodes.filter(n => nodeContainsAny(n, raw));
  return flex;
}

/* ====== Resultados ====== */
function highlight(text, query){
  const toks = words(query).filter(w=>w.length>=3);
  if (!toks.length) return escapeHTML(text);
  let html = escapeHTML(text);
  toks.forEach(t=>{ const re = new RegExp(`(${t})`,'gi'); html = html.replace(re, '<mark>$1</mark>'); });
  return html;
}
function buildSnippet(node, query, len=240){
  const txt = node.full || node.texto || '';
  if (!query) return escapeHTML(txt.slice(0,len)) + (txt.length>len?'…':'');
  const toks = words(query).filter(w=>w.length>=3);
  if (!toks.length) return escapeHTML(txt.slice(0,len)) + (txt.length>len?'…':'');
  const lower = norm(txt);
  let pos = -1;
  for (const t of toks){ const i = lower.indexOf(t); if (i>=0){ pos=i; break; } }
  if (pos<0) return escapeHTML(txt.slice(0,len)) + (txt.length>len?'…':'');
  const start = Math.max(0, pos-40);
  const end = Math.min(txt.length, pos+len-40);
  const seg = txt.slice(start,end);
  return (start>0?'…':'') + highlight(seg, query) + (end<txt.length?'…':'');
}

function renderResultChips(hits){
  appEls.resultChips.innerHTML='';
  hits.forEach(node=>{
    const btn=document.createElement('button');
    btn.className='chip';
    btn.type='button';
    btn.innerHTML = escapeHTML(node.titulo);
    btn.addEventListener('click',e=>{ e.preventDefault(); openArticleModalByNode(node, /*fromSearch*/true); });
    appEls.resultChips.appendChild(btn);
  });
}

/* Skeleton de resultados */
function showResultSkeleton(rows = 6){
  appEls.resultList.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'result-skeleton';
  for (let i=0;i<rows;i++){
    const row = document.createElement('div');
    row.className = 'skel-row';
    wrap.appendChild(row);
  }
  appEls.resultList.appendChild(wrap);
}

/* Renderização incremental */
function renderResultListChunked(hits, query, chunkSize = 30){
  const list = document.createElement('div');
  list.className='list';
  appEls.resultList.innerHTML=''; // limpa skeleton
  appEls.resultList.appendChild(list);

  let i = 0, total = hits.length;

  function tick(){
    const frag = document.createDocumentFragment();
    const end = Math.min(i + chunkSize, total);
    for (; i<end; i++){
      const node = hits[i];
      const row = document.createElement('div'); row.className='list-item';
      const title = document.createElement('div'); title.className='li-title'; title.textContent = node.titulo;
      const body  = document.createElement('div'); body.className='li-text'; body.innerHTML = buildSnippet(node, query);
      const actions = document.createElement('div'); actions.className='li-actions';
      const bt = document.createElement('button'); bt.className='btn btn-outline btn-small'; bt.type='button'; bt.textContent='Abrir';
      bt.addEventListener('click',()=> openArticleModalByNode(node, /*fromSearch*/true));
      actions.appendChild(bt);
      row.appendChild(title); row.appendChild(actions); row.appendChild(body);
      frag.appendChild(row);
    }
    list.appendChild(frag);
    if (i < total){
      appEls.resultMsg.textContent = `Carregando resultados… ${i}/${total}`;
      requestAnimationFrame(tick);
    } else {
      appEls.resultMsg.textContent = `${total} artigo(s) encontrado(s). Clique para abrir.`;
    }
  }
  requestAnimationFrame(tick);
}

function renderResultList(hits, query){
  renderResultListChunked(hits, query, 30);
}

function switchView(view){
  state.viewMode=view;
  appEls.vtButtons.forEach(b=>{
    const active = b.dataset.view===view;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', active?'true':'false');
  });
  appEls.resultChips.hidden = (view!=='chips');
  appEls.resultList.hidden  = (view==='chips');
}

/* ====== Modal Artigo ====== */
const renderArticleHTML = node =>
  `<div class="article">
     <div class="art-title">${escapeHTML(node.titulo)}</div>
     <pre class="art-caput" style="white-space:pre-wrap;">${escapeHTML(node.full || node.texto || '')}</pre>
   </div>`;

/* Metas de leitura */
function computeReadingStats(text){
  const words = (text.match(/\S+/g) || []).length;
  const minutes = Math.max(1, Math.round(words / 230));
  return { words, minutes };
}
function renderArticleMeta(node){
  const el = appEls.amMeta || document.getElementById('amMeta');
  if (!el) return;
  const t = (node.full || node.texto || '');
  const { words, minutes } = computeReadingStats(t);
  el.innerHTML = `
    <span class="badge"><span class="dot"></span>≈ ${minutes} min de leitura</span>
    <span class="badge"><span class="dot"></span>${words} palavras</span>
  `;
  el.hidden = false;
}

async function loadVideosCatalog(codeKey){
  if (state.catalogs.videos[codeKey]!==undefined) return state.catalogs.videos[codeKey];
  const tries=[`videos/${codeKey}_videos.json`,`videos/${codeKey}.json`,`videos/${codeKey}_video.json`];
  for (const p of tries){ try{ const d=await getJSON(p); state.catalogs.videos[codeKey]=d; return d; }catch{} }
  state.catalogs.videos[codeKey]=null; return null;
}

async function buildExtrasForArticle(node){
  const codeKey = codeKeyFromId(state.codigo);
  const artKey  = articleKeyFromTitulo(node.titulo);
  appEls.amExtras.innerHTML=''; appEls.amExtras.hidden=true;
  if (!codeKey || !artKey) return;

  // Botão: Modo leitura (toggle)
  if (!appEls.btnReadMode){
    const bRead = document.createElement('button');
    bRead.className='btn btn-outline'; bRead.type='button';
    bRead.textContent = state.readingMode ? 'Sair do modo leitura' : 'Modo leitura';
    bRead.addEventListener('click', toggleReadingMode);
    appEls.btnReadMode = bRead;
  }
  appEls.amExtras.appendChild(appEls.btnReadMode);

  // Botão: Modo foco (toggle)
  if (!appEls.btnFocusMode){
    const bFocus = document.createElement('button');
    bFocus.className='btn btn-outline'; bFocus.type='button';
    bFocus.textContent = state.focusMode ? 'Sair do modo foco' : 'Modo foco';
    bFocus.addEventListener('click', toggleFocusMode);
    appEls.btnFocusMode = bFocus;
  }
  appEls.amExtras.appendChild(appEls.btnFocusMode);

  // Botão: Copiar link
  const bLink = document.createElement('button');
  bLink.className='btn btn-outline'; bLink.type='button';
  bLink.innerHTML = `${svgIcon('link')} Copiar link`;
  bLink.addEventListener('click', copyArticleLink);
  appEls.amExtras.appendChild(bLink);

  // Botão: Copiar citação
  const bQuote = document.createElement('button');
  bQuote.className='btn btn-outline'; bQuote.type='button';
  bQuote.innerHTML = `${svgIcon('book')} Copiar citação`;
  bQuote.addEventListener('click', copyArticleQuote);
  appEls.amExtras.appendChild(bQuote);

  const vidCat = await loadVideosCatalog(codeKey);
  if (vidCat && vidCat[artKey] && Array.isArray(vidCat[artKey].videos) && vidCat[artKey].videos.length){
    const b=document.createElement('button');
    b.className='btn btn-outline'; b.type='button';
    b.innerHTML = `${svgIcon('play')} Vídeo aula`;
    b.onclick = ()=> renderVideosModal(vidCat[artKey]);
    appEls.amExtras.appendChild(b);
  }
  if (appEls.btnFav){
    const fav = isFavorite(node);
    appEls.btnFav.innerHTML = fav ? `${svgIcon('star')} Favorito` : `${svgIcon('star-outline')} Favoritar`;
  }
  appEls.amExtras.hidden = appEls.amExtras.children.length===0;
}

function getScopeArray(){ return state.artigosIndex || []; }

function openArticleModalByIndexVia(scopeArr, idx){
  if (idx<0 || idx>=scopeArr.length) return;
  const node = scopeArr[idx];
  state.navArray = scopeArr;
  state.navIndex = idx;
  state.artigoAtualIdx = state.artigosIndex.findIndex(n=>n.titulo===node.titulo);

  appEls.amTitle.textContent = node.titulo;
  appEls.amBody.innerHTML = renderArticleHTML(node);
  renderArticleMeta(node);
  appEls.amExtras.hidden = true;
  buildExtrasForArticle(node);

  appEls.btnPrev.disabled = (idx<=0);
  appEls.btnNext.disabled = (idx>=scopeArr.length-1);

  renderCopyButton();
  showDialog(appEls.modalArtigo);
  appEls.amBody.focus({preventScroll:true});

  try { history.replaceState(null, '', buildArticleHash(state.codigo, node.id, node.titulo)); } catch {}
}
function openArticleModalByIndex(idx){ return openArticleModalByIndexVia(getScopeArray(), idx); }
function openArticleModalByNode(node){
  if (!node) return;
  state.navScope = 'all';
  const scopeArr = state.artigosIndex || [];
  let idx = scopeArr.findIndex(n => n.titulo === node.titulo || n.id===node.id);
  if (idx < 0) idx = 0;
  openArticleModalByIndexVia(scopeArr, idx);
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
  const i = favs.indexOf(node.titulo);
  if (i>=0) favs.splice(i,1); else favs.unshift(node.titulo);
  favs = favs.slice(0,200);
  localStorage.setItem(favStoreKey(), JSON.stringify(favs));
  appEls.btnFav.innerHTML = isFavorite(node) ? `${svgIcon('star')} Favorito` : `${svgIcon('star-outline')} Favoritar`;
  showToast(isFavorite(node) ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
}
function openFavoritesModal(){ if (!appEls.modalFavs) return; renderFavList(); showDialog(appEls.modalFavs); }
function renderFavList(){
  const scope = appEls.favScope?.value || 'current';
  const container = appEls.favList;
  container.classList.remove('skeleton');
  container.innerHTML='';

  const codes = scope==='all'
    ? Array.from({length:localStorage.length}).map((_,i)=>localStorage.key(i)).filter(k=>k&&k.startsWith('dl_favs_')).map(k=>k.replace('dl_favs_',''))
    : [state.codigo];

  const entries = [];
  codes.forEach(codeId=>{ const favs = getFavsRaw(codeId); favs.forEach(titulo=> entries.push({ codeId, titulo })); });

  if (!entries.length){ container.innerHTML = '<div class="empty">⭐ Nenhum favorito ainda. Abra um artigo e clique em “Favoritar”.</div>'; return; }

  entries.sort((a,b)=> (a.codeId||'').localeCompare(b.codeId||'') || (a.titulo||'').localeCompare(b.titulo||''));

  const wrap = document.createElement('div'); wrap.className='card-list';
  entries.forEach(entry=>{
    const card = document.createElement('div'); card.className='card';
    const title = document.createElement('div'); title.className='title'; title.textContent = entry.titulo;
    const meta  = document.createElement('div'); meta.className='meta'; meta.textContent = (entry.codeId||'').replace(/^codigo_/,'Código ').replace(/_/g,' ');
    const actions = document.createElement('div'); actions.className='actions';

    const btnOpen = document.createElement('button');
    btnOpen.className='btn btn-primary'; btnOpen.type='button';
    btnOpen.innerHTML = `${svgIcon('open')}Abrir`;
    btnOpen.addEventListener('click', async ()=>{
      if (state.codigo!==entry.codeId){ await ensureCodeLoaded(entry.codeId); appEls.selCodigo.value = entry.codeId; localStorage.setItem('dl_last_code', entry.codeId); }
      const node = state.artigosIndex.find(n=>n.titulo===entry.titulo);
      state.lastHits = node?[node]:[]; state.navScope='results';
      openArticleModalByNode(node||{}, true);
    });

    const btnDel  = document.createElement('button');
    btnDel.className='btn btn-outline btn-small'; btnDel.type='button';
    btnDel.innerHTML = `${svgIcon('trash')}Remover`;
    btnDel.addEventListener('click', ()=>{
      const arr = getFavsRaw(entry.codeId);
      const idx = arr.indexOf(entry.titulo);
      if (idx>=0){ arr.splice(idx,1); localStorage.setItem(favStoreKeyFor(entry.codeId), JSON.stringify(arr)); renderFavList(); }
    });

    actions.appendChild(btnOpen); actions.appendChild(btnDel);
    card.appendChild(title); card.appendChild(meta); card.appendChild(actions);
    wrap.appendChild(card);
  });
  container.appendChild(wrap);
}

/* ====== Prompt ====== */
function renderCopyButton(){
  appEls.amPromptWrap.innerHTML =
    `<button id="btnEstudarRapido" class="btn btn-primary" type="button">${svgIcon('book')} Estudar Rápido</button>`;
  document.getElementById('btnEstudarRapido')?.addEventListener('click', onEstudarRapido);
}
function buildSinglePrompt(node){
  const bloco = node.full || node.texto || '';
  return `Assuma a persona de um professor de Direito experiente convidado pelo direito.love e gere um material de estudo rápido. Analise detalhadamente todo o artigo abaixo (caput, paragrafos, incisos e alineas), cobrindo: (1) conceito com visão doutrinária, jurisprudência majoritária e prática; (2) mini exemplo prático; (3) checklist essencial; (4) erros comuns e pegadinhas de prova; (5) Pontos de atenção na prática jurídica; (6) Princípios Relacionados ao tema; (7) nota comparativa se houver artigos correlatos. Responda em português claro, sem enrolação, objetivo e didático.\n\n${bloco}\n\n💚 direito.love — Gere um novo prompt em https://direito.love`;
}
function onEstudarRapido(){ const node = getScopeArray()[state.navIndex]; if (!node) return; state.prompt = buildSinglePrompt(node); showDialog(appEls.modalIA); }
// compat
async function onCopiarPrompt(){ onEstudarRapido(); }

/* ====== Open IA apps ====== */
function isAndroid(){ return /Android/i.test(navigator.userAgent || navigator.vendor || ''); }
function isiOS(){ return /iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.vendor || ''); }
function openAIAppOrWeb(app){
  const urls = { gpt: 'https://chatgpt.com/', gemini: 'https://gemini.google.com/app', copilot: 'https://copilot.microsoft.com/', pplx: 'https://www.perplexity.ai/' };
  if (app === 'gemini'){
    if (isAndroid()){
      const fallback = encodeURIComponent(urls.gemini);
      const intentUrl = 'intent://gemini.google.com/app#Intent;scheme=https;package=com.google.android.apps.bard;' + `S.browser_fallback_url=${fallback};end`;
      window.location.href = intentUrl; return;
    }
    if (isiOS()){ window.location.href = urls.gemini; return; }
    window.open(urls.gemini, '_blank'); return;
  }
  const url = urls[app] || urls.gpt;
  if (isAndroid() || isiOS()) { window.location.href = url; }
  else { window.open(url, '_blank'); }
}
async function copyThenOpen(app){
  const p = state.prompt || '';
  try{ await navigator.clipboard.writeText(p); showToast('Prompt copiado!'); }
  catch{ showToast('Copie manualmente (Ctrl/Cmd+C)'); }
  closeDialog(appEls.modalIA);
  openAIAppOrWeb(app);
}

/* ====== Vídeos ====== */
function renderVideosModal(data){
  appEls.vdTitle.textContent=data.titulo||'Vídeo aula';
  appEls.vdLista.innerHTML='';
  (data.videos||[]).forEach(v=>{
    const li=document.createElement('li');
    const a=document.createElement('a');
    a.href=v.url; a.target='_blank'; a.rel='noopener';
    a.textContent=v.title||v.url;
    li.appendChild(a);
    appEls.vdLista.appendChild(li);
  });
  showDialog(appEls.modalVideos);
}

/* ====== Notícias & Vocabulário & Princípios ====== */
async function ensureNewsLoaded(){
  if (state.news.data.length) return;
  try{ const data = await getJSON('content/news.json'); state.news.data = Array.isArray(data) ? data : (data.items || []); }
  catch{ state.news.data = []; }
  finally{ appEls.newsList.classList.remove('skeleton'); }
}
function renderNewsList(){
  const q = norm(appEls.newsSearch.value||'');
  const items = state.news.data.slice().sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
  const filtered = q ? items.filter(it=> norm(`${it.title||''} ${it.source||''} ${it.tags||''}`).includes(q) ) : items;
  if (!filtered.length){ appEls.newsList.innerHTML = '<div class="empty">📰 Nada por aqui. Ajuste a busca ou tente mais tarde.</div>'; return; }
  const list = document.createElement('div'); list.className = 'card-list';
  filtered.forEach(it=>{
    const card = document.createElement('div'); card.className='card';
    const title = document.createElement('div'); title.className='title'; title.textContent = it.title || 'Sem título';
    const meta  = document.createElement('div'); meta.className='meta';
    const src = it.source || 'Fonte desconhecida';
    const dt  = it.date ? ` — ${it.date}` : '';
    meta.innerHTML = `<span class="badge"><span class="dot"></span>${escapeHTML(src)}</span>${dt}`;
    const actions = document.createElement('div'); actions.className='actions';
    const a = document.createElement('a'); a.href = it.url || '#'; a.target='_blank'; a.rel='noopener'; a.className='btn btn-outline';
    a.innerHTML = `${svgIcon('link')}Ler notícia`;
    actions.appendChild(a);
    card.appendChild(title); card.appendChild(meta);
    if (it.summary){ const text = document.createElement('div'); text.className='text'; text.textContent = it.summary; card.appendChild(text); }
    card.appendChild(actions); list.appendChild(card);
  });
  appEls.newsList.innerHTML=''; appEls.newsList.appendChild(list);
}

async function ensureVocabLoaded(){
  if (state.vocab.data.length) return;
  try{
    const data = await getJSON('content/vocabulario.json');
    state.vocab.data = Array.isArray(data) ? data : (data.items || []);
    state.vocab.data = state.vocab.data.map(x=>({ titulo: x.titulo||'', texto: x.texto||'', temas: Array.isArray(x.temas)?x.temas.slice(0,3):[] }));
  }catch{
    state.vocab.data = [];
  }finally{
    appEls.vocabList.classList.remove('skeleton');
  }
}
function renderVocabList(){
  const q = norm(appEls.vocabSearch.value||'');
  const items = state.vocab.data.slice().sort((a,b)=>String(a.titulo||'').localeCompare(String(b.titulo||'')));
  const filtered = q ? items.filter(it=> norm(`${it.titulo} ${it.texto}`).includes(q) ) : items;
  if (!filtered.length){ appEls.vocabList.innerHTML = '<div class="empty">📘 Nenhum termo encontrado.</div>'; return; }
  const wrap = document.createElement('div'); wrap.className='card-list';
  filtered.forEach((it, idx)=>{
    const card = document.createElement('div'); card.className='card';
    const title = document.createElement('div'); title.className='title'; title.textContent = it.titulo;
    const body  = document.createElement('div'); body.className='text'; body.textContent = it.texto;
    const temas = document.createElement('div'); temas.className='actions';
    it.temas.forEach((t,i)=>{
      const id = `v_${idx}_${i}`;
      const label = document.createElement('label');
      label.className='seg small';
      label.innerHTML = `<input type="checkbox" id="${id}" data-titulo="${escapeHTML(it.titulo)}" data-tema="${escapeHTML(t)}"> <span>${escapeHTML(t)}</span>`;
      temas.appendChild(label);
    });
    card.appendChild(title);
    if (it.temas?.length){ card.appendChild(temas); }
    card.appendChild(body);
    wrap.appendChild(card);
  });
  appEls.vocabList.innerHTML=''; 
  appEls.vocabList.appendChild(wrap);
  appEls.vocabList.querySelectorAll('input[type="checkbox"]').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const titulo = chk.dataset.titulo, tema = chk.dataset.tema;
      if (chk.checked){ state.vocab.selected.push({titulo, tema}); }
      else{
        const i = state.vocab.selected.findIndex(x=> x.titulo===titulo && x.tema===tema );
        if (i>=0) state.vocab.selected.splice(i,1);
      }
      appEls.btnVocabCopy.disabled = state.vocab.selected.length===0;
    });
  });
}

async function ensurePrincLoaded(){
  if (state.princ.data.length) return;
  try{
    const data = await getJSON('content/principios.json');
    const arr = Array.isArray(data) ? data : (data.items || []);
    state.princ.data = arr.map(x=>({ titulo: x.titulo||'', texto: x.texto||'' }));
  }catch{
    state.princ.data = [];
  }finally{
    appEls.princList.classList.remove('skeleton');
  }
}
function renderPrincList(){
  const q = norm(appEls.princSearch.value||'');
  const items = state.princ.data.slice().sort((a,b)=>String(a.titulo||'').localeCompare(String(b.titulo||'')));
  const filtered = q ? items.filter(it=> norm(`${it.titulo} ${it.texto}`).includes(q) ) : items;
  if (!filtered.length){ appEls.princList.innerHTML = '<div class="empty">⚖️ Nenhum princípio listado.</div>'; return; }
  const wrap = document.createElement('div'); wrap.className='card-list';
  filtered.forEach((it)=>{
    const card = document.createElement('div'); card.className='card';
    const title = document.createElement('div'); title.className='title'; title.textContent = it.titulo;
    const body  = document.createElement('div'); body.className='text'; body.textContent = it.texto;
    const actions = document.createElement('div'); actions.className='actions';
    const bt = document.createElement('button'); bt.className='btn btn-outline btn-small'; bt.type='button'; bt.textContent='Selecionar';
    bt.addEventListener('click', ()=>{
      const i = state.princ.selected.findIndex(x=> x.titulo===it.titulo);
      if (i>=0){ state.princ.selected.splice(i,1); bt.textContent='Selecionar'; }
      else { state.princ.selected.push(it); bt.textContent='Selecionado ✔'; }
      appEls.btnPrincCopy.disabled = state.princ.selected.length===0;
    });
    actions.appendChild(bt);
    card.appendChild(title); card.appendChild(body); card.appendChild(actions);
    wrap.appendChild(card);
  });
  appEls.princList.innerHTML=''; 
  appEls.princList.appendChild(wrap);
}

/* ====== Autocomplete ====== */
function acClose(){ state.ac.open=false; state.ac.activeIndex=-1; appEls.acPanel.hidden=true; appEls.acPanel.innerHTML=''; }
function acOpen(items){ state.ac.open=true; state.ac.activeIndex=-1; appEls.acPanel.hidden=false; renderAc(items); }
function acSetActive(idx){ const max = state.ac.items.length; if (max===0) return; if (idx<0) idx = max-1; if (idx>=max) idx = 0; state.ac.activeIndex = idx; Array.from(appEls.acPanel.querySelectorAll('.ac-item')).forEach((el,i)=> el.classList.toggle('is-active', i===idx)); }
function renderAc(items){
  state.ac.items = items;
  const q = appEls.inpArtigo.value.trim();
  appEls.acPanel.innerHTML = items.length ? items.map(it=>{
    const title = it.titulo; const codeLabel = (appEls.selCodigo.value||'').replace(/^codigo_/,'Código ').replace(/_/g,' ');
    return `<div class="ac-item" role="option" data-titulo="${escapeHTML(title)}">
      <div class="ac-title">${highlight(title, q)}</div>
      <div class="ac-action">Abrir</div>
      <div class="ac-meta">${escapeHTML(codeLabel)}</div>
    </div>`; }).join('') : `<div class="ac-empty">Sem sugestões.</div>`;

  Array.from(appEls.acPanel.querySelectorAll('.ac-item')).forEach((el,i)=>{
    el.addEventListener('mouseenter', ()=> acSetActive(i));
    el.addEventListener('mousedown', e=> e.preventDefault());
    el.addEventListener('click', async ()=>{
      const titulo = el.dataset.titulo; if (!titulo) return;
      const node = state.artigosIndex.find(n=>n.titulo===titulo); if (!node) return;
      state.lastHits = [node]; state.navScope='results';
      openArticleModalByNode(node, true); acClose();
    });
  });
}
function acCompute(q){
  const codeId = appEls.selCodigo.value; if (!codeId || !state.artigosIndex.length) return [];
  const nq = norm(q); if (!nq) return [];
  const m = nq.match(/^(\d{1,4})([a-z])?$/i);
  const byNum = m ? state.artigosIndex.filter(n=> (n._ns||'').startsWith(`art${m[1]}${(m[2]||'').toLowerCase()}`)).slice(0,10) : [];
  const others = state.artigosIndex.filter(n=> (n._nt||'').includes(nq)).slice(0,10);
  const map = new Map(); [...byNum, ...others].forEach(n=>{ if(!map.has(n.titulo)) map.set(n.titulo,n); });
  return Array.from(map.values()).slice(0,10);
}

/* ===== Deep-link e citações ===== */
function slugify(s){
  return String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function buildArticleHash(codeId, artId, title){
  const core = encodeURIComponent(codeId) + ':' + encodeURIComponent(artId);
  const slug = slugify(title||'');
  return '#a=' + core + (slug ? ('~' + slug) : '');
}
function buildArticleURL(codeId, artId, title){
  const u = new URL(window.location.href);
  u.hash = buildArticleHash(codeId, artId, title);
  return u.toString();
}
async function openFromHash(){
  const m = String(location.hash||'').match(/^#a=([^:~]+):([^~]+)(?:~.*)?$/);
  if (!m) return;
  const codeId = decodeURIComponent(m[1]);
  const artId  = decodeURIComponent(m[2]);
  if (!state.codePaths[codeId]) { await autoDiscoverCodes(); }
  await ensureCodeLoaded(codeId);
  if (appEls.selCodigo) appEls.selCodigo.value = codeId;
  const node = (state.artigosIndex||[]).find(n => n.id===artId) 
            || (state.artigosIndex||[]).find(n => n.titulo===artId);
  if (node) openArticleModalByNode(node);
}
function getSelectionTextWithin(root){
  const sel = window.getSelection?.(); if (!sel || !sel.rangeCount) return '';
  const rng = sel.getRangeAt(0);
  return root.contains(rng.commonAncestorContainer) ? sel.toString().trim() : '';
}
function copyArticleLink(){
  const codeId = state.codigo;
  const node = (state.artigosIndex||[])[state.artigoAtualIdx] || (state.navArray||[])[state.navIndex];
  if (!codeId || !node){ showToast('Abra um artigo primeiro'); return; }
  const url = buildArticleURL(codeId, node.id, node.titulo);
  navigator.clipboard.writeText(url)
    .then(()=> showToast('Link do artigo copiado'))
    .catch(()=> showToast('Não foi possível copiar'));
}
function copyArticleQuote(){
  const scope = getScopeArray();
  const node = scope[state.navIndex];
  if (!node){ showToast('Abra um artigo primeiro'); return; }
  const selected = getSelectionTextWithin(appEls.amBody);
  const text = selected || (node.full || node.texto || '');
  const codeLabel = (appEls.selCodigo?.selectedOptions?.[0]?.textContent || '')
    || (state.codigo||'').replace(/^codigo_/,'Código ').replace(/_/g,' ');
  const url = buildArticleURL(state.codigo, node.id, node.titulo);
  const payload = `“${text}”\n\n${node.titulo} — ${codeLabel}\n${url}`;
  navigator.clipboard.writeText(payload)
    .then(()=> showToast('Citação copiada'))
    .catch(()=> showToast('Não foi possível copiar'));
}

/* ====== Navegação, eventos e acessibilidade ====== */
function resetAll(){
  state.prompt=''; state.lastHits=[];
  appEls.resultChips.innerHTML=''; appEls.resultList.innerHTML='';
  appEls.resultMsg.textContent=''; appEls.inpArtigo.value=''; acClose();
}
async function onBuscar(e){
  if (e){ e.preventDefault(); }
  const codeId = appEls.selCodigo.value;
  const entrada = appEls.inpArtigo.value.trim();
  if (!codeId){ appEls.resultMsg.textContent='Selecione um código antes.'; return; }
  if (!entrada){ appEls.resultMsg.textContent='Digite um número de artigo ou palavras inteiras.'; return; }

  appEls.btnBuscar.classList.add('is-loading'); 
  appEls.btnBuscar.disabled = true;
  appEls.resultChips.innerHTML='';
  showResultSkeleton(6);
  appEls.resultMsg.textContent='Buscando…';

  try{
    await ensureCodeLoaded(codeId);
    const hits = await searchArticles(codeId, entrada);
    state.lastHits = hits; state.navIndex = hits.length ? 0 : -1; state.navScope='results';
    if (!hits.length){
      appEls.resultList.innerHTML='';
      appEls.resultMsg.textContent='Nada encontrado. Tente um número (ex.: 121-A) ou palavras-chave inteiras.';
      return;
    }
    renderResultChips(hits);
    renderResultList(hits, entrada);
  }catch(err){
    console.error(err);
    appEls.resultList.innerHTML='';
    appEls.resultMsg.textContent='Erro ao carregar os dados. Verifique sua conexão e tente novamente.';
  }finally{
    appEls.btnBuscar.classList.remove('is-loading');
    appEls.btnBuscar.disabled = false;
  }
}

function openSidebar(){ appEls.sidebar.classList.add('open'); appEls.sideBackdrop.hidden=false; appEls.sidebar.setAttribute('aria-hidden','false'); }
function closeSidebar(){ appEls.sidebar.classList.remove('open'); appEls.sideBackdrop.hidden=true; appEls.sidebar.setAttribute('aria-hidden','true'); }
function openModalById(id){ const d=document.getElementById(id); if (d) showDialog(d); }

async function onSideNavClick(a){
  const target = a.dataset.target; const isHome = !!a.dataset.home; closeSidebar(); if (isHome){ window.scrollTo({top:0,behavior:'smooth'}); return; }
  if (!target) return;
  if (target==='modalCursos'){ try{ const html = await getHTML('content/cursos.html'); appEls.cursosBody.innerHTML = html; } catch{ appEls.cursosBody.textContent = 'Não foi possível carregar o conteúdo (content/cursos.html).'; } }
  if (target==='modalNoticias'){ await ensureNewsLoaded(); renderNewsList(); }
  if (target==='modalVocab'){ await ensureVocabLoaded(); renderVocabList(); }
  if (target==='modalPrincipios'){ await ensurePrincLoaded(); renderPrincList(); }
  if (target==='modalFavs'){ renderFavList(); }
  openModalById(target);
}

function bindSidebar(){
  if (appEls.btnSidebar) appEls.btnSidebar.addEventListener('click', e=>{ e.preventDefault(); openSidebar(); });
  if (appEls.btnSideClose) appEls.btnSideClose.addEventListener('click', e=>{ e.preventDefault(); closeSidebar(); });
  if (appEls.sideBackdrop) appEls.sideBackdrop.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeSidebar(); });
  document.querySelectorAll('.side-link').forEach(a=>{ a.addEventListener('click', (e)=>{ e.preventDefault(); onSideNavClick(a); }); });
}

/* ====== Dialog polyfill + Focus trap ====== */
function supportsDialog(){ return typeof HTMLDialogElement !== 'undefined' && typeof document.createElement('dialog').showModal === 'function'; }
let __lastFocusedEl = null;
function getFocusable(root){
  return Array.from(root.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
}
function trapFocusIn(dlg){
  const focusables = getFocusable(dlg);
  if (!focusables.length) return ()=>{};
  const first = focusables[0], last = focusables[focusables.length - 1];
  function onKey(e){
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
  dlg.addEventListener('keydown', onKey);
  return ()=> dlg.removeEventListener('keydown', onKey);
}
function showDialog(dlg){
  if (dlg === appEls.modalArtigo){
    dlg.setAttribute('aria-labelledby','amTitle');
    dlg.setAttribute('aria-describedby','amBody');
  }
  const focusFirst = (root)=>{
    let el = root.querySelector('[autofocus]');
    if (!el){ el = root.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'); }
    if (!el && appEls.amBody) el = appEls.amBody;
    try{ el && el.focus({preventScroll:true}); }catch{}
  };

  __lastFocusedEl = document.activeElement;

  if (supportsDialog()){
    if (!dlg.open){
      dlg.showModal();
      dlg._trapCleanup && dlg._trapCleanup();
      dlg._trapCleanup = trapFocusIn(dlg);
      setTimeout(()=> focusFirst(dlg), 0);
    }
    return;
  }
  dlg.classList.add('fallback-open');
  let bd = document.querySelector('.modal.fallback-backdrop');
  if (!bd){ bd = document.createElement('div'); bd.className='modal fallback-backdrop'; document.body.appendChild(bd); }
  bd.addEventListener('click', ()=> closeDialog(dlg), { once:true });
  document.body.style.overflow='hidden';
  dlg._trapCleanup && dlg._trapCleanup();
  dlg._trapCleanup = trapFocusIn(dlg);
  setTimeout(()=> focusFirst(dlg), 0);
}
function closeDialog(dlg){
  if (supportsDialog()){
    if (dlg.open) dlg.close();
  } else {
    dlg.classList.remove('fallback-open');
    const bd = document.querySelector('.modal.fallback-backdrop'); if (bd) bd.remove();
    document.body.style.overflow='';
  }
  if (dlg._trapCleanup) { try{ dlg._trapCleanup(); }catch{} dlg._trapCleanup = null; }
  try{ __lastFocusedEl && __lastFocusedEl.focus && __lastFocusedEl.focus({preventScroll:true}); }catch{}
}

/* ====== Swipe ====== */
function bindSwipe(){
  const el = appEls.amBody; if (!el) return;
  let down=false, x0=0, y0=0, moved=false;
  el.addEventListener('pointerdown',e=>{ down=true; moved=false; x0=e.clientX; y0=e.clientY; el.style.userSelect='none'; },{passive:true});
  el.addEventListener('pointermove',e=>{ if(!down) return; const dx=e.clientX-x0, dy=e.clientY-y0; if(Math.abs(dx)>20 && Math.abs(dx)>Math.abs(dy)) moved=true; },{passive:true});
  el.addEventListener('pointerup',e=>{
    if(!down) return; el.style.userSelect=''; const dx=e.clientX-x0, dy=e.clientY-y0; down=false;
    if(!moved || Math.abs(dx)<30 || Math.abs(dx)<=Math.abs(dy)) return;
    const arr=getScopeArray(); if (!arr.length || state.navIndex < 0) return;
    if (dx<0 && state.navIndex < arr.length-1) openArticleModalByIndexVia(arr, state.navIndex+1);
    else if (dx>0 && state.navIndex > 0) openArticleModalByIndexVia(arr, state.navIndex-1);
  },{passive:true});
  el.addEventListener('pointercancel',()=>{ down=false; moved=false; el.style.userSelect=''; },{passive:true});
}

/* ====== Focus/Leitura ====== */
function toggleReadingMode(){
  state.readingMode = !state.readingMode;
  const dlg = appEls.modalArtigo;
  dlg.classList.toggle('reading-mode', state.readingMode);
  if (appEls.btnReadMode){
    appEls.btnReadMode.textContent = state.readingMode ? 'Sair do modo leitura' : 'Modo leitura';
  }
}
function toggleFocusMode(){
  state.focusMode = !state.focusMode;
  const dlg = appEls.modalArtigo;
  dlg.classList.toggle('focus-mode', state.focusMode);
  document.body.classList.toggle('page-focus', state.focusMode);
  if (appEls.btnFocusMode){
    appEls.btnFocusMode.textContent = state.focusMode ? 'Sair do modo foco' : 'Modo foco';
  }
}

/* ====== Bind geral / Init ====== */
function bind(){
  ['btnPrev','btnNext','btnFechar','btnBuscar','btnSidebar','btnSideClose','btnVdFechar','btnReset','btnClear','btnScope','btnFav']
    .forEach(k=>appEls[k] && appEls[k].setAttribute('type','button'));

  if (appEls.btnScope) { appEls.btnScope.style.display = 'none'; appEls.btnScope.disabled = true; }

  appEls.btnBuscar.addEventListener('click', onBuscar);
  appEls.inpArtigo.addEventListener('keydown', e=>{
    if(e.key==='Enter'){
      if (state.ac.open && state.ac.activeIndex>=0){ const el = appEls.acPanel.querySelectorAll('.ac-item')[state.ac.activeIndex]; el?.click(); return; }
      e.preventDefault(); onBuscar();
    }
    if (state.ac.open && (e.key==='ArrowDown' || e.key==='ArrowUp')){ e.preventDefault(); const delta = e.key==='ArrowDown'?1:-1; acSetActive(state.ac.activeIndex + delta); }
    if (e.key==='Escape'){ acClose(); }
  });
  appEls.inpArtigo.addEventListener('input', ()=>{
    const q = appEls.inpArtigo.value;
    if (q.trim().length<1){ acClose(); return; }
    const items = acCompute(q);
    if (items.length){ acOpen(items); } else { acClose(); }
  });
  document.addEventListener('click', (e)=>{ if (!appEls.acPanel.contains(e.target) && e.target!==appEls.inpArtigo){ acClose(); } });

  if (appEls.btnClear) appEls.btnClear.addEventListener('click', resetAll);
  appEls.modeRadios.forEach(r=> r.addEventListener('change', ()=>{ state.searchMode = r.value; }));
  appEls.vtButtons.forEach(b=> b.addEventListener('click', ()=> switchView(b.dataset.view)));

  appEls.btnFechar.addEventListener('click', ()=>{ closeDialog(appEls.modalArtigo); });
  appEls.btnPrev.addEventListener('click', ()=>{ const arr=getScopeArray(); if(state.navIndex>0) openArticleModalByIndexVia(arr, state.navIndex-1); });
  appEls.btnNext.addEventListener('click', ()=>{ const arr=getScopeArray(); if(state.navIndex<arr.length-1) openArticleModalByIndexVia(arr, state.navIndex+1); });
  appEls.btnFav && appEls.btnFav.addEventListener('click', toggleFavorite);

  appEls.btnVdFechar && appEls.btnVdFechar.addEventListener('click', ()=> closeDialog(appEls.modalVideos));

  bindSidebar();
  bindSwipe();

  appEls.btnReset && appEls.btnReset.addEventListener('click', resetAll);

  appEls.modalArtigo.addEventListener('keydown', e=>{
    if (e.key==='ArrowLeft'){ e.preventDefault(); appEls.btnPrev.click(); }
    if (e.key==='ArrowRight'){ e.preventDefault(); appEls.btnNext.click(); }
    if (e.key==='Escape'){ e.preventDefault(); appEls.btnFechar.click(); }
  });

  appEls.selCodigo.addEventListener('change', async ()=>{
    const v = appEls.selCodigo.value;
    if (v){
      localStorage.setItem('dl_last_code', v);
      await ensureCodeLoaded(v);
    }
  });

  document.querySelectorAll('.side-link[data-target="modalFavs"]').forEach(a=>{
    a.addEventListener('click', (e)=>{ e.preventDefault(); openFavoritesModal(); });
  });
  appEls.favScope && appEls.favScope.addEventListener('change', renderFavList);

  if (appEls.resultMsg) {
    appEls.resultMsg.setAttribute('role','status');
    appEls.resultMsg.setAttribute('aria-live','polite');
  }

  // Atalhos globais
  document.addEventListener('keydown', (e)=>{
    const tag = (e.target?.tagName || '').toLowerCase();
    const typing = tag==='input' || tag==='textarea' || tag==='select' || (e.target?.isContentEditable);
    const k = e.key;
    if (k === '/' && !typing){ e.preventDefault(); appEls.inpArtigo?.focus(); return; }
    if (k === 'g' && !typing){ e.preventDefault(); const q = appEls.inpArtigo?.value?.trim(); if (q) onBuscar(); else appEls.inpArtigo?.focus(); return; }
    if (k === 'l' && !typing){ e.preventDefault(); const nextView = state.viewMode === 'chips' ? 'list' : 'chips'; switchView(nextView); return; }
    if (k === 'r' && !typing){ e.preventDefault(); toggleReadingMode(); return; }
    if (k === 'f' && !typing){ e.preventDefault(); if (appEls.modalArtigo?.open) toggleFocusMode(); return; }
  });
}

async function initCodes(){
  try{
    ensureSelectPlaceholder();
    await autoDiscoverCodes();
    finalizeSelectPlaceholder();

    const last = localStorage.getItem('dl_last_code');
    if (last){
      appEls.selCodigo.value = last;
      await ensureCodeLoaded(last);
    }

    await openFromHash();
    window.addEventListener('hashchange', openFromHash);
  }catch(e){
    console.warn('Falha ao descobrir códigos', e);
    const ph = appEls.selCodigo.querySelector('option[value=""]');
    if (ph) ph.textContent = 'Não foi possível carregar';
    appEls.selCodigo.removeAttribute('aria-busy');
    appEls.selCodigo.removeAttribute('disabled');
  }
}

function start(){ bind(); initCodes(); switchView('chips'); }
document.addEventListener('DOMContentLoaded', start);
