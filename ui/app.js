// Iconic Studio — interfaz
const $ = (s) => document.querySelector(s);
const STEPS = [
  { id: "importar", n: "Importar", sub: "copia del video" },
  { id: "transcribir", n: "Transcribir", sub: "texto palabra por palabra" },
  { id: "editar", n: "Editar por texto", sub: "tú decides qué queda" },
  { id: "cortar", n: "Aplicar corte", sub: "bordes pulidos al audio" },
  { id: "audio", n: "Audio", sub: "volumen de voz parejo" },
  { id: "subtitulos", n: "Subtítulos", sub: "texto sobre el video" },
  { id: "capcut", n: "Enviar a CapCut", sub: "clips separados" },
  { id: "exportar", n: "Exportar MP4", sub: "video final" },
];
const ICON = { hecho: "✓", error: "!", desactualizado: "↻", trabajando: "…", pendiente: "" };
const LANG = { es: "Español", en: "Inglés", pt: "Portugués" };
const GAP = 0.65;
const FILLERS = new Set(["eh", "ehh", "ehm", "em", "emm", "mm", "mmm", "mhm", "uh", "uhh", "um", "umm", "uhm", "ah", "ahh", "hmm"]);

let projects = [];
let cur = null;        // resumen del proyecto abierto
let curStep = null;
let logSince = 0;
let lastTaskKey = null;

