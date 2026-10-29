#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = [
#   "pywebview>=5,<7",
# ]
# [tool.uv]
# exclude-newer = "14 days"
# ///
"""Iconic Studio — app de escritorio sobre el editor video-editor.

Cada paso llama a las mismas herramientas del editor (transcribe.sh, splice.sh,
polish-boundaries.py, normalize-sections.sh, capcut-bridge.py). El estado propio de
la app vive en projects/<job>/studio/, que ninguna actualización del editor toca.

    uv run app.py              abre la ventana
    uv run app.py --browser    la abre en el navegador (si la ventana falla)
"""
from __future__ import annotations

import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import unicodedata
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

APP_VERSION = "1.4.0"  # publicar.py la sube en cada versión nueva
APP_DIR = Path(__file__).resolve().parent
UI_DIR = APP_DIR / "ui"
CONFIG_FILE = APP_DIR / "config.json"
APP_PORT = 47821  # fijo a propósito: ver main()
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".m4v"}
MAC = sys.platform == "darwin"
if MAC:
    # una app de Mac abierta desde el Finder no ve el PATH de la Terminal: sin esto no encuentra ffmpeg, uv ni claude
    MAC_PATH = os.pathsep.join([str(Path.home() / ".local" / "bin"), "/opt/homebrew/bin", "/usr/local/bin"])
    os.environ["PATH"] = MAC_PATH + os.pathsep + os.environ.get("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")

# Pasos en orden. "auto" = la app lo lanza sola al importar.
STEPS = ["importar", "transcribir", "editar", "cortar", "audio", "subtitulos", "capcut", "exportar"]
MEDIA = {"proxy.mp4", "thumb.jpg", "preview-corte.mp4", "preview-subs.mp4"}
SUBS_BUILDER = "presets/tiktok/raw/build.py"

# --------------------------------------------------------------------------- config


def load_config() -> dict:
    cfg = {}
    if CONFIG_FILE.exists():
        cfg = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    if not cfg.get("editor") or not (Path(cfg["editor"]) / "CLAUDE.md").exists():
        # el editor va junto a la app (así viene en el .zip para compartir); si no, donde se descargó
        for guess in (APP_DIR.parent / "video-editor", APP_DIR / "video-editor",
                      Path.home() / "Downloads" / "video-editor", *Path.home().glob("Downloads/*/video-editor")):
            if (guess / "CLAUDE.md").exists():
                cfg["editor"] = str(guess)
                break
        else:
            cfg["editor"] = str(APP_DIR.parent / "video-editor")
    cfg.setdefault("git_bash", "/bin/bash" if MAC else r"C:\Program Files\Git\bin\bash.exe")
    if MAC and not Path(cfg["git_bash"]).exists():
        cfg["git_bash"] = "/bin/bash"
    cfg.setdefault("idioma", "es")
    cfg.setdefault("usuario", "")  # la app lo pregunta la primera vez
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    return cfg


CFG = load_config()
EDITOR = Path(CFG["editor"])
PROJECTS = EDITOR / "projects"
BASH = CFG["git_bash"]
USUARIO = CFG["usuario"]
RULES = EDITOR / "my-rules.md"
RULES_HEAD = "Write your rules below, one per line."  # lo de arriba es la explicación del editor, no reglas


def to_posix(p: Path | str) -> str:
    """C:\\a\\b -> /c/a/b, para pasar rutas a Git Bash."""
    s = str(p).replace("\\", "/")
    m = re.match(r"^([A-Za-z]):/(.*)$", s)
    return f"/{m.group(1).lower()}/{m.group(2)}" if m else s


def bash_tmp() -> Path:
    """El /tmp de Git Bash como ruta de Windows (splice.sh lee /tmp/video-editor/<job>/cuts.json)."""
    if os.name != "nt":
        return Path("/tmp")
    out = subprocess.run([BASH, "-c", "cygpath -w /tmp"], capture_output=True, text=True,
                         creationflags=NO_WINDOW)
    return Path(out.stdout.strip())


NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

# --------------------------------------------------------------------------- proyectos


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:40] or "proyecto"


def job_dir(job: str) -> Path:
    d = (PROJECTS / job).resolve()
    if d.parent != PROJECTS.resolve() or job.startswith(("_", ".")):
        raise ValueError("proyecto no válido")
    return d


def studio_dir(job: str) -> Path:
    d = job_dir(job) / "studio"
    d.mkdir(parents=True, exist_ok=True)
    return d


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def partes(job: str) -> list[Path]:
    """Los archivos del video en su orden. El orden lo da el número con que la app copia cada parte (01-, 02-…);
    un archivo que llegó de otro modo (Claude, a mano) va al final. transcribe.sh no garantiza este orden."""
    raw = job_dir(job) / "raw"
    clips = [p for p in raw.glob("*") if p.suffix.lower() in VIDEO_EXT] if raw.exists() else []
    def key(p):  # sin número (proyectos de antes) = la primera parte
        m = re.match(r"^(\d{2})-", p.name)
        return (int(m.group(1)) if m else 0, p.name.lower())
    return sorted(clips, key=key)


def raw_clip(job: str) -> Path | None:
    clips = partes(job)
    return clips[0] if clips else None


def offsets(job: str) -> dict[str, float]:
    """Dónde empieza cada parte en la vista previa unida (segundos), según la última vista previa armada."""
    return {k: v["offset"] for k, v in read_json(studio_dir(job) / "partes.json", {}).items()}


def copy_parts(t: "Task", job: str, sources: list[str]) -> int:
    """Copia (nunca mueve) cada archivo a raw/ con su número de orden delante."""
    raw = job_dir(job) / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    n = len(partes(job))
    for src in sources:
        n += 1
        s = Path(src)
        name = f"{n:02d}-{re.sub(r'[^A-Za-z0-9._-]+', '_', s.stem)[:50]}{s.suffix.lower()}"
        t.say(f"▸ copiando la parte {n}: {s.name} (el original no se toca)…")
        shutil.copy2(s, raw / name)
    t.say("  ✓ copiado")
    return 0


def check_sources(sources: list[str]) -> list[str]:
    out = [str(Path(s.strip().strip('"'))) for s in sources if s and s.strip()]
    if not out:
        raise ValueError("elige al menos un video")
    for s in out:
        p = Path(s)
        if not p.is_file() or p.suffix.lower() not in VIDEO_EXT:
            raise ValueError(f"«{p.name}» no es un video .mp4, .mov, .mkv o .m4v")
    return out


def state_of(job: str) -> dict:
    st = read_json(studio_dir(job) / "state.json", {})
    st.setdefault("titulo", job)
    st.setdefault("idioma", CFG["idioma"])
    st.setdefault("notas", "")
    st.setdefault("creado", "")
    st.setdefault("pasos", {})
    st.setdefault("subtitulos", {"activos": True, "gancho": ""})
    return st


def subs_alpha(job: str) -> Path:
    return job_dir(job) / "hf-graphics" / "captions" / "renders" / "captions-alpha.mov"


def subs_on(job: str) -> bool:
    return state_of(job)["subtitulos"].get("activos", True) and subs_alpha(job).exists()


def save_state(job: str, st: dict) -> None:
    write_json(studio_dir(job) / "state.json", st)


def mark(job: str, step: str, estado: str) -> None:
    st = state_of(job)
    st["pasos"][step] = {"estado": estado, "fecha": datetime.now().isoformat(timespec="seconds")}
    # rehacer la transcripción, la edición o el corte deja obsoletos los pasos que salen de ellos
    if estado == "hecho" and step in ("importar", "transcribir", "editar", "cortar"):
        for later in STEPS[STEPS.index(step) + 1:]:
            if later in st["pasos"] and st["pasos"][later].get("estado") == "hecho":
                st["pasos"][later]["estado"] = "desactualizado"
    save_state(job, st)


def step_status(job: str) -> dict:
    """Estado de cada paso: lo guardado por la app, comprobado contra los archivos reales."""
    d = job_dir(job)
    st = state_of(job)
    saved = {k: v.get("estado") for k, v in st["pasos"].items()}
    files = {
        "importar": raw_clip(job) is not None,
        "transcribir": (d / "transcript" / "words.json").exists(),
        "editar": (d / "studio" / "edits.json").exists(),
        "cortar": (d / "transcript" / "cuts.json").exists(),
        "audio": (d / "audio-normalized").exists() and any((d / "audio-normalized").iterdir()),
        "subtitulos": subs_alpha(job).exists() or saved.get("subtitulos") == "hecho",
        "capcut": saved.get("capcut") == "hecho",
        "exportar": (d / "outputs" / f"{job}.final.mp4").exists(),
    }
    out = {}
    for s in STEPS:
        if TASK.running and TASK.job == job and TASK.step == s:
            out[s] = "trabajando"
        elif saved.get(s) in ("error", "desactualizado"):
            out[s] = saved[s]
        else:
            out[s] = "hecho" if files[s] else "pendiente"
    return out


def project_summary(job: str) -> dict:
    st = state_of(job)
    status = step_status(job)
    done = sum(1 for s in STEPS if status[s] == "hecho")
    thumb = studio_dir(job) / "thumb.jpg"
    final = job_dir(job) / "outputs" / f"{job}.final.mp4"

    def media(name):
        p = studio_dir(job) / name
        return f"/media/{job}/{name}?v={int(p.stat().st_mtime)}" if p.exists() else None

    return {
        "subtitulos": st["subtitulos"],
        "preview_corte": media("preview-corte.mp4"),
        "preview_subs": media("preview-subs.mp4"),
        "job": job,
        "titulo": st["titulo"],
        "idioma": st["idioma"],
        "notas": st["notas"],
        "creado": st["creado"],
        "pasos": status,
        "progreso": round(100 * done / len(STEPS)),
        "thumb": f"/media/{job}/thumb.jpg?v={int(thumb.stat().st_mtime)}" if thumb.exists() else None,
        "proxy": media("proxy.mp4"),
        "partes": [{"nombre": re.sub(r"^\d{2}-", "", p.name), "archivo": p.name,
                    "dur": read_json(studio_dir(job) / "partes.json", {}).get(p.name, {}).get("dur")} for p in partes(job)],
        "final": final.exists(),
        "final_url": f"/media/{job}/final.mp4?v={int(final.stat().st_mtime)}" if final.exists() else None,
        "grupo": st.get("grupo", ""),
        "assets": len(read_assets("video", job)),
        "lote": st.get("lote"),
        "instrucciones": st.get("instrucciones", ""),
        "duracion": video_duration(job),
        "estimado": estimates(job),
    }


def list_projects() -> list[dict]:
    if not PROJECTS.exists():
        return []
    jobs = [p.name for p in PROJECTS.iterdir() if p.is_dir() and not p.name.startswith(("_", "."))]
    items = [project_summary(j) for j in jobs]
    items.sort(key=lambda x: x["creado"], reverse=True)
    return items


# las carpetas viven junto a los videos (en el editor), no en la app: así cualquier copia de la app las ve igual
GROUPS_FILE = PROJECTS / "_grupos" / "grupos.json"
_OLD_GROUPS = APP_DIR / "grupos.json"  # donde estaban hasta la 1.0.1
if not GROUPS_FILE.exists() and _OLD_GROUPS.exists() and PROJECTS.exists():
    GROUPS_FILE.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(_OLD_GROUPS, GROUPS_FILE)


def read_groups() -> list[dict]:
    return read_json(GROUPS_FILE, [])


# --------------------------------------------------------------------------- assets
# Lo que tiene que salir en un video (logo, fotos o videos del producto, un texto o código exacto…).
# Los de un video viven en projects/<job>/assets/mis-assets/; los de un grupo (marca, campaña) en
# projects/_grupos/<id>/ y valen para todos sus videos. Cada carpeta lleva assets.json (la app) y
# ASSETS.md (lo que lee Claude). La app no los coloca: los usa Claude al editar.

ASSET_KIND = {**{e: "video" for e in VIDEO_EXT},
              **{e: "imagen" for e in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".heic")},
              **{e: "audio" for e in (".mp3", ".wav", ".m4a", ".aac", ".ogg")},
              **{e: "fuente" for e in (".ttf", ".otf")}, ".pdf": "documento"}
ASSET_SCOPES = ("video", "grupo", "material")
# material propio: imágenes y sonidos ya hechos que Claude usa en vez de generarlos (opcional), para todos los videos
MATERIAL = {"imagenes": {"imagen", "video"}, "sonidos": {"audio"}}
STYLE_FILE = "ESTILO.md"  # el estilo aprendido de una carpeta (lo escribe Claude)


def assets_dir(scope: str, ident: str) -> Path:
    if scope == "video":
        return job_dir(ident) / "assets" / "mis-assets"
    if scope == "grupo" and re.fullmatch(r"[a-z0-9-]{1,60}", ident):
        return PROJECTS / "_grupos" / ident
    if scope == "material" and ident in MATERIAL:
        return PROJECTS / "_material" / ident
    raise ValueError("assets no válidos")


def read_assets(scope: str, ident: str) -> list[dict]:
    d = assets_dir(scope, ident)
    return [a for a in read_json(d / "assets.json", []) if a.get("tipo") == "texto" or (d / a.get("archivo", "")).is_file()]


def group_name(gid: str) -> str:
    return next((g["nombre"] for g in read_groups() if g.get("id") == gid), gid)


