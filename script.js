// ===== Estado e helpers =====
const state = {
  etapa: 0,
  codigo: null,
  termoBusca: '',
  prompt: '',
  artigo: null
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

function save(){ localStorage.setItem('chatbot_juridico_state', JSON.stringify(state)); }
function load(){ try{ Object.assign(state, JSON.parse(localStorage.getItem('chatbot_juridico_state'))||{});}catch{} }
function resetAll(){
  Object.assign(state, {etapa:0,codigo:null,termoBusca:'',prompt:'',artigo:null});
  app.innerHTML=''; save(); startConversation();
}

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
function typing(ms=900){
  const t = el(`<div class="msg bot"><div class="avatar"><img src="icons/robo.png" alt="Bot"></div><div class="bubble"><span class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span></div></div>`);
  app.appendChild(t);
  return new Promise(res=> setTimeout(()=>{ t.remove(); res(); }, ms));
}

function escapeHTML(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function onlyDigits(s){ const m = String(s||'').match(/^\d{1,4}$/); return m ? m[0] : null; }
function numeroBase(n){ const m = String(n||'').match(/^(\d{1,4})([A-Za-z-]*)?$/); return m? m[1] : null; }
function hasLetter(n){ return /[A-Za-z]/.test(String(n||'')); }

// Normalizador robusto (mantém letras do sufixo, remove pontuação e acento)
function normToken(s){
  return (s||'')
    .toString()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]/g,'');
}

// ===== Fallback mínimo para testes =====
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

// ===== Data =====
async function getJSON(path){
  const r=await fetch(path);
  if(!r.ok) throw new Error(`HTTP ${r.status} ao carregar ${path}`);
  return r.json();
}
// tenta vademecum, depois bruto; se falhar, lança erro
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

// ===== Busca =====
// 1) casa entrada com numero/titulo incluindo sufixos com letra (121-A, 121a, art.121-a)
function matchTituloOuNumero(node, entradaRaw){
  const e = normToken(entradaRaw);
  const t = normToken(node.titulo||''); // "art. 121-a"
  const n = normToken(node.numero||''); // "121a"
  // aceita "art121a", "artigo121a", etc.
  return e===n || e===t || e===('art'+n) || e===('artigo'+n);
}

function buildFullText(node){
  const parts = [];
  if(node.caput) parts.push(node.caput);
  if(Array.isArray(node.incisos)) node.incisos.forEach(i=>{
    parts.push(`${i.rom} - ${i.texto||''}`);
    if(Array.isArray(i.alineas)) i.alineas.forEach(a=> parts.push(`${a.letra}) ${a.texto||''}`));
  });
  if(Array.isArray(node.paragrafos)) node.paragrafos.forEach(p=>{
    parts.push(`${p.rotulo? p.rotulo+' - ' : ''}${p.texto||''}`);
  });
  if(node.texto) parts.push(node.texto);
  return parts.join('\n');
}
function normalize(str){
  return (str||'').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
function matchByNumber(node, entradaNum){
  const nb = numeroBase(node.numero);
  return nb === entradaNum && !hasLetter(node.numero);
}
function matchByText(node, entrada){
  const tokens = (entrada||'').trim().split(/\s+/).filter(p=>p.length>=4);
  if(!tokens.length) return false;
  const corpus = normalize(buildFullText(node)).replace(/[^a-z0-9\s]/g,' ');
  return tokens.every(t => corpus.includes(normalize(t)));
}

async function searchArticle(codeId, entrada){
  const data = await tryLoadCodeData(codeId);
  const nodes = Object.values(data);

  // (A) match por numero/titulo com sufixo (pega 121-A, 121a, art.121-a, etc.)
  const hitExact = nodes.find(n => matchTituloOuNumero(n, entrada));
  if (hitExact) return hitExact;

  // (B) se a entrada for SÓ números, priorize artigo sem letra (121 ≠ 121-A)
  const num = onlyDigits(entrada);
  if(num){
    const hitNum = nodes.find(n => matchByNumber(n, num));
    if(hitNum) return hitNum;
  }

  // (C) fallback textual
  const hitText = nodes.find(n => matchByText(n, entrada));
  return hitText || null;
}

// ===== Render =====
// IMPORTANTE: prioriza node.texto para preservar 100% a ordem original.
function renderArticleHTML(node){
  const titulo = node?.titulo || `Art. ${node?.numero||''}`;
  const plain = (node?.texto||'').trim();

  if (plain){
    // usa <pre> com pre-wrap para respeitar quebras e evitar "embolado"
    return `
      <div class="article">
        <div class="art-title">${escapeHTML(titulo)}</div>
        <pre style="white-space:pre-wrap;margin:0">${escapeHTML(plain)}</pre>
      </div>
    `;
  }

  // Fallback estruturado (caso algum código não tenha "texto")
  const caput = node?.caput || '';
  const incisos = Array.isArray(node?.incisos) ? node.incisos : [];
  const paragrafos = Array.isArray(node?.paragrafos) ? node.paragrafos : [];

  const incisosHTML = incisos.length
    ? `<ol class="art-incisos">
        ${incisos.map(i=>`
          <li>
            <div class="art-inciso-head">${escapeHTML(i.rom)} - ${escapeHTML(i.texto||'')}</div>
            ${Array.isArray(i.alineas) && i.alineas.length ? `
              <ul class="art-alineas">
                ${i.alineas.map(a=>`<li><span class="letra">${escapeHTML(a.letra)})</span> ${escapeHTML(a.texto||'')}</li>`).join('')}
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

// ===== Prompt rápido =====
function buildQuickPrompt(node, codeId){
  const codeLabel = CODES.find(c=>c.id===codeId)?.label||'Código';
  const titulo = node?.titulo || `Art. ${node?.numero||''}`;
  const texto = node?.texto || buildFullText(node);

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

// ===== Conversa =====
async function startConversation(){
  await typing(600); pushBot(`<p>Olá! Eu te ajudo a estudar os <b>artigos dos códigos</b>.</p>`);
  await typing(600); pushBot(`<p>O tema do estudo faz parte de qual <b>Código?</b></p>`);
  renderCodeChips(); state.etapa=0; save();

  // Aviso se estiver em file:// (CORS)
  if (location.protocol === 'file:') {
    pushBot(`<div class="small">⚠️ Você está abrindo o arquivo via <b>file://</b>. Para a busca funcionar, sirva o site via HTTP (GitHub Pages, Vercel, Netlify ou um servidor local tipo “Live Server”).</div>`);
  }
}
function renderCodeChips(){
  const chips=CODES.map(c=>`<button class="chip" data-id="${c.id}">${c.label}</button>`).join('');
  const node=pushBot(`<div class="group" id="codes">${chips}</div>`);
  node.querySelectorAll('.chip').forEach(btn=>btn.addEventListener('click',()=>{ state.codigo=btn.getAttribute('data-id'); save(); onCodePicked(); }));
}
async function onCodePicked(){
  const label=CODES.find(c=>c.id===state.codigo)?.label||'Código';
  await typing(500); pushBot(`Excelente! Vamos de <b>${label}</b>.`);
  await typing(500); renderSearchInput(label); state.etapa=1; save();
}
function renderSearchInput(label){
  const node=pushBot(`
    <div>
      <p>Digite o <b>número do artigo</b> (ex.: <code>121</code> ou <code>121-A</code>).</p>
      <div class="input-row">
        <input id="inpBusca" class="input" placeholder="Ex.: 121 ou 121-A" />
        <button id="btnBuscar" class="button">Buscar</button>
      </div>
    </div>`);
  node.querySelector('#btnBuscar').addEventListener('click',async()=>{
    const v=node.querySelector('#inpBusca').value.trim();
    if(!v) return;
    pushUser(v); state.termoBusca=v; save(); await doSearch();
  });
}

