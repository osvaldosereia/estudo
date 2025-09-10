// Estado global e helpers
const state = {
  etapa: 0,
  codigo: null,
  artigoNum: null,
  termoBusca: '',
  perguntas: [],
  selecionadas: [],
  estrategias: [],
  estrategiasPick: [],
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

const app = document.querySelector('#app');
const modalInfo = document.querySelector('#modalInfo');

// Persistência
function save(){ localStorage.setItem('chatbot_juridico_state', JSON.stringify(state)); }
function load(){ try{ Object.assign(state, JSON.parse(localStorage.getItem('chatbot_juridico_state'))||{});}catch{} }
function resetAll(){
  Object.assign(state, {etapa:0,codigo:null,artigoNum:null,termoBusca:'',perguntas:[],selecionadas:[],estrategias:[],estrategiasPick:[],prompt:''});
  app.innerHTML=''; save(); startConversation();
}

// UI helpers (chat)
function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; }
function pushBot(html){
  const node = el(`<div class="msg bot"><div class="avatar">🤖</div><div class="bubble">${html}</div></div>`);
  app.appendChild(node); app.scrollTo({top: app.scrollHeight, behavior:'smooth'});
  return node;
}
function pushUser(text){
  const node = el(`<div class="msg user"><div class="bubble">${text}</div><div class="avatar"><img src="icons/brain.svg" alt="Você"></div></div>`);
  app.appendChild(node); app.scrollTo({top: app.scrollHeight, behavior:'smooth'});
  return node;
}
function typing(ms=1500){
  const t = el(`<div class="msg bot"><div class="avatar">🤖</div><div class="bubble"><span class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span></div></div>`);
  app.appendChild(t); app.scrollTo({top: app.scrollHeight, behavior:'smooth'});
  return new Promise(res=> setTimeout(()=>{ t.remove(); res(); }, ms));
}
function scrollTop(){ window.scrollTo({top:0, behavior:'smooth'}); app.scrollTo({top:0, behavior:'smooth'}); }

// Icons for tiny buttons
function iconPlus(){ return `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`; }
function iconCheck(){ return `<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>`; }

// Data
async function getJSON(path){ const r=await fetch(path); if(!r.ok) throw new Error('Falha ao carregar '+path); return r.json(); }
async function loadEstrategias(){ if(state.estrategias.length) return; state.estrategias = await getJSON('estrategias.json'); }
async function loadCodeData(codeId){ return getJSON(`data/${codeId}.json`); }

async function searchByArticle(codeId, articleNum) {
  const data = await loadCodeData(codeId);
  const key = `art${articleNum}`;
  const node = data[key];
  if (!node) return [];
  return node.perguntas.map(q=>({codigo: codeId, artigo: key, texto: q}));
}
function tokenizeTerms(s){
  return (s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\w\s]/g,' ')
    .split(/\s+/).filter(t=>t && (t.length>=3 || /^[A-Z]{2,4}$/.test(t)));
}
async function searchByKeywords(terms){
  const results = [];
  for (const c of CODES) {
    try {
      const data = await loadCodeData(c.id);
      for (const [art, node] of Object.entries(data)) {
        for (const q of node.perguntas) {
          const hay = q.toLowerCase();
          if (terms.every(t=>hay.includes(t))) {
            results.push({codigo:c.id, artigo:art, texto:q});
          }
        }
      }
    } catch {}
  }
  return results;
}
function extractArticleNumber(input){
  const cleaned = input.replace(/[.,;/\-_|]/g, ' ').trim();
  const parts = cleaned.split(/\s+/).slice(0,5);
  for (const p of parts) {
    const m = p.match(/^\d{1,4}$/);
    if (m) return parseInt(m[0],10);
  }
  return null;
}

