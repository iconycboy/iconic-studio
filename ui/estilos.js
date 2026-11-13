// Iconic Studio — estilos del título y los subtítulos: la app los ROTA para que los videos no se vean todos iguales
// (uno distinto a los últimos de la carpeta), se puede fijar uno, y «Nativo» es texto simple sin gráficos. También el
// aviso legal de la carpeta (chico y solo al final) y lo que la app revisó del video terminado (volumen y título).

let ESTILOS = [];
api("/api/estilos").then((d) => { ESTILOS = d.estilos || []; }).catch(() => {});
LOTE_OPT.estilo = store("lote-estilo") || "rotar";

const estiloOpts = (sel, auto) => `<option value="" ${sel ? "" : "selected"}>${auto}</option>`
  + ESTILOS.map((e) => `<option value="${e.id}" ${sel === e.id ? "selected" : ""}>${esc(e.nombre)}${e.sin_graficos ? " · sin gráficos" : ""}</option>`).join("");
function estiloDesc(id) {
  const e = ESTILOS.find((x) => x.id === id);
  return e ? esc(e.desc) : "La app elige uno distinto a los últimos videos de la carpeta.";
}
async function setEstilo(id) {
  try {
    cur.estilo = await api(`/api/project/${cur.job}/estilo`, { id });
    document.querySelectorAll(".estilo-desc").forEach((p) => { p.innerHTML = estiloDesc(id); });
    toast(id ? `Este video se edita con el estilo «${cur.estilo.nombre}»` : "La app elegirá el estilo al editar 🔀");
  } catch (e) { toast(e.message, true); }
}
function estiloSel() {
  const E = cur.estilo || {}, fijo = E.modo === "fijo" ? E.id : "";
  const auto = E.modo !== "fijo" && E.nombre ? `🔀 Rotar (le tocó: ${E.nombre})` : "🔀 Rotar: uno distinto cada video";
  return `<select onchange="setEstilo(this.value)">${estiloOpts(fijo, auto)}</select>`;
}

// en el inicio del video: con qué look se edita, y lo que se revisó del video terminado
const _renderHomeLook = renderHome;
renderHome = function (P) {
  _renderHomeLook(P);
  const after = P.querySelector("#card-instr") || P.querySelector("#card-assets");
  if (!after || !ESTILOS.length) return;
  const E = cur.estilo || {}, F = cur.final_ok;
  const rev = !F ? "" : `<p class="small ${F.hook === false ? "warn" : "muted"}">Video terminado:
    ${F.lufs !== undefined ? `volumen ${F.lufs} LUFS, pico ${F.tp} dBTP ✓` : "no se pudo medir el volumen"}
    ${F.hook === true ? " · título desde el primer cuadro ✓" : F.hook === false ? " · ⚠ no encontré el título en el primer cuadro: revisa el inicio" : ""}</p>`;
  after.insertAdjacentHTML("afterend", `<div class="box wide" id="card-estilo">
    <div class="row"><h3>🎨 Look del título y los subtítulos</h3><div class="spacer"></div>${estiloSel()}</div>
    <p class="muted small estilo-desc">${estiloDesc(E.modo === "fijo" ? E.id : "")}</p>
    <p class="muted small">El título sale completo desde el primer cuadro, sin animación.
      ${cur.legal ? "El aviso legal de la carpeta va chico y solo al final." : ""}</p>${rev}</div>`);
};

// en el paso Subtítulos
const _showStepLook = showStep;
showStep = function (id) {
  const r = _showStepLook(id);
  const hook = $("#subs-hook");
  if (id === "subtitulos" && hook && ESTILOS.length && !$("#subs-estilo")) {
    const lead = $("#panel p.lead");
    if (lead) lead.innerHTML = "Salen de la transcripción de tu corte, así que van exactos con la voz. El look cambia de un video a otro para que no se vean todos iguales. Si cambias el corte, vuelve a generarlos.";
    const E = cur.estilo || {}, fijo = E.modo === "fijo" ? E.id : "";
    hook.closest("div").insertAdjacentHTML("afterend", `<div style="margin-top:12px">
      <div class="muted small" style="margin-bottom:4px">Look del título y los subtítulos</div>
      <select id="subs-estilo" onchange="this.nextElementSibling.innerHTML=estiloDesc(this.value)">
        ${estiloOpts(fijo, E.nombre && !fijo ? `🔀 Rotar (le tocó: ${E.nombre})` : "🔀 Rotar: uno distinto cada video")}</select>
      <p class="muted small" style="margin:4px 0 0">${estiloDesc(fijo)}</p></div>`);
    const tip = hook.previousElementSibling;
    if (tip) tip.textContent = "Título arriba (opcional): aparece desde el primer cuadro, durante la primera frase.";
  }
  return r;
};

