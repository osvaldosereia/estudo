// Simulação de ativação do índice após resultados
window.__rebuildSearchIndex = function () {
  const el = document.getElementById("searchIndex");
  if (!el) return;
  const hasResults = true; // simula que há resultados
  if (hasResults) {
    el.hidden = false;
    el.innerHTML = '<button class="si-trigger">Índice</button>';
  } else {
    el.hidden = true;
    el.innerHTML = "";
  }
};

document.addEventListener("DOMContentLoaded", window.__rebuildSearchIndex);
