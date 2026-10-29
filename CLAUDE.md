# CLAUDE.md — Iconic Studio (la app)

App de escritorio (Python + pywebview, interfaz HTML/CSS/JS en `ui/`) sobre el editor `video-editor`, que vive en
la carpeta de al lado. Habla con el usuario en español sencillo.

## Estructura

- `app.py` — servidor local + ventana. `APP_VERSION` arriba. Se corre con `uv run app.py` (o el .exe instalado).
  Pruebas: `uv run app.py --serve 8765` y abrir http://127.0.0.1:8765/.
- `ui/` — `index.html`, `style.css`, `app.js` son la base; cada archivo encima (`tema.js`, `assets.js`, `lote.js`,
  `instrucciones.js`, `menu.js`, `cuenta.js`, `carpetas.js`, `bienvenida.js`, `arrastrar.js`, `actualizar.js`, `cola.js` (lotes en fila, modo Rápido/Completo, modelo, avance de Claude desde RUN.md, estilo de carpeta), `comentar.js`, `material.js`)
  agrega una función envolviendo las de antes, y se cargan en ese orden.
- `construir/` — `lanzador.py` (el .exe de PyInstaller: Python + pywebview, que corre el `app.py` suelto de al lado),
  `instalador.iss` (Inno Setup), `publicar.py`, `editor.json` (local, ver `editor.ejemplo.json`).
- No se suben (ver `.gitignore`): `config.json`, `grupos.json`, `cache/`, `build/`.
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
