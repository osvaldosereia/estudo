/* script.js — swipe no modal (mobile), busca por palavras inteiras (AND) com múltiplos resultados,
   e botões condicionais “Questões”/“Vídeo aula” com carregamento por /quiz e /videos. */

const state = {
  codigo: null,
  termoBusca: '',
  artigoAtualIdx: -1,
  artigosIndex: [],
  artigosData: null,
  selecionados: [],
  prompt: '',
  // quiz
  quiz: { data: null, idx: 0, acertos: 0, path: null }
};

// Descobertos dinamicamente
const CODES = [];

const appEls = {
  // principais
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

  // sidebar & topbar
  btnSidebar: document.getElementById('btnSidebar'),
  btnReset: document.getElementById('btnReset'),
  sidebar: document.getElementById('sidebar'),
  btnSideClose: document.getElementById('btnSideClose'),
  sideBackdrop: document.getElementById('sideBackdrop'),

  // quiz modal
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

  // videos modal
  modalVideos: document.getElementById('modalVideos'),
  vdTitle: document.getElementById('vdTitle'),
  vdLista: document.getElementById('vdLista'),
  btnVdFechar: document.getElementById('btnVdFechar')
};

/* ========== Utils ========== */
function escapeHTML(s) {
  return (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function words(s){
  const n = norm(s);
  return n ? n.split(' ').filter(Boolean) : [];
}
function onlyDigits(s) {
  const m = String(s || '').match(/\d{1,4}/);
  return m ? m[0] : null;
}
function capitalizeWords(s) {
  return (s || '').split(/[_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function prettyLabelFromCodeId(codeId) {
  const key = String(codeId).replace(/^codigo_/, '');
  const map = {
    civil: 'Código Civil',
    penal: 'Código Penal',
    cpc: 'Código de Processo Civil (CPC)',
    cpp: 'Código de Processo Penal (CPP)',
    ctn: 'Código Tributário Nacional (CTN)',
    consumidor: 'Código de Defesa do Consumidor (CDC)'
  };
  return map[key] || `Código ${capitalizeWords(key.replace(/_/g, ' '))}`;
}
function articleKeyFromTitulo(titulo){
  // "Art. 121", "Art. 121-A" -> "art121" | "art121a"
  const m = (titulo || '').toLowerCase().match(/art\.?\s*(\d{1,4})(?:[\s\-]*([a-z]))?/i);
  if (!m) return null;
  return `art${m[1]}${m[2] || ''}`;
}

/* ========== Data (com cache-busting) ========== */
async function getJSON(path) {
  const url = path + (path.includes('?') ? '&' : '?') + 'v=' + Date.now();
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Erro ${r.status} ao carregar ${path}`);
  return r.json();
}
async function fileExists(path) {
  const url = path + (path.includes('?') ? '&' : '?') + 'v=' + Date.now();
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}
async function tryLoadCodeData(codeId) {
  const paths = [`data/${codeId}_vademecum.json`, `data/${codeId}.json`];
  for (const p of paths) {
    try { return await getJSON(p); } catch {}
  }
  throw new Error('Arquivo JSON não encontrado.');
}
async function ensureCodeLoaded(codeId) {
  if (state.codigo === codeId && state.artigosData) return;
  state.codigo = codeId;
  state.artigosData = await tryLoadCodeData(codeId);
  state.artigosIndex = Object.values(state.artigosData);
}

/* ========== Descoberta automática de códigos ========== */
async function autoDiscoverCodes() {
  try {
    const apiUrl = 'https://api.github.com/repos/osvaldosereia/estudo/contents/data';
    const r = await fetch(apiUrl, { cache: 'no-store' });
    if (!r.ok) throw new Error('GitHub API falhou: ' + r.status);
    const items = await r.json();
    const files = (Array.isArray(items) ? items : []).filter(it =>
      it && it.type === 'file' && /^codigo_.+_vademecum\.json$/i.test(it.name)
    );
    const codes = files.map(f => {
      const id = f.name.replace(/_vademecum\.json$/i, '');
      return { id, label: prettyLabelFromCodeId(id), name: f.name };
    });
    if (codes.length) return codes;
    throw new Error('Nenhum arquivo *_vademecum.json encontrado via API.');
  } catch (e) {
    console.warn('[autoDiscoverCodes] API listing falhou:', e.message || e);
  }
  const candidates = [
    'codigo_civil', 'codigo_penal',
    'codigo_cpc', 'codigo_cpp', 'codigo_ctn', 'codigo_consumidor'
  ];
  const found = [];
  for (const id of candidates) {
    const has = await fileExists(`data/${id}_vademecum.json`) || await fileExists(`data/${id}.json`);
    if (has) found.push({ id, label: prettyLabelFromCodeId(id) });
  }
  if (found.length) return found;
  if (await fileExists('data/codigo_civil_vademecum.json') || await fileExists('data/codigo_civil.json')) {
    return [{ id: 'codigo_civil', label: 'Código Civil' }];
  }
  return [];
}

/* ========== Busca (número, título exato, OU palavras inteiras AND) ========== */
function nodeHasAllWholeWords(node, entrada){
  const toks = words(entrada).filter(w => w.length >= 2 && !/^\d+$/.test(w));
  if (!toks.length) return false;
  const textoWords = new Set(words(node.texto || ''));
  // exige presença de TODAS as palavras (AND), "inteiras" após normalização
  return toks.every(t => textoWords.has(t));
}

async function searchArticles(codeId, entrada) {
  await ensureCodeLoaded(codeId);
  const nodes = state.artigosIndex.slice();

  const entradaRaw = entrada.trim();
  if (!entradaRaw) return [];

  const soNumero = /^\d{1,4}([A-Za-z])?$/.test(entradaRaw);
  const misto = /\d/.test(entradaRaw) && /[A-Za-z]/.test(entradaRaw);
  const soLetras = /^[A-Za-zÀ-ÿ\s]+$/.test(entradaRaw);

  // Busca por número (exato ou com sufixo)
  if (soNumero || misto) {
    const num = onlyDigits(entradaRaw);
    if (num) {
      const hitNum = nodes.find(n => {
        const t = norm(n.titulo || '');
        return t.includes(`art${num}`);
      });
      if (hitNum) return [hitNum];
    }
    // título exato (Art. 121-A etc.)
    const entradaNorm = norm(entradaRaw).replace(/\s+/g, '');
    const hitTitulo = nodes.find(n => {
      const t = norm(n.titulo || '').replace(/\s+/g, '');
      return entradaNorm === t || entradaNorm === t.replace(/^art/, '') || entradaNorm === 'art' + t;
    });
    if (hitTitulo) return [hitTitulo];
  }

  // Busca por palavras inteiras (AND)
  if (soLetras || (!soNumero && !misto)) {
    const results = nodes.filter(n => nodeHasAllWholeWords(n, entradaRaw));
    return results;
  }

  return [];
}

/* ========== Renderização ========== */
function renderCodeSelect() {
  const options = CODES.map(c => `<option value="${c.id}">${escapeHTML(c.label)}</option>`).join('');
  appEls.selCodigo.innerHTML = `<option value="" selected disabled>Selecione…</option>${options}`;
  state.codigo = null;
}
function renderResultChip(node) {
  const btn = document.createElement('button');
  btn.className = 'chip';
  btn.textContent = node.titulo;
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openArticleModalByNode(node); });
  appEls.resultChips.appendChild(btn);
}
function renderSelected() {
  appEls.selectedChips.innerHTML = '';
  state.selecionados.forEach((n, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${escapeHTML(n.titulo)} <button class="icon-ghost" data-idx="${i}" type="button">×</button>`;
    chip.querySelector('button').onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      state.selecionados.splice(i, 1);
      renderSelected();
      updatePromptButtonsState();
    };
    appEls.selectedChips.appendChild(chip);
  });
  appEls.selCount.textContent = `(${state.selecionados.length}/5)`;
}
function updatePromptButtonsState() {
  appEls.btnGerarPrompt.disabled = state.selecionados.length === 0;
}

/* ========== Modal de Artigo ========== */
function renderArticleHTML(node) {
  return `
    <div class="article">
      <div class="art-title">${escapeHTML(node.titulo)}</div>
      <pre class="art-caput" style="white-space:pre-wrap;">${escapeHTML(node.texto)}</pre>
    </div>`;
}

async function buildExtrasForArticle(node){
  // checa arquivos em /quiz/<codigo>/<artX.json> e /videos/<codigo>/<artX.json>
  const artKey = articleKeyFromTitulo(node.titulo);
  const codeId = state.codigo;
  appEls.amExtras.innerHTML = '';
  appEls.amExtras.hidden = true;

  if (!artKey || !codeId) return;

  const quizPath   = `quiz/${codeId}/${artKey}.json`;
  const videosPath = `videos/${codeId}/${artKey}.json`;

  const [hasQuiz, hasVideos] = await Promise.all([fileExists(quizPath), fileExists(videosPath)]);

  if (hasQuiz) {
    const b = document.createElement('button');
    b.className = 'btn btn-outline';
    b.textContent = 'Questões';
    b.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const data = await getJSON(quizPath);
        // limita a 5 questões (se houver mais)
        state.quiz = { data: { ...data, questoes: (data.questoes||[]).slice(0,5) }, idx: 0, acertos: 0, path: quizPath };
        openQuizAt(0);
      } catch { /* silencia */ }
    });
    appEls.amExtras.appendChild(b);
  }

  if (hasVideos) {
    const b = document.createElement('button');
    b.className = 'btn btn-outline';
    b.textContent = 'Vídeo aula';
    b.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const data = await getJSON(videosPath);
        renderVideosModal(data);
      } catch { /* silencia */ }
    });
    appEls.amExtras.appendChild(b);
  }

  appEls.amExtras.hidden = !(hasQuiz || hasVideos);
}

