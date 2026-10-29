// Estudio de Video — carpetas: «Mis videos» se ve como un explorador. Cada carpeta (una campaña, una marca, un
// cliente) junta sus videos, sus assets y sus instrucciones, y se puede editar entera de una vez.
// Por dentro, una carpeta es un «grupo» (grupos.json, state.json → grupo): solo cambia cómo se ve.

let FINFO = {};  // id de carpeta → { assets, instr } (para las tarjetas)
const inFolder = (id) => projects.filter((p) => p.grupo === id);
const isDone = (p) => p.final && p.pasos.exportar === "hecho";
const searching = () => !!$("#search").value.trim();

async function loadFolderInfo() {
  const out = {};
  await Promise.all(GROUPS.map(async (g) => {
    try { const d = await api(`/api/assets/grupo/${g.id}`); out[g.id] = { assets: d.assets.length, instr: !!d.instrucciones }; }
    catch (e) { out[g.id] = { assets: 0, instr: false }; }
  }));
  FINFO = out;
}

function folderTile(g) {
  const vids = inFolder(g.id), done = vids.filter(isDone).length, info = FINFO[g.id] || {};
  const thumbs = vids.filter((p) => p.thumb).slice(0, 3);
  return `<div class="folder" style="--gc:${g.color}" data-drop="${g.id}" onclick="setGroupFilter('${g.id}')" title="Abrir la carpeta">
    <div class="folder-tab"></div>
    <div class="folder-body">
      <div class="folder-thumbs">${thumbs.map((p, i) => `<span style="background-image:url('${p.thumb}');--i:${i}"></span>`).join("")
        || `<span class="folder-emoji">${g.emoji}</span>`}</div>
      <div class="folder-info"><h3>${esc(g.nombre)}</h3>
        <div class="muted small">${vids.length} video${vids.length === 1 ? "" : "s"}${done ? ` · ${done} listo${done === 1 ? "" : "s"}` : ""}</div>
        <div class="folder-tags">${info.assets ? `<span class="tagpill">${ico("puzzle")} ${info.assets}</span>` : ""}${info.instr ? `<span class="tagpill">${ico("notes")} instrucciones</span>` : ""}</div></div>
    </div></div>`;
}

