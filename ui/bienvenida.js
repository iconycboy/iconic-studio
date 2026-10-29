// Estudio de Video — primera vez: pregunta el nombre de quien la usa y, si el editor todavía no está instalado en
// esta PC, ofrece instalarlo con Claude (así funciona en la PC de cualquiera que reciba el .zip).

let INST = null;
async function checkInstall() {
  try { INST = await api("/api/instalacion"); } catch (e) { return; }
  if (INST.usuario) setName(INST.usuario);
  renderInstallBanner();
  if (!INST.usuario) askName();
}
function setName(n) {
  USUARIO = n;
  $("#hello").textContent = n ? `Hola, ${n} 👋` : "Hola 👋";
  const t = document.querySelector("#modal-claude .t-claude");
  if (t) t.textContent = `● Hola ${n}. Ya vi tu video: dura 4 minutos y está transcrito. ¿Qué quieres que haga?`;
}

function askName() {
  $("#modal-hola .modal-card").innerHTML = `
    <div class="hola-icon">🎬</div>
    <h2>¡Bienvenida o bienvenido!</h2>
    <p>Esta app edita tus videos con ayuda de Claude. Antes de empezar, <b>¿cómo te llamas?</b>
      Claude te va a hablar por tu nombre.</p>
    <input id="hola-name" placeholder="Tu nombre" maxlength="40" onkeydown="if(event.key==='Enter')saveName()">
    <div class="row end" style="margin-top:10px"><button class="btn primary big" onclick="saveName()">Empezar →</button></div>`;
  $("#modal-hola").classList.remove("hidden");
  setTimeout(() => $("#hola-name")?.focus(), 80);
}
async function saveName() {
  const n = ($("#hola-name").value || "").trim();
  if (!n) return toast("Escribe tu nombre 🙂");
  try {
    const d = await api("/api/usuario", { nombre: n });
    setName(d.usuario);
    $("#modal-hola").classList.add("hidden");
    toast(`¡Hola, ${d.usuario}! 👋`);
    if (typeof Tour !== "undefined") Tour.auto("inicio");
  } catch (e) { toast(e.message, true); }
}

function renderInstallBanner() {
  let b = $("#install-banner");
  if (!b) { b = document.createElement("div"); b.id = "install-banner"; $("#view-projects .projects-wrap").prepend(b); }
  if (!INST || (INST.listo && INST.claude)) { b.innerHTML = ""; return; }
  b.innerHTML = !INST.editor
    ? `<div class="install warn-box">⚠️ <div><b>No encuentro el editor.</b> La carpeta <b>video-editor</b> tiene que estar junto a la carpeta de esta app.
        Vuelve a descomprimir el .zip completo.</div></div>`
    : !INST.claude
    ? `<div class="install warn-box">⚠️ <div><b>Falta Claude Code.</b> Vuelve a hacer doble clic en <b>INSTALAR</b> (en la carpeta del .zip): lo instala solo.</div></div>`
    : `<div class="install"><div class="install-icon">⚙️</div><div class="grow"><b>Falta un último paso: instalar el editor en esta PC</b>
        <div class="muted small">Se hace una sola vez y lo hace Claude solo (unos 10–20 minutos). Mientras, puedes dejarlo trabajando.</div></div>
        <button class="btn claude big" onclick="startSetup()">⚙️ Terminar de instalar</button></div>`;
}
async function startSetup() {
  try { await api("/api/instalar", {}); } catch (e) { return toast(e.message, true); }
  $("#modal-hola .modal-card").innerHTML = `
    <h2>⚙️ Claude está instalando el editor</h2>
    <p>Se abrió una <b>ventana negra</b>. Ahí:</p>
    <ol class="steps-list">
      <li>Si te pide <b>iniciar sesión</b>, elige tu cuenta de Claude (se abre el navegador; entra y acepta).</li>
      <li>Si pregunta si confías en la carpeta, elige <b>Yes</b> con <kbd>Enter</kbd>.</li>
      <li>Si pide permiso para algo («Do you want to…»), elige <b>Yes</b>. Windows también puede preguntar «¿Quieres permitir que esta app haga cambios?»: toca <b>Sí</b> (a veces esa ventana queda detrás de las otras).</li>
      <li>Si Claude te dice que <b>reinicies</b>: cierra la ventana negra y vuelve a tocar <b>«Terminar de instalar»</b> aquí. Sigue solo donde iba.</li>
    </ol>
    <p class="muted small">Cuando termine, este aviso desaparece solo.</p>
    <div class="row end"><button class="btn primary" onclick="$('#modal-hola').classList.add('hidden')">Entendido</button></div>`;
  $("#modal-hola").classList.remove("hidden");
  // revisar cada tanto si ya terminó
  clearInterval(startSetup.t);
  startSetup.t = setInterval(async () => { await checkInstall(); if (INST && INST.listo) { clearInterval(startSetup.t); toast("✅ ¡El editor ya está instalado!"); } }, 15000);
}

document.body.insertAdjacentHTML("beforeend", `<div id="modal-hola" class="modal hidden"><div class="modal-card"></div></div>`);
// sin nombre todavía: el recorrido espera a que lo escriba
if (typeof Tour !== "undefined") { const _auto = Tour.auto.bind(Tour); Tour.auto = (k) => (USUARIO ? _auto(k) : null); }
checkInstall();