async function doSearch(){
  await typing(700);
  const entrada=state.termoBusca;

  try{
    const node = await searchArticle(state.codigo, entrada);
    if(!node){
      pushBot(`Não encontrei esse artigo. Dicas: digite apenas o número (<code>121</code>) ou o número com letra (<code>121-A</code>).`);
      return;
    }

    state.artigo = node; save();

    const html = renderArticleHTML(node);
    pushBot(`<div><div class="article-box">${html}</div></div>`);

    await typing(500);
    pushBot(`Pronto! Já gerei um <b>prompt de estudo rápido</b>. É só copiar e colar na IA de sua preferência 👇`);
    state.prompt = buildQuickPrompt(node, state.codigo); save();
    showPromptAndIA();

    const reiniciar = pushBot(`<button class="button secondary" id="btnReiniciarChat">Reiniciar conversa</button>`);
    reiniciar.querySelector('#btnReiniciarChat').addEventListener('click',resetAll);

  } catch (err){
    console.error(err);
    const path1 = `data/${state.codigo}_vademecum.json`;
    const path2 = `data/${state.codigo}.json`;

    pushBot(`<div class="small">❌ Não consegui carregar os dados.<br>
    <b>Possíveis causas</b>:<br>
    • Abrindo o site via <code>file://</code> (CORS bloqueia o fetch).<br>
    • Arquivo ausente: <code>${path1}</code> ou <code>${path2}</code>.<br>
    • Nome/capitalização do arquivo errados (GitHub Pages é case-sensitive).<br>
    </div>`);

    if (FALLBACK[state.codigo]){
      await typing(400);
      pushBot(`<div class="small">✅ Usando <b>dados de teste embutidos</b> (Art. 1º e 2º) só para você validar o fluxo. Coloque depois o JSON real em <code>${path1}</code>.</div>`);
      const data = FALLBACK[state.codigo];
      const nodes = Object.values(data);

      // tenta com letra/numero no fallback também
      let node = nodes.find(n => matchTituloOuNumero(n, entrada));
      if (!node){
        const num = onlyDigits(entrada);
        if(num) node = nodes.find(n => matchByNumber(n, num));
      }
      if(!node) node = nodes.find(n => matchByText(n, entrada)) || nodes[0];

      state.artigo = node; save();
      const html = renderArticleHTML(node);
      pushBot(`<div><div class="article-box">${html}</div></div>`);

      await typing(400);
      pushBot(`Pronto! Já gerei um <b>prompt de estudo rápido</b>. É só copiar e colar na IA de sua preferência 👇`);
      state.prompt = buildQuickPrompt(node, state.codigo); save();
      showPromptAndIA();
    } else {
      pushBot(`<div class="small">👉 Coloque o arquivo de dados no caminho correto e tente novamente:<br><code>${path1}</code></div>`);
    }
  }
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

async function onCopied(){
  try{ await navigator.clipboard.writeText(state.prompt);}catch{}
  await typing(400);
  pushBot(`✅ Prompt copiado! Abra a IA e cole o texto.`);
}

// ===== Boot =====
document.addEventListener('DOMContentLoaded',()=>{
  load();
  document.getElementById('btnReset')?.addEventListener('click',resetAll);
  document.getElementById('btnInfo')?.addEventListener('click',()=>modalInfo.showModal());
  startConversation();
});
