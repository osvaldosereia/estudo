/* app.js — direito.love (robusto) */
document.addEventListener("DOMContentLoaded", () => {
  // ==========================
  // Helpers
  // ==========================
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const escapeReg = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const DEBOUNCE_MS = 250;
  const MAX_RESULTS_PER_DOC = 50;
  const MAX_SELECTED = 8;

  // ==========================
  // DOM
  // ==========================
  const codeSelect = $("#codeSelect");
  const searchForm = $("#searchForm");
  const searchInput = $("#searchInput");
  const searchSpinner = $("#searchSpinner");
  const resultsStack = $("#resultsStack");

  const viewBtn = $("#viewBtn");
  const studyBtn = $("#studyBtn");
  const questionsBtn = $("#questionsBtn");

  const readerModal = $("#readerModal");
  const readerBody = $("#readerBody");
  const readerSelCount = $("#selCount");

  const studyModal = $("#studyModal");
  const studyList = $("#studyList");
  const studyUpdate = $("#studyUpdate");
  const copyPromptBtn = $("#copyPromptBtn");

  const questionsModal = $("#questionsModal");
  const questionsList = $("#questionsList");
  const questionsUpdate = $("#questionsUpdate");
  const copyQuestionsBtn = $("#copyQuestionsBtn");

  const selectedModal = $("#selectedModal");
  const selectedStack = $("#selectedStack");

  // Índice (agora com elementos garantidos)
  const siRoot = $("#searchIndex");
  const siTrigger = siRoot ? $(".si-trigger", siRoot) : null;
  const siPanel = siRoot ? $(".si-panel", siRoot) : null;
  const siList = siRoot ? $("#siList") : null;

  // ==========================
  // Catálogo & cache
  // ==========================
  /** @type {{name:string, url:string, group:string}[]} */
  const catalog = [];
  for (const og of $$("#codeSelect optgroup")) {
    const group = og.getAttribute("label") || "";
    for (const opt of $$("option", og)) {
      const url = opt.value?.trim();
      const name = opt.textContent.trim();
      if (url && name) {
        // Resolve relativo ao documento (garante /estudo/… no GitHub Pages)
        const abs = new URL(url, document.baseURI).toString();
        catalog.push({ name, url: abs, group });
      }
    }
  }

  /** cache de textos */
  const textCache = new Map();  // url -> string

  async function getText(url) {
    if (textCache.has(url)) return textCache.get(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
    const txt = await res.text();
    textCache.set(url, txt);
    return txt;
  }

  // ==========================
  // Busca
  // ==========================
  let debounceTimer = null;
  on(searchForm, "submit", (e) => {
    e.preventDefault();
    runSearch(searchInput.value);
  });
  on(searchInput, "input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(searchInput.value), DEBOUNCE_MS);
  });

  function setBusy(v) {
    searchForm?.setAttribute("aria-busy", v ? "true" : "false");
    searchSpinner?.classList.toggle("show", !!v);
  }

  function clearResults() {
    resultsStack.innerHTML = "";
  }

  const selected = new Set();
  const selectedData = new Map();
  const firstCardId = new Map();

  function refreshBottom() {
    const count = selected.size;
    viewBtn.textContent = `${count} ✔️ – Ver`;
    const enable = count > 0;
    [studyBtn, questionsBtn].forEach(b => (b.disabled = !enable));
    readerSelCount.textContent = `${count}/${MAX_SELECTED}`;
  }

  function normalizeQuery(q) {
    return (q || "").trim();
  }

  function snippetAround(text, idx, qlen, span = 120) {
    const start = clamp(idx - span, 0, Math.max(0, text.length - 1));
    const end = clamp(idx + qlen + span, 0, text.length);
    let snip = text.slice(start, end).replace(/\s+/g, " ");
    if (start > 0) snip = snip.replace(/^[^ ]+/, "…");
    if (end < text.length) snip = snip.replace(/[^ ]+$/, "") + "…";
    return snip;
  }

  function highlight(s, q) {
    if (!q) return s;
    const rx = new RegExp(`(${escapeReg(q)})`, "ig");
    return s.replace(rx, `<mark class="hl">$1</mark>`);
  }

  function toast(msg, ms = 1800) {
    const box = document.getElementById("toasts");
    if (!box) return console.warn("[toast]", msg);
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      setTimeout(() => box.removeChild(t), 300);
    }, ms);
  }

  function makeCard({ docName, url, snippetHTML, iResult }) {
    const id = `res-${docName.replace(/\W+/g, "-")}-${iResult}`;
    if (!firstCardId.has(docName)) firstCardId.set(docName, id);

    const el = document.createElement("article");
    el.className = "card";
    el.id = id;
    el.dataset.doc = docName;

    el.innerHTML = `
      <div class="pill">
        <span style="width:10px;height:10px;border-radius:3px;background:#9ecbff;display:inline-block"></span>
        <span>${docName}</span>
        <a href="${url}" target="_blank" rel="noopener" style="margin-left:6px; text-decoration:underline; color:#1e3a8a">(abrir)</a>
      </div>

      <div class="body">${snippetHTML}</div>

      <div class="actions">
        <button class="btn toggle" data-action="reader">ver texto</button>
        <label class="chk" tabindex="0" role="checkbox" aria-checked="false">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l5 5 11-11" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </label>
      </div>
    `;

    const chk = $(".chk", el);
    on(chk, "click", () => toggleSelect(el, docName, snippetHTML));
    on(chk, "keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleSelect(el, docName, snippetHTML);
      }
    });

    const btnReader = $('.btn.toggle[data-action="reader"]', el);
    on(btnReader, "click", () => openReader(docName, url));

    return el;
  }

  function toggleSelect(cardEl, docName, snippetHTML) {
    const key = cardEl.id;
    const was = selected.has(key);
    if (!was && selected.size >= MAX_SELECTED) {
      toast(`Máximo de ${MAX_SELECTED} selecionados.`);
      return;
    }
    if (was) {
      selected.delete(key);
      selectedData.delete(key);
    } else {
      selected.add(key);
      selectedData.set(key, { doc: docName, snippet: snippetHTML });
    }
    const chk = $(".chk", cardEl);
    const now = selected.has(key);
    chk.dataset.checked = now ? "true" : "false";
    chk.setAttribute("aria-checked", now ? "true" : "false");
    refreshBottom();
  }

  // ==========================
  // Índice flutuante
  // ==========================
  function toggleIndex(open) {
    if (!siRoot) return;
    const want = open ?? !siPanel.classList.contains("open");
    siPanel.classList.toggle("open", want);
    siTrigger.setAttribute("aria-expanded", want ? "true" : "false");
  }
  on(siTrigger, "click", () => toggleIndex());

  function buildSearchIndex(counts, firstIds, query) {
    if (!siRoot) return;
    siList.innerHTML = "";
    const items = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => a[0].localeCompare(b[0]));
    if (items.length === 0) {
      siRoot.hidden = true;
      siRoot.setAttribute("aria-hidden", "true");
      return;
    }
    siRoot.hidden = false;
    siRoot.setAttribute("aria-hidden", "false");

    for (const [doc, n] of items) {
      const entry = catalog.find(c => c.name === doc);
      const url = entry?.url;
      const li = document.createElement("li");
      li.className = "si-item";
      li.innerHTML = `
        <span class="si-dot" aria-hidden="true"></span>
        <span class="si-name" title="${doc}">${doc}</span>
        <button class="si-open" type="button">abrir</button>
        <span class="si-count">${n}</span>
      `;
      $(".si-open", li)?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (url) window.open(url, "_blank", "noopener");
      });
      li.addEventListener("click", () => {
        const id = firstIds.get(doc);
        const el = id && document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        toggleIndex(false);
      });
      siList.appendChild(li);
    }
    if (query) toggleIndex(true);
  }

  // ==========================
  // Leitor
  // ==========================
  async function openReader(docName, url) {
    try {
      const txt = await getText(url);
      const parts = txt.split(/\n{2,}/).map(s => s.trim()).filter(Boolean).slice(0, 200);
      const frag = document.createDocumentFragment();
      parts.forEach((p, i) => {
        const sec = document.createElement("div");
        sec.className = "article";
        sec.innerHTML = `
          <div class="a-chk"></div>
          <div>
            <h4>${docName} — ${i + 1}</h4>
            <div class="a-body">${p.replace(/\n/g, "<br>")}</div>
          </div>
        `;
        frag.appendChild(sec);
      });
      readerBody.innerHTML = "";
      readerBody.appendChild(frag);
      openModal(readerModal);
    } catch (e) {
      toast("Não consegui abrir o texto.");
      console.error(e);
    }
  }

  // ==========================
  // Modais genéricos
  // ==========================
  function openModal(modalEl) {
    modalEl.hidden = false;
    modalEl.setAttribute("aria-hidden", "false");
    const body = $(".modal-body", modalEl);
    body && body.focus && body.focus();
  }
  function closeModal(modalEl) {
    modalEl.hidden = true;
    modalEl.setAttribute("aria-hidden", "true");
  }
  $$("[data-close-modal]").forEach(b => on(b, "click", () => closeModal(readerModal)));
  $$("[data-close-study]").forEach(b => on(b, "click", () => closeModal(studyModal)));
  $$("[data-close-questions]").forEach(b => on(b, "click", () => closeModal(questionsModal)));
  $$("[data-close-sel]").forEach(b => on(b, "click", () => closeModal(selectedModal)));
  $$(".modal-backdrop").forEach(b => on(b, "click", () => {
    const parent = b.parentElement;
    if (parent) closeModal(parent);
  }));

  // ==========================
  // Estudar / Questões / Selecionados
  // ==========================
  function rebuildLists() {
    const docs = Array.from(new Set(Array.from(selectedData.values()).map(v => v.doc)));
    studyList.innerHTML = docs.map(d => `<li class="mini-item"><div class="mini-title">${d}</div></li>`).join("");
    questionsList.innerHTML = docs.map(d => `<li class="mini-item"><div class="mini-title">${d}</div></li>`).join("");
  }

  on(studyBtn, "click", () => { rebuildLists(); openModal(studyModal); });
  on(questionsBtn, "click", () => { rebuildLists(); openModal(questionsModal); });
  on(viewBtn, "click", () => {
    const items = Array.from(selectedData.values());
    selectedStack.innerHTML = items.map(it => `
      <article class="card"><div class="body">${it.snippet}</div></article>
    `).join("");
    openModal(selectedModal);
  });
  on(studyUpdate, "click", () => rebuildLists());
  on(questionsUpdate, "click", () => rebuildLists());

  on(copyPromptBtn, "click", async () => {
    const topics = Array.from(new Set(Array.from(selectedData.values()).map(v => v.doc)));
    const prompt = `Quero estudar os seguintes tópicos jurídicos: ${topics.join(", ")}.
- Explique de forma didática, com exemplos práticos e comparações quando útil.
- Estruture em: visão geral, conceitos-chave, jurisprudência relevante, pegadinhas de prova, check-list de revisão.`;
    await navigator.clipboard.writeText(prompt);
    toast("Prompt copiado!");
  });
  on(copyQuestionsBtn, "click", async () => {
    const topics = Array.from(new Set(Array.from(selectedData.values()).map(v => v.doc)));
    const prompt = `Gere uma lista de questões inéditas sobre: ${topics.join(", ")}.
Regras:
- 2 casos concretos, 2 dissertativas, 2 V/F, e 4 múltipla escolha (A–E, 1 correta).
- Balanceie a dificuldade (3 fáceis, 4 médias, 3 difíceis).
- Alternativas com extensão semelhante; enunciados autossuficientes; distratores plausíveis.`;
    await navigator.clipboard.writeText(prompt);
    toast("Prompt copiado!");
  });

  // ==========================
  // Execução da busca (robusta)
  // ==========================
  async function runSearch(query) {
    const q = normalizeQuery(query);
    if (q.length < 2) {
      clearResults();
      if (siRoot) { siRoot.hidden = true; siRoot.setAttribute("aria-hidden","true"); }
      return;
    }

    setBusy(true);
    clearResults();
    firstCardId.clear();

    try {
      // tenta carregar todos; não falha o conjunto se um quebrar
      const loads = await Promise.allSettled(
        catalog.map(async c => ({
          doc: c.name,
          url: c.url,
          text: await getText(c.url)
        }))
      );

      const failed = loads.filter(x => x.status === "rejected");
      if (failed.length) {
        toast(`Aviso: ${failed.length} arquivo(s) não carregaram.`);
        console.warn("Falhas de carregamento:", failed);
      }

      const ok = loads
        .filter(x => x.status === "fulfilled")
        .map(x => x.value);

      const counts = {};
      const frag = document.createDocumentFragment();

      for (const { doc, url, text } of ok) {
        const rx = new RegExp(escapeReg(q), "ig");
        let m, i = 0, n = 0;
        while ((m = rx.exec(text)) && i < MAX_RESULTS_PER_DOC) {
          n++;
          const snip = snippetAround(text, m.index, q.length, 180);
          const snipHTML = highlight(snip, q);
          frag.appendChild(makeCard({
            docName: doc,
            url,
            snippetHTML: snipHTML,
            iResult: i
          }));
          i++;
          if (m.index === rx.lastIndex) rx.lastIndex++; // segurança
        }
        counts[doc] = n;
      }

      const total = Object.values(counts).reduce((a,b) => a + b, 0);
      if (total === 0) {
        resultsStack.innerHTML = `<p class="block-empty">Nada encontrado para “${q}”.</p>`;
        if (siRoot) { siRoot.hidden = true; siRoot.setAttribute("aria-hidden","true"); }
      } else {
        resultsStack.appendChild(frag);
        buildSearchIndex(counts, firstCardId, q);
      }

    } catch (err) {
      console.error(err);
      resultsStack.innerHTML = `<p class="block-empty">Erro ao buscar. Veja o console.</p>`;
    } finally {
      setBusy(false);
    }
  }

  // ==========================
  // Boot
  // ==========================
  refreshBottom();

  on(document, "keydown", (e) => {
    if (e.key === "Escape") {
      if (siPanel?.classList.contains("open")) toggleIndex(false);
      else [readerModal, studyModal, questionsModal, selectedModal]
        .forEach(m => !m.hidden && m && (m.hidden = true, m.setAttribute("aria-hidden","true")));
    }
  });

  // Busca inicial se vier ?q=
  try {
    const u = new URL(location.href);
    const q = u.searchParams.get("q");
    if (q) {
      searchInput.value = q;
      runSearch(q);
    }
  } catch {}
});
