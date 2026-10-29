// Iconic Studio — lotes eficientes: un Claude nuevo por video, en fila (gasta menos y no se pone lento), modo
// ⚡ Rápido / ✨ Completo, modelo rápido o máximo, el avance de Claude en cada video (su RUN.md) y el estilo
// aprendido de cada carpeta.

const I = (n) => (typeof ico === "function" ? ico(n) : "");
const LOTE_OPT = { modo: store("lote-modo") || "completo", modelo: store("lote-modelo") || "sonnet" };

// ------------------------------------------------------------------ ventana de «editar juntos»: modo y modelo
const _openLoteQ = openLote;
openLote = async function () {
  await _openLoteQ();
  const card = $("#modal-lote .modal-card");
  if (!card) return;
  const n = LOTE.sel.size;
  const intro = card.querySelector("h2 + p");
  if (intro) intro.innerHTML = `Claude los edita <b>uno por uno, cada uno en una ventana nueva</b>: así cada video empieza liviano,
    gasta menos y no se pone lento. Antes, la app transcribe gratis los que falten. <b>Cuando estén los ${n}, aparecen juntos en
    tu carpeta Descargas</b> y te llega un aviso.`;
  const opt = (k, v, t, d) => `<label class="opt ${LOTE_OPT[k] === v ? "on" : ""}"><input type="radio" name="lote-${k}" value="${v}"
      ${LOTE_OPT[k] === v ? "checked" : ""} onchange="LOTE_OPT.${k}='${v}';store('lote-${k}','${v}');this.closest('.opts').querySelectorAll('.opt').forEach(o=>o.classList.toggle('on',o.contains(this)))">
      <b>${t}</b><span class="muted small">${d}</span></label>`;
  card.querySelector(".row.end")?.insertAdjacentHTML("beforebegin", `<div class="lote-opts">
    <label>Calidad</label><div class="opts">
      ${opt("modo", "completo", "✨ Completo", "Con gráficos, efectos de sonido y revisión. Como un video normal.")}
      ${opt("modo", "rapido", "⚡ Rápido", "Corte, audio, subtítulos y exportar. Gasta mucho menos: ideal para muchos videos.")}</div>
    <label>Claude</label><div class="opts">
      ${opt("modelo", "sonnet", "Rápido (Sonnet)", "Más rápido y gasta menos de tu plan. Recomendado para lotes.")}
      ${opt("modelo", "opus", "Máximo (Opus)", "El más capaz, para videos especiales. Gasta más.")}</div></div>`);
};
const _apiQ = api;
api = function (path, body) {  // el modo y el modelo viajan con el pedido del lote
  if (path === "/api/lote" && body) body = { ...body, modo: LOTE_OPT.modo, modelo: LOTE_OPT.modelo };
  const r = _apiQ(path, body);
  if (path === "/api/lote" && body) r.then(() => setTimeout(loadQueue, 500)).catch(() => {});
  return r;
};

// ------------------------------------------------------------------ panel de la cola en «Mis videos»
let QUEUE = null;
const QSTATE = { listo: "✓ listo", editando: "Claude editando…", transcribiendo: "transcribiendo (gratis)…", "en fila": "en fila" };
async function loadQueue() {
  try { QUEUE = await api("/api/cola"); } catch (e) { return; }
  renderQueue();
}
function bar(av) {
  if (!av || !av.total) return "";
  return `<div class="qbar" title="${esc(av.siguiente || "")}"><div style="width:${Math.round((100 * av.hechos) / av.total)}%"></div></div>`;
}
function renderQueue() {
  let b = $("#queue-card");
  if (!b) { b = document.createElement("div"); b.id = "queue-card"; $("#view-projects .projects-wrap").prepend(b); }
  const q = QUEUE;
  if (!q || !q.fase || !q.videos) { b.innerHTML = ""; return; }
  const n = q.videos.length, done = q.videos.filter((v) => v.estado === "listo").length;
  const head = { transcribiendo: `${I("film")} Preparando el lote: la app transcribe los videos (gratis)…`,
    editando: `${I("sparkles")} Claude está editando el video ${q.actual + 1} de ${n}`,
    terminado: `✅ ¡Listos los ${n} videos! Ya están en tu carpeta Descargas.`,
    detenido: `Lote detenido. ${done ? `Los ${done} terminados están en Descargas.` : ""}` }[q.fase] || "";
  b.innerHTML = `<div class="queue ${q.fase}"><div class="row"><div class="grow"><b>${head}</b>
      <div class="muted small">${q.modo === "rapido" ? "⚡ Rápido" : "✨ Completo"} · Claude ${q.modelo === "opus" ? "máximo" : q.modelo === "sonnet" ? "rápido" : ""}
        ${q.fase === "editando" ? "· cada video se abre en su ventana negra; cuando uno termina, la app abre el siguiente sola" : ""}</div></div>
      ${q.fase === "editando" ? `<button class="btn ghost" onclick="queueAction('siguiente')" title="Si Claude ya terminó este video pero la app no lo notó">Pasar al siguiente</button>
        <button class="btn ghost danger" onclick="queueAction('detener')">Detener</button>` : ""}
      ${q.fase === "transcribiendo" ? `<button class="btn ghost danger" onclick="queueAction('detener')">Detener</button>` : ""}
      ${q.fase === "terminado" || q.fase === "detenido" ? `<button class="btn primary" onclick="queueAction('cerrar')">Listo</button>` : ""}</div>
    <div class="qlist">${q.videos.map((v) => `<div class="qitem ${v.estado.replace(" ", "-")}" onclick="openProject('${v.job}')">
      <span class="grow ellipsis">${esc(v.titulo)}</span><span class="muted small">${QSTATE[v.estado] || v.estado}</span>
      ${v.estado === "editando" && v.avance?.total ? `<span class="muted small">${v.avance.hechos}/${v.avance.total}</span>` : ""}
      ${bar(v.avance)}</div>`).join("")}</div></div>`;
}
async function queueAction(a) {
  if (a === "detener" && !confirm("¿Detener el lote? Lo que ya esté terminado pasa a Descargas. La ventana de Claude que esté trabajando ciérrala tú.")) return;
  try { QUEUE = await api("/api/cola", { accion: a }); renderQueue(); } catch (e) { toast(e.message, true); }
}
setInterval(() => { if (curView === "projects" && !document.hidden) loadQueue(); }, 5000);

