// Estado global e helpers
const state = {
  etapa: 0,
  codigo: null,
  artigoNum: null, // mantido por compatibilidade, não usado na busca nova
  termoBusca: '',
  perguntas: [],
  estrategias: [],
  estrategiasPick: [],
  prompt: '',
  artigoTexto: ''   // 👈 novo campo para guardar o texto integral
};

const CODES = [
  {id: 'codigo_penal', label: 'Código Penal'},
  {id: 'codigo_civil', label: 'Código Civil'},
  {id: 'cpp', label: 'Código de Processo Penal'},
  {id: 'cpc', label: 'Código de Processo Civil'},
  {id: 'cf', label: 'Constituição Federal'},
  {id: 'cdc', label: 'Código de Defesa do Consumidor'},
  {id: 'clt', label: 'CLT'},
  {id: 'ctn', label: 'Código Tributário Nacional'}
];

const app = document.querySelector('#app');
const modalInfo = document.querySelector('#modalInfo');

// Persistência
function save(){ localStorage.setItem('chatbot_juridico_state', JSON.stringify(state)); }
function load(){ try{ Object.assign(state, JSON.parse(localStorage.getItem('chatbot_juridico_state'))||{});}catch{} }
function resetAll(){
  Object.assign(state, {etapa:0,codigo:null,artigoNum:null,termoBusca:'',perguntas:[],estrategias:[],estrategiasPick:[],prompt:'',artigoTexto:''});
  app.innerHTML=''; save(); startConversation();
}

// Rolagem inteligente
function autoScroll() {
  const nearBottom = app.scrollHeight - app.scrollTop - app.clientHeight < 100;
  if (nearBottom) {
    app.scrollTo({ top: app.scrollHeight, behavior: 'smooth' });
  }
}

// UI helpers (chat)
function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; }
function pushBot(html){
  const node = el(`<div class="msg bot"><div class="avatar"><img src="icons/robo.png" alt="Bot"></div><div class="bubble">${html}</div></div>`);
  app.appendChild(node); autoScroll();
  return node;
}
function pushUser(text){
  const node = el(`<div class="msg user"><div class="bubble">${text}</div><div class="avatar"><img src="icons/brain.svg" alt="Você"></div></div>`);
  app.appendChild(node); autoScroll();
  return node;
}
function typing(ms=1500){
  const t = el(`<div class="msg bot"><div class="avatar"><img src="icons/robo.png" alt="Bot"></div><div class="bubble"><span class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span></div></div>`);
  app.appendChild(t); autoScroll();
  return new Promise(res=> setTimeout(()=>{ t.remove(); res(); }, ms));
}

// Data
async function getJSON(path){ const r=await fetch(path); if(!r.ok) throw new Error('Falha ao carregar '+path); return r.json(); }
async function loadEstrategias(){ if(state.estrategias.length) return; state.estrategias = await getJSON('estrategias.json'); }
async function loadCodeData(codeId){ return getJSON(`data/${codeId}.json`); }

// ---------- BUSCA INTELIGENTE ----------
function normalizarEntrada(str) {
  return (str||'').toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]/g, "");
}
function matchTitulo(nodeTitulo, entrada) {
  const tNorm = normalizarEntrada(nodeTitulo);
  const eNorm = "artigo" + normalizarEntrada(entrada);
  return tNorm === eNorm;
}
function matchTexto(nodeTexto, entrada) {
  const palavras = (entrada||'').trim().split(/\s+/);
  if (palavras.length === 0 || palavras.length > 3) return false;
  const validas = palavras.filter(p => p.length >= 4).map(normalizarEntrada);
  if (!validas.length) return false;
  const textoNorm = normalizarEntrada(nodeTexto||'');
  return validas.every(v => textoNorm.includes(v));
}
async function searchByArticleOrText(codeId, entrada) {
  const data = await loadCodeData(codeId);
  for (const [key, node] of Object.entries(data)) {
    if (matchTitulo(node.titulo, entrada)) {
      return { artigo: key, node, perguntas: node.perguntas.map(q => ({ codigo: codeId, artigo: key, texto: q })) };
    }
  }
  const palavras = (entrada||'').trim().split(/\s+/);
  if (palavras.length <= 3) {
    for (const [key, node] of Object.entries(data)) {
      if (matchTexto(node.texto||'', entrada)) {
        return { artigo: key, node, perguntas: node.perguntas.map(q => ({ codigo: codeId, artigo: key, texto: q })) };
      }
    }
  }
  return { artigo:null, node:null, perguntas:[] };
}
// ---------- FIM BUSCA INTELIGENTE ----------

