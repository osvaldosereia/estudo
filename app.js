/* ==========================
   direito.love — app.js
   ========================== */

/* Service Worker (opcional) */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

/* ---------- helpers DOM ---------- */
const $ = (s) => document.querySelector(s);

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
  questionsBtn: $("#questionsBtn"),
  viewBtn: $("#viewBtn"),

  selectedModal: $("#selectedModal"),
  selectedStack: $("#selectedStack"),

  studyModal: $("#studyModal"),
  promptPreview: $("#promptPreview"),
  copyPromptBtn: $("#copyPromptBtn"),

  questionsModal: $("#questionsModal"),
  questionsPreview: $("#questionsPreview"),
  copyQuestionsBtn: $("#copyQuestionsBtn"),
  includeObsBtn: $("#includeObsBtn"),
  questionsObs: $("#questionsObs"),

  brand: $("#brandBtn"),
  codeSelect: $("#codeSelect"),
  toasts: $("#toasts"),
};

/* ---------- estado global ---------- */
const MAX_SEL = 6;
const CARD_CHAR_LIMIT = 250;

const state = {
  selected: new Map(), // id -> item
  cacheTxt: new Map(), // url -> string
  cacheParsed: new Map(), // url -> items[]
  urlToLabel: new Map(),
  promptTpl: null, // estudo
  promptQTpl: null, // questões
  pendingObs: "", // observação “Incluir”
};

/* ---------- util ---------- */
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  els.toasts.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

function updateBottom() {
  const n = state.selected.size;
  els.viewBtn.textContent = `${n} Selecionados – Ver`;
  els.studyBtn.disabled = n === 0;
  els.questionsBtn.disabled = n === 0;
  els.selCount.textContent = `${n}/${MAX_SEL}`;
}

function norm(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/g, "c")
    .toLowerCase();
}

