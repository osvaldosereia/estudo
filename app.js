/* ==========================
   direito.love — app.js (somente o que você pediu)
   - Top bar intacta (logo + busca)
   - Sem barra inferior / sem modais Estudar/Questões
   - Sem botões Estudar/Google nos cards
   - Toggle à esquerda; FAB à direita abre 3 bolinhas para a esquerda
   - Parser inalterado (split por "-----")
   ========================== */

/* Service Worker (opcional) */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);

const els = {
  form: $("#searchForm"),
  q: $("#searchInput"),
  spinner: $("#searchSpinner"),
  stack: $("#resultsStack"),
  brand: $("#brandBtn"),

  /* leitor */
  readerModal: $("#readerModal"),
  readerBody: $("#readerBody"),
  readerTitle: $("#readerTitle"),
  selCount: $("#selCount"),

  /* toasts */
  toasts: $("#toasts"),
};

/* ---------- estado ---------- */
const DEFAULT_FILE = "data/codigos/codigo_penal.txt"; // como não há seletor, usamos um padrão
const DEFAULT_LABEL = "Código Penal";

const MAX_SEL = 6;
const CARD_CHAR_LIMIT = 200;
const PREV_MAX = 60;

const state = {
  selected: new Map(),
  cacheTxt: new Map(),
  cacheParsed: new Map(),
  urlToLabel: new Map(),
};

/* ---------- util ---------- */
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  els.toasts.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}
function updateSelCount() {
  const n = state.selected.size;
  els.selCount && (els.selCount.textContent = `${n}/${MAX_SEL}`);
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
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

/* ---------- IO ---------- */
async function loadFile(url) {
  if (state.cacheTxt.has(url)) return state.cacheTxt.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao carregar: " + url);
  const txt = await res.text();
  state.cacheTxt.set(url, txt);
  return txt;
}

/* ---------- parser (inalterado) ---------- */
async function parseFile(url, label) {
  const key = url;
  if (state.cacheParsed.has(key)) return state.cacheParsed.get(key);

  const raw = await loadFile(url);
  const chunks = raw.split(/\n-{2,}\s*\n/g).map(s => s.trim()).filter(Boolean);

  const items = chunks.map((chunk, idx) => {
    const nl = chunk.indexOf("\n");
    const title = (nl >= 0 ? chunk.slice(0, nl) : chunk).trim();
    const body  = (nl >= 0 ? chunk.slice(nl+1) : "").trim();

    return {
      id: `${label.replace(/\s+/g,'_').toLowerCase()}_${idx+1}`,
      title,
      text: chunk,
      body,
      fileUrl: url,
      source: label,
      htmlId: `a_${idx+1}`
    };
  });

  state.cacheParsed.set(key, items);
  return items;
}

/* ---------- busca ---------- */
function matchItem(item, tokens) {
  const hay = norm(item.title + " " + item.text);
  return tokens.every(t => hay.includes(t));
}
function highlight(text, tokens) {
  let h = escHTML(text);
  tokens.forEach(t => {
    if (!t) return;
    const rx = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    h = h.replace(rx, "<mark>$1</mark>");
  });
  return h;
}
function truncatedHTML(text, tokens) {
  const clean = text.replace(/\s+/g, " ").trim();
  const truncated = clean.slice(0, CARD_CHAR_LIMIT) + (clean.length > CARD_CHAR_LIMIT ? "…" : "");
  return highlight(escHTML(truncated), tokens);
}

/* ---------- render ---------- */
function renderCard(item, tokens = [], ctx = {}) {
  const card = document.createElement("article");
  card.className = "card";

  // header
  const head = document.createElement("div");
  head.className = "head";
  const pill = document.createElement("button");
  pill.className = "pill";
  pill.type = "button";
  pill.textContent = item.source;
  pill.addEventListener("click", () => openReader(item, tokens));
  head.appendChild(pill);

  // body
  const body = document.createElement("div");
  body.className = "body is-collapsed";
  body.innerHTML = truncatedHTML(item.text, tokens);

  // actions
  const actions = document.createElement("div");
  actions.className = "actions";
  const leftZone = document.createElement("div");
  leftZone.className = "actions-left";
  const rightZone = document.createElement("div");
  rightZone.className = "actions-right";

  /* ---- toggle à ESQUERDA ---- */
  const text = (item.text || "").trim();
  const hasExpandable =
    (ctx?.context !== "reader") &&
    (text.length > CARD_CHAR_LIMIT || (item.body && item.body.trim().length > 0));

  if (hasExpandable) {
    const toggle = document.createElement("button");
    toggle.className = "toggle";
    toggle.textContent = "▼";
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", expanded ? "false" : "true");
      toggle.textContent = expanded ? "▼" : "▲";
      body.innerHTML = expanded ? truncatedHTML(item.text, tokens)
                                : highlight(item.text, tokens);
      body.classList.toggle("is-collapsed", expanded);
    });
    leftZone.append(toggle);
  }

  /* ---- FAB à DIREITA (3 bolinhas PNG pra esquerda) ---- */
  const fab = document.createElement("div");
  fab.className = "fab";

  const fabMenu = document.createElement("div");
  fabMenu.className = "fab-menu";

  const icons = ["icons/btn1.png", "icons/btn2.png", "icons/btn3.png"];
  icons.forEach((src, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "fab-item";
    const img = document.createElement("img");
    img.alt = "Ação " + (i+1);
    img.src = src;
    b.appendChild(img);
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      toast("Ação " + (i+1));
    });
    fabMenu.appendChild(b);
  });

  const fabMain = document.createElement("button");
  fabMain.type = "button";
  fabMain.className = "fab-main";
  const mainImg = document.createElement("img");
  mainImg.alt = "Mais ações";
  mainImg.src = "icons/more.png";
  fabMain.appendChild(mainImg);
  fabMain.addEventListener("click", (ev) => {
    ev.stopPropagation();
    fab.classList.toggle("open");
  });

  fab.appendChild(fabMenu);
  fab.appendChild(fabMain);
  rightZone.appendChild(fab);

  actions.append(leftZone, rightZone);

  // mount
  const left = document.createElement("div");
  left.append(head, body, actions);
  card.append(left);

  return card;
}