// el estilo viaja con el pedido de subtítulos y con el del lote
const _apiLook = api;
api = function (path, body) {
  if (body && /\/run\/subtitulos$/.test(path) && $("#subs-estilo")) body = { ...body, estilo: $("#subs-estilo").value };
  if (body && path === "/api/lote") body = { ...body, estilo: LOTE_OPT.estilo };
  return _apiLook(path, body);
};

// al mandar un lote
const _openLoteLook = openLote;
openLote = async function () {
  await _openLoteLook();
  const box = $("#modal-lote .lote-opts");
  if (!box || $("#lote-estilo")) return;
  const opt = (v, t, d) => `<label class="opt ${LOTE_OPT.estilo === v ? "on" : ""}"><input type="radio" name="lote-estilo" value="${v}"
      ${LOTE_OPT.estilo === v ? "checked" : ""} onchange="loteEstilo('${v}')">
      <b>${t}</b><span class="muted small">${d}</span></label>`;
  const uno = ESTILOS.filter((e) => e.rota), fijo = uno.some((e) => e.id === LOTE_OPT.estilo) ? LOTE_OPT.estilo : "";
  box.insertAdjacentHTML("afterbegin", `<label>Look del título y los subtítulos</label><div class="opts" id="lote-estilo">
    ${opt("rotar", "🔀 Rotar estilos", "Cada video sale con un look distinto, para que no se vean todos iguales.")}
    ${opt("nativo", "📱 Nativo", "Texto simple tipo TikTok, sin cajas, tarjetas ni gráficos. Para videos de 8 a 15 s.")}
    ${opt("producido", "🎬 Producido", "Edición completa: Claude diseña título, subtítulos y gráficos según tus instrucciones, como antes.")}
    <label class="opt ${fijo ? "on" : ""}"><b>Uno solo para todos</b>
      <select onchange="loteEstilo(this.value||'rotar')"><option value="">Elegir…</option>
        ${uno.map((e) => `<option value="${e.id}" ${fijo === e.id ? "selected" : ""}>${esc(e.nombre)}</option>`).join("")}</select></label>
    ${opt("", "Como está cada uno", "Respeta el look que ya tenga cada video (o el que fijaste).")}</div>`);
};
function loteEstilo(v) {
  LOTE_OPT.estilo = v; store("lote-estilo", v);
  const box = $("#lote-estilo"), sel = box.querySelector("select"), enLista = [...sel.options].some((o) => o.value && o.value === v);
  if (!enLista) sel.value = "";
  box.querySelectorAll(".opt").forEach((o) => {
    const r = o.querySelector("input[type=radio]");
    if (r) r.checked = r.value === v;
    o.classList.toggle("on", r ? r.value === v : enLista);
  });
}

// en los assets de una carpeta: su aviso legal
const saveLegal = debounce(async (gid, texto, el) => {
  try { await api(`/api/legal/${gid}`, { texto }); if (el) el.textContent = "Guardado ✓"; }
  catch (e) { toast(e.message, true); }
}, 600);
const _renderAssetsLook = renderAssets;
renderAssets = function () {
  _renderAssetsLook();
  if (!AS || AS.scope !== "grupo") return;
  if (AS.legal === undefined) {
    AS.legal = "";
    api(`/api/assets/grupo/${AS.id}`).then((d) => { if (AS && AS.scope === "grupo") { AS.legal = d.legal || ""; renderAssets(); } }).catch(() => {});
  }
  const at = $("#modal-assets .instr-block") || $("#modal-assets .modal-card > p.muted");
  at?.insertAdjacentHTML("afterend", `<div class="instr-block legal-block">
    <label>Aviso legal de la campaña <span class="muted">(opcional)</span></label>
    <textarea rows="2" placeholder="Ej: Consulta términos, condiciones y requisitos de contratación en nuestra página de internet."
      oninput="AS.legal=this.value;this.nextElementSibling.lastElementChild.textContent='Guardando…';saveLegal('${AS.id}',this.value,this.nextElementSibling.lastElementChild)">${esc(AS.legal || "")}</textarea>
    <div class="row"><span class="muted small">Sale chico, abajo y solo en los últimos segundos de cada video. Vacío = no sale.</span>
      <div class="spacer"></div><span class="muted small"></span></div></div>`);
};
