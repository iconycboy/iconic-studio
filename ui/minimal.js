// Iconic Studio — opciones más limpias. Las de «editar juntos» pasan a pastillas con solo el nombre: debajo, una línea
// con lo que hace la elegida, y un «?» que abre la explicación de todas. Lo que casi nunca se cambia va en «Más
// opciones». En el video, el look y los gráficos llevan su «?» con una muestra de cada estilo. Solo reordena lo que
// ya dibujaron cola.js, estilos.js y graficos.js: no cambia lo que se guarda ni lo que se manda.

const FUENTE_CSS = { inter: "Inter, sans-serif", "inter-black": "Inter, sans-serif", heros: "Arial, Helvetica, sans-serif",
  mono: "'IBM Plex Mono', Consolas, monospace", serif: "'Playfair Display', Georgia, serif" };
function muestra(e) {  // cómo se ve el título de un estilo, en chiquito
  const h = e && e.hook;
  if (!h) return `<span class="muestra"><i style="color:#fff">${e && e.libre ? "🎬" : "🔀"}</i></span>`;
  const c = h.contorno ? "text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 0 3px #000;" : "";
  return `<span class="muestra"><i style="color:${h.color};${h.caja ? `background:${h.caja};border-radius:${Math.min(h.radio || 0, 5)}px;` : ""}${c}
    font-family:${FUENTE_CSS[h.fuente] || "inherit"};font-weight:${h.fuente === "inter-black" ? 900 : 700};
    ${h.fuente === "serif" ? "font-style:italic;" : ""}${h.mayus ? "text-transform:uppercase;" : ""}">Título</i></span>`;
}
const ayudaEstilos = (lista) => lista.map((e) => `<li>${muestra(e)}<span><b>${esc(e.nombre)}</b> · ${esc(e.desc || "")}</span></li>`).join("");
function ayuda(html) { return `<div class="ayuda"><div><ul>${html}</ul></div></div>`; }
function toggleAyuda(btn, sel) {
  const a = sel ? document.querySelector(sel) : btn.closest("label, .row").nextElementSibling;
  const box = a && a.classList.contains("ayuda") ? a : btn.closest("label, .row").parentElement.querySelector(":scope > .ayuda");
  if (!box) return;
  btn.classList.toggle("on", box.classList.toggle("open"));
}
const qBtn = (sel) => `<button type="button" class="q" title="¿Qué hace cada opción?" onclick="event.preventDefault();event.stopPropagation();toggleAyuda(this${sel ? `,'${sel}'` : ""})">?</button>`;

