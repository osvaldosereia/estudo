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
  // busca / resultados
  form: $("#searchForm"),
  q: $("#searchInput"),
  spinner: $("#searchSpinner"),
  stack: $("#resultsStack"),
  codeSelect: $("#codeSelect"),
  toasts: $("#toasts"),
  brand: $("#brand"),

  // leitor (modal)
  readerModal: $("#readerModal"),
  readerTitle: $("#readerTitle"),
  readerBody: $("#readerBody"),
  selCount: $("#selCount"),

  // “ver selecionados”
  viewBtn: $("#viewBtn"),
  selectedModal: $("#selectedModal"),
  selectedStack: $("#selectedStack"),

  // estudar / questões (se existirem na página)
  studyBtn: $("#studyBtn"),
  studyModal: $("#studyModal"),
  studyList: $("#studyList"),
  questionsBtn: $("#questionsBtn"),
  questionsModal: $("#questionsModal"),
};

const MAX_SEL = 6;
const CARD_CHAR_LIMIT = 200; // preview em cards
const PREV_MAX_LINES = 6;

/* ---------- estado ---------- */
const state = {
  selected: new Map(),     // id -> item
  cacheTxt: new Map(),     // url -> string
  cacheParsed: new Map(),  // url -> items[]
  urlToLabel: new Map(),
};

/* ---------- util ---------- */
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  els.toasts?.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

function updateBottom() {
  const n = state.selected.size;
  els.viewBtn && (els.viewBtn.textContent = `${n} Selecionados – Ver`);
  els.studyBtn && (els.studyBtn.disabled = n === 0);
  els.questionsBtn && (els.questionsBtn.disabled = n === 0);
  els.selCount && (els.selCount.textContent = `${n}/${MAX_SEL}`);
}

