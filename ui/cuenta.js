// Estudio de Video — cuenta de Claude: con qué cuenta trabajan las ventanas de Claude que abre la app, y cambiarla
// paso a paso (por ejemplo, para que otra persona use la suya). Los videos, el estilo y las instrucciones no dependen de la cuenta.

let ACC = null;          // último estado conocido
let accPoll = null;
const PLAN_N = { pro: "Pro", max: "Max", team: "Team", enterprise: "Enterprise", free: "Gratis" };
const accWho = (a) => (a && a.conectado ? a.correo || a.nombre || "conectada" : "");

async function loadAccount() {
  try { ACC = await api("/api/cuenta"); } catch (e) { ACC = null; }
  renderAccountChip();
  return ACC;
}
function renderAccountChip() {
  const b = $("#btn-cuenta");
  if (!b) return;
  if (!ACC) { b.innerHTML = `${ico("user")} Cuenta de Claude`; return; }
  b.innerHTML = ACC.conectado
    ? `${ico("user")} <span class="acc-mail">${esc(accWho(ACC).split("@")[0])}</span>`
    : `${ico("user")} <span class="warn">Sin cuenta de Claude</span>`;
  b.title = ACC.conectado ? `Claude usa la cuenta de ${accWho(ACC)}. Toca para cambiarla.` : "Ninguna cuenta conectada. Toca para entrar.";
}

function openAccount() {
  clearInterval(accPoll);
  $("#modal-cuenta").classList.remove("hidden");
  renderAccount("estado");
  loadAccount().then(() => renderAccount("estado"));
}
function closeAccount() { clearInterval(accPoll); $("#modal-cuenta").classList.add("hidden"); }

function renderAccount(paso) {
  const a = ACC, card = $("#modal-cuenta .modal-card");
  const head = `<h2>Cuenta de Claude</h2>`;
  const now = !a ? `<p class="muted">Revisando…</p>`
    : !a.instalado ? `<p class="warn">Claude Code no está instalado en esta PC.</p>`
    : a.conectado ? `<div class="acc-now"><span class="acc-dot on"></span><div>Ahora Claude trabaja con la cuenta de <b>${esc(accWho(a))}</b>
        ${a.plan ? `<span class="tagpill">plan ${esc(PLAN_N[a.plan] || a.plan)}</span>` : ""}</div></div>`
    : `<div class="acc-now"><span class="acc-dot"></span><div><b>Ninguna cuenta conectada.</b> Hay que entrar con una cuenta de Claude para que Claude pueda editar.</div></div>`;
  const keeps = `<p class="muted small">Cambiar de cuenta <b>no borra nada</b>: los videos, tu estilo 🎨, los assets 🧩 y las instrucciones 📝
    quedan en esta PC y los ve cualquier cuenta. Solo cambia de qué plan se gasta el uso.</p>`;
  const close = `<button class="btn ghost" onclick="closeAccount()">Cerrar</button>`;
  if (paso === "estado") {
    card.innerHTML = head + now + keeps + `<div class="row end">${close}
      ${a && a.instalado ? (a.conectado ? `<button class="btn primary" onclick="renderAccount('antes')">🔁 Cambiar de cuenta</button>`
        : `<button class="btn primary" onclick="renderAccount('entrar')">Entrar con una cuenta</button>`) : ""}</div>`;
  } else if (paso === "antes") {
    card.innerHTML = head + now + `<h3>Antes de cambiar, revisa esto</h3>
      <label class="check acc-step"><input type="checkbox" onchange="accCheck()"> <span>No hay ninguna <b>ventana negra de Claude</b> trabajando
        (si hay una editando, espera a que termine o ciérrala: luego se le dice «continúa» y sigue donde iba).</span></label>
      <label class="check acc-step"><input type="checkbox" onchange="accCheck()"> <span>En el <b>navegador</b>, cerré la sesión de claude.ai de la otra persona
        (o voy a usar una ventana de incógnito). Si no, puede volver a entrar la cuenta equivocada.</span></label>
      <p class="muted small">Tu Claude de escritorio (la app de Claude) tiene su propia sesión y no se toca.</p>
      <div class="row end"><button class="btn ghost" onclick="renderAccount('estado')">← Atrás</button>
        <button class="btn primary" id="acc-go" disabled onclick="accLogout()">Cerrar la sesión de ${esc(accWho(a).split("@")[0])}</button></div>`;
  } else if (paso === "entrar") {
    card.innerHTML = head + now + `<h3>Entrar con la nueva cuenta</h3>
      <p>Se abre una ventanita y luego el <b>navegador</b>: ahí entra la persona con <b>su</b> cuenta de Claude y toca <b>Autorizar</b>.</p>
      <label>Correo de la cuenta <span class="muted">(opcional, para que ya aparezca escrito)</span></label>
      <input id="acc-mail" placeholder="ej: tu-correo@gmail.com" onkeydown="if(event.key==='Enter')accLogin()">
      <div class="row end" style="margin-top:8px">${close}<button class="btn primary" onclick="accLogin()">Abrir el inicio de sesión</button></div>`;
  } else if (paso === "esperando") {
    card.innerHTML = head + `<div class="working"><span class="spin"></span><div><b>Esperando a que entres en el navegador…</b>
      Cuando aceptes, esta ventana se actualiza sola.</div></div>
      <p class="muted small">¿No se abrió el navegador? Mira la ventanita negra «Claude · iniciar sesión»: ahí sale un enlace para abrirlo.</p>
      <div class="row end"><button class="btn ghost" onclick="renderAccount('entrar')">← Intentar de nuevo</button>${close}</div>`;
  } else if (paso === "listo") {
    card.innerHTML = head + `<div class="acc-done">✅ ¡Listo! Ahora Claude trabaja con la cuenta de <b>${esc(accWho(a))}</b>.</div>`
      + `<p class="muted small">Para comprobarlo en una ventana de Claude, escribe <kbd>/status</kbd>: sale el mismo correo.</p>`
      + `<div class="row end"><button class="btn primary big" onclick="closeAccount()">Perfecto</button></div>`;
  }
}
function accCheck() {
  const all = [...document.querySelectorAll("#modal-cuenta .acc-step input")].every((i) => i.checked);
  $("#acc-go").disabled = !all;
}
async function accLogout() {
  const b = $("#acc-go"); b.disabled = true; b.textContent = "Cerrando sesión…";
  try { ACC = await api("/api/cuenta", { accion: "salir" }); renderAccountChip(); renderAccount("entrar"); toast("Sesión cerrada ✓"); }
  catch (e) { toast(e.message, true); renderAccount("antes"); }
}
async function accLogin() {
  const before = accWho(ACC);
  try { await api("/api/cuenta", { accion: "entrar", correo: ($("#acc-mail")?.value || "").trim() }); }
  catch (e) { return toast(e.message, true); }
  renderAccount("esperando");
  clearInterval(accPoll);
  const t0 = Date.now();
  accPoll = setInterval(async () => {
    const a = await loadAccount();
    if (a && a.conectado && accWho(a) !== before) { clearInterval(accPoll); renderAccount("listo"); }
    else if (Date.now() - t0 > 5 * 60 * 1000) { clearInterval(accPoll); renderAccount("estado"); }
  }, 3000);
}

