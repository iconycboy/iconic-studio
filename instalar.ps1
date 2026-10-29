# Iconic Studio — instalador para Windows. Lo abre INSTALAR.cmd (doble clic).
# Copia el programa a C:\Users\<tú>\EditorDeVideo (corto y fuera de OneDrive, como pide el editor), instala lo que
# falte con winget (Git, uv, Claude Code), crea el acceso directo del escritorio y abre la app. La app termina la
# instalación del editor con Claude (su setup.sh) cuando tocas «Terminar de instalar».
#
#   -Destino <carpeta>   instalar en otra carpeta          -Prueba   solo copia (sin winget, acceso directo ni abrir)
param([string]$Destino = (Join-Path $env:USERPROFILE "EditorDeVideo"), [switch]$Prueba)
$ErrorActionPreference = "Stop"
$src = Split-Path -Parent $PSScriptRoot          # la carpeta del .zip: estudio\ y video-editor\
function Paso($t) { Write-Host ""; Write-Host "▸ $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  ✓ $t" -ForegroundColor Green }
function Recargar-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}

Write-Host "=============================================" -ForegroundColor Magenta
Write-Host "   Iconic Studio — instalación" -ForegroundColor Magenta
Write-Host "=============================================" -ForegroundColor Magenta

if (-not (Test-Path (Join-Path $src "video-editor\CLAUDE.md"))) {
  throw "No encuentro la carpeta video-editor junto a esta. Descomprime el .zip completo (clic derecho → Extraer todo) y vuelve a intentarlo."
}
if ($Destino.Length -gt 60) { throw "La carpeta de destino es muy larga ($Destino). Usa una más corta." }
if ($Destino -match "OneDrive|\\Documents|\\Documentos|\\Desktop|\\Escritorio") {
  throw "No instales en OneDrive, Documentos ni el Escritorio (Windows bloquea ahí al editor). Usa la carpeta de siempre: $env:USERPROFILE\EditorDeVideo"
}

# 1. copiar el programa (sin pisar tus videos, tu estilo ni tus ajustes si ya estaba instalado)
Paso "Copiando el programa a $Destino"
New-Item -ItemType Directory -Force $Destino | Out-Null
$same = (Resolve-Path $src).Path.TrimEnd("\") -eq (Resolve-Path $Destino).Path.TrimEnd("\")
if (-not $same) {
  robocopy (Join-Path $src "estudio") (Join-Path $Destino "estudio") /E /NFL /NDL /NJH /NJS /NP /XF config.json grupos.json /XD cache | Out-Null
  if (Test-Path (Join-Path $Destino "video-editor\CLAUDE.md")) {
    Ok "El editor ya estaba instalado: se deja como está (para actualizarlo, pídeselo a Claude: «update»)."
  } else {
    robocopy (Join-Path $src "video-editor") (Join-Path $Destino "video-editor") /E /NFL /NDL /NJH /NJS /NP | Out-Null
  }
  if ($LASTEXITCODE -ge 8) { throw "No se pudo copiar el programa (robocopy $LASTEXITCODE)." }
}
Ok "Programa copiado"
if ($Prueba) { Ok "Modo prueba: listo (sin instalar nada más)."; exit 0 }

# 2. lo que hace falta, con winget (puede pedir permiso: toca «Sí»)
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw "Falta «winget» (Instalador de aplicaciones). Instálalo desde la Microsoft Store («App Installer») y vuelve a intentarlo."
}
$apps = @(
  @{ id = "Git.Git";              nombre = "Git (lo usa el editor por dentro)"; cmd = "git" },
  @{ id = "astral-sh.uv";         nombre = "uv (para abrir la app)";            cmd = "uv" },
  @{ id = "Anthropic.ClaudeCode"; nombre = "Claude Code";                       cmd = "claude" }
)
foreach ($a in $apps) {
  Recargar-Path
  if (Get-Command $a.cmd -ErrorAction SilentlyContinue) { Ok "$($a.nombre): ya está"; continue }
  Paso "Instalando $($a.nombre)… (si Windows pregunta si permites cambios, toca «Sí»)"
  winget install --exact --id $a.id --silent --accept-package-agreements --accept-source-agreements
  Recargar-Path
  if (Get-Command $a.cmd -ErrorAction SilentlyContinue) { Ok "$($a.nombre) instalado" }
  else { Write-Host "  ! $($a.nombre) se instaló pero esta ventana todavía no lo ve; se arregla al reiniciar la PC." -ForegroundColor Yellow }
}

# 3. acceso directo en el escritorio (abre la app sin ventana negra)
Paso "Creando el acceso directo «Iconic Studio» en el escritorio"
$uvw = (Get-Command uvw -ErrorAction SilentlyContinue).Source
if (-not $uvw) { $uvw = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\astral-sh.uv*\uvw.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName }
$app = Join-Path $Destino "estudio\app.py"
$desk = [Environment]::GetFolderPath("Desktop")
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desk "Iconic Studio.lnk"))
if ($uvw) { $lnk.TargetPath = $uvw; $lnk.Arguments = "run `"$app`"" }
else { $lnk.TargetPath = Join-Path $Destino "estudio\Iniciar Estudio.cmd" }
$lnk.WorkingDirectory = Join-Path $Destino "estudio"
$lnk.IconLocation = Join-Path $Destino "estudio\icono.ico"
$lnk.Description = "Iconic Studio"
$lnk.Save()
Ok "Acceso directo listo"

# 4. abrir la app (la primera vez tarda un minuto: descarga lo que necesita)
Paso "Abriendo la app… la primera vez tarda un minuto"
if ($lnk.Arguments) { Start-Process -FilePath $lnk.TargetPath -ArgumentList $lnk.Arguments -WorkingDirectory $lnk.WorkingDirectory }
else { Start-Process -FilePath $lnk.TargetPath -WorkingDirectory $lnk.WorkingDirectory }
Write-Host ""
Write-Host "¡Listo! En la app: escribe tu nombre y toca «Terminar de instalar»." -ForegroundColor Green
Write-Host "Claude termina de instalar el editor solo (10–20 minutos). Ya puedes cerrar esta ventana." -ForegroundColor Green
