"""Publica una versión nueva de Iconic Studio en GitHub.

    uv run construir/publicar.py 1.0.1 -m "Qué cambió, en palabras simples"
    uv run construir/publicar.py 1.1.0 -m "…" --requiere-instalador   (si cambiaron las librerías del .exe)
    uv run construir/publicar.py 1.0.1 -m "…" --sin-subir             (arma todo en build/ pero no publica)

Pasos: sube APP_VERSION en app.py · compila «Iconic Studio.exe» (PyInstaller) · arma el editor desde su .zip
original (+ los arreglos de construir/editor.json) · compila el instalador (Inno Setup) · arma estudio-app.zip
(lo que baja el botón «Actualizar») y su .sha256 · commit + etiqueta + push · release en GitHub con los tres archivos.

La app de Mac la compila GitHub solo (.github/workflows/mac.yml) unos 10 minutos después de publicar, y le agrega
el .dmg a la misma release. El editor que lleva adentro lo baja de la release «editor» (video-editor.zip), que este
script vuelve a subir solo cuando el editor cambió.

Las apps ya instaladas ven la versión nueva al abrirse (revisan la última release del repositorio que dice
actualizaciones.json). Con --requiere-instalador no se sube estudio-app.zip y la app manda a bajar el instalador.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import zipfile
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # la carpeta de la app (el repositorio)
BUILD = ROOT / "build"
APP_FILES = ["app.py", "LEEME.md", "icono.ico", "icono.png", "actualizaciones.json"]
ISCC = [Path.home() / "AppData/Local/Programs/Inno Setup 6/ISCC.exe", Path("C:/Program Files (x86)/Inno Setup 6/ISCC.exe")]


def run(*cmd, **kw):
    print("  $", " ".join(str(c) for c in cmd), flush=True)
    return subprocess.run([str(c) for c in cmd], check=True, **kw)


def out(*cmd) -> str:
    return subprocess.run([str(c) for c in cmd], check=True, capture_output=True, text=True).stdout.strip()


def editor_zip(cfg: dict, instalado: Path | None) -> Path:
    """El editor para la app de Mac: el .zip original con los arreglos, con sus permisos (los .sh ejecutables)."""
    dest = BUILD / "video-editor.zip"
    with zipfile.ZipFile(cfg["zip"]) as src, zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for info in src.infolist():
            if not info.filename.startswith("video-editor/"):
                continue
            rel = info.filename[len("video-editor/"):]
            data = src.read(info)
            if instalado and rel in cfg.get("arreglos", []):
                data = (instalado / rel).read_bytes()
            z.writestr(info, data)
    return dest


def subir_editor(repo: str, pkg: Path) -> None:
    """A la release «editor» (no es una versión: no la ven las apps), solo si cambió."""
    sha = hashlib.sha256(pkg.read_bytes()).hexdigest()
    try:
        ahora = out("gh", "release", "download", "editor", "--repo", repo, "-p", "video-editor.zip.sha256", "-O", "-")
    except subprocess.CalledProcessError:
        ahora = None
    if ahora and sha in ahora:
        print("  el editor para Mac no cambió")
        return
    if ahora is None and subprocess.run(["gh", "release", "view", "editor", "--repo", repo], capture_output=True).returncode:
        run("gh", "release", "create", "editor", "--repo", repo, "--title", "Editor (lo usa la app de Mac)",
            "--notes", "El editor que la app de Mac copia la primera vez. No es una versión de la app.",
            "--prerelease", "--latest=false")
    sha_file = BUILD / "video-editor.zip.sha256"
    sha_file.write_text(f"{sha}  video-editor.zip\n", encoding="utf-8")
    run("gh", "release", "upload", "editor", "--repo", repo, "--clobber", pkg, sha_file)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("version")
    ap.add_argument("-m", "--notas", required=True)
    ap.add_argument("--requiere-instalador", action="store_true")
    ap.add_argument("--sin-subir", action="store_true")
    a = ap.parse_args()
    if not re.fullmatch(r"\d+\.\d+\.\d+", a.version):
        sys.exit("la versión va como 1.2.3")
    cfg = json.loads((ROOT / "construir" / "editor.json").read_text(encoding="utf-8"))  # ver editor.ejemplo.json

    print("▸ versión", a.version)
    app_py = ROOT / "app.py"
    src = app_py.read_text(encoding="utf-8")
    src = re.sub(r'^APP_VERSION = "[^"]*"', f'APP_VERSION = "{a.version}"', src, count=1, flags=re.M)
    app_py.write_text(src, encoding="utf-8")
    repo = cfg.get("repo") or ("" if a.sin_subir else out("gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"))
    (ROOT / "actualizaciones.json").write_text(json.dumps({"repo": repo}, indent=2) + "\n", encoding="utf-8")

    shutil.rmtree(BUILD, ignore_errors=True)
    app_dir = BUILD / "app"
    print("▸ compilando Iconic Studio.exe")
    before = (date.today() - timedelta(days=14)).isoformat()  # librerías con al menos dos semanas, como el editor
    run("uv", "run", "--no-project", "--python", "3.12", "--exclude-newer", before, "--with", "pyinstaller",
        "--with", "pywebview>=5,<7", "pyinstaller", "--noconfirm", "--clean", "--windowed", "--name", "Iconic Studio",
        "--icon", ROOT / "icono.ico", "--distpath", BUILD / "dist", "--workpath", BUILD / "work",
        "--specpath", BUILD, ROOT / "construir" / "lanzador.py", stdout=subprocess.DEVNULL)
    shutil.copytree(BUILD / "dist" / "Iconic Studio", app_dir)
    for f in APP_FILES:
        shutil.copy2(ROOT / f, app_dir / f)
    shutil.copytree(ROOT / "ui", app_dir / "ui")

    print("▸ armando el editor desde", cfg["zip"])
    ed = BUILD / "video-editor"
    with zipfile.ZipFile(cfg["zip"]) as z:
        for info in z.infolist():
            if info.filename.startswith("video-editor/") and not info.is_dir():
                dest = BUILD / info.filename
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(z.read(info))
    # el editor con los arreglos propios: la primera de las rutas que exista (puede haberse mudado de carpeta)
    sitios = cfg["editor_instalado"] if isinstance(cfg["editor_instalado"], list) else [cfg["editor_instalado"]]
    instalado = next((Path(s) for s in sitios if (Path(s) / "CLAUDE.md").exists()), None)
    for rel in cfg.get("arreglos", []):
        if instalado:
            shutil.copy2(instalado / rel, ed / rel)
        else:
            print(f"  ⚠ no encuentro el editor instalado: {rel} va sin el arreglo")

    print("▸ armando el editor para la app de Mac")
    ed_zip = editor_zip(cfg, instalado)

    print("▸ compilando el instalador")
    iscc = next((p for p in ISCC if p.exists()), None) or sys.exit("falta Inno Setup (winget install JRSoftware.InnoSetup)")
    run(iscc, "/Q", f"/DMyVersion={a.version}", f"/DBuild={BUILD}", f"/O{BUILD}", ROOT / "construir" / "instalador.iss")
    installer = BUILD / f"Instalar Iconic Studio {a.version}.exe"

    assets = [installer]
    if not a.requiere_instalador:
        print("▸ armando estudio-app.zip (la actualización de un clic)")
        pkg = BUILD / "estudio-app.zip"
        with zipfile.ZipFile(pkg, "w", zipfile.ZIP_DEFLATED) as z:
            for f in APP_FILES:
                z.write(ROOT / f, f)
            for f in sorted((ROOT / "ui").rglob("*")):
                if f.is_file():
                    z.write(f, f.relative_to(ROOT).as_posix())
        sha = BUILD / "estudio-app.zip.sha256"
        sha.write_text(hashlib.sha256(pkg.read_bytes()).hexdigest() + "  estudio-app.zip\n", encoding="utf-8")
        assets += [pkg, sha]

    if a.sin_subir:
        print("▸ listo, sin publicar:", *assets, sep="\n   ")
        return
    print("▸ subiendo el editor para la app de Mac")
    subir_editor(repo, ed_zip)
    print("▸ publicando en GitHub:", repo)
    run("git", "-C", ROOT, "add", "-A")
    run("git", "-C", ROOT, "commit", "-m", f"Versión {a.version}: {a.notas}")
    run("git", "-C", ROOT, "tag", f"v{a.version}")
    run("git", "-C", ROOT, "push", "origin", "HEAD", "--tags")
    run("gh", "release", "create", f"v{a.version}", "--repo", repo, "--title", f"Iconic Studio {a.version}",
        "--notes", a.notas, *assets)
    print(f"✓ publicada la versión {a.version}: las apps instaladas la verán al abrirse")
    print("  la de Mac (.dmg) la compila GitHub y aparece en la misma versión en unos 10 minutos")


main()
