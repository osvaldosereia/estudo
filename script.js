// ===== Estado e helpers =====
const state = {
  codigo: null,
  termoBusca: '',
  artigoAtualIdx: -1,
  artigosIndex: [],
  artigosData: null,
  selecionados: [],
  prompt: ''
};

const CODES = [
  // Códigos
  {id: 'codigo_penal', label: 'Código Penal', group: 'Códigos'},
  {id: 'codigo_civil', label: 'Código Civil', group: 'Códigos'},
  {id: 'cpp', label: 'Código de Processo Penal', group: 'Códigos'},
  {id: 'cpc', label: 'Código de Processo Civil', group: 'Códigos'},
  {id: 'cf', label: 'Constituição Federal', group: 'Códigos'},
  {id: 'cdc', label: 'Código de Defesa do Consumidor', group: 'Códigos'},
  {id: 'clt', label: 'CLT', group: 'Códigos'},
  {id: 'ctn', label: 'Código Tributário Nacional', group: 'Códigos'},

  // Leis (exemplos)
  {id: 'lei_mediacao', label: 'Lei de Mediação (13.140/2015)', group: 'Leis'},
  {id: 'lei_9099', label: 'Lei 9.099/1995 (Juizados)', group: 'Leis'}
];

const FALLBACK = {
  "codigo_penal": {
    "art1": {
      "id": "art1","numero":"1","titulo":"Art. 1º",
      "caput":"Não há crime sem lei anterior que o defina. Não há pena sem prévia cominação legal.",
      "paragrafos": [],"incisos": [],
      "texto":"Não há crime sem lei anterior que o defina. Não há pena sem prévia cominação legal."
    },
    "art2": {
      "id":"art2","numero":"2","titulo":"Art. 2º",
      "caput":"Ninguém pode ser punido por fato que lei posterior deixa de considerar crime, cessando em virtude dela a execução e os efeitos penais da sentença condenatória.",
      "paragrafos":[{"rotulo":"Parágrafo único","texto":"A lei posterior, que de qualquer modo favorecer o agente, aplica-se aos fatos anteriores, ainda que decididos por sentença condenatória transitada em julgado."}],
      "incisos":[],
      "texto":"Ninguém pode ser punido por fato que lei posterior deixa de considerar crime, cessando em virtude dela a execução e os efeitos penais da sentença condenatória.\n\nParágrafo único - A lei posterior, que de qualquer modo favorecer o agente, aplica-se aos fatos anteriores, ainda que decididos por sentença condenatória transitada em julgado."
    }
  }
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
  btnInfo: document.getElementById('btnInfo'),
  btnReset: document.getElementById('btnReset'),
  modalInfo: document.getElementById('modalInfo'),

  modalArtigo: document.getElementById('modalArtigo'),
  amTitle: document.getElementById('amTitle'),
  amBody: document.getElementById('amBody'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnFechar: document.getElementById('btnFechar'),
  btnIncluir: document.getElementById('btnIncluir')
};

// ===== Utils =====
function escapeHTML(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function norm(s){
  return (s||'').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,' ');
}
function onlyDigits(s){ const m = String(s||'').match(/^\d{1,4}$/); return m ? m[0] : null; }
function numeroBase(n){ const m = String(n||'').match(/^(\d{1,4})(?:\s*[-–—]?\s*([A-Za-z]))?$/); return m ? [parseInt(m[1],10), (m[2]||'').toUpperCase()] : [NaN,'']; }
function byNumeroComparator(a,b){
  const [an, ax] = numeroBase(a.numero||'');
  const [bn, bx] = numeroBase(b.numero||'');
  if (an!==bn) return (an||0)-(bn||0);
  if (ax===bx) return 0;
  if (!ax) return -1;
  if (!bx) return 1;
  return ax.localeCompare(bx);
}

// ===== Data =====
async function getJSON(path){
  const r=await fetch(path);
  if(!r.ok) throw new Error(`HTTP ${r.status} ao carregar ${path}`);
  return r.json();
}
async function tryLoadCodeData(codeId){
  const candidates = [
    `data/${codeId}_vademecum.json`,
    `data/${codeId}.json`
  ];
  let lastErr;
  for (const p of candidates){
    try{ return await getJSON(p); } catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('Arquivo de dados não encontrado');
}

async function ensureCodeLoaded(codeId){
  if (state.codigo === codeId && state.artigosData) return;
  state.codigo = codeId;
  try{
    state.artigosData = await tryLoadCodeData(codeId);
  } catch(err){
    if (FALLBACK[codeId]){
      state.artigosData = FALLBACK[codeId];
      console.warn('Usando fallback embutido para', codeId);
    } else {
      state.artigosData = null;
      throw err;
    }
  }
  const nodes = Object.values(state.artigosData);
  nodes.sort(byNumeroComparator);
  state.artigosIndex = nodes;
}

// ===== Render básico =====
function renderCodeSelect(){
  const groups = [...new Set(CODES.map(c=>c.group))];
  selCodigo.innerHTML = groups.map(g=>{
    const opts = CODES.filter(c=>c.group===g)
      .map(c=>`<option value="${c.id}">${escapeHTML(c.label)}</option>`).join('');
    return `<optgroup label="${escapeHTML(g)}">${opts}</optgroup>`;
  }).join('');
  selCodigo.value = state.codigo || 'codigo_penal';
}

function clearResults(){
  appEls.resultChips.innerHTML = '';
  appEls.resultMsg.textContent = '';
}

function renderResultChip(artNode){
  const btn = document.createElement('button');
  btn.className = 'chip';
  btn.textContent = artNode.titulo || `Art. ${artNode.numero||''}`;
  btn.title = 'Abrir artigo';
  btn.addEventListener('click', ()=> openArticleModalByNode(artNode));
  appEls.resultChips.appendChild(btn);
}

function renderSelected(){
  appEls.selectedChips.innerHTML = '';
  state.selecionados.forEach((n, idx)=>{
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${escapeHTML(n.titulo||('Art. '+(n.numero||'')))} <button class="icon-ghost" aria-label="Remover" title="Remover" data-idx="${idx}">×</button>`;
    chip.querySelector('button').addEventListener('click', (e)=>{
      const i = parseInt(e.currentTarget.getAttribute('data-idx'),10);
      state.selecionados.splice(i,1);
      renderSelected();
      updatePromptButtonsState();
    });
    appEls.selectedChips.appendChild(chip);
  });
  appEls.selCount.textContent = `(${state.selecionados.length}/5)`;
}

function updatePromptButtonsState(){
  appEls.btnGerarPrompt.disabled = state.selecionados.length === 0;
}

// ===== Busca =====
function tokensFromEntrada(entrada){
  return norm(entrada).split(/\s+/).filter(t=>t.length>=4);
}
function buildFullText(node){
  const parts=[];
  if(node.caput) parts.push(node.caput);
  if(Array.isArray(node.incisos)) node.incisos.forEach(i=>{
    parts.push(`${i.rom||''} - ${i.texto||''}`);
    if(Array.isArray(i.alineas)) i.alineas.forEach(a=> parts.push(`${a.letra||''}) ${a.texto||''}`));
  });
  if(Array.isArray(node.paragrafos)) node.paragrafos.forEach(p=>{
    parts.push(`${p.rotulo? p.rotulo+' - ' : ''}${p.texto||''}`);
  });
  if(node.texto) parts.push(node.texto);
  return parts.join('\n');
}
function matchByNumber(node, entradaNum){
  const [nb] = numeroBase(node.numero||'');
  return String(nb) === String(entradaNum) && !/[A-Za-z]/.test(node.numero||'');
}
function matchTituloOuNumero(node, entradaRaw){
  const e = norm(entradaRaw).replace(/\s+/g,'');
  const t = norm(node.titulo||'').replace(/\s+/g,'');
  const n = norm(node.numero||'');
  return e===n || e===t || e===('art'+n) || e===('artigo'+n);
}
function matchByText(node, entrada){
  const tokens = tokensFromEntrada(entrada);
  if(!tokens.length) return false;
  const corpus = norm(buildFullText(node));
  return tokens.every(t => corpus.includes(t));
}
async function searchArticle(codeId, entrada){
  await ensureCodeLoaded(codeId);
  const nodes = state.artigosIndex.slice();

  const hitExact = nodes.find(n => matchTituloOuNumero(n, entrada));
  if (hitExact) return hitExact;

  const num = onlyDigits(entrada);
  if(num){
    const hitNum = nodes.find(n => matchByNumber(n, num));
    if(hitNum) return hitNum;
  }
  const hitText = nodes.find(n => matchByText(n, entrada));
  return hitText || null;
}

// ===== Article modal =====
function renderArticleHTML(node){
  const titulo = node?.titulo || `Art. ${node?.numero||''}`;
  const plain = (node?.texto||'').trim();
  if (plain){
    return `
      <div class="article">
        <div class="art-title">${escapeHTML(titulo)}</div>
        <pre style="white-space:pre-wrap;margin:0">${escapeHTML(plain)}</pre>
      </div>
    `;
  }
  const caput = node?.caput || '';
  const incisos = Array.isArray(node?.incisos) ? node.incisos : [];
  const paragrafos = Array.isArray(node?.paragrafos) ? node.paragrafos : [];

  const incisosHTML = incisos.length
    ? `<ol class="art-incisos">
        ${incisos.map(i=>`
          <li>
            <div class="art-inciso-head">${escapeHTML(i.rom||'')} - ${escapeHTML(i.texto||'')}</div>
            ${Array.isArray(i.alineas) && i.alineas.length ? `
              <ul class="art-alineas">
                ${i.alineas.map(a=>`<li><span class="letra">${escapeHTML(a.letra||'')})</span> ${escapeHTML(a.texto||'')}</li>`).join('')}
              </ul>
            ` : ``}
          </li>
        `).join('')}
       </ol>`
    : ``;

  const parsHTML = paragrafos.length
    ? `<div class="art-paragrafos">
        ${paragrafos.map(p=>`
          <div class="art-paragrafo">
            ${p.rotulo ? `<span class="label">${escapeHTML(p.rotulo)}</span> - ` : ``}${escapeHTML(p.texto||'')}
          </div>
        `).join('')}
      </div>`
    : ``;

  return `
    <div class="article">
      <div class="art-title">${escapeHTML(titulo)}</div>
      ${caput ? `<p class="art-caput">${escapeHTML(caput)}</p>` : ``}
      ${incisosHTML}
      ${parsHTML}
    </div>
  `;
}

function indexOfNode(node){
  return state.artigosIndex.findIndex(n => (n.id && node.id && n.id===node.id) || (n.titulo===node.titulo && n.numero===node.numero));
}
function openArticleModalByIndex(idx){
  if (idx<0 || idx>=state.artigosIndex.length) return;
  state.artigoAtualIdx = idx;
  const node = state.artigosIndex[idx];

  appEls.amTitle.textContent = node.titulo || `Art. ${node.numero||''}`;
  appEls.amBody.innerHTML = `<div class="article-box">${renderArticleHTML(node)}</div>`;

  appEls.btnPrev.disabled = (idx<=0);
  appEls.btnNext.disabled = (idx>=state.artigosIndex.length-1);

  const already = state.selecionados.some(s => (s.id && node.id && s.id===node.id) || (s.titulo===node.titulo && s.numero===node.numero));
  appEls.btnIncluir.disabled = already || state.selecionados.length >= 5;
  appEls.btnIncluir.textContent = already ? 'Já incluído' : (state.selecionados.length>=5 ? 'Limite atingido (5)' : 'Incluir no prompt');

  if (!appEls.modalArtigo.open) appEls.modalArtigo.showModal();
}
function openArticleModalByNode(node){
  const idx = indexOfNode(node);
  openArticleModalByIndex(idx>=0 ? idx : 0);
}

// ===== Prompt =====
function codeLabelById(id){ return CODES.find(c=>c.id===id)?.label || 'Código/Lei'; }
function buildMultiPrompt(selecionados, codeId){
  const codeLabel = codeLabelById(codeId);
  const blocos = selecionados.map(n=> {
    const titulo = n.titulo || `Art. ${n.numero||''}`;
    const texto = n.texto || buildFullText(n);
    return `### ${titulo}
Texto integral:
${texto}`;
  }).join('\n\n');

  return `Você é um professor de Direito com didática impecável.
Objetivo: Estudo RÁPIDO e comparado dos artigos indicados, em linguagem simples e direta.
Para CADA artigo, siga este formato:
1) conceito/finalidade; 2) elementos essenciais; 3) pontos que caem em prova/OAB; 4) mini exemplo prático (3–4 linhas); 5) erro comum a evitar.
Ao final, traga uma seção breve com “conexões e distinções entre os artigos”.