def save_assets(scope: str, ident: str, items: list[dict]) -> list[dict]:
    """Guarda la lista (orden, notas, obligatorio); borra las copias de archivos que se quitaron de ella."""
    d = assets_dir(scope, ident)
    d.mkdir(parents=True, exist_ok=True)
    clean = []
    for a in items:
        tipo = str(a.get("tipo", ""))
        item = {"id": str(a.get("id") or os.urandom(4).hex())[:16], "tipo": tipo,
                "uso": str(a.get("uso", "")).strip()[:600], "obligatorio": bool(a.get("obligatorio", True))}
        if tipo == "texto":
            item["texto"] = str(a.get("texto", "")).strip()[:2000]
            if not item["texto"]:
                continue
        else:
            name = Path(str(a.get("archivo", ""))).name
            if not (d / name).is_file():
                continue
            item["archivo"] = name
            item["nombre"] = str(a.get("nombre") or name)[:120]
        clean.append(item)
    keep = {a["archivo"] for a in clean if "archivo" in a} | {"assets.json", "ASSETS.md", "instrucciones.md", STYLE_FILE}
    for f in d.iterdir():
        if f.is_file() and f.name not in keep:
            f.unlink()  # es la copia de la app; el archivo original sigue donde estaba
    write_json(d / "assets.json", clean)
    (d / "ASSETS.md").write_text(assets_md(scope, ident, clean), encoding="utf-8")
    return clean


def add_asset_files(scope: str, ident: str, sources: list[str]) -> list[dict]:
    d = assets_dir(scope, ident)
    d.mkdir(parents=True, exist_ok=True)
    items = read_assets(scope, ident)
    for src in sources:
        s = Path(str(src).strip().strip('"'))
        if not s.is_file():
            raise ValueError(f"no encuentro «{s.name}»")
        kind = ASSET_KIND.get(s.suffix.lower())
        if not kind:
            raise ValueError(f"«{s.name}» no es una foto, video, audio, tipografía o PDF")
        if scope == "material" and kind not in MATERIAL[ident]:
            raise ValueError(f"«{s.name}» no va aquí: " + ("solo imágenes (o videos cortos)" if ident == "imagenes" else "solo sonidos"))
        name, n = re.sub(r"[^A-Za-z0-9._-]+", "_", s.stem)[:50] + s.suffix.lower(), 2
        while (d / name).exists():
            name, n = f"{re.sub(r'[^A-Za-z0-9._-]+', '_', s.stem)[:50]}-{n}{s.suffix.lower()}", n + 1
        shutil.copy2(s, d / name)  # copiar, nunca mover
        items.append({"tipo": kind, "archivo": name, "nombre": s.name, "uso": "", "obligatorio": scope != "material"})
    return save_assets(scope, ident, items)


def assets_lines(scope: str, ident: str, items: list[dict]) -> list[str]:
    rel = assets_dir(scope, ident).relative_to(EDITOR).as_posix()
    out = []
    for a in items:
        tag = "OBLIGATORIO" if a.get("obligatorio", True) else "opcional"
        what = (f"texto exacto «{a['texto']}»" if a["tipo"] == "texto" else f"{a['tipo']} {rel}/{a['archivo']}")
        out.append(f"- [{tag}] {what}. Cómo usarlo: {a.get('uso') or '(sin indicación: elige tú el mejor momento)'}")
    return out


def assets_md(scope: str, ident: str, items: list[dict]) -> str:
    if scope == "material":
        rel = assets_dir(scope, ident).relative_to(EDITOR).as_posix()
        kind = "imágenes" if ident == "imagenes" else "sonidos"
        lines = [f"- {rel}/{a['archivo']}: {a.get('uso') or a.get('nombre') or '(sin descripción)'}" for a in items]
        return (f"# Material propio de {USUARIO}: {kind}\n\n"
                "Ya hecho, para usar EN VEZ de generarlo o buscarlo (opcional: solo lo que encaje). Cada uno con lo que es:\n\n"
                + "\n".join(lines) + "\n")
    title = f"grupo «{group_name(ident)}» (valen para todos sus videos)" if scope == "grupo" else f"el video {ident}"
    instr = read_instr(scope, ident)
    return (f"# Assets de {title}\n\nLos eligió {USUARIO} en la app Iconic Studio. "
            "Los OBLIGATORIOS tienen que salir en el video final como dice su nota; los textos van tal cual.\n\n"
            + "\n".join(assets_lines(scope, ident, items)) + "\n"
            + (f"\n## Instrucciones de {USUARIO} para editar\n\n{instr}\n" if instr else ""))


# Instrucciones previas para Claude: las de un video van en su state.json; las de un grupo, en su carpeta
# de assets (instrucciones.md), y valen para todos sus videos. Las dos salen también en ASSETS.md.

def read_instr(scope: str, ident: str) -> str:
    if scope == "video":
        return str(state_of(ident).get("instrucciones", "")).strip()
    p = assets_dir(scope, ident) / "instrucciones.md"
    return p.read_text(encoding="utf-8").strip() if p.exists() else ""


def save_instr(scope: str, ident: str, texto: str) -> str:
    texto = str(texto).strip()[:4000]
    if scope == "video":
        st = state_of(ident)
        st["instrucciones"] = texto
        save_state(ident, st)
    d = assets_dir(scope, ident)
    d.mkdir(parents=True, exist_ok=True)
    if scope == "grupo":
        (d / "instrucciones.md").write_text(texto, encoding="utf-8")
    (d / "ASSETS.md").write_text(assets_md(scope, ident, read_assets(scope, ident)), encoding="utf-8")
    return texto


def instr_for_claude(jobs: list[str], extra: str = "") -> str:
    """Las instrucciones previas de quien usa la app (grupo, cada video y las de este pedido), para lo que se le manda a Claude."""
    parts = []
    for g in dict.fromkeys(state_of(j).get("grupo", "") for j in jobs):
        t = read_instr("grupo", g) if g else ""
        if t:
            parts.append(f"Para todos los videos del grupo «{group_name(g)}»:\n{t}")
    for j in jobs:
        t = read_instr("video", j)
        if t:
            parts.append((f"Solo para el video {j}" if len(jobs) > 1 else "Para este video") + f":\n{t}")
    if extra.strip():
        parts.append(f"Para {'estos videos' if len(jobs) > 1 else 'esta edición'}:\n{extra.strip()}")
    if not parts:
        return ""
    return (f"INSTRUCCIONES DE {USUARIO.upper()} PARA EDITAR (síguelas al pie de la letra; mandan sobre el estilo por "
            "defecto y sobre los presets bloqueados, como dice my-rules.md: por ejemplo, resaltar una palabra en los "
            "subtítulos o poner un logo cada vez que se dice algo. Si algo no se puede hacer, díselo antes de empezar):\n"
            + "\n\n".join(parts) + "\n")


def assets_for_claude(job: str) -> str:
    """El bloque de assets que va en lo que la app le manda a Claude (vacío si no hay)."""
    mine = read_assets("video", job)
    gid = state_of(job).get("grupo", "")
    theirs = read_assets("grupo", gid) if gid else []
    if not mine and not theirs:
        return ""
    txt = f"ASSETS que {USUARIO} dio y que se usan en este video:\n"
    if mine:
        txt += "De este video:\n" + "\n".join(assets_lines("video", job, mine)) + "\n"
    if theirs:
        txt += f"De su grupo «{group_name(gid)}» (marca o campaña):\n" + "\n".join(assets_lines("grupo", gid, theirs)) + "\n"
    return txt + (
        "Cómo usarlos: cada OBLIGATORIO tiene que verse (o escucharse) en el video final, como dice su nota. "
        "Los textos van exactos, sin corregirlos ni traducirlos (códigos, nombres de marca, frases de campaña). "
        "Imágenes y logos van como gráfico encima del video; los videos, como inserto o B-roll; el audio, según su nota. "
        "Si una nota no dice dónde, elige tú el mejor momento y cuéntale dónde lo pusiste. "
        "Antes de exportar, revisa uno por uno que cada obligatorio esté.\n"
    )


def video_duration(job: str) -> float:
    """Duración total de las partes (segundos); se mide una vez y queda guardada en partes.json."""
    sd = studio_dir(job)
    table = read_json(sd / "partes.json", {})
    total, changed = 0.0, False
    for p in partes(job):
        if p.name not in table or not table[p.name].get("dur"):
            table[p.name] = {"offset": table.get(p.name, {}).get("offset", 0.0), "dur": round(probe_clip(p)["dur"], 3)}
            changed = True
        total += table[p.name]["dur"]
    if changed and table:
        write_json(sd / "partes.json", table)
    return round(total, 1)


# segundos que tarda cada paso en esta PC (RTX 4050): fijo + por segundo de video. Se mostraron como guía, no promesa.
STEP_COST = {"importar": (5, 0.15), "transcribir": (30, 0.12), "editar": (0, 0), "cortar": (15, 0.05),
             "audio": (5, 0.05), "subtitulos": (20, 0.1), "capcut": (30, 0.02), "exportar": (20, 0.4)}


def estimates(job: str) -> dict:
    d = video_duration(job)
    per = {s: round(a + b * d) for s, (a, b) in STEP_COST.items()}
    pasos = step_status(job)
    left = sum(v for s, v in per.items() if pasos.get(s) != "hecho" and s != "capcut")
    # Claude editando todo: lectura + revisión de gráficos; crece con lo largo del video
    auto_lo, auto_hi = round(10 * 60 + d * 2), round(20 * 60 + d * 6)
    return {"pasos": per, "restante": left, "auto": [auto_lo, auto_hi]}


def create_project(sources: list[str], titulo: str, idioma: str, grupo: str = "") -> dict:
    sources = check_sources(sources)
    src = Path(sources[0])
    base = slugify(titulo or src.stem)
    job, n = base, 2
    while (PROJECTS / job).exists():
        job, n = f"{base}-{n}", n + 1
    d = PROJECTS / job
    for sub in ("raw", "audio", "assets", "broll", "outputs", "transcript", "studio"):
        (d / sub).mkdir(parents=True, exist_ok=True)
    save_state(job, {"titulo": titulo or src.stem, "idioma": idioma, "notas": "", "grupo": grupo,
                     "creado": datetime.now().isoformat(timespec="seconds"), "pasos": {},
                     "origen": sources})
    # copiar (nunca mover) los originales: paso 1 del editor
    TASK.start(job, "importar", [["py", lambda t: copy_parts(t, job, sources)], ["proxy"]])
    return {"job": job}


def create_projects(sources: list[str], titulo: str, idioma: str, grupo: str = "") -> dict:
    """Un video distinto por archivo (p. ej. los de una campaña). Se crean todos ya; las copias se hacen
    de a una, en fila, porque la app trabaja un paso a la vez."""
    sources = check_sources(sources)
    jobs = []
    for i, src in enumerate(sources, 1):
        name = f"{titulo} {i}" if titulo else Path(src).stem
        base = slugify(name)
        job, n = base, 2
        while (PROJECTS / job).exists():
            job, n = f"{base}-{n}", n + 1
        for sub in ("raw", "audio", "assets", "broll", "outputs", "transcript", "studio"):
            (PROJECTS / job / sub).mkdir(parents=True, exist_ok=True)
        save_state(job, {"titulo": name, "idioma": idioma, "notas": "", "grupo": grupo,
                         "creado": datetime.now().isoformat(timespec="seconds"), "pasos": {}, "origen": [src]})
        jobs.append((job, src))

    def queue():
        for job, src in jobs:
            while True:
                try:
                    TASK.start(job, "importar", [["py", lambda t, j=job, s=src: copy_parts(t, j, [s])], ["proxy"]])
                    break
                except RuntimeError:  # hay otro paso trabajando: espera su turno
                    time.sleep(1)
            while TASK.running:
                time.sleep(1)

    threading.Thread(target=queue, daemon=True).start()
    return {"jobs": [j for j, _ in jobs]}


def delete_project(job: str) -> dict:
    """A la Papelera de reciclaje, nunca borrado para siempre: con el script del editor, que primero comprueba que
    la Papelera lo pueda recibir entero y después confirma que llegó (CLAUDE.md § Rules, clearing out an old job)."""
    d = job_dir(job)
    if not d.is_dir():
        raise ValueError("ese video ya no existe")
    if TASK.running and TASK.job == job:
        raise RuntimeError("este video está trabajando ahora; espera a que termine para borrarlo")
    if MAC:  # a la Papelera con el Finder (se puede sacar de ahí mientras no se vacíe)
        out = subprocess.run(["osascript", "-e", "on run argv", "-e",
                              'tell application "Finder" to delete (POSIX file (item 1 of argv) as alias)',
                              "-e", "end run", str(d)], capture_output=True, text=True, timeout=300)
        if d.exists():
            raise RuntimeError("no se pudo mandar a la Papelera (no se borró nada). " + out.stderr.strip()[-200:])
        if TASK.job == job:
            TASK.job = TASK.step = None
        return {"ok": True}
    out = subprocess.run([BASH, "-lc", f"bash workflows/recycle-bin.sh '{to_posix(d)}' --apply"], cwd=EDITOR,
                         capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=NO_WINDOW,
                         timeout=300)
    if out.returncode != 0 or d.exists():
        msg = (out.stdout + out.stderr).strip().splitlines()[-3:]
        raise RuntimeError("no se pudo mandar a la Papelera (no se borró nada). " + " ".join(msg))
    if TASK.job == job:  # si no, el aviso de la última tarea volvería a crear su carpeta
        TASK.job = TASK.step = None
    return {"ok": True}


