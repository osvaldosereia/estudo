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
  artigosIndex: [],
  artigosData: null,
  prompt: '',
  lastHits: [],
  viewMode: 'chips', // 'chips' | 'list'
  searchMode: 'precise', // 'precise' | 'flex'
  navScope: 'results', // 'results' | 'all'
  navArray: [],
  navIndex: -1,
  catalogs: { videos: {} },
  vocab: { data: [], selected: [] },
  princ: { data: [], selected: [] },
  news: { data: [] },
  ac: { open:false, items:[], activeIndex:-1 }
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

  // reset (topbar)
  btnReset: document.getElementById('btnReset')
};

/* ====== Utils ====== */
const escapeHTML = s => (s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const words = s => { const n=norm(s); return n?n.split(' ').filter(Boolean):[]; };
const onlyDigits = s => { const m=String(s||'').match(/\d{1,4}/); return m?m[0]:null; };
const codeKeyFromId = id => String(id||'').replace(/^codigo_/,'').trim();
function articleKeyFromTitulo(t){
  const m=(t||'').toLowerCase().match(/art\.?\s*(\d{1,4})(?:[\s\-]*([a-z]))?/i);
  return m?`art${m[1]}${m[2]||''}`:null;
}
function showToast(msg){ if(!appEls.toast) return; appEls.toast.textContent=msg; appEls.toast.classList.add('show'); setTimeout(()=>appEls.toast.classList.remove('show'), 1600); }

async function getJSON(path){
  const url = path + (path.includes('?')?'&':'?') + 'v=' + Date.now();
  const r = await fetch(url, { cache:'no-store' });
  if (!r.ok) throw new Error(`Erro ${r.status} ao carregar ${path}`);
  return r.json();
}
async function getHTML(path){
  const url = path + (path.includes('?')?'&':'?') + 'v=' + Date.now();
  const r = await fetch(url, { cache:'no-store' });
  if (!r.ok) throw new Error(`Erro ${r.status} ao carregar ${path}`);
  return r.text();
}
async function fileExists(path){
  const url = path + (path.includes('?')?'&':'?') + 'v=' + Date.now();
  try{ const r=await fetch(url,{method:'HEAD',cache:'no-store'}); return r.ok; }catch{ return false; }
}

/* ====== Códigos ====== */
async function tryLoadCodeData(codeId){
  const paths=[`data/${codeId}_vademecum.json`,`data/${codeId}.json`];
  for (const p of paths){ try{ return await getJSON(p);}catch{} }
  throw new Error('Arquivo JSON não encontrado.');
}
async function ensureCodeLoaded(codeId){
  if (state.codigo===codeId && state.artigosData) return;
  state.codigo = codeId;
  state.artigosData = await tryLoadCodeData(codeId);
  state.artigosIndex = Object.values(state.artigosData);
  // pré-computa títulos normalizados para autocomplete
  state.artigosIndex.forEach(n=>{ n._nt = norm(n.titulo||''); });
}
async function autoDiscoverCodes(){
  const candidates=['codigo_civil','codigo_penal','codigo_cpc','codigo_cpp','codigo_ctn','codigo_consumidor'];
  const found=[];
  for (const id of candidates){
    const has = await fileExists(`data/${id}_vademecum.json`) || await fileExists(`data/${id}.json`);
    if (has) found.push({ id, label: id.replace(/^codigo_/,'Código ').replace(/_/g,' ') });
  }
  if (!found.length && await fileExists('data/codigo_civil.json')) return [{id:'codigo_civil',label:'Código Civil'}];
  return found;
}
function renderCodeSelect(codes){
  const el = appEls.selCodigo;
  const last = localStorage.getItem('dl_last_code');
  const opts = (codes||[]).map(c=>`<option value="${c.id}" ${last===c.id?'selected':''}>${escapeHTML(c.label)}</option>`).join('');
  el.innerHTML = `<option value="" ${last?'':'selected'} disabled>Selecione…</option>${opts}`;
}

/* ====== Catálogo de Vídeos ====== */
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
  const textoWords = new Set(words(node.texto || ''));
  return toks.every(t => textoWords.has(t));
}
function nodeContainsAny(node, entrada){
  const toks = words(entrada).filter(w => w.length>=3);
  if (!toks.length) return false;
  const texto = norm(node.texto||'') + ' ' + norm(node.titulo||'');
  return toks.some(t => texto.includes(t));
}
async function searchArticles(codeId, entrada){
  await ensureCodeLoaded(codeId);
  const nodes = state.artigosIndex.slice();
  const raw = entrada.trim();

  // tentativa direta por número/título
  const soNumero = /^\d{1,4}([A-Za-z])?$/.test(raw);
  const misto = /\d/.test(raw) && /[A-Za-z]/.test(raw);
  const soLetras = /^[A-Za-zÀ-ÿ\s]+$/.test(raw);

  if (soNumero || misto){
    const num = onlyDigits(raw);
    if (num){
      const hitNum = nodes.find(n => norm(n.titulo||'').includes(`art${num}`));
      if (hitNum) return [hitNum];
    }
    const en = norm(raw).replace(/\s+/g,'');
    const hitT = nodes.find(n => {
      const t = norm(n.titulo||'').replace(/\s+/g,'');
      return en===t || en===t.replace(/^art/,'');
    });
    if (hitT) return [hitT];
  }

  // busca textual
  if (state.searchMode==='precise' || soLetras){
    const precise = nodes.filter(n => nodeHasAllWholeWords(n, raw));
    if (precise.length) return precise;
  }
  // flexível (contain/OR)
  const flex = nodes.filter(n => nodeContainsAny(n, raw));
  return flex;
}

