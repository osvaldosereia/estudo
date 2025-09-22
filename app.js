(function(){
  const INDEX_ID = "searchIndex";
  const sel = { container: null, trigger: null, panel: null, list: null };
  let currentGroups = null;

  function ensureUI(){
    sel.container = document.getElementById(INDEX_ID);
    if(!sel.container) return;

    sel.container.innerHTML = "";
    const btn = document.createElement("button");
    btn.className = "si-trigger";
    btn.type = "button";
    btn.setAttribute("aria-expanded","false");
    btn.setAttribute("aria-label","Índice de resultados");
    btn.textContent = "Índice";

    const panel = document.createElement("div");
    panel.className = "si-panel";
    const ul = document.createElement("ul");
    ul.className = "si-list";
    panel.appendChild(ul);

    sel.container.append(btn, panel);
    sel.trigger = btn;
    sel.panel = panel;
    sel.list = ul;

    btn.addEventListener("click", ()=>{
      if (!currentGroups) return;
      if (Object.keys(currentGroups).length < 3){
        const key = Object.keys(currentGroups)[0];
        if (key) focusGroup(key);
        return;
      }
      const open = panel.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true":"false");
    });

    document.addEventListener("click",(e)=>{
      if(!sel.container || !sel.panel.classList.contains("open")) return;
      if(!sel.container.contains(e.target)){
        sel.panel.classList.remove("open");
        sel.trigger.setAttribute("aria-expanded","false");
      }
    });
  }

  function collectGroups(){
    const cards = Array.from(document.querySelectorAll(".card"));
    if (!cards.length) return null;

    const groups = {};
    for (const c of cards){
      const pill = c.querySelector(".pill");
      const key = (pill && pill.textContent.trim()) || "Outros";
      if(!groups[key]) groups[key] = [];
      groups[key].push(c);
    }
    return groups;
  }

  function rebuildList(groups){
    sel.list.innerHTML = "";
    const keys = Object.keys(groups);
    for (const k of keys){
      const li = document.createElement("li");
      li.className = "si-item";
      li.tabIndex = 0;
      li.setAttribute("role","button");
      li.setAttribute("aria-label", `Ir para o primeiro resultado de ${k}`);
      li.innerHTML = `<span class="si-name">${k}</span><span class="si-count">${groups[k].length}</span>`;
      li.addEventListener("click", ()=>focusGroup(k));
      li.addEventListener("keydown", (ev)=>{
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); focusGroup(k); }
      });
      sel.list.appendChild(li);
    }
  }

  function focusGroup(key){
    const cards = currentGroups?.[key];
    if (!cards || !cards.length) return;
    const target = cards[0];
    target.scrollIntoView({behavior:"smooth", block:"start"});
    if (sel.panel.classList.contains("open")){
      sel.panel.classList.remove("open");
      sel.trigger.setAttribute("aria-expanded","false");
    }
  }

  function updateIndex(){
    ensureUI();
    if (!sel.container) return;
    currentGroups = collectGroups();
    if (!currentGroups){
      sel.container.hidden = true;
      sel.container.setAttribute("aria-hidden","true");
      return;
    }
    sel.container.hidden = false;
    sel.container.setAttribute("aria-hidden","false");

    const groupCount = Object.keys(currentGroups).length;
    sel.trigger.textContent = groupCount >= 3 ? "Índice (arquivos)" : "Índice";
    rebuildList(currentGroups);
    sel.panel.classList.remove("open");
    sel.trigger.setAttribute("aria-expanded","false");
  }

  const mo = new MutationObserver((records)=>{
    let changed = false;
    for (const r of records){
      if (r.addedNodes && r.addedNodes.length){
        for (const n of r.addedNodes){
          if (n.nodeType === 1 && (n.classList?.contains("card") || n.querySelector?.(".card"))) {
            changed = true; break;
          }
        }
      }
      if (changed) break;
    }
    if (changed) updateIndex();
  });
  mo.observe(document.documentElement || document.body, { childList:true, subtree:true });

  window.__rebuildSearchIndex = updateIndex;
})();