// ------------------------------------------------------------------ el avance de Claude en el inicio de cada video
const STEP_ICON = { hecho: "✓", saltado: "–", trabajando: "…", esperando: "⏸", pendiente: "" };
async function fillProgress() {
  const box = $("#card-avance");
  if (!box || !cur) return;
  let av;
  try { av = await api(`/api/project/${cur.job}/avance`); } catch (e) { return; }
  if (!av || !av.total) { box.remove(); return; }
  const all = av.hechos >= av.total;
  const now = av.pasos.find((p) => p.estado === "trabajando") || av.pasos.find((p) => p.estado === "pendiente");
  const yours = !now && av.pasos.some((p) => p.estado === "esperando");  // solo falta que lo revises tú
  box.innerHTML = `<div class="row"><h3 class="grow">${I("sparkles")} Avance de Claude</h3>
      <span class="muted small">${all ? "terminó todos los pasos" : yours ? "<b>Claude terminó: falta que lo revises tú</b>" : now ? `va en: <b>${esc(now.paso)}</b>` : ""} · ${av.hechos} de ${av.total}</span></div>
    ${bar(av)}
    <div class="steps-mini">${av.pasos.map((p) => `<span class="sm ${p.estado}" title="${esc(p.paso)}: ${p.estado}">${STEP_ICON[p.estado] || p.n} ${esc(p.paso)}</span>`).join("")}</div>
`;
}
const _renderHomeQ = renderHome;
renderHome = function (P) {
  _renderHomeQ(P);
  const head = P.querySelector(".eta-strip") || P.querySelector(".home-head");
  head?.insertAdjacentHTML("afterend", `<div class="box wide" id="card-avance"></div>`);
  fillProgress();
};
setInterval(() => { if (cur && curView === "project" && curStep === "inicio" && !document.hidden) fillProgress(); }, 8000);

// ------------------------------------------------------------------ estilo aprendido de la carpeta
const _renderFoldersQ = renderFolders;
renderFolders = function () {
  _renderFoldersQ();
  const g = gById(groupFilter), head = $("#folders .folder-head");
  if (!g || !head) return;
  const at = head.querySelector(`[onclick^="openAssets('grupo'"]`);
  at?.insertAdjacentHTML("afterend", `<button class="btn" id="btn-estilo" onclick="openStyle('${g.id}')" title="Que Claude se aprenda cómo se editan los videos de esta carpeta">🧠 Estilo</button>`);
  api(`/api/grupo/${g.id}/estilo`).then((s) => {
    const b = $("#btn-estilo");
    if (b) b.innerHTML = s.existe ? "🧠 Estilo aprendido ✓" : "🧠 Aprender el estilo";
  }).catch(() => {});
};
async function openStyle(gid) {
  const g = gById(gid);
  let s = {};
  try { s = await api(`/api/grupo/${gid}/estilo`); } catch (e) { /* sin red */ }
  $("#modal-estilo .modal-card").innerHTML = `
    <h2>🧠 El estilo de ${g.emoji} ${esc(g.nombre)}</h2>
    <p>Claude estudia los videos <b>ya terminados</b> de esta carpeta (lo que hizo, lo que te gustó y lo que pediste cambiar) y escribe
      una <b>receta</b> de cómo se editan los videos de esta campaña, con las piezas listas para reutilizar.</p>
    <p>Desde ahí, cada video nuevo de la carpeta <b>sigue esa receta</b> en vez de decidir todo desde cero: sale igual a lo que ya
      aprobaste, <b>más rápido y gastando menos</b>.</p>
    ${s.existe ? `<p class="ok-box">✓ Esta carpeta ya tiene su estilo aprendido (${esc((s.fecha || "").replace("T", " "))}). Puedes actualizarlo cuando
      apruebes más videos: también se actualiza solo cuando le mandas comentarios a Claude.</p>` : ""}
    ${!s.terminados ? `<p class="warn small">Todavía no hay videos terminados en esta carpeta. Edita uno o dos, déjalos a tu gusto, y luego vuelve aquí.</p>`
      : `<p class="muted small">Va a mirar ${s.terminados} video${s.terminados === 1 ? "" : "s"} terminado${s.terminados === 1 ? "" : "s"}. Se abre la ventana de Claude (unos minutos).</p>`}
    <div class="row end"><button class="btn ghost" onclick="$('#modal-estilo').classList.add('hidden')">Cerrar</button>
      ${s.terminados ? `<button class="btn claude big" onclick="learnStyle('${gid}')">${s.existe ? "Actualizar el estilo" : "🧠 Aprender el estilo"}</button>` : ""}</div>`;
  $("#modal-estilo").classList.remove("hidden");
}
async function learnStyle(gid) {
  try { await api(`/api/grupo/${gid}/aprender`, {}); $("#modal-estilo").classList.add("hidden"); toast("Claude está aprendiendo el estilo en su ventana ✦"); }
  catch (e) { toast(e.message, true); }
}

document.body.insertAdjacentHTML("beforeend", `<div id="modal-estilo" class="modal hidden"><div class="modal-card"></div></div>`);
loadQueue();