/* ====== Resultados ====== */
function highlight(text, query){
  const toks = words(query).filter(w=>w.length>=3);
  if (!toks.length) return escapeHTML(text);
  let html = escapeHTML(text);
  toks.forEach(t=>{
    const re = new RegExp(`(${t})`,'gi');
    html = html.replace(re, '<mark>$1</mark>');
  });
  return html;
}
function buildSnippet(node, query, len=220){
  const txt = node.texto || '';
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
function renderResultList(hits, query){
  const list = document.createElement('div');
  list.className='list';
  hits.forEach(node=>{
    const row = document.createElement('div'); row.className='list-item';
    const title = document.createElement('div'); title.className='li-title'; title.textContent = node.titulo;
    const body  = document.createElement('div'); body.className='li-text'; body.innerHTML = buildSnippet(node, query);
    const actions = document.createElement('div'); actions.className='li-actions';
    const bt = document.createElement('button'); bt.className='btn btn-outline btn-small'; bt.type='button'; bt.textContent='Abrir';
    bt.addEventListener('click',()=> openArticleModalByNode(node, /*fromSearch*/true));
    actions.appendChild(bt);
    row.appendChild(title); row.appendChild(actions); row.appendChild(body);
    list.appendChild(row);
  });
  appEls.resultList.innerHTML=''; appEls.resultList.appendChild(list);
}

function switchView(view){
  state.viewMode=view;
  appEls.vtButtons.forEach(b=>{
    const active = b.dataset.view===view;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', active?'true':'false');
  });
  if (view==='chips'){
    appEls.resultChips.hidden=false;
    appEls.resultList.hidden=true;
  }else{
    appEls.resultChips.hidden=true;
    appEls.resultList.hidden=false;
  }
}

/* ====== Modal Artigo ====== */
const renderArticleHTML = node => `<div class="article"><div class="art-title">${escapeHTML(node.titulo)}</div><pre class="art-caput" style="white-space:pre-wrap;">${escapeHTML(node.texto)}</pre></div>`;

async function buildExtrasForArticle(node){
  const codeKey = codeKeyFromId(state.codigo);
  const artKey  = articleKeyFromTitulo(node.titulo);
  appEls.amExtras.innerHTML=''; appEls.amExtras.hidden=true;
  if (!codeKey || !artKey) return;

  const vidCat = await loadVideosCatalog(codeKey);
  if (vidCat && vidCat[artKey] && Array.isArray(vidCat[artKey].videos) && vidCat[artKey].videos.length){
    const b=document.createElement('button');
    b.className='btn btn-outline'; b.type='button'; b.textContent='Vídeo aula';
    b.onclick = ()=> renderVideosModal(vidCat[artKey]);
    appEls.amExtras.appendChild(b);
  }
  const favBtn = appEls.btnFav;
  if (favBtn){
    const fav = isFavorite(node);
    favBtn.textContent = fav ? '★ Favorito' : '☆ Favoritar';
  }
  appEls.amExtras.hidden = appEls.amExtras.children.length===0;
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
  appEls.amExtras.hidden = true;
  buildExtrasForArticle(node);

  appEls.btnPrev.disabled = (idx<=0);
  appEls.btnNext.disabled = (idx>=scopeArr.length-1);

  renderCopyButton();

  showDialog(appEls.modalArtigo);
  appEls.amBody.focus({preventScroll:true});
}
function openArticleModalByIndex(idx){
  return openArticleModalByIndexVia(getScopeArray(), idx);
}
function openArticleModalByNode(node, fromSearch=false){
  if (!node) return;
  if (fromSearch && state.lastHits.length){ 
    state.navScope = 'results'; 
  }
  const scopeArr = getScopeArray();
  const idx = scopeArr.findIndex(n=>n.titulo===node.titulo);
  if (idx >= 0) {
    openArticleModalByIndexVia(scopeArr, idx);
  } else {
    // fallback: abre na posição 0 para evitar navIndex -1
    openArticleModalByIndexVia(scopeArr, 0);
  }
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
  appEls.btnFav.textContent = isFavorite(node) ? '★ Favorito' : '☆ Favoritar';
  showToast(isFavorite(node) ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
}
function openFavoritesModal(){
  if (!appEls.modalFavs) return;
  renderFavList();
  showDialog(appEls.modalFavs);
}
function renderFavList(){
  const scope = appEls.favScope?.value || 'current';
  const container = appEls.favList;
  container.classList.remove('skeleton');
  container.innerHTML='';

  const ul = document.createElement('div'); ul.className='list';

  const codes = scope==='all'
    ? Array.from({length:localStorage.length}).map((_,i)=>localStorage.key(i)).filter(k=>k&&k.startsWith('dl_favs_')).map(k=>k.replace('dl_favs_',''))
    : [state.codigo];

  const entries = [];
  codes.forEach(codeId=>{
    const favs = getFavsRaw(codeId);
    favs.forEach(titulo=> entries.push({ codeId, titulo }));
  });

  if (!entries.length){
    container.innerHTML = '<div class="empty pad">Sem favoritos.</div>';
    return;
  }

  // ordenar por código e título
  entries.sort((a,b)=> (a.codeId||'').localeCompare(b.codeId||'') || (a.titulo||'').localeCompare(b.titulo||''));

  entries.forEach(entry=>{
    const row = document.createElement('div'); row.className='list-item';
    const title = document.createElement('div'); title.className='li-title'; title.textContent = entry.titulo;
    const meta  = document.createElement('div'); meta.className='li-meta'; meta.textContent = (entry.codeId||'').replace(/^codigo_/,'Código ').replace(/_/g,' ');
    const actions = document.createElement('div'); actions.className='li-actions';
    const btnOpen = document.createElement('button'); btnOpen.className='btn btn-outline btn-small'; btnOpen.type='button'; btnOpen.textContent='Abrir';
    const btnDel  = document.createElement('button'); btnDel.className='btn btn-outline btn-small'; btnDel.type='button'; btnDel.textContent='Remover';
    btnOpen.addEventListener('click', async ()=>{
      if (state.codigo!==entry.codeId){ await ensureCodeLoaded(entry.codeId); appEls.selCodigo.value = entry.codeId; localStorage.setItem('dl_last_code', entry.codeId); }
      const node = state.artigosIndex.find(n=>n.titulo===entry.titulo);
      state.lastHits = node?[node]:[]; state.navScope='results';
      openArticleModalByNode(node||{}, true);
    });
    btnDel.addEventListener('click', ()=>{
      const arr = getFavsRaw(entry.codeId);
      const idx = arr.indexOf(entry.titulo);
      if (idx>=0){ arr.splice(idx,1); localStorage.setItem(favStoreKeyFor(entry.codeId), JSON.stringify(arr)); renderFavList(); }
    });
    actions.appendChild(btnOpen); actions.appendChild(btnDel);
    row.appendChild(title); row.appendChild(actions); row.appendChild(meta);
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
  const presets = appEls.presetWrap 
    ? Array.from(appEls.presetWrap.querySelectorAll('input[type="checkbox"]:checked')).map(i=>i.value) 
    : [];
  const extras = []; // <<< faltava isso

  if (presets.includes('resumo')) extras.push('(a) um resumo doutrinário claro e direto');
  if (presets.includes('checklist')) extras.push('(b) um checklist prático de estudo e revisão');
  if (presets.includes('juris')) extras.push('(c) referências de jurisprudência majoritária (STJ/STF) em linguagem simples');

  const extraTxt = extras.length ? ` Além disso, inclua ${extras.join(', ')}.` : '';
  return `Assuma a persona de um professor de Direito experiente (direito.love) e gere um material de estudo rápido, direto e completo sobre o artigo abaixo, cobrindo: (1) conceito com visão doutrinária, jurisprudência majoritária e prática; (2) mini exemplo prático; (3) checklist essencial; (4) erros comuns e pegadinhas de prova; (5) nota comparativa se houver artigos correlatos.${extraTxt} Responda em português claro, sem enrolação, objetivo e didático.\n\n${bloco}\n\n💚 direito.love — Gere um novo prompt em https://direito.love`;
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
      <button class="btn btn-outline btn-ia" data-app="copilot" type="button">COPILOT</button>
    </div>
  `;
  appEls.amPromptWrap.querySelectorAll('.btn-ia').forEach(b=>{
    b.addEventListener('click', ()=> openAIAppOrWeb(b.dataset.app));
  });
}
// Detecta plataforma de forma simples
function isAndroid(){ return /Android/i.test(navigator.userAgent || navigator.vendor || ''); }
function isiOS(){ return /iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.vendor || ''); }

function openAIAppOrWeb(app){
  // URLs padrão (web)
  const urls = {
    gpt: 'https://chatgpt.com/',
    gemini: 'https://gemini.google.com/app',
    copilot: 'https://copilot.microsoft.com/'
  };

  if (app === 'gemini'){
    // ANDROID: tenta Intent (abre app se instalado; senão, cai no browser_fallback_url)
    if (isAndroid()){
      const fallback = encodeURIComponent(urls.gemini);
      const intentUrl =
        'intent://gemini.google.com/app#Intent;scheme=https;package=com.google.android.apps.bard;'
        + `S.browser_fallback_url=${fallback};end`;
      // usar mesma aba evita bloqueio de pop-up em mobile
      window.location.href = intentUrl;
      return;
    }
    // iOS: universal link abre o app se instalado; se não, web
    if (isiOS()){
      window.location.href = urls.gemini; // mesma aba, menos bloqueios
      return;
    }
    // Desktop: manter em nova aba
    window.open(urls.gemini, '_blank');
    return;
  }

  // Demais apps continuam como estavam
  const url = urls[app] || urls.gpt;
  // Em mobile, abrir na mesma aba reduz bloqueios
  if (isAndroid() || isiOS()) { window.location.href = url; }
  else { window.open(url, '_blank'); }
}


/* ====== Vídeos ====== */
function renderVideosModal(data){
  appEls.vdTitle.textContent=data.titulo||'Vídeo aula'; appEls.vdLista.innerHTML='';
  (data.videos||[]).forEach(v=>{ const li=document.createElement('li'); const a=document.createElement('a'); a.href=v.url; a.target='_blank'; a.rel='noopener'; a.textContent=v.title||v.url; li.appendChild(a); appEls.vdLista.appendChild(li); });
  showDialog(appEls.modalVideos);
}

/* ====== Cursos (HTML externo) ====== */
let cursosLoaded=false;
async function loadCursosHTML(){
  if (cursosLoaded) return;
  try{
    const html = await getHTML('content/cursos.html');
    appEls.cursosBody.innerHTML = html;
  }catch{
    appEls.cursosBody.textContent = 'Não foi possível carregar o conteúdo (content/cursos.html).';
  }finally{
    cursosLoaded=true;
  }
}

/* ====== Notícias & Artigos (JSON) ====== */
async function ensureNewsLoaded(){
  if (state.news.data.length) return;
  try{
    const data = await getJSON('content/news.json');
    state.news.data = Array.isArray(data) ? data : (data.items || []);
  }catch{
    state.news.data = [];
  }finally{
    appEls.newsList.classList.remove('skeleton');
  }
}
function renderNewsList(){
  const q = norm(appEls.newsSearch.value||'');
  const list = document.createElement('div');
  list.className='list';
  const items = state.news.data.slice().sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
  const filtered = q ? items.filter(it=> norm(`${it.title||''} ${it.source||''} ${it.tags||''}`).includes(q) ) : items;
  if (!filtered.length){
    appEls.newsList.innerHTML = '<div class="empty">Sem itens.</div>'; return;
  }
  filtered.forEach(it=>{
    const row = document.createElement('div');
    row.className='list-item';
    const title = document.createElement('div');
    title.className = 'li-title';
    title.textContent = it.title || 'Sem título';
    const meta = document.createElement('div');
    meta.className = 'li-meta';
    meta.textContent = (it.type ? `[${it.type}] ` : '') + (it.source||'') + (it.date?` — ${it.date}`:'');
    const actions = document.createElement('div');
    actions.className = 'li-actions';
    const a = document.createElement('a');
    a.href = it.url || '#'; a.target='_blank'; a.rel='noopener'; a.className='btn btn-outline btn-small'; a.textContent='Ler';
    actions.appendChild(a);
    row.appendChild(title); row.appendChild(actions); row.appendChild(meta);
    list.appendChild(row);
  });
  appEls.newsList.innerHTML=''; appEls.newsList.appendChild(list);
}
if (appEls.newsSearch) appEls.newsSearch.addEventListener('input', renderNewsList);

/* ====== Vocabulário Jurídico (JSON) ====== */
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
  const wrap = document.createElement('div'); wrap.className='list';
  if (!filtered.length){
    appEls.vocabList.innerHTML = '<div class="empty">Sem termos.</div>'; return;
  }
  filtered.forEach((it, idx)=>{
    const row = document.createElement('div'); row.className='list-item';
    const title = document.createElement('div'); title.className='li-title'; title.textContent = it.titulo;
    const body  = document.createElement('div'); body.className='li-text'; body.textContent = it.texto;
    const temas = document.createElement('div'); temas.className='li-actions';
    it.temas.forEach((t,i)=>{
      const id = `v_${idx}_${i}`;
      const label = document.createElement('label');
      label.className='seg small';
      label.innerHTML = `<input type="checkbox" id="${id}" data-titulo="${escapeHTML(it.titulo)}" data-tema="${escapeHTML(t)}"> <span>${escapeHTML(t)}</span>`;
      temas.appendChild(label);
    });
    row.appendChild(title); row.appendChild(temas); row.appendChild(body);
    wrap.appendChild(row);
  });
  appEls.vocabList.innerHTML=''; appEls.vocabList.appendChild(wrap);
  appEls.vocabList.querySelectorAll('input[type="checkbox"]').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const titulo = chk.dataset.titulo, tema = chk.dataset.tema;
      if (chk.checked){
        state.vocab.selected.push({titulo, tema});
      }else{
        const i = state.vocab.selected.findIndex(x=> x.titulo===titulo && x.tema===tema );
        if (i>=0) state.vocab.selected.splice(i,1);
      }
      appEls.btnVocabCopy.disabled = state.vocab.selected.length===0;
    });
  });
}
function buildVocabPrompt(sel){
  const blocos = sel.map(x=>`• Tema: ${x.tema} (termo-base: ${x.titulo})`).join('\n');
  return `Gere um material didático rápido e profundo para revisar os temas abaixo, com foco em doutrina, jurisprudência majoritária e prática forense; inclua exemplos, checklist e pegadinhas de prova. Seja objetivo e claro.\n\n${blocos}\n\n💚 direito.love — Gere um novo prompt em https://direito.love`;
}
function renderVocabAIButtons(){
  appEls.vocabPromptWrap.innerHTML = `
    <div class="ai-buttons">
      <button class="btn btn-outline btn-ia" data-app="gpt" type="button">GPT</button>
      <button class="btn btn-outline btn-ia" data-app="gemini" type="button">GEMINI</button>
      <button class="btn btn-outline btn-ia" data-app="copilot" type="button">COPILOT</button>
    </div>`;
  appEls.vocabPromptWrap.querySelectorAll('.btn-ia').forEach(b=> b.addEventListener('click', ()=> openAIAppOrWeb(b.dataset.app)));
}
if (appEls.btnVocabCopy){
  appEls.btnVocabCopy.addEventListener('click', async ()=>{
    const prompt = buildVocabPrompt(state.vocab.selected);
    state.prompt = prompt;
    try{ await navigator.clipboard.writeText(prompt); showToast('Prompt copiado!'); }catch{}
    renderVocabAIButtons();
  });
}

/* ====== Princípios do Direito (JSON) ====== */
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
  const wrap = document.createElement('div'); wrap.className='list';
  if (!filtered.length){
    appEls.princList.innerHTML = '<div class="empty">Sem princípios.</div>'; return;
  }
  filtered.forEach((it, idx)=>{
    const row = document.createElement('div'); row.className='list-item';
    const title = document.createElement('div'); title.className='li-title'; title.textContent = it.titulo;
    const body  = document.createElement('div'); body.className='li-text'; body.textContent = it.texto;
    const actions = document.createElement('div'); actions.className='li-actions';
    const bt = document.createElement('button'); bt.className='btn btn-outline btn-small'; bt.type='button'; bt.textContent='Selecionar';
    bt.addEventListener('click', ()=>{
      const i = state.princ.selected.findIndex(x=> x.titulo===it.titulo);
      if (i>=0){ state.princ.selected.splice(i,1); bt.textContent='Selecionar'; }
      else { state.princ.selected.push(it); bt.textContent='Selecionado ✔'; }
      appEls.btnPrincCopy.disabled = state.princ.selected.length===0;
    });
    actions.appendChild(bt);
    row.appendChild(title); row.appendChild(actions); row.appendChild(body);
    wrap.appendChild(row);
  });
  appEls.princList.innerHTML=''; appEls.princList.appendChild(wrap);
}
if (appEls.princSearch) appEls.princSearch.addEventListener('input', renderPrincList);

function buildPrincPrompt(sel){
  const blocos = sel.map(x=>`### ${x.titulo}\n${x.texto}`).join('\n\n');
  return `Com base nos princípios abaixo, produza um resumo didático, com: definição, base legal comum, aplicações práticas forenses, jurisprudência majoritária ilustrativa e pegadinhas de prova. Termine com 5 questões objetivas (sem gabarito visível).\n\n${blocos}\n\n💚 direito.love — Gere um novo prompt em https://direito.love`;
}
function renderPrincAIButtons(){
  appEls.princPromptWrap.innerHTML = `
    <div class="ai-buttons">
      <button class="btn btn-outline btn-ia" data-app="gpt" type="button">GPT</button>
      <button class="btn btn-outline btn-ia" data-app="gemini" type="button">GEMINI</button>
      <button class="btn btn-outline btn-ia" data-app="copilot" type="button">COPILOT</button>
    </div>`;
  appEls.princPromptWrap.querySelectorAll('.btn-ia').forEach(b=> b.addEventListener('click', ()=> openAIAppOrWeb(b.dataset.app)));
}
if (appEls.btnPrincCopy){
  appEls.btnPrincCopy.addEventListener('click', async ()=>{
    const prompt = buildPrincPrompt(state.princ.selected);
    state.prompt = prompt;
    try{ await navigator.clipboard.writeText(prompt); showToast('Prompt copiado!'); }catch{}
    renderPrincAIButtons();
  });
}

/* ====== Autocomplete ====== */
function acClose(){ state.ac.open=false; state.ac.activeIndex=-1; appEls.acPanel.hidden=true; appEls.acPanel.innerHTML=''; }
function acOpen(items){ state.ac.open=true; state.ac.activeIndex=-1; appEls.acPanel.hidden=false; renderAc(items); }
function acSetActive(idx){
  const max = state.ac.items.length;
  if (max===0) return;
  if (idx<0) idx = max-1; if (idx>=max) idx = 0;
  state.ac.activeIndex = idx;
  Array.from(appEls.acPanel.querySelectorAll('.ac-item')).forEach((el,i)=> el.classList.toggle('is-active', i===idx));
}
function renderAc(items){
  state.ac.items = items;
  const q = appEls.inpArtigo.value.trim();
  appEls.acPanel.innerHTML = items.length ? items.map(it=>{
    const title = it.titulo;
    const codeLabel = (appEls.selCodigo.value||'').replace(/^codigo_/,'Código ').replace(/_/g,' ');
    return `<div class="ac-item" role="option" data-titulo="${escapeHTML(title)}">
      <div class="ac-title">${highlight(title, q)}</div>
      <div class="ac-action">Abrir</div>
      <div class="ac-meta">${escapeHTML(codeLabel)}</div>
    </div>`;
  }).join('') : `<div class="ac-empty">Sem sugestões.</div>`;

  Array.from(appEls.acPanel.querySelectorAll('.ac-item')).forEach((el,i)=>{
    el.addEventListener('mouseenter', ()=> acSetActive(i));
    el.addEventListener('mousedown', e=> e.preventDefault());
    el.addEventListener('click', async ()=>{
      const titulo = el.dataset.titulo;
      if (!titulo) return;
      const node = state.artigosIndex.find(n=>n.titulo===titulo);
      if (!node) return;
      state.lastHits = [node]; state.navScope='results';
      openArticleModalByNode(node, true);
      acClose();
    });
  });
}
function acCompute(q){
  const codeId = appEls.selCodigo.value;
  if (!codeId || !state.artigosIndex.length) return [];
  const nq = norm(q);
  if (!nq) return [];
  // se digitou padrão tipo "121" ou "121a", priorize match por número
  const m = nq.match(/^(\d{1,4})([a-z])?$/i);
  const byNum = m ? state.artigosIndex.filter(n=> n._nt.includes(`art${m[1]}${m[2]||''}`)).slice(0,10) : [];
  const others = state.artigosIndex.filter(n=> n._nt.includes(nq)).slice(0,10);
  // mescla removendo duplicados mantendo ordem
  const map = new Map();
  [...byNum, ...others].forEach(n=>{ if(!map.has(n.titulo)) map.set(n.titulo,n); });
  return Array.from(map.values()).slice(0,10);
}

/* ====== Navegação, eventos e acessibilidade ====== */
function resetAll(){
  state.prompt='';
  state.lastHits=[];
  appEls.resultChips.innerHTML=''; appEls.resultList.innerHTML='';
  appEls.resultMsg.textContent='';
  appEls.inpArtigo.value='';
  acClose();
}
async function onBuscar(e){
  if (e){ e.preventDefault(); }
  const codeId = appEls.selCodigo.value;
  const entrada = appEls.inpArtigo.value.trim();
  if (!codeId){ appEls.resultMsg.textContent='Selecione um código antes.'; return; }
  if (!entrada){ appEls.resultMsg.textContent='Digite um número de artigo ou palavras inteiras.'; return; }

  appEls.resultChips.innerHTML=''; appEls.resultList.innerHTML=''; appEls.resultMsg.textContent='Buscando...';
  try{
    await ensureCodeLoaded(codeId);
    const hits = await searchArticles(codeId, entrada);
    state.lastHits = hits;
    state.navIndex = hits.length ? 0 : -1;
    state.navScope='results';
    if (!hits.length){ appEls.resultMsg.textContent='Nada encontrado.'; return; }
    renderResultChips(hits);
    renderResultList(hits, entrada);
    const extra = hits.length>200 ? ` (mostrando 200/${hits.length})` : '';
    appEls.resultMsg.textContent = `${hits.length} artigo(s) encontrado(s)${extra}. Clique para abrir.`;
  }catch(err){
    console.error(err); appEls.resultMsg.textContent='Erro ao carregar os dados.';
  }
}

function bind(){
  ['btnPrev','btnNext','btnFechar','btnBuscar','btnSidebar','btnSideClose','btnVdFechar','btnReset','btnClear','btnScope','btnFav']
    .forEach(k=>appEls[k] && appEls[k].setAttribute('type','button'));
// [ajuste] esconder e desativar o botão 'Navegar: Resultados/Código'
if (appEls.btnScope) { 
  appEls.btnScope.style.display = 'none'; 
  appEls.btnScope.disabled = true; 
}

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
    if (items.length){ acOpen(items); } else { acClose(); }
  });
  document.addEventListener('click', (e)=>{
    if (!appEls.acPanel.contains(e.target) && e.target!==appEls.inpArtigo){ acClose(); }
  });

  if (appEls.btnClear) appEls.btnClear.addEventListener('click', resetAll);
  appEls.modeRadios.forEach(r=> r.addEventListener('change', ()=>{ state.searchMode = r.value; }));

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
  bindSwipe();

  // reset topbar
  appEls.btnReset && appEls.btnReset.addEventListener('click', resetAll);

  // teclado no modal
  appEls.modalArtigo.addEventListener('keydown', e=>{
    if (e.key==='ArrowLeft'){ e.preventDefault(); appEls.btnPrev.click(); }
    if (e.key==='ArrowRight'){ e.preventDefault(); appEls.btnNext.click(); }
    if (e.key==='Escape'){ e.preventDefault(); appEls.btnFechar.click(); }
  });

  // lembrar último código
  appEls.selCodigo.addEventListener('change', async ()=>{
    const v = appEls.selCodigo.value;
    if (v){ localStorage.setItem('dl_last_code', v); await ensureCodeLoaded(v); }
  });

  // favoritos (modal)
  document.querySelectorAll('.side-link[data-target="modalFavs"]').forEach(a=>{
    a.addEventListener('click', (e)=>{ e.preventDefault(); openFavoritesModal(); });
  });
  appEls.favScope && appEls.favScope.addEventListener('change', renderFavList);
}

/* ====== Sidebar & modais ====== */
function openSidebar(){ appEls.sidebar.classList.add('open'); appEls.sideBackdrop.hidden=false; appEls.sidebar.setAttribute('aria-hidden','false'); }
function closeSidebar(){ appEls.sidebar.classList.remove('open'); appEls.sideBackdrop.hidden=true; appEls.sidebar.setAttribute('aria-hidden','true'); }
function openModalById(id){ const d=document.getElementById(id); if (d) showDialog(d); }

async function onSideNavClick(a){
  const target = a.dataset.target;
  const isHome = !!a.dataset.home;
  closeSidebar();
  if (isHome){ window.scrollTo({top:0,behavior:'smooth'}); return; }
  if (!target) return;
  if (target==='modalCursos'){ await loadCursosHTML(); }
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

  document.querySelectorAll('.side-link').forEach(a=>{
    a.addEventListener('click', (e)=>{ e.preventDefault(); onSideNavClick(a); });
  });
}

/* ====== Dialog polyfill básico ====== */
function supportsDialog(){ return typeof HTMLDialogElement !== 'undefined' && typeof document.createElement('dialog').showModal === 'function'; }
function showDialog(dlg){
  if (supportsDialog()){ if (!dlg.open) dlg.showModal(); return; }
  dlg.classList.add('fallback-open');
  let bd = document.querySelector('.modal.fallback-backdrop');
  if (!bd){ bd = document.createElement('div'); bd.className='modal fallback-backdrop'; document.body.appendChild(bd); }
  bd.addEventListener('click', ()=> closeDialog(dlg), { once:true });
  document.body.style.overflow='hidden';
}
function closeDialog(dlg){
  if (supportsDialog()){ if (dlg.open) dlg.close(); return; }
  dlg.classList.remove('fallback-open');
  const bd = document.querySelector('.modal.fallback-backdrop');
  if (bd) bd.remove();
  document.body.style.overflow='';
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
const arr=getScopeArray();
if (!arr.length || state.navIndex < 0) return;
if (dx<0 && state.navIndex < arr.length-1) openArticleModalByIndexVia(arr, state.navIndex+1);
else if (dx>0 && state.navIndex > 0) openArticleModalByIndexVia(arr, state.navIndex-1);
  },{passive:true});
  el.addEventListener('pointercancel',()=>{ down=false; moved=false; el.style.userSelect=''; },{passive:true});
}

/* ====== Init ====== */
async function initCodes(){
  try{
    const codes = await autoDiscoverCodes();
    renderCodeSelect(codes);
    const last = localStorage.getItem('dl_last_code');
    if (last){ await ensureCodeLoaded(last); }
  }catch(e){
    console.warn('Falha ao descobrir códigos', e);
  }
}
function start(){
  bind();
  initCodes();
  switchView('chips');
}
document.addEventListener('DOMContentLoaded', start);