// Flow
async function startConversation(){
  await typing(2000);
  pushBot(`<h3>Oi! Eu sou seu assistente de estudos jurídicos.</h3><p class="small">Vou te guiar passo a passo, sem juridiquês.</p>`);
  await typing(1500);
  pushBot(`<p>Primeiro, escolha um <b>Código brasileiro</b> para estudarmos.</p>`);
  await typing(1500);
  renderCodeChips();
  state.etapa = 0; save();
}

function renderCodeChips(){
  const chips = CODES.map(c=>`<button class="chip" data-id="${c.id}">${c.label}</button>`).join('');
  const node = pushBot(`<div class="group" id="codes">${chips}</div>`);
  node.querySelectorAll('.chip').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.codigo = btn.getAttribute('data-id'); save();
      onCodePicked();
    });
  });
}

async function onCodePicked(){
  const label = CODES.find(c=>c.id===state.codigo)?.label || 'Código';
  await typing(800);
  pushBot(`Excelente! Vamos de <b>${label}</b>.`);
  await typing(800);
  renderSearchInput(label);
  state.etapa = 1; save();
}

function renderSearchInput(label){
  const node = pushBot(`<div>
    <p>Agora me diga: <b>número do artigo</b> ou <b>palavra‑chave</b>.</p>
    <div class="input-row">
      <input id="inpBusca" class="input" placeholder="Ex.: 121  •  ou  homicídio qualificado" aria-label="Número do artigo ou palavra-chave" />
      <button id="btnBuscar" class="button">Buscar</button>
    </div>
    <p class="small">Dica: número → busco no ${label}; palavra‑chave → busco em todos os Códigos.</p>
  </div>`);
  node.querySelector('#btnBuscar').addEventListener('click', async ()=>{
    const v = node.querySelector('#inpBusca').value.trim();
    if(!v) return;
    pushUser(v);
    const art = extractArticleNumber(v);
    state.artigoNum = art;
    state.termoBusca = art? '' : v;
    save();
    await doSearch();
  });
}

async function doSearch(){
  await typing(1000);
  let results = [];
  if (state.artigoNum) results = await searchByArticle(state.codigo, state.artigoNum);
  else results = await searchByKeywords(tokenizeTerms(state.termoBusca));
  state.perguntas = results;
  state.selecionadas = [];
  save();

  if (!results.length){
    pushBot(`Não encontrei nada com esse termo. Tenta outro número de artigo ou palavras mais específicas 🙂`);
    return;
  }
  pushBot(`Achei <b>${results.length}</b> sugestões de perguntas. Selecione as que quiser:`);
  for (let i=0;i<results.length;i++){
    const q = results[i].texto;
    const msg = el(`<div class="msg bot"><div class="avatar">🤖</div>
      <div class="bubble">
        <div class="qrow">
          <div class="qtext">${q}</div>
          <button class="tiny-btn" data-i="${i}" data-role="toggle" title="Incluir">${iconPlus()}</button>
        </div>
      </div></div>`);
    app.appendChild(msg);
    const btn = msg.querySelector('[data-role="toggle"]');
    btn.addEventListener('click', ()=> togglePergunta(q, btn, msg));
  }
  renderSelecionadasFooter();
}

function togglePergunta(text, btn, msgNode){
  const i = state.selecionadas.indexOf(text);
  if (i>=0){
    state.selecionadas.splice(i,1);
    btn.innerHTML = iconPlus();
    btn.dataset.on = "false";
    msgNode.querySelector('.bubble').style.outline='none';
  } else {
    state.selecionadas.push(text);
    btn.innerHTML = iconCheck();
    btn.dataset.on = "true";
    msgNode.querySelector('.bubble').style.outline='2px solid var(--brand)';
  }
  updateSelecionadasFooter();
  save();
}