def add_parts(job: str, sources: list[str]) -> None:
    sources = check_sources(sources)
    st = state_of(job)
    st["origen"] = (st.get("origen") if isinstance(st.get("origen"), list) else [st.get("origen")]) + sources
    save_state(job, st)
    # una parte nueva cambia el texto: hay que volver a transcribir (la app lo hace al tocar Transcribir)
    TASK.start(job, "importar", [["py", lambda t: copy_parts(t, job, sources)], ["proxy"]])


def edit_parts(job: str, orden: list[str] | None, quitar: str | None) -> None:
    """Reordenar o quitar partes: solo antes de transcribir, porque la edición guarda posiciones de palabras."""
    if (job_dir(job) / "transcript" / "words.json").exists():
        raise ValueError("el video ya está transcrito: ya no se pueden reordenar ni quitar partes "
                         "(puedes agregar partes nuevas al final)")
    raw = job_dir(job) / "raw"
    clips = partes(job)
    if quitar:
        target = raw / Path(quitar).name
        if target in clips and len(clips) > 1:
            target.unlink()  # es la copia de la app; el archivo original del usuario sigue intacto
            clips.remove(target)
    if orden:
        by = {p.name: p for p in clips}
        clips = [by[n] for n in orden if n in by] + [p for p in clips if p.name not in orden]
    # renumerar 01-, 02-… en dos pasadas para no chocar nombres
    tmp = []
    for p in clips:
        q = p.with_name("~" + p.name)
        p.rename(q)
        tmp.append(q)
    for i, q in enumerate(tmp, 1):
        base = re.sub(r"^~(\d{2}-)?", "", q.name)  # fuera del f-string: Python 3.10 y 3.11 no aceptan \ ahí
        q.rename(raw / f"{i:02d}-{base}")
    TASK.start(job, "importar", [["proxy"]])

# --------------------------------------------------------------------------- tareas


class Task:
    """Una tarea a la vez (el editor también transcribe de a una)."""

    def __init__(self):
        self.lock = threading.Lock()
        self.running = False
        self.job = self.step = None
        self.log: list[str] = []
        self.exit = None
        self.started = 0.0

    def start(self, job: str, step: str, commands: list[list[str]]):
        with self.lock:
            if self.running:
                raise RuntimeError(f"ya hay un paso trabajando ({self.step} en {self.job}); espera a que termine")
            self.running, self.job, self.step = True, job, step
            self.log, self.exit, self.started = [], None, time.time()
        threading.Thread(target=self._run, args=(job, step, commands), daemon=True).start()

    def say(self, line: str):
        self.log.append(line.rstrip("\n"))
        if len(self.log) > 4000:
            del self.log[:1000]

    def _run(self, job, step, commands):
        log_path = studio_dir(job) / "logs" / f"{step}.log"
        log_path.parent.mkdir(exist_ok=True)
        code = 0
        try:
            for cmd in commands:
                code = self._exec(job, cmd)
                if code != 0:
                    break
        except Exception as e:  # noqa: BLE001
            self.say(f"✗ {type(e).__name__}: {e}")
            code = 1
        self.exit = code
        self.say("✓ listo" if code == 0 else f"✗ el paso terminó con error (código {code})")
        log_path.write_text("\n".join(self.log), encoding="utf-8")
        if code == 0 and step == "transcribir":
            # índices de palabras nuevos: la edición anterior ya no aplica (queda guardada aparte)
            ed = studio_dir(job) / "edits.json"
            if ed.exists():
                ed.replace(ed.with_name("edits.anterior.json"))
        mark(job, step, "hecho" if code == 0 else "error")
        self.running = False

    def _exec(self, job, cmd) -> int:
        kind = cmd[0]
        if kind == "copy":
            self.say(f"▸ copiando el video original al proyecto (el original no se toca)…")
            shutil.copy2(cmd[1], cmd[2])
            self.say("  ✓ copiado")
            return 0
        if kind == "proxy":
            return self._proxy(job)
        if kind == "py":
            return cmd[1](self)
        if kind == "bash":
            self.say(f"▸ {cmd[2]}")
            return self._popen([BASH, "-lc", cmd[1]], cmd[3] if len(cmd) > 3 else {})
        raise ValueError(kind)

    def _popen(self, argv, extra_env) -> int:
        env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8", **extra_env)
        p = subprocess.Popen(argv, cwd=EDITOR, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, encoding="utf-8", errors="replace", creationflags=NO_WINDOW)
        for line in p.stdout:
            self.say("  " + line)
        return p.wait()

    def _proxy(self, job) -> int:
        """Una sola copia ligera (H.264 720p) con todas las partes seguidas, para el reproductor
        (el raw puede ser HEVC/4K). partes.json guarda dónde empieza cada parte en ella."""
        clips = partes(job)
        sd = studio_dir(job)
        self.say(f"▸ preparando la vista previa (720p){f' con las {len(clips)} partes seguidas' if len(clips) > 1 else ''}…")
        info = [probe_clip(c) for c in clips]
        w0, h0 = info[0]["w"], info[0]["h"]
        W, H = (720, 1280) if h0 > w0 else (1280, 720)  # el lienzo sigue a la primera parte
        inputs, graph, labels, table, off = [], [], [], {}, 0.0
        for i, (c, inf) in enumerate(zip(clips, info)):
            d = inf["dur"]
            inputs += ["-i", str(c)]
            graph.append(f"[{i}:v]scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,"
                         f"setsar=1,fps=30,format=yuv420p,trim=duration={d},setpts=PTS-STARTPTS[v{i}];")
            if inf["audio"]:
                graph.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration={d},"
                             f"apad=whole_dur={d},asetpts=PTS-STARTPTS[a{i}];")
            else:  # una parte sin sonido: silencio del mismo largo
                graph.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={d}[a{i}];")
            labels.append(f"[v{i}][a{i}]")
            table[c.name] = {"offset": round(off, 3), "dur": round(d, 3)}
            off += d
        graph.append("".join(labels) + f"concat=n={len(clips)}:v=1:a=1[v][a]")
        script = sd / "proxy-graph.txt"
        script.write_text("".join(graph), encoding="utf-8")
        code = self._popen(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs, "-/filter_complex", str(script),
                            "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
                            "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(sd / "proxy.mp4")], {})
        if code == 0:
            write_json(sd / "partes.json", table)
            self._popen(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", "1", "-i", str(sd / "proxy.mp4"),
                         "-frames:v", "1", "-vf", "scale=-2:360", str(sd / "thumb.jpg")], {})
            self.say("  ✓ vista previa lista")
        return code

    def snapshot(self, since: int) -> dict:
        return {"running": self.running, "job": self.job, "step": self.step, "exit": self.exit,
                "total": len(self.log), "lines": self.log[since:] if since < len(self.log) else [],
                "segundos": int(time.time() - self.started) if self.started else 0}


TASK = Task()

# --------------------------------------------------------------------------- pasos


def patched_transcribe() -> Path:
    """transcribe.sh viene fijado en inglés. Se copia con el idioma leído de VE_LANG, sin tocar el editor.
    La copia se regenera cada vez, así sigue al script del editor tras cada actualización."""
    src = EDITOR / ".claude" / "skills" / "rough-cut" / "scripts" / "transcribe.sh"
    text = src.read_text(encoding="utf-8")
    need = {'language="en"': 2, 'language_code="en"': 1, 'dirname "$0"': 2}
    for needle, n in need.items():
        if text.count(needle) != n:
            raise RuntimeError(f"transcribe.sh cambió (no encuentro {needle!r}); avisa a Claude para ajustar la app")
    text = text.replace('language="en"', 'language=os.environ.get("VE_LANG", "en")')
    text = text.replace('language_code="en"', 'language_code=os.environ.get("VE_LANG", "en")')
    text = text.replace('dirname "$0"', f'dirname "{to_posix(src)}"')
    out = APP_DIR / "cache" / "transcribe-idioma.sh"
    out.parent.mkdir(exist_ok=True)
    out.write_bytes(text.replace("\r\n", "\n").encode("utf-8"))
    return out


def run_step(job: str, step: str, body: dict) -> None:
    d = job_dir(job)
    jp = to_posix(d)
    st = state_of(job)
    if step == "transcribir":
        script = to_posix(patched_transcribe())
        force = " --force" if (d / "transcript" / "words.json").exists() else ""
        TASK.start(job, step, [["bash", f'bash "{script}" "{jp}"{force}',
                                "transcribiendo con WhisperX (la primera vez descarga el modelo, 3-5 GB: puede tardar)",
                                {"VE_LANG": st["idioma"]}]])
    elif step == "cortar":
        cuts = build_cuts(job)
        work = bash_tmp() / "video-editor" / job
        TASK.start(job, step, [
            ["py", lambda t: write_cuts(t, work, cuts)],
            ["bash", f'RENDER=0 bash .claude/skills/rough-cut/scripts/splice.sh "{jp}"', "aplicando los cortes"],
            ["bash", f'uv run .claude/skills/rough-cut/scripts/polish-boundaries.py "{jp}"',
             "puliendo cada borde de palabra contra el audio real"],
            ["bash", f'RENDER=0 bash .claude/skills/rough-cut/scripts/splice.sh "{jp}"', "guardando el corte final"],
            ["py", lambda t: make_preview(t, job, None, "preview-corte.mp4")],
        ])
    elif step == "audio":
        TASK.start(job, step, [["bash", f'bash workflows/normalize-sections.sh "{jp}"',
                                "ajustando el volumen de la voz (−17 LUFS + limitador)"]])
    elif step == "subtitulos":
        st["subtitulos"] = {"activos": bool(body.get("activos", True)), "gancho": str(body.get("gancho", "")).strip()}
        save_state(job, st)
        if not st["subtitulos"]["activos"]:
            mark(job, step, "hecho")
            return
        TASK.start(job, step, [
            ["bash", f'uv run {SUBS_BUILDER} "{jp}" --alpha --hook-text "$HOOK_TEXT"',
             "generando los subtítulos desde la transcripción del corte",
             {"HOOK_TEXT": st["subtitulos"]["gancho"]}],
            ["py", lambda t: make_preview(t, job, subs_alpha(job), "preview-subs.mp4")],
        ])
    elif step == "capcut":
        media = f' --media "{jp}/audio-normalized"' if (d / "audio-normalized").exists() else ""
        name = f"{job}-{datetime.now():%m%d-%H%M}"  # un proyecto nuevo cada vez: CapCut no sobreescribe
        cmds = [["py", capcut_ready],
                ["bash", f'uv run lanes/capcut/capcut-bridge.py replay "{jp}" --name "{name}"{media}',
                 "creando el proyecto en CapCut (CapCut se cierra y se vuelve a abrir solo)"]]
        if subs_on(job):
            alpha = to_posix(subs_alpha(job))
            premult = alpha.replace(".mov", "-premult.mov")
            cmds += [["bash", f'bash lanes/capcut/premultiply.sh "{alpha}" "{premult}"',
                      "preparando los subtítulos para CapCut"],
                     ["bash", f'uv run lanes/capcut/capcut-bridge.py add-overlay "{name}" "{premult}" --at 0',
                      "poniendo los subtítulos en su propia capa"]]
        TASK.start(job, step, cmds)
    elif step == "exportar":
        work = bash_tmp() / "video-editor" / job
        TASK.start(job, step, [
            ["py", lambda t: restore_cuts(t, d, work)],
            ["bash", f'bash .claude/skills/rough-cut/scripts/splice.sh "{jp}"',
             "renderizando el video final con el audio pulido"],
            ["py", lambda t: promote_final(t, job)],
        ])
    else:
        raise ValueError(f"paso desconocido: {step}")


def flat_words(job: str) -> list[dict]:
    """Todas las palabras de todas las partes, en el orden de las partes. s/e = tiempo en la vista previa
    unida (lo que usa el reproductor); ls/le = tiempo dentro de su archivo (lo que usa el corte)."""
    data = read_json(job_dir(job) / "transcript" / "words.json", {"clips": []})
    by_name = {c["clip"]: c for c in data.get("clips", [])}
    off = offsets(job)
    order = [p.name for p in partes(job) if p.name in by_name] + [n for n in by_name if n not in {p.name for p in partes(job)}]
    out = []
    for k, name in enumerate(order):
        o = off.get(name, 0.0)
        for w in by_name[name].get("words", []):
            if "start" in w and "end" in w:
                out.append({"i": len(out), "w": w["w"], "s": round(w["start"] + o, 3), "e": round(w["end"] + o, 3),
                            "ls": w["start"], "le": w["end"], "p": round(w.get("prob", 1), 2),
                            "clip": name, "parte": k + 1})
    return out


GAP = 0.65  # silencio mínimo que el editor siempre corta


def build_cuts(job: str) -> dict:
    words = flat_words(job)
    if not words:
        raise ValueError("primero transcribe el video")
    deleted = set(read_json(studio_dir(job) / "edits.json", {}).get("borradas", []))
    lead_pad, tail_pad = 0.05, 0.08
    segs, run = [], []
    for w in words:
        if w["i"] in deleted:
            if run:
                segs.append(run)
                run = []
            continue
        # un tramo nunca cruza de una parte a otra
        if run and (w["clip"] != run[-1]["clip"] or w["ls"] - run[-1]["le"] >= GAP):
            segs.append(run)
            run = []
        run.append(w)
    if run:
        segs.append(run)
    if not segs:
        raise ValueError("borraste todas las palabras: no queda nada que cortar")
    out = []
    for r in segs:
        # el margen nunca cruza la mitad del hueco hacia la palabra vecina (borrada o no) de su mismo archivo:
        # si la toca, el refinador del editor la toma por parte de la palabra que queda y se cuela en el corte
        prev_w = words[r[0]["i"] - 1] if r[0]["i"] > 0 else None
        next_w = words[r[-1]["i"] + 1] if r[-1]["i"] + 1 < len(words) else None
        start = r[0]["ls"] - lead_pad
        if prev_w and prev_w["clip"] == r[0]["clip"]:
            start = max(start, (prev_w["le"] + r[0]["ls"]) / 2)
        end = r[-1]["le"] + tail_pad
        if next_w and next_w["clip"] == r[-1]["clip"]:
            end = min(end, (r[-1]["le"] + next_w["ls"]) / 2)
        out.append({"clip": r[0]["clip"], "start": round(max(0.0, start), 3), "end": round(end, 3),
                    "transcript": " ".join(x["w"] for x in r)})
    return {"segments": out}


