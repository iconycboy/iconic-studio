// Estudio de Video — instrucciones previas para Claude: lo que tiene que hacer al editar (resaltar una palabra en los
// subtítulos, poner un logo cada vez que se dice algo…). Por video, por carpeta (todos sus videos) y al mandar un lote.

const INSTR_HINT = "Ej: cada vez que diga «SideShift», resáltalo en los subtítulos (en otro color) y que aparezca el logo un momento. "
  + "Empieza directo, sin saludo. Subtítulos grandes.";
const saveInstr = debounce(async (scope, id, texto, el) => {
  try { await api(`/api/instrucciones/${scope}/${id}`, { texto }); if (el) el.textContent = "Guardado ✓"; }
  catch (e) { toast(e.message, true); }
}, 600);
function instrInput(scope, id, el) {
  const s = el.closest(".instr").querySelector(".instr-saved");
  s.textContent = "Guardando…";
  if (scope === "video" && cur) cur.instrucciones = el.value;
  if (AS && AS.scope === scope && AS.id === id) AS.instr = el.value;
  saveInstr(scope, id, el.value, s);
}
const instrBox = (scope, id, texto, rows = 4) => `<div class="instr">
    <textarea rows="${rows}" placeholder="${esc(INSTR_HINT)}" oninput="instrInput('${scope}','${id}',this)">${esc(texto || "")}</textarea>
    <div class="row"><span class="muted small">Escríbelo como se lo dirías a una persona. Se guarda solo.</span><div class="spacer"></div>
      <span class="muted small instr-saved"></span></div></div>`;

// en el inicio del video, justo después de los assets
const _renderHomeI = renderHome;
renderHome = function (P) {
  _renderHomeI(P);
  const after = P.querySelector("#card-assets") || P.querySelector(".paths");
  if (!after) return;
  const g = cur.grupo && gById(cur.grupo);
  after.insertAdjacentHTML(after.id === "card-assets" ? "afterend" : "beforebegin", `<div class="box wide" id="card-instr">
    <h3>${ico("notes")} Instrucciones para Claude</h3>
    <p class="muted small">Lo que Claude tiene que hacer cuando edite <b>este</b> video. Las lee antes de empezar, también en la ⚡ edición automática.</p>
    ${instrBox("video", cur.job, cur.instrucciones)}
    ${g ? `<div class="instr-group hidden"><div class="row"><b class="small">${g.emoji} De la carpeta «${esc(g.nombre)}» (para todos sus videos):</b><div class="spacer"></div>
      <button class="btn ghost" onclick="openAssets('grupo','${g.id}','${cur.job}')">Editar las de la carpeta →</button></div>
      <p class="instr-read small"></p></div>
      <p class="muted small instr-nogroup hidden">💡 ¿Valen para toda la campaña? Escríbelas en la carpeta ${g.emoji} ${esc(g.nombre)}
        (<a href="#" onclick="openAssets('grupo','${g.id}','${cur.job}');return false">aquí</a>) y Claude las usa en todos sus videos.</p>` : ""}
  </div>`);
  if (g) api(`/api/assets/grupo/${g.id}`).then((d) => {
    const box = P.querySelector(".instr-group");
    if (!box) return;
    if (d.instrucciones) { box.classList.remove("hidden"); box.querySelector(".instr-read").textContent = d.instrucciones; }
    else P.querySelector(".instr-nogroup")?.classList.remove("hidden");
  }).catch(() => {});
};

// en los assets de una carpeta: sus instrucciones arriba
const _renderAssetsI = renderAssets;
renderAssets = function () {
  _renderAssetsI();
  if (!AS || AS.scope !== "grupo") return;
  if (AS.instr === undefined) {
    AS.instr = "";
    api(`/api/assets/grupo/${AS.id}`).then((d) => { if (AS && AS.scope === "grupo") { AS.instr = d.instrucciones || ""; renderAssets(); } }).catch(() => {});
  }
  $("#modal-assets .modal-card > p.muted")?.insertAdjacentHTML("afterend", `<div class="instr-block">
    <label>Instrucciones para Claude en <b>todos</b> los videos de esta carpeta</label>${instrBox("grupo", AS.id, AS.instr, 3)}</div>`);
};

// al mandar varios videos juntos
const _openLoteI = openLote;
openLote = async function () {
  _openLoteI();
  const sel = projects.filter((p) => LOTE.sel.has(p.job));
  const groups = [...new Set(sel.map((p) => p.grupo))];
  const g = groups.length === 1 && gById(groups[0]);
  let prev = "";
  if (g) try { prev = (await api(`/api/assets/grupo/${g.id}`)).instrucciones || ""; } catch (e) { /* sin red */ }
  LOTE.groupInstr = { id: g ? g.id : "", prev };
  $("#modal-lote .row.end")?.insertAdjacentHTML("beforebegin", `<div class="instr-block">
    <label>Instrucciones para Claude <span class="muted">(opcional)</span></label>
    <textarea id="lote-instr" rows="4" placeholder="${esc(INSTR_HINT)}">${esc(prev)}</textarea>
    ${g ? `<label class="check small"><input type="checkbox" id="lote-instr-save" checked>
      Guardarlas en la carpeta ${g.emoji} ${esc(g.nombre)} para sus próximos videos</label>` : ""}</div>`);
};
sendLote = async function () {
  const texto = ($("#lote-instr")?.value || "").trim();
  const gi = LOTE.groupInstr || {};
  let extra = texto;
  try {
    if (gi.id && $("#lote-instr-save")?.checked) {
      await api(`/api/instrucciones/grupo/${gi.id}`, { texto });
      extra = "";  // ya van como instrucciones de la carpeta
    } else if (texto === gi.prev) extra = "";  // las de la carpeta ya van solas
    await api("/api/lote", { jobs: [...LOTE.sel], instrucciones: extra });
    $("#modal-lote").classList.add("hidden");
    toast(`Claude empezó a editar los ${LOTE.sel.size} videos en su ventana ✦`);
    stopPick();
    loadProjects();
  } catch (e) { toast(e.message, true); }
};

if (typeof TOURS !== "undefined") {
  const i = TOURS.proyecto.findIndex((s) => s.sel === "#card-auto");
  TOURS.proyecto.splice(i < 0 ? 1 : i, 0, { sel: "#card-instr", title: "📝 Instrucciones para Claude",
    text: "Escribe aquí lo que Claude tiene que hacer <b>antes</b> de que edite: «resalta la palabra SideShift en los subtítulos», «pon el logo cada vez que la digo», «empieza sin saludo»… Él las sigue al pie de la letra." });
}
