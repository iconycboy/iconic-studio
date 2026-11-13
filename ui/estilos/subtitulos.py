#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
"""Iconic Studio — título (hook) y subtítulos con los ESTILOS de la app (ui/estilos/estilos.json).

Usa el constructor del editor (presets/tiktok/raw/build.py: tiempos, división en frases, revisiones) y solo cambia
cómo se DIBUJA: fuente, colores, caja, posición. El hook sale completo desde el primer cuadro, sin animación.
Con --legal, el aviso legal va chico y abajo, solo en los últimos segundos.

  uv run subtitulos.py <editor>/projects/<job> --estilo amarillo --alpha --hook-text "…" [--legal-file aviso.txt]
  uv run subtitulos.py <editor>/projects/<job> --revisar <video final>     # ¿el hook está en el primer cuadro?

Las demás opciones (--until, --hook-end, --hook-only, --out, --scale, --deliver) son las del constructor del editor.
"""
import argparse, importlib.util, json, os, subprocess, sys, tempfile
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

AQUI = Path(__file__).resolve().parent
LEGAL_SEG = 4.0        # el aviso legal sale en los últimos segundos
LEGAL_TAM = 28
LEGAL_BASE_Y = 1612    # borde de abajo del aviso (dentro de la zona segura)


def rgba(h, default=(255, 255, 255, 255)):
    if not h:
        return default
    h = h.lstrip("#")
    if len(h) == 6:
        h += "ff"
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4, 6))


def cargar(editor: Path):
    spec = importlib.util.spec_from_file_location("ve_build", editor / "presets" / "tiktok" / "raw" / "build.py")
    B = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(B)
    falta = [k for k in ("build", "chunk_lines", "render_caption", "render_hook", "load_font", "crop", "wrap_to_width",
                         "SCALE_KEYS", "CAP_MAX_WORDS", "HOOK_TOP_Y") if not hasattr(B, k)]
    if falta:
        sys.exit(f"[estilos] el constructor del editor cambió (falta {', '.join(falta)}): avisa para actualizar la app")
    return B


