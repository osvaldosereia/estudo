/***** MOCK — troque por busca/carregamento reais *****/
const MOCK = [
  {
    id: "cp-178",
    title: "Art. 178",
    source: "Código Penal",
    codeId: "codigo-penal",
    text: "O dia do começo inclui-se no cômputo do prazo. Contam-se os dias, os meses e os anos pelo calendário comum."
  },
  {
    id: "lmp-10",
    title: "Art. 10",
    source: "Lei Maria da Penha",
    codeId: "lei-maria-da-penha",
    text: "O dia do começo inclui-se no cômputo do prazo. Contam-se os dias, os meses e os anos pelo calendário comum."
  },
  {
    id: "sum-stj-92",
    title: "Súmula 92",
    source: "Súmula STJ",
    codeId: "sumulas-stj",
    text: "O dia do começo inclui-se no cômputo do prazo. Contam-se os dias, os meses e os anos pelo calendário comum."
  }
];

// Carrega TODO o código por fonte (substitua por fetch real /data/<codeId>.txt)
async function fetchCode(codeId){
  // Exemplo: 20 artigos fictícios
  return Array.from({length:20}, (_,i)=>({
    id: `${codeId}-art-${i+1}`,
    title: `Art. ${i+1}`,
    source: codeIdToHuman(codeId),
    codeId,
    text: `Texto integral do Art. ${i+1}. Exemplo para navegação e seleção.`
  }));
}
function codeIdToHuman(codeId){
  const map = {
    "codigo-penal":"Código Penal",
    "lei-maria-da-penha":"Lei Maria da Penha",
    "sumulas-stj":"Súmulas STJ"
  };
  return map[codeId] || codeId;
}

/***** Estado *****/
const MAX_SEL = 6;
const state = {
  selected: new Map(),      // id -> {id,title,source,text}
  cacheCodes: new Map(),    // codeId -> [articles]
};

/***** DOM *****/
const $ = sel => document.querySelector(sel);
const stack = $("#resultsStack");
const q = $("#q");
const form = $("#searchForm");
const studyBtn = $("#studyBtn");
const viewBtn = $("#viewBtn");
const toasts = $("#toasts");
const readerModal = $("#readerModal");
const readerBody = $("#readerBody");
const readerTitle = $("#readerTitle");
const selCount = $("#selCount");
const selectedSheet = $("#selectedSheet");
const selectedList = $("#selectedList");
const studyModal = $("#studyModal");
const studyPrompt = $("#studyPrompt");

/***** Utilidades *****/
function toast(msg){
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  toasts.appendChild(el);
  setTimeout(()=>{ el.remove(); }, 2000);
}
function updateBottom(){
  const n = state.selected.size;
  viewBtn.textContent = `${n} Selecionados – VER`;
  studyBtn.disabled = n===0;
  selCount.textContent = `${n}/${MAX_SEL}`;
}
function norm(s){ return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""); }

/***** Render de bloco (PREPEND = acima) *****/
function renderBlock(term, items){
  const block = document.createElement("section");
  block.className = "block";
  const title = document.createElement("div");
  title.className = "block-title";
  title.textContent = `Busca: ‘${term}’ (${items.length} resultados)`;
  block.appendChild(title);

  if (!items.length){
    const empty = document.createElement("div");
    empty.className = "block-empty";
    empty.textContent = `Nada por aqui com ‘${term}’. Tente outra palavra.`;
    block.appendChild(empty);
  } else {
    items.forEach(item=> block.appendChild(renderCard(item)));
  }
  stack.prepend(block);
}

