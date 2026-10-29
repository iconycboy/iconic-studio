// Estudio de Video — assets: lo que tiene que salir en un video (logo, fotos o videos del producto, un texto exacto…).
// Van por video, o por carpeta (marca / campaña) y entonces valen para todos sus videos. Los usa Claude al editar.

const KIND = { imagen: "🖼️", video: "🎞", audio: "🎵", fuente: "🔤", documento: "📄", texto: "✍️" };
const KIND_N = { imagen: "Imagen", video: "Video", audio: "Audio", fuente: "Tipografía", documento: "Documento", texto: "Texto" };
const USO_HINT = {
  imagen: "Ej: mi logo en la esquina todo el video · la foto del producto cuando digo «este es»",
  video: "Ej: ponlo cuando explico cómo se aplica · al final, unos 3 segundos",
  audio: "Ej: la canción de la campaña, bajita de fondo",
  fuente: "Ej: usa esta letra para los textos en pantalla",
  documento: "Ej: las reglas de la marca: respétalas",
  texto: "Ej: grande al final · en pantalla cuando digo el descuento",
};
let AS = null;  // { scope, id, titulo, items, carpeta, back }

const assetUrl = (scope, id, a) => `/asset/${scope}/${id}/${encodeURIComponent(a.archivo)}`;
function assetThumb(scope, id, a) {
  if (a.tipo === "imagen") return `<img src="${assetUrl(scope, id, a)}" loading="lazy" alt="">`;
  if (a.tipo === "video") return `<video src="${assetUrl(scope, id, a)}#t=0.5" muted preload="metadata"></video>`;
  return `<span>${KIND[a.tipo] || "📎"}</span>`;
}
const assetLabel = (a) => (a.tipo === "texto" ? `«${a.texto}»` : a.nombre || a.archivo);

async function openAssets(scope, id, back) {
  scope = scope || "video"; id = id || cur.job;
  try {
    const g = scope === "grupo" ? gById(id) : null;
    AS = { scope, id, back: back || null, titulo: g ? `${g.emoji} ${g.nombre}` : cur.titulo,
           items: (await api(`/api/assets/${scope}/${id}`)).assets, grupo: null };
    // los de la carpeta del video se usan también: se muestran abajo, para verlos
    if (scope === "video" && cur.grupo && gById(cur.grupo))
      AS.grupo = { g: gById(cur.grupo), items: (await api(`/api/assets/grupo/${cur.grupo}`)).assets };
  } catch (e) { return toast(e.message, true); }
  renderAssets();
  $("#modal-assets").classList.remove("hidden");
}

