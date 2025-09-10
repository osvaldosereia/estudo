// Estado global simples
const state = {
  etapa: 0,
  codigo: null,         // ex: 'codigo_penal'
  artigoNum: null,      // ex: 121
  termoBusca: '',       // palavras-chave
  perguntas: [],        // lista exibida
  selecionadas: [],     // perguntas escolhidas
  estrategias: [],      // carregadas do estrategias.json
  estrategiasPick: [],  // selecionadas
  prompt: ''
};

const CODES = [
  {id: 'codigo_penal', label: 'Código Penal (CP)'},
  {id: 'codigo_civil', label: 'Código Civil (CC)'},
  {id: 'cpp', label: 'Código de Processo Penal (CPP)'},
  {id: 'cpc', label: 'Código de Processo Civil (CPC)'},
  {id: 'cf', label: 'Constituição Federal (CF)'},
  {id: 'cdc', label: 'Código de Defesa do Consumidor (CDC)'},
  {id: 'clt', label: 'CLT'},
  {id: 'ctn', label: 'Código Tributário Nacional (CTN)'}
];

const el = (sel) => document.querySelector(sel);
const app = el('#app');
const modalIAs = el('#modalIAs');

// Utilidades ------------------------------
function save() {
  localStorage.setItem('chatbot_juridico_state', JSON.stringify(state));
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('chatbot_juridico_state'));
    if (s) Object.assign(state, s);
  } catch {}
}
function resetAll() {
  Object.assign(state, {
    etapa: 0, codigo: null, artigoNum: null, termoBusca: '',
    perguntas: [], selecionadas: [], estrategias: [], estrategiasPick: [], prompt: ''
  });
  save();
  render();
}

function msgBot(html) {
  return `<div class="msg bot"><div class="avatar">🤖</div><div class="bubble">${html}</div></div>`;
}
function msgUser(html) {
  return `<div class="msg user"><div class="avatar">👤</div><div class="bubble">${html}</div></div>`;
}
function chip(id, label, selected=false) {
  return `<button class="chip" data-id="${id}" data-selected="${selected}">${label}</button>`;
}

function extractArticleNumber(input) {
  // aceita no máximo 4 dígitos; ignora pontuação; prioriza primeiras 5 palavras
  const cleaned = input.replace(/[.,;/\-_|]/g, ' ').trim();
  const parts = cleaned.split(/\s+/).slice(0,5);
  for (const p of parts) {
    const m = p.match(/^\d{1,4}$/);
    if (m) return parseInt(m[0],10);
  }
  return null;
}

function tokenizeTerms(s) {
  return (s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\w\s]/g,' ')
    .split(/\s+/)
    .filter(t=>t && (t.length>=3 || /^[A-Z]{2,4}$/.test(t)));
}

// Data -----------------------------------
async function getJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('Falha ao carregar ' + path);
  return res.json();
}

async function loadEstrategias() {
  if (state.estrategias?.length) return;
  state.estrategias = await getJSON('estrategias.json');
}

async function loadCodeData(codeId) {
  return getJSON(`data/${codeId}.json`);
}

async function searchByArticle(codeId, articleNum) {
  const data = await loadCodeData(codeId);
  const key = `art${articleNum}`;
  const node = data[key];
  if (!node) return [];
  return node.perguntas.map(q=>({codigo: codeId, artigo: key, titulo: node.titulo, texto: q}));
}

async function searchByKeywords(terms) {
  // Busca em TODOS os códigos por perguntas que contenham TODAS as palavras
  const results = [];
  for (const c of CODES) {
    try {
      const data = await loadCodeData(c.id);
      for (const [art, node] of Object.entries(data)) {
        for (const q of node.perguntas) {
          const hay = q.toLowerCase();
          if (terms.every(t=>hay.includes(t))) {
            results.push({codigo: c.id, artigo: art, titulo: node.titulo, texto: q});
          }
        }
      }
    } catch(e) {
      // arquivo pode não existir ainda; ignora
    }
  }
  return results;
}

