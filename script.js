/* Nova arquitetura (sem Quiz):
   - Setas do modal no topo
   - Rodapé com (Fechar) + (Copiar Prompt -> IA buttons)
   - Sidebar com novos modais (cursos/news/vocab/princípios)
   - Removidos: seleção em lista + área de prompt da home + Quiz
*/

const state = {
  codigo: null,
  termoBusca: '',
  artigoAtualIdx: -1,
  artigosIndex: [],
  artigosData: null,
  prompt: '',
  catalogs: { videos: {} },
  vocab: { data: [], selected: [] },
  princ: { data: [], selected: [] },
  news: { data: [] }
};

const appEls = {
  // busca
  selCodigo: document.getElementById('selCodigo'),
  inpArtigo: document.getElementById('inpArtigo'),
  btnBuscar: document.getElementById('btnBuscar'),
  resultChips: document.getElementById('resultChips'),
  resultMsg: document.getElementById('resultMsg'),

  // modal artigo
  modalArtigo: document.getElementById('modalArtigo'),
  amTitle: document.getElementById('amTitle'),
  amBody: document.getElementById('amBody'),
  amExtras: document.getElementById('amExtras'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnFechar: document.getElementById('btnFechar'),
  amPromptWrap: document.getElementById('amPromptWrap'),

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
  const opts = (codes||[]).map(c=>`<option value="${c.id}">${escapeHTML(c.label)}</option>`).join('');
  el.innerHTML = `<option value="" selected disabled>Selecione…</option>${opts}`;
}

/* ====== Catálogo de Vídeos (um arquivo por código) ====== */
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
async function searchArticles(codeId, entrada){
  await ensureCodeLoaded(codeId);
  const nodes = state.artigosIndex.slice();

  const raw = entrada.trim();
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
  if (soLetras || (!soNumero && !misto)){
    return nodes.filter(n => nodeHasAllWholeWords(n, raw));
  }
  return [];
}

/* ====== Render ====== */
function renderResultChip(node){
  const btn=document.createElement('button');
  btn.className='chip';
  btn.textContent=node.titulo;
  btn.type='button';
  btn.addEventListener('click',e=>{ e.preventDefault(); openArticleModalByNode(node); });
  appEls.resultChips.appendChild(btn);
}

/* ====== Modal Artigo ====== */
const renderArticleHTML = node => `<div class="article"><div class="art-title">${escapeHTML(node.titulo)}</div><pre class="art-caput" style="white-space:pre-wrap;">${escapeHTML(node.texto)}</pre></div>`;

async function buildExtrasForArticle(node){
  const codeKey = codeKeyFromId(state.codigo);
  const artKey  = articleKeyFromTitulo(node.titulo);
  appEls.amExtras.innerHTML=''; appEls.amExtras.hidden=true;
  if (!codeKey || !artKey) return;

  // Vídeos (opcional)
  const vidCat = await loadVideosCatalog(codeKey);
  if (vidCat && vidCat[artKey] && Array.isArray(vidCat[artKey].videos) && vidCat[artKey].videos.length){
    const b=document.createElement('button');
    b.className='btn btn-outline'; b.type='button'; b.textContent='Vídeo aula';
    b.onclick = ()=> renderVideosModal(vidCat[artKey]);
    appEls.amExtras.appendChild(b);
  }
  appEls.amExtras.hidden = appEls.amExtras.children.length===0;
}

function openArticleModalByIndex(idx){
  if (idx<0 || idx>=state.artigosIndex.length) return;
  const node = state.artigosIndex[idx];
  state.artigoAtualIdx = idx;

  appEls.amTitle.textContent = node.titulo;
  appEls.amBody.innerHTML = renderArticleHTML(node);
  appEls.amExtras.hidden = true;
  buildExtrasForArticle(node);

  appEls.btnPrev.disabled = (idx<=0);
  appEls.btnNext.disabled = (idx>=state.artigosIndex.length-1);

  // Reseta área de prompt/IA no rodapé
  renderCopyButton();

  if (!appEls.modalArtigo.open) appEls.modalArtigo.showModal();
}
function openArticleModalByNode(node){
  const idx = state.artigosIndex.findIndex(n=>n.titulo===node.titulo);
  if (idx>=0) openArticleModalByIndex(idx);
}

function renderCopyButton(){
  appEls.amPromptWrap.innerHTML = '<button id="btnCopiarPrompt" class="btn btn-primary" type="button">Copiar Prompt</button>';
  const btn = appEls.amPromptWrap.querySelector('#btnCopiarPrompt');
  btn.addEventListener('click', onCopiarPrompt);
}

function buildSinglePrompt(node){
  const bloco = `### ${node.titulo}\nTexto integral:\n${node.texto}`;
  return `Assuma a persona de um professor de Direito experiente (direito.love) e gere um material de estudo rápido, direto e completo sobre o artigo abaixo, cobrindo: (1) conceito com visão doutrinária, jurisprudência majoritária e prática; (2) mini exemplo prático; (3) checklist essencial; (4) erros comuns e pegadinhas de prova; (5) nota comparativa se houver artigos correlatos. Responda em português claro, sem enrolação, objetivo e didático.\n\n${bloco}\n\n💚 direito.love — Gere um novo prompt em https://direito.love`;
}
async function onCopiarPrompt(){
  const node = state.artigosIndex[state.artigoAtualIdx];
  if (!node) return;
  const prompt = buildSinglePrompt(node);
  state.prompt = prompt;
  try{ await navigator.clipboard.writeText(prompt); }catch{ /* ignore */ }
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
    b.addEventListener('click', ()=>{
      const app = b.dataset.app;
      openAIAppOrWeb(app);
    });
  });
}
function openAIAppOrWeb(app){
  // Versões web confiáveis (deep-links de apps nativos variam num site estático)
  const urls = {
    gpt: 'https://chatgpt.com/',
    gemini: 'https://gemini.google.com/app',
    copilot: 'https://copilot.microsoft.com/'
  };
  const url = urls[app] || urls.gpt;
  window.open(url, '_blank','noopener');
}