def aplicar(B, est: dict, fuentes: dict, editor: Path, legal: str, cap_y, hook_y):
    from PIL import Image, ImageDraw, ImageFont
    hk, sb = est["hook"], est["sub"]
    fdir = editor / "assets" / "fonts"

    def fuente(clave, tam):
        f = ImageFont.truetype(str(fdir / fuentes.get(clave, fuentes["inter"])), tam)
        try:
            f.set_variation_by_name("Bold Italic")
        except Exception:  # noqa: BLE001 — solo las fuentes variables
            pass
        return f

    B.HOOK_SIZE, B.HOOK_TOP_Y = hk["tam"], int(hook_y or hk["y"])
    B.CAP_SIZE, B.CAP_CENTER_Y = sb["tam"], int(cap_y or sb["y"])
    B.CAP_MAX_WORDS, B.CAP_MAX_CHARS = sb.get("palabras", 4), sb.get("letras", 20)
    B.HOOK_WEIGHT, B.CAP_WEIGHT = "hook", "sub"
    B.load_font = lambda size, cual: fuente(hk["fuente"] if cual == "hook" else sb["fuente"], size)
    k = lambda n: max(1, int(round(n * B.W / 1080)))  # noqa: E731 — las medidas propias, a la escala del video

    estado = {"lineas": [], "n": 0}
    _chunk = B.chunk_lines

    def chunk_lines(words, hook_end):
        estado["lineas"] = _chunk(words, hook_end)
        estado["n"] = 0
        return estado["lineas"]

    def bloque(img, lineas, font, cy, color, contorno, caja, radio, gap):
        """Dibuja un bloque de texto centrado, con su centro vertical en cy."""
        d = ImageDraw.Draw(img)
        asc, desc = font.getmetrics()
        lh = asc + desc + gap
        y = cy - lh * len(lineas) / 2
        if caja:
            w = max(d.textlength(ln, font=font) for ln in lineas)
            px, py = k(22), k(10)
            d.rounded_rectangle([B.W / 2 - w / 2 - px, y - py, B.W / 2 + w / 2 + px, y + lh * len(lineas) - gap + py],
                                radius=k(radio), fill=caja)
        for ln in lineas:
            d.text((B.W / 2, y), ln, font=font, fill=color, anchor="ma",
                   stroke_width=contorno, stroke_fill=(0, 0, 0, 255))
            y += lh

    def dibujar_legal(img):
        font = fuente("inter", k(LEGAL_TAM))
        d = ImageDraw.Draw(img)
        lineas = B.wrap_to_width(legal, font, k(900), d)[:3]
        asc, desc = font.getmetrics()
        lh = asc + desc + k(4)
        y = k(LEGAL_BASE_Y) - lh * len(lineas)
        for ln in lineas:
            d.text((B.W / 2, y), ln, font=font, fill=(255, 255, 255, 215), anchor="ma",
                   stroke_width=k(2), stroke_fill=(0, 0, 0, 200))
            y += lh
        return y - lh * len(lineas)

    def render_caption(text, font, probe):
        i, ls = estado["n"], estado["lineas"]
        estado["n"] += 1
        if sb.get("mayus"):
            text = text.upper()
        lineas = B.wrap_to_width(text, font, B.CAP_MAX_W, probe)
        img = Image.new("RGBA", (B.W, B.H), (0, 0, 0, 0))
        cy = B.CAP_CENTER_Y
        con_legal = bool(legal and ls and i < len(ls) and (ls[i]["start"] >= ls[-1]["end"] - LEGAL_SEG or i == len(ls) - 1))
        if con_legal:
            top = dibujar_legal(img)
            asc, desc = font.getmetrics()
            alto = (asc + desc + B.CAP_LINE_GAP) * len(lineas)
            cy = min(cy, top - k(14) - alto / 2)  # el subtítulo nunca tapa el aviso
        bloque(img, lineas, font, cy, rgba(sb.get("color")), 0 if sb.get("caja") else k(sb.get("contorno", 4)),
               rgba(sb["caja"]) if sb.get("caja") else None, sb.get("radio", 8), B.CAP_LINE_GAP)
        return B.crop(img)

    def render_hook(text, font):
        if hk.get("mayus"):
            text = text.upper()
        probe = ImageDraw.Draw(Image.new("RGBA", (B.W, B.H)))
        inner = B.HOOK_BOX_W - 2 * B.HOOK_PAD_X
        lineas = []
        for para in text.split("\n"):
            lineas += B.wrap_to_width(para, font, inner, probe) or [""]
        asc, desc = font.getmetrics()
        lh = asc + desc + B.HOOK_LINE_GAP
        cont = 0 if hk.get("caja") else k(hk.get("contorno", 6))
        scratch = Image.new("RGBA", (B.W, B.H), (0, 0, 0, 0))
        sd, y = ImageDraw.Draw(scratch), k(120)
        for ln in lineas:
            sd.text((B.W / 2, y), ln, font=font, fill=rgba(hk.get("color")), anchor="ma",
                    stroke_width=cont, stroke_fill=(0, 0, 0, 255))
            y += lh
        bb = scratch.getbbox()
        if bb is None:
            return B.crop(Image.new("RGBA", (B.W, B.H), (0, 0, 0, 0)))
        tinta = scratch.crop(bb)
        px, py = (B.HOOK_PAD_X, B.HOOK_PAD_Y) if hk.get("caja") else (0, 0)
        bw, bh = tinta.width + 2 * px, tinta.height + 2 * py
        bx, by = (B.W - bw) // 2, max(B.HOOK_TOP_Y, B.SAFE_TOP)
        out = Image.new("RGBA", (B.W, B.H), (0, 0, 0, 0))
        if hk.get("caja"):
            ImageDraw.Draw(out).rounded_rectangle([bx, by, bx + bw, by + bh], radius=k(hk.get("radio", 22)),
                                                  fill=rgba(hk["caja"]))
        out.alpha_composite(tinta, (bx + px, by + py))
        res = B.crop(out)
        estado["hook"] = res
        return res

    B.chunk_lines, B.render_caption, B.render_hook = chunk_lines, render_caption, render_hook
    return estado


def primer_cuadro(video: Path, dest: Path) -> bool:
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(video),
                        "-frames:v", "1", str(dest)], capture_output=True)
    return r.returncode == 0 and dest.exists()