// Flow
async function startConversation(){
  await typing(2000);
  pushBot(`<h4>Olá! qui eu te ajudo a estudar os artigos dos códigos.</h4>`);
  await typing(1500);
  pushBot(`<p>O tema do estudo faz parte de qual <b>Código?</b></p>`);
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
    <p>Digite o número ou até 3 palavras do texto do artigo.</p>
    <div class="input-row">
      <input id="inpBusca" class="input" placeholder="Ex.: 121, 121-A, ou 2–3 palavras" aria-label="Número do artigo ou até 3 palavras-chave" />
      <button id="btnBuscar" class="button">Buscar</button>
    </div>
  </div>`);
  node.querySelector('#btnBuscar').addEventListener('click', async ()=>{
    const v = node.querySelector('#inpBusca').value.trim();
    if(!v) return;
    pushUser(v);
    state.artigoNum = null;
    state.termoBusca = v;
    save();
    await doSearch();
  });
}

async function doSearch(){
  await typing(1000);
  let results = { artigo:null, node:null, perguntas:[] };
  const entrada = state.termoBusca || (state.artigoNum ? String(state.artigoNum) : "");
  if (state.codigo && entrada) {
    results = await searchByArticleOrText(state.codigo, entrada);
  }
  state.perguntas = results.perguntas.map(r=>r.texto);
  state.artigoTexto = results.node?.texto || ''; // 👈 salva o texto integral
  save();

  if (!results.perguntas.length){
    pushBot(`Não encontrei nada com esse termo. Tente um número de artigo (ex.: 121, 121-A) ou 2–3 palavras mais específicas 🙂`);
    return;
  }

  pushBot(`Selecionei <b>${results.perguntas.length}</b> tópicos essenciais que farão parte do seu prompt:`);

  const rows = state.perguntas.map((q,i)=>`
    <div class="qrow">
      <div class="qtext">${i+1}. ${q}</div>
    </div>`).join('');

  const group = el(`<div class="msg bot"><div class="avatar"><img src="icons/robo.png" alt="Bot"></div><div class="bubble"><div class="qgroup">${rows}</div></div></div>`);
  app.appendChild(group); autoScroll();

  const footer = pushBot(`<div class="group"><button class="chip" id="btnProximo">Continuar ▶</button></div>`);
  footer.querySelector('#btnProximo').addEventListener('click', gotoEstrategias);
}

async function gotoEstrategias(){
  await typing(800);
  await loadEstrategias();
  const grid = state.estrategias.map(es=>`<button class="chip" data-id="${es.id}">${es.titulo}</button>`).join('');
  const node = pushBot(`<div><h4>Selecione as estratégias de estudo:</h4><div class="group" id="estrategias">${grid}</div>
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
  const codeLabel = (CODES.find(c=>c.id===state.codigo)?.label)||'Código';
  const entrada = state.termoBusca || (state.artigoNum ? `Artigo ${state.artigoNum}` : '(não informado)');
  const blocoPerguntas = state.perguntas.map((q,i)=>`${i+1}. ${q}`).join('\n');
  const escolhidas = state.estrategias.filter(e => state.estrategiasPick.includes(e.id));
  const blocoEstrategias = escolhidas.map(e=>`- ${e.titulo}: ${e.instrucao}`).join('\n');

  state.prompt =
`Você é um professor de Direito com didática impecável. Ajude-me a estudar o tema conforme as perguntas listadas e o contexto abaixo.

Contexto:
- Código: ${codeLabel}
- Entrada do usuário: ${entrada}
- Texto do artigo: ${state.artigoTexto || '(não disponível)'}

Perguntas (organize e responda de forma didática, com exemplos curtos):
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
  try{ await navigator.clipboard.writeText(state.prompt);}catch{}
  await typing(700);
  pushBot(`Prontinho! Seu prompt foi copiado. Agora escolha uma IA para abrir 👇`);
  await typing(700);

  pushBot(`<div class="group">
    <a class="chip" href="https://chatgpt.com/" target="_blank" rel="noopener">ChatGPT</a>
    <a class="chip" href="https://gemini.google.com/app" target="_blank" rel="noopener">Gemini</a>
    <a class="chip" href="https://www.perplexity.ai/" target="_blank" rel="noopener">Perplexity</a>
    <a class="chip" href="https://copilot.microsoft.com/" target="_blank" rel="noopener">Copilot</a>
    <a class="chip" href="https://claude.ai/" target="_blank" rel="noopener">Claude</a>
    <a class="chip" href="https://notebooklm.google/" target="_blank" rel="noopener">NotebookLM</a>
  </div>`);

  await typing(700);
  const again = pushBot(`<button class="button secondary" id="btnReiniciarChat">Reiniciar conversa</button>`);
  document.getElementById('btnReiniciarChat').addEventListener('click', resetAll);
}

// Eventos globais
document.addEventListener('DOMContentLoaded', ()=>{
  load();
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

  startConversation();
});