function renderAssets() {
  const S = AS, many = S.items.length > 1;
  const items = S.items.map((a, i) => `<div class="asset ${a.obligatorio ? "must" : ""}">
      <div class="asset-thumb">${a.tipo === "texto" ? "<span>✍️</span>" : assetThumb(S.scope, S.id, a)}</div>
      <div class="asset-body">
        <div class="row"><span class="tagpill">${KIND[a.tipo] || "📎"} ${KIND_N[a.tipo] || a.tipo}</span>
          ${a.tipo === "texto" ? "" : `<b class="ellipsis grow" title="${esc(a.nombre || a.archivo)}">${esc(a.nombre || a.archivo)}</b>`}
          <div class="spacer"></div>
          ${many ? `<button class="btn ghost" title="Subir" onclick="moveAsset(${i},-1)" ${i ? "" : "disabled"}>↑</button>
          <button class="btn ghost" title="Bajar" onclick="moveAsset(${i},1)" ${i < S.items.length - 1 ? "" : "disabled"}>↓</button>` : ""}
          <button class="btn ghost danger" title="Quitar" onclick="removeAsset(${i})">✕</button></div>
        ${a.tipo === "texto" ? `<textarea class="asset-text" rows="2" placeholder="Escribe el texto EXACTO que tiene que salir. Ej: Usa mi código MICODIGO10 y llévate 15% de descuento"
          oninput="AS.items[${i}].texto=this.value;saveAssetsSoon()">${esc(a.texto || "")}</textarea>` : ""}
        <input class="asset-uso" value="${esc(a.uso || "")}" placeholder="¿Cuándo o cómo va? ${esc(USO_HINT[a.tipo] || "")}"
          oninput="AS.items[${i}].uso=this.value;saveAssetsSoon()">
        <label class="check small"><input type="checkbox" ${a.obligatorio ? "checked" : ""}
          onchange="AS.items[${i}].obligatorio=this.checked;this.closest('.asset').classList.toggle('must',this.checked);saveAssetsSoon()">
          Tiene que salir sí o sí <span class="muted">(si no, Claude decide si lo usa)</span></label>
      </div></div>`).join("");
  const group = S.scope !== "video" ? "" : S.grupo
    ? `<div class="asset-group"><div class="row"><h3>${S.grupo.g.emoji} De tu carpeta «${esc(S.grupo.g.nombre)}»</h3>
         <span class="muted small">también se usan en este video</span><div class="spacer"></div>
         <button class="btn ghost" onclick="openAssets('grupo','${S.grupo.g.id}','${esc(cur.job)}')">Editar los de la carpeta →</button></div>
         ${S.grupo.items.length ? `<div class="chips">${S.grupo.items.map((a) => `<span class="chip" title="${esc(a.uso || "")}">${KIND[a.tipo] || "📎"} ${esc(assetLabel(a).slice(0, 60))}</span>`).join("")}</div>`
           : `<p class="muted small">Esta carpeta todavía no tiene assets. Lo que pongas ahí (logo de la marca, su código, su canción…) sale en todos sus videos sin volver a subirlo.</p>`}</div>`
    : `<p class="muted small asset-tip">💡 ¿Son de una marca o campaña que se repite? Mete este video en una <b>carpeta</b> (junto al título, arriba)
         y agrega ahí sus assets: así sirven para todos los videos de esa marca.</p>`;
  $("#modal-assets .modal-card").innerHTML = `
    <div class="row">${S.back ? `<button class="btn ghost" onclick="openAssets('video','${esc(S.back)}')">← Volver al video</button>` : ""}
      <h2>Assets ${S.scope === "grupo" ? "de la carpeta" : "de"} «${esc(S.titulo)}»</h2></div>
    <p class="muted">${S.scope === "grupo"
      ? `Lo que tiene que salir en <b>todos</b> los videos de esta carpeta: el logo de la marca, su código de descuento, una frase de la campaña…`
      : `Lo que tiene que salir en este video: tu logo, fotos o videos del producto, un texto o código exacto, una canción…`}
      <b>Claude los pone cuando edita</b>; tú solo dile cuándo o cómo con una frase.</p>
    <div class="row">
      <button class="btn primary" onclick="pickAssets()">${ico("plus")} Fotos, videos o logos…</button>
      <button class="btn" onclick="addAssetText()">${ico("plus")} Un texto</button>
      <div class="spacer"></div>
      <button class="btn ghost" onclick="api('/api/assets/${S.scope}/${S.id}',{abrir:1}).catch(e=>toast(e.message,true))" title="Abrir la carpeta">${ico("folder")}</button>
    </div>
    ${window.pywebview ? "" : `<div class="row"><input id="asset-path" class="grow" placeholder="O pega aquí la ruta de un archivo y presiona Enter"
      onkeydown="if(event.key==='Enter'){addAssetFiles([this.value]);this.value=''}"></div>`}
    <div class="asset-list">${items || `<div class="files-empty muted small">Todavía no hay nada. Toca <b>«＋ Fotos, videos o logos…»</b>
      (puedes elegir varios con <kbd>Ctrl</kbd>) o <b>«＋ Un texto»</b>.</div>`}</div>
    ${group}
    <p class="muted small">Los usa Claude en la <b>⚡ edición automática</b>, cuando le hablas o cuando le mandas comentarios.
      El camino paso a paso no los pone solo. Tus archivos originales no se mueven: la app guarda una copia.</p>
    <div class="row end"><span class="muted small" id="asset-saved"></span><div class="spacer"></div>
      <button class="btn primary big" onclick="closeAssets()">Listo</button></div>`;
}

let assetTimer = null;
function saveAssetsSoon() { clearTimeout(assetTimer); assetTimer = setTimeout(saveAssets, 500); $("#asset-saved").textContent = "Guardando…"; }
async function saveAssets() {
  clearTimeout(assetTimer); assetTimer = null;
  if (!AS) return;
  try {
    await api(`/api/assets/${AS.scope}/${AS.id}`, { assets: AS.items });
    const s = $("#asset-saved"); if (s) s.textContent = "Guardado ✓";
  } catch (e) { toast(e.message, true); }
}
async function addAssetFiles(paths) {
  paths = paths.map((p) => (p || "").trim().replace(/^"|"$/g, "")).filter(Boolean);
  if (!paths.length) return;
  if (assetTimer) await saveAssets();
  try {
    const pending = AS.items.filter((a) => a.tipo === "texto" && !a.texto.trim());  // un texto a medio escribir se queda
    AS.items = (await api(`/api/assets/${AS.scope}/${AS.id}`, { agregar: paths })).assets.concat(pending);
    renderAssets();
    toast(paths.length > 1 ? `${paths.length} archivos agregados ✓` : "Agregado ✓");
  } catch (e) { toast(e.message, true); }
}
async function pickAssets() {
  if (!window.pywebview) return toast("Pega la ruta del archivo en el campo de abajo y presiona Enter");
  addAssetFiles((await window.pywebview.api.elegir_assets()) || []);
}
function addAssetText() {
  AS.items.push({ id: Math.random().toString(16).slice(2, 10), tipo: "texto", texto: "", uso: "", obligatorio: true });
  renderAssets();
  const t = document.querySelectorAll("#modal-assets .asset-text"); t[t.length - 1]?.focus();
}
function moveAsset(i, d) {
  const j = i + d; if (j < 0 || j >= AS.items.length) return;
  [AS.items[i], AS.items[j]] = [AS.items[j], AS.items[i]];
  renderAssets(); saveAssets();
}
function removeAsset(i) {
  const a = AS.items[i];
  if ((a.texto || a.archivo) && !confirm(`¿Quitar ${assetLabel(a)} de los assets? (si es un archivo, tu original no se borra)`)) return;
  AS.items.splice(i, 1); renderAssets(); saveAssets();
}
async function closeAssets() {
  if (assetTimer) await saveAssets();
  $("#modal-assets").classList.add("hidden");
  AS = null;
  if (cur && curView === "project") { await refreshProject(); if (curStep === "inicio") showStep("inicio"); }
}

