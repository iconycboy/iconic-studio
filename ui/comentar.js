// Iconic Studio — comentar sobre el video, en el momento exacto: mientras ves el video terminado, tocas
// «＋ Comentar aquí» y escribes; cada comentario guarda su minuto. Se mandan todos juntos a Claude en un solo
// mensaje (gasta menos que ir y volver), y quedan guardados aunque cierres la app.

let CM = { job: null, items: [] };
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

async function openComments() {
  if (!cur || !cur.final_url) return toast("Primero hay que tener el video terminado (exportado).");
  try { CM = { job: cur.job, items: (await api(`/api/project/${cur.job}/comentarios`)).comentarios }; }
  catch (e) { return toast(e.message, true); }
  $("#modal-cm .modal-card").innerHTML = `
    <h2>💬 Comentar sobre el video</h2>
    <p class="muted">Dale play. Cuando veas algo que cambiar, toca <b>«＋ Comentar aquí»</b>: el video se pausa y escribes qué cambiar
      en ese momento. Al final, mándale todo a Claude de una vez.</p>
    <div class="cm-wrap">
      <video id="cm-video" src="${cur.final_url}" controls></video>
      <div class="cm-side">
        <button class="btn primary big" onclick="addComment()">＋ Comentar aquí <span id="cm-now" class="tagpill">0:00</span></button>
        <div id="cm-list" class="cm-list"></div>
      </div>
    </div>
    <div class="row end"><span class="muted small" id="cm-saved"></span><div class="spacer"></div>
      <button class="btn ghost" onclick="closeComments()">Cerrar</button>
      <button class="btn claude big" id="cm-send" onclick="sendComments()">Enviar a Claude ✦</button></div>`;
  const v = $("#cm-video");
  v.ontimeupdate = () => { $("#cm-now").textContent = mmss(v.currentTime); };
  renderComments();
  $("#modal-cm").classList.remove("hidden");
}
function renderComments() {
  const L = $("#cm-list");
  if (!L) return;
  const items = CM.items.map((c, i) => ({ ...c, i })).sort((a, b) => a.t - b.t);
  L.innerHTML = items.length ? items.map((c) => `<div class="cm-item">
      <button class="tagpill cm-time" title="Ir a este momento" onclick="seekComment(${c.t})">▶ ${mmss(c.t)}</button>
      <textarea rows="2" placeholder="¿Qué cambiarías aquí? Ej: este texto tapa mi cara" oninput="CM.items[${c.i}].texto=this.value;saveCommentsSoon()">${esc(c.texto)}</textarea>
      <button class="btn ghost danger" title="Quitar" onclick="CM.items.splice(${c.i},1);renderComments();saveComments()">✕</button></div>`).join("")
    : `<div class="files-empty muted small">Todavía no hay comentarios. Dale play y toca «＋ Comentar aquí» donde quieras un cambio.</div>`;
  const n = CM.items.filter((c) => c.texto.trim()).length;
  const s = $("#cm-send"); if (s) { s.disabled = !n; s.textContent = n ? `Enviar ${n} a Claude ✦` : "Enviar a Claude ✦"; }
}
function addComment() {
  const v = $("#cm-video");
  v.pause();
  CM.items.push({ t: Math.round(v.currentTime * 10) / 10, texto: "" });
  renderComments();
  const boxes = [...document.querySelectorAll("#cm-list textarea")];
  const idx = [...CM.items.keys()].sort((a, b) => CM.items[a].t - CM.items[b].t).indexOf(CM.items.length - 1);
  boxes[idx]?.focus();
}
function seekComment(t) { const v = $("#cm-video"); v.currentTime = t; v.play(); }
let cmTimer = null;
function saveCommentsSoon() { clearTimeout(cmTimer); cmTimer = setTimeout(saveComments, 600); $("#cm-saved").textContent = "Guardando…"; renderCount(); }
function renderCount() {
  const n = CM.items.filter((c) => c.texto.trim()).length, s = $("#cm-send");
  if (s) { s.disabled = !n; s.textContent = n ? `Enviar ${n} a Claude ✦` : "Enviar a Claude ✦"; }
}
async function saveComments() {
  clearTimeout(cmTimer); cmTimer = null;
  try { await api(`/api/project/${CM.job}/comentarios`, { comentarios: CM.items }); const s = $("#cm-saved"); if (s) s.textContent = "Guardado ✓"; }
  catch (e) { toast(e.message, true); }
}
async function closeComments() {
  if (cmTimer) await saveComments();
  $("#cm-video")?.pause();
  $("#modal-cm").classList.add("hidden");
  if (curStep === "inicio") showStep("inicio");
}
async function sendComments() {
  if (cmTimer) await saveComments();
  if (!CM.items.some((c) => c.texto.trim())) return;
  try {
    await api(`/api/project/${CM.job}/comentarios`, { enviar: true });
    $("#cm-video")?.pause();
    $("#modal-cm").classList.add("hidden");
    toast("Claude recibió tus comentarios con su minuto exacto ✦");
    if (curStep === "inicio") showStep("inicio");
  } catch (e) { toast(e.message, true); }
}

// el botón, debajo del video terminado en el inicio
const _renderHomeC = renderHome;
renderHome = function (P) {
  _renderHomeC(P);
  const vid = P.querySelector("video.preview");
  if (!vid || !cur.final_url) return;
  const row = vid.parentElement.querySelector(".row") || vid;
  row.insertAdjacentHTML("afterend", `<div class="row cm-cta"><button class="btn claude" onclick="openComments()">💬 Comentar sobre el video</button>
    <span class="muted small">Marca el momento exacto de cada cambio y mándalos todos juntos.</span><span class="tagpill hidden" id="cm-pending"></span></div>`);
  api(`/api/project/${cur.job}/comentarios`).then((d) => {
    const n = d.comentarios.length, t = $("#cm-pending");
    if (n && t) { t.textContent = `${n} sin enviar`; t.classList.remove("hidden"); }
  }).catch(() => {});
};

document.body.insertAdjacentHTML("beforeend", `<div id="modal-cm" class="modal hidden"><div class="modal-card cm-card"></div></div>`);