let footerNode = null;
function renderSelecionadasFooter(){
  footerNode = pushBot(`<div id="selFooter">
    <p class="small">Selecionadas: <b id="countSel">0</b></p>
    <div class="group">
      <button class="chip" id="btnProximo" disabled>Próximo ▶</button>
    </div>
  </div>`);
  footerNode.querySelector('#btnProximo').addEventListener('click', gotoEstrategias);
}
function updateSelecionadasFooter(){
  if (!footerNode) return;
  footerNode.querySelector('#countSel').textContent = state.selecionadas.length;
  footerNode.querySelector('#btnProximo').disabled = state.selecionadas.length===0;
}

async function gotoEstrategias(){
  scrollTop();
  await typing(800);
  await loadEstrategias();
  const grid = state.estrategias.map(es=>`<button class="chip" data-id="${es.id}">${es.titulo}</button>`).join('');
  const node = pushBot(`<div><h4>Quer adicionar alguma estratégia de estudo?</h4><div class="group" id="estrategias">${grid}</div>
    <div style="margin-top:6px"><button class="button" id="btnGerar">Gerar Prompt</button></div></div>`);
  node.querySelectorAll('#estrategias .chip').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-id');
      const i = state.estrategiasPick.indexOf(id);
      if (i>=0) state.estrategiasPick.splice(i,1); else state.estrategiasPick.push(id);
      btn.dataset.selected = state.estrategiasPick.includes(id);
      save();
    });
  });
  node.querySelector('#btnGerar').addEventListener('click', ()=> gerarPrompt());
}

function gerarPrompt(){
  scrollTop();
  const codeLabel = (CODES.find(c=>c.id===state.codigo)?.label)||'Código';
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

  save();
  const node = pushBot(`<div>
    <h4>Seu Prompt</h4>
    <div class="prompt-box" id="promptBox"></div>
    <div style="margin-top:8px">
      <button class="button" id="btnCopiar">Copiar</button>
    </div>
  </div>`);
  node.querySelector('#promptBox').textContent = state.prompt;
  node.querySelector('#btnCopiar').addEventListener('click', onCopied);
}

async function onCopied(){
  scrollTop();
  try{ await navigator.clipboard.writeText(state.prompt);}catch{}
  await typing(700);
  pushBot(`Prontinho! Seu prompt foi copiado. Agora escolha uma IA para abrir 👇`);
  await typing(700);
  const grid = el(`<div class="msg bot"><div class="avatar">🤖</div><div class="bubble">
    <div class="group">
      <a class="chip" href="https://chatgpt.com/" target="_blank" rel="noopener">ChatGPT</a>
      <a class="chip" href="https://gemini.google.com/app" target="_blank" rel="noopener">Gemini</a>
      <a class="chip" href="https://www.perplexity.ai/" target="_blank" rel="noopener">Perplexity</a>
      <a class="chip" href="https://copilot.microsoft.com/" target="_blank" rel="noopener">Copilot</a>
      <a class="chip" href="https://claude.ai/" target="_blank" rel="noopener">Claude</a>
      <a class="chip" href="https://notebooklm.google/" target="_blank" rel="noopener">NotebookLM</a>
    </div>
  </div></div>`);
  app.appendChild(grid);
  app.scrollTo({top: app.scrollHeight, behavior:'smooth'});
  await typing(700);
  const again = el(`<div class="msg bot"><div class="avatar">🤖</div><div class="bubble">
    <button class="button secondary" id="btnReiniciarChat">Reiniciar conversa</button>
  </div></div>`);
  app.appendChild(again);
  document.getElementById('btnReiniciarChat').addEventListener('click', resetAll);
}

// Eventos globais
document.addEventListener('DOMContentLoaded', ()=>{
  load();
  // Topbar
  document.getElementById('btnReset').addEventListener('click', resetAll);
  document.getElementById('btnInfo').addEventListener('click', ()=> modalInfo.showModal());

  // PWA install minimal
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('btnInstall').disabled = false;
  });
  document.getElementById('btnInstall').addEventListener('click', async ()=>{
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });

  // Start (append-only flow)
  startConversation();
});