function bindSwipe(){
  const el = appEls.amBody; if (!el) return;
  let down=false, x0=0, y0=0, moved=false;
  el.addEventListener('pointerdown',e=>{ down=true; moved=false; x0=e.clientX; y0=e.clientY; el.style.userSelect='none'; },{passive:true});
  el.addEventListener('pointermove',e=>{ if(!down) return; const dx=e.clientX-x0, dy=e.clientY-y0; if(Math.abs(dx)>20 && Math.abs(dx)>Math.abs(dy)) moved=true; },{passive:true});
  el.addEventListener('pointerup',e=>{
    if(!down) return; el.style.userSelect=''; const dx=e.clientX-x0, dy=e.clientY-y0; down=false;
    if(!moved || Math.abs(dx)<50 || Math.abs(dx)<=Math.abs(dy)) return;
    if (dx<0 && state.artigoAtualIdx<state.artigosIndex.length-1) openArticleModalByIndex(state.artigoAtualIdx+1);
    else if (dx>0 && state.artigoAtualIdx>0) openArticleModalByIndex(state.artigoAtualIdx-1);
  },{passive:true});
  el.addEventListener('pointercancel',()=>{ down=false; moved=false; el.style.userSelect=''; },{passive:true});
}

/* ====== Sidebar & modais ====== */
function openSidebar(){ appEls.sidebar.classList.add('open'); appEls.sideBackdrop.hidden=false; appEls.sidebar.setAttribute('aria-hidden','false'); }
function closeSidebar(){ appEls.sidebar.classList.remove('open'); appEls.sideBackdrop.hidden=true; appEls.sidebar.setAttribute('aria-hidden','true'); }
function openModalById(id){ const d=document.getElementById(id); if (d && !d.open) d.showModal(); }

