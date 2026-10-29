// Estudio de Video — varios videos a la vez: crear uno por archivo, y que Claude edite varios juntos
// en una sola ventana y los entregue todos al mismo tiempo.

const LOTE = { on: false, sel: new Set(), timer: null };
const ready = (p) => p.pasos.importar === "hecho";

// ------------------------------------------------------------------ elegir videos en «Mis videos»
function startPick(jobs) {
  LOTE.on = true;
  LOTE.sel = new Set(jobs || []);
  renderProjects();
  $("#lote-bar").classList.remove("hidden");
  // mientras se importan los recién creados, la lista se refresca sola
  clearInterval(LOTE.timer);
  LOTE.timer = setInterval(() => { if (curView === "projects" && projects.some((p) => !ready(p))) loadProjects(); }, 3000);
}
function stopPick() {
  LOTE.on = false; LOTE.sel.clear(); clearInterval(LOTE.timer);
  $("#lote-bar").classList.add("hidden");
  renderProjects();
}
function togglePick(job) {
  LOTE.sel.has(job) ? LOTE.sel.delete(job) : LOTE.sel.add(job);
  renderProjects();
}
function pickGroup() {
  const visible = projects.filter((p) => groupFilter === "" || (groupFilter === "-" ? !p.grupo : p.grupo === groupFilter));
  const undone = visible.filter((p) => !(p.final && p.pasos.exportar === "hecho"));
  (undone.length ? undone : visible).forEach((p) => LOTE.sel.add(p.job));
  renderProjects();
}
function renderLoteBar() {
  const n = LOTE.sel.size, g = gById(groupFilter);
  $("#lote-bar").innerHTML = `<div><b>⚡ Elige los videos que Claude va a editar juntos</b>
      <span class="muted small">Toca cada video. ${n ? `<b>${n}</b> elegido${n > 1 ? "s" : ""}.` : ""}</span></div>
    <div class="spacer"></div>
    <button class="btn ghost" onclick="pickGroup()">${g ? `Todos los de ${g.emoji} ${esc(g.nombre)}` : "Elegir todos"}</button>
    <button class="btn ghost" onclick="stopPick()">Cancelar</button>
    <button class="btn claude" onclick="openLote()" ${n >= 2 ? "" : "disabled"}>⚡ Editar ${n >= 2 ? `los ${n}` : ""} juntos</button>`;
}
const _renderProjectsL = renderProjects;
renderProjects = function () {
  _renderProjectsL();
  const byJob = Object.fromEntries(projects.map((p) => [p.job, p]));
  $("#projects").classList.toggle("picking", LOTE.on);
  document.querySelectorAll("#projects .card").forEach((card) => {
    const job = (card.getAttribute("onclick") || "").match(/openProject\('([^']+)'\)/)?.[1];
    const p = byJob[job]; if (!p) return;
    if (p.lote && !(p.final && p.pasos.exportar === "hecho"))
      card.querySelector(".card-meta2")?.insertAdjacentHTML("afterbegin", `<span class="tagpill" title="Lo mandaste a Claude junto con otros videos">⚡ en lote con Claude</span>`);
    if (!LOTE.on) return;
    const on = LOTE.sel.has(job);
    card.classList.toggle("picked", on);
    card.onclick = () => togglePick(job);
    card.querySelector(".thumb").insertAdjacentHTML("beforeend",
      `<span class="pick-box">${on ? "✓" : ""}</span>${ready(p) ? "" : `<span class="pick-wait"><span class="spin"></span> importando…</span>`}`);
  });
  if (LOTE.on) renderLoteBar();
};

