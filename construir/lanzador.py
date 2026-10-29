"""Iconic Studio.exe — el Python y las librerías de la app (pywebview) empaquetados con PyInstaller.

El programa en sí es app.py, que va suelto junto al .exe (con ui/): así una actualización solo cambia esos archivos
y no hace falta un .exe nuevo. Solo se compila otro .exe si cambian las librerías.
"""
# Lo que usa app.py: PyInstaller solo empaqueta los módulos que ve importados aquí.
import datetime  # noqa: F401
import hashlib  # noqa: F401
import http.server  # noqa: F401
import io  # noqa: F401
import json  # noqa: F401
import mimetypes  # noqa: F401
import os  # noqa: F401
import re  # noqa: F401
import runpy
import shutil  # noqa: F401
import ssl  # noqa: F401
import subprocess  # noqa: F401
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

base = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent
app = base / "app.py"
if not app.exists():
    import ctypes
    ctypes.windll.user32.MessageBoxW(0, f"No encuentro app.py junto al programa ({base}).\nVuelve a instalar Iconic Studio.",
                                     "Iconic Studio", 0x10)
    sys.exit(1)
sys.argv[0] = str(app)
# sin consola (el .exe va sin ventana negra) no hay dónde escribir: lo que se imprima va a un registro, y si algo
# falla al abrir, el error queda ahí y se avisa con una ventanita en vez de cerrarse sin decir nada
log = base / "cache" / "registro.txt"
if sys.stdout is None or sys.stderr is None:
    log.parent.mkdir(exist_ok=True)
    sys.stdout = sys.stderr = open(log, "a", encoding="utf-8", buffering=1)  # noqa: SIM115
try:
    runpy.run_path(str(app), run_name="__main__")
except SystemExit:
    raise
except BaseException:
    import ctypes
    import traceback
    traceback.print_exc()
    ctypes.windll.user32.MessageBoxW(0, f"Iconic Studio no pudo abrir.\nEl detalle quedó en:\n{log}",
                                     "Iconic Studio", 0x10)
    sys.exit(1)