def write_cuts(t: Task, work: Path, cuts: dict) -> int:
    work.mkdir(parents=True, exist_ok=True)
    write_json(work / "cuts.json", cuts)
    kept = sum(s["end"] - s["start"] for s in cuts["segments"])
    t.say(f"▸ {len(cuts['segments'])} partes, unos {kept:.1f} s de video")
    return 0


def capcut_ready(t: Task) -> int:
    """CapCut guarda su lista de proyectos en root_meta_info.json, que solo crea con el primer proyecto local.
    Sin ella el puente no puede registrar el proyecto nuevo, y escribirla a ciegas podría romper la lista."""
    user_data = (Path.home() / "Movies" / "CapCut" / "User Data" if MAC
                 else Path(os.environ.get("LOCALAPPDATA", "")) / "CapCut" / "User Data")
    root = user_data / "Projects" / "com.lveditor.draft"
    gs = user_data / "Config" / "globalSetting"
    if gs.exists():
        m = re.search(r"^currentCustomDraftPath=(.+)$", gs.read_text(encoding="utf-8", errors="replace"), re.M)
        if m and m.group(1).strip():
            root = Path(m.group(1).strip().replace("\\\\", "\\"))
    if not user_data.exists():
        t.say(f"✗ No encuentro CapCut instalado en esta {'Mac' if MAC else 'PC'}.")
        return 1
    if not (root / "root_meta_info.json").exists():
        t.say(f"✗ CapCut todavía no tiene ningún proyecto guardado en esta {'Mac' if MAC else 'PC'}, y lo necesita para registrar el nuevo.")
        t.say("  Abre CapCut, haz clic en «Crear proyecto», ciérralo (cierra CapCut por completo) y vuelve a")
        t.say("  presionar «Enviar a CapCut». Solo hace falta una vez.")
        return 1
    return 0


def read_rules() -> list[str]:
    """Las reglas de estilo de my-rules.md (lo que Claude aprendió o le escribieron), una por línea con «- »."""
    if not RULES.exists():
        return []
    body = RULES.read_text(encoding="utf-8").split(RULES_HEAD, 1)[-1]
    return [ln[2:].strip() for ln in body.splitlines() if ln.startswith("- ") and ln[2:].strip()]


def write_rules(rules: list[str]) -> None:
    """Reescribe solo la lista de reglas; el encabezado y cualquier texto que no sea una regla «- » se conservan."""
    text = RULES.read_text(encoding="utf-8") if RULES.exists() else f"# My rules\n\n{RULES_HEAD}\n"
    head, sep, body = text.partition(RULES_HEAD)
    if not sep:
        head, sep, body = text.rstrip() + "\n\n", RULES_HEAD, ""
    others = [ln for ln in body.splitlines() if ln.strip() and not ln.startswith("- ")]
    clean = [r.replace("\n", " ").strip() for r in rules if r.strip()]
    out = head + sep + "\n\n" + "".join(f"- {r}\n" for r in clean)
    if others:
        out += "\n" + "\n".join(others) + "\n"
    RULES.write_text(out, encoding="utf-8")


# Lo que el editor tiene que saber de la app y de quien la usa. Se escribe en my-rules.md una vez, con el nombre
# que se da al abrir la app por primera vez (las reglas «[app]» no se muestran en «Mi estilo», pero se conservan).
APP_RULES = [
    "[app] Quien usa este editor es {n} y no es de perfil técnico: háblale siempre en español sencillo, en frases cortas, "
    "sin comandos, rutas ni términos técnicos. Explica qué vas a hacer y por qué antes de hacerlo, y cuando necesites que "
    "decida algo, pregúntale una sola cosa clara.",
    "[app] Termina los videos directamente en el chat (chat-only) y exporta el MP4 final con `./finalize.sh <job> --apply`; "
    "usa una app de edición solo si {n} lo pide. Esto cuenta como el \"sí\" explícito a hacerlo en el chat.",
    "[app] Casi todo se trabaja desde la app Iconic Studio ({app}), que guarda su estado en `projects/<job>/studio/` "
    "(`state.json`, `edits.json`, vistas previas): no borres ni sobrescribas esos archivos.",
    "[app] Al terminar cada video, pregúntale a {n} qué le gustó y qué no, y guarda lo aprendido con `bake-preset` (sus "
    "reglas generales aquí, en este archivo), para que el siguiente video salga más a su gusto.",
    "[app] Los assets que {n} da en la app (los de un video están en `projects/<job>/assets/mis-assets/`, los de su carpeta "
    "o campaña en `projects/_grupos/<grupo>/`; cada carpeta tiene un `ASSETS.md` con la lista y cómo usar cada uno) se usan "
    "como dice, y los marcados OBLIGATORIO tienen que salir en el video final. Los textos van exactos. Esto incluye códigos "
    "de descuento, frases de campaña o llamadas a la acción de una marca, aunque el editor por defecto no ponga pedidos de "
    "venta. Antes de exportar, revisa que cada obligatorio esté.",
    "[app] Las instrucciones previas que {n} escribe en la app (las de un video en su `studio/state.json` → `instrucciones`, "
    "las de una carpeta en `projects/_grupos/<grupo>/instrucciones.md`, y las dos también en el `ASSETS.md` de su carpeta) "
    "se siguen al pie de la letra en cada edición de esos videos, y mandan sobre los presets bloqueados: si pide resaltar "
    "una palabra en los subtítulos, otro color, un logo cada vez que dice algo, etc., se hace aunque el preset diga otra "
    "cosa. Si algo de verdad no se puede, díselo antes de empezar y propón lo más parecido.",
    "[app] Si la app pide MODO RÁPIDO para un video o un lote, se hace solo corte, audio, subtítulos (y gancho si el preset lo "
    "lleva) y exportar, sin gráficos elaborados ni efectos de sonido salvo los assets obligatorios, y sin las revisiones con "
    "subagentes: lo pide {n} para editar muchos videos gastando menos, y manda sobre los pasos de siempre.",
    "[app] {n} puede guardar material propio ya hecho en `projects/_material/imagenes/` y `projects/_material/sonidos/` "
    "(cada carpeta con su `ASSETS.md`, que dice qué es cada archivo): antes de generar una ilustración o buscar un efecto de "
    "sonido, mira ahí y usa lo que encaje. Es opcional: lo que no haya, se hace como siempre.",
    "[app] Cada carpeta (campaña) puede tener su estilo aprendido en `projects/_grupos/<carpeta>/ESTILO.md`, con piezas "
    "listas en su `plantilla/`: al editar un video de esa carpeta, léelo antes de planear y síguelo, reutilizando lo ya "
    "aprobado en vez de decidirlo de nuevo.",
]


APP_RULE_MARKS = ["háblale siempre en español", "chat-only", "projects/<job>/studio/", "bake-preset", "OBLIGATORIO",
                  "instrucciones previas", "MODO RÁPIDO", "projects/_material/", "ESTILO.md"]


def ensure_app_rules() -> None:
    """Las reglas de la app en my-rules.md, si todavía no están (una instalación nueva)."""
    if not USUARIO or not (EDITOR / "CLAUDE.md").exists():
        return
    rules = read_rules()
    mine = [r for r in rules if r.startswith("[app]")]
    # cada regla se reconoce por una marca suya: así una versión nueva agrega solo las que falten, sin duplicar
    missing = [r for r, mark in zip(APP_RULES, APP_RULE_MARKS) if not any(mark in x for x in mine)]
    if missing:
        write_rules(rules + [r.format(n=USUARIO, app=APP_DIR) for r in missing])


def set_usuario(nombre: str) -> None:
    global USUARIO
    nombre = re.sub(r"\s+", " ", str(nombre)).strip()[:40]
    if not nombre:
        raise ValueError("escribe tu nombre")
    USUARIO = CFG["usuario"] = nombre
    CONFIG_FILE.write_text(json.dumps(CFG, indent=2, ensure_ascii=False), encoding="utf-8")
    ensure_app_rules()


def setup_state() -> dict:
    """¿Está instalado el editor? (.setup-complete lo escribe su setup.sh cuando todo funciona)."""
    marker = EDITOR / ".setup-complete"
    lane = ""
    if marker.exists():
        m = re.search(r"lane=(\S+)", marker.read_text(encoding="utf-8", errors="replace"))
        lane = m.group(1) if m else ""
    return {"editor": (EDITOR / "CLAUDE.md").exists(), "listo": marker.exists() and lane != "pending", "lane": lane}


def open_setup() -> None:
    """Abre Claude en la carpeta del editor para que lo instale (o siga instalándolo después de reiniciar)."""
    if not (EDITOR / "CLAUDE.md").exists():
        raise RuntimeError(f"no encuentro la carpeta del editor (video-editor) junto a la app, en {APP_DIR.parent}")
    pf = APP_DIR / "cache" / "instalar.txt"
    pf.parent.mkdir(exist_ok=True)
    pf.write_text(_plain(
        "Set this up on my machine (or continue setup if it was already started). Sigue el FIRST RUN de CLAUDE.md "
        "y corre ./setup.sh tú mismo. "
        f"Háblame en español sencillo, sin términos técnicos: me llamo {USUARIO or '(todavía sin nombre)'}. "
        f"Voy a usar el editor desde la app Iconic Studio ({APP_DIR}), que termina los videos directo en el chat: "
        "si no tengo ninguna app de edición instalada, la respuesta es chat-only. "
        "Si hace falta reiniciar Claude Code, dime que cierre esta ventana negra y vuelva a tocar «Terminar de instalar» "
        "en la app (eso lo abre de nuevo). Al final dime en una frase que ya quedó y que vuelva a la app."), encoding="utf-8")
    launch_claude("instalar el editor", pf, instalar=True)


# --------------------------------------------------------------------------- actualizaciones
# Las versiones se publican como «releases» en GitHub (publicar.py). Cada una trae estudio-app.zip (app.py, ui/…)
# y su .sha256. La app revisa al abrirse, y al tocar «Actualizar» baja el .zip, comprueba que llegó entero,
# guarda una copia de lo de ahora en cache/anterior/ y reemplaza solo los archivos del programa: nunca config.json,
# grupos.json ni nada del editor o de los videos. Si una versión cambia las librerías de la app (el .exe), no trae
# estudio-app.zip y la app manda a descargar el instalador nuevo.

UPDATE_FILE = APP_DIR / "actualizaciones.json"   # {"repo": "dueño/nombre"}, lo escribe publicar.py
UPDATE_ASSET = "estudio-app.zip"
APP_FILES = ("app.py", "LEEME.md", "icono.ico", "icono.png", "Iniciar Estudio.cmd", "actualizaciones.json")
_update_cache: dict = {}


def _vtuple(v: str) -> tuple:
    return tuple(int(x) for x in re.findall(r"\d+", v)[:3]) or (0,)


def _github(url: str, binary: bool = False):
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": f"IconicStudio/{APP_VERSION}",
                                               "Accept": "application/octet-stream" if binary else "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310 (solo https a GitHub)
        data = r.read()
    return data if binary else json.loads(data.decode("utf-8"))


def check_update(force: bool = False) -> dict:
    repo = read_json(UPDATE_FILE, {}).get("repo", "")
    out = {"version": APP_VERSION, "repo": repo, "nueva": False}
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", repo or ""):
        return out
    if not force and _update_cache.get("t", 0) > time.time() - 3600:
        return {**out, **_update_cache["data"]}
    try:
        rel = _github(f"https://api.github.com/repos/{repo}/releases/latest")
    except Exception as e:  # noqa: BLE001 (sin internet, o todavía sin versiones publicadas)
        return {**out, "error": str(e)[:200]}
    assets = {a["name"]: a["browser_download_url"] for a in rel.get("assets", [])}
    ext = ".dmg" if MAC else ".exe"  # el instalador de este sistema
    installer = next((u for n, u in assets.items() if n.lower().endswith(ext)), rel.get("html_url", ""))
    data = {"nueva": _vtuple(rel.get("tag_name", "")) > _vtuple(APP_VERSION), "ultima": rel.get("tag_name", "").lstrip("v"),
            "notas": (rel.get("body") or "").strip()[:3000], "zip": assets.get(UPDATE_ASSET, ""),
            "sha": assets.get(UPDATE_ASSET + ".sha256", ""), "instalador": installer, "pagina": rel.get("html_url", "")}
    data["solo_instalador"] = data["nueva"] and not (data["zip"] and data["sha"])
    _update_cache.update(t=time.time(), data=data)
    return {**out, **data}


