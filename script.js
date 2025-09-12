
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
  {id: 'codigo_penal', label: 'Código Penal', group: 'Códigos'},
  {id: 'codigo_civil', label: 'Código Civil', group: 'Códigos'},
  {id: 'cpp', label: 'Código de Processo Penal', group: 'Códigos'},
  {id: 'cpc', label: 'Código de Processo Civil', group: 'Códigos'},
  {id: 'cf', label: 'Constituição Federal', group: 'Códigos'},
  {id: 'cdc', label: 'Código de Defesa do Consumidor', group: 'Códigos'},
  {id: 'clt', label: 'CLT', group: 'Códigos'},
  {id: 'ctn', label: 'Código Tributário Nacional', group: 'Códigos'},
  {id: 'lei_mediacao', label: 'Lei de Mediação (13.140/2015)', group: 'Leis'},
  {id: 'lei_9099', label: 'Lei 9.099/1995 (Juizados)', group: 'Leis'}
];

// ===== Utils atualizados =====
function escapeHTML(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]); }
function norm(s){
  return (s||'').toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9\s-]/g,' ');
}
function onlyDigits(s){ const m = String(s||'').match(/\d{1,4}/); return m ? m[0] : null; }

function tokensFromEntrada(entrada){
  return norm(entrada).split(/\s+/).filter(t => t.length >= 4);
}

function buildFullText(node){
  return node.texto || '';
}

function matchByNumber(node, entradaNum){
  const match = (node.titulo || '').match(/^art\.?\s*(\d{1,4})/i);
  return match && match[1] === String(entradaNum);
}

function matchTituloOuNumero(node, entradaRaw){
  const e = norm(entradaRaw).replace(/\s+/g,'');
  const t = norm(node.titulo||'').replace(/\s+/g,'');
  return e === t || e === t.replace(/^art\.?/, '') || e === 'art' + t || e === 'artigo' + t;
}

function matchByText(node, entrada){
  const tokens = tokensFromEntrada(entrada);
  if (!tokens.length) return false;
  const corpus = norm(node.texto || '');
  return tokens.every(t => corpus.includes(t));
}

// ===== Data =====
async function getJSON(path){
  const r = await fetch(path);
  if (!r.ok) throw new Error(\`HTTP \${r.status} ao carregar \${path}\`);
  return r.json();
}

async function tryLoadCodeData(codeId){
  const candidates = [
    \`data/\${codeId}_vademecum.json\`,
    \`data/\${codeId}.json\`
  ];
  let lastErr;
  for (const p of candidates){
    try { return await getJSON(p); } catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('Arquivo de dados não encontrado');
}

async function ensureCodeLoaded(codeId){
  if (state.codigo === codeId && state.artigosData) return;
  state.codigo = codeId;
  try {
    state.artigosData = await tryLoadCodeData(codeId);
  } catch(err){
    console.error(err);
    throw err;
  }
  const nodes = Object.values(state.artigosData);
  state.artigosIndex = nodes;
}

// ===== Busca principal =====
async function searchArticle(codeId, entrada){
  await ensureCodeLoaded(codeId);
  const nodes = state.artigosIndex.slice();

  const hitExact = nodes.find(n => matchTituloOuNumero(n, entrada));
  if (hitExact) return hitExact;

  const num = onlyDigits(entrada);
  if (num){
    const hitNum = nodes.find(n => matchByNumber(n, num));
    if (hitNum) return hitNum;
  }

  const hitText = nodes.find(n => matchByText(n, entrada));
  return hitText || null;
}