function escHTML(s) {
  return (s || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

/* ---------- catálogo (label -> url) ---------- */
(function () {
  els.codeSelect.querySelectorAll("option").forEach((opt) => {
    const url = opt.value?.trim();
    const label = opt.textContent?.trim();
    if (url) state.urlToLabel.set(label, url);
  });
})();

/* ---------- fetch/parse dos arquivos ---------- */
function sanitize(s) {
  return s.replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n");
}
async function fetchText(url) {
  if (state.cacheTxt.has(url)) return state.cacheTxt.get(url);
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(url);
  const t = sanitize(await r.text());
  state.cacheTxt.set(url, t);
  return t;
}
function splitBlocks(txt) {
  const cleaned = sanitize(txt).replace(/^\uFEFF/, "");
  return cleaned
    .split(/^\s*-{5,}\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* anti-duplicação “título aparece no corpo” */
function normCmp(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—-]/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function dedupeBody(title, body) {
  if (!body) return "";
  const lines = body.split(/\n+/);
  if (!lines.length) return body;
  const t = normCmp(title);
  const f = normCmp(lines[0]);
  if (f === t || f.startsWith(t) || t.startsWith(f)) lines.shift();
  let cleaned = lines.join("\n").trim();
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp("^\\s*" + esc + "\\s*\\n?", "i");
  cleaned = cleaned.replace(rx, "").trim();
  return cleaned;
}

function parseBlock(block, idx) {
  const lines = block.split(/\n/);
  const artIdx = lines.findIndex((l) =>
    /^(Pre[aâ]mbulo|Art(?:igo)?\.?|S[úu]mula)/i.test(l.trim())
  );
  if (artIdx === -1) return { kind: "heading", raw: block, htmlId: `h-${idx}` };

  const pre = lines.slice(0, artIdx).map((s) => s.trim()).filter(Boolean);
  const after = lines.slice(artIdx).map((s) => s.trim()).filter(Boolean);

  const epigrafe = pre.length ? pre.join("\n") : "";
  const title = after.shift() || "";
  const bodyRaw = after.join("\n");
  const bodyClean = dedupeBody(title, bodyRaw);
  const oneText = [title, bodyClean].filter(Boolean).join("\n");

  return {
    kind: "article",
    title: title || `Bloco ${idx + 1}`,
    text: [epigrafe ? `Epígrafe: ${epigrafe}` : "", oneText].filter(Boolean).join("\n"),
    bodyOnly: bodyClean,
    htmlId: `art-${idx}`,
    _split: { titleText: title, epigrafe, body: bodyClean, oneText },
  };
}

async function parseFile(url) {
  if (state.cacheParsed.has(url)) return state.cacheParsed.get(url);
  const txt = await fetchText(url);
  const items = splitBlocks(txt).map(parseBlock);
  let i = 0;
  items.forEach((it) => {
    if (it.kind === "article") it.htmlId = `art-${i++}`;
  });
  state.cacheParsed.set(url, items);
  return items;
}

/* ---------- templates de prompts ---------- */
async function loadPromptTemplate() {
  if (state.promptTpl) return state.promptTpl;
  try {
    const t = await fetchText("data/prompt/prompt_estudar.txt");
    state.promptTpl = t.trim();
  } catch {
    state.promptTpl = "Você é uma I.A. jurídica. A partir dos artigos abaixo, organize o estudo e explique de forma clara.\n";
  }
  return state.promptTpl;
}

/* >>> SOMENTE este caminho para “Criar Questões” <<< */
async function loadQuestionsTemplate() {
  if (state.promptQTpl) return state.promptQTpl;
  const PATH = "data/prompts/prompt_questoes.txt";
  try {
    const r = await fetch(PATH, { cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    state.promptQTpl = (await r.text()).trim();
  } catch {
    state.promptQTpl = ""; // sem fallback, por pedido
    toast("Não encontrei data/prompts/prompt_questoes.txt");
  }
  return state.promptQTpl;
}

/* ---------- aliases de códigos ---------- */
const CODE_ALIASES = {
  cp: ["Código Penal"], "codigo penal": ["Código Penal"], "código penal": ["Código Penal"],
  cpp: ["Processo Penal"], "codigo de processo penal": ["Processo Penal"], "código de processo penal": ["Processo Penal"],
  cpc: ["Processo Civil"], "cpc/2015": ["Processo Civil"], ncpc: ["Processo Civil"],
  "codigo de processo civil": ["Processo Civil"], "código de processo civil": ["Processo Civil"],
  cc: ["Código Civil"], "codigo civil": ["Código Civil"], "código civil": ["Código Civil"],
  ctn: ["CTN"], clt: ["CLT"], cdc: ["CDC"], ctb: ["CTB"], cpm: ["CPM"],
  cf: ["CF88"], "cf/88": ["CF88"], cf88: ["CF88"], crfb: ["CF88"], constituicao: ["CF88"], "constituição": ["CF88"],
  eca: ["ECA"],
  lep: ["Lei de Execução Penal"], "lei de execucao penal": ["Lei de Execução Penal"], "lei de execução penal": ["Lei de Execução Penal"],
  lai: ["Lei de Acesso à Informação"], "lei de acesso a informacao": ["Lei de Acesso à Informação"], "lei de acesso à informação": ["Lei de Acesso à Informação"],
  lms: ["Mandado de Segurança"], "mandado de seguranca": ["Mandado de Segurança"], "mandado de segurança": ["Mandado de Segurança"],
};

function labelsToUrls(labels) {
  const opts = Array.from(els.codeSelect.querySelectorAll("option")).map((o) => ({
    label: o.textContent.trim(),
    url: o.value.trim(),
  }));
  const urls = [];
  labels?.forEach((lbl) => {
    const hit = opts.find((o) => norm(o.label) === norm(lbl));
    if (hit) urls.push(hit.url);
  });
  return urls;
}

/* ---------- parser de consulta ---------- */
function parseQuery(raw) {
  const q = raw.trim();
  const qNorm = q.toLowerCase();

  // artigo explícito (art. 123 / artigo 123) ou número puro
  const mArt = qNorm.match(/\b(?:art(?:\.|igo)?)\s*(\d{1,4})(?:\s*[–—-]?\s*[a-z])?/i);
  const mSoloNum = qNorm.match(/^\s*(\d{1,4})\s*$/);
  const articleNum = mArt ? mArt[1] : (mSoloNum ? mSoloNum[1] : null);
  const numberOnly = !!mSoloNum;

  // detectar códigos por alias (palavra simples ou bigrama)
  const codeHits = new Set();
  const words = qNorm.split(/[^a-z0-9/]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const two = (w + " " + (words[i + 1] || "")).trim();
    if (CODE_ALIASES[two]) CODE_ALIASES[two].forEach((x) => codeHits.add(x));
    if (CODE_ALIASES[w]) CODE_ALIASES[w].forEach((x) => codeHits.add(x));
  }

  // tokens: >= 3 letras (ou números)
  const rawTokens = q.split(/\s+/).filter(Boolean);
  const tokens = rawTokens
    .filter((t) => (/^\d+$/.test(t) ? true : t.length >= 3))
    .map(norm);

  return { tokens, articleNum, numberOnly, codeHits: Array.from(codeHits) };
}

/* ---------- busca ---------- */
els.form.addEventListener("submit", (e) => { e.preventDefault(); doSearch(); });
els.q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } });

async function doSearch() {
  const term = (els.q.value || "").trim();
  if (!term) return;

  // nova pesquisa substitui a anterior (selecionados permanecem)
  els.stack.innerHTML = "";

  els.stack.setAttribute("aria-busy", "true");
  const skel = document.createElement("section");
  skel.className = "block";
  const t = document.createElement("div");
  t.className = "block-title";
  t.textContent = `Busca: ‘${term}’ (…)`;
  skel.appendChild(t);
  for (let i = 0; i < 2; i++) {
    const s = document.createElement("div"); s.className = "skel block"; skel.appendChild(s);
  }
  els.stack.append(skel);
  els.spinner.classList.add("show");

  try {
    const { tokens, articleNum, numberOnly, codeHits } = parseQuery(term);

    const results = [];
    const allOptions = Array.from(els.codeSelect.querySelectorAll("option"))
      .map((o) => ({ url: o.value?.trim(), label: o.textContent?.trim() }))
      .filter((o) => o.url);

    // filtrar por código quando tiver alias
    let options = allOptions;
    if (codeHits.length) {
      const urls = labelsToUrls(codeHits);
      if (urls.length) options = allOptions.filter((o) => urls.includes(o.url));
    }

    for (const { url, label } of options) {
      try {
        const items = await parseFile(url);
        items.forEach((it) => {
          if (it.kind !== "article") return;

          // artigo específico?
          let okArticle = true;
          if (articleNum) {
            const title = (it._split.titleText || "").toLowerCase();
            okArticle = new RegExp(
              `^\\s*art(?:\\.|igo)?\\s*${articleNum}(?:\\b|\\s*[–—-]?[a-z])`,
              "i"
            ).test(title);
          }
          if (!okArticle) return;

          // AND estrito entre tokens
          let okTokens = true;
          if (tokens.length) {
            const bag = norm((it._split.oneText || "") + " " + (it._split.epigrafe || ""));
            okTokens = tokens.every((t) => bag.includes(t));
          }

          if ((numberOnly && articleNum && okArticle) || (!numberOnly && okArticle && okTokens)) {
            results.push({
              id: `${url}::${it.htmlId}`,
              source: label,
              fileUrl: url,
              htmlId: it.htmlId,
              text: it._split.oneText,
              body: it.bodyOnly,
              title: it._split.titleText,
            });
          }
        });
      } catch { /* ignora arquivo quebrado */ }
    }

    skel.remove();
    renderBlock(term, results, tokens);
  } finally {
    els.stack.setAttribute("aria-busy", "false");
    els.spinner.classList.remove("show");
    els.q.select();
  }
}

function renderBlock(term, items, tokens) {
  const block = document.createElement("section");
  block.className = "block";
  const title = document.createElement("div");
  title.className = "block-title";
  title.textContent = `Busca: ‘${term}’ (${items.length} resultados)`;
  block.appendChild(title);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "block-empty";
    empty.textContent = `Nada por aqui com ‘${term}’. Tente outra palavra.`;
    block.appendChild(empty);
  } else {
    items.forEach((it) => block.appendChild(renderCard(it, tokens)));
  }
  els.stack.append(block);
}

/* ---------- renderização de cards ---------- */
function highlight(text, tokens) {
  let safe = escHTML(text || "");
  tokens.forEach((t) => {
    if (!t) return;
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    safe = safe.replace(re, "<mark>$1</mark>");
  });
  return safe;
}
function truncatedHTML(fullText, tokens) {
  const raw = fullText || "";
  const truncated = raw.length > CARD_CHAR_LIMIT ? raw.slice(0, CARD_CHAR_LIMIT).trim() + "…" : raw;
  return highlight(truncated, tokens);
}

function renderCard(item, tokens = [], ctx = { context: "results" }) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = item.id;

  const left = document.createElement("div");

  const pill = document.createElement("a");
  pill.href = "#";
  pill.className = "pill";
  pill.textContent = item.source;
  pill.addEventListener("click", (e) => { e.preventDefault(); openReader(item); });

  const body = document.createElement("div");
  body.className = "body is-collapsed";
  body.innerHTML = truncatedHTML(item.text, tokens);
  body.style.cursor = "pointer";
  body.addEventListener("click", () => openReader(item));

  const actions = document.createElement("div");
  actions.className = "actions";
  const toggle = document.createElement("button");
  toggle.className = "toggle";
  toggle.textContent = "ver texto";
  toggle.addEventListener("click", () => {
    const collapsed = body.classList.toggle("is-collapsed");
    toggle.textContent = collapsed ? "ver texto" : "ocultar";
    body.innerHTML = collapsed ? truncatedHTML(item.text, tokens) : highlight(item.text, tokens);
  });

  left.append(pill, body, actions);
  actions.append(toggle);

  const chk = document.createElement("button");
  chk.className = "chk";
  chk.setAttribute("aria-label", "Selecionar artigo");
  chk.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const sync = () => { chk.dataset.checked = state.selected.has(item.id) ? "true" : "false"; };
  sync();

  chk.addEventListener("click", () => {
    if (state.selected.has(item.id)) {
      state.selected.delete(item.id);
      toast(`Removido (${state.selected.size}/${MAX_SEL}).`);
      // se estiver no modal Selecionados, removemos o card da UI
      if (ctx.context === "selected") card.remove();
    } else {
      if (state.selected.size >= MAX_SEL) { toast("⚠️ Limite de 6 artigos."); return; }
      state.selected.set(item.id, { ...item });
      toast(`Adicionado (${state.selected.size}/${MAX_SEL}).`);
    }
    sync();
    updateBottom();
  });

  card.append(left, chk);
  return card;
}

/* ---------- MODAL: LEITOR ---------- */
async function openReader(item) {
  els.readerTitle.textContent = item.source;
  els.selCount.textContent = `${state.selected.size}/${MAX_SEL}`;
  els.readerBody.innerHTML = "";
  showModal(els.readerModal);

  // skeleton
  for (let i = 0; i < 3; i++) {
    const s = document.createElement("div");
    s.className = "skel block";
    s.style.margin = "10px 0";
    els.readerBody.appendChild(s);
  }

  try {
    const items = await parseFile(item.fileUrl);
    els.readerBody.innerHTML = "";
    items.forEach((a) => {
      if (a.kind !== "article") return;
      els.readerBody.appendChild(renderArticleRow(a, item.fileUrl, item.source));
    });

    // rolar para o artigo ancorado
    const anchor = els.readerBody.querySelector(`#${CSS.escape(item.htmlId)}`);
    if (anchor) {
      anchor.scrollIntoView({ block: "center", behavior: "instant" });
      anchor.classList.add("highlight");
      setTimeout(() => anchor.classList.remove("highlight"), 1800);
    }
    els.readerBody.focus();
  } catch {
    toast("Não consegui abrir este código. Tente novamente.");
    hideModal(els.readerModal);
  }
}

function renderArticleRow(a, fileUrl, sourceLabel) {
  const row = document.createElement("div");
  row.className = "article";
  row.id = a.htmlId;

  const itemRef = {
    id: `${fileUrl}::${a.htmlId}`,
    title: a._split.titleText || a.title,
    source: sourceLabel,
    text: [a._split.titleText || a.title, a._split.body || ""].filter(Boolean).join("\n"),
    body: a._split.body || "",
    fileUrl,
    htmlId: a.htmlId,
  };

  const chk = document.createElement("button");
  chk.className = "chk a-chk";
  chk.setAttribute("aria-label", "Selecionar artigo");
  chk.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const sync = () => { chk.dataset.checked = state.selected.has(itemRef.id) ? "true" : "false"; };
  sync();
  chk.addEventListener("click", () => {
    if (state.selected.has(itemRef.id)) {
      state.selected.delete(itemRef.id);
      toast(`Removido (${state.selected.size}/${MAX_SEL}).`);
    } else {
      if (state.selected.size >= MAX_SEL) { toast("⚠️ Limite de 6 artigos."); return; }
      state.selected.set(itemRef.id, itemRef);
      toast(`Adicionado (${state.selected.size}/${MAX_SEL}).`);
    }
    els.selCount.textContent = `${state.selected.size}/${MAX_SEL}`;
    sync();
    updateBottom();
  });

  const body = document.createElement("div");
  const h4 = document.createElement("h4");
  h4.textContent = `${itemRef.title} — ${sourceLabel}`;
  const txt = document.createElement("div");
  txt.className = "a-body";
  txt.textContent = itemRef.body || itemRef.text; // (no modal: só corpo)
  body.append(h4, txt);

  row.append(chk, body);
  return row;
}

/* ---------- MODAIS: helpers ---------- */
function showModal(el) { el.hidden = false; document.body.style.overflow = "hidden"; }
function hideModal(el) { el.hidden = true; document.body.style.overflow = ""; }

document.addEventListener("click", (e) => {
  if (e.target.matches("[data-close-modal]")) hideModal(els.readerModal);
  if (e.target.matches("[data-close-study]")) hideModal(els.studyModal);
  if (e.target.matches("[data-close-questions]")) hideModal(els.questionsModal);
  if (e.target.matches("[data-close-sel]")) hideModal(els.selectedModal);

  if (e.target === els.readerModal.querySelector(".modal-backdrop")) hideModal(els.readerModal);
  if (e.target === els.studyModal.querySelector(".modal-backdrop")) hideModal(els.studyModal);
  if (e.target === els.questionsModal.querySelector(".modal-backdrop")) hideModal(els.questionsModal);
  if (e.target === els.selectedModal.querySelector(".modal-backdrop")) hideModal(els.selectedModal);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!els.readerModal.hidden) hideModal(els.readerModal);
    if (!els.studyModal.hidden) hideModal(els.studyModal);
    if (!els.questionsModal.hidden) hideModal(els.questionsModal);
    if (!els.selectedModal.hidden) hideModal(els.selectedModal);
  }
});