def revisar(job_dir: Path, video: Path) -> dict:
    """¿El hook que dibujó la app está, tal cual, en el primer cuadro del video terminado?"""
    from PIL import Image, ImageChops, ImageStat
    sd = job_dir / "studio"
    meta = json.loads((sd / "hook.json").read_text(encoding="utf-8")) if (sd / "hook.json").exists() else None
    if not meta or not (sd / "hook.png").exists():
        return {"hook": None, "nota": "este video no lleva título de la app"}
    with tempfile.TemporaryDirectory() as tmp:
        f0 = Path(tmp) / "f0.png"
        if not primer_cuadro(video, f0):
            return {"hook": None, "nota": "no se pudo leer el primer cuadro"}
        cuadro = Image.open(f0).convert("RGB")
    hook = Image.open(sd / "hook.png").convert("RGBA")
    s = cuadro.width / meta["ancho"]
    if abs(s - 1) > 1e-3:
        hook = hook.resize((max(1, round(hook.width * s)), max(1, round(hook.height * s))))
    x, y = round(meta["x"] * s), round(meta["y"] * s)
    zona = cuadro.crop((x, y, x + hook.width, y + hook.height))
    solido = hook.getchannel("A").point(lambda a: 255 if a > 250 else 0)
    if not solido.getbbox():
        return {"hook": None, "nota": "título sin zona sólida que comparar"}
    dif = ImageStat.Stat(ImageChops.difference(zona, hook.convert("RGB")).convert("L"), mask=solido).mean[0]
    return {"hook": dif < 45, "diferencia": round(dif, 1)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("job_dir")
    ap.add_argument("--estilo", default="clasico")
    ap.add_argument("--legal", default="")
    ap.add_argument("--legal-file", default="")
    ap.add_argument("--cap-y", type=float, default=None, help="centro vertical de los subtítulos (1080x1920), si el encuadre lo pide")
    ap.add_argument("--hook-y", type=float, default=None, help="borde de arriba del título (1080x1920)")
    ap.add_argument("--revisar", default="", help="video terminado: comprueba que el hook esté en su primer cuadro")
    ap.add_argument("--until", type=float, default=None)
    ap.add_argument("--hook-end", type=float, default=None)
    ap.add_argument("--hook-text", default="")
    ap.add_argument("--out", default=None)
    ap.add_argument("--alpha", action="store_true")
    ap.add_argument("--scale", type=float, default=None)
    ap.add_argument("--hook-only", action="store_true")
    ap.add_argument("--deliver", action="store_true")
    a = ap.parse_args()
    job_dir = Path(a.job_dir).resolve()
    job, editor = job_dir.name, job_dir.parent.parent
    if a.revisar:
        print(json.dumps(revisar(job_dir, Path(a.revisar)), ensure_ascii=False))
        return
    cfg = json.loads((AQUI / "estilos.json").read_text(encoding="utf-8"))
    est = next((e for e in cfg["estilos"] if e["id"] == a.estilo), None)
    if not est:
        sys.exit(f"[estilos] no existe el estilo «{a.estilo}». Hay: {', '.join(e['id'] for e in cfg['estilos'])}")
    legal = a.legal.strip()
    if a.legal_file:
        lf = a.legal_file
        if os.name == "nt" and len(lf) > 2 and lf[0] == "/" and lf[2] == "/":  # /c/Users/… de Git Bash
            lf = lf[1].upper() + ":" + lf[2:]
        if not Path(lf).exists():
            sys.exit(f"[estilos] no encuentro el aviso legal: {a.legal_file}")
        legal = Path(lf).read_text(encoding="utf-8").strip()
    legal = " ".join(legal.split())
    B = cargar(editor)
    estado = aplicar(B, est, cfg["fuentes"], editor, legal, a.cap_y, a.hook_y)
    if a.alpha and a.hook_only:
        out = a.out or str(job_dir / "hf-graphics" / "gfx" / "renders" / "hook-alpha.mov")
    elif a.alpha:
        out = a.out or str(job_dir / "hf-graphics" / "captions" / "renders" / "captions-alpha.mov")
    else:
        out = a.out or os.path.join(tempfile.gettempdir() if os.name == "nt" else "/tmp", "video-editor", job, "tiktok-raw", "preview.mp4")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    print(f"[estilos] estilo «{est['nombre']}»" + (" · con aviso legal al final" if legal else ""))
    B.build(str(job_dir), a.until, a.hook_end, a.hook_text, out, alpha=a.alpha, scale=a.scale, hook_only=a.hook_only,
            deliver=a.deliver)
    sd = job_dir / "studio"
    if sd.is_dir():  # para comprobar después que el título está en el primer cuadro
        if a.hook_text.strip() and estado.get("hook"):
            img, x, y = estado["hook"]
            img.save(sd / "hook.png")
            (sd / "hook.json").write_text(json.dumps({"x": x, "y": y, "ancho": B.W, "estilo": est["id"]}), encoding="utf-8")
        elif not a.hook_only:
            for f in ("hook.png", "hook.json"):
                (sd / f).unlink(missing_ok=True)


if __name__ == "__main__":
    main()
