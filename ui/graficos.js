// Iconic Studio — menos gráficos y versión corta. Cuántos gráficos lleva el video (normal, pocos o ninguno), las
// grabaciones de pantalla reales del producto (assets marcados «pantalla», que Claude usa en vez del render de la
// tarjeta) y la versión corta de 10 a 15 s: Claude solo elige los tramos y la app la corta del video terminado.

const GRAF = [["normal", "Normal", "Los gráficos de siempre, según tus instrucciones y el estilo de la carpeta."],
  ["pocos", "Pocos", "Sin pantallas completas de marca ni el render de la tarjeta; máximo 2 gráficos chicos, y el producto sale después de dar valor."],
  ["ninguno", "Ninguno", "Solo el corte, el título y los subtítulos (y lo que marcaste como obligatorio)."]];
LOTE_OPT.graficos = store("lote-graficos") || "";
LOTE_OPT.corta = store("lote-corta") || "0";
const grafDesc = (v) => (GRAF.find((g) => g[0] === v) || GRAF[0])[2];

async function setGraficos(v) {
  try {
    cur.graficos = (await api(`/api/project/${cur.job}/graficos`, { nivel: v })).graficos;
    const p = $("#graf-desc"); if (p) p.textContent = grafDesc(v);
    toast(`Gráficos de este video: ${(GRAF.find((g) => g[0] === v) || GRAF[0])[1].toLowerCase()}`);
  } catch (e) { toast(e.message, true); }
}
async function setCorta(on) {
  try {
    cur.corta = await api(`/api/project/${cur.job}/corta`, { on });
    toast(on ? "Al editarlo, Claude también prepara la versión corta ✂️" : "Sin versión corta");
  } catch (e) { toast(e.message, true); }
}
async function pedirCorta() {
  try {
    cur.corta = await api(`/api/project/${cur.job}/corta`, { pedir: 1 });
    toast("Se abrió Claude para elegir las partes. La app la corta sola cuando termine ✂️");
  } catch (e) { toast(e.message, true); }
}

// en el inicio del video, dentro de la tarjeta del look
const _renderHomeGraf = renderHome;
renderHome = function (P) {
  _renderHomeGraf(P);
  const card = P.querySelector("#card-estilo");
  if (!card) return;
  const C = cur.corta || {}, g = cur.graficos || "normal";
  const estado = C.error ? `<span class="small warn">⚠ ${esc(C.error)}</span> <button class="btn" onclick="pedirCorta()">Pedirla de nuevo</button>`
    : C.lista ? `<span class="small">✂️ Lista${C.seg ? `: ${C.seg} s` : ""}, junto al video completo.
        <a href="${C.url}" target="_blank">Verla</a></span> <button class="btn ghost" onclick="pedirCorta()" title="Que Claude elija otras partes">Otra</button>`
    : cur.final ? `<button class="btn" onclick="pedirCorta()">✂️ Sacar la versión corta ahora</button>` : "";
  card.insertAdjacentHTML("beforeend", `<div id="card-graficos" style="margin-top:12px;border-top:1px solid var(--line,#8883);padding-top:12px">
    <div class="row"><h3>🖼️ Gráficos</h3><div class="spacer"></div>
      <select onchange="setGraficos(this.value)">${GRAF.map(([v, t]) => `<option value="${v}" ${g === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>
    <p class="muted small" id="graf-desc">${grafDesc(g)}</p>
    <label class="check" style="margin-top:10px"><input type="checkbox" ${C.on ? "checked" : ""} onchange="setCorta(this.checked)">
      <span>También una <b>versión corta</b> de 10 a 15 s <span class="muted small">(el hook y el momento más fuerte)</span></span></label>
    ${estado ? `<div class="row" style="margin-top:8px">${estado}</div>` : ""}</div>`);
};

// al mandar un lote
const _apiGraf = api;
api = function (path, body) {
  if (body && path === "/api/lote") body = { ...body, graficos: LOTE_OPT.graficos, ...(LOTE_OPT.corta === "1" ? { corta: true } : {}) };  // sin marcar: cada video como esté
  return _apiGraf(path, body);
};
const _openLoteGraf = openLote;
openLote = async function () {
  await _openLoteGraf();
  const at = $("#lote-estilo");
  if (!at || $("#lote-graficos")) return;
  const opt = (v, t, d) => `<label class="opt ${LOTE_OPT.graficos === v ? "on" : ""}"><input type="radio" name="lote-graficos" value="${v}"
      ${LOTE_OPT.graficos === v ? "checked" : ""} onchange="LOTE_OPT.graficos='${v}';store('lote-graficos','${v}');this.closest('.opts').querySelectorAll('.opt').forEach(o=>o.classList.toggle('on',o.contains(this)))">
      <b>${t}</b><span class="muted small">${d}</span></label>`;
  at.insertAdjacentHTML("afterend", `<label>Gráficos</label><div class="opts" id="lote-graficos">
    ${GRAF.map(([v, t, d]) => opt(v, t, d)).join("")}
    ${opt("", "Como está cada uno", "Respeta lo que elegiste en cada video.")}</div>
    <label>Versión corta</label><div class="opts"><label class="opt ${LOTE_OPT.corta === "1" ? "on" : ""}">
      <input type="checkbox" ${LOTE_OPT.corta === "1" ? "checked" : ""}
        onchange="LOTE_OPT.corta=this.checked?'1':'0';store('lote-corta',LOTE_OPT.corta);this.closest('.opt').classList.toggle('on',this.checked)">
      <b>✂️ También una de 10 a 15 s</b><span class="muted small">De cada video sale además una corta, con el hook y el momento más fuerte. Queda junto al video completo.</span></label></div>`);
};

// en los assets: las grabaciones de pantalla reales
async function pickPantallas() {
  if (!window.pywebview) return toast("Pega la ruta en el campo de abajo, o arrastra el archivo, y márcalo como grabación de pantalla");
  const paths = (await window.pywebview.api.elegir_assets()) || [];
  if (!paths.length) return;
  if (assetTimer) await saveAssets();
  try {
    const pending = AS.items.filter((a) => a.tipo === "texto" && !a.texto.trim());
    AS.items = (await api(`/api/assets/${AS.scope}/${AS.id}`, { agregar: paths, pantalla: 1 })).assets.concat(pending);
    renderAssets();
    toast("Grabaciones de pantalla agregadas ✓");
  } catch (e) { toast(e.message, true); }
}
const _renderAssetsGraf = renderAssets;
renderAssets = function () {
  _renderAssetsGraf();
  if (!AS || AS.scope === "material") return;
  $("#modal-assets .modal-card button[onclick='addAssetText()']")?.insertAdjacentHTML("afterend",
    `<button class="btn" onclick="pickPantallas()" title="Grabaciones de pantalla reales de la app o el producto: Claude las usa en vez del render de la tarjeta">📱 Grabaciones de pantalla…</button>`);
  document.querySelectorAll("#modal-assets .asset-list > .asset").forEach((el, i) => {
    const a = AS.items[i];
    if (!a || (a.tipo !== "video" && a.tipo !== "imagen")) return;
    el.querySelector(".asset-body")?.insertAdjacentHTML("beforeend", `<label class="check small"><input type="checkbox" ${a.pantalla ? "checked" : ""}
      onchange="AS.items[${i}].pantalla=this.checked;saveAssetsSoon()">
      📱 Es una grabación de pantalla real <span class="muted">(Claude la usa en vez del render de la tarjeta o de pantallas de marca)</span></label>`);
  });
};