/* ---------- VER SELECIONADOS (cards idênticos) ---------- */
els.viewBtn.addEventListener("click", () => {
  els.selectedStack.innerHTML = "";
  if (!state.selected.size) {
    const empty = document.createElement("div");
    empty.className = "block-empty";
    empty.textContent = "Nenhum artigo selecionado.";
    els.selectedStack.appendChild(empty);
  } else {
    // renderizar cada selecionado como card idêntico aos resultados
    for (const it of state.selected.values()) {
      const card = renderCard(it, [], { context: "selected" });
      els.selectedStack.appendChild(card);
    }
  }
  showModal(els.selectedModal);
});

/* ---------- ESTUDAR ---------- */
els.studyBtn.addEventListener("click", async () => {
  if (!state.selected.size) return;
  const prompt = await buildStudyPrompt();
  openStudyModal(prompt);
  navigator.clipboard?.writeText(prompt).then(
    () => toast("✅ Prompt copiado. Cole na sua IA preferida."),
    () => toast("Copie manualmente no modal.")
  );
});
els.copyPromptBtn?.addEventListener("click", () => {
  const txt = els.promptPreview.textContent || "";
  navigator.clipboard?.writeText(txt).then(() => toast("✅ Copiado!"));
});

async function buildStudyPrompt() {
  const tpl = await loadPromptTemplate();
  const parts = [tpl.trim(), ""];
  let i = 1;
  for (const it of state.selected.values()) {
    parts.push(`### ${i}. ${it.title} — [${it.source}]`);
    parts.push(it.body || it.text, "");
    if (i++ >= MAX_SEL) break;
  }
  return parts.join("\n");
}
function openStudyModal(prompt) {
  els.promptPreview.textContent = prompt;
  showModal(els.studyModal);
}

