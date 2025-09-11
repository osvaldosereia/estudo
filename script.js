// Estado global e helpers
const state = {
  etapa: 0,
  codigo: null,
  artigoNum: null,
  termoBusca: '',
  perguntas: [],
  estrategias: [],
  estrategiasPick: [],
  prompt: '',
  artigoTexto: '',
  artigoTitulo: ''
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
  Object.assign(state, {etapa:0,codigo:null,artigoNum:null,termoBusca:'',perguntas:[],estrategias:[],estrategiasPick:[],prompt:'',artigoTexto:'',artigoTitulo:''});
  app.innerHTML=''; save(); startConversation();
}

// UI helpers
function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; }
function pushBot(html){
  const node = el(`<div class="msg bot"><div class="avatar"><img src="icons/robo.png" alt="Bot"></div><div class="bubble">${html}</div></div>`);
  app.appendChild(node); app.scrollTo({ top: app.scrollHeight, behavior: 'smooth' });
  return node;
}
function pushUser(text){
  const node = el(`<div class="msg user"><div class="bubble">${text}</div><div class="avatar"><img src="icons/brain.svg" alt="Você"></div></div>`);
  app.appendChild(node); app.scrollTo({ top: app.scrollHeight, behavior: 'smooth' });
  return node;
}
function typing(ms=1200){
  const t = el(`<div class="msg bot"><div class="avatar"><img src="icons/robo.png" alt="Bot"></div><div class="bubble"><span class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span></div></div>`);
  app.appendChild(t);
  return new Promise(res=> setTimeout(()=>{ t.remove(); res(); }, ms));
}

// Data
async function getJSON(path){ const r=await fetch(path); if(!r.ok) throw new Error('Falha ao carregar '+path); return r.json(); }
async function loadCodeData(codeId){ return getJSON(`data/${codeId}.json`); }

// Busca
function normalizarEntrada(str) {
  return (str||'').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
}
function matchTitulo(nodeTitulo, entrada){
  const t=normalizarEntrada(nodeTitulo), e=normalizarEntrada(entrada);
  return t===e || t==="artigo"+e || ("artigo"+t)===e;
}
function matchTexto(nodeTexto, entrada){
  const palavras=(entrada||'').trim().split(/\s+/).filter(p=>p.length>=4);
  if(!palavras.length) return false;
  const textoNorm=normalizarEntrada(nodeTexto||'');
  return palavras.every(v=>textoNorm.includes(v));
}
async function searchByArticleOrText(codeId, entrada){
  const data=await loadCodeData(codeId);
  for(const [key,node] of Object.entries(data)) if(matchTitulo(node.titulo,entrada)) return { artigo:key, node, perguntas:(node.perguntas||[]).map(q=>({codigo:codeId,artigo:key,texto:q})) };
  for(const [key,node] of Object.entries(data)) if(matchTexto(node.texto||'',entrada)) return { artigo:key, node, perguntas:(node.perguntas||[]).map(q=>({codigo:codeId,artigo:key,texto:q})) };
  return { artigo:null,node:null,perguntas:[] };
}

// Conversa inicial (mantida)
async function startConversation(){
  await typing(800); pushBot(`<p>Olá! Eu te ajudo a estudar os <b>artigos dos códigos</b>.</p>`);
  await typing(800); pushBot(`<p>O tema do estudo faz parte de qual <b>Código?</b></p>`);
  renderCodeChips(); state.etapa=0; save();
}
function renderCodeChips(){
  const chips=CODES.map(c=>`<button class="chip" data-id="${c.id}">${c.label}</button>`).join('');
  const node=pushBot(`<div class="group" id="codes">${chips}</div>`);
  node.querySelectorAll('.chip').forEach(btn=>btn.addEventListener('click',()=>{ state.codigo=btn.getAttribute('data-id'); save(); onCodePicked(); }));
}
async function onCodePicked(){
  const label=CODES.find(c=>c.id===state.codigo)?.label||'Código';
  await typing(600); pushBot(`Excelente! Vamos de <b>${label}</b>.`);
  await typing(600); renderSearchInput(label); state.etapa=1; save();
}
function renderSearchInput(label){
  const node=pushBot(`
    <div>
      <p>Digite o <b>número do artigo</b>.</p>
      <div class="input-row">
        <input id="inpBusca" class="input" inputmode="numeric" pattern="[0-9]*" placeholder="Ex.: 121" />
        <button id="btnBuscar" class="button">Buscar</button>
      </div>
    </div>`);
  node.querySelector('#btnBuscar').addEventListener('click',async()=>{
    const v=node.querySelector('#inpBusca').value.trim(); if(!v) return;
    pushUser(v); state.termoBusca=v; save(); await doSearch();
  });
}