/***** Card *****/
function renderCard(item){
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = item.id;

  const left = document.createElement("div");
  const h3 = document.createElement("h3");
  h3.textContent = `${item.title} — ${item.source}`;
  const p = document.createElement("div");
  p.className = "body";
  p.textContent = item.text;
  const src = document.createElement("a");
  src.href = "#";
  src.className = "source";
  src.textContent = item.source;

  [h3,p,src].forEach(el=>{
    el.style.cursor = "pointer";
    el.addEventListener("click", ()=> openReader(item));
  });

  left.append(h3,p,src);

  const chk = document.createElement("button");
  chk.className = "chk";
  chk.setAttribute("aria-label","Selecionar artigo");
  chk.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const sync = ()=>{ chk.dataset.checked = state.selected.has(item.id) ? "true" : "false"; };
  sync();

  chk.addEventListener("click", ()=>{
    if (state.selected.has(item.id)){
      state.selected.delete(item.id);
      toast(`Removido (${state.selected.size}/${MAX_SEL}).`);
    } else {
      if (state.selected.size >= MAX_SEL){ toast("⚠️ Limite de 6 artigos."); return; }
      state.selected.set(item.id, item);
      toast(`Adicionado (${state.selected.size}/${MAX_SEL}).`);
    }
    sync(); updateBottom();
  });

  card.append(left, chk);
  return card;
}

/***** Busca (mock em memória) *****/
function performSearch(term){
  const needle = norm(term);
  const hits = MOCK.filter(x =>
    norm(x.title).includes(needle) ||
    norm(x.text).includes(needle) ||
    norm(x.source).includes(needle)
  );
  renderBlock(term, hits);
}

/***** Submeter busca (Enter) *****/
form.addEventListener("submit", (e)=>{ e.preventDefault(); doSearch(); });
q.addEventListener("keydown", (e)=>{ if (e.key === "Enter"){ e.preventDefault(); doSearch(); } });

function doSearch(){
  const term = (q.value||"").trim();
  if (!term) return;
  // skeleton curto
  stack.setAttribute("aria-busy","true");
  const skel = document.createElement("section");
  skel.className = "block";
  const t = document.createElement("div"); t.className = "block-title"; t.textContent = `Busca: ‘${term}’ (…)`; skel.appendChild(t);
  for (let i=0;i<2;i++){ const s=document.createElement("div"); s.className="skel block"; skel.appendChild(s); }
  stack.prepend(skel);

  setTimeout(()=>{
    skel.remove();
    performSearch(term);
    stack.setAttribute("aria-busy","false");
    q.select(); // facilita próxima busca, acumulando ACIMA
  }, 250);
}

/***** Modal Leitor *****/
async function openReader(item){
  readerTitle.textContent = item.source;
  selCount.textContent = `${state.selected.size}/${MAX_SEL}`;
  readerBody.innerHTML = "";
  showModal(readerModal);

  // skeleton
  for (let i=0;i<3;i++){
    const s = document.createElement("div");
    s.className = "skel block"; s.style.margin="10px 0";
    readerBody.appendChild(s);
  }

  try{
    let articles = state.cacheCodes.get(item.codeId);
    if (!articles){
      articles = await fetchCode(item.codeId);
      state.cacheCodes.set(item.codeId, articles);
    }
    readerBody.innerHTML = "";
    articles.forEach(a=> readerBody.appendChild(renderArticleRow(a)));

    // âncora no artigo clicado
    const anchor =
      readerBody.querySelector(`[data-id="${item.codeId}-art-${extractArtNum(item.title)}"]`) ||
      readerBody.querySelector(`[data-art-title="${item.title}"]`);
    if (anchor){ anchor.scrollIntoView({block:"start"}); }
    readerBody.focus();
  }catch(e){
    console.error(e);
    toast("Não consegui abrir este código. Tente novamente.");
    hideModal(readerModal);
  }
}
function extractArtNum(title){
  const m = title.match(/Art\.?\s*(\d+)/i);
  return m ? Number(m[1]) : 1;
}
function renderArticleRow(a){
  const row = document.createElement("div");
  row.className = "article";
  row.dataset.id = a.id;
  row.setAttribute("data-art-title", a.title);

  const chk = document.createElement("button");
  chk.className = "chk a-chk";
  chk.setAttribute("aria-label","Selecionar artigo");
  chk.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  const itemRef = { id: a.id, title: a.title, source: a.source, text: a.text };
  const sync = ()=>{ chk.dataset.checked = state.selected.has(a.id) ? "true" : "false"; };
  sync();

  chk.addEventListener("click", ()=>{
    if (state.selected.has(a.id)){
      state.selected.delete(a.id);
      toast(`Removido (${state.selected.size}/${MAX_SEL}).`);
    } else {
      if (state.selected.size >= MAX_SEL){ toast("⚠️ Limite de 6 artigos."); return; }
      state.selected.set(a.id, itemRef);
      toast(`Adicionado (${state.selected.size}/${MAX_SEL}).`);
    }
    selCount.textContent = `${state.selected.size}/${MAX_SEL}`;
    sync(); updateBottom();
  });

  const body = document.createElement("div");
  const h4 = document.createElement("h4"); h4.textContent = `${a.title} — ${a.source}`;
  const txt = document.createElement("div"); txt.className = "a-body"; txt.textContent = a.text;
  body.append(h4, txt);

  row.append(chk, body);
  return row;
}

