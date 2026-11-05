// Iconic Studio — el guion de UN video (sin campaña): al crearlo (con o sin grabación) o dentro de él, un .docx/.txt
// o el texto pegado. Va tal cual, sin pasar por Claude. Un video sin grabación se puede ir preparando (guion, assets,
// voz en off) y la grabación llega después.

const GUION_RE = /\.(docx|txt|md)$/i;
let NG = { archivo: "", texto: "", abierto: false };  // el guion del video nuevo

function renderNewGuion() {
  const box = $("#new-guion");
  if (!box) return;
  if (typeof separados !== "undefined" && separados && newFiles.length > 1) { box.innerHTML = ""; return; }
  const tiene = NG.archivo || NG.texto.trim();
  box.innerHTML = `<details class="ng-guion" ${NG.abierto || tiene ? "open" : ""} ontoggle="NG.abierto=this.open">
    <summary><b>${$("#new-group") ? 5 : 4}. El guion</b> <span class="muted">(opcional: Claude lo usa para cortar y para los subtítulos)</span></summary>
    <div class="row">
      ${window.pywebview ? `<button class="btn" onclick="pickNewGuion()">📄 Elegir documento…</button>` : ""}
      ${NG.archivo ? `<span class="file grow"><span class="file-n">📄</span><span class="grow ellipsis" title="${esc(NG.archivo)}">${esc(baseName(NG.archivo))}</span>
        <button class="btn ghost" title="Quitar" onclick="NG.archivo='';renderNewGuion()">✕</button></span>`
        : window.pywebview ? `<span class="muted small">Word .docx o .txt, o arrástralo aquí</span>`
        : `<input class="grow" placeholder="Ruta del documento (.docx o .txt) y Enter"
            onkeydown="if(event.key==='Enter'&&this.value.trim()){NG.archivo=this.value.trim().replace(/^\\x22|\\x22$/g,'');renderNewGuion()}">`}
    </div>
    ${NG.archivo ? "" : `<textarea id="ng-texto" rows="4" placeholder="…o pega aquí el guion (el hook y lo que vas a decir)"
      oninput="NG.texto=this.value">${esc(NG.texto)}</textarea>`}</details>`;
}
function okGuionDoc(p) {
  if (GUION_RE.test(p)) return true;
  toast("El guion tiene que ser .docx o .txt (de un PDF: copia el texto y pégalo)", true);
  return false;
}
async function pickNewGuion() {
  const p = await window.pywebview.api.elegir_documento();
  if (p && okGuionDoc(p)) { NG.archivo = p; renderNewGuion(); }
}
const _openNewNG = openNew;
openNew = function () { NG = { archivo: "", texto: "", abierto: false }; _openNewNG(); renderNewGuion(); };
const _renderNewFilesNG = renderNewFiles;
renderNewFiles = function () {
  _renderNewFilesNG();
  renderNewGuion();
  const b = $("#modal-new .btn.primary.big");
  if (b) b.textContent = newFiles.length ? "Crear" : "Crear sin grabación";
  const empty = $("#new-files .files-empty");
  if (empty) empty.insertAdjacentHTML("beforeend", "<br>¿Todavía no lo grabas? Créalo igual y sube la grabación después.");
};
const _createProjectNG = createProject;
createProject = async function () {
  const sep = typeof separados !== "undefined" && separados && newFiles.length > 1;
  NG.texto = ($("#ng-texto")?.value ?? NG.texto).trim();
  const guion = NG.archivo || NG.texto;
  if (sep || (newFiles.length && !guion)) return _createProjectNG();
  const titulo = $("#new-title").value.trim();
  if (!newFiles.length && !titulo) { $("#new-title").focus(); return toast("Ponle un nombre al video para poder prepararlo"); }
  try {
    let d;
    if (newFiles.length) {
      d = await api("/api/projects", { origenes: newFiles, titulo, idioma: $("#new-lang").value });
      await api(`/api/project/${d.job}/guion`, { archivo: NG.archivo, texto: NG.archivo ? "" : NG.texto })
        .catch((e) => { d.aviso = e.message; });
    } else {
      d = await api("/api/projects", { titulo, idioma: $("#new-lang").value,
        guion_archivo: NG.archivo, guion_texto: NG.archivo ? "" : NG.texto });
    }
    closeNew();
    await openProject(d.job);
    if (d.aviso) toast(`El video se creó, pero el guion no: ${d.aviso}`, true);
    else if (!newFiles.length) toast("Video listo para preparar ✓ Cuando lo grabes, sube aquí la grabación");
  } catch (e) { toast(e.message, true); }
};

