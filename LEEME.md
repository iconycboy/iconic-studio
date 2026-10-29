# Iconic Studio

App de escritorio para editar videos con Claude, sobre el editor `video-editor` (que va en la carpeta de al lado).
De uso libre.

**Abrir:** doble clic en "Iconic Studio" en el escritorio
(si falla: `Iniciar Estudio.cmd` en esta carpeta, que muestra el error).

## Lo que trae

- **Primera vez**: pregunta tu nombre y, si el editor todavía no está instalado en la PC, el botón
  **⚙️ Terminar de instalar** abre Claude para que lo instale solo.
- **📁 Carpetas**: una por campaña, marca o cliente. Arrastra un video encima de una carpeta para guardarlo ahí.
  Cada carpeta tiene sus **🧩 assets** y **📝 instrucciones** (valen para todos sus videos) y el botón
  **⚡ Editar todos juntos**.
- **🏠 Inicio de cada video**: sus 🧩 assets, sus 📝 instrucciones para Claude, y dos caminos:
  - **⚡ Que Claude lo edite todo**: Claude Code edita el video completo (los 8 pasos del editor, en el chat)
    y lo exporta a Descargas.
  - **✂️ Hacerlo yo, paso a paso**: los pasos de la app (abajo).
- **⚡ Varios a la vez**: eliges varios videos y una sola ventana de Claude los edita con el mismo estilo y los
  exporta todos juntos al final.
- **💬 Cuéntale a Claude qué te gustó**: Claude corrige el video y guarda lo aprendido en tu estilo.
- **🎨 Mi estilo**: las reglas de `my-rules.md` en lenguaje simple. Las marcadas `[app]` son de la app y no se muestran.
- **👤 Cuenta de Claude**: con qué cuenta trabaja Claude, y cambiarla paso a paso.
- **⋯ en cada video**: abrir, cambiar el nombre o la carpeta, verlo en el explorador, mandarlo a la Papelera.
- **❓ Ayuda** y **recorrido guiado**.

## Pasos a mano

1. **Importar**: copia el video (o sus partes) al proyecto. El original no se toca.
2. **Transcribir**: cada palabra con su tiempo (español, inglés o portugués).
3. **Editar por texto**: tacha palabras y el video se corta. Deshacer ilimitado y versiones guardadas.
4. **Aplicar corte**: el editor ajusta cada corte al audio real y quita silencios largos.
5. **Audio**: volumen de voz parejo.
6. **Subtítulos**: salen de la transcripción del corte, con un título opcional arriba.
7. **Enviar a CapCut** (opcional): proyecto nuevo con cada parte como clip separado.
8. **Exportar MP4**: video final con subtítulos, en el proyecto y una copia en Descargas.

## Claude

Cada botón de Claude abre **Claude Code** (con la cuenta de Claude de quien la usa, plan Pro o Max) en su propia
ventana, en la carpeta del editor, con un primer mensaje que dice qué video es, en qué paso va, sus notas, assets
e instrucciones. El texto queda en `projects/<video>/studio/claude-contexto.txt`. La app vuelve a leer el proyecto
cada 5 segundos, así que lo que haga Claude aparece solo.

## Dónde queda cada cosa

- Videos: `video-editor\projects\<nombre>\` (los datos de la app, en su carpeta `studio\`)
- Assets e instrucciones de una carpeta: `video-editor\projects\_grupos\<carpeta>\`
- Tu estilo: `video-editor\my-rules.md`
- Ajustes: `config.json` (ruta del editor y tu nombre) · carpetas: `grupos.json`

Las actualizaciones del editor no tocan esta app, ni tus videos, ni tu estilo.

## Si algo falla al transcribir

Si la app se abrió desde Claude Desktop y el transcriptor dice que no encuentra Python: Claude Desktop guarda lo
que instala en una carpeta privada que otros programas no ven. Ábrela desde el acceso directo del escritorio, o
pídele a Claude que lo revise con «🆘 Pedirle ayuda a Claude».