function openArticleModalByIndex(idx) {
  if (idx < 0 || idx >= state.artigosIndex.length) return;
  const node = state.artigosIndex[idx];
  state.artigoAtualIdx = idx;

  appEls.amTitle.textContent = node.titulo;
  appEls.amBody.innerHTML = renderArticleHTML(node);
  appEls.amExtras.hidden = true; // será ativado após checagem async
  buildExtrasForArticle(node);   // carrega botões condicionais

  appEls.btnPrev.disabled = (idx <= 0);
  appEls.btnNext.disabled = (idx >= state.artigosIndex.length - 1);

  const already = state.selecionados.some(n => n.titulo === node.titulo);
  appEls.btnIncluir.disabled = already || state.selecionados.length >= 5;
  appEls.btnIncluir.textContent = already
    ? 'Já incluído'
    : (state.selecionados.length >= 5 ? 'Limite atingido (5)' : 'Incluir no prompt');

  if (!appEls.modalArtigo.open) appEls.modalArtigo.showModal();
}
function openArticleModalByNode(node) {
  const idx = state.artigosIndex.findIndex(n => n.titulo === node.titulo);
  if (idx >= 0) openArticleModalByIndex(idx);
}

/* ========== Swipe horizontal no modal (mobile) ========== */
let swipe = { active:false, x0:0, y0:0, moved:false };
function bindSwipe(){
  const el = appEls.amBody;
  if (!el) return;

  el.addEventListener('pointerdown', (e) => {
    swipe.active = true; swipe.moved = false;
    swipe.x0 = e.clientX; swipe.y0 = e.clientY;
    el.style.userSelect = 'none';
  }, { passive:true });

  el.addEventListener('pointermove', (e) => {
    if (!swipe.active) return;
    const dx = e.clientX - swipe.x0;
    const dy = e.clientY - swipe.y0;
    // só considera swipe se movimento horizontal for dominante
    if (Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy)) {
      swipe.moved = true;
    }
  }, { passive:true });

  el.addEventListener('pointerup', (e) => {
    if (!swipe.active) return;
    el.style.userSelect = '';
    const dx = e.clientX - swipe.x0;
    const dy = e.clientY - swipe.y0;
    swipe.active = false;

    if (!swipe.moved || Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;

    if (dx < 0 && state.artigoAtualIdx < state.artigosIndex.length - 1) {
      // arrastou para a esquerda -> próximo
      openArticleModalByIndex(state.artigoAtualIdx + 1);
    } else if (dx > 0 && state.artigoAtualIdx > 0) {
      // arrastou para a direita -> anterior
      openArticleModalByIndex(state.artigoAtualIdx - 1);
    }
  }, { passive:true });

  el.addEventListener('pointercancel', () => {
    swipe.active = false; swipe.moved = false; el.style.userSelect = '';
  }, { passive:true });
}

