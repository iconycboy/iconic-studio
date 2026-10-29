// Estudio de Video — recorrido guiado y ayuda (todo en lenguaje sencillo)

// ------------------------------------------------------------------ recorrido
const TOURS = {
  inicio: [
    { title: () => `¡Bienvenida${USUARIO ? ", " + USUARIO : ""}! 🎬`,
      text: "Esta app edita tus videos con ayuda de Claude: quita silencios y errores, ajusta el sonido, pone subtítulos y lo deja listo para subir. Te muestro dónde está cada cosa en 1 minuto." },
    { sel: "#btn-new", title: "1. Empieza aquí",
      text: "Toca <b>«Nuevo video»</b> y elige un video tuyo. Tu archivo original nunca se toca: la app trabaja sobre una copia." },
    { sel: "#projects", title: "2. Tus videos", optional: true,
      text: "Cada video que crees aparece aquí como una tarjeta, con su avance. Tócalo para seguir donde lo dejaste." },
    { sel: "#search", title: "Buscar",
      text: "Cuando tengas muchos videos, escribe aquí una palabra del nombre o de tus notas para encontrarlo." },
    { sel: "#btn-style", title: "3. Tu estilo 🎨",
      text: "Aquí ves lo que Claude ha aprendido de cómo te gustan tus videos. Lo lee antes de editar cada uno, así cada video sale más a tu gusto." },
    { sel: "#btn-help", title: "¿Dudas? Aquí",
      text: "En <b>Ayuda</b> está todo explicado, con preguntas frecuentes, y puedes repetir este recorrido cuando quieras. ¡Listo, crea tu primer video!" },
  ],
  proyecto: [
    { title: "Este es tu video 🎥",
      text: "Desde aquí lo editas. Hay dos caminos y puedes mezclarlos como quieras." },
    { sel: "#card-auto", title: "⚡ Camino fácil: que Claude lo haga todo",
      text: "Un botón y Claude edita el video completo con tu estilo y lo exporta. Se abre su ventana para contarte qué hace; tú solo lo ves al final." },
    { sel: "#card-manual", title: "✂️ Camino a mano",
      text: "Si quieres decidir tú, vas paso a paso: lees lo que dijiste y tachas lo que sobra, como en un documento. El video se corta solo." },
    { sel: "#card-feedback", title: "💬 Enséñale tu estilo",
      text: "Cuando veas el resultado, escribe aquí qué te gustó y qué no, en tus palabras. Claude lo arregla y lo recuerda para los próximos videos." },
    { sel: "#steps", title: "Los pasos",
      text: "A la izquierda ves el avance: <b>✓ verde</b> = hecho, <b>↻ amarillo</b> = hay que repetirlo porque cambiaste algo antes, <b>! rojo</b> = algo falló (ahí aparece un botón para pedirle ayuda a Claude)." },
    { sel: "#btn-claude", title: "✦ Hablar con Claude",
      text: "Para pedirle cualquier otra cosa sobre este video: «pon gráficos», «quita la parte del precio», «¿qué te parece?». Claude ya sabe qué video tienes abierto." },
    { sel: "#btn-notes", title: "📝 Notas",
      text: "Apunta ideas o para quién es el video. Claude también las lee. ¡Eso es todo, a editar!" },
  ],
};

