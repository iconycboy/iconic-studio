// Iconic Studio — carpeta de mis videos (opcional): eliges una carpeta de Windows (ej: Documentos\1UGC) y la app arma
// ahí una carpeta por campaña (con «guiones» y «assets») y, dentro, una por video (con «assets», «voice en off» y
// «raw vid»). Lo que pongas en cada una entra solo a la app, y el video terminado queda en su carpeta, no en Descargas.

let ESPACIO = { espacio: "", sub: ["assets", "voice en off", "raw vid", "guiones"], sueltos: "Sin carpeta" };
let espacioBusy = false;

async function loadEspacio() { try { ESPACIO = await api("/api/espacio"); } catch (e) { /* sin red */ } }

// mira la carpeta y mete en la app lo nuevo; devuelve lo que hizo
async function revisarEspacio() {
  if (!ESPACIO.espacio || espacioBusy) return [];
  espacioBusy = true;
  try {
    const h = (await api("/api/espacio/revisar", {})).hechos || [];
    if (h.length) await loadGroups();  // puede haber campañas nuevas
    if (h.length) toast(`📂 De tu carpeta: ${h.slice(0, 3).join(" · ")}${h.length > 3 ? ` y ${h.length - 3} más` : ""}`);
    return h;
  } catch (e) { return []; } finally { espacioBusy = false; }
}
const _loadProjectsE = loadProjects;
loadProjects = async function () { await revisarEspacio(); await _loadProjectsE(); };
const _openProjectE = openProject;
openProject = async function (job) { await revisarEspacio(); await _openProjectE(job); };
// cada rato, por si pusiste algo en las carpetas con la app abierta
setInterval(async () => {
  if (!ESPACIO.espacio || document.hidden || document.querySelector(".modal:not(.hidden)")) return;
  const h = await revisarEspacio();
  if (!h.length) return;
  if (curView === "projects") _loadProjectsE();
  else if (curView === "project" && cur) { await refreshProject(); if (curStep === "inicio") showStep("inicio"); }
}, 20000);