/* ========== Prompt ========== */
function buildMultiPrompt(selecionados) {
  const blocos = selecionados.map(n =>
    `### ${n.titulo}\nTexto integral:\n${n.texto}`
  ).join('\n\n');

  return `Assuma a persona de um professor de Direito muito experiente e com didática impecável convidado pelo direito.love para preparar esse materia incrivel para um estudo rápido.
Objetivo: Analise os artigos dos codigos em questão e prepare um materia didatico para estudo rápido mas rico em detalhes. Seja objetivo em suas respostas mas pesquise e garanta que o estudante receba todas as informações necessárias para responder qualquer questçao de prova da OAB e concurso publico.
Para cada artigo: 1) conceito detalhado envolvendo doutrina, jurisprudencia, processual e pratica. Tudo escrito de forma objetiva; 2) mini exemplo; 3) check-list essencial; 4) erros comuns em provas; 5) pegadinhas de provas.
Finalize com comparação entre os artigos.

Artigos selecionados: ${selecionados.map(n => n.titulo).join(', ')}
${blocos}

💚 direito.love — Gere um novo prompt em https://direito.love`;
}

/* ========== Sidebar ========== */
function openSidebar(){
  appEls.sidebar.classList.add('open');
  appEls.sideBackdrop.hidden = false;
  appEls.sidebar.setAttribute('aria-hidden','false');
}
function closeSidebar(){
  appEls.sidebar.classList.remove('open');
  appEls.sideBackdrop.hidden = true;
  appEls.sidebar.setAttribute('aria-hidden','true');
}
function bindSidebar(){
  if (appEls.btnSidebar) appEls.btnSidebar.addEventListener('click', (e)=>{ e.preventDefault(); openSidebar(); });
  if (appEls.btnSideClose) appEls.btnSideClose.addEventListener('click', (e)=>{ e.preventDefault(); closeSidebar(); });
  if (appEls.sideBackdrop) appEls.sideBackdrop.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });
  document.querySelectorAll('.side-link').forEach(a => a.addEventListener('click', () => closeSidebar()));
}