/***** Modais / Sheet *****/
function showModal(el){ el.hidden = false; document.body.style.overflow="hidden"; }
function hideModal(el){ el.hidden = true; document.body.style.overflow=""; }

document.addEventListener("click",(e)=>{
  if (e.target.matches("[data-close-modal]")) hideModal(readerModal);
  if (e.target.matches("[data-close-study]")) hideModal(studyModal);
  if (e.target.matches("[data-close-sheet]")) toggleSheet(false);

  if (e.target.closest(".modal-card")) return;
  if (e.target.closest(".sheet-card")) return;

  if (e.target === readerModal.querySelector(".modal-backdrop")) hideModal(readerModal);
  if (e.target === studyModal.querySelector(".modal-backdrop")) hideModal(studyModal);
  if (e.target === selectedSheet.querySelector(".sheet-backdrop")) toggleSheet(false);
});
document.addEventListener("keydown",(e)=>{
  if (e.key === "Escape"){
    if (!readerModal.hidden) hideModal(readerModal);
    if (!studyModal.hidden) hideModal(studyModal);
    if (!selectedSheet.hidden) toggleSheet(false);
  }
});

viewBtn.addEventListener("click", ()=> toggleSheet(true));
function toggleSheet(on){
  if (on){
    selectedList.innerHTML = "";
    for (const [id, it] of state.selected.entries()){
      const li = document.createElement("li");
      li.innerHTML = `<span>${it.title} — <em>${it.source}</em></span>`;
      const del = document.createElement("button");
      del.className = "icon-btn"; del.textContent = "✕";
      del.addEventListener("click", ()=>{
        state.selected.delete(id);
        li.remove();
        updateBottom();
        toast(`Removido (${state.selected.size}/${MAX_SEL}).`);
      });
      li.appendChild(del);
      selectedList.appendChild(li);
    }
  }
  selectedSheet.hidden = !on;
}

/***** ESTUDAR *****/
studyBtn.addEventListener("click", ()=>{
  if (!state.selected.size) return;
  const prompt = buildPrompt();
  openStudyModal(prompt); // mantém compatibilidade
  navigator.clipboard?.writeText(prompt).then(
    ()=> toast("✅ Prompt copiado. Cole na sua IA preferida."),
    ()=> toast("Copie manualmente no modal.")
  );
});

function buildPrompt(){
  const lastTitle = document.querySelector(".block .block-title")?.textContent || "Estudo jurídico";
  const parts = [];
  parts.push(`Tema base: ${lastTitle.replace(/^Busca:\s*/,'')}`);
  parts.push("");
  let i = 1;
  for (const it of state.selected.values()){
    parts.push(`### ${i}. ${it.title} — [${it.source}]`);
    parts.push(it.text);
    parts.push("");
    i++; if (i>MAX_SEL) break;
  }
  parts.push('Gere um novo prompt em https://direito.love');
  return parts.join("\n");
}

function openStudyModal(prompt){
  studyPrompt.value = prompt;
  showModal(studyModal);
}

/***** Init *****/
updateBottom();
