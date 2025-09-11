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
  artigoTexto: ''
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
async function loadEstrategias(){ if(state.estrategias.length) return; state.estrategias = await getJSON('estrategias.json'); }
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
  for(const [key,node] of Object.entries(data)) if(matchTitulo(node.titulo,entrada)) return { artigo:key,node,perguntas:node.perguntas.map(q=>({codigo:codeId,artigo:key,texto:q})) };
  for(const [key,node] of Object.entries(data)) if(matchTexto(node.texto||'',entrada)) return { artigo:key,node,perguntas:node.perguntas.map(q=>({codigo:codeId,artigo:key,texto:q})) };
  return { artigo:null,node:null,perguntas:[] };
}

// Fluxo
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
  const node=pushBot(`<div><p>Digite o número do artigo ou palavras do texto.</p><div class="input-row"><input id="inpBusca" class="input" placeholder="Ex.: 121 ou homicídio" /><button id="btnBuscar" class="button">Buscar</button></div></div>`);
  node.querySelector('#btnBuscar').addEventListener('click',async()=>{
    const v=node.querySelector('#inpBusca').value.trim(); if(!v) return;
    pushUser(v); state.termoBusca=v; save(); await doSearch();
  });
}
// Pesquisa e estratégias
async function doSearch(){
  await typing(1000);
  let results={artigo:null,node:null,perguntas:[]};
  const entrada=state.termoBusca;
  if(state.codigo && entrada) results=await searchByArticleOrText(state.codigo,entrada);

  state.perguntas=results.perguntas.map(r=>r.texto);
  state.artigoTexto=results.node?.texto||''; save();

  if(!results.perguntas.length){ pushBot(`Não encontrei nada. Tente um artigo (ex.: 121) ou palavras mais específicas 🙂`); return; }

  // 🔥 Novo fluxo: direto para estratégias
  pushBot(`Selecione as estratégias de estudo:`);
  await gotoEstrategias({ showTitle:false, withTyping:false });
}

async function gotoEstrategias({ showTitle=true, withTyping=true }={}){
  if(withTyping) await typing(600);
  await loadEstrategias();
  const grid=state.estrategias.map(es=>`<button class="chip" data-id="${es.id}">${es.titulo}</button>`).join('');
  const titleHtml=showTitle?'<h4>Selecione as estratégias de estudo:</h4>':'';
  const node=pushBot(`<div>${titleHtml}<div class="group" id="estrategias">${grid}</div><div style="margin-top:6px"><button class="button" id="btnGerar">Gerar Prompt</button></div></div>`);
  node.querySelectorAll('#estrategias .chip').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.getAttribute('data-id'); const i=state.estrategiasPick.indexOf(id);
    if(i>=0) state.estrategiasPick.splice(i,1); else state.estrategiasPick.push(id);
    btn.dataset.selected=state.estrategiasPick.includes(id); save();
  }));
  node.querySelector('#btnGerar').addEventListener('click',()=>gerarPrompt());
}

function gerarPrompt(){
  const codeLabel=CODES.find(c=>c.id===state.codigo)?.label||'Código';
  const entrada=state.termoBusca;
  const blocoPerguntas=state.perguntas.map((q,i)=>`${i+1}. ${q}`).join('\n');
  const escolhidas=state.estrategias.filter(e=>state.estrategiasPick.includes(e.id));
  const blocoEstrategias=escolhidas.map(e=>`- ${e.titulo}: ${e.instrucao}`).join('\n');
  state.prompt=
`Você é um professor de Direito com didática impecável. Contexto:
- Código: ${codeLabel}
- Entrada: ${entrada}
- Texto do artigo: ${state.artigoTexto||'(não disponível)'}
Analise:
${blocoPerguntas||'(nenhuma)'}
${escolhidas.length?'Estratégias:\n'+blocoEstrategias:''}
Regras: linguagem simples, sem juridiquês excessivo.`;
  save();
  const node=pushBot(`<div><h4>Seu Prompt</h4><div class="prompt-box" id="promptBox"></div><div style="margin-top:8px"><button class="button" id="btnCopiar">Copiar</button></div></div>`);
  node.querySelector('#promptBox').textContent=state.prompt;
  node.querySelector('#btnCopiar').addEventListener('click',onCopied);
}

async function onCopied(){
  try{ await navigator.clipboard.writeText(state.prompt);}catch{}
  await typing(600);
  pushBot(`Prontinho! Seu prompt foi copiado. Agora escolha uma IA 👇`);
  pushBot(`<div class="group">
    <a class="chip" href="https://chatgpt.com/" target="_blank">ChatGPT</a>
    <a class="chip" href="https://gemini.google.com/app" target="_blank">Gemini</a>
    <a class="chip" href="https://www.perplexity.ai/" target="_blank">Perplexity</a>
  </div>`);
  pushBot(`<button class="button secondary" id="btnReiniciarChat">Reiniciar conversa</button>`)
    .querySelector('#btnReiniciarChat').addEventListener('click',resetAll);
}

// Eventos
document.addEventListener('DOMContentLoaded',()=>{
  load();
  document.getElementById('btnReset').addEventListener('click',resetAll);
  document.getElementById('btnInfo').addEventListener('click',()=>modalInfo.showModal());
  startConversation();
});
