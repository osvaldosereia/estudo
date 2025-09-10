// ===== Sidebar =====
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
document.getElementById("menuBtn").onclick = () => {
  sidebar.classList.add("open");
  overlay.classList.add("show");
};
overlay.onclick = () => {
  sidebar.classList.remove("open");
  overlay.classList.remove("show");
};

// ===== Accordions =====
document.querySelectorAll(".accordion").forEach(acc => {
  acc.addEventListener("click", () => {
    const panel = acc.nextElementSibling;
    const arrow = acc.querySelector("span");
    if (panel.style.display === "block") {
      panel.style.display = "none"; arrow.textContent = "▸";
    } else {
      panel.style.display = "block"; arrow.textContent = "▾";
    }
  });
});

// ===== Toast =====
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(()=> toast.classList.remove("show"),2000);
}

// ===== Modal =====
const modal = document.getElementById("modal");
function abrirModal() { modal.style.display = "flex"; }
function fecharModal() { modal.style.display = "none"; }
modal.onclick = e => { if(e.target === modal) fecharModal(); };

// ===== Favoritos e Recentes =====
let favoritos = JSON.parse(localStorage.getItem("favoritos") || "[]");
let recentes = JSON.parse(localStorage.getItem("recentes") || "[]");

function salvarLocal() {
  localStorage.setItem("favoritos", JSON.stringify(favoritos));
  localStorage.setItem("recentes", JSON.stringify(recentes));
}

function atualizarListas() {
  const favPanel = document.getElementById("favoritosPanel");
  favPanel.innerHTML = "";
  favoritos.forEach(f => {
    favPanel.innerHTML += `
      <div class="card">
        <h2>${f.titulo}</h2>
        <button class="prompt-btn" onclick="gerarPrompt('${f.tipo}','${f.titulo}','${f.texto.replace(/'/g, "\\'")}')">📌</button>
        <button class="fav-btn" onclick="removerFavorito('${f.id}')">❌</button>
        <div class="accordion">Ver texto <span>▸</span></div>
        <div class="panel"><p>${f.texto}</p></div>
      </div>`;
  });

  const recPanel = document.getElementById("recentesPanel");
  recPanel.innerHTML = "";
  recentes.forEach(r => {
    recPanel.innerHTML += `
      <div class="card">
        <h2>${r.titulo}</h2>
        <button class="prompt-btn" onclick="gerarPrompt('${r.tipo}','${r.titulo}','${r.texto.replace(/'/g, "\\'")}')">📌</button>
        <div class="accordion">Ver texto <span>▸</span></div>
        <div class="panel"><p>${r.texto}</p></div>
      </div>`;
  });

  // reativar accordions internos
  document.querySelectorAll(".accordion").forEach(acc => {
    acc.addEventListener("click", () => {
      const panel = acc.nextElementSibling;
      const arrow = acc.querySelector("span");
      if (panel.style.display === "block") {
        panel.style.display = "none"; arrow.textContent = "▸";
      } else {
        panel.style.display = "block"; arrow.textContent = "▾";
      }
    });
  });
}

function adicionarFavorito(item) {
  if (favoritos.find(f => f.id === item.id)) {
    showToast("Já está nos favoritos");
    return;
  }
  if (favoritos.length >= 5) {
    showToast("❌ Limite de 5 favoritos");
    return;
  }
  favoritos.push(item);
  salvarLocal();
  atualizarListas();
  showToast("⭐ Adicionado aos favoritos");
}

function removerFavorito(id) {
  favoritos = favoritos.filter(f => f.id !== id);
  salvarLocal();
  atualizarListas();
  showToast("❌ Removido dos favoritos");
}

function adicionarRecente(item) {
  recentes = [item, ...recentes.filter(r => r.id !== item.id)];
  if (recentes.length > 10) recentes.pop();
  salvarLocal();
  atualizarListas();
}

// ===== Prompts =====
const miniPrompts = {
  codigo: "Você é um professor de Direito com didática impecável.\nExplique o artigo abaixo:\n\n",
  sumula: "Você é um especialista em jurisprudência.\nExplique a súmula abaixo:\n\n",
  juris: "Você é um jurista experiente.\nAnalise a jurisprudência abaixo:\n\n",
  julgado: "Você é um professor de Direito Processual.\nExplique o julgado abaixo:\n\n",
  tema: "Você é um especialista em Direito Constitucional.\nExplique o tema repetitivo abaixo:\n\n"
};

function gerarPrompt(tipo, titulo, texto) {
  const prompt = miniPrompts[tipo] + texto;
  navigator.clipboard.writeText(prompt);
  adicionarRecente({id: Date.now().toString(), tipo, titulo, texto});
  abrirModal();
  showToast("✅ Prompt copiado");
}

// ===== Inicialização =====
atualizarListas();

// ===== Exemplo: carregar Código Penal =====
async function carregarCodigoPenal() {
  const res = await fetch("/data/codigo_penal.json");
  const cp = await res.json();
  const panel = document.getElementById("codigosPanel");
  panel.innerHTML = `<div onclick="mostrarParte('${cp.id}')">${cp.nome}</div>`;
}
carregarCodigoPenal();