/* ========== Reset geral ========== */
function resetAll(){
  state.selecionados = [];
  state.prompt = '';
  renderSelected();
  updatePromptButtonsState();
  if (appEls.promptArea) {
    appEls.promptArea.hidden = true;
    appEls.promptBox.textContent = '';
  }
  if (appEls.resultChips) appEls.resultChips.innerHTML = '';
  if (appEls.resultMsg) appEls.resultMsg.textContent = '';
  if (appEls.inpArtigo) appEls.inpArtigo.value = '';
}

/* ========== Busca / eventos ========== */
async function onBuscar(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const codeId = appEls.selCodigo.value;
  const entrada = appEls.inpArtigo.value.trim();

  if (!codeId) {
    appEls.resultMsg.textContent = 'Selecione um código antes.';
    return;
  }
  if (!entrada) {
    appEls.resultMsg.textContent = 'Digite um número de artigo ou palavras inteiras.';
    return;
  }

  appEls.resultChips.innerHTML = '';
  appEls.resultMsg.textContent = 'Buscando...';

  try {
    const hits = await searchArticles(codeId, entrada);
    appEls.resultChips.innerHTML = '';
    if (!hits || hits.length === 0) {
      appEls.resultMsg.textContent = 'Nada encontrado.';
      return;
    }
    const MAX = 200;
    hits.slice(0, MAX).forEach(renderResultChip);
    const extra = hits.length > MAX ? ` (mostrando ${MAX}/${hits.length})` : '';
    appEls.resultMsg.textContent = `${hits.length} artigo(s) encontrado(s)${extra}. Clique para abrir.`;
  } catch (err) {
    console.error(err);
    appEls.resultMsg.textContent = 'Erro ao carregar os dados.';
  }
}

