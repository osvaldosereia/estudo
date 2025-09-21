/* ==========================
   direito.love — app.js (revisado)
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
  // topo / busca
  brandBtn: $("#brandBtn"),
  form: $("#searchForm"),
  q: $("#searchInput"),
  spinner: $("#searchSpinner"),
  stack: $("#resultsStack"),
  codeSelect: $("#codeSelect"),
  toasts: $("#toasts"),

  // leitor
  readerModal: $("#readerModal"),
  readerTitle: $("#readerTitle"),
  readerBody: $("#readerBody"),
  selCount: $("#selCount"),

  // selecionados
  viewBtn: $("#viewBtn"),
  selectedModal: $("#selectedModal"),
  selectedStack: $("#selectedStack"),

  // estudar / questões (se presentes)
  studyBtn: $("#studyBtn"),
  studyModal: $("#studyModal"),
  studyList: $("#studyList"),
  questionsBtn: $("#questionsBtn"),
  questionsModal: $("#questionsModal"),
  questionsList: $("#questionsList"),
};

const MAX_SEL = 6;
const CARD_CHAR_LIMIT = 200;

/* ---------- estado ---------- */
const state = {
  selected: new Map(),     // id -> item
  cacheTxt: new Map(),     // url -> string
  cacheParsed: new Map(),  // url -> items[]
};

