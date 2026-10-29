// Iconic Studio — apariencia (temas, colores, tipografías), carpetas y tiempos estimados.
// Se carga al final y envuelve funciones de app.js en vez de cambiarlas, para no pisar su lógica.

// ------------------------------------------------------------------ temas
const THEMES = {
  estudio:   { n: "Estudio",   bg: "#0e0f12", bg2: "#15161a", bg3: "#1d1f24", line: "#282a31", text: "#ececef", muted: "#8e919b", accent: "#7b6cf6", accentB: "#a78bfa" },
  noche:     { n: "Noche",     bg: "#0f1115", bg2: "#161920", bg3: "#1e222b", line: "#2a2f3a", text: "#e8eaf0", muted: "#8b92a3", accent: "#6c8cff", accentB: "#b06cff" },
  atardecer: { n: "Atardecer", bg: "#160f12", bg2: "#20161a", bg3: "#2b1d22", line: "#3b2a30", text: "#f6e9ea", muted: "#b49aa0", accent: "#ff7a59", accentB: "#ff4f8b" },
  oceano:    { n: "Océano",    bg: "#0a1216", bg2: "#0f1b21", bg3: "#15252d", line: "#21363f", text: "#e4f2f5", muted: "#86a4ad", accent: "#22c3c3", accentB: "#3b82f6" },
  rosa:      { n: "Rosa",      bg: "#150d14", bg2: "#1f141d", bg3: "#2a1b27", line: "#3a2735", text: "#fbe9f5", muted: "#b896ad", accent: "#ff5fae", accentB: "#c084fc" },
  bosque:    { n: "Bosque",    bg: "#0c120e", bg2: "#121a15", bg3: "#19241d", line: "#25352a", text: "#e7f3ea", muted: "#8ba493", accent: "#3ecf8e", accentB: "#a3e635" },
  claro:     { n: "Claro",     bg: "#f5f6fa", bg2: "#ffffff", bg3: "#eef0f6", line: "#dfe3ec", text: "#1b1f2a", muted: "#6b7385", accent: "#5b6cff", accentB: "#c055ff" },
  calido:    { n: "Cálido",    bg: "#f7f5f2", bg2: "#ffffff", bg3: "#f0ece6", line: "#e6e1d9", text: "#1f1d1a", muted: "#746d64", accent: "#e0603f", accentB: "#f59e6b" },
  carbon:    { n: "Carbón",    bg: "#141210", bg2: "#1a1715", bg3: "#231f1c", line: "#2f2a26", text: "#efe9e1", muted: "#9a8f84", accent: "#d97757", accentB: "#e8a87c" },
};
const LIGHT = new Set(["claro", "calido"]);
const FONTS = {
  profesional: { n: "Profesional", d: "Inter", title: '"Inter"', ui: '"Inter"' },
  moderna: { n: "Moderna", d: "Poppins + Inter", title: '"Poppins"', ui: '"Inter"' },
  elegante: { n: "Elegante", d: "Serif para títulos", title: '"Fraunces", "Georgia"', ui: '"Inter"' },
  clasica: { n: "Clásica", d: "La de Windows", title: '"Segoe UI"', ui: '"Segoe UI"' },
  divertida: { n: "Divertida", d: "Títulos a mano", title: '"Caveat"', ui: '"Inter"' },
};
const CORNERS = { rectas: { n: "Rectas", r: [3, 4, 6] }, normales: { n: "Normales", r: [6, 8, 12] }, redondas: { n: "Redondas", r: [10, 14, 20] } };
const DEFAULT_LOOK = { v: 2, theme: "estudio", accent: null, accentB: null, font: "profesional", corners: "normales", scale: 14, motion: true };
const SAVED_LOOK = JSON.parse(store("apariencia") || "{}");
// la apariencia guardada antes del diseño de Iconic Studio pasa al tema nuevo una vez; tamaño y movimiento se quedan
let LOOK = SAVED_LOOK.v === 2 ? { ...DEFAULT_LOOK, ...SAVED_LOOK } : { ...DEFAULT_LOOK, scale: SAVED_LOOK.scale ?? 14, motion: SAVED_LOOK.motion ?? true };

