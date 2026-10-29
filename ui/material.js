// Iconic Studio — 📚 Mi material: imágenes (ilustraciones, stickers, fondos) y sonidos ya hechos, para todos los
// videos. Claude los usa en vez de generarlos o buscarlos cuando encajan. Es opcional: si no hay, hace lo de siempre.

let MAT = { tab: "imagenes", items: [] };
const MAT_TABS = { imagenes: "🖼️ Imágenes", sonidos: "🔊 Sonidos" };
const MAT_HINT = { imagenes: "Ej: ilustración de dinero cayendo · sticker de corazón · fondo rosa", sonidos: "Ej: whoosh rápido · ding de notificación · risa" };

async function openMaterial(tab) {
  MAT.tab = tab || MAT.tab;
  try { MAT.items = (await api(`/api/assets/material/${MAT.tab}`)).assets; } catch (e) { return toast(e.message, true); }
  renderMaterial();
  $("#modal-material").classList.remove("hidden");
}
function matThumb(a) {
  const url = `/asset/material/${MAT.tab}/${encodeURIComponent(a.archivo)}`;
  if (a.tipo === "imagen") return `<img src="${url}" loading="lazy" alt="">`;
  if (a.tipo === "video") return `<video src="${url}#t=0.3" muted preload="metadata"></video>`;
  return `<audio src="${url}" controls preload="none"></audio>`;
}
function renderMaterial() {
  const t = MAT.tab;
  $("#modal-material .modal-card").innerHTML = `
    <h2>📚 Mi material</h2>
    <p class="muted">Sube imágenes o sonidos que <b>ya tengas hechos</b> (tus ilustraciones, stickers, efectos de sonido…). Claude los usa
      en todos tus videos <b>en vez de generarlos</b> cuando encajan con lo que dices: sale más a tu estilo, más rápido y gastando menos.
      Es opcional: si no subes nada, Claude los hace como siempre.</p>
    <div class="tabs">${Object.entries(MAT_TABS).map(([k, v]) => `<button class="tab ${k === t ? "on" : ""}" onclick="openMaterial('${k}')">${v}</button>`).join("")}</div>
    <div class="row">
      <button class="btn primary" onclick="pickMaterial()">＋ Agregar ${t === "imagenes" ? "imágenes" : "sonidos"}…</button>
      <span class="muted small">o arrástralos aquí. Puedes elegir varios con <kbd>Ctrl</kbd>.</span>
      <div class="spacer"></div>
      <button class="btn ghost" title="Abrir la carpeta" onclick="api('/api/assets/material/${t}',{abrir:1}).catch(e=>toast(e.message,true))">📁</button></div>
    ${window.pywebview ? "" : `<div class="row"><input id="mat-path" class="grow" placeholder="O pega la ruta de un archivo y presiona Enter"
      onkeydown="if(event.key==='Enter'){addMaterial([this.value]);this.value=''}"></div>`}
    <div class="mat-grid ${t}">${MAT.items.length ? MAT.items.map((a, i) => `<div class="mat-item">
        <div class="mat-thumb">${matThumb(a)}</div>
        <div class="mat-body"><div class="row"><b class="ellipsis grow" title="${esc(a.nombre || a.archivo)}">${esc(a.nombre || a.archivo)}</b>
          <button class="btn ghost danger" title="Quitar" onclick="removeMaterial(${i})">✕</button></div>
          <input value="${esc(a.uso || "")}" placeholder="¿Qué es? ${esc(MAT_HINT[t])}" oninput="MAT.items[${i}].uso=this.value;saveMaterialSoon()"></div></div>`).join("")
      : `<div class="files-empty muted small">Todavía no hay ${t === "imagenes" ? "imágenes" : "sonidos"}. Escribe en cada uno <b>qué es</b> para que Claude sepa cuándo usarlo.</div>`}</div>
    <div class="row end"><span class="muted small" id="mat-saved"></span><div class="spacer"></div>
      <button class="btn primary big" onclick="closeMaterial()">Listo</button></div>`;
}
let matTimer = null;
function saveMaterialSoon() { clearTimeout(matTimer); matTimer = setTimeout(saveMaterial, 600); $("#mat-saved").textContent = "Guardando…"; }
async function saveMaterial() {
  clearTimeout(matTimer); matTimer = null;
  try { await api(`/api/assets/material/${MAT.tab}`, { assets: MAT.items.map((a) => ({ ...a, obligatorio: false })) }); const s = $("#mat-saved"); if (s) s.textContent = "Guardado ✓"; }
  catch (e) { toast(e.message, true); }
}
async function addMaterial(paths) {
  paths = paths.map((p) => (p || "").trim().replace(/^"|"$/g, "")).filter(Boolean);
  if (!paths.length) return;
  if (matTimer) await saveMaterial();
  try { MAT.items = (await api(`/api/assets/material/${MAT.tab}`, { agregar: paths })).assets; renderMaterial(); toast("Agregado ✓"); }
  catch (e) { toast(e.message, true); }
}
async function pickMaterial() {
  if (!window.pywebview) return toast("Pega la ruta del archivo en el campo de abajo y presiona Enter");
  addMaterial((await window.pywebview.api.elegir_assets()) || []);
}
function removeMaterial(i) {
  if (!confirm(`¿Quitar «${MAT.items[i].nombre || MAT.items[i].archivo}» de tu material? (tu archivo original no se borra)`)) return;
  MAT.items.splice(i, 1); renderMaterial(); saveMaterial();
}
async function closeMaterial() {
  if (matTimer) await saveMaterial();
  document.querySelectorAll("#modal-material audio, #modal-material video").forEach((m) => m.pause());
  $("#modal-material").classList.add("hidden");
}

// arrastrar archivos encima de la ventana de material
const _dropTargetM = dropTarget;
dropTarget = function () {
  if (visible("#modal-material")) return { msg: `Suelta aquí para agregarlos a tus ${MAT.tab === "imagenes" ? "imágenes" : "sonidos"}`, kind: "material" };
  return _dropTargetM();
};
const _onDropM = window.onFilesDropped;
window.onFilesDropped = async function (paths) {
  if (visible("#modal-material")) { hideDrop(); return addMaterial(paths); }
  return _onDropM(paths);
};

// montaje: botón en «Mis videos»
document.body.insertAdjacentHTML("beforeend", `<div id="modal-material" class="modal hidden"><div class="modal-card wide mat-card"></div></div>`);
(() => {
  const b = document.createElement("button");
  b.className = "btn ghost"; b.id = "btn-material"; b.innerHTML = "📚 Mi material";
  b.title = "Imágenes y sonidos tuyos que Claude usa en vez de generarlos";
  b.onclick = () => openMaterial();
  ($("#btn-style") || $("#btn-new")).before(b);
})();