// Renderização por etapas -----------------
function render() {
  app.innerHTML = '';

  // Etapa 0 — Boas-vindas
  if (state.etapa === 0) {
    app.innerHTML += msgBot(`<h3>Bem-vindo! Vamos turbinar seu estudo com IA 📚</h3>
      <p class="small">Sou um chatbot gerador de <b>perguntas inteligentes</b> e um <b>prompt perfeito</b> no final.</p>`);

    const chips = CODES.map(c => chip(c.id, c.label)).join('');
    app.innerHTML += msgBot(`<div class="card"><h3>Qual código vamos estudar?</h3><div class="group" id="codes">${chips}</div></div>`);

    // eventos de seleção do código
    app.querySelectorAll('#codes .chip').forEach(btn=>{
      btn.addEventListener('click', () => {
        state.codigo = btn.getAttribute('data-id');
        state.etapa = 1;
        save();
        render();
      });
    });
    return;
  }

  // Etapa 1 — Confirmação do código + input artigo/termo
  if (state.etapa === 1) {
    const codeLabel = CODES.find(c=>c.id===state.codigo)?.label || 'Código';
    app.innerHTML += msgBot(`<p>Perfeito! Vamos de <b>${codeLabel}</b>. Agora me diga:</p>`);
    const html = `<div class="card">
      <h3>Qual artigo (número) ou palavra‑chave?</h3>
      <div class="input-row">
        <input id="inpBusca" class="input" placeholder="Ex.: 121  •  ou  homicídio qualificado" aria-label="Número do artigo ou palavra-chave" />
        <button id="btnBuscar" class="button">Buscar</button>
        <button id="btnVoltar" class="button secondary">Voltar</button>
      </div>
      <p class="small">Dica: número → busca no ${codeLabel}; palavra‑chave → busca em todos os Códigos.</p>
    </div>`;
    app.innerHTML += msgBot(html);

    el('#btnVoltar').onclick = ()=>{ state.etapa=0; save(); render(); };
    el('#btnBuscar').onclick = async ()=>{
      const v = el('#inpBusca').value.trim();
      if (!v) return;
      const art = extractArticleNumber(v);
      state.artigoNum = art;
      state.termoBusca = art ? '' : v;
      app.innerHTML += msgUser(`<p>${v}</p>`);
      await doSearch();
    };
    return;
  }

  // Etapa 2 — Lista de perguntas
  if (state.etapa === 2) {
    if (state.perguntas.length === 0) {
      app.innerHTML += msgBot(`<div class="card"><h3>Nada encontrado 😕</h3>
        <p class="small">Tente outro número de artigo ou palavras mais específicas.</p>
        <div class="controls">
          <button class="button secondary" id="btnTentar">Tentar novamente</button>
        </div></div>`);
      el('#btnTentar').onclick = ()=>{ state.etapa=1; save(); render(); };
      return;
    }

    const list = state.perguntas.map((it,idx)=>{
      const chosen = state.selecionadas.includes(it.texto);
      return `<div class="item" data-index="${idx}" data-selected="${chosen}">
        <div>
          <div class="small">${it.titulo}</div>
          <div>${it.texto}</div>
        </div>
        <button class="add" aria-label="Alternar seleção"> ${chosen? 'Remover' : 'Adicionar'} </button>
      </div>`;
    }).join('');

    app.innerHTML += msgBot(`<div class="card">
      <h3>Selecione as perguntas que deseja incluir no seu prompt</h3>
      <div class="list" id="listaPerguntas">${list}</div>
      <div class="controls">
        <button class="button secondary" id="btnVoltarBusca">Voltar</button>
        <button class="button" id="btnProximo" ${state.selecionadas.length? '' : 'disabled'}>Próximo</button>
      </div>
      <p class="small">Selecionadas: <b id="countSel">${state.selecionadas.length}</b></p>
    </div>`);

    app.querySelectorAll('#listaPerguntas .item').forEach(node => {
      const idx = +node.getAttribute('data-index');
      node.querySelector('.add').addEventListener('click', () => {
        const text = state.perguntas[idx].texto;
        const i = state.selecionadas.indexOf(text);
        if (i>=0) {
          state.selecionadas.splice(i,1);
          node.setAttribute('data-selected','false');
          node.querySelector('.add').textContent = 'Adicionar';
        } else {
          state.selecionadas.push(text);
          node.setAttribute('data-selected','true');
          node.querySelector('.add').textContent = 'Remover';
        }
        el('#countSel').textContent = state.selecionadas.length;
        el('#btnProximo').disabled = state.selecionadas.length===0;
        save();
      });
    });

    el('#btnVoltarBusca').onclick = ()=>{ state.etapa=1; save(); render(); };
    el('#btnProximo').onclick = async ()=>{
      await loadEstrategias();
      state.etapa = 3;
      save();
      render();
    };
    return;
  }

  // Etapa 3 — Estratégias
  if (state.etapa === 3) {
    const grid = state.estrategias.map(es => chip(es.id, es.titulo)).join('');
    app.innerHTML += msgBot(`<div class="card">
      <h3>Quer adicionar alguma estratégia de estudo?</h3>
      <div class="group" id="estrategias">${grid}</div>
      <div class="controls">
        <button class="button secondary" id="btnVoltarPerguntas">Voltar</button>
        <button class="button" id="btnGerar">Gerar Prompt</button>
      </div>
    </div>`);

    const map = new Map();
    state.estrategias.forEach(es=> map.set(es.id, es));
    app.querySelectorAll('#estrategias .chip').forEach(btn=>{
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const i = state.estrategiasPick.indexOf(id);
        if (i>=0) state.estrategiasPick.splice(i,1);
        else state.estrategiasPick.push(id);
        btn.dataset.selected = state.estrategiasPick.includes(id);
        save();
      });
    });

    el('#btnVoltarPerguntas').onclick = ()=>{ state.etapa=2; save(); render(); };
    el('#btnGerar').onclick = ()=>{
      const codeLabel = CODES.find(c=>c.id===state.codigo)?.label || 'Código';
      const blocoPerguntas = state.selecionadas.map((q,i)=>`${i+1}. ${q}`).join('\n');
      const escolhidas = state.estrategias.filter(e => state.estrategiasPick.includes(e.id));
      const blocoEstrategias = escolhidas.map(e=>`- ${e.titulo}: ${e.instrucao}`).join('\n');

      state.prompt =
`Você é um professor de Direito com didática impecável. Ajude-me a estudar o tema conforme as perguntas selecionadas e o contexto abaixo.

Contexto:
- Código: ${codeLabel}
- Entrada do usuário: ${state.artigoNum? 'Artigo ' + state.artigoNum : state.termoBusca}

Perguntas selecionadas (organize e responda de forma didática, com exemplos curtos):
${blocoPerguntas || '(nenhuma)'}

${escolhidas.length ? 'Estratégias de estudo adicionais (aplique de forma integrada):\n' + blocoEstrategias : ''}

Regras: linguagem simples, sem juridiquês excessivo; quando possível, traga entendimento doutrinário majoritário e prática forense. Ao final, inclua um checklist enxuto de revisão.`;

      state.etapa = 4;
      save();
      render();
    };
    return;
  }

  // Etapa 4 — Prompt final
  if (state.etapa === 4) {
    app.innerHTML += msgBot(`<div class="card">
      <h3>Seu Prompt</h3>
      <div class="prompt-box" id="promptBox"></div>
      <div class="controls">
        <button class="button secondary" id="btnVoltarEstrategias">Voltar</button>
        <button class="button" id="btnCopiar">Copiar</button>
      </div>
      <p class="small">Depois de copiar, escolha a IA abaixo para colar e começar os estudos.</p>
    </div>`);
    el('#promptBox').textContent = state.prompt;
    el('#btnVoltarEstrategias').onclick = ()=>{ state.etapa=3; save(); render(); };
    el('#btnCopiar').onclick = async ()=>{
      try {
        await navigator.clipboard.writeText(state.prompt);
      } catch {}
      modalIAs.showModal();
    };
    return;
  }
}

async function doSearch() {
  app.innerHTML += msgBot(`<div class="small">Buscando opções…</div>`);
  let results = [];
  if (state.artigoNum) {
    results = await searchByArticle(state.codigo, state.artigoNum);
  } else {
    const terms = tokenizeTerms(state.termoBusca);
    results = await searchByKeywords(terms);
  }
  state.perguntas = results;
  state.selecionadas = [];
  state.etapa = 2;
  save();
  render();
}

// Eventos globais -------------------------
document.addEventListener('DOMContentLoaded', () => {
  load();
  render();
  document.getElementById('btnReset').addEventListener('click', resetAll);
  document.getElementById('btnReiniciar').addEventListener('click', (e)=>{
    e.preventDefault(); modalIAs.close(); resetAll();
  });

  // PWA install
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('btnInstall').classList.remove('hidden');
  });
  document.getElementById('btnInstall').addEventListener('click', async ()=>{
    if (!window.deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') document.getElementById('btnInstall').classList.add('hidden');
    deferredPrompt = null;
  });
});
