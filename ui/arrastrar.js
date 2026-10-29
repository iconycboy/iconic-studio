// Estudio de Video — arrastrar archivos desde el explorador (además de elegirlos con el botón), y listas largas
// que se pliegan y se despliegan. La ruta de lo arrastrado la da la ventana de la app (bind_drop en app.py).

const VIDEO_RE = /\.(mp4|mov|mkv|m4v)$/i;
const isVideo = (p) => VIDEO_RE.test(p);
const visible = (sel) => { const el = $(sel); return el && !el.classList.contains("hidden"); };

// qué pasa al soltar, según dónde estás
function dropTarget() {
  if (visible("#modal-assets")) return { msg: "Suelta aquí para agregarlos a los assets", kind: "assets" };
  if (visible("#modal-new")) return { msg: "Suelta aquí tus videos", kind: "nuevo" };
  if (document.querySelector(".modal:not(.hidden)")) return null;
  if (curView === "project" && cur) return { msg: "Videos: se agregan como partes de este video · Fotos y logos: a sus assets", kind: "video" };
  if (curView === "projects") {
    const g = gById(groupFilter);
    return { msg: g ? `Suelta tus videos para crearlos en ${g.emoji} ${g.nombre}` : "Suelta tus videos para crear uno nuevo", kind: "inicio" };
  }
  return null;
}

window.onFilesDropped = async function (paths) {
  hideDrop();
  const t = dropTarget();
  if (!t) return;
  const vids = paths.filter(isVideo), other = paths.filter((p) => !isVideo(p));
  if (t.kind === "assets") return addAssetFiles(paths);
  if (t.kind === "nuevo") {
    vids.forEach(addNewFile);
    if (other.length) toast("Aquí solo van videos. Las fotos y logos se agregan en 🧩 Assets.");
    return;
  }
  if (t.kind === "inicio") {
    if (!vids.length) return toast("Arrastra videos (.mp4, .mov…). Las fotos y logos van en 🧩 Assets de una carpeta o video.");
    openNew();
    vids.forEach(addNewFile);
    if (other.length) toast(`${other.length} archivo(s) no son videos: las fotos y logos se agregan en 🧩 Assets.`);
    return;
  }
  if (t.kind === "video") {
    if (other.length) {
      await openAssets("video", cur.job);
      await addAssetFiles(other);
    }
    if (vids.length) {
      if (cur.pasos.transcribir === "hecho" &&
          !confirm(`¿Agregar ${vids.length} parte(s) al final de este video? Después hay que volver a transcribir, y lo que tachaste en «Editar por texto» empieza de cero.`)) return;
      try { await api(`/api/project/${cur.job}/partes`, { agregar: vids }); toast(`Agregando ${vids.length} parte(s)…`); await refreshProject(); showStep("importar"); }
      catch (e) { toast(e.message, true); }
    }
  }
};

// el aviso grande mientras arrastras archivos encima de la ventana
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
function showDrop() {
  const t = dropTarget();
  if (!t) return;
  $("#drop-zone .dz-msg").textContent = t.msg;
  $("#drop-zone").classList.add("on");
}
function hideDrop() { dragDepth = 0; $("#drop-zone").classList.remove("on"); }
addEventListener("dragenter", (e) => { if (hasFiles(e)) { dragDepth++; showDrop(); } });
addEventListener("dragleave", (e) => { if (hasFiles(e) && --dragDepth <= 0) hideDrop(); });
addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });  // sin esto, Windows abriría el archivo
addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  hideDrop();
  if (!window.pywebview) toast("Arrastrar archivos funciona en la app de escritorio (aquí, usa el botón o pega la ruta).");
});

// ------------------------------------------------------------------ listas largas: plegar y desplegar
const FOLD_AT = 4;
const foldOpen = {};
function foldList(container, key, label) {
  if (!container) return;
  const rows = [...container.querySelectorAll(":scope > .file")];
  if (rows.length <= FOLD_AT) return;
  const open = foldOpen[key] ?? false;
  const wrap = document.createElement("div");
  wrap.className = "fold-list" + (open ? " open" : "");
  rows[0].before(wrap);
  rows.forEach((r) => wrap.appendChild(r));
  const names = rows.map((r) => r.querySelector(".ellipsis")?.textContent.trim()).filter(Boolean);
  const head = document.createElement("button");
  head.type = "button";
  head.className = "fold-head";
  head.innerHTML = `<span>📂 <b>${rows.length} ${label}</b> <span class="muted small fold-names">${esc(names.slice(0, 3).join(" · "))}${names.length > 3 ? " …" : ""}</span></span>
    <span class="fold-arrow">${open ? "▴ Ocultar" : "▾ Ver la lista"}</span>`;
  head.onclick = () => { foldOpen[key] = !open; rerenderFold(key); };
  wrap.before(head);
}
function rerenderFold(key) {
  if (key === "nuevo") renderNewFiles();
  else if (key === "partes") showStep("importar");
}

const _renderNewFilesA = renderNewFiles;
renderNewFiles = function () {
  _renderNewFilesA();
  foldList($("#new-files"), "nuevo", typeof separados !== "undefined" && separados ? "videos" : "archivos");
  const empty = $("#new-files .files-empty");
  if (empty && window.pywebview) empty.innerHTML = "Ningún video elegido todavía. <b>Arrástralos aquí</b> o toca «＋ Elegir video(s)…».";
};
// al agregar muchos de golpe, la lista se pliega sola; al mover una parte, queda abierta
const _moveNewA = moveNew;
moveNew = function (i, d) { foldOpen.nuevo = true; _moveNewA(i, d); };
const _openNewA = openNew;
openNew = function () { foldOpen.nuevo = false; _openNewA(); };

const _showStepA = showStep;
showStep = function (id) {
  _showStepA(id);
  if (id === "importar") foldList($("#panel .box"), "partes", "partes");
};
const _movePartA = movePart;
movePart = function (i, d) { foldOpen.partes = true; return _movePartA(i, d); };

// montaje
document.body.insertAdjacentHTML("beforeend", `<div id="drop-zone"><div class="dz-card"><div class="dz-icon">📥</div><div class="dz-msg"></div></div></div>`);