// tarjeta en el inicio del video: antes de los dos caminos, porque hay que ponerlos antes de editar
async function fillAssetsCard() {
  const box = $("#card-assets .asset-chips");
  if (!box || !cur) return;
  try {
    const mine = (await api(`/api/assets/video/${cur.job}`)).assets;
    const g = cur.grupo && gById(cur.grupo);
    const theirs = g ? (await api(`/api/assets/grupo/${g.id}`)).assets : [];
    const chip = (a, pre) => `<span class="chip" title="${esc(a.uso || "")}">${pre}${KIND[a.tipo] || "📎"} ${esc(assetLabel(a).slice(0, 40))}</span>`;
    box.innerHTML = mine.map((a) => chip(a, "")).join("") + theirs.map((a) => chip(a, `${g.emoji} `)).join("");
    const n = mine.length + theirs.length;
    $("#card-assets .tagpill").textContent = n ? `${n}` : "ninguno";
  } catch (e) { /* servidor reiniciando */ }
}
const _renderHomeA = renderHome;
renderHome = function (P) {
  _renderHomeA(P);
  const paths = P.querySelector(".paths");
  if (!paths) return;
  paths.insertAdjacentHTML("beforebegin", `<div class="box wide" id="card-assets">
    <div class="row"><div class="grow"><h3>${ico("puzzle")} Assets <span class="tagpill">${cur.assets || "…"}</span></h3>
      <p class="muted small">¿Hay un logo, fotos o videos del producto, o un texto que <b>tiene que</b> salir? Agrégalos aquí
        <b>antes</b> de editar y Claude los pone.</p></div>
      <button class="btn" onclick="openAssets()">Agregar o ver</button></div>
    <div class="chips asset-chips"></div></div>`);
  fillAssetsCard();
};

// en la carpeta: botón para sus assets
const _renderGroupModalA = renderGroupModal;
renderGroupModal = function () {
  _renderGroupModalA();
  if (!editingGroup.id) return;
  const end = $("#modal-group .row.end");
  end?.insertAdjacentHTML("beforebegin", `<label>Assets</label><div class="row">
    <button class="btn" onclick="$('#modal-group').classList.add('hidden');openAssets('grupo','${editingGroup.id}', cur && curView === 'project' ? cur.job : null)">🧩 Assets e instrucciones de la carpeta</button>
    <span class="muted small">logo, código, canción e instrucciones para todos sus videos</span></div>`);
};

// montaje: la ventana, el botón de arriba y un paso en el recorrido
document.body.insertAdjacentHTML("beforeend", `<div id="modal-assets" class="modal hidden"><div class="modal-card wide assets-card"></div></div>`);
(() => {
  const b = document.createElement("button");
  b.className = "btn ghost"; b.id = "btn-assets"; b.innerHTML = `${ico("puzzle")} Assets`; b.title = "Logo, fotos, videos o textos que tienen que salir";
  b.onclick = () => openAssets();
  $("#btn-notes").before(b);
})();
if (typeof TOURS !== "undefined") {
  const i = TOURS.proyecto.findIndex((s) => s.sel === "#card-auto");
  TOURS.proyecto.splice(i < 0 ? 1 : i, 0, { sel: "#card-assets", title: "🧩 Tus assets",
    text: "¿El video es de una campaña o marca? Aquí agregas lo que <b>tiene que</b> salir: logo, fotos o videos del producto, un código o texto exacto. Agrégalos <b>antes</b> de editar y Claude los pone donde le digas." });
}