def apply_update() -> dict:
    import hashlib
    import io
    import zipfile
    info = check_update(force=True)
    if not info.get("nueva"):
        return {"ok": False, "mensaje": "ya tienes la última versión"}
    if info.get("solo_instalador"):
        raise RuntimeError("esta versión se instala con el instalador nuevo")
    if TASK.running:
        raise RuntimeError("hay un paso trabajando; espera a que termine para actualizar")
    blob = _github(info["zip"], binary=True)
    want = _github(info["sha"], binary=True).decode("utf-8").split()[0].lower()
    if hashlib.sha256(blob).hexdigest() != want:
        raise RuntimeError("la descarga llegó incompleta; vuelve a intentarlo")
    z = zipfile.ZipFile(io.BytesIO(blob))
    names = [n for n in z.namelist() if not n.endswith("/")]
    if "app.py" not in names or "ui/index.html" not in names:
        raise RuntimeError("la versión descargada no está completa")
    for n in names:  # solo archivos del programa, sin rutas raras
        if ".." in Path(n).parts or Path(n).is_absolute() or not (n in APP_FILES or n.startswith("ui/")):
            raise RuntimeError(f"la versión descargada trae un archivo que no corresponde: {n}")
    # copia de lo de ahora, por si hay que volver atrás
    back = APP_DIR / "cache" / "anterior"
    shutil.rmtree(back, ignore_errors=True)
    (back / "ui").mkdir(parents=True)
    for f in APP_FILES:
        if (APP_DIR / f).exists():
            shutil.copy2(APP_DIR / f, back / f)
    shutil.copytree(UI_DIR, back / "ui", dirs_exist_ok=True)
    # reemplazar: la carpeta ui/ entera (así no quedan archivos viejos) y los archivos sueltos del programa
    shutil.rmtree(UI_DIR, ignore_errors=True)
    for n in names:
        dest = APP_DIR / n
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(z.read(n))
    threading.Thread(target=_restart, daemon=True).start()
    return {"ok": True, "version": info["ultima"]}


def _restart() -> None:
    """Vuelve a abrir la app (el .exe, o app.py con el mismo Python) y cierra esta."""
    time.sleep(1.5)
    cmd = [sys.executable] if getattr(sys, "frozen", False) else [sys.executable, str(APP_DIR / "app.py")]
    bundle = Path(sys.executable).resolve().parents[2] if MAC else None
    if "--serve" in sys.argv:
        pass
    elif bundle and bundle.suffix == ".app":  # la app de Mac se vuelve a abrir entera, con su ícono en el Dock
        subprocess.Popen(["open", "-n", str(bundle)])
    else:
        subprocess.Popen(cmd, cwd=APP_DIR, creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))
    os._exit(0)