async function onSideNavClick(a){
  const target = a.dataset.target;
  const isHome = !!a.dataset.home;
  closeSidebar();
  if (isHome){ window.scrollTo({top:0,behavior:'smooth'}); return; }
  if (!target) return;
  // Carregamentos dinâmicos
  if (target==='modalCursos'){ await loadCursosHTML(); }
  if (target==='modalNoticias'){ await ensureNewsLoaded(); renderNewsList(); }
  if (target==='modalVocab'){ await ensureVocabLoaded(); renderVocabList(); }
  if (target==='modalPrincipios'){ await ensurePrincLoaded(); renderPrincList(); }
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

/* ====== Vídeos ====== */
function renderVideosModal(data){
  appEls.vdTitle.textContent=data.titulo||'Vídeo aula'; appEls.vdLista.innerHTML='';
  (data.videos||[]).forEach(v=>{ const li=document.createElement('li'); const a=document.createElement('a'); a.href=v.url; a.target='_blank'; a.rel='noopener'; a.textContent=v.title||v.url; li.appendChild(a); appEls.vdLista.appendChild(li); });
  if(!appEls.modalVideos.open) appEls.modalVideos.showModal();
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
    a.href = it.url || '#'; a.target='_blank'; a.rel='noopener'; a.className='btn btn-outline'; a.textContent='Ler';
    actions.appendChild(a);
    row.appendChild(title); row.appendChild(meta); row.appendChild(actions);
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
    // normaliza: {titulo, texto, temas: [..]}
    state.vocab.data = state.vocab.data.map(x=>({ titulo: x.titulo||'', texto: x.texto||'', temas: Array.isArray(x.temas)?x.temas.slice(0,3):[] }));
  }catch{
    state.vocab.data = [];
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
    const temas = document.createElement('div'); temas.className='li-temas';
    it.temas.forEach((t,i)=>{
      const id = `v_${idx}_${i}`;
      const label = document.createElement('label');
      label.className='chk';
      label.innerHTML = `<input type="checkbox" id="${id}" data-titulo="${escapeHTML(it.titulo)}" data-tema="${escapeHTML(t)}"> <span>${escapeHTML(t)}</span>`;
      temas.appendChild(label);
    });
    row.appendChild(title); row.appendChild(body); row.appendChild(temas);
    wrap.appendChild(row);
  });
  appEls.vocabList.innerHTML=''; appEls.vocabList.appendChild(wrap);
  // rebind checkboxes
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
    try{ await navigator.clipboard.writeText(prompt); }catch{}
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
    const bt = document.createElement('button'); bt.className='btn btn-outline'; bt.type='button'; bt.textContent='Selecionar';
    bt.addEventListener('click', ()=>{
      const i = state.princ.selected.findIndex(x=> x.titulo===it.titulo);
      if (i>=0){ state.princ.selected.splice(i,1); bt.textContent='Selecionar'; }
      else { state.princ.selected.push(it); bt.textContent='Selecionado ✔'; }
      appEls.btnPrincCopy.disabled = state.princ.selected.length===0;
    });
    actions.appendChild(bt);
    row.appendChild(title); row.appendChild(body); row.appendChild(actions);
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
    try{ await navigator.clipboard.writeText(prompt); }catch{}
    renderPrincAIButtons();
  });
}

/* ====== Eventos principais ====== */
function resetAll(){
  state.prompt='';
  appEls.resultChips.innerHTML=''; appEls.resultMsg.textContent='';
  appEls.inpArtigo.value='';
}
async function onBuscar(e){
  if (e){ e.preventDefault(); }
  const codeId = appEls.selCodigo.value;
  const entrada = appEls.inpArtigo.value.trim();
  if (!codeId){ appEls.resultMsg.textContent='Selecione um código antes.'; return; }
  if (!entrada){ appEls.resultMsg.textContent='Digite um número de artigo ou palavras inteiras.'; return; }

  appEls.resultChips.innerHTML=''; appEls.resultMsg.textContent='Buscando...';
  try{
    const hits = await searchArticles(codeId, entrada);
    appEls.resultChips.innerHTML='';
    if (!hits.length){ appEls.resultMsg.textContent='Nada encontrado.'; return; }
    hits.slice(0,200).forEach(renderResultChip);
    const extra = hits.length>200 ? ` (mostrando 200/${hits.length})` : '';
    appEls.resultMsg.textContent = `${hits.length} artigo(s) encontrado(s)${extra}. Clique para abrir.`;
  }catch(err){
    console.error(err); appEls.resultMsg.textContent='Erro ao carregar os dados.';
  }
}

/* ====== Bind ====== */
function bind(){
  // tipos
  ['btnPrev','btnNext','btnFechar','btnBuscar','btnSidebar','btnSideClose','btnVdFechar','btnReset']
    .forEach(k=>appEls[k] && appEls[k].setAttribute('type','button'));

  // busca
  appEls.btnBuscar.addEventListener('click', onBuscar);
  appEls.inpArtigo.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); onBuscar(); } });

  // modal artigo
  appEls.btnFechar.addEventListener('click', ()=>{ appEls.modalArtigo.close(); resetAll(); });
  appEls.btnPrev.addEventListener('click', ()=>{ if(state.artigoAtualIdx>0) openArticleModalByIndex(state.artigoAtualIdx-1); });
  appEls.btnNext.addEventListener('click', ()=>{ if(state.artigoAtualIdx<state.artigosIndex.length-1) openArticleModalByIndex(state.artigoAtualIdx+1); });

  // vídeos
  appEls.btnVdFechar && appEls.btnVdFechar.addEventListener('click', ()=> appEls.modalVideos.close());

  // sidebar + swipe
  bindSidebar();
  bindSwipe();

  // reset topbar
  appEls.btnReset && appEls.btnReset.addEventListener('click', resetAll);
}

/* ====== Init ====== */
async function initCodes(){
  try{
    const codes = await autoDiscoverCodes();
    renderCodeSelect(codes);
  }catch(e){
    console.warn('Falha ao descobrir códigos', e);
  }
}
function start(){
  bind();
  initCodes();
}
document.addEventListener('DOMContentLoaded', start);
