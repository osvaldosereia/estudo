/* script.js — auto-discovery de códigos em /data  */
const state = {
  codigo: null,
  termoBusca: '',
  artigoAtualIdx: -1,
  artigosIndex: [],
  artigosData: null,
  selecionados: [],
  prompt: ''
};

// será preenchido dinamicamente por autoDiscoverCodes()
const CODES = [];

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
  modalArtigo: document.getElementById('modalArtigo'),
  amTitle: document.getElementById('amTitle'),
  amBody: document.getElementById('amBody'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnFechar: document.getElementById('btnFechar'),
  btnIncluir: document.getElementById('btnIncluir')
};

// ===== Utils =====
function escapeHTML(s) {
  return (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '');
}
function onlyDigits(s) {
  const m = String(s || '').match(/\d{1,4}/);
  return m ? m[0] : null;
}
function tokensFromEntrada(entrada) {
  return norm(entrada).split(/\s+/).filter(t => t.length >= 4);
}
function buildFullText(node) {
  return node.texto || '';
}
function matchByNumber(node, entradaNum) {
  const tituloNormalizado = (node.titulo || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '');
  return tituloNormalizado.includes(`art${entradaNum}`);
}
function matchTituloOuNumero(node, entradaRaw) {
  const e = norm(entradaRaw).replace(/\s+/g, '');
  const t = norm(node.titulo || '').replace(/\s+/g, '');
  return e === t || e === t.replace(/^art/, '') || e === 'art' + t || e === 'artigo' + t;
}
function matchByText(node, entrada) {
  const tokens = tokensFromEntrada(entrada);
  if (!tokens.length) return false;
  const corpus = norm(node.texto || '');
  return tokens.every(t => corpus.includes(t));
}
function capitalizeWords(s) {
  return (s || '').split(/[_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function prettyLabelFromCodeId(codeId) {
  // codeId exemplo: "codigo_civil", "codigo_penal", "codigo_cpc"...
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

// ===== Data (com cache-busting) =====
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

// ===== Descoberta automática de códigos =====
async function autoDiscoverCodes() {
  // 1) Tenta listar via GitHub API (público, sem token)
  try {
    const apiUrl = 'https://api.github.com/repos/osvaldosereia/estudo/contents/data';
    const r = await fetch(apiUrl, { cache: 'no-store' });
    if (!r.ok) throw new Error('GitHub API falhou: ' + r.status);
    const items = await r.json();
    const files = (Array.isArray(items) ? items : []).filter(it =>
      it && it.type === 'file' && /^codigo_.+_vademecum\.json$/i.test(it.name)
    );
    const codes = files.map(f => {
      const id = f.name.replace(/_vademecum\.json$/i, ''); // "codigo_civil_vademecum.json" -> "codigo_civil"
      return { id, label: prettyLabelFromCodeId(id), name: f.name };
    });
    if (codes.length) return codes;
    throw new Error('Nenhum arquivo *_vademecum.json encontrado via API.');
  } catch (e) {
    console.warn('[autoDiscoverCodes] API listing falhou:', e.message || e);
  }

  // 2) Fallback: testa presença local de alguns códigos comuns
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

  // 3) Último recurso: deixa só civil se existir
  if (await fileExists('data/codigo_civil_vademecum.json') || await fileExists('data/codigo_civil.json')) {
    return [{ id: 'codigo_civil', label: 'Código Civil' }];
  }

  // nada encontrado
  return [];
}

// ===== Busca com lógica inteligente =====
// Só número -> título; só letras -> texto; misto (número+letra) -> título
async function searchArticle(codeId, entrada) {
  await ensureCodeLoaded(codeId);
  const nodes = state.artigosIndex.slice();

  const entradaNorm = entrada.trim();
  const soNumero = /^\d{1,4}$/.test(entradaNorm);
  const soLetras = /^[a-zA-ZÀ-ÿ\s]{4,}$/.test(entradaNorm);
  const misto = /\d/.test(entradaNorm) && /[a-zA-ZÀ-ÿ]/.test(entradaNorm);

  if (soNumero || misto) {
    const num = onlyDigits(entradaNorm);
    if (num) {
      const hitNum = nodes.find(n => matchByNumber(n, num));
      if (hitNum) return hitNum;
    }
    const hitTitulo = nodes.find(n => matchTituloOuNumero(n, entradaNorm));
    if (hitTitulo) return hitTitulo;
  }

  if (soLetras) {
    const hitText = nodes.find(n => matchByText(n, entradaNorm));
    if (hitText) return hitText;
  }

  return null;
}

// ===== Render =====
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

// ===== Modal de Artigo =====
function renderArticleHTML(node) {
  return `
    <div class="article">
      <div class="art-title">${escapeHTML(node.titulo)}</div>
      <pre class="art-caput" style="white-space:pre-wrap;">${escapeHTML(node.texto)}</pre>
    </div>`;
}
function openArticleModalByIndex(idx) {
  if (idx < 0 || idx >= state.artigosIndex.length) return;
  const node = state.artigosIndex[idx];
  state.artigoAtualIdx = idx;

  appEls.amTitle.textContent = node.titulo;
  appEls.amBody.innerHTML = renderArticleHTML(node);

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

// ===== Prompt =====
function buildMultiPrompt(selecionados) {
  const blocos = selecionados.map(n =>
    `### ${n.titulo}\nTexto integral:\n${n.texto}`
  ).join('\n\n');

  return `Você é um professor de Direito com didática impecável.
Objetivo: Estudo RÁPIDO dos artigos indicados, em linguagem simples.
Para cada artigo: 1) conceito; 2) pontos de prova/OAB; 3) mini exemplo; 4) erro comum.
Finalize com comparação entre os artigos.

Artigos selecionados: ${selecionados.map(n => n.titulo).join(', ')}

${blocos}

💚 direito.love — Gere um novo prompt em https://direito.love`;
}

// ===== Eventos =====
async function onBuscar(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const codeId = appEls.selCodigo.value;
  const entrada = appEls.inpArtigo.value.trim();

  if (!codeId) {
    appEls.resultMsg.textContent = 'Selecione um código antes.';
    return;
  }

  appEls.resultChips.innerHTML = '';
  appEls.resultMsg.textContent = 'Buscando...';

  try {
    const hit = await searchArticle(codeId, entrada);
    appEls.resultChips.innerHTML = '';
    if (!hit) {
      appEls.resultMsg.textContent = 'Artigo não encontrado.';
      return;
    }
    renderResultChip(hit);
    appEls.resultMsg.textContent = '';
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

// ===== Init =====
function bind() {
  ['btnPrev','btnNext','btnIncluir','btnFechar','btnBuscar','btnGerarPrompt','btnClearSel','btnCopiar']
    .forEach(k => appEls[k] && appEls[k].setAttribute('type','button'));

  appEls.btnBuscar.addEventListener('click', onBuscar);
  appEls.btnIncluir.addEventListener('click', onIncluir);
  appEls.btnClearSel.addEventListener('click', onClearSelecionados);
  appEls.btnGerarPrompt.addEventListener('click', onGerarPrompt);
  appEls.btnCopiar.addEventListener('click', onCopiar);

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