function onIncluir(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const node = state.artigosIndex[state.artigoAtualIdx];
  if (!node || state.selecionados.length >= 5) return;
  if (state.selecionados.some(n => n.titulo === node.titulo)) return;

  state.selecionados.push({ titulo: node.titulo, texto: node.texto });
  renderSelected();
  updatePromptButtonsState();

  appEls.btnIncluir.disabled = true;
  appEls.btnIncluir.textContent = 'Incluído ✔';
}
function onClearSelecionados(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  state.selecionados = [];
  renderSelected();
  updatePromptButtonsState();
  appEls.promptArea.hidden = true;
  appEls.promptBox.textContent = '';
}
function onGerarPrompt(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const prompt = buildMultiPrompt(state.selecionados);
  state.prompt = prompt;
  appEls.promptBox.textContent = prompt;
  appEls.promptArea.hidden = false;
}
async function onCopiar(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  try { await navigator.clipboard.writeText(state.prompt || ''); } catch {}
}

/* ========== Quiz ========== */
function renderQuizQuestion(){
  const qz = state.quiz;
  const qs = (qz.data && qz.data.questoes) || [];
  const i = qz.idx;
  if (!qs[i]) return;

  appEls.qzTitle.textContent = qz.data.titulo || 'Questões';
  appEls.qzEnunciado.textContent = `${i+1}. ${qs[i].enunciado || ''}`;
  appEls.qzAlternativas.innerHTML = '';

  (qs[i].alternativas || []).forEach((alt, idx) => {
    const id = `qz_alt_${i}_${idx}`;
    const label = document.createElement('label');
    label.innerHTML = `<input type="radio" name="qz_alt" value="${idx}" id="${id}"> <span>${escapeHTML(alt)}</span>`;
    appEls.qzAlternativas.appendChild(label);
  });

  appEls.qzFeedback.hidden = true;
  appEls.qzFeedback.textContent = '';
  appEls.btnQzConfirmar.hidden = false;
  appEls.btnQzProxima.hidden = true;

  appEls.btnQzPrev.disabled = (i <= 0);
  appEls.btnQzNext.disabled = (i >= qs.length - 1);
}

function openQuizAt(i){
  state.quiz.idx = i;
  renderQuizQuestion();
  if (!appEls.modalQuiz.open) appEls.modalQuiz.showModal();
}