function applyLook() {
  const t = THEMES[LOOK.theme] || THEMES.estudio, f = FONTS[LOOK.font] || FONTS.profesional, r = document.documentElement.style;
  r.setProperty("--bg", t.bg); r.setProperty("--bg2", t.bg2); r.setProperty("--bg3", t.bg3);
  r.setProperty("--line", t.line); r.setProperty("--text", t.text); r.setProperty("--muted", t.muted);
  r.setProperty("--accent", LOOK.accent || t.accent); r.setProperty("--accent-b", LOOK.accentB || t.accentB);
  r.setProperty("--font-title", `${f.title}, "Segoe UI", sans-serif`); r.setProperty("--font-ui", `${f.ui}, "Segoe UI", sans-serif`);
  r.setProperty("--ui-scale", `${LOOK.scale}px`);
  const [rs, rm, rl] = (CORNERS[LOOK.corners] || CORNERS.normales).r;
  r.setProperty("--r-sm", `${rs}px`); r.setProperty("--r", `${rm}px`); r.setProperty("--r-lg", `${rl}px`);
  document.documentElement.classList.toggle("no-motion", !LOOK.motion);
  document.documentElement.style.colorScheme = LIGHT.has(LOOK.theme) ? "light" : "dark";
  document.documentElement.classList.toggle("light", LIGHT.has(LOOK.theme));
  store("apariencia", JSON.stringify(LOOK));
}
applyLook();

function openAppearance() { renderAppearance(); $("#appearance").classList.add("open"); $("#scrim").classList.add("on"); }
function closeAppearance() { $("#appearance").classList.remove("open"); $("#scrim").classList.remove("on"); }
function setLook(k, v) { LOOK[k] = v; if (k === "theme") { LOOK.accent = null; LOOK.accentB = null; } applyLook(); renderAppearance(); }
function renderAppearance() {
  const t = THEMES[LOOK.theme];
  $("#appearance").innerHTML = `
    <div class="row"><h2>Apariencia</h2><div class="spacer"></div><button class="btn ghost icon" onclick="closeAppearance()" title="Cerrar">${ico("x")}</button></div>
    <p class="muted small">Cambia cómo se ve la app. Se guarda sola.</p>
    <h4>Tema</h4>
    <div class="themes">${Object.entries(THEMES).map(([k, v]) => `<div class="theme ${LOOK.theme === k ? "on" : ""}" onclick="setLook('theme','${k}')">
      <div class="sw" style="background:${v.bg};border-color:${v.line}"><i style="background:${v.bg2};border-color:${v.line}"></i><b style="background:${v.accent}"></b></div>${v.n}</div>`).join("")}</div>
    <h4>Colores</h4>
    <div class="colorrow"><span>Color principal</span><input type="color" value="${LOOK.accent || t.accent}" oninput="LOOK.accent=this.value;applyLook()"></div>
    <div class="colorrow"><span>Segundo color</span><input type="color" value="${LOOK.accentB || t.accentB}" oninput="LOOK.accentB=this.value;applyLook()"></div>
    <h4>Tipografía</h4>
    <div class="fontopts">${Object.entries(FONTS).map(([k, v]) => `<div class="fontopt ${LOOK.font === k ? "on" : ""}" onclick="setLook('font','${k}')">
      <b style="font-family:${v.title}">${v.n}</b><span class="muted small" style="font-family:${v.ui}">${v.d} · Así se ve el texto</span></div>`).join("")}</div>
    <h4>Esquinas</h4>
    <div class="corners">${Object.entries(CORNERS).map(([k, v]) => `<button class="corner ${(LOOK.corners || "normales") === k ? "on" : ""}" onclick="setLook('corners','${k}')">
      <span style="border-radius:${v.r[2]}px ${v.r[2]}px 0 0"></span>${v.n}</button>`).join("")}</div>
    <h4>Tamaño del texto</h4>
    <input class="range" type="range" min="12" max="18" step="1" value="${LOOK.scale}" oninput="LOOK.scale=+this.value;applyLook()">
    <div class="row muted small"><span>Más chico</span><div class="spacer"></div><span>Más grande</span></div>
    <h4>Movimiento</h4>
    <label class="check"><input type="checkbox" ${LOOK.motion ? "checked" : ""} onchange="setLook('motion',this.checked)"> Animaciones</label>
    <div class="row" style="margin-top:22px"><button class="btn" onclick="LOOK={...DEFAULT_LOOK};applyLook();renderAppearance()">Volver a lo original</button></div>`;
}