// ------------------------------------------------------------------ confirmar el lote
function openLote() {
  const sel = projects.filter((p) => LOTE.sel.has(p.job));
  const waiting = sel.filter((p) => !ready(p));
  const lo = sel.reduce((a, p) => a + (p.estimado?.auto?.[0] || 0), 0), hi = sel.reduce((a, p) => a + (p.estimado?.auto?.[1] || 0), 0);
  const groups = [...new Set(sel.map((p) => p.grupo))];
  const g = groups.length === 1 && gById(groups[0]);
  $("#modal-lote .modal-card").innerHTML = `
    <h2>Editar ${sel.length} videos juntos</h2>
    <p>Se abre <b>una sola ventana de Claude</b> que edita los ${sel.length} a la vez, etapa por etapa
      (primero transcribe todos, luego corta todos, y así), con <b>el mismo estilo</b> para los ${sel.length}.
      <b>Los exporta todos juntos al final</b>: van a aparecer a la vez en tu carpeta Descargas.</p>
    <div class="files">${sel.map((p) => { const pg = gById(p.grupo); return `<div class="file">
      <span class="file-n">${pg ? pg.emoji : "🎬"}</span><span class="grow ellipsis">${esc(p.titulo)}</span>
      <span class="tagpill" title="Assets de este video">🧩 ${p.assets || 0}</span>
      ${ready(p) ? "" : `<span class="tagpill">importando…</span>`}</div>`; }).join("")}</div>
    ${g ? `<p class="muted small">Son de ${g.emoji} <b>${esc(g.nombre)}</b>: Claude usa los assets de la carpeta en los ${sel.length}.</p>`
      : groups.length > 1 ? `<p class="warn small">Ojo: no son todos de la misma carpeta. Si son de la misma campaña, mételos en la misma carpeta para que compartan sus assets.</p>` : ""}
    <p class="muted small">💡 ¿Algo tiene que salir sí o sí (logo, código, foto del producto)? Agrégalo antes en <b>🧩 Assets</b>
      de la carpeta o de cada video. ⏱ En total, unos <b>${human(lo)}–${human(hi)}</b>: puedes hacer otra cosa mientras.</p>
    ${waiting.length ? `<p class="warn small">Espera un momento: ${waiting.length === 1 ? "un video" : `${waiting.length} videos`} todavía se está${waiting.length > 1 ? "n" : ""} importando.</p>` : ""}
    <div class="row end" style="margin-top:8px">
      <button class="btn ghost" onclick="$('#modal-lote').classList.add('hidden')">Volver</button>
      <button class="btn claude big" onclick="sendLote()" ${waiting.length ? "disabled" : ""}>⚡ Empezar los ${sel.length}</button></div>`;
  $("#modal-lote").classList.remove("hidden");
}
async function sendLote() {
  try {
    await api("/api/lote", { jobs: [...LOTE.sel] });
    $("#modal-lote").classList.add("hidden");
    toast(`Claude empezó a editar los ${LOTE.sel.size} videos en su ventana ✦`);
    stopPick();
    loadProjects();
  } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ «Nuevo video» con varios archivos: ¿partes o videos distintos?
let separados = false;
const _renderNewFilesL = renderNewFiles;
renderNewFiles = function () {
  _renderNewFilesL();
  if (newFiles.length < 2) { separados = false; return; }
  $("#new-files .muted.small")?.remove();
  $("#new-files").insertAdjacentHTML("beforeend", `<div class="sep-choice">
    <label class="check"><input type="radio" name="sep" ${separados ? "" : "checked"} onchange="separados=false;renderNewFiles()">
      <span><b>Son partes de UN video</b> <span class="muted small">(lo grabé en pedazos; se unen en el orden de ↑ ↓)</span></span></label>
    <label class="check"><input type="radio" name="sep" ${separados ? "checked" : ""} onchange="separados=true;renderNewFiles()">
      <span><b>Son ${newFiles.length} videos distintos</b> <span class="muted small">(p. ej. los de una campaña; luego los editas juntos)</span></span></label></div>`);
  document.querySelectorAll("#new-files .file-n").forEach((el, i) => { el.textContent = separados ? `Video ${i + 1}` : `Parte ${i + 1}`; });
  const lbl = $("#new-title")?.previousElementSibling;
  if (lbl) lbl.textContent = separados ? "2. Un nombre para la carpeta de videos (opcional: si no, cada uno lleva el nombre de su archivo)" : "2. Un nombre para reconocerlo";
};
const _openNewL = openNew;
openNew = function () { separados = false; _openNewL(); };
const _createProjectL = createProject;
createProject = async function () {
  if (!separados || newFiles.length < 2) return _createProjectL();
  try {
    const titulo = $("#new-title").value.trim();
    const auto = newFiles.length && titulo === baseName(newFiles[0]).replace(/\.[^.]+$/, "");  // el nombre que la app puso sola
    const d = await api("/api/projects", { origenes: newFiles, separados: true, titulo: auto ? "" : titulo, idioma: $("#new-lang").value });
    closeNew();
    showProjects();
    await loadProjects();
    toast(`${d.jobs.length} videos creados ✓ Se importan de a uno; ya puedes elegirlos para editarlos juntos.`);
    startPick(d.jobs);
  } catch (e) { toast(e.message, true); }
};

// ------------------------------------------------------------------ montaje
document.body.insertAdjacentHTML("beforeend", `<div id="lote-bar" class="lote-bar hidden"></div>
  <div id="modal-lote" class="modal hidden"><div class="modal-card wide"></div></div>`);
(() => {
  const b = document.createElement("button");
  b.className = "btn ghost"; b.id = "btn-lote"; b.innerHTML = `${ico("layers")} Varios a la vez`;
  b.title = "Elige varios videos y Claude los edita juntos y los entrega al mismo tiempo";
  b.onclick = () => (LOTE.on ? stopPick() : startPick());
  $("#btn-new").before(b);
})();
if (typeof TOURS !== "undefined") {
  const i = TOURS.inicio.findIndex((s) => s.sel === "#btn-style");
  TOURS.inicio.splice(i < 0 ? TOURS.inicio.length : i, 0, { sel: "#btn-lote", title: "⚡ Varios a la vez",
    text: "¿Tienes varios videos de una campaña? Elígelos aquí y Claude los edita juntos, con el mismo estilo, y te los entrega todos al mismo tiempo." });
}
