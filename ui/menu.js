// Estudio de Video — menú ⋯ de cada video: abrir, cambiar nombre o carpeta, verlo en el explorador, borrarlo.

function cardMenu(job, el) {
  document.querySelector(".qg-menu")?.remove();
  const p = projects.find((x) => x.job === job) || (cur && cur.job === job ? cur : null);
  if (!p) return;
  const r = el.getBoundingClientRect();
  const m = document.createElement("div");
  m.className = "qg-menu box card-menu-pop";
  m.style.cssText = `position:fixed;top:${r.bottom + 6}px;left:${Math.max(8, Math.min(r.right - 230, innerWidth - 240))}px;z-index:45;padding:6px;min-width:230px;margin:0`;
  const item = (i, txt, fn, cls = "") => `<div class="step ${cls}" onclick="this.parentNode.remove();${fn}">${ico(i)}<span>${txt}</span></div>`;
  m.innerHTML = (curView === "projects" ? item("scissors", "Abrir y editar", `openProject('${job}')`) : "")
    + item("edit", "Cambiar el nombre", `renameProject('${job}')`)
    + (typeof quickGroup === "function" && GROUPS.length ? item("folder", "Mover a otra carpeta", `quickGroup('${job}', document.querySelector('[data-menu=&quot;${job}&quot;]') || document.body)`) : "")
    + item("open", p.final ? "Ver el video terminado en el explorador" : "Ver el video en el explorador", `showInExplorer('${job}')`)
    + `<div class="menu-sep"></div>`
    + item("trash", "Borrar este video…", `askDelete('${job}')`, "danger");
  document.body.appendChild(m);
  setTimeout(() => addEventListener("click", function close(e) { if (!m.contains(e.target)) { m.remove(); removeEventListener("click", close); } }), 0);
}

async function showInExplorer(job) {
  try { await api(`/api/project/${job}/mostrar`, {}); } catch (e) { toast(e.message, true); }
}

async function renameProject(job) {
  const p = projects.find((x) => x.job === job) || cur;
  const t = (prompt("Nuevo nombre para este video:", p.titulo) || "").trim();
  if (!t || t === p.titulo) return;
  try {
    await api(`/api/project/${job}/state`, { titulo: t });
    if (cur && cur.job === job) { cur.titulo = t; $("#p-title").value = t; if (curStep === "inicio") showStep("inicio"); }
    toast("Nombre cambiado ✓");
    loadProjects();
  } catch (e) { toast(e.message, true); }
}

function askDelete(job) {
  const p = projects.find((x) => x.job === job) || cur;
  $("#modal-del .modal-card").innerHTML = `
    <h2>¿Borrar «${esc(p.titulo)}»?</h2>
    <p>Se va a la <b>Papelera de reciclaje</b> de Windows con todo lo de este video: el corte, los subtítulos${p.final
      ? ", las vistas previas y el video terminado de la app" : " y las vistas previas"}.</p>
    <ul class="muted small">
      <li>Tu <b>video original</b> (el que elegiste al crearlo) <b>no se toca</b>.</li>
      ${p.final ? `<li>La copia que quedó en tu carpeta <b>Descargas</b> tampoco se borra.</li>` : ""}
      <li>Si te arrepientes, lo recuperas desde la Papelera mientras no la vacíes.</li></ul>
    <div class="row end" style="margin-top:8px">
      <button class="btn ghost" onclick="$('#modal-del').classList.add('hidden')">Cancelar</button>
      <button class="btn danger-fill" id="del-go" onclick="doDelete('${job}')">Sí, mandarlo a la Papelera</button></div>`;
  $("#modal-del").classList.remove("hidden");
}
async function doDelete(job) {
  const b = $("#del-go"); b.disabled = true; b.textContent = "Borrando…";
  try {
    await api(`/api/project/${job}/borrar`, {});
    $("#modal-del").classList.add("hidden");
    toast("Video mandado a la Papelera ✓");
    if (cur && cur.job === job) { cur = null; showProjects(); } else loadProjects();
  } catch (e) {
    b.disabled = false; b.textContent = "Sí, mandarlo a la Papelera";
    toast(e.message, true);
  }
}

// el botón ⋯ en cada tarjeta (no mientras se eligen videos para un lote)
const _renderProjectsM = renderProjects;
renderProjects = function () {
  _renderProjectsM();
  if (typeof LOTE !== "undefined" && LOTE.on) return;
  document.querySelectorAll("#projects .card").forEach((card) => {
    const job = (card.getAttribute("onclick") || "").match(/openProject\('([^']+)'\)/)?.[1];
    if (!job) return;
    card.querySelector(".info").insertAdjacentHTML("afterbegin", `<button class="card-menu" data-menu="${job}" title="Más opciones"
      onclick="event.stopPropagation();cardMenu('${job}',this)">${ico("more")}</button>`);
  });
};

// y en la barra de arriba del video abierto
document.body.insertAdjacentHTML("beforeend", `<div id="modal-del" class="modal hidden"><div class="modal-card"></div></div>`);
(() => {
  const b = document.createElement("button");
  b.className = "btn ghost icon"; b.id = "btn-more"; b.innerHTML = ico("more"); b.title = "Más opciones: nombre, explorador, borrar";
  b.onclick = (e) => { e.stopPropagation(); if (cur) cardMenu(cur.job, b); };
  $("#view-project .topbar").appendChild(b);
})();