// ------------------------------------------------------------------ dentro del video: agregar o cambiar su guion
async function setGuion(body) {
  try {
    cur = await api(`/api/project/${cur.job}/guion`, body);
    toast("Guion guardado ✓ Claude lo usa al editar");
    if (curStep === "inicio") showStep("inicio");
  } catch (e) { toast(e.message, true); }
}
function replaceOk() { return !cur.guion?.guion || confirm("¿Reemplazar el guion de este video por el del documento?"); }
async function pickGuionDoc() {
  const p = await window.pywebview.api.elegir_documento();
  if (p && okGuionDoc(p) && replaceOk()) setGuion({ archivo: p });
}
function guionPaste() {
  const t = ($("#gp-texto")?.value || "").trim();
  if (!t) return toast("Pega el texto del guion");
  setGuion({ texto: t });
}
const _renderHomeNG = renderHome;
renderHome = function (P) {
  _renderHomeNG(P);
  const card = P.querySelector("#card-guion"), docBtn = window.pywebview
    ? `<button class="btn" onclick="pickGuionDoc()">📄 ${cur.guion ? "Cambiar por un documento…" : "Elegir documento…"}</button>`
    : `<input class="grow" placeholder="Ruta del documento (.docx o .txt) y Enter"
        onkeydown="if(event.key==='Enter'&&this.value.trim()&&replaceOk())setGuion({archivo:this.value.trim().replace(/^\\x22|\\x22$/g,'')})">`;
  if (card) {
    if (!cur.guion.numero) {  // no salió de una campaña
      const h = card.querySelector("h3"), p = card.querySelector("p.muted.small");
      if (h) h.textContent = "📝 Guion";
      if (p) p.textContent = "Claude lo usa para cortar: se queda con la mejor toma de cada frase y quita lo que no está en el guion. Si cambias algo, se guarda solo.";
    }
    card.querySelector(".row:last-child")?.insertAdjacentHTML("afterbegin", docBtn);
    return;
  }
  const after = P.querySelector("#card-grab") || P.querySelector(".home-head");
  after?.insertAdjacentHTML("afterend", `<div class="box wide" id="card-guion-add">
    <div class="row"><h3>📝 Guion</h3><span class="muted small grow">¿Tienes el guion? Claude lo usa para cortar y escribir bien los subtítulos.</span>
      ${window.pywebview ? docBtn : ""}</div>
    ${window.pywebview ? "" : `<div class="row">${docBtn}</div>`}
    <details><summary class="muted small">…o pega el texto</summary>
      <textarea id="gp-texto" rows="5" placeholder="El hook y lo que vas a decir"></textarea>
      <div class="row end"><button class="btn primary" onclick="guionPaste()">Guardar guion</button></div></details></div>`);
};

// arrastrar el documento al crear el video, o dentro del video
const _onFilesDroppedNG = window.onFilesDropped;
window.onFilesDropped = function (paths) {
  const doc = paths.find((p) => GUION_RE.test(p)), t = dropTarget();
  if (doc && t && t.kind === "nuevo") {
    NG.archivo = doc; NG.abierto = true; renderNewGuion();
    const rest = paths.filter((p) => !DOC_RE.test(p));
    if (!rest.length) return hideDrop();
    return _onFilesDroppedNG(rest);
  }
  if (doc && t && t.kind === "video" && !paths.some(isVideo)) {
    hideDrop();
    if (replaceOk()) setGuion({ archivo: doc });
    return;
  }
  return _onFilesDroppedNG(paths);
};
const _dropTargetNG = dropTarget;
dropTarget = function () {
  const t = _dropTargetNG();
  if (t && t.kind === "nuevo") t.msg = "Suelta aquí tus videos o el documento con el guion";
  if (t && t.kind === "video") t.msg += " · Un .docx o .txt: su guion";
  return t;
};

// ------------------------------------------------------------------ carpeta: editar todos solo con Claude
function editFolderClaude(gid) {
  LOTE_OPT.solo = "1"; store("lote-solo", "1");
  editFolder(gid);
}
const _renderFoldersNG = renderFolders;
renderFolders = function () {
  _renderFoldersNG();
  const g = gById(groupFilter), at = $("#folders .folder-head .btn.primary");
  if (!g || !at || LOTE.on || !inFolder(g.id).some((p) => !noVideo(p))) return;
  at.insertAdjacentHTML("afterend", `<button class="btn claude" id="btn-todo-claude" onclick="editFolderClaude('${g.id}')"
    title="Se abre Claude de una, sin que la app transcriba antes">🤖 Editar todos con Claude</button>`);
};