Contexto
- Código/Lei: ${codeLabel}
- Artigos selecionados (${selecionados.length}): ${selecionados.map(n=>n.titulo || ('Art. '+(n.numero||''))).join(', ')}

${blocos}

Formato da resposta
- Seções separadas por artigo
- 3 bullets “cai em prova” em cada artigo
- Mini exemplo por artigo (3–4 linhas)
- 1 erro comum por artigo
- Fechar com “Conexões e distinções”

Assine no final: "💚 direito.love — Gere um novo prompt em https://direito.love"`;
}

// ===== Eventos =====
async function onBuscar(){
  const codeId = appEls.selCodigo.value;
  const entrada = appEls.inpArtigo.value.trim();
  appEls.resultChips.innerHTML = '';
  appEls.resultMsg.textContent = 'Buscando…';

  try{
    const hit = await searchArticle(codeId, entrada);
    appEls.resultChips.innerHTML = '';
    if (!hit){
      appEls.resultMsg.textContent = 'Não encontrei esse artigo. Tente só o número (ex.: 121) ou 121-A. Também aceito busca por termos com 4+ letras.';
      return;
    }
    appEls.resultMsg.textContent = '';
    renderResultChip(hit);
  } catch(err){
    console.error(err);
    appEls.resultMsg.innerHTML = `❌ Não consegui carregar os dados para <code>${escapeHTML(codeId)}</code>.
    Verifique se o JSON existe em <code>data/${codeId}_vademecum.json</code> ou <code>data/${codeId}.json</code>.`;
  }
}

function onPrev(e){ e.preventDefault(); if (state.artigoAtualIdx>0) openArticleModalByIndex(state.artigoAtualIdx-1); }
function onNext(e){ e.preventDefault(); if (state.artigoAtualIdx<state.artigosIndex.length-1) openArticleModalByIndex(state.artigoAtualIdx+1); }
function onIncluir(e){
  e.preventDefault();
  const node = state.artigosIndex[state.artigoAtualIdx];
  if (!node) return;
  const exists = state.selecionados.some(s => (s.id && node.id && s.id===node.id) || (s.titulo===node.titulo && s.numero===node.numero));
  if (exists || state.selecionados.length>=5) return;

  state.selecionados.push({
    id: node.id, numero: node.numero, titulo: node.titulo, texto: node.texto || buildFullText(node)
  });
  renderSelected();
  updatePromptButtonsState();

  appEls.btnIncluir.disabled = true;
  appEls.btnIncluir.textContent = 'Incluído ✔';
}
function onClearSelecionados(){
  state.selecionados = [];
  renderSelected();
  updatePromptButtonsState();
  appEls.promptArea.hidden = true;
  appEls.promptBox.textContent = '';
}
function onGerarPrompt(){
  const prompt = buildMultiPrompt(state.selecionados, state.codigo);
  state.prompt = prompt;
  appEls.promptBox.textContent = prompt;
  appEls.promptArea.hidden = false;
}
async function onCopiar(){ try{ await navigator.clipboard.writeText(state.prompt||''); }catch{} }

// ===== Boot =====
function bind(){
  appEls.btnInfo?.addEventListener('click',()=>appEls.modalInfo.showModal());
  appEls.btnReset?.addEventListener('click',()=>{
    appEls.inpArtigo.value=''; clearResults(); onClearSelecionados();
  });
  appEls.btnBuscar.addEventListener('click', onBuscar);
  appEls.inpArtigo.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); onBuscar(); } });

  appEls.btnPrev.addEventListener('click', onPrev);
  appEls.btnNext.addEventListener('click', onNext);
  appEls.btnIncluir.addEventListener('click', onIncluir);
  appEls.btnFechar.addEventListener('click', ()=>{/* fecha via method=dialog */});

  appEls.btnClearSel.addEventListener('click', onClearSelecionados);
  appEls.btnGerarPrompt.addEventListener('click', onGerarPrompt);
  appEls.btnCopiar.addEventListener('click', onCopiar);
}
function start(){ renderCodeSelect(); bind(); state.codigo = appEls.selCodigo.value; }

document.addEventListener('DOMContentLoaded', start);