// ------------------------------------------------------------------ carpetas
let GROUPS = [];
let groupFilter = store("grupo-filtro") || "";
const GROUP_COLORS = ["#ff5fae", "#ff7a59", "#f5b84a", "#3ecf8e", "#22c3c3", "#6c8cff", "#b06cff", "#8b92a3"];
const GROUP_EMOJIS = ["📁", "💄", "✨", "🎬", "💼", "🛍️", "🎓", "❤️", "🔥", "🌸", "📣", "🎁"];
const gById = (id) => GROUPS.find((g) => g.id === id);

async function loadGroups() { try { GROUPS = (await api("/api/grupos")).grupos; } catch (e) { GROUPS = []; } }
async function saveGroups() { GROUPS = (await api("/api/grupos", { grupos: GROUPS })).grupos; }

function renderGroupBar() {
  let bar = $("#groupbar");
  if (!bar) { bar = document.createElement("div"); bar.id = "groupbar"; bar.className = "groupbar"; $("#projects").before(bar); }
  const count = (id) => projects.filter((p) => (id === "" ? true : id === "-" ? !p.grupo : p.grupo === id)).length;
  bar.innerHTML = `<button class="gchip ${groupFilter === "" ? "on" : ""}" onclick="setGroupFilter('')">Todos <span class="n">${count("")}</span></button>`
    + GROUPS.map((g) => `<button class="gchip ${groupFilter === g.id ? "on" : ""}" style="--gc:${g.color}" onclick="setGroupFilter('${g.id}')">
        ${g.emoji} ${esc(g.nombre)} <span class="n">${count(g.id)}</span><span class="edit" title="Editar carpeta" onclick="event.stopPropagation();openGroup('${g.id}')">✎</span></button>`).join("")
    + (GROUPS.length && count("-") ? `<button class="gchip ${groupFilter === "-" ? "on" : ""}" onclick="setGroupFilter('-')">Sin carpeta <span class="n">${count("-")}</span></button>` : "")
    + `<button class="gchip add" id="btn-newgroup" onclick="openGroup()">＋ Nueva carpeta</button>`;
}
function setGroupFilter(id) { groupFilter = id; store("grupo-filtro", id); renderProjects(); }

// tarjetas: insignia de carpeta, duración, tiempo que falta; y el filtro por carpeta
const _renderProjects = renderProjects;
renderProjects = function () {
  _renderProjects();
  renderGroupBar();
  const byJob = Object.fromEntries(projects.map((p) => [p.job, p]));
  document.querySelectorAll("#projects .card").forEach((card) => {
    const job = (card.getAttribute("onclick") || "").match(/openProject\('([^']+)'\)/)?.[1];
    const p = byJob[job]; if (!p) return;
    const g = gById(p.grupo);
    const show = groupFilter === "" || (groupFilter === "-" ? !p.grupo : p.grupo === groupFilter);
    card.style.display = show ? "" : "none";
    const thumb = card.querySelector(".thumb");
    if (g) {
      card.insertAdjacentHTML("afterbegin", `<div class="group-stripe" style="background:${g.color}"></div>`);
      thumb.insertAdjacentHTML("beforeend", `<span class="group-badge" style="background:${g.color}cc" title="Cambiar carpeta"
        onclick="event.stopPropagation();quickGroup('${job}', this)">${g.emoji} ${esc(g.nombre)}</span>`);
    } else if (GROUPS.length) {
      thumb.insertAdjacentHTML("beforeend", `<span class="group-badge" style="background:#0008" title="Meterlo en una carpeta"
        onclick="event.stopPropagation();quickGroup('${job}', this)">＋ carpeta</span>`);
    }
    if (p.duracion) thumb.insertAdjacentHTML("beforeend", `<span class="dur-badge">${fmt(p.duracion)}</span>`);
    const left = p.estimado?.restante;
    card.querySelector(".info").insertAdjacentHTML("beforeend", `<div class="card-meta2">
      ${p.final && p.pasos.exportar === "hecho" ? `<span class="tagpill">✅ listo</span>` : left ? `<span class="tagpill">⏱ faltan ~${human(left)} a mano</span>` : ""}
      ${p.estimado?.auto && !(p.final && p.pasos.exportar === "hecho") ? `<span class="tagpill">⚡ Claude: ${human(p.estimado.auto[0])}–${human(p.estimado.auto[1])}</span>` : ""}</div>`);
  });
};