function renderFolders() {
  let box = $("#folders");
  if (!box) { box = document.createElement("div"); box.id = "folders"; $("#projects").before(box); }
  const bar = $("#groupbar"); if (bar) bar.style.display = "none";
  const g = gById(groupFilter);
  if (groupFilter && groupFilter !== "-" && !g) { groupFilter = ""; store("grupo-filtro", ""); }
  const pick = typeof LOTE !== "undefined" && LOTE.on;
  if (g) {  // dentro de una carpeta
    const vids = inFolder(g.id), todo = vids.filter((p) => !isDone(p)), info = FINFO[g.id] || {};
    box.innerHTML = `<div class="folder-head" style="--gc:${g.color}" data-drop="${g.id}">
      <button class="btn ghost" onclick="setGroupFilter('')" data-drop="">${ico("back")} Mis videos</button>
      <div class="folder-title"><span class="folder-big">${g.emoji}</span><div><h2>${esc(g.nombre)}</h2>
        <span class="muted small">${vids.length} video${vids.length === 1 ? "" : "s"} en esta carpeta</span></div></div>
      <div class="spacer"></div>
      <button class="btn" onclick="openAssets('grupo','${g.id}')" title="Lo que comparten todos los videos de esta carpeta">${ico("puzzle")} Assets e instrucciones
        ${info.assets || info.instr ? `<span class="tagpill">${[info.assets ? `${info.assets} assets` : "", info.instr ? "📝" : ""].filter(Boolean).join(" · ")}</span>` : ""}</button>
      <button class="btn ghost icon" onclick="openGroup('${g.id}')" title="Nombre, ícono y color">${ico("edit")}</button>
      <button class="btn primary" onclick="openNew()">${ico("plus")} Video aquí</button>
      ${vids.length >= 2 && !pick ? `<button class="btn claude" onclick="editFolder('${g.id}')">${ico("zap")} Editar ${todo.length >= 2 ? `los ${todo.length}` : "todos"} juntos</button>` : ""}
    </div>
    ${vids.length ? "" : `<div class="folder-empty">📂 Esta carpeta está vacía. Toca <b>＋ Video aquí</b>, o vuelve a <b>Mis videos</b> y
      <b>arrastra</b> un video encima de la carpeta.</div>`}`;
  } else if (groupFilter === "-" || searching()) {
    box.innerHTML = groupFilter === "-" ? `<div class="folder-head"><button class="btn ghost" onclick="setGroupFilter('')">${ico("back")} Mis videos</button>
      <h2>Videos sin carpeta</h2></div>` : "";
  } else if (!projects.length && !GROUPS.length) {  // instalación nueva: solo el mensaje de «todavía no hay videos»
    box.innerHTML = "";
  } else {  // inicio: las carpetas y, debajo, los videos sueltos
    const loose = projects.filter((p) => !p.grupo).length;
    box.innerHTML = `<div class="section-label">Carpetas <span class="muted small">— una por campaña, marca o cliente. Arrastra un video encima para guardarlo ahí.</span></div>
      <div class="folder-grid">${GROUPS.map(folderTile).join("")}
        <div class="folder add" onclick="openGroup()"><div class="folder-body"><span class="folder-emoji">${ico("folder-plus")}</span>
          <div class="folder-info"><h3>Nueva carpeta</h3><div class="muted small">para una campaña o marca</div></div></div></div></div>
      ${loose ? `<div class="section-label" data-drop="">Videos sin carpeta <span class="muted small">(${loose})</span></div>` : ""}`;
  }
  // en el inicio solo se ven los sueltos (los demás están en su carpeta); buscando, se ven todos
  if (!g && groupFilter !== "-" && !pick) {  // eligiendo videos para un lote se ven todos
    const byJob = Object.fromEntries(projects.map((p) => [p.job, p]));
    document.querySelectorAll("#projects .card").forEach((card) => {
      const p = byJob[(card.getAttribute("onclick") || "").match(/openProject\('([^']+)'\)/)?.[1]];
      if (p) card.style.display = searching() || !p.grupo ? "" : "none";
    });
  }
  wireDrag();
}

// arrastrar un video encima de una carpeta (o de «Mis videos» / «sin carpeta» para sacarlo)
function wireDrag() {
  document.querySelectorAll("#projects .card").forEach((card) => {
    const job = (card.getAttribute("onclick") || "").match(/openProject\('([^']+)'\)/)?.[1];
    if (!job) return;
    card.draggable = true;
    card.ondragstart = (e) => { e.dataTransfer.setData("text/job", job); document.body.classList.add("dragging"); };
    card.ondragend = () => document.body.classList.remove("dragging");
  });
  document.querySelectorAll("[data-drop]").forEach((el) => {
    el.ondragover = (e) => { if (e.dataTransfer.types.includes("text/job")) { e.preventDefault(); el.classList.add("drop-on"); } };
    el.ondragleave = () => el.classList.remove("drop-on");
    el.ondrop = (e) => {
      e.preventDefault(); e.stopPropagation(); el.classList.remove("drop-on"); document.body.classList.remove("dragging");
      const job = e.dataTransfer.getData("text/job");
      const p = projects.find((x) => x.job === job);
      if (p && (p.grupo || "") !== el.dataset.drop) assignGroup(job, el.dataset.drop).then(loadFolderInfo).then(renderProjects);
    };
  });
}

// editar toda una carpeta de una vez
function editFolder(gid) {
  const vids = inFolder(gid), todo = vids.filter((p) => !isDone(p));
  startPick((todo.length >= 2 ? todo : vids).map((p) => p.job));
  openLote();
}

const _renderProjectsF = renderProjects;
renderProjects = function () { _renderProjectsF(); renderFolders(); };
const _loadProjectsF = loadProjects;
loadProjects = async function () { await _loadProjectsF(); await loadFolderInfo(); renderFolders(); };

// en la ventana de «editar juntos»: los assets que comparten, o crear la carpeta para que los compartan
const _openLoteF = openLote;
openLote = async function () {
  await _openLoteF();
  const sel = projects.filter((p) => LOTE.sel.has(p.job));
  const groups = [...new Set(sel.map((p) => p.grupo))];
  const g = groups.length === 1 && gById(groups[0]);
  const at = $("#modal-lote .instr-block") || $("#modal-lote .row.end");
  $("#modal-lote .warn.small")?.remove();  // el aviso de «no son de la misma carpeta» lo reemplaza el bloque de abajo
  if (g) {
    const info = FINFO[g.id] || {};
    at?.insertAdjacentHTML("beforebegin", `<div class="lote-kit" style="--gc:${g.color}">
      <div><b>🧩 Lo que comparten</b> <span class="muted small">(los assets de la carpeta ${g.emoji} ${esc(g.nombre)} salen en los ${sel.length})</span>
        <div class="muted small">${info.assets ? `${info.assets} assets guardados` : "Todavía no hay assets en la carpeta"}${info.instr ? " · con instrucciones" : ""}</div></div>
      <div class="spacer"></div><button class="btn" onclick="loteAssets('${g.id}')">${info.assets ? "Ver o agregar" : "＋ Agregar assets"}</button></div>`);
  } else {
    at?.insertAdjacentHTML("beforebegin", `<div class="lote-kit">
      <div><b>📁 ¿Son de la misma campaña?</b> <div class="muted small">Guárdalos en una carpeta: así comparten los assets y las
        instrucciones, y los subes <b>una sola vez</b> para todos.</div></div>
      <div class="row"><input id="lote-folder" placeholder="Nombre de la campaña, ej: SideShift" onkeydown="if(event.key==='Enter')loteFolder()">
        <button class="btn primary" onclick="loteFolder()">Crear carpeta</button></div></div>`);
  }
};
async function loteAssets(gid) {
  $("#modal-lote").classList.add("hidden");
  await openAssets("grupo", gid);
  AS.onClose = async () => { await loadFolderInfo(); openLote(); };
}
async function loteFolder() {
  const nombre = ($("#lote-folder")?.value || "").trim();
  if (!nombre) return toast("Escribe el nombre de la campaña");
  let base = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "carpeta", id = base, n = 2;
  while (gById(id)) id = `${base}-${n++}`;
  GROUPS.push({ id, nombre, color: GROUP_COLORS[GROUPS.length % GROUP_COLORS.length], emoji: "📣" });
  try {
    await saveGroups();
    for (const job of LOTE.sel) await api(`/api/project/${job}/state`, { grupo: id });
    await loadProjects();
    toast(`Carpeta 📣 ${nombre} creada con los ${LOTE.sel.size} videos ✓`);
    openLote();
  } catch (e) { toast(e.message, true); }
}
const _closeAssetsF = closeAssets;
closeAssets = async function () {
  const after = AS && AS.onClose;
  await _closeAssetsF();
  if (curView === "projects") { await loadFolderInfo(); renderFolders(); }
  if (after) after();
};

// al guardar o borrar una carpeta, refrescar las carpetas
const _saveGroupF = saveGroup;
saveGroup = async function () { await _saveGroupF(); await loadFolderInfo(); if (curView === "projects") renderProjects(); };

loadGroups().then(loadFolderInfo).then(() => { if (curView === "projects") renderProjects(); });
if (typeof TOURS !== "undefined") {
  const i = TOURS.inicio.findIndex((s) => s.sel === "#btn-lote");
  TOURS.inicio.splice(i < 0 ? 2 : i, 0, { sel: "#folders", title: "📁 Carpetas",
    text: "Una carpeta por campaña o marca (ej: SideShift). Dentro guardas sus videos, y los <b>assets e instrucciones</b> que comparten todos. Arrastra un video encima de una carpeta para guardarlo ahí, y desde la carpeta puedes <b>editarlos todos juntos</b>." });
}
