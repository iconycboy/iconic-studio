#!/bin/bash
# Arma «Iconic Studio.app» y su instalador .dmg. Necesita una Mac (Apple Silicon): GitHub lo corre solo en cada versión
# publicada (.github/workflows/mac.yml) y sube el .dmg a esa misma versión, así que desde Windows no hace falta nada.
#
#   bash construir/mac.sh v1.3.0
#
# La .app es el lanzador de PyInstaller (Python + pywebview) con app.py y ui/ en Contents/Resources/estudio y el editor
# en Contents/Resources/video-editor.zip (lo sube publicar.py a la release «editor»). Al abrirse los copia a
# ~/EditorDeVideo (ver construir/lanzador.py). Va firmada «ad hoc», sin cuenta de Apple Developer: la primera vez,
# macOS pide permitirla en Ajustes → Privacidad y seguridad → «Abrir igualmente» (lo explica LEEME.md).
set -euo pipefail
TAG="${1:?falta la versión, por ejemplo v1.3.0}"
V="${TAG#v}"
cd "$(dirname "$0")/.."
ROOT="$PWD"
REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
B="$ROOT/build"
rm -rf "$B" && mkdir -p "$B"

echo "▸ compilando Iconic Studio.app"
BEFORE=$(date -v-14d +%F)  # librerías con al menos dos semanas, como en Windows
uv run --no-project --python 3.12 --exclude-newer "$BEFORE" --with pyinstaller --with "pywebview>=5,<7" --with pillow \
  pyinstaller --noconfirm --clean --windowed --name "Iconic Studio" --icon "$ROOT/icono.png" \
  --osx-bundle-identifier io.github.iconycboy.iconicstudio \
  --distpath "$B/dist" --workpath "$B/work" --specpath "$B" "$ROOT/construir/lanzador.py" >/dev/null
APP="$B/dist/Iconic Studio.app"
RES="$APP/Contents/Resources"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $V" "$APP/Contents/Info.plist"

echo "▸ metiendo la app y el editor"
mkdir -p "$RES/estudio"
cp app.py LEEME.md icono.ico icono.png actualizaciones.json "$RES/estudio/"
cp -R ui "$RES/estudio/ui"
gh release download editor --repo "$REPO" -p video-editor.zip -p video-editor.zip.sha256 -D "$B"
(cd "$B" && tr -d '\r' < video-editor.zip.sha256 | shasum -a 256 -c)
mv "$B/video-editor.zip" "$RES/video-editor.zip"

echo "▸ firmando (ad hoc)"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"

echo "▸ armando el .dmg"
DMG_DIR="$B/dmg"
mkdir -p "$DMG_DIR"
ditto "$APP" "$DMG_DIR/Iconic Studio.app"
ln -s /Applications "$DMG_DIR/Aplicaciones"
OUT="$B/Instalar Iconic Studio $V (Mac).dmg"
hdiutil create -volname "Iconic Studio" -srcfolder "$DMG_DIR" -ov -format UDZO "$OUT" >/dev/null
echo "✓ $OUT"