// ------------------------------------------------------------------ la ventana de «editar juntos»
function optDesc(o) {
  const s = o.querySelector("select");
  if (s) return s.value ? estiloDesc(s.value) : "Elige un estilo y todos los videos del lote salen con ese.";
  return (o.querySelector(":scope > span") || {}).textContent || "";
}
function segNow(opts, anima) {
  const now = opts.nextElementSibling;
  if (!now || !now.classList.contains("opt-now")) return;
  const all = [...opts.querySelectorAll(".opt")], on = all.find((o) => o.classList.contains("on"));
  const txt = on ? optDesc(on) : all.length === 1 ? optDesc(all[0]) : "";
  if (now.textContent === txt) return;
  now.textContent = txt;
  if (anima) { now.classList.remove("cambia"); void now.offsetWidth; now.classList.add("cambia"); }
}
function masResumen() {
  const r = document.querySelector("#modal-lote .mas .resumen");
  if (r) r.textContent = [...document.querySelectorAll("#modal-lote .mas .opt.on b")].map((b) => b.textContent.trim()).join(" · ");
}
const _openLoteMin = openLote;
openLote = async function () {
  await _openLoteMin();
  const box = document.querySelector("#modal-lote .lote-opts");
  if (!box || box.dataset.min) return;
  box.dataset.min = "1";
  const mas = [];
  [...box.querySelectorAll(":scope > .opts")].forEach((opts) => {
    const label = opts.previousElementSibling;
    opts.classList.add("seg");
    const filas = [...opts.querySelectorAll(".opt")].map((o) => {
      if (o.querySelector("select")) return `<li><b>${esc(o.querySelector("b").textContent)}</b><span>Todos los videos del lote con el mismo estilo:</span></li>`
        + ESTILOS.filter((e) => e.rota).map((e) => `<li class="sub">${muestra(e)}<span><b>${esc(e.nombre)}</b> · ${esc(e.desc || "")}</span></li>`).join("");
      return `<li><b>${esc(o.querySelector("b").textContent)}</b><span>${esc(optDesc(o))}</span></li>`;
    }).join("");
    opts.insertAdjacentHTML("afterend", `<p class="opt-now"></p>${ayuda(filas)}`);
    if (label && label.tagName === "LABEL") label.insertAdjacentHTML("beforeend", qBtn());
    segNow(opts, false);
    opts.addEventListener("change", () => setTimeout(() => { segNow(opts, true); masResumen(); }, 0));
    if (label && /Transcripci|Claude|Cuántos/.test(label.textContent)) mas.push(label, opts, opts.nextElementSibling, opts.nextElementSibling.nextElementSibling);
  });
  if (mas.length) {  // lo que casi nunca se cambia, guardado
    box.insertAdjacentHTML("beforeend", `<details class="mas"><summary>Más opciones<span class="resumen"></span></summary><div class="mas-body"></div></details>`);
    const body = box.querySelector(".mas-body");
    mas.forEach((el) => body.appendChild(el));
    masResumen();
  }
};
// el «?» de una etiqueta abre la ayuda de su grupo (está dos hermanos más abajo: pastillas, línea, ayuda)
const _toggleAyudaBase = toggleAyuda;
toggleAyuda = function (btn, sel) {
  const label = btn.closest(".lote-opts label, .mas-body label");
  if (!sel && label) {
    let a = label.nextElementSibling;
    while (a && !a.classList.contains("ayuda")) a = a.nextElementSibling;
    if (a) return btn.classList.toggle("on", a.classList.toggle("open"));
  }
  return _toggleAyudaBase(btn, sel);
};

// ------------------------------------------------------------------ el brillo de las tarjetas sigue al cursor
let brilloPend = null;
addEventListener("pointermove", (e) => {
  if (brilloPend || document.documentElement.classList.contains("no-motion")) return;
  brilloPend = requestAnimationFrame(() => {
    brilloPend = null;
    const c = e.target.closest && e.target.closest(".card");
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", `${e.clientX - r.left}px`);
    c.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
}, { passive: true });

// ------------------------------------------------------------------ en el video: el look y los gráficos
const _renderHomeMin = renderHome;
renderHome = function (P) {
  _renderHomeMin(P);
  const card = P.querySelector("#card-estilo");
  if (!card) return;
  const h3 = card.querySelector("h3");
  // la frase fija del título pasa a la ayuda: una línea menos a la vista
  const fija = [...card.querySelectorAll(":scope > p.muted.small")].find((p) => /primer cuadro, sin animación/.test(p.textContent));
  const extra = fija ? fija.textContent.replace(/\s+/g, " ").trim() : "";
  if (fija) fija.remove();
  h3.insertAdjacentHTML("beforeend", qBtn("#ayuda-look"));
  card.querySelector(".estilo-desc").insertAdjacentHTML("afterend", `<div class="ayuda" id="ayuda-look"><div><ul>
    <li>${muestra(null)}<span><b>Rotar</b> · La app elige uno distinto a los últimos videos de la carpeta, para que no se vean todos iguales.</span></li>
    ${ayudaEstilos(ESTILOS)}${extra ? `<li><span>${esc(extra)}</span></li>` : ""}</ul></div></div>`);
  const g = card.querySelector("#card-graficos");
  if (g) {
    g.querySelector("h3").insertAdjacentHTML("beforeend", qBtn("#ayuda-graf"));
    g.querySelector("#graf-desc").insertAdjacentHTML("afterend", `<div class="ayuda" id="ayuda-graf"><div><ul>
      ${GRAF.map(([, t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join("")}
      <li><b>Versión corta</b><span>Claude elige el hook y el momento más fuerte, y la app corta sola una versión de 10 a 15 s del video terminado. Queda junto al completo.</span></li>
      <li><b>📱 Pantallas</b><span>Si en los assets marcas grabaciones de pantalla reales, Claude las usa en vez del render de la tarjeta.</span></li></ul></div></div>`);
  }
};