// ------------------------------------------------------------------ util
async function api(path, body) {
  const r = await fetch(path, body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error || r.statusText);
  return data;
}
function toast(msg, err) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (err ? " err" : "");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add("hidden"), err ? 6000 : 2800);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function fmt(sec) {
  sec = Math.max(0, sec || 0);
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function debounce(fn, ms) { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; }

// ------------------------------------------------------------------ proyectos
let USUARIO = "";
async function loadProjects() {
  const d = await api("/api/projects");
  projects = d.proyectos;
  USUARIO = d.usuario || "";
  $("#hello").textContent = USUARIO ? `Hola, ${USUARIO} 👋` : "Hola 👋";
  renderProjects();
}
function renderProjects() {
  const q = $("#search").value.toLowerCase();
  const list = projects.filter((p) => !q || p.titulo.toLowerCase().includes(q) || p.notas.toLowerCase().includes(q));
  $("#empty").classList.toggle("hidden", projects.length > 0);
  $("#projects").innerHTML = list.map((p) => {
    const next = STEPS.find((s) => p.pasos[s.id] !== "hecho");
    return `<div class="card" onclick="openProject('${p.job}')">
      <div class="thumb" style="${p.thumb ? `background-image:url('${p.thumb}')` : ""}">${p.thumb ? "" : ico("film")}</div>
      <div class="info">
        <h3>${esc(p.titulo)}</h3>
        <div class="meta"><span>${p.final ? "✓ Exportado" : next ? "Siguiente: " + next.n : ""}</span><span>${LANG[p.idioma] || p.idioma}</span></div>
        <div class="bar"><div style="width:${p.progreso}%"></div></div>
        ${p.notas ? `<div class="note">${ico("notes")} ${esc(p.notas)}</div>` : ""}
      </div></div>`;
  }).join("");
}
function showProjects() {
  stopEditor();
  cur = null;
  curStep = null;
  view("projects");
  loadProjects();
}

// ------------------------------------------------------------------ mi estilo
const RULE_EXAMPLES = ["Subtítulos más grandes", "Cortes más rápidos, sin pausas", "Nada de música de fondo",
  "Empezar siempre con lo más interesante", "Sin gráficos, solo subtítulos", "Mi marca se escribe así: …"];
let rules = [];
async function showStyle() {
  stopEditor();
  view("style");
  $("#rule-examples").innerHTML = "<span class='muted small'>Ideas:</span>" +
    RULE_EXAMPLES.map((r) => `<button class="chip" onclick="$('#rule-new').value=this.textContent;$('#rule-new').focus()">${esc(r)}</button>`).join("");
  try { rules = (await api("/api/reglas")).reglas; } catch (e) { return toast(e.message, true); }
  renderRules();
}
function renderRules() {
  const mine = rules.map((r, i) => ({ r, i })).filter((x) => !x.r.startsWith("[app]"));
  $("#rules").innerHTML = mine.length ? mine.map(({ r, i }) => `<div class="rule">
      <span class="rule-dot">✦</span><div class="grow" contenteditable="true" spellcheck="true"
        onblur="editRule(${i}, this.textContent)">${esc(r)}</div>
      <button class="btn ghost icon" title="Borrar esta regla" onclick="delRule(${i})">${ico("trash")}</button></div>`).join("")
    : `<div class="muted">Todavía nada. Cuando termines un video y le cuentes a Claude qué te gustó, aparecerá aquí.
       También puedes escribir una regla arriba.</div>`;
  $("#rules").insertAdjacentHTML("beforeend", `<p class="muted small" style="margin-top:12px">Para cambiar una regla, toca su texto y escribe.
     Claude la usa desde el próximo video.</p>`);
}
async function saveRules(msg) {
  try { rules = (await api("/api/reglas", { reglas: rules })).reglas; renderRules(); if (msg) toast(msg); }
  catch (e) { toast(e.message, true); }
}
function addRule() {
  const t = $("#rule-new").value.trim();
  if (!t) return;
  rules.push(t); $("#rule-new").value = "";
  saveRules("Regla guardada ✓ Claude la usará desde el próximo video");
}
function editRule(i, t) { t = t.trim(); if (t && t !== rules[i]) { rules[i] = t; saveRules("Cambio guardado ✓"); } }
function delRule(i) {
  if (!confirm("¿Borrar esta regla? Claude dejará de aplicarla.")) return;
  rules.splice(i, 1); saveRules("Regla borrada");
}
$("#search").addEventListener("input", renderProjects);
$("#btn-new").addEventListener("click", openNew);

// ------------------------------------------------------------------ nuevo video (una o varias partes)
let newFiles = [];
const baseName = (p) => p.split(/[\\/]/).pop();
function openNew() {
  newFiles = []; $("#new-title").value = ""; $("#new-path").value = "";
  $("#new-path-row").classList.toggle("hidden", !!window.pywebview);  // sin ventana nativa: pegar la ruta
  renderNewFiles();
  $("#modal-new").classList.remove("hidden");
}
function closeNew() { $("#modal-new").classList.add("hidden"); }
// el selector nativo devuelve una lista; en el navegador de pruebas se pega la ruta
async function chooseFiles() {
  if (!window.pywebview) { toast("Pega la ruta del video en el campo de abajo y presiona Enter"); return []; }
  return (await window.pywebview.api.elegir_video()) || [];
}
async function pickVideo() { (await chooseFiles()).forEach(addNewFile); }
function addNewFile(p) {
  p = (p || "").trim().replace(/^"|"$/g, "");
  if (!p || newFiles.includes(p)) return;
  newFiles.push(p);
  if (!$("#new-title").value) $("#new-title").value = baseName(p).replace(/\.[^.]+$/, "");
  renderNewFiles();
}
function moveNew(i, d) {
  const j = i + d; if (j < 0 || j >= newFiles.length) return;
  [newFiles[i], newFiles[j]] = [newFiles[j], newFiles[i]]; renderNewFiles();
}
function renderNewFiles() {
  $("#new-files").innerHTML = newFiles.length ? newFiles.map((p, i) => `<div class="file">
      <span class="file-n">${newFiles.length > 1 ? `Parte ${i + 1}` : "🎬"}</span><span class="grow ellipsis" title="${esc(p)}">${esc(baseName(p))}</span>
      ${newFiles.length > 1 ? `<button class="btn ghost" title="Subir" onclick="moveNew(${i},-1)" ${i ? "" : "disabled"}>↑</button>
      <button class="btn ghost" title="Bajar" onclick="moveNew(${i},1)" ${i < newFiles.length - 1 ? "" : "disabled"}>↓</button>` : ""}
      <button class="btn ghost" title="Quitar" onclick="newFiles.splice(${i},1);renderNewFiles()">✕</button></div>`).join("")
    + (newFiles.length > 1 ? `<p class="muted small">Ordénalas como van en el video con ↑ ↓. Claude las une en un solo video.</p>` : "")
    : `<div class="muted small files-empty">Ningún video elegido todavía.</div>`;
}
async function createProject() {
  if (!newFiles.length) return toast("Primero elige tu video con «＋ Elegir video(s)…»");
  try {
    const d = await api("/api/projects", { origenes: newFiles, titulo: $("#new-title").value.trim(), idioma: $("#new-lang").value });
    closeNew();
    await openProject(d.job);
  } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ partes de un video ya creado
async function addParts() {
  const files = await chooseFiles();
  if (!files.length) return;
  if (cur.pasos.transcribir === "hecho" &&
      !confirm(`Vas a agregar ${files.length} parte(s) al final. Después hay que volver a transcribir, y lo que tachaste en «Editar por texto» empieza de cero. ¿Seguir?`)) return;
  try { await api(`/api/project/${cur.job}/partes`, { agregar: files }); toast("Agregando…"); await refreshProject(); showStep("importar"); }
  catch (e) { toast(e.message, true); }
}
async function addPartPath() {
  const p = $("#add-path").value.trim().replace(/^"|"$/g, "");
  if (!p) return;
  try { await api(`/api/project/${cur.job}/partes`, { agregar: [p] }); await refreshProject(); showStep("importar"); }
  catch (e) { toast(e.message, true); }
}
async function movePart(i, d) {
  const names = cur.partes.map((p) => p.archivo), j = i + d;
  if (j < 0 || j >= names.length) return;
  [names[i], names[j]] = [names[j], names[i]];
  try { await api(`/api/project/${cur.job}/partes`, { orden: names }); await refreshProject(); showStep("importar"); }
  catch (e) { toast(e.message, true); }
}
async function removePart(i) {
  if (!confirm(`¿Quitar «${cur.partes[i].nombre}» de este video? (tu archivo original no se borra)`)) return;
  try { await api(`/api/project/${cur.job}/partes`, { quitar: cur.partes[i].archivo }); await refreshProject(); showStep("importar"); }
  catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ proyecto
async function openProject(job) {
  cur = await api(`/api/project/${job}`);
  view("project");
  $("#p-title").value = cur.titulo;
  $("#p-notes").value = cur.notas;
  lastSig = "";
  renderSteps();
  showStep("inicio");
  if (typeof Tour !== "undefined") Tour.auto("proyecto");
}
function view(name) {
  for (const v of ["projects", "project", "style", "help"]) $(`#view-${v}`).classList.toggle("hidden", v !== name);
  curView = name;
}
let curView = "projects";
const nextStep = () => STEPS.find((s) => cur.pasos[s.id] !== "hecho");
async function refreshProject() {
  if (!cur) return;
  cur = await api(`/api/project/${cur.job}`);
  renderSteps();
}
function renderSteps() {
  $("#p-progress").textContent = cur.final && cur.pasos.exportar === "hecho" ? "✓ Terminado" : `${cur.progreso}% completo`;
  $("#steps").innerHTML = `<div class="step home ${curStep === "inicio" ? "active" : ""}" id="step-inicio" onclick="showStep('inicio')">
      <div class="dot">${ico("home")}</div><div class="lbl"><span>Inicio</span><span class="sub">elige cómo editar</span></div></div>
    <div class="steps-label">Paso a paso</div>` + STEPS.map((s, i) => {
    const st = cur.pasos[s.id];
    return `<div class="step ${st} ${curStep === s.id ? "active" : ""}" onclick="showStep('${s.id}')">
      <div class="dot">${ICON[st] || i + 1}</div>
      <div class="lbl"><span>${s.n}</span><span class="sub">${st === "desactualizado" ? "repítelo: cambiaste algo antes" : st === "error" ? "algo falló: toca aquí" : s.sub}</span></div>
    </div>`;
  }).join("");
}
const saveMeta = debounce(async () => {
  if (!cur) return;
  try { cur = await api(`/api/project/${cur.job}/state`, { titulo: $("#p-title").value, notas: $("#p-notes").value }); }
  catch (e) { toast(e.message, true); }
}, 600);
$("#p-title").addEventListener("input", saveMeta);
$("#p-notes").addEventListener("input", saveMeta);
function toggleNotes() { $("#notes").classList.toggle("hidden"); }
function toggleConsole() { $("#console").classList.toggle("collapsed"); }
// ------------------------------------------------------------------ Claude (ventana aparte)
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
let pendingClaude = null;
function openClaude(modo, texto) {
  pendingClaude = { modo, texto: texto || "" };
  if (store("claude-guia-vista") === "1") return confirmClaude();
  $("#claude-skip").checked = false;
  $("#modal-claude").classList.remove("hidden");
}
function closeClaudeGuide() { $("#modal-claude").classList.add("hidden"); pendingClaude = null; }
async function confirmClaude() {
  if ($("#claude-skip").checked) store("claude-guia-vista", "1");
  $("#modal-claude").classList.add("hidden");
  const p = pendingClaude || { modo: "libre", texto: "" };
  pendingClaude = null;
  try {
    await api(`/api/project/${cur.job}/claude`, p);
    toast({ auto: "Claude empezó a editar tu video en su ventana ✦", comentarios: "Claude recibió tus comentarios ✦",
            ayuda: "Claude está revisando qué pasó ✦" }[p.modo] || "Abriendo Claude en su ventana ✦");
  } catch (e) { toast(e.message, true); }
}
function startAuto() {
  openClaude("auto");
}
function sendFeedback() {
  const t = $("#fb-text").value.trim();
  if (t.length < 4) return toast("Escribe primero qué te gustó o qué cambiarías 🙂");
  openClaude("comentarios", t);
  $("#fb-text").value = "";
}

// mientras trabajas con Claude en su ventana, la app vuelve a leer el proyecto cada pocos segundos
let lastSig = "";
setInterval(async () => {
  if (!cur || curView !== "project" || document.hidden) return;
  try {
    const p = await api(`/api/project/${cur.job}`);
    const sig = JSON.stringify([p.pasos, p.preview_corte, p.preview_subs, p.subtitulos, p.final]);
    if (lastSig && sig !== lastSig) {
      cur = p; renderSteps();
      // en el editor no se redibuja: perdería tu selección y lo que estás reproduciendo
      if (curStep !== "editar") showStep(curStep);
    }
    lastSig = sig;
  } catch (e) { /* servidor reiniciando */ }
}, 5000);

async function openFolder(sub) { try { await api(`/api/project/${cur.job}/open`, { sub }); } catch (e) { toast(e.message, true); } }

async function run(step, label) {
  try {
    await api(`/api/project/${cur.job}/run/${step}`, {});
    $("#console").classList.remove("collapsed");
    toast(label || "Trabajando…");
    await refreshProject();
    showStep(step);
  } catch (e) { toast(e.message, true); }
}

function showStep(id) {
  if (curStep === "editar" && id !== "editar") stopEditor();
  curStep = id;
  renderSteps();
  const P = $("#panel");
  if (id === "inicio") return renderHome(P);
  const st = cur.pasos[id];
  const busy = st === "trabajando";
  const btn = (label, extra = "") => `<button class="btn primary big" ${busy ? "disabled" : ""} ${extra}>${busy ? "Trabajando…" : label}</button>`;
  const ready = (dep) => cur.pasos[dep] === "hecho";
  showStepBody(id, st, busy, btn, ready, P);
  if (st === "error") P.insertAdjacentHTML("afterbegin", `<div class="oops">
      <div class="oops-icon">😕</div>
      <div><b>Algo salió mal en este paso.</b> No es tu culpa y no se perdió nada: tu video original está intacto.
        Claude puede revisar qué pasó y arreglarlo.</div>
      <div class="row"><button class="btn claude" onclick="openClaude('ayuda','${id}')">🆘 Pedirle ayuda a Claude</button>
        <button class="btn ghost" onclick="toggleConsole()">Ver detalles técnicos</button></div></div>`);
  if (busy) P.insertAdjacentHTML("afterbegin", `<div class="working"><span class="spin"></span>
      <div><b>Trabajando en esto…</b> Puedes esperar aquí o salir: el progreso se ve abajo. ${id === "transcribir" ? "La primera vez tarda más." : ""}</div></div>`);
}

function renderHome(P) {
  const nx = nextStep();
  const done = cur.final && cur.pasos.exportar === "hecho";
  const stale = cur.final && !done;
  const anyDone = STEPS.some((s) => s.id !== "importar" && cur.pasos[s.id] === "hecho");
  const working = STEPS.find((s) => cur.pasos[s.id] === "trabajando");
  P.innerHTML = `<div class="home-wrap">
    <div class="home-head">
      ${cur.thumb ? `<img src="${cur.thumb}" class="home-thumb">` : ""}
      <div><h2>${esc(cur.titulo)}</h2>
        <p class="muted">${done ? "✅ <b>¡Este video ya está terminado!</b> Puedes verlo abajo, o pedirle cambios a Claude."
          : working ? `⏳ Ahora mismo: <b>${working.n}</b>…`
          : nx && anyDone ? `Vas en el paso <b>${nx.n}</b>.` : "Video listo para editar. ¿Cómo quieres hacerlo?"}</p></div>
    </div>
    ${cur.final ? `<div class="box wide"><h3>${done ? "🎉 Tu video final" : "🎞 Tu última versión exportada"}</h3>
      ${stale ? `<p class="warn small">Cambiaste algo después de exportarlo, así que este video ya no tiene esos cambios.
        Vuelve a exportarlo (o pídele a Claude que lo haga).</p>` : ""}
      <video src="${cur.final_url}" controls class="preview"></video>
      <div class="row" style="margin-top:10px"><button class="btn" onclick="openFolder('outputs')">📁 Ver el archivo</button>
      <span class="muted small">También hay una copia en tu carpeta <b>Descargas</b>, lista para subir.</span></div></div>` : ""}
    <div class="paths">
      <div class="path-card auto" id="card-auto">
        <div class="path-icon">${ico("zap")}</div>
        <h3>Que Claude lo edite todo</h3>
        <p>Claude hace el video completo: quita silencios y errores, ajusta el sonido y el color, pone subtítulos y gráficos,
          y lo exporta. Usa <b>tu estilo</b> (lo que le has enseñado). Tú solo lo ves al final.</p>
        <p class="muted small">⏱ Unos 15–40 minutos según lo largo del video. Puedes hacer otra cosa mientras.</p>
        <button class="btn claude big" onclick="startAuto()">${ico("zap")} ${done ? "Volver a editarlo todo" : "Empezar edición automática"}</button>
      </div>
      <div class="path-card manual" id="card-manual">
        <div class="path-icon">${ico("scissors")}</div>
        <h3>Hacerlo yo, paso a paso</h3>
        <p>Tú decides cada cosa: lees lo que dijiste en el video y tachas lo que sobra, como en un documento.
          Luego un botón por paso: sonido, subtítulos y exportar.</p>
        <p class="muted small">⏱ Lo que tú quieras. Ideal para videos cortos o para dejarlo exacto.</p>
        <button class="btn primary big" onclick="showStep('${nx ? nx.id : "exportar"}')">${anyDone ? `Seguir: ${nx ? nx.n : "Exportar"} →` : "Empezar paso a paso"}</button>
      </div>
    </div>
    <div class="box wide" id="card-feedback">
      <h3>${ico("message")} Cuéntale a Claude qué te gustó y qué no</h3>
      <p class="muted">Escríbelo como se lo dirías a una persona. Claude arregla el video y <b>se lo aprende</b> para los
        próximos (lo verás en <a href="#" onclick="showStyle();return false">Mi estilo</a>).</p>
      <textarea id="fb-text" rows="3" class="grow" placeholder="Ej: el inicio está lento, empieza directo con la parte del gloss. Los subtítulos me gustan pero más grandes."></textarea>
      <div class="row end" style="margin-top:8px"><button class="btn claude" onclick="sendFeedback()">Enviar a Claude ✦</button></div>
    </div>
    <p class="muted small center">¿Quieres pedirle otra cosa? Usa <b>Hablar con Claude</b>, arriba a la derecha.</p>
  </div>`;
}

function showStepBody(id, st, busy, btn, ready, P) {
  if (id === "importar") {
    const ps = cur.partes || [], many = ps.length > 1, locked = cur.pasos.transcribir === "hecho" || cur.pasos.transcribir === "desactualizado";
    P.innerHTML = `<h2>Importar</h2>
      <p class="lead">${many ? `Tu video tiene <b>${ps.length} partes</b>. La app las une en este orden.` : "El video se copió a la carpeta del proyecto."}
        Tus archivos originales quedan intactos donde estaban.</p>
      <div class="box"><h3 style="margin-top:0">${many ? "Las partes, en orden" : "Tu video"}</h3>
        ${ps.map((p, i) => `<div class="file"><span class="file-n">${many ? `Parte ${i + 1}` : "🎬"}</span>
          <span class="grow ellipsis">${esc(p.nombre)}</span><span class="muted small">${p.dur ? fmt(p.dur) : ""}</span>
          ${many && !locked && !busy ? `<button class="btn ghost" title="Subir" onclick="movePart(${i},-1)" ${i ? "" : "disabled"}>↑</button>
            <button class="btn ghost" title="Bajar" onclick="movePart(${i},1)" ${i < ps.length - 1 ? "" : "disabled"}>↓</button>
            <button class="btn ghost" title="Quitar" onclick="removePart(${i})">✕</button>` : ""}</div>`).join("")}
        <div class="row" style="margin-top:10px">
          <button class="btn" onclick="addParts()" ${busy ? "disabled" : ""}>＋ Agregar otra parte</button>
          <span class="muted small">${locked ? "Las partes nuevas se agregan al final. Después hay que volver a transcribir."
            : "¿Grabaste en varios pedazos? Agrégalos aquí."}</span></div>
        ${window.pywebview ? "" : `<div class="row" style="margin-top:8px"><input id="add-path" class="grow" placeholder="Ruta de otra parte (modo navegador)">
          <button class="btn" onclick="addPartPath()">Agregar</button></div>`}
      </div>
      <div class="box">${cur.proxy ? `<video src="${cur.proxy}" controls style="max-width:100%;max-height:50vh;border-radius:8px"></video>` : busy ? "Preparando la vista previa…" : "Sin vista previa."}
        ${many && cur.proxy ? `<p class="muted small">Vista previa con todas las partes seguidas.</p>` : ""}</div>
      <div class="row"><button class="btn" onclick="openFolder('raw')">📁 Ver los archivos copiados</button>
      ${ready("importar") ? `<button class="btn primary" onclick="showStep('transcribir')">Siguiente: Transcribir →</button>` : ""}</div>`;
  } else if (id === "transcribir") {
    P.innerHTML = `<h2>Transcribir</h2>
      <p class="lead">La app escucha el video y escribe cada palabra con su tiempo exacto. Con ese texto vas a editar: borras palabras y el video se corta solo.</p>
      <div class="box"><div class="row">Idioma del video:
        <select id="lang">${Object.entries(LANG).map(([k, v]) => `<option value="${k}" ${cur.idioma === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <ul><li>Usa tu tarjeta gráfica NVIDIA: unos segundos por minuto de video.</li>
        <li class="warn">La primera vez descarga el modelo de voz (3-5 GB): puede tardar 10-20 minutos.</li>
        ${st === "hecho" ? `<li class="warn">Transcribir de nuevo borra lo que hayas editado en el texto.</li>` : ""}</ul></div>
      <div class="row">${btn(st === "hecho" ? "↻ Transcribir de nuevo" : "Transcribir", `onclick="transcribe()"`)}
      ${st === "hecho" ? `<button class="btn primary" onclick="showStep('editar')">Siguiente: Editar →</button>` : ""}</div>`;
  } else if (id === "editar") {
    if (!ready("transcribir")) return need(P, "Editar por texto", "transcribir", "Primero transcribe el video.");
    renderEditor(P);
  } else if (id === "cortar") {
    if (!ready("transcribir")) return need(P, "Aplicar corte", "transcribir", "Primero transcribe y edita el texto.");
    P.innerHTML = `<h2>Aplicar corte</h2>
      <p class="lead">Convierte tu edición del texto en el corte real. La app escucha cada corte y lo ajusta con precisión, para que no se coma el final de ninguna palabra, y quita los silencios largos.</p>
      <div class="box"><ul><li>Lo que tachaste se quita; los silencios largos (más de medio segundo) también.</li>
      <li>Puedes volver a "Editar por texto", cambiar algo y aplicarlo otra vez cuando quieras.</li></ul></div>
      ${cur.preview_corte && st === "hecho" ? `<div class="box"><b>Así quedó tu corte</b> <span class="muted small">(vista previa en baja calidad)</span>
        <video src="${cur.preview_corte}" controls class="preview"></video></div>` : ""}
      <div class="row">${btn(st === "hecho" ? "↻ Aplicar de nuevo" : "Aplicar corte", `onclick="run('cortar','Aplicando el corte…')"`)}
      ${st === "hecho" ? `<button class="btn primary" onclick="showStep('audio')">Siguiente: Audio →</button>` : ""}</div>`;
  } else if (id === "audio") {
    if (!ready("cortar")) return need(P, "Audio", "cortar", "Primero aplica el corte.");
    P.innerHTML = `<h2>Audio</h2>
      <p class="lead">Mide tu voz en las partes que quedaron y le da un volumen parejo y profesional, como el de los videos que ves en redes. Se aplica a una copia del audio; el original no se toca.</p>
      <div class="row">${btn(st === "hecho" ? "↻ Ajustar de nuevo" : "Ajustar audio", `onclick="run('audio','Ajustando el audio…')"`)}
      ${st === "hecho" ? `<button class="btn primary" onclick="showStep('subtitulos')">Siguiente: Subtítulos →</button>` : ""}</div>`;
  } else if (id === "subtitulos") {
    if (!ready("cortar")) return need(P, "Subtítulos", "cortar", "Primero aplica el corte: los subtítulos salen de él.");
    const S = cur.subtitulos || { activos: true, gancho: "" };
    P.innerHTML = `<h2>Subtítulos</h2>
      <p class="lead">Salen de la transcripción de tu corte, así que van exactos con la voz. Letra blanca con borde negro,
        3-4 palabras por línea, abajo, debajo de la cara. Si cambias el corte, vuelve a generarlos.</p>
      <div class="box">
        <label class="check"><input type="checkbox" id="subs-on" ${S.activos ? "checked" : ""}> Poner subtítulos en este video</label>
        <div style="margin-top:12px">
          <div class="muted small" style="margin-bottom:4px">Título arriba (opcional): un cartel blanco que aparece solo durante la primera frase.</div>
          <input id="subs-hook" style="width:100%" maxlength="80" placeholder="Ej: encontré el gloss de mis sueños" value="${esc(S.gancho || "")}">
        </div>
      </div>
      ${cur.preview_subs && st === "hecho" && S.activos ? `<div class="box"><b>Vista previa con subtítulos</b> <span class="muted small">(baja calidad; el video final sale nítido)</span>
        <video src="${cur.preview_subs}" controls class="preview"></video></div>` : ""}
      <div class="row">${btn(st === "hecho" ? "↻ Generar de nuevo" : "Generar subtítulos", `onclick="makeSubs()"`)}
      ${st === "hecho" ? `<button class="btn primary" onclick="showStep('capcut')">Siguiente: CapCut →</button>
        <button class="btn" onclick="showStep('exportar')">o Exportar MP4 →</button>` : ""}</div>`;
  } else if (id === "capcut") {
    if (!ready("cortar")) return need(P, "Enviar a CapCut", "cortar", "Primero aplica el corte.");
    P.innerHTML = `<h2>Enviar a CapCut</h2>
      <p class="lead">Crea un proyecto nuevo en CapCut con tu corte: cada parte es un clip separado que puedes mover, alargar o recortar. Ahí agregas lo que quieras (textos, música, efectos).</p>
      <div class="box"><ul><li class="warn">Guarda lo que tengas abierto en CapCut: la app lo cierra y lo vuelve a abrir sola.</li>
      <li>La primera vez, CapCut necesita tener al menos un proyecto propio: si nunca creaste uno, abre CapCut, «Crear proyecto» y ciérralo.</li>
      ${cur.pasos.audio === "hecho" ? "<li>Usa el audio ajustado.</li>" : `<li class="warn">Todavía no ajustaste el audio: se usará el sonido original.</li>`}
      ${subsLine()}
      <li>Cada envío crea un proyecto nuevo con fecha y hora; los anteriores no se tocan.</li></ul></div>
      <div class="row">${btn(st === "hecho" ? "↻ Enviar otra vez (proyecto nuevo)" : "Enviar a CapCut", `onclick="run('capcut','Creando el proyecto en CapCut…')"`)}</div>`;
  } else if (id === "exportar") {
    if (!ready("cortar")) return need(P, "Exportar MP4", "cortar", "Primero aplica el corte.");
    P.innerHTML = `<h2>Exportar MP4</h2>
      <p class="lead">Si no necesitas CapCut, exporta aquí directo: tu corte con el audio pulido, listo para subir. Queda en el proyecto y una copia en Descargas.</p>
      <div class="box"><ul>${subsLine()}
      <li>Si editaste en CapCut, exporta desde CapCut: esto exporta el corte de la app, no los cambios hechos allá.</li></ul></div>
      <div class="row">${btn(st === "hecho" ? "↻ Exportar de nuevo" : "Exportar", `onclick="run('exportar','Exportando…')"`)}
      ${cur.final ? `<button class="btn" onclick="openFolder('outputs')">📁 Ver el video final</button>` : ""}</div>`;
  }
}
function subsLine() {
  const S = cur.subtitulos || {};
  if (!S.activos) return "<li>Sin subtítulos (los desactivaste).</li>";
  if (cur.pasos.subtitulos === "hecho") return "<li>Con los subtítulos que generaste.</li>";
  if (cur.pasos.subtitulos === "desactualizado") return `<li class="warn">Cambiaste el corte: vuelve a generar los subtítulos o saldrán desfasados.</li>`;
  return `<li class="warn">Todavía no generaste subtítulos: saldrá sin ellos.</li>`;
}
async function makeSubs() {
  const activos = $("#subs-on").checked, gancho = $("#subs-hook").value.trim();
  try {
    await api(`/api/project/${cur.job}/run/subtitulos`, { activos, gancho });
    if (!activos) { toast("Este video saldrá sin subtítulos"); await refreshProject(); return showStep("subtitulos"); }
    $("#console").classList.remove("collapsed");
    toast("Generando subtítulos…");
    await refreshProject(); showStep("subtitulos");
  } catch (e) { toast(e.message, true); }
}
function need(P, title, dep, msg) {
  P.innerHTML = `<h2>${title}</h2><p class="lead">${msg}</p>
    <button class="btn primary" onclick="showStep('${dep}')">Ir a ${STEPS.find((s) => s.id === dep).n}</button>`;
}
async function transcribe() {
  const lang = $("#lang").value;
  if (cur.pasos.transcribir === "hecho" && !confirm("Transcribir de nuevo borra lo que editaste en el texto. ¿Seguir?")) return;
  if (lang !== cur.idioma) cur = await api(`/api/project/${cur.job}/state`, { idioma: lang });
  run("transcribir", "Transcribiendo…");
}

// ------------------------------------------------------------------ editor por texto
let ED = null;

async function renderEditor(P) {
  const d = await api(`/api/project/${cur.job}/words`);
  ED = { words: d.palabras, del: new Set(d.borradas), versions: d.versiones, undo: [], redo: [],
         sel: null, anchor: null, mode: "cut", raf: 0, lastNow: -1, dragging: false };
  P.innerHTML = `<div class="editor">
    <div class="editor-left">
      <div class="toolbar">
        <button class="btn" onclick="edCut()" title="Supr">✂ Quitar</button>
        <button class="btn" onclick="edRestore()" title="Retroceso">↺ Devolver</button>
        <span class="sep"></span>
        <button class="btn" onclick="edUndo()" title="Ctrl+Z">↶ Deshacer</button>
        <button class="btn" onclick="edRedo()" title="Ctrl+Y">↷ Rehacer</button>
        <span class="sep"></span>
        <button class="btn" onclick="edFillers()">🧹 Quitar muletillas y repeticiones</button>
        <button class="btn danger" onclick="edReset()">Restaurar todo</button>
        <div class="spacer"></div>
        <button class="btn primary" onclick="edApply()">Aplicar corte →</button>
      </div>
      <div id="tx" class="transcript"></div>
    </div>
    <div class="editor-right">
      <div class="player"><video id="vid" src="${cur.proxy || ""}" controls preload="auto"></video></div>
      <div class="modes"><button id="m-cut" class="on" onclick="edMode('cut')">Ver con mis cortes</button><button id="m-orig" onclick="edMode('orig')">Ver original</button></div>
      <div class="stats">
        <div class="stat"><b id="st-new">–</b><span>duración editada</span></div>
        <div class="stat"><b id="st-orig">–</b><span>duración original</span></div>
      </div>
      <div class="versions"><h4>Versiones guardadas</h4><div id="vers"></div>
        <button class="btn" style="margin-top:8px;width:100%" onclick="edSaveVersion()">💾 Guardar esta versión</button></div>
      <div class="kbd">
        <b>Cómo editar:</b> haz clic en una palabra para ir a ese momento. Arrastra para seleccionar varias.
        <kbd>Supr</kbd> quita la selección, <kbd>Retroceso</kbd> la devuelve, doble clic quita o devuelve una palabra.
        <kbd>Espacio</kbd> reproduce/pausa, <kbd>Ctrl+Z</kbd> deshace. Las palabras <u style="text-decoration:underline dotted var(--warn)">subrayadas</u> son dudosas: escúchalas.
        Las pausas <span class="gap">⏸ 1.2s</span> se cortan solas.
      </div>
    </div></div>`;
  edDraw();
  edVersions();
  const v = $("#vid");
  v.addEventListener("play", edLoop);
  v.addEventListener("seeked", () => edHighlight(v.currentTime));
  const tx = $("#tx");
  tx.addEventListener("mousedown", (e) => {
    const i = idxOf(e.target); if (i < 0) return;
    if (e.shiftKey && ED.anchor !== null) { edSelect(ED.anchor, i); }
    else { ED.anchor = i; edSelect(i, i); ED.dragging = true; }
    e.preventDefault();
  });
  tx.addEventListener("mouseover", (e) => {
    if (!ED.dragging) return; const i = idxOf(e.target); if (i >= 0) edSelect(ED.anchor, i);
  });
  tx.addEventListener("click", (e) => {
    const i = idxOf(e.target); if (i < 0 || !ED.sel || ED.sel[0] !== ED.sel[1]) return;
    seekTo(ED.words[i].s);
  });
  tx.addEventListener("dblclick", (e) => {
    const i = idxOf(e.target); if (i < 0) return;
    edSelect(i, i); ED.del.has(i) ? edRestore() : edCut();
  });
}
function idxOf(el) { return el.classList && el.classList.contains("w") ? +el.dataset.i : -1; }
document.addEventListener("mouseup", () => { if (ED) ED.dragging = false; });
document.addEventListener("keydown", (e) => {
  if (!ED || curStep !== "editar" || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === "delete") { edCut(); e.preventDefault(); }
  else if (k === "backspace") { edRestore(); e.preventDefault(); }
  else if (e.ctrlKey && k === "z") { e.shiftKey ? edRedo() : edUndo(); e.preventDefault(); }
  else if (e.ctrlKey && k === "y") { edRedo(); e.preventDefault(); }
  else if (k === " ") { const v = $("#vid"); v.paused ? v.play() : v.pause(); e.preventDefault(); }
});

function edDraw() {
  const W = ED.words, out = [];
  const many = W.length && W[W.length - 1].parte > 1;
  for (let i = 0; i < W.length; i++) {
    if (many && (i === 0 || W[i].parte !== W[i - 1].parte)) {
      const p = (cur.partes || [])[W[i].parte - 1];
      out.push(`<div class="part-sep">Parte ${W[i].parte}${p ? ` · ${esc(p.nombre)}` : ""}</div>`);
    } else if (i > 0) {
      const g = W[i].s - W[i - 1].e;
      if (g >= GAP) out.push(`<span class="gap" title="pausa: se corta sola">⏸ ${g.toFixed(1)}s</span>`);
      if (g >= 2.5) out.push("<br>");
    }
    const c = ["w"];
    if (ED.del.has(i)) c.push("del");
    if (W[i].p < 0.35) c.push("low");
    out.push(`<span class="${c.join(" ")}" data-i="${i}">${esc(W[i].w)}</span> `);
  }
  $("#tx").innerHTML = out.join("");
  ED.spans = [...document.querySelectorAll("#tx .w")];
  edPaint();
  edStats();
}
function edPaint() {
  const [a, b] = ED.sel || [-1, -2];
  ED.spans.forEach((s, i) => {
    s.classList.toggle("del", ED.del.has(i));
    s.classList.toggle("sel", i >= a && i <= b);
  });
}
function edSelect(a, b) { ED.sel = [Math.min(a, b), Math.max(a, b)]; edPaint(); }
function edChange(fn) {
  ED.undo.push([...ED.del]); ED.redo = [];
  if (ED.undo.length > 300) ED.undo.shift();
  fn();
  edPaint(); edStats(); edSave();
}
function edCut() {
  if (!ED.sel) return toast("Selecciona palabras primero (clic o arrastrar)");
  edChange(() => { for (let i = ED.sel[0]; i <= ED.sel[1]; i++) ED.del.add(i); });
}
function edRestore() {
  if (!ED.sel) return;
  edChange(() => { for (let i = ED.sel[0]; i <= ED.sel[1]; i++) ED.del.delete(i); });
}
function edUndo() {
  if (!ED.undo.length) return toast("Nada que deshacer");
  ED.redo.push([...ED.del]); ED.del = new Set(ED.undo.pop()); edPaint(); edStats(); edSave();
}
function edRedo() {
  if (!ED.redo.length) return toast("Nada que rehacer");
  ED.undo.push([...ED.del]); ED.del = new Set(ED.redo.pop()); edPaint(); edStats(); edSave();
}
function edReset() {
  if (!ED.del.size) return;
  if (!confirm("¿Devolver todas las palabras quitadas? (puedes deshacerlo con Ctrl+Z)")) return;
  edChange(() => ED.del.clear());
}
function norm(w) { return w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ]/g, ""); }
function edFillers() {
  const W = ED.words; let n = 0;
  edChange(() => {
    W.forEach((w, i) => {
      const a = norm(w.w);
      if (FILLERS.has(a) && !ED.del.has(i)) { ED.del.add(i); n++; return; }
      // repetición inmediata de 1 o 2 palabras ("yo yo", "de que, de que"): queda la última
      const nx = W[i + 1];
      if (nx && a && a === norm(nx.w) && nx.s - w.e < 1.0 && !ED.del.has(i)) { ED.del.add(i); n++; return; }
      const [b, c, d] = [W[i + 1], W[i + 2], W[i + 3]];
      if (b && c && d && a && a === norm(c.w) && norm(b.w) === norm(d.w) && c.s - b.e < 1.0 && !ED.del.has(i)) {
        ED.del.add(i); ED.del.add(i + 1); n += 2;
      }
    });
  });
  toast(n ? `Quité ${n} muletillas o repeticiones. Ctrl+Z para deshacer.` : "No encontré muletillas ni repeticiones");
}

// tramos que quedan, igual que la app arma el corte (mismos márgenes)
function keptRanges() {
  // el margen no cruza la mitad del hueco hacia la palabra vecina (igual que app.py build_cuts)
  const W = ED.words, out = []; let run = null;
  for (let i = 0; i < W.length; i++) {
    if (ED.del.has(i)) { if (run) { out.push(run); run = null; } continue; }
    if (run && (W[i].parte !== W[run.last].parte || W[i].s - W[run.last].e >= GAP)) { out.push(run); run = null; }
    if (!run) run = { first: i, last: i };
    run.last = i;
  }
  if (run) out.push(run);
  const same = (a, b) => W[a].parte === W[b].parte;  // el margen nunca se mete en otra parte
  return out.map((r) => {
    let s = W[r.first].s - 0.05, e = W[r.last].e + 0.08;
    if (r.first > 0 && same(r.first - 1, r.first)) s = Math.max(s, (W[r.first - 1].e + W[r.first].s) / 2);
    if (r.last + 1 < W.length && same(r.last, r.last + 1)) e = Math.min(e, (W[r.last].e + W[r.last + 1].s) / 2);
    return { s: Math.max(0, s), e };
  });
}
function edStats() {
  ED.ranges = keptRanges();
  const tot = ED.ranges.reduce((a, r) => a + (r.e - r.s), 0);
  const v = $("#vid");
  $("#st-new").textContent = fmt(tot);
  $("#st-orig").textContent = v && v.duration ? fmt(v.duration) : (ED.words.length ? fmt(ED.words.at(-1).e) : "–");
}
const edSave = debounce(async (version) => {
  try {
    const d = await api(`/api/project/${cur.job}/edits`, { borradas: [...ED.del], guardar_version: version || "" });
    ED.versions = d.versiones; edVersions();
    if (cur.pasos.cortar === "hecho") { cur.pasos.cortar = "desactualizado"; renderSteps(); }
  } catch (e) { toast(e.message, true); }
}, 500);
function edSaveVersion() {
  const name = prompt("Nombre de la versión:", `Versión ${ED.versions.length + 1}`);
  if (name) { edSave(name); toast("Versión guardada"); }
}
function edVersions() {
  $("#vers").innerHTML = ED.versions.length ? ED.versions.map((v, i) => `<div class="version">
      <span>${esc(v.nombre)} <span class="muted small">${v.fecha.slice(5, 16).replace("T", " ")}</span></span>
      <button class="btn ghost" onclick="edLoadVersion(${i})">Cargar</button></div>`).join("")
    : `<div class="muted small">Ninguna todavía. Guarda una antes de probar algo distinto.</div>`;
}
function edLoadVersion(i) {
  edChange(() => { ED.del = new Set(ED.versions[i].borradas); });
  toast(`Cargada "${ED.versions[i].nombre}" (Ctrl+Z para volver)`);
}
function edMode(m) {
  ED.mode = m;
  $("#m-cut").classList.toggle("on", m === "cut");
  $("#m-orig").classList.toggle("on", m === "orig");
}
function seekTo(t) { const v = $("#vid"); if (v) { v.currentTime = t; edHighlight(t); } }

// en "Ver con mis cortes" el reproductor salta lo quitado, sin renderizar nada
function edLoop() {
  cancelAnimationFrame(ED.raf);
  const v = $("#vid");
  const tick = () => {
    if (!ED || !v || v.paused) return;
    const t = v.currentTime;
    if (ED.mode === "cut" && ED.ranges.length) {
      const r = ED.ranges.find((r) => t < r.e);
      if (!r) { v.pause(); v.currentTime = ED.ranges[0].s; }
      else if (t < r.s - 0.02) v.currentTime = r.s;
    }
    edHighlight(t);
    ED.raf = requestAnimationFrame(tick);
  };
  ED.raf = requestAnimationFrame(tick);
}
function edHighlight(t) {
  const W = ED.words; let lo = 0, hi = W.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (W[m].s <= t) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k === ED.lastNow) return;
  if (ED.lastNow >= 0 && ED.spans[ED.lastNow]) ED.spans[ED.lastNow].classList.remove("now");
  ED.lastNow = k;
  if (k >= 0 && t <= W[k].e + 0.3) {
    const s = ED.spans[k]; s.classList.add("now");
    const box = $("#tx"), top = s.offsetTop - box.offsetTop;
    if (top < box.scrollTop + 40 || top > box.scrollTop + box.clientHeight - 60) box.scrollTop = top - box.clientHeight / 3;
  }
}
function stopEditor() {
  if (!ED) return;
  cancelAnimationFrame(ED.raf);
  const v = $("#vid"); if (v) v.pause();
  ED = null;
}
async function edApply() {
  await new Promise((r) => setTimeout(r, 600)); // que termine el guardado pendiente
  showStep("cortar");
  run("cortar", "Aplicando el corte…");
}

// ------------------------------------------------------------------ consola de tareas
async function pollTask() {
  try {
    const t = await api(`/api/task?since=${logSince}`);
    const key = `${t.job}/${t.step}/${t.running}`;
    const pre = $("#console-log");
    if (t.total < logSince) { logSince = 0; pre.textContent = ""; }
    if (t.lines.length) {
      pre.textContent += t.lines.join("\n") + "\n";
      if (pre.textContent.length > 200000) pre.textContent = pre.textContent.slice(-150000);
      pre.scrollTop = pre.scrollHeight;
      logSince = t.total;
    }
    const step = STEPS.find((s) => s.id === t.step);
    $("#console").classList.toggle("busy", t.running);
    $("#console-status").textContent = t.running
      ? `⏳ ${step ? step.n : t.step} — ${fmt(t.segundos)}`
      : t.step ? (t.exit === 0 ? `✓ ${step ? step.n : t.step}: listo` : `✗ ${step ? step.n : t.step}: falló (abre los detalles)`) : "Sin tareas";
    if (key !== lastTaskKey) {
      if (lastTaskKey && !t.running && t.step) {
        toast(t.exit === 0 ? `✓ ${step ? step.n : t.step}: listo` : `✗ ${step ? step.n : t.step} falló`, t.exit !== 0);
        $("#console").classList.toggle("collapsed", t.exit === 0);
        if (cur && cur.job === t.job) { await refreshProject(); if (curStep !== "editar" || t.step !== "editar") showStep(curStep); }
        else if (!cur) loadProjects();
      }
      lastTaskKey = key;
    }
  } catch (e) { /* servidor reiniciando */ }
  setTimeout(pollTask, 1000);
}

loadProjects();
pollTask();
