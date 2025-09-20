/* SW opcional */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  });
}

/* refs */
const $ = s => document.querySelector(s);
const els = {
  form: $("#searchForm"),
  q: $("#searchInput"),
  spinner: $("#searchSpinner"),
  stack: $("#resultsStack"),

  readerModal: $("#readerModal"),
  readerBody: $("#readerBody"),
  readerTitle: $("#readerTitle"),
  selCount: $("#selCount"),

  studyBtn: $("#studyBtn"),
  viewBtn: $("#viewBtn"),
  sheet: $("#selectedSheet"),
  selList: $("#selectedList"),

  studyModal: $("#studyModal"),
  promptPreview: $("#promptPreview"),
  copyPromptBtn: $("#copyPromptBtn"),

  codeSelect: $("#codeSelect"),
  toasts: $("#toasts"),
};

/* estado */
const MAX_SEL = 6;
const state = {
  selected: new Map(),      // id -> item
  cacheTxt: new Map(),      // url -> txt
  cacheParsed: new Map(),   // url -> items[]
  urlToLabel: new Map(),
};

/* util */
function toast(msg){
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  els.toasts.appendChild(el);
  setTimeout(()=> el.remove(), 2000);
}
function updateBottom(){
  const n = state.selected.size;
  els.viewBtn.textContent = `${n} Selecionados – VER`;
  els.studyBtn.disabled = n===0;
  els.selCount.textContent = `${n}/${MAX_SEL}`;
}
function norm(s){return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ç/g,"c").toLowerCase();}

/* catálogo */
(function(){
  els.codeSelect.querySelectorAll("option").forEach(opt=>{
    const url = opt.value?.trim(); const label = opt.textContent?.trim();
    if (url) state.urlToLabel.set(url, label);
  });
})();

/* loader + parser (aproveitado) */
function sanitize(s){return s.replace(/\u00A0/g," ").replace(/\t/g," ").replace(/\s+\n/g,"\n");}
async function fetchText(url){
  if (state.cacheTxt.has(url)) return state.cacheTxt.get(url);
  const r = await fetch(url, {cache:"no-cache"}); if(!r.ok) throw new Error(url);
  const t = sanitize(await r.text()); state.cacheTxt.set(url,t); return t;
}
function splitBlocks(txt){
  const cleaned = sanitize(txt.replace(/^\uFEFF/, "").replace(/\r\n/g,"\n").replace(/[ \t]+/g," "));
  return cleaned.split(/^\s*-{5,}\s*$/m).map(s=>s.trim()).filter(Boolean);
}
function parseBlock(block, idx){
  const lines = block.split(/\n/);
  const artIdx = lines.findIndex(l=>/^(Pre[aâ]mbulo|Art(?:igo)?\.?|S[úu]mula)/i.test(l.trim()));
  if (artIdx === -1) return { kind:"heading", raw:block, htmlId:`h-${idx}` };

  const pre = lines.slice(0, artIdx).map(s=>s.trim()).filter(Boolean);
  const after = lines.slice(artIdx).map(s=>s.trim()).filter(Boolean);
  const epigrafe = pre.length ? pre.join("\n") : "";
  const title = after.shift() || "";
  const body = after.join("\n");

  return {
    kind:"article",
    title: title || `Bloco ${idx+1}`,
    text: [epigrafe?`Epígrafe: ${epigrafe}`:"", title, body].filter(Boolean).join("\n"),
    htmlId:`art-${idx}`,
    _split:{titleText:title, epigrafe, body}
  };
}
async function parseFile(url){
  if (state.cacheParsed.has(url)) return state.cacheParsed.get(url);
  const txt = await fetchText(url);
  const items = splitBlocks(txt).map(parseBlock);
  let i=0; items.forEach(it=>{ if(it.kind==="article"){ it.htmlId=`art-${i++}`; }});
  state.cacheParsed.set(url, items);
  return items;
}

/* busca (Enter) — adiciona bloco NOVO ACIMA */
els.form.addEventListener("submit", e=>{e.preventDefault(); doSearch();});
els.q.addEventListener("keydown", e=>{ if(e.key==="Enter"){e.preventDefault(); doSearch();} });