def find_claude() -> str | None:
    """Claude Code instalado aparte (winget o instalador nativo); la copia de Claude Desktop no sirve desde fuera."""
    found = shutil.which("claude")
    if found:
        return found
    home = Path.home()
    for c in [home / ".local" / "bin" / "claude", Path("/opt/homebrew/bin/claude"), Path("/usr/local/bin/claude"),
              home / ".local" / "bin" / "claude.exe",
              *(home / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages").glob("Anthropic.ClaudeCode*/claude.exe")]:
        if c.exists():
            return str(c)
    return None


CLAUDE_FALTA = ("no encuentro Claude Code instalado: en la pantalla de inicio toca «Terminar de instalar» y se instala solo"
                if MAC else "no encuentro Claude Code instalado (instálalo con: winget install Anthropic.ClaudeCode)")


def open_terminal(titulo: str, cmds: list[str], env_extra: dict | None = None) -> None:
    """Mac: una ventana de Terminal (lo que en Windows es la ventana negra) que corre estos comandos en la carpeta
    del editor. Se arma un .command y se abre con Terminal, que no pide permisos para eso."""
    import shlex
    d = APP_DIR / "cache" / "terminal"
    d.mkdir(parents=True, exist_ok=True)
    for old in d.glob("*.command"):  # los de días anteriores ya no sirven
        if old.stat().st_mtime < time.time() - 86400:
            old.unlink(missing_ok=True)
    f = d / f"{int(time.time() * 1000)}.command"
    f.write_text("\n".join([
        "#!/bin/bash",
        f"printf '\\033]0;%s\\007' {shlex.quote(titulo)}",
        f'export PATH="{MAC_PATH}:$PATH"',
        *(f"export {k}={shlex.quote(str(v))}" for k, v in (env_extra or {}).items()),
        f"cd {shlex.quote(str(EDITOR))}",
        "clear",
        *cmds, ""]), encoding="utf-8")
    f.chmod(0o755)
    subprocess.Popen(["open", "-a", "Terminal", str(f)])


STEP_NAMES = {"importar": "Importar", "transcribir": "Transcribir", "editar": "Editar por texto",
              "cortar": "Aplicar corte", "audio": "Audio", "subtitulos": "Subtítulos",
              "capcut": "Enviar a CapCut", "exportar": "Exportar MP4"}


def style_for_claude(jobs: list[str]) -> str:
    """El estilo aprendido de la carpeta de estos videos (ESTILO.md): seguirlo ahorra planear desde cero."""
    out = []
    for g in dict.fromkeys(state_of(j).get("grupo", "") for j in jobs):
        f = PROJECTS / "_grupos" / g / STYLE_FILE if g else None
        if f and f.exists():
            out.append(f"ESTILO APRENDIDO de la carpeta «{group_name(g)}»: lee projects/_grupos/{g}/{STYLE_FILE} ANTES de "
                       "planear y síguelo: es la receta que {u} ya aprobó para esta campaña (formato, subtítulos, gráficos, "
                       "sonidos, ritmo). Reutiliza las piezas que señala (scripts, comps, plantillas) en vez de inventarlas "
                       "de nuevo; cambia solo lo que el contenido de este video pida.".replace("{u}", USUARIO))
    return "\n".join(out) + ("\n" if out else "")


def material_for_claude() -> str:
    have = [k for k in MATERIAL if read_assets("material", k)]
    if not have:
        return ""
    return (f"MATERIAL PROPIO de {USUARIO} (opcional): antes de generar ilustraciones o buscar sonidos, mira "
            + " y ".join(f"projects/_material/{k}/ASSETS.md" for k in have)
            + " y usa lo que encaje con lo que se dice; lo que no haya ahí, lo haces como siempre.\n")


MODO_RAPIDO = (
    "MODO RÁPIDO (pedido por {u} para editar muchos videos gastando poco): haz el corte (paso 2), el audio (3), los "
    "subtítulos del preset y el gancho si el preset lo lleva, y exporta (8). NO hagas gráficos elaborados, ilustraciones "
    "ni efectos de sonido, salvo los assets OBLIGATORIOS (ponlos de la forma más simple que cumpla su nota). Salta las "
    "revisiones con subagentes (la segunda pasada de ojos frescos del paso 2 y la ronda de edit-review del paso 5): "
    "revisa tú mismo, rápido. Si la carpeta tiene ESTILO.md, aplica de él solo lo que entre en este modo. "
    "Anota en RUN.md «modo rápido» y lo que se saltó.\n")


def _plain(text: str) -> str:
    """Sin comillas dobles: PowerShell 5.1 las rompe al pasar el texto a Claude Code."""
    return text.replace('"', "”")


def claude_prompt(job: str, modo: str, texto: str) -> str:
    st = state_of(job)
    pasos = step_status(job)
    estado = ", ".join(f"{STEP_NAMES[s]}: {pasos[s]}" for s in STEPS)
    ps = [p.name for p in partes(job)]
    videos = (f"video {ps[0]}" if len(ps) == 1 else
              f"un solo video grabado en {len(ps)} partes, en este orden: {', '.join(ps)}") if ps else "sin video"
    ctx = (
        f"Te escribe la app Iconic Studio ({APP_DIR}) de parte de {USUARIO}. "
        f"Proyecto: projects/{job} («{st['titulo']}», {videos}, idioma {st['idioma']}). "
        f"Pasos en la app: {estado}. Notas de {USUARIO}: {st['notas'] or '(ninguna)'}.\n"
        "La app guarda lo suyo en projects/<job>/studio/ (state.json, edits.json, vistas previas): no lo borres. "
        "Sus subtítulos son hf-graphics/captions/renders/captions-alpha.mov.\n"
        f"Recuerda: {USUARIO} no es de perfil técnico. Háblale en español sencillo, frases cortas, sin comandos ni rutas.\n\n"
    )
    kit = assets_for_claude(job)
    if kit:
        ctx += kit + "\n"
    instr = instr_for_claude([job])
    if instr:
        ctx += instr + "\n"
    more = style_for_claude([job]) + material_for_claude()
    if more:
        ctx += more + "\n"
    if modo == "auto":
        return ctx + (
            "PEDIDO: edita este video completo, de principio a fin, con el flujo edit-video (los 8 pasos), "
            "directo en el chat y terminando con el MP4 exportado (finalize.sh --apply, que deja una copia en Descargas). "
            "Si ya hay pasos hechos en la app (transcripción, corte), reutilízalos en vez de repetirlos. "
            f"Aplica todo lo que dice my-rules.md sobre el estilo de {USUARIO}. "
            "Antes de empezar dile en 2 o 3 líneas qué vas a hacer y cuánto puede tardar; en cada paso, una línea de avance. "
            "Al final dile dónde quedó el video y pregúntale qué le gustó y qué no, para guardarlo con bake-preset."
        )
    if modo == "comentarios":
        return ctx + (
            f"COMENTARIOS DE {USUARIO.upper()} sobre este video:\n«{texto.strip()}»\n\n"
            "PEDIDO: aplica estos cambios al video (como cambios del paso 7, dentro de este chat) y vuelve a exportar si ya "
            "estaba exportado. Después, guarda lo que vale para videos futuros con bake-preset: lo general en my-rules.md y "
            "lo de este tipo de video en su preset; si el video está en una carpeta con ESTILO.md (projects/_grupos/<carpeta>/), actualízalo con lo que valga para toda la campaña. Dile en palabras simples qué cambiaste y qué aprendiste."
        )
    if modo == "ayuda":
        log = studio_dir(job) / "logs" / f"{texto}.log"
        tail = "\n".join(log.read_text(encoding="utf-8", errors="replace").splitlines()[-60:]) if log.exists() else "(sin registro)"
        return ctx + (
            f"PROBLEMA: en la app falló el paso «{STEP_NAMES.get(texto, texto)}». Estas son las últimas líneas de su registro "
            f"(projects/{job}/studio/logs/{texto}.log):\n{tail}\n\n"
            f"PEDIDO: averigua qué pasó y arréglalo. Explícale a {USUARIO} en una o dos frases simples qué falló y qué hiciste, "
            "y dile si tiene que volver a apretar el botón del paso en la app."
        )
    return ctx + (texto.strip() or f"Lee el estado del proyecto, saluda a {USUARIO} y pregúntale en qué le ayudas.")


def open_claude(job: str, modo: str = "libre", texto: str = "") -> None:
    """Abre Claude Code en su propia ventana, en la carpeta del editor, con el contexto del proyecto.
    Es Claude Code normal con el plan del usuario: la app solo lo lanza, no habla con él."""
    pf = studio_dir(job) / "claude-contexto.txt"
    pf.write_text(_plain(claude_prompt(job, modo, texto)), encoding="utf-8")
    launch_claude(state_of(job)["titulo"], pf)


MODELOS = {"sonnet": "sonnet", "opus": "opus"}  # alias de Claude Code: siempre el último de cada uno


def launch_claude(titulo: str, pf: Path, modelo: str = "", env_extra: dict | None = None, instalar: bool = False) -> None:
    exe = find_claude()
    model = f"--model {MODELOS[modelo]} " if modelo in MODELOS else ""
    if MAC:
        import shlex
        pre = []
        if not exe and instalar:  # el instalador oficial de Claude Code (queda en ~/.local/bin)
            pre = ["echo 'Instalando Claude Code (un par de minutos)…'", "curl -fsSL https://claude.ai/install.sh | bash",
                   "echo"]
        elif not exe:
            raise RuntimeError(CLAUDE_FALTA)
        open_terminal(f"Claude · {titulo}", [*pre, f'{shlex.quote(exe or "claude")} {model}--permission-mode acceptEdits '
                                                  f'"$(cat {shlex.quote(str(pf))})"'], env_extra)
        return
    if not exe:
        raise RuntimeError(CLAUDE_FALTA)
    ps = (f"$Host.UI.RawUI.WindowTitle = 'Claude · {titulo.replace(chr(39), '')}'; "
          "[Console]::OutputEncoding = [Text.Encoding]::UTF8; "
          f"Set-Location -LiteralPath '{EDITOR}'; "
          f"& '{exe}' {model}--permission-mode acceptEdits (Get-Content -Raw -Encoding UTF8 -LiteralPath '{pf}')")
    subprocess.Popen(["powershell.exe", "-NoExit", "-NoProfile", "-Command", ps], cwd=EDITOR,
                     env={**claude_env(), **(env_extra or {})}, creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0))


# --------------------------------------------------------------------------- lotes: un Claude nuevo por video, en fila
# Una sola ventana para muchos videos va arrastrando toda la conversación: cada mensaje cuesta más y va más lento.
# La cola abre una ventana nueva por video (cada una empieza liviana; el estilo lo dan my-rules, la carpeta y su
# ESTILO.md), transcribe antes todos los que falten con la tarjeta de video de la PC (gratis), y deja cada video
# terminado en una carpeta de entrega: cuando están todos, los pasa juntos a Descargas y avisa.

QUEUE_FILE = APP_DIR / "cache" / "cola.json"
_queue_lock = threading.Lock()


def queue_state() -> dict:
    return read_json(QUEUE_FILE, {})


def _queue_save(q: dict) -> None:
    write_json(QUEUE_FILE, q)


def start_queue(jobs: list[str], extra: str = "", modo: str = "completo", modelo: str = "", paralelo: int = 1) -> dict:
    jobs = list(dict.fromkeys(j for j in jobs if (PROJECTS / j).is_dir() and raw_clip(j)))
    if not jobs:
        raise ValueError("elige al menos un video (que ya tenga su video importado)")
    q = queue_state()
    if q.get("fase") in ("transcribiendo", "editando"):
        raise RuntimeError("ya hay un lote trabajando; espera a que termine o detenlo")
    qid = datetime.now().strftime("%Y%m%d-%H%M%S")
    q = {"id": qid, "jobs": jobs, "extra": extra.strip(), "modo": "rapido" if modo == "rapido" else "completo",
         "modelo": modelo if modelo in MODELOS else "", "fase": "transcribiendo", "actual": -1, "inicio_video": 0,
         "paralelo": 2 if paralelo == 2 else 1, "activos": [], "hechos": [],
         "entrega": str(APP_DIR / "cache" / f"entrega-{qid}"), "creado": time.time(), "intentados": [], "entregados": []}
    Path(q["entrega"]).mkdir(parents=True, exist_ok=True)
    for j in jobs:  # para la insignia «en lote» de las tarjetas
        st = state_of(j)
        st["lote"] = {"fecha": datetime.now().isoformat(timespec="seconds"), "videos": jobs, "modo": q["modo"]}
        save_state(j, st)
    _queue_save(q)
    return q


def queue_prompt(job: str, k: int, n: int, q: dict) -> str:
    p = claude_prompt(job, "auto", "")
    rapido = MODO_RAPIDO.format(u=USUARIO) if q["modo"] == "rapido" else ""
    extra = f"INSTRUCCIONES PARA ESTE LOTE:\n{q['extra']}\n" if q.get("extra") else ""
    return (p + "\n\n" + rapido + extra
            + f"Este video es el {k} de {n} de un lote que la app edita "
              + ("de a dos a la vez" if q.get("paralelo") == 2 else "uno por uno")
              + ", cada uno en su propia ventana: haz SOLO este video. "
              + ("Otra ventana edita otro video al mismo tiempo: no toques sus archivos, y si tuvieras que transcribir, espera "
                 "a que no haya otra transcripción corriendo en la PC (una a la vez). " if q.get("paralelo") == 2 else "")
              + "El finalize deja la copia en la carpeta de entrega del lote (VE_EXPORT_DIR): la app la pasa a "
              f"Descargas cuando estén todos. Cuando termines, dile a {USUARIO} en una línea que este quedó y que puede "
              "cerrar esta ventana: la app abre sola el siguiente.")


def _video_done(job: str, inicio: float, q: dict) -> bool:
    if (Path(q["entrega"]) / f"{job}.final.mp4").exists():
        return True
    final = job_dir(job) / "outputs" / f"{job}.final.mp4"
    return final.exists() and final.stat().st_mtime >= inicio


def _activos(q: dict) -> list[dict]:
    """Los videos que Claude edita ahora, cada uno con cuándo empezó. Un lote de una versión anterior (uno por uno,
    con «actual») se pasa a esta forma solo."""
    if "activos" not in q:
        a = q.get("actual", -1)
        editando = q.get("fase") == "editando" and 0 <= a < len(q.get("jobs", []))
        q["activos"] = [{"job": q["jobs"][a], "inicio": q.get("inicio_video", 0)}] if editando else []
        q["hechos"] = q["jobs"][:a] if editando else []
    return q["activos"]


def _launch_queue_video(q: dict, job: str) -> None:
    k = q["jobs"].index(job) + 1
    pf = studio_dir(job) / "claude-contexto.txt"
    pf.write_text(_plain(queue_prompt(job, k, len(q["jobs"]), q)), encoding="utf-8")
    _activos(q).append({"job": job, "inicio": time.time()})
    launch_claude(f"{k} de {len(q['jobs'])} · {state_of(job)['titulo']}", pf, q.get("modelo", ""),
                  {"VE_EXPORT_DIR": to_posix(q["entrega"])})


def _deliver(q: dict) -> list[str]:
    """Los videos del lote, juntos a Descargas (sin pisar nada que ya esté ahí)."""
    dl = Path.home() / "Downloads"
    out = []
    for f in sorted(Path(q["entrega"]).glob("*.mp4")):
        dest, n = dl / f.name, 2
        while dest.exists():
            dest, n = dl / f"{f.stem} ({n}){f.suffix}", n + 1
        shutil.move(str(f), dest)
        out.append(dest.name)
    return out


def queue_tick() -> None:
    """Un paso de la cola (lo llama un hilo cada pocos segundos)."""
    with _queue_lock:
        q = queue_state()
        fase = q.get("fase")
        if fase == "transcribiendo":
            if TASK.running:
                return
            pend = [j for j in q["jobs"] if not (job_dir(j) / "transcript" / "words.json").exists() and j not in q["intentados"]]
            if pend:  # gratis, con la tarjeta de video; si falla, lo hace Claude en su ventana
                q["intentados"].append(pend[0])
                _queue_save(q)
                try:
                    run_step(pend[0], "transcribir", {})
                except Exception:  # noqa: BLE001
                    pass
                return
            q["fase"], q["activos"], q["hechos"] = "editando", [], []
            _queue_fill(q)
            _queue_save(q)
        elif fase == "editando":
            act = _activos(q)
            antes = (len(act), len(q["hechos"]))
            for a in list(act):
                if _video_done(a["job"], a["inicio"], q):
                    act.remove(a)
                    q["hechos"].append(a["job"])
            if q.pop("saltar", None) and act:  # «Pasar al siguiente»: el que lleva más tiempo
                q["hechos"].append(act.pop(0)["job"])
            if (len(act), len(q["hechos"])) == antes:
                return
            _queue_fill(q)
            if not act:
                q["entregados"] = _deliver(q)
                q["fase"], q["fin"] = "terminado", time.time()
                notify("Iconic Studio", f"¡Listos tus {len(q['jobs'])} videos! Están en Descargas.")
            _queue_save(q)


def _queue_fill(q: dict) -> None:
    """Abre los videos que faltan hasta tener los que van a la vez (1, o 2)."""
    act = _activos(q)
    pend = [j for j in q["jobs"] if j not in q["hechos"] and j not in {a["job"] for a in act} and (PROJECTS / j).is_dir()]
    while pend and len(act) < q.get("paralelo", 1):
        _launch_queue_video(q, pend.pop(0))
    q["actual"] = len(q["hechos"])  # para la tarjeta: «video N de M»


def queue_control(accion: str) -> dict:
    with _queue_lock:
        q = queue_state()
        if accion == "detener" and q.get("fase") in ("transcribiendo", "editando"):
            q["fase"] = "detenido"
            q["entregados"] = _deliver(q)  # lo que ya esté terminado no se pierde
        elif accion == "siguiente" and q.get("fase") == "editando":
            q["saltar"] = True
        elif accion == "cerrar" and q.get("fase") in ("terminado", "detenido"):
            q = {}
        _queue_save(q)
    return queue_status()


def queue_status() -> dict:
    q = queue_state()
    if not q:
        return {}
    vids = []
    act = {a["job"] for a in _activos(q)}
    for j in q.get("jobs", []):
        if not (PROJECTS / j).is_dir():
            continue
        estado = ("listo" if j in q["hechos"] or q["fase"] == "terminado" else
                  "editando" if j in act and q["fase"] == "editando" else
                  "transcribiendo" if q["fase"] == "transcribiendo" and TASK.running and TASK.job == j else "en fila")
        vids.append({"job": j, "titulo": state_of(j)["titulo"], "estado": estado, "avance": run_progress(j)})
    return ({k: q.get(k) for k in ("id", "fase", "actual", "modo", "modelo", "entregados", "creado", "fin")}
            | {"paralelo": q.get("paralelo", 1), "videos": vids})


def _queue_loop() -> None:
    while True:
        time.sleep(5)
        try:
            queue_tick()
        except Exception:  # noqa: BLE001 (que un error no pare la cola para siempre: se reintenta)
            pass


# --------------------------------------------------------------------------- avance de Claude (su RUN.md)

RUN_STEPS = ["Intake", "Rough cut", "Audio polish", "Color grade", "Graphics", "SFX", "Review", "Export"]
RUN_NAMES = {"Intake": "Copiar el video", "Rough cut": "Corte", "Audio polish": "Audio", "Color grade": "Color",
             "Graphics": "Gráficos y subtítulos", "SFX": "Efectos de sonido", "Review": "Revisión", "Export": "Exportar"}


def run_progress(job: str) -> dict:
    """Lo que Claude anota en projects/<job>/RUN.md (el flujo edit-video): en qué paso va cada cosa."""
    f = job_dir(job) / "RUN.md"
    if not f.exists():
        return {}
    text = f.read_text(encoding="utf-8", errors="replace")
    pasos = []
    for m in re.finditer(r"^\|\s*(\d)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|", text, re.M):
        name, status = m.group(2).strip(), m.group(3).strip().lower()
        est = ("hecho" if status.startswith(("done", "hecho")) else "saltado" if status.startswith(("skip", "n/a")) else
               "esperando" if status.startswith(("waiting", "esperando")) else
               "trabajando" if status.startswith(("in progress", "running", "working", "doing")) else "pendiente")
        pasos.append({"n": int(m.group(1)), "paso": RUN_NAMES.get(name, name), "estado": est})
    nxt = re.search(r"\*\*Next action:\*\*\s*(.+)", text)
    hechos = sum(1 for p in pasos if p["estado"] in ("hecho", "saltado"))
    return {"pasos": pasos, "siguiente": nxt.group(1).strip()[:200] if nxt else "", "hechos": hechos, "total": len(pasos),
            "modificado": f.stat().st_mtime}


# --------------------------------------------------------------------------- comentarios sobre el video

def comments_file(job: str) -> Path:
    return studio_dir(job) / "comentarios.json"


def send_comments(job: str) -> None:
    """Los comentarios con su minuto, todos juntos en un solo mensaje a Claude (más barato que ir y volver)."""
    items = read_json(comments_file(job), [])
    if not items:
        raise ValueError("todavía no escribiste ningún comentario")
    fmt = lambda t: f"{int(t // 60)}:{int(t % 60):02d}"  # noqa: E731
    texto = ("Comentarios en momentos exactos del video terminado (outputs/<job>.final.mp4; el minuto es del video final):\n"
             + "\n".join(f"- [{fmt(float(c['t']))}] {c['texto']}" for c in sorted(items, key=lambda c: float(c["t"]))))
    open_claude(job, "comentarios", texto)
    hist = read_json(studio_dir(job) / "comentarios-enviados.json", [])
    hist.append({"fecha": datetime.now().isoformat(timespec="seconds"), "comentarios": items})
    write_json(studio_dir(job) / "comentarios-enviados.json", hist)
    write_json(comments_file(job), [])


# --------------------------------------------------------------------------- aprender el estilo de una carpeta

def learn_style(gid: str) -> None:
    d = assets_dir("grupo", gid)
    jobs = [p.name for p in PROJECTS.iterdir() if p.is_dir() and not p.name.startswith(("_", "."))
            and state_of(p.name).get("grupo") == gid and (p / "outputs" / f"{p.name}.final.mp4").exists()]
    if not jobs:
        raise ValueError("esta carpeta todavía no tiene videos terminados de los que aprender")
    d.mkdir(parents=True, exist_ok=True)
    had = (d / STYLE_FILE).exists()
    pf = APP_DIR / "cache" / f"aprender-{gid}.txt"
    pf.parent.mkdir(exist_ok=True)
    pf.write_text(_plain(
        f"Te escribe la app Iconic Studio ({APP_DIR}) de parte de {USUARIO}. "
        f"Recuerda: {USUARIO} no es de perfil técnico. Háblale en español sencillo, frases cortas, sin comandos ni rutas.\n\n"
        f"PEDIDO: aprende el estilo de edición de la carpeta «{group_name(gid)}» (una campaña), para que los próximos "
        "videos de esta carpeta salgan igual y gastando menos. "
        f"{'Ya hay un ESTILO.md: actualízalo con lo nuevo, sin perder lo que sigue valiendo. ' if had else ''}"
        f"Estudia sus videos terminados: {', '.join('projects/' + j for j in jobs)} — de cada uno su RUN.md, "
        "graphics-plan.json/.md, el plan de sonidos, lo que hay en hf-graphics/ (scripts, comps, ajustes de subtítulos), "
        f"y lo que {USUARIO} comentó (studio/comentarios-enviados.json, si hay). Mira también las instrucciones y assets "
        f"de la carpeta (projects/_grupos/{gid}/ASSETS.md) y my-rules.md.\n"
        f"Escribe projects/_grupos/{gid}/{STYLE_FILE}: una receta corta y concreta para que otra sesión de Claude edite un "
        "video NUEVO de esta campaña sin volver a decidir lo ya decidido: formato y preset; ritmo de corte; subtítulos "
        "(estilo, tamaño, palabras resaltadas); gráficos (qué tipo, dónde, cuántos, con ejemplos); efectos de sonido; "
        "gancho; colores y letras; qué aprobó y qué pidió cambiar. Y una sección «Piezas para reutilizar» con lo ya "
        f"probado: copia los scripts, comps o plantillas que sirvan a projects/_grupos/{gid}/plantilla/ (para que no "
        "dependan de un video) y explica cómo usarlos. No cambies ningún video. "
        "Al final dile en dos frases qué aprendiste y que desde ahora los videos de esa carpeta lo usan solos."), encoding="utf-8")
    launch_claude(f"aprender el estilo · {group_name(gid)}", pf)


def style_info(gid: str) -> dict:
    f = assets_dir("grupo", gid) / STYLE_FILE
    done = [p.name for p in PROJECTS.iterdir() if p.is_dir() and not p.name.startswith(("_", "."))
            and state_of(p.name).get("grupo") == gid and (p / "outputs" / f"{p.name}.final.mp4").exists()]
    return {"existe": f.exists(), "fecha": datetime.fromtimestamp(f.stat().st_mtime).isoformat(timespec="minutes") if f.exists() else "",
            "terminados": len(done)}


# --------------------------------------------------------------------------- aviso de Windows

def notify(titulo: str, texto: str) -> None:
    """Una notificación de Windows (la de la esquina), sin instalar nada."""
    if MAC:
        subprocess.Popen(["osascript", "-e", "on run argv", "-e",
                          "display notification (item 2 of argv) with title (item 1 of argv)", "-e", "end run",
                          titulo, texto])
        return
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace("'", "&apos;")  # noqa: E731
    ps = ("[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; "
          "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null; "
          "$x = New-Object Windows.Data.Xml.Dom.XmlDocument; "
          f"$x.LoadXml('<toast><visual><binding template=\"ToastGeneric\"><text>{esc(titulo)}</text><text>{esc(texto)}</text>"
          "</binding></visual></toast>'); "
          "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("
          "'{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show("
          "[Windows.UI.Notifications.ToastNotification]::new($x))")
    try:
        subprocess.Popen(["powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], creationflags=NO_WINDOW)
    except OSError:
        pass


def claude_env() -> dict:
    # sin las variables de una sesión de Claude Desktop (si la app se abrió desde ahí), Claude Code las tomaría por suyas
    env = {k: v for k, v in os.environ.items()
           if not k.upper().startswith(("CLAUDE", "ANTHROPIC", "AI_AGENT", "MCP_", "VIRTUAL_ENV", "UV_RUN"))}
    # tampoco el Python de la propia app (uv run lo pone primero en el PATH)
    venv = os.path.normcase(sys.prefix)
    for key in [k for k in env if k.upper() == "PATH"]:
        env[key] = os.pathsep.join(p for p in env[key].split(os.pathsep) if not os.path.normcase(p).startswith(venv))
    return env


# --------------------------------------------------------------------------- cuenta de Claude
# La cuenta con la que entra Claude Code en esta PC (la que usan las ventanas negras de la app). Claude Desktop
# tiene su propio inicio de sesión aparte. Los videos, el estilo y las instrucciones no dependen de la cuenta.

def _claude_auth(*args: str, timeout: int = 40) -> subprocess.CompletedProcess:
    exe = find_claude()
    if not exe:
        raise RuntimeError(CLAUDE_FALTA)
    return subprocess.run([exe, "auth", *args], env=claude_env(), cwd=EDITOR, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=timeout, creationflags=NO_WINDOW)


def account_status() -> dict:
    if not find_claude():
        return {"instalado": False, "conectado": False}
    try:
        j = json.loads(_claude_auth("status", "--json").stdout or "{}")
    except (ValueError, subprocess.TimeoutExpired):
        j = {}
    return {"instalado": True, "conectado": bool(j.get("loggedIn")), "correo": j.get("email", ""),
            "nombre": j.get("orgName", ""), "plan": j.get("subscriptionType", ""), "metodo": j.get("authMethod", "")}


def account_logout() -> dict:
    out = _claude_auth("logout")
    if out.returncode != 0:
        raise RuntimeError("no se pudo cerrar la sesión: " + (out.stdout + out.stderr).strip()[-200:])
    return account_status()


def account_login(email: str = "") -> None:
    """Abre una ventana con el inicio de sesión de Claude (se completa en el navegador)."""
    exe = find_claude()
    if not exe:
        raise RuntimeError(CLAUDE_FALTA)
    email = re.sub(r"[^\w.@+-]", "", email)[:120]
    if MAC:
        import shlex
        open_terminal("Claude · iniciar sesión", [
            "echo 'Se va a abrir el navegador: entra con TU cuenta de Claude y acepta.'",
            f"{shlex.quote(exe)} auth login --claudeai{f' --email {email}' if email else ''}",
            "echo; echo 'Listo. Ya puedes cerrar esta ventana.'"])
        return
    ps = ("$Host.UI.RawUI.WindowTitle = 'Claude · iniciar sesión'; [Console]::OutputEncoding = [Text.Encoding]::UTF8; "
          "Write-Host 'Se va a abrir el navegador: entra con TU cuenta de Claude y acepta.' -ForegroundColor Cyan; "
          f"& '{exe}' auth login --claudeai{f' --email {email}' if email else ''}; "
          "Write-Host ''; Write-Host 'Listo. Ya puedes cerrar esta ventana.' -ForegroundColor Green; "
          "Start-Sleep -Seconds 8")
    subprocess.Popen(["powershell.exe", "-NoProfile", "-Command", ps], cwd=EDITOR, env=claude_env(),
                     creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0))


def open_path(p: Path) -> None:
    if MAC:
        subprocess.Popen(["open", str(p)])
    else:
        os.startfile(str(p))  # noqa: S606


def reveal(p: Path) -> None:
    """El archivo marcado en su carpeta."""
    if MAC:
        subprocess.Popen(["open", "-R", str(p)])
    else:
        subprocess.Popen(["explorer.exe", f"/select,{p}"])


def probe_clip(path: Path) -> dict:
    """Tamaño como se ve (con la rotación aplicada), duración y si tiene sonido."""
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                          "format=duration:stream=codec_type,width,height:stream_side_data=rotation",
                          "-of", "json", str(path)], capture_output=True, text=True, creationflags=NO_WINDOW)
    j = json.loads(out.stdout or "{}")
    v = next((s for s in j.get("streams", []) if s.get("codec_type") == "video"), {})
    w, h = v.get("width", 1080), v.get("height", 1920)
    rot = next((sd.get("rotation") for sd in v.get("side_data_list", []) if "rotation" in sd), 0)
    if abs(int(rot or 0)) % 180 == 90:
        w, h = h, w
    return {"w": w, "h": h, "dur": float(j.get("format", {}).get("duration", 0) or 0),
            "audio": any(s.get("codec_type") == "audio" for s in j.get("streams", []))}


