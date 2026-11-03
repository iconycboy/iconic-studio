// Iconic Studio — preparar los videos de una campaña desde sus guiones: subes el documento (o pegas el texto), Claude
// lo separa una vez, uno por video, y la app deja un video vacío por guion en la carpeta (con su hook, su guion y sus
// notas). Después solo subes cada grabación, una por una o varias a la vez. Y la voz en off de un video, si lleva.

const DOC_RE = /\.(docx|pdf|txt|md)$/i;
const numOf = (p) => parseFloat(p.guion?.numero) || 0;
const noVideo = (p) => !(p.partes || []).length;
let GU = null;  // { gid, fase: "subir" | "analizando" | "revisar" | "error", archivo, texto, data, error, segundos }
let guPoll = null;
const langOptions = () => {
  const sel = store("guiones-idioma") || "es";
  return Object.entries(LANG).map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${v}</option>`).join("");
};

// ------------------------------------------------------------------ la ventana de los guiones
async function openGuiones(gid, archivo) {
  GU = { gid, fase: "subir", archivo: archivo || "", texto: "", data: null, error: "", segundos: 0 };
  try { applyGuionesStatus(await api(`/api/grupo/${gid}/guiones`)); } catch (e) { /* sin red */ }
  if (archivo) GU.fase = GU.fase === "analizando" ? "analizando" : "subir";
  renderGuiones();
  $("#modal-guiones").classList.remove("hidden");
}
function closeGuiones() { $("#modal-guiones").classList.add("hidden"); clearInterval(guPoll); guPoll = null; }
function applyGuionesStatus(d) {
  if (d.estado === "analizando") { GU.fase = "analizando"; GU.segundos = d.segundos || 0; startGuPoll(); }
  else if (d.estado === "error") { GU.fase = "error"; GU.error = d.error; }
  else if (d.estado === "listo") { GU.fase = "revisar"; GU.data = d; GU.data.guardar = true; }
}
function startGuPoll() {
  if (guPoll) return;
  guPoll = setInterval(async () => {
    if (!GU || $("#modal-guiones").classList.contains("hidden")) return;
    try {
      const d = await api(`/api/grupo/${GU.gid}/guiones`);
      applyGuionesStatus(d);
      if (d.estado !== "analizando") { clearInterval(guPoll); guPoll = null; }
      renderGuiones();
    } catch (e) { /* servidor reiniciando */ }
  }, 2500);
}

function renderGuiones() {
  const g = gById(GU.gid) || { emoji: "📁", nombre: "" };
  const head = `<h2>📄 Preparar videos con guiones</h2>
    <p class="muted">Carpeta ${g.emoji} <b>${esc(g.nombre)}</b>. Claude lee el documento de la campaña <b>una sola vez</b>, lo separa
      en un video por guion y te deja cada uno listo con su hook y su guion. Tú solo subes la grabación. Así, al editar,
      cada video lee solo su guion y gasta menos.</p>`;
  let body = "";
  if (GU.fase === "subir") {
    const name = GU.archivo ? baseName(GU.archivo) : "";
    body = `<label>1. El documento con los guiones <span class="muted">(Word .docx, PDF o .txt; de Google Docs: Archivo → Descargar → .docx)</span></label>
      <div class="row">
        <button class="btn primary" onclick="pickGuionesDoc()">${ico("plus")} Elegir documento…</button>
        ${name ? `<span class="file grow"><span class="file-n">📄</span><span class="grow ellipsis" title="${esc(GU.archivo)}">${esc(name)}</span>
          <button class="btn ghost" title="Quitar" onclick="GU.archivo='';renderGuiones()">✕</button></span>`
          : `<span class="muted small">${window.pywebview ? "o arrástralo aquí" : ""}</span>`}
      </div>
      ${window.pywebview ? "" : `<div class="row"><input id="gu-path" class="grow" placeholder="O pega aquí la ruta del documento y presiona Enter"
        onkeydown="if(event.key==='Enter'){GU.archivo=this.value.trim().replace(/^\\x22|\\x22$/g,'');renderGuiones()}"></div>`}
      <label>…o pega aquí el texto de los guiones</label>
      <textarea id="gu-texto" rows="6" placeholder="Pega todo: el brief y los guiones (Video 1, Video 2…). Claude se encarga de separarlos."
        oninput="GU.texto=this.value">${esc(GU.texto)}</textarea>
      <label>2. ¿En qué idioma vas a grabar?</label>
      <select id="gu-lang">${langOptions()}</select>
      <div class="row end" style="margin-top:12px">
        <button class="btn ghost" onclick="closeGuiones()">Cancelar</button>
        <button class="btn claude big" onclick="startGuiones()">${ico("sparkles")} Que Claude separe los guiones</button></div>`;
  } else if (GU.fase === "analizando") {
    body = `<div class="working"><span class="spin"></span><div><b>Claude está leyendo el documento…</b>
        <div class="muted small">Suele tardar de 1 a 3 minutos${GU.segundos > 5 ? ` (van ${fmt(GU.segundos)})` : ""}. Puedes cerrar esta ventana:
        sigue trabajando, y al volver a «📄 Preparar con guiones» ves el resultado.</div></div></div>
      <div class="row end"><button class="btn ghost" onclick="closeGuiones()">Cerrar</button></div>`;
  } else if (GU.fase === "error") {
    body = `<div class="oops"><div class="oops-icon">😕</div><div><b>Claude no pudo separar los guiones.</b>
        <div class="muted small">${esc(GU.error || "")}</div></div></div>
      <div class="row end"><button class="btn ghost" onclick="closeGuiones()">Cerrar</button>
        <button class="btn primary" onclick="discardGuiones()">Probar otra vez</button></div>`;
  } else {
    const D = GU.data, vids = D.videos, n = vids.filter((v) => !v._off).length;
    body = `<p><b>Claude encontró ${vids.length} video${vids.length === 1 ? "" : "s"}${D.campana ? ` de «${esc(D.campana)}»` : ""}.</b>
        Revisa que esté bien (puedes cambiar cualquier cosa) y quita la marca a los que no vayas a grabar.</p>
      ${D.general ? `<div class="instr-block"><label>Lo que vale para todos los videos de la campaña</label>
        <textarea rows="3" oninput="GU.data.general=this.value">${esc(D.general)}</textarea>
        <label class="check small"><input type="checkbox" ${D.guardar ? "checked" : ""} onchange="GU.data.guardar=this.checked">
          Guardarlo como instrucciones de la carpeta (Claude lo sigue en todos sus videos)</label></div>` : ""}
      <div class="gu-list">${vids.map((v, i) => `<div class="gu-item ${v._off ? "off" : ""}">
        <div class="row"><label class="check"><input type="checkbox" ${v._off ? "" : "checked"} onchange="GU.data.videos[${i}]._off=!this.checked;renderGuiones()">
          <span class="gu-n">${esc(v.numero)}</span></label>
          <input class="grow" value="${esc(v.titulo)}" oninput="GU.data.videos[${i}].titulo=this.value" title="El nombre del video">
          ${v.voz_en_off ? `<span class="tagpill" title="Este guion lleva voz en off">🎙 voz en off</span>` : ""}</div>
        <details><summary class="muted small">${esc((v.hooks[0] || v.guion).slice(0, 110))}${(v.hooks[0] || v.guion).length > 110 ? "…" : ""}
          <span class="gu-more">ver y editar</span></summary>
          <label>Hook${v.hooks.length > 1 ? "s (uno por línea)" : ""}</label>
          <textarea rows="${Math.max(1, v.hooks.length)}" oninput="GU.data.videos[${i}].hooks=this.value.split('\\n')">${esc(v.hooks.join("\n"))}</textarea>
          <label>Guion</label><textarea rows="6" oninput="GU.data.videos[${i}].guion=this.value">${esc(v.guion)}</textarea>
          <label>Voz en off <span class="muted">(si lleva)</span></label><textarea rows="2" oninput="GU.data.videos[${i}].voz_en_off=this.value">${esc(v.voz_en_off)}</textarea>
          <label>Notas para editar</label><textarea rows="2" oninput="GU.data.videos[${i}].notas=this.value">${esc(v.notas)}</textarea>
        </details></div>`).join("")}</div>
      <label>¿En qué idioma vas a grabar?</label>
      <select id="gu-lang">${langOptions()}</select>
      <div class="row end" style="margin-top:12px">
        <button class="btn ghost" onclick="discardGuiones()" title="Descarta lo que leyó Claude">Usar otro documento</button>
        <div class="spacer"></div>
        <button class="btn ghost" onclick="closeGuiones()">Después</button>
        <button class="btn primary big" onclick="createGuiones()" ${n ? "" : "disabled"}>Crear ${n} video${n === 1 ? "" : "s"}</button></div>`;
  }
  $("#modal-guiones .modal-card").innerHTML = head + body;
}

async function pickGuionesDoc() {
  if (!window.pywebview) return toast("Pega la ruta del documento en el campo de abajo y presiona Enter");
  const p = await window.pywebview.api.elegir_documento();
  if (p) { GU.archivo = p; renderGuiones(); }
}
async function startGuiones() {
  GU.texto = ($("#gu-texto")?.value || "").trim();
  if (!GU.archivo && !GU.texto) return toast("Elige el documento o pega el texto de los guiones");
  if (GU.archivo && !DOC_RE.test(GU.archivo)) return toast("El documento tiene que ser .docx, .pdf o .txt", true);
  store("guiones-idioma", $("#gu-lang").value);
  try {
    applyGuionesStatus(await api(`/api/grupo/${GU.gid}/guiones`, { archivo: GU.archivo, texto: GU.archivo ? "" : GU.texto }));
    renderGuiones();
  } catch (e) { toast(e.message, true); }
}
async function discardGuiones() {
  try { await api(`/api/grupo/${GU.gid}/guiones`, { descartar: 1 }); } catch (e) { return toast(e.message, true); }
  GU.fase = "subir"; GU.data = null; GU.error = "";
  renderGuiones();
}
async function createGuiones() {
  const D = GU.data, videos = D.videos.filter((v) => !v._off);
  store("guiones-idioma", $("#gu-lang").value);
  try {
    const d = await api(`/api/grupo/${GU.gid}/guiones`, { crear: 1, videos, idioma: $("#gu-lang").value,
      general: D.general || "", guardar_general: !!D.guardar });
    closeGuiones();
    groupFilter = GU.gid; store("grupo-filtro", GU.gid);
    await loadProjects();
    toast(`${d.jobs.length} video${d.jobs.length === 1 ? "" : "s"} listo${d.jobs.length === 1 ? "" : "s"} para grabar ✓ Ahora sube cada grabación`);
  } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ subir las grabaciones (varias a la vez)
let GRAB = null;  // { gid, slots: [p], files: { job: ruta } }
function openGrabaciones(gid) {
  const slots = inFolder(gid).filter(noVideo).sort((a, b) => numOf(a) - numOf(b));
  if (!slots.length) return toast("Todos los videos de esta carpeta ya tienen su grabación");
  GRAB = { gid, slots, files: {} };
  renderGrabaciones();
  $("#modal-grab").classList.remove("hidden");
}
function renderGrabaciones() {
  const n = Object.keys(GRAB.files).length;
  $("#modal-grab .modal-card").innerHTML = `<h2>🎬 Subir las grabaciones</h2>
    <p class="muted">Elige el video de cada guion. Si los eliges <b>varios a la vez</b>, se asignan en orden (el primero al guion de
      más arriba). Tus archivos originales no se mueven.</p>
    <div class="row"><button class="btn primary" onclick="pickGrabaciones()">${ico("plus")} Elegir varios en orden…</button>
      <span class="muted small">${window.pywebview ? "o arrástralos aquí" : ""}</span></div>
    <div class="gu-list">${GRAB.slots.map((p) => {
      const f = GRAB.files[p.job];
      return `<div class="file"><span class="file-n">🎬</span><span class="grow ellipsis" title="${esc(p.titulo)}">${esc(p.titulo)}</span>
        ${f ? `<span class="ellipsis muted small gu-file" title="${esc(f)}">🎞 ${esc(baseName(f))}</span>
          <button class="btn ghost" title="Quitar" onclick="delete GRAB.files['${p.job}'];renderGrabaciones()">✕</button>`
        : window.pywebview ? `<button class="btn" onclick="pickGrabacion('${p.job}')">Elegir…</button>`
        : `<input class="gu-path" placeholder="Ruta del video" onkeydown="if(event.key==='Enter'&&this.value.trim()){GRAB.files['${p.job}']=this.value.trim().replace(/^\\x22|\\x22$/g,'');renderGrabaciones()}">`}</div>`;
    }).join("")}</div>
    <div class="row end" style="margin-top:12px"><button class="btn ghost" onclick="$('#modal-grab').classList.add('hidden')">Cancelar</button>
      <button class="btn primary big" onclick="sendGrabaciones()" ${n ? "" : "disabled"}>Subir ${n || ""} video${n === 1 ? "" : "s"}</button></div>`;
}
function fillGrabaciones(paths) {
  const free = GRAB.slots.filter((p) => !GRAB.files[p.job]);
  paths.filter(isVideo).forEach((f, i) => { if (free[i]) GRAB.files[free[i].job] = f; });
  renderGrabaciones();
}
async function pickGrabaciones() { fillGrabaciones(await chooseFiles()); }
async function pickGrabacion(job) {
  const f = (await chooseFiles())[0];
  if (f) { GRAB.files[job] = f; renderGrabaciones(); }
}
async function sendGrabaciones() {
  const asignar = Object.fromEntries(Object.entries(GRAB.files).map(([j, f]) => [j, [f]]));
  try {
    const d = await api("/api/grabaciones", { asignar });
    $("#modal-grab").classList.add("hidden");
    toast(`Copiando ${d.videos} grabación${d.videos === 1 ? "" : "es"}, una por una…`);
    loadProjects();
  } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ dentro del video: su guion y su voz en off
const saveGuion = debounce(async (el) => {
  try { await api(`/api/project/${cur.job}/state`, { guion: cur.guion }); el.textContent = "Guardado ✓"; }
  catch (e) { toast(e.message, true); }
}, 600);
function guionInput(k, el) {
  cur.guion[k] = k === "hooks" ? el.value.split("\n") : el.value;
  const s = $("#card-guion .instr-saved");
  s.textContent = "Guardando…";
  saveGuion(s);
}
function copyGuion() {
  const g = cur.guion;
  const t = [g.hooks.length ? `HOOK:\n${g.hooks.join("\n")}` : "", g.guion ? `GUION:\n${g.guion}` : "",
    g.voz_en_off ? `VOZ EN OFF:\n${g.voz_en_off}` : ""].filter(Boolean).join("\n\n");
  navigator.clipboard.writeText(t).then(() => toast("Guion copiado ✓"), () => toast("No se pudo copiar", true));
}
async function addVoz(paths) {
  if (!paths) {
    if (!window.pywebview) return toast("Pega la ruta del audio en el campo de abajo y presiona Enter");
    paths = await window.pywebview.api.elegir_audio();
  }
  if (!paths || !paths.length) return;
  try {
    await api(`/api/project/${cur.job}/voz`, { agregar: paths });
    toast("Voz en off agregada ✓ Claude la pone donde va según el guion");
    cur = await api(`/api/project/${cur.job}`);
    if (curStep === "inicio") showStep("inicio");
  } catch (e) { toast(e.message, true); }
}

const _renderHomeG = renderHome;
renderHome = function (P) {
  _renderHomeG(P);
  const g = cur.guion, empty = noVideo(cur), head = P.querySelector(".home-head");
  if (g) head?.insertAdjacentHTML("afterend", `<div class="box wide" id="card-guion">
    <div class="row"><h3>📝 Guion ${esc(g.numero || "")}</h3><div class="spacer"></div>
      <button class="btn ghost" onclick="copyGuion()" title="Para leerlo mientras grabas">📋 Copiar</button></div>
    <p class="muted small">Salió del documento de la campaña. Claude lo usa para cortar: se queda con la mejor toma de cada frase
      y quita lo que no está en el guion. Si cambias algo, se guarda solo.</p>
    ${g.hooks.length || !g.guion ? `<label class="small">Hook${g.hooks.length > 1 ? "s (uno por línea)" : ""}</label>
      <textarea rows="${Math.max(1, g.hooks.length)}" oninput="guionInput('hooks',this)">${esc(g.hooks.join("\n"))}</textarea>` : ""}
    <label class="small">Guion</label><textarea rows="7" oninput="guionInput('guion',this)">${esc(g.guion)}</textarea>
    ${g.voz_en_off ? `<label class="small">🎙 Voz en off</label><textarea rows="2" oninput="guionInput('voz_en_off',this)">${esc(g.voz_en_off)}</textarea>` : ""}
    ${g.notas ? `<label class="small">Notas para editar</label><textarea rows="2" oninput="guionInput('notas',this)">${esc(g.notas)}</textarea>` : ""}
    <div class="row"><div class="spacer"></div><span class="muted small instr-saved"></span></div></div>`);
  if (empty) {  // todavía sin grabación: en vez de editar, subirla
    P.querySelectorAll(".paths, #card-feedback, .eta-strip").forEach((el) => el.remove());
    const p = P.querySelector(".home-head p.muted");
    if (p) p.innerHTML = "🎬 <b>Falta la grabación.</b> Graba el guion y súbela aquí; después Claude lo edita.";
    (P.querySelector("#card-guion") || head)?.insertAdjacentHTML("afterend", `<div class="box wide gu-upload" id="card-grab">
      <h3>${ico("film")} Sube la grabación de este video</h3>
      <p class="muted small">Si lo grabaste en varios pedazos, elígelos todos (mantén <kbd>Ctrl</kbd>). También puedes arrastrarlos aquí.</p>
      <div class="row"><button class="btn primary big" onclick="addParts()">${ico("plus")} Elegir video(s)…</button></div>
      ${window.pywebview ? "" : `<div class="row" style="margin-top:8px"><input id="add-path" class="grow" placeholder="Ruta del video (modo navegador)"
        onkeydown="if(event.key==='Enter')addPartPath()"><button class="btn" onclick="addPartPath()">Agregar</button></div>`}</div>`);
  }
  // la voz en off: para cualquier video, si hace falta
  const after = P.querySelector("#card-instr") || P.querySelector("#card-grab") || P.querySelector("#card-guion") || head;
  after?.insertAdjacentHTML("afterend", `<div class="box wide" id="card-voz"><div class="row">
      <h3>🎙 Voz en off</h3><span class="muted small grow" id="voz-list">${g?.voz_en_off ? "Este guion lleva voz en off." : "¿Lleva una voz grabada aparte, encima del video?"}</span>
      <button class="btn" onclick="addVoz()">${ico("plus")} Agregar audio…</button></div>
    ${window.pywebview ? "" : `<div class="row" style="margin-top:8px"><input class="grow" placeholder="Ruta del audio (modo navegador)"
      onkeydown="if(event.key==='Enter'&&this.value.trim())addVoz([this.value.trim().replace(/^\\x22|\\x22$/g,'')])"></div>`}</div>`);
  api(`/api/assets/video/${cur.job}`).then((d) => {
    const voz = d.assets.filter((a) => a.voz), el = P.querySelector("#voz-list");
    if (el && voz.length) el.innerHTML = voz.map((a) => `<span class="tagpill">🎵 ${esc(a.nombre || a.archivo)}</span>`).join(" ")
      + ` <a href="#" onclick="openAssets('video');return false">cambiar</a>`;
  }).catch(() => {});
};

// ------------------------------------------------------------------ tarjetas y carpeta
const _renderProjectsG = renderProjects;
renderProjects = function () {
  _renderProjectsG();
  const byJob = Object.fromEntries(projects.map((p) => [p.job, p]));
  document.querySelectorAll("#projects .card").forEach((card) => {
    const p = byJob[(card.getAttribute("onclick") || "").match(/openProject\('([^']+)'\)/)?.[1]];
    if (!p || !p.guion) return;
    card.querySelector(".info h3")?.insertAdjacentHTML("beforebegin", `<span class="tagpill gu-tag">📝 Guion ${esc(p.guion.numero || "")}</span>`);
    if (noVideo(p)) {
      card.classList.add("gu-slot");
      card.querySelector(".thumb")?.insertAdjacentHTML("beforeend", `<span class="gu-falta">🎬 Falta subir la grabación</span>`);
      const meta = card.querySelector(".meta span");
      if (meta) meta.textContent = "Listo para grabar";
      card.querySelector(".card-meta2")?.remove();
    }
  });
  // en una carpeta, los guiones en su orden (1, 2, 3…)
  const g = gById(groupFilter), box = $("#projects");
  if (g) [...box.children].map((c) => [c, byJob[(c.getAttribute("onclick") || "").match(/openProject\('([^']+)'\)/)?.[1]]])
    .filter(([, p]) => p && p.guion).sort((a, b) => numOf(a[1]) - numOf(b[1])).forEach(([c]) => box.appendChild(c));
};

const _renderFoldersG = renderFolders;
renderFolders = function () {
  _renderFoldersG();
  const g = gById(groupFilter), btn = $("#folders .folder-head .btn.primary");
  if (!g || !btn) return;
  const empty = inFolder(g.id).filter(noVideo).length;
  if (inFolder(g.id).length - empty < 2) $("#folders .folder-head .btn.claude")?.remove();  // «editar juntos» necesita grabaciones
  btn.insertAdjacentHTML("beforebegin", `<button class="btn" id="btn-guiones" onclick="openGuiones('${g.id}')"
      title="Sube el documento de la campaña y Claude prepara un video por guion">📄 Preparar con guiones</button>
    ${empty ? `<button class="btn" onclick="openGrabaciones('${g.id}')" title="La grabación de cada guion, varias a la vez">🎬 Subir grabaciones (${empty})</button>` : ""}`);
  api(`/api/grupo/${g.id}/guiones`).then((d) => {
    const b = $("#btn-guiones");
    if (b && d.estado === "listo") b.innerHTML = "📄 Guiones listos para revisar", b.classList.add("claude");
    if (b && d.estado === "analizando") b.innerHTML = "📄 Claude está leyendo los guiones…";
  }).catch(() => {});
};

// editar la carpeta junta: solo los que ya tienen su grabación
editFolder = function (gid) {
  const vids = inFolder(gid).filter((p) => !noVideo(p)), todo = vids.filter((p) => !isDone(p));
  if (!vids.length) return toast("Primero sube las grabaciones de esta carpeta");
  startPick((todo.length >= 2 ? todo : vids).map((p) => p.job));
  openLote();
};

// al crear una carpeta nueva: ofrecer preparar los videos con los guiones
const _renderGroupModalG = renderGroupModal;
renderGroupModal = function () {
  _renderGroupModalG();
  if (editingGroup.id) return;
  $("#modal-group .row.end")?.insertAdjacentHTML("beforebegin", `<label class="check gu-check"><input type="checkbox" id="g-guiones"
      ${editingGroup._guiones ? "checked" : ""} onchange="editingGroup._guiones=this.checked">
    <span>📄 <b>Ya tengo los guiones de esta campaña</b><br><span class="muted small">Sube el documento y Claude prepara un video por guion.</span></span></label>`);
};
const _saveGroupG = saveGroup;
saveGroup = async function () {
  const want = !editingGroup.id && editingGroup._guiones;
  delete editingGroup._guiones;
  await _saveGroupG();
  if (want && editingGroup.id && gById(editingGroup.id)) { setGroupFilter(editingGroup.id); openGuiones(editingGroup.id); }
};

// arrastrar el documento o las grabaciones
const _dropTargetG = dropTarget;
dropTarget = function () {
  if (visible("#modal-guiones")) return { msg: "Suelta aquí el documento con los guiones", kind: "guiones" };
  if (visible("#modal-grab")) return { msg: "Suelta aquí las grabaciones: se asignan en orden", kind: "grab" };
  const t = _dropTargetG();
  if (t && t.kind === "inicio" && gById(groupFilter)) t.msg += " · o el documento con los guiones";
  return t;
};
const _onFilesDroppedG = window.onFilesDropped;
window.onFilesDropped = function (paths) {
  const t = dropTarget(), doc = paths.find((p) => DOC_RE.test(p));
  if (t && t.kind === "guiones") {
    hideDrop();
    if (!doc) return toast("Arrastra el documento (.docx, .pdf o .txt)");
    GU.archivo = doc; if (GU.fase !== "analizando") GU.fase = "subir";
    return renderGuiones();
  }
  if (t && t.kind === "grab") { hideDrop(); return fillGrabaciones(paths); }
  if (t && t.kind === "inicio" && doc && gById(groupFilter) && !paths.some(isVideo)) { hideDrop(); return openGuiones(groupFilter, doc); }
  return _onFilesDroppedG(paths);
};

document.body.insertAdjacentHTML("beforeend", `<div id="modal-guiones" class="modal hidden"><div class="modal-card wide"></div></div>
  <div id="modal-grab" class="modal hidden"><div class="modal-card wide"></div></div>`);
if (typeof TOURS !== "undefined") {
  const i = TOURS.inicio.findIndex((s) => s.sel === "#folders");
  TOURS.inicio.splice(i < 0 ? TOURS.inicio.length : i + 1, 0, { sel: "#folders", title: "📄 Campañas con guiones",
    text: "¿La marca ya te dio los guiones? Dentro de una carpeta toca <b>📄 Preparar con guiones</b>, sube el documento y Claude deja un video listo por guion. Tú solo subes cada grabación." });
}