// elegir carpeta desde la tarjeta: un menú simple con los carpetas
function quickGroup(job, el) {
  document.querySelector(".qg-menu")?.remove();
  const r = el.getBoundingClientRect();
  const m = document.createElement("div");
  m.className = "qg-menu box";
  m.style.cssText = `position:fixed;left:${r.left}px;top:${r.bottom + 6}px;z-index:45;padding:6px;min-width:180px;margin:0`;
  m.innerHTML = GROUPS.map((g) => `<div class="step" onclick="assignGroup('${job}','${g.id}')"><span>${g.emoji}</span><span>${esc(g.nombre)}</span></div>`).join("")
    + `<div class="step" onclick="assignGroup('${job}','')"><span>∅</span><span>Sin carpeta</span></div>`
    + `<div class="step" onclick="this.parentNode.remove();openGroup(null,'${job}')"><span>＋</span><span>Carpeta nueva…</span></div>`;
  document.body.appendChild(m);
  setTimeout(() => addEventListener("click", function close(e) { if (!m.contains(e.target)) { m.remove(); removeEventListener("click", close); } }), 0);
}
async function assignGroup(job, gid) {
  document.querySelector(".qg-menu")?.remove();
  try {
    await api(`/api/project/${job}/state`, { grupo: gid });
    const p = projects.find((x) => x.job === job); if (p) p.grupo = gid;
    if (cur && cur.job === job) { cur.grupo = gid; decorateProjectHeader(); }
    if (curView === "projects") renderProjects();
    toast(gid ? `Guardado en ${gById(gid)?.emoji} ${gById(gid)?.nombre}` : "Quitado de la carpeta");
  } catch (e) { toast(e.message, true); }
}