/* ---------- UI util ---------- */
function toast(msg) {
  if (!els.toasts) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  els.toasts.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

function setBusy(flag) {
  els.spinner?.classList.toggle("show", !!flag);
  $("[aria-live='polite']")?.setAttribute("aria-busy", flag ? "true" : "false");
}

function updateBottom() {
  const n = state.selected.size;
  els.viewBtn && (els.viewBtn.textContent = `${n} Selecionados – Ver`);
  els.studyBtn && (els.studyBtn.disabled = n === 0);
  els.questionsBtn && (els.questionsBtn.disabled = n === 0);
  els.selCount && (els.selCount.textContent = `${n}/${MAX_SEL}`);
}

/* ---------- Normalização / Parser ---------- */
/** Remove acentos e normaliza espaços/aspas */
function baseNorm(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Converte 1.000 -> 1000, 2.345.678 -> 2345678 */
function normalizeThousands(s) {
  return s.replace(/(?<=^|\D)(\d{1,3}(?:\.\d{3})+)(?=\D|$)/g, (m) => m.replace(/\./g, ""));
}

/** Normalização para indexação/busca (minúsculas, sem pontuação) */
function norm(s) {
  return normalizeThousands(
    baseNorm(String(s))
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
  );
}

/** Tokenização:
 * - Palavras com 3+ letras
 * - Números com 1–4 dígitos (cada número individualmente)
 */
function tokenize(query) {
  const q = norm(query);
  const words = q.split(/\s+/).filter(Boolean);
  const tokens = [];
  for (const w of words) {
    if (/^\d{1,4}$/.test(w)) {
      tokens.push(w);
    } else if (/^\p{L}{3,}$/u.test(w)) {
      tokens.push(w);
    }
  }
  // Únicos para busca; grifamos todas as ocorrências depois
  return Array.from(new Set(tokens));
}

/** Grifa TODAS as ocorrências de TODOS os tokens (repetidas inclusive) */
function highlightAll(plainText, tokens) {
  if (!tokens?.length) return plainText;

  const parts = tokens
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean);

  if (!parts.length) return plainText;

  // global + unicode + case-insensitive
  const rx = new RegExp(`\\b(${parts.join("|")})\\b`, "giu");

  let out = "";
  let last = 0;
  let m;
  while ((m = rx.exec(plainText)) !== null) {
    const start = m.index;
    const end = rx.lastIndex;
    out += plainText.slice(last, start);
    out += `<mark class="hl">${plainText.slice(start, end)}</mark>`;
    last = end;
  }
  out += plainText.slice(last);
  return out;
}

/** Sanitiza quebras e espaços */
function sanitize(txt) {
  return (txt || "")
    .replace(/\r\n?/g, "\n")
  ;
}

/** Divide por linhas com 5+ hifens (-----) */
function splitBlocks(txt) {
  return sanitize(txt)
    .split(/^\s*-{5,}\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Monta item:
 *  title = primeira linha não vazia
 *  body  = restante SEM título
 *  text  = title + "\n" + body (para index/busca)
 */
function parseBlock(block, idx, fileUrl, label) {
  const lines = block.split("\n");
  const firstIdx = lines.findIndex((l) => l.trim().length > 0);
  const title = firstIdx >= 0 ? lines[firstIdx].trim() : `Bloco ${idx + 1}`;
  const body = lines.slice(firstIdx + 1).join("\n").trim();
  const text = body ? `${title}\n${body}` : title;
  return {
    id: `${fileUrl}#${idx}`,
    title,
    body,   // SEM título
    text,   // título + corpo (indexação)
    source: label || fileUrl,
    fileUrl,
  };
}

async function fetchText(url) {
  const u = encodeURI(url);
  if (state.cacheTxt.has(u)) return state.cacheTxt.get(u);
  const r = await fetch(u, { cache: "no-cache" });
  if (!r.ok) throw new Error(`Falha ao carregar ${u}: ${r.status}`);
  const t = sanitize(await r.text());
  state.cacheTxt.set(u, t);
  return t;
}

async function parseFile(url, label) {
  if (state.cacheParsed.has(url)) return state.cacheParsed.get(url);
  const txt = await fetchText(url);
  const blocks = splitBlocks(txt);
  const items = blocks.map((b, i) => parseBlock(b, i, url, label));
  state.cacheParsed.set(url, items);
  return items;
}

/* ---------- Busca ---------- */
async function search(term) {
  els.stack.innerHTML = "";
  const tokens = tokenize(term);

  if (!term || !term.trim()) {
    toast("Digite um termo.");
    return;
  }
  if (!tokens.length) {
    toast("Use palavras com 3+ letras ou números (1–4 dígitos).");
    return;
  }

  // skeleton
  const sk = document.createElement("div");
  sk.className = "skel";
  els.stack.appendChild(sk);
  setBusy(true);

  // todos os arquivos do select
  const options = Array.from(els.codeSelect?.querySelectorAll("option") || [])
    .map((o) => ({ url: (o.value || "").trim(), label: (o.textContent || "").trim() }))
    .filter((o) => o.url);

  const results = [];
  for (const { url, label } of options) {
    try {
      const items = await parseFile(url, label);
      for (const it of items) {
        const bag = norm(it.text);
        const ok = tokens.every((t) => bag.includes(t));
        if (ok) results.push(it);
      }
    } catch (e) {
      console.warn("Erro ao ler", url, e);
      toast(`Falha ao carregar: ${label}`);
    }
  }

  setBusy(false);
  sk.remove();

  if (!results.length) {
    const empty = document.createElement("div");
    empty.className = "block-empty";
    empty.textContent = "Nenhum resultado.";
    els.stack.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const it of results) {
    frag.appendChild(renderCard(it, tokens, { context: "results" }));
  }
  els.stack.appendChild(frag);
}

/* ---------- Cards ---------- */
function truncateText(s, n = CARD_CHAR_LIMIT) {
  if (!s) return "";
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= n) return clean;
  return clean.slice(0, n - 1) + "…";
}

function renderCard(item, tokens = [], ctx = { context: "results" }) {
  const card = document.createElement("article");
  card.className = "card";

  // título (sem duplicação)
  const h = document.createElement("h4");
  h.className = "card-title";
  h.textContent = item.title;

  // preview: usa SÓ body (sem título) + limite 200 chars
  const preview = document.createElement("p");
  preview.className = "card-prev";
  const prevText = truncateText(item.body || "", CARD_CHAR_LIMIT);
  preview.innerHTML = tokens.length ? highlightAll(prevText, tokens) : prevText;

  // rodapé
  const footer = document.createElement("div");
  footer.className = "card-foo";

  const meta = document.createElement("span");
  meta.className = "card-meta";
  meta.textContent = item.source;

  const btnOpen = document.createElement("button");
  btnOpen.className = "btn";
  btnOpen.textContent = "ver texto";
  btnOpen.addEventListener("click", () => openReader(item, tokens));

  const btnSel = document.createElement("button");
  btnSel.className = "btn ghost";
  btnSel.textContent = state.selected.has(item.id) ? "remover" : "selecionar";
  btnSel.addEventListener("click", () => {
    if (state.selected.has(item.id)) {
      state.selected.delete(item.id);
      btnSel.textContent = "selecionar";
      toast(`Removido (${state.selected.size}/${MAX_SEL}).`);
      if (ctx.context === "selected") card.remove();
    } else {
      if (state.selected.size >= MAX_SEL) {
        toast("Limite de 6 blocos.");
        return;
      }
      state.selected.set(item.id, { ...item });
      btnSel.textContent = "remover";
      toast(`Adicionado (${state.selected.size}/${MAX_SEL}).`);
    }
    updateBottom();
  });

  footer.append(meta, btnOpen, btnSel);
  card.append(h, preview, footer);
  return card;
}

/* ---------- Leitor (modal) ---------- */
function showModal(modalEl) {
  if (!modalEl) return;
  modalEl.hidden = false;
  modalEl.classList.add("open");
}
function hideModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove("open");
  modalEl.hidden = true;
}

/** Leitor: nunca usa `text` no corpo para evitar duplicação do título */
function openReader(item, tokens = []) {
  if (!els.readerModal) return;

  // título
  els.readerTitle.textContent = item.title;

  // corpo: APENAS body
  const body = (item.body && item.body.trim()) ? item.body : "";
  const htmlMarked = tokens.length ? highlightAll(body, tokens) : body;

  // \n -> <br>
  const html = htmlMarked.split("\n").map((l) => l || "").join("<br>");

  els.readerBody.innerHTML = `<div class="reader-text">${html}</div>`;
  showModal(els.readerModal);
}

/* Fechamento de modais por atributos data- */
document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.matches("[data-close-modal]")) hideModal(els.readerModal);
  if (t.matches("#readerModal .modal-backdrop")) hideModal(els.readerModal);

  if (t.matches("[data-close-sel]")) hideModal(els.selectedModal);
  if (t.matches("#selectedModal .modal-backdrop")) hideModal(els.selectedModal);

  if (t.matches("[data-close-study]")) hideModal(els.studyModal);
  if (t.matches("#studyModal .modal-backdrop")) hideModal(els.studyModal);

  if (t.matches("[data-close-questions]")) hideModal(els.questionsModal);
  if (t.matches("#questionsModal .modal-backdrop")) hideModal(els.questionsModal);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  [els.readerModal, els.selectedModal, els.studyModal, els.questionsModal]
    .filter(Boolean)
    .forEach((m) => { if (!m.hidden) hideModal(m); });
});

