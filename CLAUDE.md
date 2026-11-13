# CLAUDE.md — Iconic Studio (la app)

App de escritorio (Python + pywebview, interfaz HTML/CSS/JS en `ui/`) sobre el editor `video-editor`, que vive en
la carpeta de al lado. Habla con el usuario en español sencillo.

## Estructura

- `app.py` — servidor local + ventana. `APP_VERSION` arriba. Se corre con `uv run app.py` (o el .exe instalado).
  Pruebas: `uv run app.py --serve 8765` y abrir http://127.0.0.1:8765/.
- `ui/` — `index.html`, `style.css`, `app.js` son la base; cada archivo encima (`tema.js`, `assets.js`, `lote.js`,
  `instrucciones.js`, `menu.js`, `cuenta.js`, `carpetas.js`, `bienvenida.js`, `arrastrar.js`, `actualizar.js`, `cola.js` (lotes en fila, modo Rápido/Completo, «Todo con Claude» sin transcribir antes, «Detener todo», modelo, avance de Claude desde RUN.md, estilo de carpeta), `comentar.js`, `material.js`, `guiones.js` (campañas con guiones: Claude separa el documento con `claude -p`, un video
  vacío por guion con `state.json → guion`; subir grabaciones de a varias; voz en off por video), `guion.js` (el
  guion de UN video, .docx/.txt o pegado, sin Claude: `set_guion`; «Nuevo video» sin grabación), `espacio.js`
  (opcional: «carpeta de mis videos» en Windows, config `espacio`; una carpeta por campaña con `guiones` y `assets`,
  una por video con `assets`, `voice en off` y `raw vid`; `revisar_espacio` mete lo nuevo y el video terminado queda
  ahí en vez de Descargas; mapa en `projects/_grupos/carpetas.json`), `estilos.js` (looks del título y los
  subtítulos: `ui/estilos/estilos.json` los define y `ui/estilos/subtitulos.py` los dibuja sobre el `build.py` del
  editor, con `uv run`; la app los ROTA por carpeta, historial en `projects/_grupos/estilos-historial.json`,
  `state.json → estilo`; «nativo» = sin gráficos; aviso legal de la carpeta en `aviso-legal.txt`, solo al final; el
  video terminado queda en −14 LUFS / −1 dBTP y se revisa que el título esté en el primer cuadro: `check_final`,
  `final_watch`). Lo que va en `ui/` viaja con la actualización de un clic, por eso los estilos viven ahí),
  `graficos.js` (cuántos gráficos lleva el video: `state.json → graficos` normal/pocos/ninguno; grabaciones de
  pantalla reales = assets con `pantalla`, también desde la subcarpeta `pantallas` de la campaña; versión corta de
  10 a 15 s: Claude solo escribe `studio/corta.json` con los tramos y la app la corta del video terminado con
  ffmpeg, `corta_watch` → `outputs/<job>.corta.mp4`), `minimal.js` + `minimal.css` (solo presentación: las opciones
  del lote como pastillas con «?» y «Más opciones», muestras de cada estilo, animaciones)
  agrega una función envolviendo las de antes, y se cargan en ese orden.
- `construir/` — `lanzador.py` (el .exe de PyInstaller: Python + pywebview, que corre el `app.py` suelto de al lado),
  `instalador.iss` (Inno Setup), `publicar.py`, `editor.json` (local, ver `editor.ejemplo.json`), `mac.sh` (la .app
  y el .dmg de Mac).
- Mac: `MAC` en `app.py` (Terminal en vez de PowerShell, Finder, Papelera, avisos con osascript) y `ui/sistema.js`
  (los textos dicen Finder / Terminal / Mac / ⌘). La .app la compila GitHub en cada release
  (`.github/workflows/mac.yml`); el editor que lleva lo baja de la release «editor», que sube `publicar.py`.
- No se suben (ver `.gitignore`): `config.json`, `prefs.json`, `grupos.json`, `cache/`, `build/`.
- Lo personalizado en la interfaz (apariencia, recorridos vistos, opciones del lote) pasa por `store()` de `app.js`
  y queda en `prefs.json` (llega a la página en `/prefs.js`, se guarda con `/api/prefs`); las actualizaciones no lo tocan.
- Debe funcionar con Python 3.10, 3.11 y 3.12: nada de `\` dentro de las llaves de un f-string.

## Publicar una versión nueva

Cuando el usuario diga «publica una actualización» (o similar):

1. Prueba el cambio (servidor de pruebas + navegador) y compila con 3.10 y 3.12.
2. Pregúntale qué número de versión (sugiere: arreglo = 1.0.**1**, función nueva = 1.**1**.0) y escribe las notas
   en una o dos frases simples, que va a leer la gente al actualizar.
3. `uv run construir/publicar.py <versión> -m "<notas>"` (Bash con el tiempo máximo: compila el .exe y el
   instalador, ~5 min). Añade `--requiere-instalador` solo si cambiaron las librerías de `construir/lanzador.py`
   o lo que empaqueta PyInstaller: entonces las apps instaladas mandan a bajar el instalador nuevo.
4. Las apps instaladas ven la versión al abrirse (o en Ayuda → «Buscar actualizaciones»).

El botón «Actualizar» baja `estudio-app.zip` de la última release, comprueba su `.sha256`, guarda lo de antes en
`cache/anterior/` y reemplaza solo `app.py`, `ui/` y los archivos del programa (nunca ajustes, videos ni el editor).
El editor se actualiza aparte, con su propio `update.py`.