// crear / editar carpeta
let editingGroup = null, groupForJob = null;
function openGroup(id, forJob) {
  editingGroup = id ? { ...gById(id) } : { id: "", nombre: "", color: GROUP_COLORS[GROUPS.length % GROUP_COLORS.length], emoji: GROUP_EMOJIS[(GROUPS.length + 1) % GROUP_EMOJIS.length] };
  groupForJob = forJob || null;
  renderGroupModal();
  $("#modal-group").classList.remove("hidden");
  setTimeout(() => $("#g-name").focus(), 50);
}
function renderGroupModal() {
  const g = editingGroup;
  $("#modal-group .modal-card").innerHTML = `
    <h2>${g.id ? "Editar carpeta" : "＋ Nueva carpeta"}</h2>
    <p class="muted">Una carpeta junta videos de lo mismo: una marca, una campaña, un cliente… Ej: <b>Sola</b>.</p>
    <label>Nombre</label>
    <input id="g-name" value="${esc(g.nombre)}" placeholder="Ej: Sola" oninput="editingGroup.nombre=this.value;$('#g-prev').textContent=editingGroup.emoji+' '+(this.value||'Mi carpeta')"
      onkeydown="if(event.key==='Enter')saveGroup()">
    <label>Ícono</label>
    <div class="emoji-row">${GROUP_EMOJIS.map((e) => `<button class="${g.emoji === e ? "on" : ""}" onclick="editingGroup.emoji='${e}';renderGroupModal()">${e}</button>`).join("")}</div>
    <label>Color</label>
    <div class="swatches">${GROUP_COLORS.map((c) => `<button class="${g.color === c ? "on" : ""}" style="background:${c}" onclick="editingGroup.color='${c}';renderGroupModal()"></button>`).join("")}
      <input type="color" value="${g.color}" oninput="editingGroup.color=this.value;$('#g-prev').style.background=this.value"></div>
    <label>Así se verá</label>
    <div><span id="g-prev" class="gchip on" style="--gc:${g.color};background:${g.color}">${g.emoji} ${esc(g.nombre || "Mi carpeta")}</span></div>
    <div class="row end" style="margin-top:14px">
      ${g.id ? `<button class="btn ghost danger" onclick="deleteGroup()">Borrar carpeta</button>` : ""}
      <div class="spacer"></div>
      <button class="btn ghost" onclick="$('#modal-group').classList.add('hidden')">Cancelar</button>
      <button class="btn primary" onclick="saveGroup()">Guardar</button></div>`;
}
async function saveGroup() {
  const g = editingGroup;
  g.nombre = ($("#g-name").value || "").trim();
  if (!g.nombre) return toast("Ponle un nombre a la carpeta");
  if (!g.id) {
    let base = g.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "grupo", id = base, n = 2;
    while (gById(id)) id = `${base}-${n++}`;
    g.id = id; GROUPS.push(g);
  } else GROUPS = GROUPS.map((x) => (x.id === g.id ? g : x));
  try { await saveGroups(); } catch (e) { return toast(e.message, true); }
  $("#modal-group").classList.add("hidden");
  toast(`Carpeta ${g.emoji} ${g.nombre} guardada`);
  if (groupForJob) return assignGroup(groupForJob, g.id);
  if (curView === "projects") renderProjects();
  refreshGroupSelects();
}
async function deleteGroup() {
  if (!confirm(`¿Borrar la carpeta «${editingGroup.nombre}»? Los videos no se borran, solo quedan sin carpeta.`)) return;
  GROUPS = GROUPS.filter((g) => g.id !== editingGroup.id);
  try { await saveGroups(); } catch (e) { return toast(e.message, true); }
  for (const p of projects.filter((p) => p.grupo === editingGroup.id)) await api(`/api/project/${p.job}/state`, { grupo: "" }).catch(() => {});
  if (groupFilter === editingGroup.id) groupFilter = "";
  $("#modal-group").classList.add("hidden");
  loadProjects();
}
const groupOptions = (sel) => `<option value="">Sin carpeta</option>` + GROUPS.map((g) => `<option value="${g.id}" ${sel === g.id ? "selected" : ""}>${g.emoji} ${esc(g.nombre)}</option>`).join("")
  + `<option value="__nuevo">＋ Carpeta nueva…</option>`;
function refreshGroupSelects() {
  const ns = $("#new-group"); if (ns) ns.innerHTML = groupOptions(ns.value);
  decorateProjectHeader();
}

// carpeta al crear un video: un selector más en el formulario, y se manda junto con el resto
function decorateNewModal() {
  if ($("#new-group")) return;
  $("#new-lang").insertAdjacentHTML("afterend", `<label>4. Carpeta <span class="muted">(opcional)</span></label>
    <select id="new-group" onchange="if(this.value==='__nuevo'){this.value='';openGroup()}">${groupOptions(groupFilter && groupFilter !== "-" ? groupFilter : "")}</select>`);
}
const _api = api;
api = function (path, body) {
  if (path === "/api/projects" && body && $("#new-group")) body = { ...body, grupo: $("#new-group").value === "__nuevo" ? "" : $("#new-group").value };
  return _api(path, body);
};
const _openNew = openNew;
openNew = function () { _openNew(); decorateNewModal(); const s = $("#new-group"); if (s) s.innerHTML = groupOptions(groupFilter && groupFilter !== "-" ? groupFilter : ""); };

// en el video abierto: selector de carpeta junto al título
function decorateProjectHeader() {
  if (!cur) return;
  let s = $("#p-group");
  if (!s) {
    $("#p-title").insertAdjacentHTML("afterend", `<select id="p-group" class="group-select" title="Grupo de este video"
      onchange="if(this.value==='__nuevo'){this.value=cur.grupo||'';openGroup(null,cur.job)}else assignGroup(cur.job,this.value)"></select>`);
    s = $("#p-group");
  }
  s.innerHTML = groupOptions(cur.grupo || "");
  const g = gById(cur.grupo);
  s.style.borderColor = g ? g.color : "";
}

