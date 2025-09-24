
/* ========== HISTÓRICO DE BUSCA ========= */
const HIST_MAX = 50;
const HIST_KEY = "busca_historico";

// Salvar uma busca no histórico
function salvarHistorico(busca) {
  if (!busca || busca.length < 2) return;
  let hist = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
  hist = hist.filter(x => x !== busca); // remove duplicados
  hist.unshift(busca); // adiciona no topo
  if (hist.length > HIST_MAX) hist = hist.slice(0, HIST_MAX);
  localStorage.setItem(HIST_KEY, JSON.stringify(hist));
}

// Renderizar o modal do histórico
function mostrarHistorico() {
  const modal = document.getElementById("modalHistorico");
  const lista = document.getElementById("listaHistorico");
  lista.innerHTML = "";
  const hist = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
  if (!hist.length) {
    const li = document.createElement("li");
    li.textContent = "Nenhuma busca recente.";
    li.className = "muted";
    lista.appendChild(li);
  } else {
    hist.forEach(item => {
      const li = document.createElement("li");
      li.className = "mini-item";
      const btn = document.createElement("button");
      btn.className = "btn soft";
      btn.textContent = item;
      btn.addEventListener("click", () => {
        window.location.href = `buscador.html?q=${encodeURIComponent(item)}`;
      });
      li.appendChild(btn);
      lista.appendChild(li);
    });
  }
  showModal(modal);
}

// Escuta para botão e backdrop
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnHistorico");
  if (btn) btn.addEventListener("click", mostrarHistorico);

  document.querySelectorAll("[data-close-historico]").forEach(el =>
    el.addEventListener("click", () => {
      const modal = document.getElementById("modalHistorico");
      hideModal(modal);
    })
  );
});