const Tour = {
  steps: [], i: 0, name: "",
  auto(name) { if (store(`tour-${name}`) !== "1") setTimeout(() => this.start(name), 500); },
  start(name) {
    this.name = name;
    this.steps = TOURS[name].filter((s) => !s.sel || !s.optional || document.querySelector(s.sel)?.children.length);
    this.i = 0;
    $("#tour").classList.remove("hidden");
    this.show();
  },
  go(d) {
    this.i += d;
    if (this.i >= this.steps.length) return this.end();
    if (this.i < 0) this.i = 0;
    this.show();
  },
  end() {
    $("#tour").classList.add("hidden");
    store(`tour-${this.name}`, "1");
  },
  show() {
    const s = this.steps[this.i];
    const hole = $("#tour-hole"), card = $("#tour-card");
    $("#tour-count").textContent = `${this.i + 1} de ${this.steps.length}`;
    $("#tour-title").textContent = typeof s.title === "function" ? s.title() : s.title;
    $("#tour-text").innerHTML = s.text;
    $("#tour-back").style.visibility = this.i ? "visible" : "hidden";
    $("#tour-next").textContent = this.i === this.steps.length - 1 ? "¡Listo! ✓" : "Siguiente →";
    const el = s.sel && document.querySelector(s.sel);
    if (!el) {  // sin elemento: tarjeta centrada, todo oscurecido
      hole.style.cssText = "left:50%;top:50%;width:0;height:0";
      card.style.cssText = "left:50%;top:50%;transform:translate(-50%,-50%)";
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "instant" });
    this.place(el);
  },
  // se recalcula seguido: un video que termina de cargar mueve todo lo que está debajo
  place(el) {
    const hole = $("#tour-hole"), card = $("#tour-card");
    const r = el.getBoundingClientRect(), pad = 8;
    hole.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
    const cw = 360, below = r.bottom + 16 + 220 < innerHeight;
    let left = Math.min(Math.max(16, r.left + r.width / 2 - cw / 2), innerWidth - cw - 16);
    let top = below ? r.bottom + 16 : Math.max(16, r.top - 16 - card.offsetHeight);
    if (!below && r.top < 240) { left = r.right + 20 + cw < innerWidth ? r.right + 20 : Math.max(16, r.left - cw - 20); top = Math.max(16, r.top); }
    card.style.cssText = `left:${left}px;top:${top}px;transform:none`;
  },
};
addEventListener("resize", () => { if (!$("#tour").classList.contains("hidden")) Tour.show(); });
setInterval(() => {
  if ($("#tour").classList.contains("hidden")) return;
  const s = Tour.steps[Tour.i], el = s && s.sel && document.querySelector(s.sel);
  if (el) Tour.place(el);
}, 250);
addEventListener("keydown", (e) => {
  if ($("#tour").classList.contains("hidden")) return;
  if (e.key === "Escape") Tour.end();
  if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); Tour.go(1); }
  if (e.key === "ArrowLeft") Tour.go(-1);
}, true);

// ------------------------------------------------------------------ ayuda
let helpFrom = "projects";
function showHelp(anchor) {
  helpFrom = curView;
  stopEditor();
  view("help");
  $("#help-body").innerHTML = HELP;
  const el = anchor && document.getElementById(`h-${anchor}`);
  (el || $("#help-body")).scrollIntoView({ block: "start" });
}
function helpBack() {
  if (helpFrom === "project" && cur) { view("project"); showStep(curStep || "inicio"); }
  else if (helpFrom === "style") showStyle();
  else showProjects();
}
function replayTour() {
  const name = helpFrom === "project" && cur ? "proyecto" : "inicio";
  helpBack();
  setTimeout(() => Tour.start(name), 300);
}