def probe_size(path: Path) -> tuple[int, int]:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                          "-of", "json", str(path)], capture_output=True, text=True, creationflags=NO_WINDOW)
    s = json.loads(out.stdout)["streams"][0]
    return s["width"], s["height"]


def make_preview(t: Task, job: str, overlay: Path | None, name: str) -> int:
    """Vista previa 720p del corte (desde la copia ligera), con la capa de subtítulos encima si se da."""
    sd = studio_dir(job)
    proxy = sd / "proxy.mp4"
    segs = read_json(job_dir(job) / "transcript" / "cuts.json", {}).get("segments", [])
    if not proxy.exists() or not segs:
        t.say("  (sin vista previa: falta la copia ligera o el corte)")
        return 0
    t.say("▸ armando la vista previa…")
    w, h = probe_size(proxy)
    off = offsets(job)  # cada tramo está en el tiempo de su archivo; en la copia ligera las partes van seguidas
    parts, labels = [], []
    for i, s in enumerate(segs):
        o = off.get(s["clip"], 0.0)
        a, b = round(s["start"] + o, 3), round(s["end"] + o, 3)
        parts.append(f"[0:v]trim=start={a}:end={b},setpts=PTS-STARTPTS[v{i}];"
                     f"[0:a]atrim=start={a}:end={b},asetpts=PTS-STARTPTS[a{i}];")
        labels.append(f"[v{i}][a{i}]")
    graph = "".join(parts) + "".join(labels) + f"concat=n={len(segs)}:v=1:a=1[vc][ac]"
    inputs = ["-i", str(proxy)]
    if overlay and overlay.exists():
        graph += f";[1:v]scale={w}:{h}[s];[vc][s]overlay=format=auto:eof_action=pass,format=yuv420p[vo]"
        inputs += ["-i", str(overlay)]
        vout = "[vo]"
    else:
        vout = "[vc]"
    script = sd / "preview-graph.txt"
    script.write_text(graph, encoding="utf-8")
    code = t._popen(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs, "-/filter_complex", str(script),
                     "-map", vout, "-map", "[ac]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "27",
                     "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(sd / name)], {})
    if code == 0:
        t.say("  ✓ vista previa lista")
    return code


def restore_cuts(t: Task, d: Path, work: Path) -> int:
    """splice.sh lee el corte desde /tmp; Windows puede haberlo limpiado. Se repone el del proyecto."""
    edl = d / "transcript" / "cuts.json"
    if not edl.exists():
        t.say("✗ primero aplica el corte")
        return 1
    work.mkdir(parents=True, exist_ok=True)
    shutil.copy2(edl, work / "cuts.json")
    return 0


def promote_final(t: Task, job: str) -> int:
    out = job_dir(job) / "outputs"
    base = out / f"{job}.mp4"
    if not base.exists():
        t.say("✗ no se generó el render")
        return 1
    final = out / f"{job}.final.mp4"
    if subs_on(job):
        t.say("▸ quemando los subtítulos en el video final…")
        w, h = probe_size(base)
        code = t._popen(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(base),
                         "-i", str(subs_alpha(job)), "-filter_complex",
                         f"[1:v]scale={w}:{h}[s];[0:v][s]overlay=format=auto:eof_action=pass,format=yuv420p[v]",
                         "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                         "-c:a", "copy", "-movflags", "+faststart", str(final)], {})
        if code != 0:
            return code
    else:
        shutil.copy2(base, final)
    dl = Path.home() / "Downloads" / f"{job}.final.mp4"
    shutil.copy2(final, dl)
    t.say(f"  ✓ video final: {final}")
    t.say(f"  ✓ copia lista para subir: {dl}")
    return 0

# --------------------------------------------------------------------------- servidor


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except UnicodeDecodeError:  # algunos clientes de Windows mandan cp1252
            return json.loads(raw.decode("cp1252"))

    def _file(self, path: Path):
        if not path.is_file():
            return self._json({"error": "no existe"}, 404)
        size = path.stat().st_size
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        rng = self.headers.get("Range")
        start, end = 0, size - 1
        if rng and rng.startswith("bytes="):
            a, _, b = rng[6:].partition("-")
            start = int(a) if a else max(0, size - int(b))
            end = int(b) if a and b else size - 1
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        with path.open("rb") as f:
            f.seek(start)
            left = end - start + 1
            try:
                while left > 0:
                    chunk = f.read(min(1 << 16, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
            except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
                pass

    def do_GET(self):
        try:
            self._get(urlparse(self.path))
        except Exception as e:  # noqa: BLE001
            self._json({"error": str(e)}, 400)

    def do_POST(self):
        try:
            self._post(urlparse(self.path))
        except Exception as e:  # noqa: BLE001
            self._json({"error": str(e)}, 400)

    def _get(self, url):
        parts = [unquote(p) for p in url.path.strip("/").split("/") if p]
        if not parts:
            return self._file(UI_DIR / "index.html")
        if parts[0] == "ui":
            p = (UI_DIR / "/".join(parts[1:])).resolve()
            return self._file(p) if UI_DIR in p.parents else self._json({}, 404)
        if parts[0] == "media" and len(parts) == 3 and parts[2] == "final.mp4":
            return self._file(job_dir(parts[1]) / "outputs" / f"{parts[1]}.final.mp4")
        if parts[0] == "media" and len(parts) == 3 and parts[2] in MEDIA:
            return self._file(studio_dir(parts[1]) / parts[2])
        if parts[:2] == ["api", "projects"]:
            return self._json({"proyectos": list_projects(), "editor": str(EDITOR), "usuario": USUARIO,
                               "claude": bool(find_claude()), "instalacion": setup_state()})
        if parts[:2] == ["api", "reglas"]:
            return self._json({"reglas": read_rules()})
        if parts[:2] == ["api", "grupos"]:
            return self._json({"grupos": read_groups()})
        if parts[:2] == ["api", "cuenta"]:
            return self._json(account_status())
        if parts[:2] == ["api", "cola"]:
            return self._json(queue_status())
        if parts[:2] == ["api", "grupo"] and len(parts) == 4 and parts[3] == "estilo":
            return self._json(style_info(parts[2]))
        if parts[:2] == ["api", "instalacion"]:
            return self._json({**setup_state(), "usuario": USUARIO, "claude": bool(find_claude())})
        if parts[:2] == ["api", "actualizacion"]:
            return self._json(check_update(force="force=1" in url.query))
        if parts[0] == "asset" and len(parts) == 4 and parts[1] in ASSET_SCOPES:  # vista previa de un asset
            d = assets_dir(parts[1], parts[2])
            return self._file(d / Path(parts[3]).name)
        if parts[:2] == ["api", "assets"] and len(parts) == 4 and parts[2] in ASSET_SCOPES:
            return self._json({"assets": read_assets(parts[2], parts[3]), "tipos": sorted(set(ASSET_KIND.values())),
                               "instrucciones": read_instr(parts[2], parts[3])})
        if parts[:2] == ["api", "task"]:
            since = int((url.query.partition("since=")[2] or "0").split("&")[0])
            snap = TASK.snapshot(since)
            if TASK.job and TASK.step in STEP_COST and (PROJECTS / TASK.job).is_dir():  # tiempo estimado, para la cuenta regresiva
                try:
                    snap["estimado"] = estimates(TASK.job)["pasos"][TASK.step]
                except Exception:  # noqa: BLE001
                    pass
            return self._json(snap)
        if parts[0] == "api" and parts[1] == "project" and len(parts) >= 3:
            job = parts[2]
            if len(parts) == 3:
                return self._json(project_summary(job))
            if parts[3] == "words":
                edits = read_json(studio_dir(job) / "edits.json", {"borradas": []})
                return self._json({"palabras": flat_words(job), "borradas": edits.get("borradas", []),
                                   "versiones": edits.get("versiones", [])})
            if parts[3] == "avance":
                return self._json(run_progress(job))
            if parts[3] == "comentarios":
                return self._json({"comentarios": read_json(comments_file(job), [])})
            if parts[3] == "log":
                p = studio_dir(job) / "logs" / f"{parts[4]}.log"
                return self._json({"lines": p.read_text(encoding="utf-8").splitlines() if p.exists() else []})
        self._json({"error": "ruta desconocida"}, 404)

    def _post(self, url):
        parts = [unquote(p) for p in url.path.strip("/").split("/") if p]
        body = self._body()
        if parts[:2] == ["api", "grupos"]:
            clean = [{"id": str(g.get("id") or slugify(g.get("nombre", ""))), "nombre": str(g.get("nombre", "")).strip()[:40],
                      "color": str(g.get("color", "#6c8cff"))[:9], "emoji": str(g.get("emoji", "📁"))[:4]}
                     for g in body.get("grupos", []) if str(g.get("nombre", "")).strip()]
            write_json(GROUPS_FILE, clean)
            return self._json({"grupos": clean})
        if parts[:2] == ["api", "instrucciones"] and len(parts) == 4 and parts[2] in ASSET_SCOPES:
            return self._json({"texto": save_instr(parts[2], parts[3], body.get("texto", ""))})
        if parts[:2] == ["api", "assets"] and len(parts) == 4 and parts[2] in ASSET_SCOPES:
            scope, ident = parts[2], parts[3]
            if body.get("abrir"):
                d = assets_dir(scope, ident)
                d.mkdir(parents=True, exist_ok=True)
                open_path(d)
                return self._json({"ok": True})
            if body.get("agregar"):
                return self._json({"assets": add_asset_files(scope, ident, [str(s) for s in body["agregar"]])})
            return self._json({"assets": save_assets(scope, ident, list(body.get("assets", [])))})
        if parts[:2] == ["api", "reglas"]:
            write_rules([str(r) for r in body.get("reglas", [])])
            return self._json({"reglas": read_rules()})
        if parts[:2] == ["api", "usuario"]:
            set_usuario(body.get("nombre", ""))
            return self._json({"usuario": USUARIO})
        if parts[:2] == ["api", "instalar"]:
            open_setup()
            return self._json({"ok": True})
        if parts[:2] == ["api", "actualizar"]:
            return self._json(apply_update())
        if parts[:2] == ["api", "cuenta"]:
            if body.get("accion") == "salir":
                return self._json(account_logout())
            if body.get("accion") == "entrar":
                account_login(str(body.get("correo", "")))
                return self._json({"ok": True})
            return self._json(account_status())
        if parts[:2] == ["api", "cola"]:
            return self._json(queue_control(str(body.get("accion", ""))))
        if parts[:2] == ["api", "grupo"] and len(parts) == 4 and parts[3] == "aprender":
            learn_style(parts[2])
            return self._json({"ok": True})
        if parts[:2] == ["api", "lote"]:
            start_queue([str(j) for j in body.get("jobs", [])], str(body.get("instrucciones", "")),
                        str(body.get("modo", "completo")), str(body.get("modelo", "")), int(body.get("paralelo") or 1))
            return self._json({"ok": True})
        if parts[:2] == ["api", "projects"]:
            origen = body.get("origenes") or [body.get("origen", "")]
            if body.get("separados") and len(origen) > 1:
                return self._json(create_projects([str(o) for o in origen], body.get("titulo", "").strip(),
                                                  body.get("idioma", CFG["idioma"]), str(body.get("grupo", ""))))
            return self._json(create_project([str(o) for o in origen], body.get("titulo", "").strip(),
                                             body.get("idioma", CFG["idioma"]), str(body.get("grupo", ""))))
        if parts[0] == "api" and parts[1] == "project":
            job = parts[2]
            action = parts[3]
            if action == "state":
                st = state_of(job)
                for k in ("titulo", "notas", "idioma", "grupo"):
                    if k in body:
                        st[k] = body[k]
                save_state(job, st)
                return self._json(project_summary(job))
            if action == "edits":
                path = studio_dir(job) / "edits.json"
                edits = read_json(path, {"borradas": [], "versiones": []})
                edits["borradas"] = sorted(set(int(i) for i in body.get("borradas", [])))
                if body.get("guardar_version"):
                    edits.setdefault("versiones", []).append(
                        {"nombre": body["guardar_version"], "fecha": datetime.now().isoformat(timespec="seconds"),
                         "borradas": edits["borradas"]})
                write_json(path, edits)
                if not TASK.running:
                    mark(job, "editar", "hecho")
                return self._json({"ok": True, "versiones": edits.get("versiones", [])})
            if action == "run":
                run_step(job, parts[4], body)
                return self._json({"ok": True})
            if action == "partes":
                if body.get("agregar"):
                    add_parts(job, [str(s) for s in body["agregar"]])
                else:
                    edit_parts(job, body.get("orden"), body.get("quitar"))
                return self._json({"ok": True})
            if action == "comentarios":
                if body.get("enviar"):
                    send_comments(job)
                    return self._json({"ok": True, "comentarios": []})
                clean = [{"t": round(float(c.get("t", 0)), 2), "texto": str(c.get("texto", "")).strip()[:1000]}
                         for c in body.get("comentarios", []) if str(c.get("texto", "")).strip()]
                write_json(comments_file(job), clean)
                return self._json({"comentarios": clean})
            if action == "claude":
                open_claude(job, body.get("modo", "libre"), str(body.get("texto", "")))
                return self._json({"ok": True})
            if action == "borrar":
                return self._json(delete_project(job))
            if action == "mostrar":  # el video terminado (o el original) marcado en el explorador
                d = job_dir(job)
                final = d / "outputs" / f"{job}.final.mp4"
                target = final if final.exists() else raw_clip(job)
                if target:
                    reveal(target)
                else:
                    open_path(d)
                return self._json({"ok": True})
            if action == "open":
                target = job_dir(job) / (body.get("sub") or "")
                open_path(target)
                return self._json({"ok": True})
        self._json({"error": "ruta desconocida"}, 404)


class Api:
    """Funciones nativas para la ventana (diálogo de archivos).
    La ventana va en un atributo privado: pywebview recorre los públicos y se pierde en el objeto nativo."""

    _window = None

    def elegir_video(self):
        """Uno o varios videos (Ctrl o Shift para elegir varios en la ventana de Windows)."""
        import webview
        res = self._window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=True,
            file_types=("Videos (*.mp4;*.mov;*.mkv;*.m4v)", "Todos (*.*)"))
        return list(res) if res else []

    def elegir_assets(self):
        """Fotos, videos, logos, audio, tipografías o PDF para la sección de assets."""
        import webview
        exts = ";".join(f"*{e}" for e in ASSET_KIND)
        # pywebview solo acepta letras y espacios en la descripción del filtro: una coma lo rompe y el diálogo no abre
        res = self._window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=True,
            file_types=(f"Fotos videos audio y letras ({exts})", "Todos (*.*)"))
        return list(res) if res else []


def bind_drop(window) -> None:
    """Archivos arrastrados desde el explorador: el navegador no da su ruta, pywebview sí, pero solo a un manejador
    de «drop» registrado desde Python. La ruta se le pasa a la página (onFilesDropped), que decide qué hacer."""
    from webview.dom import DOMEventHandler

    def on_drop(e):
        files = (e.get("dataTransfer") or {}).get("files") or []
        paths = [f["pywebviewFullPath"] for f in files if f.get("pywebviewFullPath")]
        if paths:
            window.evaluate_js(f"window.onFilesDropped && window.onFilesDropped({json.dumps(paths)})")

    try:
        window.dom.document.events.drop += DOMEventHandler(on_drop, prevent_default=True)
    except Exception:  # noqa: BLE001  (sin arrastrar no pasa nada: queda el botón de elegir)
        pass


def refresh_shortcut_icons() -> None:
    """Los accesos directos del .exe (escritorio, menú Inicio y el anclado a la barra de tareas) con el ícono de
    icono.ico. El .exe trae su ícono adentro y una actualización de un clic no lo cambia; icono.ico sí llega con cada
    versión, así que el ícono nuevo se ve también en las PCs que actualizan con el botón. Si cambió alguno, se le pide
    a Windows que repinte los íconos (si no, sigue mostrando el viejo de su memoria hasta reiniciar)."""
    if os.name != "nt" or not getattr(sys, "frozen", False) or not (APP_DIR / "icono.ico").exists():
        return
    ico = f"{APP_DIR / 'icono.ico'},0"
    ps = ("$sh = New-Object -ComObject WScript.Shell; $n = 0; "
          "$dirs = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'), "
          r"(Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')); "
          "foreach ($d in $dirs) { Get-ChildItem -LiteralPath $d -Filter '*.lnk' -Recurse -Depth 1 -ErrorAction SilentlyContinue | "
          "ForEach-Object { $l = $sh.CreateShortcut($_.FullName); "
          f"if ($l.TargetPath -eq '{sys.executable}' -and $l.IconLocation -ne '{ico}') "
          f"{{ $l.IconLocation = '{ico}'; $l.Save(); $n++ }} }} }}; "
          "if ($n -gt 0) { & ie4uinit.exe -show }")
    try:
        subprocess.Popen(["powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], creationflags=NO_WINDOW)
    except OSError:
        pass


def set_window_icon() -> None:
    """El ícono de la ventana abierta y de su botón en la barra de tareas, desde icono.ico: así el ícono nuevo se ve
    ahí aunque el .exe traiga el viejo adentro (y también al abrir la app con uv, que mostraría el de Python).
    Solo las ventanas de ESTE proceso: si la app está abierta dos veces, cada una cambia la suya."""
    ico = APP_DIR / "icono.ico"
    if os.name != "nt" or not ico.exists():
        return
    import ctypes
    from ctypes import wintypes
    u = ctypes.windll.user32
    u.LoadImageW.restype = ctypes.c_void_p
    u.SendMessageW.argtypes = [wintypes.HWND, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]
    mine = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def each(hwnd, _):
        pid = wintypes.DWORD()
        u.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value == os.getpid() and u.IsWindowVisible(hwnd) and u.GetWindowTextLengthW(hwnd):
            mine.append(hwnd)
        return True

    for _ in range(40):  # la ventana tarda un poco en existir
        mine.clear()
        u.EnumWindows(each, 0)
        if mine:
            for hwnd in mine:
                for kind, size in ((1, 256), (0, 32)):  # ICON_BIG, ICON_SMALL
                    h = u.LoadImageW(None, str(ico), 1, size, size, 0x10)  # IMAGE_ICON, LR_LOADFROMFILE
                    if h:
                        u.SendMessageW(hwnd, 0x80, kind, h)  # WM_SETICON
            return
        time.sleep(0.25)


class ExclusiveServer(ThreadingHTTPServer):
    """Sin compartir el puerto: en Windows, SO_REUSEADDR (lo que usa http.server) deja que dos programas tomen el
    mismo puerto y el segundo le roba las conexiones al primero. Así, si ya está tomado, falla y se usa otro."""
    allow_reuse_address = os.name != "nt"  # en Mac/Linux SO_REUSEADDR no deja compartirlo, y sin él no reabre enseguida

    def server_bind(self):
        import socket
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main():
    try:
        ensure_app_rules()
    except OSError:
        pass
    refresh_shortcut_icons()
    port = int(sys.argv[sys.argv.index("--serve") + 1]) if "--serve" in sys.argv else 0
    if port:
        server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    else:
        # siempre la misma dirección: la página guarda lo ya visto (el recorrido, la apariencia, «no volver a mostrar»)
        # por dirección, y con un puerto distinto en cada arranque lo olvidaba todo. Si está ocupado (la app ya
        # abierta dos veces), uno libre cualquiera.
        try:
            server = ExclusiveServer(("127.0.0.1", APP_PORT), Handler)
        except OSError:
            server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    if port:  # solo servidor (pruebas)
        threading.Thread(target=_queue_loop, daemon=True).start()
        print(url, flush=True)
        server.serve_forever()
    threading.Thread(target=server.serve_forever, daemon=True).start()
    threading.Thread(target=_queue_loop, daemon=True).start()  # la cola de lotes sigue aunque se haya cerrado la app
    if "--browser" in sys.argv:
        print(url)
        webbrowser.open(url)
        threading.Event().wait()
    try:
        import webview
    except ImportError:
        webbrowser.open(url)
        threading.Event().wait()
    api = Api()
    api._window = webview.create_window("Iconic Studio", url, js_api=api, width=1440, height=900,
                                       min_size=(1100, 700), background_color="#0f1115")
    api._window.events.loaded += lambda: bind_drop(api._window)
    api._window.events.shown += lambda: threading.Thread(target=set_window_icon, daemon=True).start()
    # sin modo privado (el de pywebview por defecto): así recuerda el recorrido visto, los colores elegidos, etc.
    webview.start(private_mode=False, storage_path=str(APP_DIR / "cache" / "webview"))


if __name__ == "__main__":
    main()