function confirmQuizAnswer(){
  const qz = state.quiz;
  const qs = qz.data.questoes || [];
  const i = qz.idx;
  const q = qs[i];
  const sel = appEls.qzAlternativas.querySelector('input[name="qz_alt"]:checked');
  if (!sel) return;

  const chosen = Number(sel.value);
  const ok = (chosen === Number(q.correta));
  if (ok) qz.acertos++;

  const comment = q.comentario ? `\n\n${q.comentario}` : '';
  appEls.qzFeedback.textContent = ok ? `✅ Correto!${comment}` : `❌ Não foi dessa. Alternativa correta: ${String.fromCharCode(65 + Number(q.correta))}.${comment}`;
  appEls.qzFeedback.hidden = false;

  appEls.btnQzConfirmar.hidden = true;
  appEls.btnQzProxima.hidden = (i >= qs.length - 1);
  if (i >= qs.length - 1) {
    // fim
    appEls.qzFeedback.textContent += `\n\nResultado: ${qz.acertos}/${qs.length}`;
  }
}

/* ========== Vídeos ========== */
function renderVideosModal(data){
  appEls.vdTitle.textContent = data.titulo || 'Vídeo aula';
  appEls.vdLista.innerHTML = '';
  (data.videos || []).forEach(v => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = v.url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = v.title || v.url;
    li.appendChild(a);
    appEls.vdLista.appendChild(li);
  });
  if (!appEls.modalVideos.open) appEls.modalVideos.showModal();
}

/* ========== Init / Binds ========== */
function bind() {
  ['btnPrev','btnNext','btnIncluir','btnFechar','btnBuscar','btnGerarPrompt','btnClearSel','btnCopiar','btnReset',
   'btnQzPrev','btnQzNext','btnQzFechar','btnQzConfirmar','btnQzProxima','btnVdFechar']
    .forEach(k => appEls[k] && appEls[k].setAttribute('type','button'));

  appEls.btnBuscar.addEventListener('click', onBuscar);
  appEls.btnIncluir.addEventListener('click', onIncluir);
  appEls.btnClearSel.addEventListener('click', onClearSelecionados);
  appEls.btnGerarPrompt.addEventListener('click', onGerarPrompt);
  appEls.btnCopiar.addEventListener('click', onCopiar);
  if (appEls.btnReset) appEls.btnReset.addEventListener('click', resetAll);

  appEls.btnFechar && appEls.btnFechar.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    appEls.modalArtigo.close();
  });

  appEls.btnPrev.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (state.artigoAtualIdx > 0)
      openArticleModalByIndex(state.artigoAtualIdx - 1);
  });
  appEls.btnNext.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (state.artigoAtualIdx < state.artigosIndex.length - 1)
      openArticleModalByIndex(state.artigoAtualIdx + 1);
  });

  appEls.inpArtigo.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      onBuscar();
    }
  });

  // Quiz events
  appEls.btnQzPrev.addEventListener('click', (e)=>{ e.preventDefault(); const i = state.quiz.idx; if (i>0){ openQuizAt(i-1); }});
  appEls.btnQzNext.addEventListener('click', (e)=>{ e.preventDefault(); const i = state.quiz.idx; const total = (state.quiz.data.questoes||[]).length; if (i<total-1){ openQuizAt(i+1); }});
  appEls.btnQzConfirmar.addEventListener('click', (e)=>{ e.preventDefault(); confirmQuizAnswer(); });
  appEls.btnQzProxima.addEventListener('click', (e)=>{ e.preventDefault(); const i = state.quiz.idx; openQuizAt(i+1); });
  appEls.btnQzFechar.addEventListener('click', (e)=>{ e.preventDefault(); appEls.modalQuiz.close(); });

  // Videos
  appEls.btnVdFechar && appEls.btnVdFechar.addEventListener('click', (e)=>{ e.preventDefault(); appEls.modalVideos.close(); });

  // Sidebar
  bindSidebar();

  // Swipe no modal (mobile)
  bindSwipe();
}

async function initCodes() {
  const discovered = await autoDiscoverCodes();
  CODES.length = 0;
  CODES.push(...discovered);
  renderCodeSelect();
}
async function start() {
  await initCodes();
  bind();
}
document.addEventListener('DOMContentLoaded', start);