// avisos de con qué cuenta va a trabajar Claude, justo antes de abrirlo
function accountLine() {
  if (!ACC || !ACC.instalado) return "";
  return ACC.conectado
    ? `<p class="muted small acc-line">👤 Va a usar la cuenta de <b>${esc(accWho(ACC))}</b>. <a href="#" onclick="openAccount();return false">¿Otra?</a></p>`
    : `<p class="warn small acc-line">👤 No hay ninguna cuenta de Claude conectada: <a href="#" onclick="openAccount();return false">entra primero</a>.</p>`;
}
const _openClaudeC = openClaude;
openClaude = function (modo, texto) {
  const g = $("#modal-claude .modal-card");
  g.querySelector(".acc-line")?.remove();
  g.querySelector(".row.end")?.insertAdjacentHTML("beforebegin", accountLine());
  if (ACC && ACC.instalado && !ACC.conectado) {  // sin cuenta: la guía aparece siempre, para avisar
    pendingClaude = { modo, texto: texto || "" };
    $("#claude-skip").checked = false;
    return $("#modal-claude").classList.remove("hidden");
  }
  return _openClaudeC(modo, texto);
};
const _openLoteC = openLote;
openLote = async function () {
  await _openLoteC();
  $("#modal-lote .row.end")?.insertAdjacentHTML("beforebegin", accountLine());
};

// montaje
document.body.insertAdjacentHTML("beforeend", `<div id="modal-cuenta" class="modal hidden"><div class="modal-card"></div></div>`);
(() => {
  const b = document.createElement("button");
  b.className = "btn ghost"; b.id = "btn-cuenta"; b.innerHTML = `${ico("user")} Cuenta de Claude`; b.onclick = openAccount;
  $("#btn-style").before(b);
})();
loadAccount();
// con un botón más arriba no cabía en la ventana chica: Apariencia queda solo con su ícono (el nombre sale al pasar el mouse)
document.querySelectorAll('#view-projects .topbar [title="Cambiar colores y letras"]').forEach((b) => { b.title = "Apariencia: colores y letras"; });
