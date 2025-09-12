/* Ajustes críticos:
   1) Liga listeners imediatamente (bind() antes de redes) para evitar UI travada.
   2) Sidebar e links abrindo modais (data-target).
   3) Mantidos: swipe horizontal no modal, busca AND por palavras inteiras,
      catálogos por código para Quiz/Vídeos (quiz/<code>_quiz.json, videos/<code>_videos.json). */

const state = {
  codigo: null,
  termoBusca: '',
  artigoAtualIdx: -1,
  artigosIndex: [],
  artigosData: null,
  selecionados: [],
  prompt: '',
  catalogs: { quiz: {}, videos: {} },
  quiz: { data: null, idx: 0, acertos: 0, path: null, answered: [] }
};

const appEls = {
  selCodigo: document.getElementById('selCodigo'),
  inpArtigo: document.getElementById('inpArtigo'),
  btnBuscar: document.getElementById('btnBuscar'),
  resultChips: document.getElementById('resultChips'),
  resultMsg: document.getElementById('resultMsg'),
  selectedChips: document.getElementById('selectedChips'),
  selCount: document.getElementById('selCount'),
  btnClearSel: document.getElementById('btnClearSel'),
  btnGerarPrompt: document.getElementById('btnGerarPrompt'),
  promptArea: document.getElementById('promptArea'),
  promptBox: document.getElementById('promptBox'),
  btnCopiar: document.getElementById('btnCopiar'),

  // modal artigo
  modalArtigo: document.getElementById('modalArtigo'),
  amTitle: document.getElementById('amTitle'),
  amBody: document.getElementById('amBody'),
  amExtras: document.getElementById('amExtras'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnFechar: document.getElementById('btnFechar'),
  btnIncluir: document.getElementById('btnIncluir'),

  // sidebar
  btnSidebar: document.getElementById('btnSidebar'),
  btnSideClose: document.getElementById('btnSideClose'),
  sidebar: document.getElementById('sidebar'),
  sideBackdrop: document.getElementById('sideBackdrop'),

  // quiz
  modalQuiz: document.getElementById('modalQuiz'),
  qzTitle: document.getElementById('qzTitle'),
  qzEnunciado: document.getElementById('qzEnunciado'),
  qzAlternativas: document.getElementById('qzAlternativas'),
  qzFeedback: document.getElementById('qzFeedback'),
  btnQzPrev: document.getElementById('btnQzPrev'),
  btnQzNext: document.getElementById('btnQzNext'),
  btnQzFechar: document.getElementById('btnQzFechar'),
  btnQzConfirmar: document.getElementById('btnQzConfirmar'),
  btnQzProxima: document.getElementById('btnQzProxima'),

  // videos
  modalVideos: document.getElementById('modalVideos'),
  vdTitle: document.getElementById('vdTitle'),
  vdLista: document.getElementById('vdLista'),
  btnVdFechar: document.getElementById('btnVdFechar')
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

/* ====== Data helpers ====== */
async function getJSON(path){
  const url = path + (path.includes('?')?'&':'?') + 'v=' + Date.now();
  const r = await fetch(url, { cache:'no-store' });
  if (!r.ok) throw new Error(`Erro ${r.status} ao carregar ${path}`);
  return r.json();
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

/* ====== Catálogos (um arquivo por código) ====== */
async function loadQuizCatalog(codeKey){
  if (state.catalogs.quiz[codeKey]!==undefined) return state.catalogs.quiz[codeKey];
  const tries=[`quiz/${codeKey}_quiz.json`,`quiz/${codeKey}.json`,`quiz/${codeKey}_quiz.jon`];
  for (const p of tries){ try{ const d=await getJSON(p); state.catalogs.quiz[codeKey]=d; return d; }catch{} }
  state.catalogs.quiz[codeKey]=null; return null;
}
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
      return en===t || en===t.replace(/^art/,'') || en==='art'+t;
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
function renderSelected(){
  appEls.selectedChips.innerHTML='';
  state.selecionados.forEach((n,i)=>{
    const chip=document.createElement('span');
    chip.className='chip';
    chip.innerHTML = `${escapeHTML(n.titulo)} <button class="icon-ghost" type="button">×</button>`;
    chip.querySelector('button').onclick = (e)=>{ e.preventDefault(); state.selecionados.splice(i,1); renderSelected(); updatePromptButtonsState(); };
    appEls.selectedChips.appendChild(chip);
  });
  appEls.selCount.textContent=`(${state.selecionados.length}/5)`;
}
const updatePromptButtonsState = ()=> appEls.btnGerarPrompt.disabled = state.selecionados.length===0;

/* ====== Modal Artigo + Extras ====== */
const renderArticleHTML = node => `<div class="article"><div class="art-title">${escapeHTML(node.titulo)}</div><pre class="art-caput" style="white-space:pre-wrap;">${escapeHTML(node.texto)}</pre></div>`;

async function buildExtrasForArticle(node){
  const codeKey = codeKeyFromId(state.codigo);
  const artKey  = articleKeyFromTitulo(node.titulo);
  appEls.amExtras.innerHTML=''; appEls.amExtras.hidden=true;
  if (!codeKey || !artKey) return;

  const [quizCat, vidCat] = await Promise.all([loadQuizCatalog(codeKey), loadVideosCatalog(codeKey)]);

  if (quizCat && quizCat[artKey]){
    const b=document.createElement('button');
    b.className='btn btn-outline'; b.type='button'; b.textContent='Questões';
    b.onclick = ()=>{
      const pack = quizCat[artKey];
      const qs = (pack.questoes || []).slice(0, 10); // <= 10 questões
      state.quiz = {
        data: { ...pack, questoes: qs },
        idx: 0,
        acertos: 0,
        path: `quiz/${codeKey}_quiz.json`,
        answered: Array(qs.length).fill(null)
      };
      openQuizAt(0);
    };
    appEls.amExtras.appendChild(b);
  }
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

  const already = state.selecionados.some(n=>n.titulo===node.titulo);
  appEls.btnIncluir.disabled = already || state.selecionados.length>=5;
  appEls.btnIncluir.textContent = already ? 'Já incluído' : (state.selecionados.length>=5 ? 'Limite atingido (5)' : 'Incluir no prompt');

  if (!appEls.modalArtigo.open) appEls.modalArtigo.showModal();
}
function openArticleModalByNode(node){
  const idx = state.artigosIndex.findIndex(n=>n.titulo===node.titulo);
  if (idx>=0) openArticleModalByIndex(idx);
}

/* ====== Swipe (mobile) ====== */
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

/* ====== Sidebar & Modais da sidebar ====== */
function openSidebar(){ appEls.sidebar.classList.add('open'); appEls.sideBackdrop.hidden=false; appEls.sidebar.setAttribute('aria-hidden','false'); }
function closeSidebar(){ appEls.sidebar.classList.remove('open'); appEls.sideBackdrop.hidden=true; appEls.sidebar.setAttribute('aria-hidden','true'); }
function openModalById(id){ const d=document.getElementById(id); if (d && !d.open) d.showModal(); }

function bindSidebar(){
  if (appEls.btnSidebar) appEls.btnSidebar.addEventListener('click', e=>{ e.preventDefault(); openSidebar(); });
  if (appEls.btnSideClose) appEls.btnSideClose.addEventListener('click', e=>{ e.preventDefault(); closeSidebar(); });
  if (appEls.sideBackdrop) appEls.sideBackdrop.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeSidebar(); });

  // links -> modais
  document.querySelectorAll('.side-link').forEach(a=>{
    a.addEventListener('click', e=>{
      e.preventDefault();
      const target = a.dataset.target;
      closeSidebar();
      if (target) openModalById(target);
    });
  });
}

/* ====== Prompt ====== */
function buildMultiPrompt(selecionados){
  const blocos = selecionados.map(n=>`### ${n.titulo}\nTexto integral:\n${n.texto}`).join('\n\n');
  return `Assuma a persona de um professor de Direito muito experiente e com didática impecável convidado pelo direito.love para preparar esse materia incrivel para um estudo rápido.
Objetivo: Analise os artigos dos codigos em questão e prepare um materia didatico para estudo rápido mas rico em detalhes. Seja objetivo em suas respostas mas pesquise e garanta que o estudante receba todas as informações necessárias para responder qualquer questçao de prova da OAB e concurso publico.
Para cada artigo: 1) conceito detalhado envolvendo doutrina, jurisprudencia, processual e pratica. Tudo escrito de forma objetiva; 2) mini exemplo; 3) check-list essencial; 4) erros comuns em provas; 5) pegadinhas de provas.
Finalize com comparação entre os artigos.

Artigos selecionados: ${selecionados.map(n=>n.titulo).join(', ')}
${blocos}

💚 direito.love — Gere um novo prompt em https://direito.love`;
}

/* ====== Eventos ====== */
function resetAll(){
  state.selecionados=[]; state.prompt='';
  renderSelected(); updatePromptButtonsState();
  appEls.promptArea.hidden=true; appEls.promptBox.textContent='';
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
function onIncluir(e){
  if (e){ e.preventDefault(); }
  const node = state.artigosIndex[state.artigoAtualIdx];
  if (!node || state.selecionados.length>=5) return;
  if (state.selecionados.some(n=>n.titulo===node.titulo)) return;
  state.selecionados.push({ titulo: node.titulo, texto: node.texto });
  renderSelected(); updatePromptButtonsState();
  appEls.btnIncluir.disabled=true; appEls.btnIncluir.textContent='Incluído ✔';
}
function onGerarPrompt(e){
  if (e){ e.preventDefault(); }
  const prompt = buildMultiPrompt(state.selecionados);
  state.prompt = prompt;
  appEls.promptBox.textContent = prompt;
  appEls.promptArea.hidden = false;
}

/* ====== Quiz ====== */
function renderQuizQuestion(){
  const qz = state.quiz;
  const qs = (qz.data && qz.data.questoes) || [];
  const i  = qz.idx;
  const q  = qs[i]; if(!q) return;

  // título + progresso
  appEls.qzTitle.textContent = qz.data.titulo || 'Questões';
  const prog = document.createElement('div');
  prog.className = 'qz-progress';
  prog.textContent = `Questão ${i+1} de ${qs.length}`;
  appEls.qzEnunciado.innerHTML = '';
  appEls.qzEnunciado.appendChild(prog);
  appEls.qzEnunciado.appendChild(document.createTextNode(`${i+1}. ${q.enunciado || ''}`));

  // alternativas
  appEls.qzAlternativas.innerHTML = '';
  (q.alternativas || []).forEach((alt, idx) => {
    const label = document.createElement('label');
    label.dataset.idx = String(idx);
    label.innerHTML = `<input type="radio" name="qz_alt" value="${idx}"> <span>${escapeHTML(alt)}</span>`;
    appEls.qzAlternativas.appendChild(label);
  });

  // feedback (esconde até confirmar)
  appEls.qzFeedback.hidden = true;
  appEls.qzFeedback.textContent = '';
  appEls.qzFeedback.classList.remove('ok','err');

  // navegação: só depois de confirmar
  appEls.btnQzConfirmar.hidden = false;
  appEls.btnQzProxima.hidden = true;
  appEls.btnQzPrev.disabled = true;
  appEls.btnQzNext.disabled = true;
}

function openQuizAt(i){
  state.quiz.idx = i;
  renderQuizQuestion();
  if(!appEls.modalQuiz.open) appEls.modalQuiz.showModal();
}

function confirmQuizAnswer(){
  const qz = state.quiz;
  const qs = qz.data.questoes || [];
  const i  = qz.idx;
  const q  = qs[i];

  const sel = appEls.qzAlternativas.querySelector('input[name="qz_alt"]:checked');
  if (!sel) return;

  const chosen = Number(sel.value);
  const correct = Number(q.correta);
  const ok = (chosen === correct);

  if (ok) qz.acertos++;

  // pinta correto/errado e trava
  appEls.qzAlternativas.querySelectorAll('label').forEach(lbl => {
    const idx = Number(lbl.dataset.idx);
    lbl.classList.add('locked');
    if (idx === correct) lbl.classList.add('correct');
    if (idx === chosen && chosen !== correct) lbl.classList.add('wrong');
    if (idx === chosen && chosen === correct) lbl.classList.add('correct');
  });

  // gabarito comentado
  const letter = (n)=> String.fromCharCode(65 + Number(n));
  const head = ok ? `✅ Correto!` : `❌ Não foi dessa. Alternativa correta: ${letter(correct)}.`;
  const comment = q.comentario ? `\n\n${q.comentario}` : '';
  appEls.qzFeedback.textContent = head + comment;
  appEls.qzFeedback.hidden = false;
  appEls.qzFeedback.classList.toggle('ok', ok);
  appEls.qzFeedback.classList.toggle('err', !ok);

  // registra
  qz.answered[i] = { chosen, correct, ok };

  // liberar navegação
  const isFirst = (i <= 0);
  const isLast  = (i >= qs.length - 1);
  appEls.btnQzConfirmar.hidden = true;
  appEls.btnQzProxima.hidden = isLast;      // aparece só se não for a última
  appEls.btnQzPrev.disabled = isFirst;
  appEls.btnQzNext.disabled = isLast;

  // fim gamificado
  if (isLast){
    const total = qs.length;
    const pct = Math.round((qz.acertos / total) * 100);
    const tier =
      qz.acertos === total ? {tag:'🏆 Lenda do Penal', cor:'#22c55e'} :
      qz.acertos >= total-1 ? {tag:'🥇 Promotor em formação', cor:'#16a34a'} :
      qz.acertos >= Math.ceil(total*0.7) ? {tag:'🥈 Muito bom!', cor:'#0ea5e9'} :
      qz.acertos >= Math.ceil(total*0.5) ? {tag:'🥉 Dá pra melhorar', cor:'#f59e0b'} :
      {tag:'📚 Bora revisar', cor:'#ef4444'};

    const wrap = document.createElement('div');
    wrap.style.marginTop = '12px';
    wrap.innerHTML = `
      <div class="qz-badge" style="background:${tier.cor}">${tier.tag}</div>
      <div style="margin-top:8px"><b>Resultado:</b> ${qz.acertos}/${total} (${pct}%).</div>
      <div style="margin-top:6px">Quer tentar de novo para subir sua medalha?</div>
      <div style="display:flex; gap:8px; margin-top:10px">
        <button id="qzRestart" class="btn btn-outline" type="button">Refazer</button>
        <button id="qzClose" class="btn btn-primary" type="button">Fechar</button>
      </div>
    `;
    appEls.qzFeedback.appendChild(wrap);

    const restart = wrap.querySelector('#qzRestart');
    const closeBtn = wrap.querySelector('#qzClose');
    restart.addEventListener('click', ()=>{
      qz.idx = 0; qz.acertos = 0;
      qz.answered = Array(qs.length).fill(null);
      renderQuizQuestion();
    });
    closeBtn.addEventListener('click', ()=> appEls.modalQuiz.close());
  }
}

function renderVideosModal(data){
  appEls.vdTitle.textContent=data.titulo||'Vídeo aula'; appEls.vdLista.innerHTML='';
  (data.videos||[]).forEach(v=>{ const li=document.createElement('li'); const a=document.createElement('a'); a.href=v.url; a.target='_blank'; a.rel='noopener'; a.textContent=v.title||v.url; li.appendChild(a); appEls.vdLista.appendChild(li); });
  if(!appEls.modalVideos.open) appEls.modalVideos.showModal();
}

/* ====== Bind: LIGA PRIMEIRO os listeners ====== */
function bind(){
  // tipos
  ['btnPrev','btnNext','btnIncluir','btnFechar','btnBuscar','btnGerarPrompt','btnClearSel','btnCopiar','btnSidebar','btnSideClose','btnQzPrev','btnQzNext','btnQzFechar','btnQzConfirmar','btnQzProxima','btnVdFechar']
    .forEach(k=>appEls[k] && appEls[k].setAttribute('type','button'));

  // ações principais
  appEls.btnBuscar.addEventListener('click', onBuscar);
  appEls.btnIncluir.addEventListener('click', onIncluir);
  appEls.btnGerarPrompt.addEventListener('click', onGerarPrompt);
  appEls.btnClearSel.addEventListener('click', ()=>{ state.selecionados=[]; renderSelected(); updatePromptButtonsState(); appEls.promptArea.hidden=true; appEls.promptBox.textContent=''; });
  appEls.btnCopiar.addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(state.prompt||''); }catch{} });
  appEls.btnFechar.addEventListener('click', ()=> appEls.modalArtigo.close());
  appEls.btnPrev.addEventListener('click', ()=>{ if(state.artigoAtualIdx>0) openArticleModalByIndex(state.artigoAtualIdx-1); });
  appEls.btnNext.addEventListener('click', ()=>{ if(state.artigoAtualIdx<state.artigosIndex.length-1) openArticleModalByIndex(state.artigoAtualIdx+1); });
  appEls.inpArtigo.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); onBuscar(); } });

  // quiz
  appEls.btnQzPrev.addEventListener('click', ()=>{ if(state.quiz.idx>0) openQuizAt(state.quiz.idx-1); });
  appEls.btnQzNext.addEventListener('click', ()=>{
    const qs=(state.quiz.data.questoes||[]).length;
    if(state.quiz.idx<qs-1) openQuizAt(state.quiz.idx+1);
  });
  appEls.btnQzConfirmar.addEventListener('click', confirmQuizAnswer);
  appEls.btnQzProxima.addEventListener('click', ()=> openQuizAt(state.quiz.idx+1));
  appEls.btnQzFechar.addEventListener('click', ()=> appEls.modalQuiz.close());
  appEls.btnVdFechar && appEls.btnVdFechar.addEventListener('click', ()=> appEls.modalVideos.close());

  // sidebar + swipe
  bindSidebar();
  bindSwipe();
}

/* ====== Init: liga UI primeiro, carrega rede depois ====== */
async function initCodes(){
  try{
    const codes = await autoDiscoverCodes();
    renderCodeSelect(codes);
  }catch(e){
    console.warn('Falha ao descobrir códigos', e);
  }
}
function start(){
  bind();              // <- LIGA JÁ a UI (corrige “sidebar não abre”)
  initCodes();         // carrega em paralelo; sem travar a página
}
document.addEventListener('DOMContentLoaded', start);