async function doSearch(){
  const term = (els.q.value||"").trim(); if(!term) return;

  els.stack.setAttribute("aria-busy","true");
  const skel = document.createElement("section");
  skel.className = "block";
  const t = document.createElement("div"); t.className="block-title"; t.textContent=`Busca: ‘${term}’ (…)`;
  skel.appendChild(t);
  for(let i=0;i<2;i++){ const s=document.createElement("div"); s.className="skel block"; skel.appendChild(s); }
  els.stack.prepend(skel);
  els.spinner.classList.add("show");

  try{
    const tokens = term.split(/\s+/).filter(Boolean).map(norm);
    const results = [];
    const options = Array.from(els.codeSelect.querySelectorAll("option"))
      .map(o=>({url:o.value?.trim(), label:o.textContent?.trim()})).filter(o=>o.url);

    for(const {url,label} of options){
      try{
        const items = await parseFile(url);
        items.forEach(it=>{
          if(it.kind!=="article") return;
          const bag = norm([it._split.titleText||"", it._split.epigrafe||"", it._split.body||""].join(" "));
          if(tokens.every(t=>bag.includes(t))){
            results.push({
              id: `${url}::${it.htmlId}`,
              title: it._split.titleText || it.title,
              source: label,
              text: it.text,
              fileUrl: url,
              htmlId: it.htmlId
            });
          }
        });
      }catch{}
    }

    skel.remove();
    renderBlock(term, results);
  } finally {
    els.stack.setAttribute("aria-busy","false");
    els.spinner.classList.remove("show");
    els.q.select();
  }
}

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
    items.forEach(it=> block.appendChild(renderCard(it)));
  }
  els.stack.prepend(block);
}