const HELP = `
<nav class="help-toc">
  <a href="#h-que">¿Qué es esto?</a><a href="#h-pasos">Editar un video</a><a href="#h-caminos">Los dos caminos</a>
  <a href="#h-claude">Hablar con Claude</a><a href="#h-estilo">Tu estilo</a><a href="#h-glosario">Palabras raras</a>
  <a href="#h-faq">Preguntas frecuentes</a>
</nav>

<section id="h-que"><h2>🎬 ¿Qué es esto?</h2>
<p>Una app para editar videos en los que hablas a cámara (Reels, TikToks, YouTube). Adentro trabaja <b>Claude</b>,
una inteligencia artificial que sabe editar: quita los silencios y los errores, sube el sonido de tu voz,
corrige el color, pone subtítulos y gráficos, y te deja el video listo para subir.</p>
<p>Tú decides cuánto hace Claude y cuánto haces tú.</p></section>

<section id="h-pasos"><h2>🪄 Editar un video en 3 pasos</h2>
<ol class="big-steps">
  <li><b>Toca «＋ Nuevo video»</b> y elige tu video. Ponle un nombre y el idioma en que hablas.</li>
  <li><b>Elige cómo editarlo:</b> «⚡ Que Claude lo edite todo» o «✂️ Hacerlo yo, paso a paso».</li>
  <li><b>Míralo y dile qué te gustó.</b> En «💬 Cuéntale a Claude» escribes lo que cambiarías. Claude lo arregla y lo aprende.</li>
</ol>
<p>El video terminado queda en tu carpeta <b>Descargas</b>, listo para subir. También lo ves en el <b>🏠 Inicio</b> del video.</p></section>

<section id="h-caminos"><h2>⚡ ✂️ Los dos caminos</h2>
<div class="two">
<div class="box"><h3>⚡ Que Claude lo edite todo</h3>
<p>Un botón y Claude hace todo, usando tu estilo. Se abre su ventana para contarte en qué va. Tarda más o menos
<b>15 a 40 minutos</b>, según lo largo del video; puedes hacer otra cosa mientras. Al final te pregunta qué te gustó.</p></div>
<div class="box"><h3>✂️ Hacerlo yo, paso a paso</h3>
<ul>
<li><b>Importar:</b> la app copia tu video.</li>
<li><b>Transcribir:</b> la app escribe todo lo que dices, palabra por palabra.</li>
<li><b>Editar por texto:</b> tachas palabras o frases y el video se corta solo. «Ver con mis cortes» te lo muestra al instante.
  Doble clic tacha o devuelve una palabra; <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshace.</li>
<li><b>Aplicar corte:</b> deja los cortes perfectos, sin comerse el final de las palabras.</li>
<li><b>Audio:</b> deja tu voz con un volumen parejo y profesional.</li>
<li><b>Subtítulos:</b> los genera solos, exactos con tu voz. Puedes poner un título arriba.</li>
<li><b>Enviar a CapCut</b> (opcional): si quieres retocarlo tú en CapCut.</li>
<li><b>Exportar MP4:</b> el video final, a Descargas.</li>
</ul></div></div>
<p>Puedes mezclar: por ejemplo, cortar tú el texto y después pedirle a Claude «ponle gráficos y expórtalo».</p></section>

<section id="h-claude"><h2>✦ Hablar con Claude</h2>
<p>Cuando tocas un botón de Claude se abre una <b>ventana negra</b> aparte. Funciona como un chat:</p>
<ul>
<li><b>Escribe</b> lo que quieras y presiona <kbd>Enter</kbd>. Por ejemplo: «quita la parte donde me trabo», «pon gráficos
  cuando hablo del precio», «¿qué te parece el inicio?».</li>
<li>A veces te pregunta algo con opciones en inglés antes de hacer algo:
  <b>Yes</b> = sí · <b>Yes, and don't ask again</b> = sí y no volver a preguntar · <b>No</b> = no.
  Elige con las flechas <kbd>↑</kbd><kbd>↓</kbd> y <kbd>Enter</kbd>, o presiona el número.</li>
<li>Si se está equivocando, presiona <kbd>Esc</kbd> para detenerlo y explícale de nuevo.</li>
<li>Cuando termine, cierra la ventana con la ✕. <b>Esta app se actualiza sola</b> con lo que hizo.</li>
<li>Claude ya sabe qué video tienes abierto, en qué paso vas y tus notas: no hace falta explicarle.</li>
</ul></section>

<section id="h-estilo"><h2>🎨 Tu estilo</h2>
<p>Claude recuerda cómo te gustan tus videos. Cada vez que le cuentas qué te gustó y qué no, guarda lo importante
para la próxima vez (por ejemplo «subtítulos más grandes» o «empezar directo con lo interesante»).</p>
<p>Todo eso lo ves en <b>🎨 Mi estilo</b> (en la pantalla de tus videos). Ahí también puedes <b>escribir reglas tú</b>,
cambiarlas o borrarlas. Claude las lee antes de editar cada video.</p></section>

<section id="h-glosario"><h2>📖 Palabras raras</h2>
<dl class="gloss">
<dt>Transcribir</dt><dd>Convertir lo que dices en el video a texto, con el momento exacto de cada palabra.</dd>
<dt>Corte</dt><dd>Cada lugar donde se quita un pedazo del video (un silencio, un error, una repetición).</dd>
<dt>Muletillas</dt><dd>«Eh», «mmm», «este»… El botón 🧹 quita las más comunes de un golpe.</dd>
<dt>Subtítulos</dt><dd>El texto de lo que dices, sobre el video. La mayoría ve los Reels sin sonido.</dd>
<dt>Título / gancho</dt><dd>La frase de arriba al inicio, para que la gente se quede a ver.</dd>
<dt>Exportar</dt><dd>Crear el archivo final del video (MP4), listo para subir.</dd>
<dt>Vista previa</dt><dd>Una versión rápida y en baja calidad para revisar. El video final sale nítido.</dd>
<dt>CapCut</dt><dd>Un editor de video. Es opcional: solo si quieres retocar algo a mano.</dd>
</dl></section>

<section id="h-faq"><h2>🙋 Preguntas frecuentes</h2>
<details><summary>¿Se puede dañar mi video original?</summary><p>No. La app siempre trabaja sobre una copia; tu archivo queda igual donde estaba.</p></details>
<details><summary>Grabé mi video en varios pedazos (varios archivos)</summary><p>Al crear el video, en «＋ Elegir video(s)…» elige todos a la vez manteniendo <kbd>Ctrl</kbd> mientras haces clic en cada uno, y ordénalos con ↑ ↓. Si ya creaste el video, entra al paso <b>Importar</b> y toca <b>«＋ Agregar otra parte»</b>. La app y Claude los tratan como un solo video: si repetiste una frase en dos pedazos, Claude se queda con la mejor toma.</p></details>
<details><summary>Tengo un logo, fotos, videos o un texto que tienen que salir (campañas, marcas)</summary><p>En el video, toca <b>🧩 Assets</b> (arriba, o la tarjeta del 🏠 Inicio) <b>antes</b> de editar. Agrega los archivos o escribe el texto exacto (por ejemplo un código de descuento), y en una frase dile cuándo o cómo va: «mi logo en la esquina todo el video», «el código grande al final». Marca <b>«Tiene que salir sí o sí»</b> en lo que no puede faltar. Si es de una marca que se repite, mete el video en una <b>carpeta</b> (la de la campaña) y agrega los assets en la carpeta: así salen en todos sus videos sin volver a subirlos. Claude los usa en la ⚡ edición automática y cuando le hablas.</p></details>
<details><summary>Quiero darle instrucciones a Claude antes de que edite</summary><p>En el 🏠 Inicio del video está el cuadro <b>📝 Instrucciones para Claude</b>: escribe ahí lo que tiene que hacer, como se lo dirías a una persona («cada vez que diga SideShift, resáltalo en los subtítulos y pon el logo»). Si vale para toda la campaña, escríbelo en la carpeta (🧩 Assets e instrucciones de la carpeta) y sirve para todos sus videos. Si pide un logo, súbelo en 🧩 Assets. Al mandar varios videos juntos también aparece un cuadro para eso.</p></details>
<details><summary>Tengo varios videos (de una campaña) y los quiero todos juntos</summary><p>Al crear, en «＋ Nuevo video» elige todos los archivos con <kbd>Ctrl</kbd> y marca <b>«Son videos distintos»</b>: se crea uno por archivo. Mételos en una <b>carpeta</b> (la de la campaña) y agrega ahí sus 🧩 Assets. Después, en «Mis videos», toca <b>⚡ Editar varios a la vez</b>, elige los videos y toca <b>«Editar juntos»</b>. Una sola ventana de Claude los edita con el mismo estilo y los exporta todos al final, así llegan juntos a tu carpeta Descargas.</p></details>
<details><summary>¿Dónde queda el video terminado?</summary><p>En tu carpeta <b>Descargas</b>, con el nombre del video y «.final». También lo puedes ver en el 🏠 Inicio del video.</p></details>
<details><summary>Algo salió mal / apareció un «!» rojo</summary><p>No se perdió nada. Entra a ese paso y toca <b>«🆘 Pedirle ayuda a Claude»</b>: él revisa qué pasó y lo arregla. Luego vuelve a tocar el botón del paso.</p></details>
<details><summary>Me equivoqué al tachar palabras</summary><p>En «Editar por texto», <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshace (las veces que quieras), o selecciona las palabras y toca «↺ Devolver». También puedes guardar versiones y volver a ellas.</p></details>
<details><summary>¿Cuánto tarda?</summary><p>Transcribir: menos de un minuto por cada 5 minutos de video. La edición automática completa: 15 a 40 minutos. La primera vez de todo tarda un poco más porque se descargan cosas.</p></details>
<details><summary>Un paso dice «rehazlo» (amarillo)</summary><p>Cambiaste algo antes (por ejemplo, el corte) y ese paso quedó viejo. Vuelve a tocar su botón para actualizarlo.</p></details>
<details><summary>Quiero usar otra cuenta de Claude (la mía o la de otra persona)</summary><p>En «Mis videos», arriba, toca <b>👤 Cuenta de Claude</b>: ves con qué cuenta trabaja Claude y el botón <b>🔁 Cambiar de cuenta</b> te guía paso a paso. Antes, revisa que no haya ninguna ventana negra de Claude trabajando, y en el navegador cierra la sesión de claude.ai de la otra persona (o usa incógnito). No se pierde nada: los videos, tu estilo, los assets y las instrucciones se quedan en la PC.</p></details>
<details><summary>¿Cuesta dinero usar a Claude?</summary><p>No extra: usa el plan de Claude que ya tienen.</p></details>
<details><summary>La ventana de Claude dice algo que no entiendo</summary><p>Escríbele «no entendí, explícamelo más fácil» y presiona Enter. Siempre responde en español.</p></details>
<details><summary>¿Y si cierro la app mientras trabaja?</summary><p>Lo que esté haciendo la app (por ejemplo transcribir) se detiene; vuelve a tocar el botón del paso. Lo que hace Claude en su ventana sigue aunque cierres la app.</p></details>
</section>`;

// primer uso: recorrido de bienvenida
setTimeout(() => { if (curView === "projects") Tour.auto("inicio"); }, 900);