/* ---------- Ver selecionados ---------- */
els.viewBtn?.addEventListener("click", () => {
  if (!els.selectedModal) return;
  els.selectedStack.innerHTML = "";

  if (!state.selected.size) {
    const empty = document.createElement("div");
    empty.className = "block-empty";
    empty.textContent = "Nenhum bloco selecionado.";
    els.selectedStack.appendChild(empty);
  } else {
    for (const it of state.selected.values()) {
      // nos cards do modal, a lógica é a MESMA (título no h4, preview só do body)
      els.selectedStack.appendChild(renderCard(it, [], { context: "selected" }));
    }
  }
  showModal(els.selectedModal);
});

/* ---------- Estudar / Questões (listas básicas) ---------- */
function syncLists() {
  if (!els.studyList && !els.questionsList) return;
  const items = Array.from(state.selected.values());

  if (els.studyList) {
    els.studyList.innerHTML = "";
    items.forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it.title;
      els.studyList.appendChild(li);
    });
  }
  if (els.questionsList) {
    els.questionsList.innerHTML = "";
    items.forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it.title;
      els.questionsList.appendChild(li);
    });
  }
}
els.studyBtn?.addEventListener("click", () => {
  syncLists();
  showModal(els.studyModal);
});
els.questionsBtn?.addEventListener("click", () => {
  syncLists();
  showModal(els.questionsModal);
});

/* ---------- Eventos principais ---------- */
els.form?.addEventListener("submit", (e) => {
  e.preventDefault();
  search(els.q?.value || "");
});
els.brandBtn?.addEventListener("click", () => {
  els.q && (els.q.value = "");
  els.stack && (els.stack.innerHTML = "");
  toast("Pronto. Digite o que quer buscar.");
  els.q?.focus();
});

/* ---------- Init ---------- */
updateBottom();