function renderCard(item){
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = item.id;

  const left = document.createElement("div");
  const h3 = document.createElement("h3"); h3.textContent = `${item.title} — ${item.source}`;
  const p  = document.createElement("div"); p.className="body"; p.textContent = item.text;
  const src= document.createElement("a");  src.href="#"; src.className="source"; src.textContent=item.source;

  [h3,p,src].forEach(el=>{ el.style.cursor="pointer"; el.addEventListener("click", ()=>openReader(item)); });

  left.append(h3,p,src);

  const chk = document.createElement("button");
  chk.className="chk";
  chk.setAttribute("aria-label","Selecionar artigo");
  chk.innerHTML=`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const sync=()=>{chk.dataset.checked = state.selected.has(item.id) ? "true":"false";};
  sync();
  chk.addEventListener("click", ()=>{
    if(state.selected.has(item.id)){ state.selected.delete(item.id); toast(`Removido (${state.selected.size}/${MAX_SEL}).`);}
    else{
      if(state.selected.size>=MAX_SEL){toast("⚠️ Limite de 6 artigos.");return;}
      state.selected.set(item.id,item); toast(`Adicionado (${state.selected.size}/${MAX_SEL}).`);
    }
    sync(); updateBottom();
  });

  card.append(left, chk);
  return card;
}

/* modal leitor */
async function openReader(item){
  els.readerTitle.textContent = item.source;
  els.selCount.textContent = `${state.selected.size}/${MAX_SEL}`;
  els.readerBody.innerHTML = "";
  showModal(els.readerModal);

  for(let i=0;i<3;i++){ const s=document.createElement("div"); s.className="skel block"; s.style.margin="10px 0"; els.readerBody.appendChild(s); }

  try{
    const items = await parseFile(item.fileUrl);
    els.readerBody.innerHTML="";
    items.forEach(a=>{
      if(a.kind!=="article") return;
      els.readerBody.appendChild(renderArticleRow(a, item.fileUrl, item.source));
    });
    const anchor = els.readerBody.querySelector(`#${CSS.escape(item.htmlId)}`);
    if(anchor) anchor.scrollIntoView({block:"start",behavior:"smooth"});
    els.readerBody.focus();
  }catch{
    toast("Não consegui abrir este código. Tente novamente.");
    hideModal(els.readerModal);
  }
}
function renderArticleRow(a, fileUrl, sourceLabel){
  const row=document.createElement("div"); row.className="article"; row.id=a.htmlId;

  const chk=document.createElement("button");
  chk.className="chk a-chk"; chk.setAttribute("aria-label","Selecionar artigo");
  chk.innerHTML=`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const itemRef={
    id:`${fileUrl}::${a.htmlId}`,
    title:a._split.titleText || a.title,
    source:sourceLabel,
    text:[a._split.epigrafe?`Epígrafe: ${a._split.epigrafe}`:"", a._split.titleText||a.title, a._split.body||""].filter(Boolean).join("\n"),
    fileUrl, htmlId:a.htmlId
  };
  const sync=()=>{ chk.dataset.checked = state.selected.has(itemRef.id) ? "true":"false"; };
  sync();
  chk.addEventListener("click", ()=>{
    if(state.selected.has(itemRef.id)){ state.selected.delete(itemRef.id); toast(`Removido (${state.selected.size}/${MAX_SEL}).`); }
    else{
      if(state.selected.size>=MAX_SEL){toast("⚠️ Limite de 6 artigos.");return;}
      state.selected.set(itemRef.id,itemRef); toast(`Adicionado (${state.selected.size}/${MAX_SEL}).`);
    }
    els.selCount.textContent=`${state.selected.size}/${MAX_SEL}`; sync(); updateBottom();
  });

  const body=document.createElement("div");
  const h4=document.createElement("h4"); h4.textContent=`${itemRef.title} — ${sourceLabel}`;
  const txt=document.createElement("div"); txt.className="a-body"; txt.textContent=itemRef.text;
  body.append(h4,txt);

  row.append(chk,body);
  return row;
}

/* modais e sheet */
function showModal(el){ el.hidden=false; document.body.style.overflow="hidden"; }
function hideModal(el){ el.hidden=true; document.body.style.overflow=""; }

document.addEventListener("click",(e)=>{
  if(e.target.matches("[data-close-modal]")) hideModal(els.readerModal);
  if(e.target.matches("[data-close-study]")) hideModal(els.studyModal);
  if(e.target.matches("[data-close-sheet]")) toggleSheet(false);

  if(e.target === els.readerModal.querySelector(".modal-backdrop")) hideModal(els.readerModal);
  if(e.target === els.studyModal.querySelector(".modal-backdrop")) hideModal(els.studyModal);
  if(e.target === els.sheet.querySelector(".sheet-backdrop")) toggleSheet(false);
});
document.addEventListener("keydown",(e)=>{
  if(e.key==="Escape"){
    if(!els.readerModal.hidden) hideModal(els.readerModal);
    if(!els.studyModal.hidden) hideModal(els.studyModal);
    if(!els.sheet.hidden) toggleSheet(false);
  }
});

els.viewBtn.addEventListener("click", ()=> toggleSheet(true));
function toggleSheet(on){
  if(on){
    els.selList.innerHTML="";
    for(const [id,it] of state.selected.entries()){
      const li=document.createElement("li");
      li.innerHTML=`<span>${it.title} — <em>${it.source}</em></span>`;
      const del=document.createElement("button"); del.className="icon-btn"; del.textContent="✕";
      del.addEventListener("click", ()=>{ state.selected.delete(id); li.remove(); updateBottom(); toast(`Removido (${state.selected.size}/${MAX_SEL}).`); });
      li.appendChild(del);
      els.selList.appendChild(li);
    }
  }
  els.sheet.hidden=!on;
}

/* estudar */
els.studyBtn.addEventListener("click", ()=>{
  if(!state.selected.size) return;
  const prompt = buildPrompt();
  openStudyModal(prompt);
  navigator.clipboard?.writeText(prompt).then(
    ()=> toast("✅ Prompt copiado. Cole na sua IA preferida."),
    ()=> toast("Copie manualmente no modal.")
  );
});
$("#copyPromptBtn")?.addEventListener("click", ()=>{
  const txt = els.promptPreview.textContent || "";
  navigator.clipboard?.writeText(txt).then(()=> toast("✅ Copiado!"));
});

function buildPrompt(){
  const topBlock = document.querySelector(".block .block-title")?.textContent || "Estudo jurídico";
  const parts = [`Tema base: ${topBlock.replace(/^Busca:\s*/,"")}`,""];
  let i=1;
  for(const it of state.selected.values()){
    parts.push(`### ${i}. ${it.title} — [${it.source}]`);
    parts.push(it.text,"");
    if(i++>=MAX_SEL) break;
  }
  parts.push("Gere um novo prompt em https://direito.love");
  return parts.join("\n");
}
function openStudyModal(prompt){
  els.promptPreview.textContent = prompt;
  showModal(els.studyModal);
}

/* init */
updateBottom();