/* ---------- CRIAR QUESTÕES ---------- */
els.questionsBtn.addEventListener("click", async () => {
  if (!state.selected.size) return;
  const prompt = await buildQuestionsPrompt();
  els.questionsPreview.textContent = prompt;
  showModal(els.questionsModal);
  navigator.clipboard?.writeText(prompt).then(
    () => toast("✅ Prompt copiado. Cole na sua IA preferida."),
    () => toast("Copie manualmente no modal.")
  );
});
els.copyQuestionsBtn?.addEventListener("click", () => {
  const txt = els.questionsPreview.textContent || "";
  navigator.clipboard?.writeText(txt).then(() => toast("✅ Copiado!"));
});
els.includeObsBtn?.addEventListener("click", async () => {
  state.pendingObs = (els.questionsObs.value || "").trim();
  els.questionsPreview.textContent = await buildQuestionsPrompt(); // refresh preview
  toast("Observação incluída no prompt.");
});

async function buildQuestionsPrompt() {
  const tpl = await loadQuestionsTemplate();

  // Preferências (checkboxes)
  const opts = Array.from(document.querySelectorAll(".qopt"))
    .filter((i) => i.checked)
    .map((i) => i.value);
  const prefLines = [];
  if (opts.includes("casos2")) prefLines.push("- Inclua 2 Casos Concretos.");
  if (opts.includes("dissertativas2")) prefLines.push("- Inclua 2 Dissertativas.");
  if (opts.includes("vf2")) prefLines.push("- Inclua 2 V ou F.");
  if (opts.includes("pegadinhas")) prefLines.push("- Misture os entendimentos para criar pegadinhas.");
  const prefs = prefLines.join("\n");

  const parts = [tpl.trim(), ""];
  if (prefs) parts.push("Preferências:", prefs, "");
  if (state.pendingObs) parts.push("Observação do usuário:", state.pendingObs, "");

  let i = 1;
  parts.push("Artigos-base:");
  for (const it of state.selected.values()) {
    parts.push(`### ${i}. ${it.title} — [${it.source}]`);
    parts.push(it.body || it.text, "");
    if (i++ >= MAX_SEL) break;
  }
  return parts.join("\n");
}

/* ---------- LOGO: resetar busca ---------- */
els.brand?.addEventListener("click", () => {
  els.q.value = "";
  els.stack.innerHTML = "";
  els.q.focus();
  toast("Busca reiniciada.");
});

/* ---------- init ---------- */
updateBottom();