// -------- NOVO FLUXO: VADE MECUM → MOSTRAR ARTIGO → PROMPT RÁPIDO --------
function escapeHTML(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

function showArticle(node){
  const titulo = node?.titulo || 'Artigo';
  const texto = node?.texto || '(texto não disponível)';
  state.artigoTitulo = titulo;
  state.artigoTexto  = texto;
  save();
  pushBot(`<div><h4>${escapeHTML(titulo)}</h4><div class="article-box">${escapeHTML(texto)}</div></div>`);
}

function buildQuickPrompt(){
  const codeLabel=CODES.find(c=>c.id===state.codigo)?.label||'Código';
  const titulo = state.artigoTitulo || '(sem título)';
  const texto  = state.artigoTexto  || '(sem texto)';

  return `Você é um professor de Direito com didática impecável.
Objetivo: Estudo RÁPIDO do artigo indicado, em linguagem simples e direta (10–12 linhas), cobrindo:
1) conceito/finalidade; 2) elementos essenciais; 3) pontos que caem em prova/OAB; 4) mini exemplo prático (3–4 linhas); 5) erro comum a evitar.
Evite juridiquês desnecessário. Não traga jurisprudência extensa.

Contexto
- Código: ${codeLabel}
- Artigo: ${titulo}
- Texto integral:
${texto}

Formato da resposta
- Resumo (10–12 linhas)
- 3 bullets “cai em prova”
- Mini exemplo (3–4 linhas)
- 1 erro comum

Assine no final: "💚 direito.love — Gere um novo prompt em https://direito.love"`;
}

function showPromptAndIA(){
  const node=pushBot(`<div><h4>Seu Prompt (Estudo Rápido)</h4><div class="prompt-box" id="promptBox"></div>
    <div style="margin-top:8px" class="group">
      <button class="button" id="btnCopiar">Copiar</button>
      <a class="chip" href="https://chatgpt.com/" target="_blank" rel="noopener">Abrir ChatGPT</a>
      <a class="chip" href="https://gemini.google.com/app" target="_blank" rel="noopener">Abrir Gemini</a>
      <a class="chip" href="https://www.perplexity.ai/" target="_blank" rel="noopener">Abrir Perplexity</a>
    </div>
  </div>`);
  node.querySelector('#promptBox').textContent=state.prompt;
  node.querySelector('#btnCopiar').addEventListener('click',onCopied);
}

async function doSearch(){
  await typing(900);
  const entrada=state.termoBusca;
  let results={artigo:null,node:null,perguntas:[]};

  if(state.codigo && entrada) results=await searchByArticleOrText(state.codigo,entrada);

  if(!results.node){
    pushBot(`Não encontrei esse artigo. Tente digitar apenas o número (ex.: 121).`);
    return;
  }

  // 1) Mostra o texto do artigo (Vade Mecum)
  showArticle(results.node);

  // 2) Em seguida, entrega o prompt de estudo rápido + IA
  await typing(700);
  pushBot(`Pronto! Já gerei um <b>prompt de estudo rápido</b>. É só copiar e colar na IA de sua preferência 👇`);
  state.prompt = buildQuickPrompt(); save();
  showPromptAndIA();

  // Botão de reinício opcional
  const reiniciar = pushBot(`<button class="button secondary" id="btnReiniciarChat">Reiniciar conversa</button>`);
  reiniciar.querySelector('#btnReiniciarChat').addEventListener('click',resetAll);
}

// Copiar
async function onCopied(){
  try{ await navigator.clipboard.writeText(state.prompt);}catch{}
  await typing(500);
  pushBot(`✅ Prompt copiado! Abra a IA e cole o texto.`);
}

// Eventos
document.addEventListener('DOMContentLoaded',()=>{
  load();
  document.getElementById('btnReset').addEventListener('click',resetAll);
  document.getElementById('btnInfo').addEventListener('click',()=>modalInfo.showModal());
  startConversation();
});