// ------------------------------------------------------------------ tiempos
function human(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return `${sec} s`;
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

// inicio del video: tira con duración y tiempos estimados
const _renderHome = renderHome;
renderHome = function (P) {
  _renderHome(P);
  decorateProjectHeader();
  const e = cur.estimado || {}, done = cur.final && cur.pasos.exportar === "hecho";
  const head = P.querySelector(".home-head");
  if (!head) return;
  const autoNote = P.querySelector(".path-card.auto .muted.small");
  if (autoNote && e.auto) autoNote.textContent = `⏱ Para este video: unos ${human(e.auto[0])}–${human(e.auto[1])}. Puedes hacer otra cosa mientras.`;
  head.insertAdjacentHTML("afterend", `<div class="eta-strip">
    <div class="eta"><span class="ico">🎞</span><div><b>${cur.duracion ? fmt(cur.duracion) : "–"}</b><span>duración del video${(cur.partes || []).length > 1 ? ` · ${cur.partes.length} partes` : ""}</span></div></div>
    ${!done && e.auto ? `<div class="eta"><span class="ico">⚡</span><div><b>${human(e.auto[0])}–${human(e.auto[1])}</b><span>si Claude lo edita todo</span></div></div>` : ""}
    ${!done && e.restante ? `<div class="eta"><span class="ico">✂️</span><div><b>~${human(e.restante)}</b><span>de máquina para los pasos que faltan<br>(más lo que tardes tú en editar el texto)</span></div></div>` : ""}
    ${done ? `<div class="eta"><span class="ico">✅</span><div><b>Terminado</b><span>listo en Descargas</span></div></div>` : ""}
  </div>`);
};

// cada paso: cuánto suele tardar, junto al botón
const _showStep = showStep;
showStep = function (id) {
  _showStep(id);
  decorateProjectHeader();
  const t = cur?.estimado?.pasos?.[id];
  const big = $("#panel .btn.primary.big");
  if (t && big && id !== "editar" && cur.pasos[id] !== "trabajando") big.insertAdjacentHTML("afterend", `<span class="tagpill">⏱ suele tardar ~${human(t)}</span>`);
};

// píldora flotante: qué está trabajando, cuánto lleva y cuánto falta (estimado)
document.body.insertAdjacentHTML("beforeend", `<div id="taskpill" class="hidden"><div class="tp-top"><span class="tp-step"></span><span class="tp-time"></span></div>
  <div class="tp-sub"></div><div class="tp-bar"><div style="width:0%"></div></div></div>`);
setInterval(async () => {
  try {
    const t = await _api("/api/task?since=999999");
    const pill = $("#taskpill");
    if (!t.running) { pill.classList.add("hidden"); return; }
    const step = STEPS.find((s) => s.id === t.step), proj = projects.find((p) => p.job === t.job);
    const est = t.estimado || 0, pct = est ? Math.min(97, (100 * t.segundos) / est) : 50;
    pill.classList.remove("hidden");
    pill.querySelector(".tp-step").textContent = `⏳ ${step ? step.n : t.step}`;
    pill.querySelector(".tp-time").textContent = fmt(t.segundos);
    pill.querySelector(".tp-sub").textContent = (proj ? proj.titulo + " · " : "") +
      (!est ? "trabajando…" : t.segundos < est ? `faltan ~${human(est - t.segundos)}` : "casi listo… (tarda un poco más de lo normal)");
    pill.querySelector(".tp-bar > div").style.width = `${pct}%`;
  } catch (e) { /* servidor reiniciando */ }
}, 1000);

// ------------------------------------------------------------------ montaje
document.body.insertAdjacentHTML("beforeend", `<div id="scrim" onclick="closeAppearance()"></div><aside id="appearance"></aside>
  <div id="modal-group" class="modal hidden"><div class="modal-card"></div></div>`);
document.querySelectorAll("#view-projects .topbar, #view-project .topbar").forEach((bar) => {
  const help = bar.querySelector('[onclick^="showHelp"]');
  const b = document.createElement("button");
  b.className = "btn ghost icon"; b.title = "Cambiar colores y letras"; b.innerHTML = ico("brush"); b.onclick = openAppearance;
  help ? help.before(b) : bar.appendChild(b);
});
loadGroups().then(() => { if (curView === "projects" && projects.length) renderProjects(); });