async function openWin(what) {
  try { await api("/api/espacio/abrir", what || {}); } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ el ajuste
function openEspacio() {
  ESPACIO.nueva = ESPACIO.espacio || ESPACIO.elegida || "";
  renderEspacio();
  $("#modal-espacio").classList.remove("hidden");
}
function renderEspacio() {
  const [A, V, R, G] = ESPACIO.sub, on = !!ESPACIO.espacio, ruta = ESPACIO.nueva;
  $("#modal-espacio .modal-card").innerHTML = `<h2>📂 Carpeta de mis videos <span class="muted small">(opcional)</span></h2>
    <p class="muted">Elige una carpeta de Windows para tu trabajo (ej: <b>Documentos\\1UGC</b>). La app arma ahí una carpeta por
      campaña y, dentro, una por video. <b>Lo que pongas en cada una entra solo a la app</b>, según dónde lo pongas,
      y el video terminado queda en la carpeta del video (en vez de Descargas).</p>
    <pre class="esp-tree">📂 ${esc(ruta ? baseName(ruta) : "1UGC")}
 ├─ 📁 Solvely                 ← una carpeta de la app (campaña)
 │   ├─ 📁 ${G}               ← los documentos con los guiones
 │   ├─ 📁 ${A}                ← lo que comparten todos sus videos (logo, código…)
 │   └─ 📁 1. Cuánto gastas     ← un video
 │       ├─ 📁 ${R}           ← tu grabación (o sus partes)
 │       ├─ 📁 ${V}       ← el audio de la voz en off
 │       ├─ 📁 ${A}            ← fotos, logos, videos del producto
 │       └─ 🎬 el video terminado
 └─ 📁 ${ESPACIO.sueltos}             ← los videos que no están en una campaña</pre>
    <p class="muted small">También al revés: si haces una carpeta en Windows dentro de la de tus videos, entra como campaña;
      dentro de una campaña, como video. La app nunca borra nada de ahí, y tus archivos se copian (no se mueven).</p>
    <label>La carpeta</label>
    <div class="row">${window.pywebview ? `<button class="btn primary" onclick="pickEspacio()">${ico("folder")} Elegir carpeta…</button>` : ""}
      <input id="esp-ruta" class="grow" value="${esc(ruta)}" placeholder="Ej: C:\\Users\\tu\\Documents\\1UGC"
        oninput="ESPACIO.nueva=this.value" onkeydown="if(event.key==='Enter')saveEspacio()"></div>
    <div class="row end" style="margin-top:12px">
      ${on ? `<button class="btn ghost danger" onclick="saveEspacio('')" title="La app vuelve a guardar en Descargas; tus carpetas no se tocan">Dejar de usarla</button>` : ""}
      <div class="spacer"></div>
      <button class="btn ghost" onclick="$('#modal-espacio').classList.add('hidden')">Cancelar</button>
      <button class="btn primary" onclick="saveEspacio()">${on ? "Guardar" : "Usar esta carpeta"}</button></div>`;
}
async function pickEspacio() {
  const p = await window.pywebview.api.elegir_carpeta();
  if (p) { ESPACIO.nueva = p; renderEspacio(); }
}
async function saveEspacio(ruta) {
  ruta = ruta === undefined ? ($("#esp-ruta")?.value || "").trim() : ruta;
  if (ruta === undefined || (!ruta && !ESPACIO.espacio)) return toast("Elige la carpeta donde van tus videos");
  if (!ruta && !confirm("¿Dejar de usar la carpeta de mis videos? La app vuelve a guardar en Descargas. Tus carpetas y archivos no se tocan.")) return;
  try {
    const d = await api("/api/espacio", { ruta });
    await loadEspacio();
    $("#modal-espacio").classList.add("hidden");
    toast(ruta ? `📂 Listo: tus campañas y videos ahora tienen su carpeta en ${baseName(d.espacio)}` : "La app vuelve a guardar en Descargas");
    await _loadProjectsE();
    if (curView === "project" && cur) { await refreshProject(); showStep(curStep || "inicio"); }
  } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ dónde se ve
const _renderFoldersE = renderFolders;
renderFolders = function () {
  _renderFoldersE();
  const g = gById(groupFilter);
  if (g) {
    if (ESPACIO.espacio) $("#folders .folder-head .spacer")?.insertAdjacentHTML("afterend",
      `<button class="btn ghost" onclick="openWin({grupo:'${g.id}'})" title="La carpeta de esta campaña en Windows">📂 En Windows</button>`);
    return;
  }
  const label = $("#folders .section-label");
  if (!label) return;
  label.insertAdjacentHTML("afterend", ESPACIO.espacio
    ? `<div class="esp-line">📂 Tus campañas y videos se guardan en <a href="#" onclick="openWin();return false" title="Abrir en Windows">${esc(ESPACIO.espacio)}</a>
        <button class="btn ghost small-btn" onclick="openEspacio()">Cambiar</button></div>`
    : `<div class="esp-line muted">📂 ¿Quieres que cada campaña y cada video tengan su carpeta en Windows?
        <a href="#" onclick="openEspacio();return false">Elegir la carpeta de mis videos</a> <span class="small">(opcional)</span></div>`);
};

const _renderHomeE = renderHome;
renderHome = function (P) {
  _renderHomeE(P);
  if (!cur.carpeta_win) return;
  const [A, V, R] = ESPACIO.sub;
  // el video terminado queda en su carpeta, no en Descargas
  P.querySelectorAll(".box .muted.small").forEach((el) => {
    if (/Descargas/.test(el.textContent)) el.innerHTML = `También hay una copia en <a href="#" onclick="openWin({job:'${cur.job}'});return false">su carpeta</a>, lista para subir.`;
  });
  (P.querySelector("#card-voz") || P.querySelector(".home-head"))?.insertAdjacentHTML("afterend", `<div class="box wide" id="card-carpeta">
    <div class="row"><h3>📂 Su carpeta en Windows</h3><div class="spacer"></div>
      <button class="btn" onclick="openWin({job:'${cur.job}'})">Abrir</button></div>
    <p class="muted small ellipsis" title="${esc(cur.carpeta_win)}">${esc(cur.carpeta_win)}</p>
    <p class="muted small">Pon ahí cada cosa en su lugar y entra sola a la app: <b>${R}</b> la grabación · <b>${V}</b> el audio de
      la voz en off · <b>${A}</b> fotos, logos o videos del producto. El video terminado también queda ahí.</p></div>`);
};

document.body.insertAdjacentHTML("beforeend", `<div id="modal-espacio" class="modal hidden"><div class="modal-card wide"></div></div>`);
loadEspacio().then(() => { if (ESPACIO.espacio) loadProjects(); else if (curView === "projects") renderProjects(); });