/** Normaliza acentos e pontuação básica */
function baseNorm(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Converte 1.000 -> 1000, 2.345.678 -> 2345678 */
function normalizeThousands(s) {
  return s.replace(/(?<=^|\D)(\d{1,3}(?:\.\d{3})+)(?=\D|$)/g, (m) => m.replace(/\./g, ""));
}

/** Normalização para indexação / busca */
function norm(s) {
  return normalizeThousands(
    baseNorm(String(s))
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
  );
}

/** Tokenização conforme regras:
 * - palavras com 3+ letras
 * - números com 1 a 4 dígitos
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
  return Array.from(new Set(tokens)); // únicos p/ buscar
}

/** Realça TODAS as ocorrências dos tokens dentro de um texto (case/acentos-insensitive) */
function highlightAll(htmlText, tokens) {
  if (!tokens?.length) return htmlText;

  // cria um regex global que respeita números e palavras
  const parts = tokens
    .map((t) =>
      t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // escape
    )
    .filter(Boolean);

  if (!parts.length) return htmlText;

  // flag u para unicode, i para case-insensitive, g para global
  const rx = new RegExp(`\\b(${parts.join("|")})\\b`, "giu");

  // Para comparação sem acento, vamos substituir via função que compara normalizado
  // Estratégia: percorre o texto plain e reconstrói com tags.
  const text = htmlText;
  let out = "";
  let last = 0;

  // Precisamos trabalhar sobre versão sem HTML. Como o corpo que passamos aqui é plain (inserimos via textContent e depois transformamos), fica ok.
  // Se vier com <br>, vamos comparar sobre o texto “visível”.
  const plain = text;

  let m;
  while ((m = rx.exec(plain)) !== null) {
    const start = m.index;
    const end = rx.lastIndex;
    out += plain.slice(last, start);
    out += `<mark class="hl">${plain.slice(start, end)}</mark>`;
    last = end;
  }
  out += plain.slice(last);
  return out;
}

/** Sanitiza texto bruto */
function sanitize(txt) {
  return (txt || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n");
}

/** Busca texto de arquivo com cache */
async function fetchText(url) {
  const u = encodeURI(url);
  if (state.cacheTxt.has(u)) return state.cacheTxt.get(u);
  const r = await fetch(u, { cache: "no-cache" });
  if (!r.ok) throw new Error(`fetch-fail ${r.status} ${u}`);
  const t = sanitize(await r.text());
  state.cacheTxt.set(u, t);
  return t;
}

/** Split: linhas com 5+ hifens (-----) separam blocos */
function splitBlocks(txt) {
  return sanitize(txt)
    .split(/^\s*-{5,}\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parser:
 * título = 1ª linha não vazia
 * body   = restante (preservado)
 * text   = título + "\n" + body (para index)
 */
function parseBlock(block, idx, fileUrl, sourceLabel) {
  const lines = block.split("\n");
  const firstIdx = lines.findIndex((l) => l.trim().length > 0);
  const title = firstIdx >= 0 ? lines[firstIdx].trim() : `Bloco ${idx + 1}`;
  const body = lines.slice(firstIdx + 1).join("\n").trim();
  const text = body ? `${title}\n${body}` : title;

  // id estável: url#idx
  const id = `${fileUrl}#${idx}`;

  return {
    id,
    title,
    body,     // SEM título
    text,     // título + corpo (para busca)
    source: sourceLabel || fileUrl,
    fileUrl,
  };
}

/** Parse de um arquivo completo */
async function parseFile(url, label) {
  if (state.cacheParsed.has(url)) return state.cacheParsed.get(url);
  const txt = await fetchText(url);
  const blocks = splitBlocks(txt);
  const items = blocks.map((b, i) => parseBlock(b, i, url, label));
  state.cacheParsed.set(url, items);
  return items;
}

/* ---------- busca ---------- */
async function search(term) {
  els.stack.innerHTML = "";
  if (!term || !term.trim()) {
    toast("Digite um termo.");
    return;
  }

  const tokens = tokenize(term);
  if (!tokens.length) {
    toast("Use palavras com 3+ letras ou números (1–4 dígitos).");
    return;
  }

  // skeleton
  const sk = document.createElement("div");
  sk.className = "skel";
  els.stack.appendChild(sk);
  els.spinner?.classList.add("show");

  // opções (todos os arquivos do select)
  const options = Array.from(els.codeSelect?.querySelectorAll("option") || [])
    .map((o) => ({ url: (o.value || "").trim(), label: (o.textContent || "").trim() }))
    .filter((o) => o.url);

  const results = [];
  for (const { url, label } of options) {
    try {
      const items = await parseFile(url, label);
      for (const it of items) {
        const bag = norm(it.text);
        // todos os tokens precisam aparecer
        const ok = tokens.every((t) => bag.includes(t));
        if (ok) results.push(it);
      }
    } catch (err) {
      console.warn("Falha ao carregar:", url, err);
      toast(`Falha ao carregar: ${label}`);
    }
  }

  els.spinner?.classList.remove("show");
  sk.remove();

  if (!results.length) {
    const empty = document.createElement("div");
    empty.className = "block-empty";
    empty.textContent = "Nenhum resultado.";
    els.stack.appendChild(empty);
    return;
  }

  // render
  const frag = document.createDocumentFragment();
  for (const it of results) {
    frag.appendChild(renderCard(it, tokens, { context: "results" }));
  }
  els.stack.appendChild(frag);
}

/* ---------- cards ---------- */
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

  // preview: usa SÓ body, com limite de 200 chars
  const preview = document.createElement("p");
  preview.className = "card-prev";

  // preview plain → vira HTML com marcações
  const prevText = truncateText(item.body || "", CARD_CHAR_LIMIT);
  preview.innerHTML = tokens.length ? highlightAll(prevText, tokens) : prevText;

  // rodapé com ações
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

/* ---------- leitor (modal de leitura única) ---------- */
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

/** Leitor: elimina título duplicado.
 * h4 = item.title
 * body = APENAS item.body (sem repetir o título)
 * highlight aplicado no body.
 */
async function openReader(item, tokens = []) {
  if (!els.readerModal) return;
  els.readerTitle.textContent = item.title;
  els.readerBody.innerHTML = "";

  const body = (item.body && item.body.trim()) ? item.body : ""; // nunca usa text aqui
  const textHtml = tokens.length ? highlightAll(body, tokens) : body;

  // transforma \n em <br> (visual)
  const html = textHtml.split("\n").map((l) => l || "").join("<br>");
  const container = document.createElement("div");
  container.className = "reader-text";
  container.innerHTML = html;

  els.readerBody.appendChild(container);
  showModal(els.readerModal);
}

/* Fecha modais por clique no backdrop ou ESC */
document.addEventListener("click", (e) => {
  const backdrop = e.target.closest(".modal-backdrop");
  if (!backdrop) return;
  const modal = backdrop.parentElement;
  hideModal(modal);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    [els.readerModal, els.selectedModal, els.studyModal, els.questionsModal]
      .filter(Boolean)
      .forEach((m) => { if (!m.hidden) hideModal(m); });
  }
});

/* ---------- VER SELECIONADOS (sem título duplicado) ---------- */
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
      els.selectedStack.appendChild(renderCard(it, [], { context: "selected" }));
    }
  }

  showModal(els.selectedModal);
});

/* ---------- busca: submit ---------- */
els.form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = els.q?.value || "";
  search(q);
});

/* ---------- reset pela marca ---------- */
els.brand?.addEventListener("click", () => {
  els.q && (els.q.value = "");
  els.stack && (els.stack.innerHTML = "");
  els.q?.focus();
  toast("Busca reiniciada.");
});

/* ---------- init ---------- */
updateBottom();

/* ========= OBS:
1) Se houver um modal que lista o arquivo completo, use a MESMA regra do leitor:
   - título no cabeçalho
   - corpo renderizado com (item.body) — nunca com (item.text)
   Se você tem uma função própria desse modal, troque qualquer uso de `a.text` por:
     `const display = (a.body && a.body.trim()) ? a.body : "";`
     e renderize o `display`.
2) O highlight funciona em cards, leitor e onde você usar `highlightAll`.
========= */