/* ---------- Leitor ---------- */
async function openReader(item, tokens = []) {
  els.readerTitle && (els.readerTitle.textContent = item.source);
  updateSelCount();
  els.readerBody && (els.readerBody.innerHTML = "");
  showModal(els.readerModal);

  // skeleton
  for (let i = 0; i < 3; i++) {
    const s = document.createElement("div");
    s.className = "skel block";
    s.style = "height:48px;margin:10px 0;background:linear-gradient(90deg,#eef1f6,#f6f7fb,#eef1f6);animation:pulse 1.2s ease-in-out infinite;border-radius:10px";
    els.readerBody.appendChild(s);
  }

  try {
    const items = await parseFile(item.fileUrl || DEFAULT_FILE, item.source || DEFAULT_LABEL);
    els.readerBody.innerHTML = "";

    items.forEach((a) => {
      const card = renderCard(a, tokens, { context: "reader" });
      card.id = a.htmlId;
      els.readerBody.appendChild(card);
    });

    const anchor = els.readerBody.querySelector(`#${CSS.escape(item.htmlId)}`);
    if (anchor) {
      anchor.scrollIntoView({ block: "center", behavior: "instant" });
      anchor.classList.add("highlight");
      setTimeout(() => anchor.classList.remove("highlight"), 1800);
    }
    els.readerBody.focus();
  } catch (e) {
    toast("Erro ao abrir o arquivo. Veja o console.");
    console.warn(e);
    hideModal(els.readerModal);
  }
}

/* ---------- Modal ---------- */
function showModal(el) { if (el) { el.hidden = false; document.body.style.overflow = "hidden"; } }
function hideModal(el) { if (el) { el.hidden = true; document.body.style.overflow = ""; } }

document.addEventListener("click", (e) => {
  if (e.target.matches("[data-close-modal]")) hideModal(els.readerModal);
  if (els.readerModal) {
    const backdrop = els.readerModal.querySelector(".modal-backdrop");
    if (e.target === backdrop) hideModal(els.readerModal);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (els.readerModal && !els.readerModal.hidden) hideModal(els.readerModal);
  }
});

/* ---------- Busca ---------- */
els.form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = (els.q?.value || "").trim();
  const fileUrl = DEFAULT_FILE;
  const label = DEFAULT_LABEL;

  els.stack.setAttribute("aria-busy", "true");
  els.spinner.hidden = false;
  els.stack.innerHTML = "";

  try {
    const items = await parseFile(fileUrl, label);
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    const results = q ? items.filter(it => matchItem(it, tokens)) : items.slice(0, 20);

    if (!results.length) {
      const empty = document.createElement("div");
      empty.className = "block-empty";
      empty.textContent = "Nenhum resultado.";
      els.stack.appendChild(empty);
    } else {
      for (const it of results) {
        // injeta o fileUrl/label para o leitor funcionar
        it.fileUrl = fileUrl;
        it.source = label;
        const card = renderCard(it, tokens);
        els.stack.appendChild(card);
      }
    }
  } catch (err) {
    console.error(err);
    toast("Erro ao buscar.");
  } finally {
    els.spinner.hidden = true;
    els.stack.setAttribute("aria-busy", "false");
  }
});

/* ---------- logo: reset ---------- */
els.brand?.addEventListener("click", () => {
  els.q && (els.q.value = "");
  els.stack && (els.stack.innerHTML = "");
  els.q?.focus();
  toast("Busca reiniciada.");
});
