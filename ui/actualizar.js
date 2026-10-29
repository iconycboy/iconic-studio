// Iconic Studio — actualizaciones: al abrir la app revisa si hay una versión nueva publicada en GitHub y ofrece
// actualizarla con un clic (no toca los videos, las carpetas, el estilo ni los ajustes). También muestra la versión.

let UPD = null;
async function checkUpdate(force) {
  try { UPD = await api(`/api/actualizacion${force ? "?force=1" : ""}`); } catch (e) { return; }
  renderUpdate();
  return UPD;
}
function renderUpdate() {
  let b = $("#update-banner");
  if (!b) { b = document.createElement("div"); b.id = "update-banner"; $("#view-projects .projects-wrap").prepend(b); }
  b.innerHTML = UPD && UPD.nueva ? `<div class="update"><span class="update-icon">✨</span><div class="grow">
      <b>Hay una versión nueva del programa (${esc(UPD.ultima)})</b>
      <div class="muted small">Tienes la ${esc(UPD.version)}. Actualizar no toca tus videos, carpetas ni tu estilo.</div></div>
      <button class="btn ghost" onclick="openUpdate()">Ver qué cambió</button>
      <button class="btn primary" onclick="openUpdate()">Actualizar</button></div>` : "";
  const v = $("#app-version");
  if (v && UPD) v.textContent = `Versión ${UPD.version}`;
}
function openUpdate() {
  const solo = UPD.solo_instalador;
  $("#modal-upd .modal-card").innerHTML = `
    <h2>✨ Versión ${esc(UPD.ultima)}</h2>
    ${UPD.notas ? `<div class="upd-notes">${esc(UPD.notas)}</div>` : `<p class="muted">Mejoras y arreglos.</p>`}
    <p class="muted small">${solo
      ? "Esta versión trae cambios grandes y se instala con el <b>instalador nuevo</b>: descárgalo, ábrelo y sigue los pasos. Tus videos, carpetas y estilo se quedan."
      : "La app se va a cerrar y abrir sola en unos segundos. Tus videos, carpetas, estilo y ajustes se quedan como están."}</p>
    <div class="row end">
      <button class="btn ghost" onclick="$('#modal-upd').classList.add('hidden')">Ahora no</button>
      ${solo ? `<button class="btn primary big" onclick="openLink('${esc(UPD.instalador)}')">Descargar el instalador</button>`
        : `<button class="btn primary big" id="upd-go" onclick="doUpdate()">Actualizar ahora</button>`}</div>`;
  $("#modal-upd").classList.remove("hidden");
}
async function doUpdate() {
  const b = $("#upd-go"); b.disabled = true; b.textContent = "Descargando…";
  try {
    const d = await api("/api/actualizar", {});
    if (!d.ok) { toast(d.mensaje || "Ya tienes la última versión"); $("#modal-upd").classList.add("hidden"); return; }
    $("#modal-upd .modal-card").innerHTML = `<h2>✅ Listo</h2><p>Se instaló la versión <b>${esc(d.version)}</b>. La app se está volviendo a abrir…</p>`;
  } catch (e) { b.disabled = false; b.textContent = "Actualizar ahora"; toast(e.message, true); }
}
function openLink(url) { if (/^https:\/\/github\.com\//.test(url)) window.open(url, "_blank"); }

// la versión, en la Ayuda
const _showHelpU = typeof showHelp === "function" ? showHelp : null;
if (_showHelpU) showHelp = function (a) {
  _showHelpU(a);
  const body = $("#help-body");
  if (body && !$("#app-version")) body.insertAdjacentHTML("beforeend", `<p class="muted small center" style="margin-top:24px">
    <span id="app-version">${UPD ? `Versión ${esc(UPD.version)}` : ""}</span> ·
    <a href="#" onclick="checkUpdate(true).then(u=>toast(u&&u.nueva?'Hay una versión nueva ✨':'Tienes la última versión ✓'));return false">Buscar actualizaciones</a></p>`);
};

document.body.insertAdjacentHTML("beforeend", `<div id="modal-upd" class="modal hidden"><div class="modal-card"></div></div>`);
checkUpdate();
