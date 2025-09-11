// ===== Estado e helpers =====
const state = {
  etapa: 0,
  codigo: null,
  termoBusca: '',
  prompt: '',
  artigo: null // guardamos o node do artigo encontrado
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
function typing(ms=1200){
  const t = el(`<div class="msg bot"><div class="avatar"><img src="icons/robo.png" alt="Bot"></div><div class="bubble"><span class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span></div></div>`);
  app.appendChild(t);
  return new Promise(res=> setTimeout(()=>{ t.remove(); res(); }, ms));
}

function escapeHTML(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function onlyDigits(s){ const m = String(s||'').match(/^\d{1,4}$/); return m ? m[0] : null; }
function numeroBase(n){ const m = String(n||'').match(/^(\d{1,4})([A-Za-z-]*)?$/); return m? m[1] : null; }
function hasLetter(n){ return /[A-Za-z]/.test(String(n||'')); }

// ===== Data =====
async function getJSON(path){
  const r=await fetch(path);
  if(!r.ok) throw new Error('Falha ao carregar '+path);
  return r.json();
}
// Tenta primeiro _vademecum.json; se não houver, cai para .json
async function loadCodeData(codeId){
  const candidates = [
    `data/${codeId}_vademecum.json`,
    `data/${codeId}.json`
  ];
  for (const p of candidates){
    try{ return await getJSON(p); } catch(_e){}
  }
  throw new Error('Nenhum arquivo de dados encontrado para ' + codeId);
}

// ===== Busca =====
function buildFullText(node){
  // Concatena campos para busca textual robusta
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
  // Regra: entrada é NUMÉRICA (ex.: "121").
  // Só casa com artigo cujo número base é igual E NÃO possui letra (evita 121 vs 121-A)
  const nb = numeroBase(node.numero);
  return nb === entradaNum && !hasLetter(node.numero);
}

function matchByText(node, entrada){
  // Busca por termos (>=4 letras) presentes em caput/§/incisos/alíneas
  const tokens = (entrada||'').trim().split(/\s+/).filter(p=>p.length>=4);
  if(!tokens.length) return false;
  const corpus = normalize(buildFullText(node)).replace(/[^a-z0-9\s]/g,' ');
  return tokens.every(t => corpus.includes(normalize(t)));
}

async function searchArticle(codeId, entrada){
  const data = await loadCodeData(codeId);

  // data é um objeto { art1: {...}, art2: {...} }
  const nodes = Object.values(data);

  // 1) Se for número, tentar match exato
  const num = onlyDigits(entrada);
  if(num){
    const hit = nodes.find(n => matchByNumber(n, num));
    if(hit) return hit;
  }

  // 2) Busca textual (fallback)
  const hitText = nodes.find(n => matchByText(n, entrada));
  return hitText || null;
}

// ===== Render de Artigo (por blocos) =====
function renderArticleHTML(node){
  const titulo = node?.titulo || `Art. ${node?.numero||''}`;
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
  // Preferir o campo "texto" já formatado; se faltar, montar do render (stripping tags).
  let texto = node?.texto;
  if(!texto){
    // fallback: concatenar caput/incisos/parágrafos em texto simples
    const parts = [];
    if(node.caput) parts.push(node.caput);
    if(Array.isArray(node.incisos)){
      node.incisos.forEach(i=>{
        parts.push(`${i.rom} - ${i.texto||''}`);
        if(Array.isArray(i.alineas)) i.alineas.forEach(a=> parts.push(`  ${a.letra}) ${a.texto||''}`));
      });
    }
    if(Array.isArray(node.paragrafos)){
      node.paragrafos.forEach(p=> parts.push(`${p.rotulo? p.rotulo+' - ' : ''}${p.texto||''}`));
    }
    texto = parts.join('\n');
  }

  return `Você é um professor de Direito com didática impecável.
Objetivo: Estudo RÁPIDO do artigo indicado, em linguagem simples e direta (10–12 linhas), cobrindo:
1) conceito/finalidade; 2) elementos essenciais; 3) pontos que caem em prova/OAB; 4) mini exemplo prático (3–4 linhas); 5) erro comum a evitar.
Evite juridiquês desnecessário. Não traga jurisprudência extensa.

Contexto
- Cód
