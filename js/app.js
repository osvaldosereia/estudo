// ===== Topbar ações =====
document.getElementById("resetBtn").onclick = () => {
  localStorage.clear();
  location.reload();
};

document.getElementById("infoBtn").onclick = () => {
  document.getElementById("infoModal").style.display = "flex";
};

let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById("installBtn").style.display = "inline-block";
});
document.getElementById("installBtn").onclick = async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById("installBtn").style.display = "none";
  }
};

// ===== Accordions =====
function reativarAccordions() {
  document.querySelectorAll(".accordion").forEach(acc => {
    acc.onclick = () => {
      const panel = acc.nextElementSibling;
      const arrow = acc.querySelector("span");
      if (panel.style.display === "block") {
        panel.style.display = "none"; arrow.textContent = "▸";
      } else {
        panel.style.display = "block"; arrow.textContent = "▾";
      }
    };
  });
}

// ===== Toast =====
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

// ===== Modal =====
const modal = document.getElementById("modal");
function abrirModal() { modal.style.display = "flex"; }
function fecharModal() { modal.style.display = "none"; }
modal.onclick = e => { if (e.target === modal) fecharModal(); };

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
  favoritos.slice(0,5).forEach(f => {
    favPanel.innerHTML += `
      <div class="card">
        <h2>${f.titulo}</h2>
        <button class="prompt-btn" onclick="gerarPrompt('${f.tipo}','${f.titulo}','${f.texto.replace(/'/g,"\\'")}')">📌</button>
        <button class="fav-btn" onclick="removerFavorito('${f.id}')">❌</button>
        <div class="accordion">Ver texto <span>▸</span></div>
        <div class="panel"><p>${f.texto}</p></div>
      </div>`;
  });

  const recPanel = document.getElementById("recentesPanel");
  recPanel.innerHTML = "";
  recentes.slice(0,10).forEach(r => {
    recPanel.innerHTML += `
      <div class="card">
        <h2>${r.titulo}</h2>
        <button class="prompt-btn" onclick="gerarPrompt('${r.tipo}','${r.titulo}','${r.texto.replace(/'/g,"\\'")}')">📌</button>
        <div class="accordion">Ver texto <span>▸</span></div>
        <div class="panel"><p>${r.texto}</p></div>
      </div>`;
  });

  reativarAccordions();
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
  adicionarRecente({ id: Date.now().toString(), tipo, titulo, texto });
  abrirModal();
  showToast("✅ Prompt copiado");
}

// ===== Inicialização =====
atualizarListas();

// ===== Render genérico para códigos =====
function renderEstrutura(niveis, parentPanel) {
  niveis.forEach(nivel => {
    const nivelDiv = document.createElement("div");
    nivelDiv.innerHTML = `<div class="accordion">${nivel.titulo || nivel.nome} <span>▸</span></div>`;
    const nivelPanel = document.createElement("div");
    nivelPanel.classList.add("panel");

    if (nivel.artigos) {
      nivel.artigos.forEach(art => {
        nivelPanel.innerHTML += `
          <div class="card">
            <h2>${art.artigo} ${art.titulo ? "— " + art.titulo : ""}</h2>
            <button class="prompt-btn" onclick="gerarPrompt('${art.tipo}','${art.artigo}','${art.texto.replace(/'/g,"\\'")}')">📌</button>
            <button class="fav-btn" onclick='adicionarFavorito(${JSON.stringify(art)})'>⭐</button>
            <div class="accordion">Ver texto <span>▸</span></div>
            <div class="panel"><p>${art.texto}</p></div>
          </div>`;
      });
    }

    ["titulos", "capitulos", "secoes", "subsecoes"].forEach(key => {
      if (nivel[key]) renderEstrutura(nivel[key], nivelPanel);
    });

    nivelDiv.appendChild(nivelPanel);
    parentPanel.appendChild(nivelDiv);
  });
}

// ===== Carregar Código Penal (exemplo) =====
async function carregarCodigoPenal() {
  const res = await fetch("/data/codigo_penal.json");
  const cp = await res.json();

  const panel = document.getElementById("codigosPanel");
  panel.innerHTML = "";

  renderEstrutura(cp.partes, panel);
  reativarAccordions();
}
