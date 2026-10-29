"""Iconic Studio.exe (y Iconic Studio.app en Mac) — el Python y las librerías de la app (pywebview) empaquetados con
PyInstaller.

El programa en sí es app.py, que va suelto junto al .exe (con ui/): así una actualización solo cambia esos archivos
y no hace falta un .exe nuevo. Solo se compila otro .exe si cambian las librerías.

En Mac no se toca nada dentro de la .app (se rompería su firma): la .app trae app.py, ui/ y el editor en
Contents/Resources (el editor en un .zip) y, al abrirse, los copia a ~/EditorDeVideo/estudio y ~/EditorDeVideo/video-editor (la misma
carpeta que en Windows). El editor solo si no estaba; la app si no estaba o si la .app trae una versión más nueva.
Las actualizaciones de un clic cambian los archivos de ~/EditorDeVideo/estudio.
"""
# Lo que usa app.py: PyInstaller solo empaqueta los módulos que ve importados aquí.
import datetime  # noqa: F401
import hashlib  # noqa: F401
import http.server  # noqa: F401
import io  # noqa: F401
import json  # noqa: F401
import mimetypes  # noqa: F401
import os  # noqa: F401
import re
import runpy
import shutil
import ssl  # noqa: F401
import subprocess
import sys
import threading  # noqa: F401
import time  # noqa: F401
import unicodedata  # noqa: F401
import urllib.parse  # noqa: F401
import urllib.request  # noqa: F401
import webbrowser  # noqa: F401
import zipfile  # noqa: F401
from pathlib import Path

import webview  # noqa: F401
import webview.dom  # noqa: F401

MAC = sys.platform == "darwin"


def aviso(texto: str) -> None:
    """Una ventanita de error (no hay consola donde escribirlo)."""
    if MAC:
        subprocess.run(["osascript", "-e", "on run argv", "-e",
                        'display alert "Iconic Studio" message (item 1 of argv) as critical', "-e", "end run", texto])
    else:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, texto, "Iconic Studio", 0x10)


def version(app_py: Path) -> tuple:
    m = re.search(r'^APP_VERSION = "([^"]*)"', app_py.read_text(encoding="utf-8"), re.M) if app_py.exists() else None
    return tuple(int(x) for x in re.findall(r"\d+", m.group(1))[:3]) if m else (0,)


def instalar_mac() -> Path:
    """Copia la app y el editor de dentro de la .app a ~/EditorDeVideo (ver arriba) y devuelve la carpeta de la app."""
    res = Path(sys.executable).resolve().parents[1] / "Resources"
    home = Path.home() / "EditorDeVideo"
    base = home / "estudio"
    nueva = res / "estudio"
    if nueva.is_dir() and version(nueva / "app.py") > version(base / "app.py"):
        base.mkdir(parents=True, exist_ok=True)
        shutil.rmtree(base / "ui", ignore_errors=True)  # la ui entera, así no quedan archivos viejos
        for f in nueva.iterdir():
            if f.is_dir():
                shutil.copytree(f, base / f.name, dirs_exist_ok=True)
            else:
                shutil.copy2(f, base / f.name)
    editor = res / "video-editor.zip"  # va comprimido: suelto, sus archivos romperían la firma de la .app
    if editor.exists() and not (home / "video-editor" / "CLAUDE.md").exists():
        tmp = home / ".video-editor-copiando"  # si se corta a la mitad, la próxima vez empieza de nuevo
        shutil.rmtree(tmp, ignore_errors=True)
        subprocess.run(["/usr/bin/ditto", "-x", "-k", str(editor), str(tmp)], check=True)  # ditto respeta los permisos
        shutil.rmtree(home / "video-editor", ignore_errors=True)
        (tmp / "video-editor").rename(home / "video-editor")
        shutil.rmtree(tmp, ignore_errors=True)
    return base


if MAC and getattr(sys, "frozen", False):
    try:
        base = instalar_mac()
    except (OSError, subprocess.CalledProcessError) as e:
        aviso(f"No pude preparar la carpeta EditorDeVideo en tu carpeta personal.\n{e}")
        sys.exit(1)
else:
    base = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent
app = base / "app.py"
if not app.exists():
    aviso(f"No encuentro app.py junto al programa ({base}).\nVuelve a instalar Iconic Studio.")
    sys.exit(1)
sys.argv[0] = str(app)
# sin consola (el .exe va sin ventana negra) no hay dónde escribir: lo que se imprima va a un registro, y si algo
# falla al abrir, el error queda ahí y se avisa con una ventanita en vez de cerrarse sin decir nada
log = base / "cache" / "registro.txt"
if sys.stdout is None or sys.stderr is None or (MAC and getattr(sys, "frozen", False)):  # la .app tampoco tiene consola
    log.parent.mkdir(exist_ok=True)
    sys.stdout = sys.stderr = open(log, "a", encoding="utf-8", buffering=1)  # noqa: SIM115
try:
    runpy.run_path(str(app), run_name="__main__")
except SystemExit:
    raise
except BaseException:
    import traceback
    traceback.print_exc()
    aviso(f"Iconic Studio no pudo abrir.\nEl detalle quedó en:\n{log}")
    sys.exit(1)
