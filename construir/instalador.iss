; Iconic Studio — instalador para Windows (Inno Setup 6). Lo compila publicar.py:
;   ISCC /DMyVersion=1.0.0 /DBuild=<carpeta de armado> instalador.iss
; <Build> trae: app\ (el .exe de PyInstaller + app.py + ui\ …) y video-editor\ (el editor listo para instalar).
;
; Instala en C:\Users\<tú>\EditorDeVideo (sin permisos de administrador; corto y fuera de OneDrive, como pide el editor).
; El editor solo se copia si todavía no está: después se actualiza solo (su update.py), y desinstalar NUNCA borra
; el editor, los videos ni el estilo. Al final instala con winget lo que falte (Git y Claude Code).

#ifndef MyVersion
  #define MyVersion "0.0.0"
#endif
#ifndef Build
  #define Build "..\build"
#endif

[Setup]
AppId={{368DB6A9-F71A-41E8-975E-EDFEF55A1AFC}
AppName=Iconic Studio
AppVersion={#MyVersion}
AppVerName=Iconic Studio {#MyVersion}
AppPublisher=Iconic Studio (uso libre)
DefaultDirName={%USERPROFILE}\EditorDeVideo
DisableDirPage=yes
DefaultGroupName=Iconic Studio
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputBaseFilename=Instalar Iconic Studio {#MyVersion}
SetupIconFile=..\icono.ico
UninstallDisplayIcon={app}\estudio\Iconic Studio.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "escritorio"; Description: "Crear un acceso directo en el escritorio"; GroupDescription: "Accesos directos:"

[Files]
; la app (se reemplaza en cada versión; config.json y grupos.json los crea la app y no se tocan)
Source: "{#Build}\app\*"; DestDir: "{app}\estudio"; Flags: ignoreversion recursesubdirs createallsubdirs
; el editor: solo si no estaba, y nunca se desinstala (adentro quedan tus videos y tu estilo)
Source: "{#Build}\video-editor\*"; DestDir: "{app}\video-editor"; Flags: ignoreversion recursesubdirs createallsubdirs uninsneveruninstall; Check: InstalarEditor

[Icons]
Name: "{group}\Iconic Studio"; Filename: "{app}\estudio\Iconic Studio.exe"; WorkingDir: "{app}\estudio"
Name: "{group}\Desinstalar Iconic Studio"; Filename: "{uninstallexe}"
Name: "{userdesktop}\Iconic Studio"; Filename: "{app}\estudio\Iconic Studio.exe"; WorkingDir: "{app}\estudio"; Tasks: escritorio

[Run]
Filename: "{code:Winget}"; Parameters: "install --exact --id Git.Git --silent --accept-package-agreements --accept-source-agreements"; StatusMsg: "Instalando Git (lo usa el editor por dentro)… si Windows pregunta si permites cambios, toca «Sí»"; Flags: waituntilterminated runhidden; Check: FaltaGit
Filename: "{code:Winget}"; Parameters: "install --exact --id Anthropic.ClaudeCode --silent --accept-package-agreements --accept-source-agreements"; StatusMsg: "Instalando Claude Code…"; Flags: waituntilterminated runhidden; Check: FaltaClaude
Filename: "{app}\estudio\Iconic Studio.exe"; WorkingDir: "{app}\estudio"; Description: "Abrir Iconic Studio"; Flags: postinstall nowait skipifsilent

[Messages]
es.FinishedLabel=Listo. Al abrir Iconic Studio: escribe tu nombre y toca «Terminar de instalar». Claude termina de instalar el editor solo (10–20 minutos), con tu cuenta de Claude.

[Code]
var
  EditorYaEstaba: Boolean;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  { se decide antes de copiar nada: si el editor ya estaba, no se toca }
  if CurStep = ssInstall then
    EditorYaEstaba := FileExists(ExpandConstant('{app}\video-editor\CLAUDE.md'));
end;

function InstalarEditor: Boolean;
begin
  Result := not EditorYaEstaba;
end;

function Winget(Param: String): String;
begin
  Result := ExpandConstant('{localappdata}\Microsoft\WindowsApps\winget.exe');
end;

function FaltaGit: Boolean;
begin
  Result := not (FileExists(ExpandConstant('{commonpf64}\Git\bin\bash.exe')) or
                 FileExists(ExpandConstant('{localappdata}\Programs\Git\bin\bash.exe')));
  if Result and not FileExists(Winget('')) then Result := False;
end;

function FaltaClaude: Boolean;
var
  R: TFindRec;
begin
  Result := not (FileExists(ExpandConstant('{localappdata}\Microsoft\WinGet\Links\claude.exe')) or
                 FileExists(ExpandConstant('{%USERPROFILE}\.local\bin\claude.exe')));
  if Result and FindFirst(ExpandConstant('{localappdata}\Microsoft\WinGet\Packages\Anthropic.ClaudeCode*'), R) then
  begin
    Result := False;
    FindClose(R);
  end;
  if Result and not FileExists(Winget('')) then Result := False;
end;

function InitializeSetup: Boolean;
begin
  Result := True;
  if not FileExists(Winget('')) then
    MsgBox('Falta el «Instalador de aplicaciones» (winget) de Windows. Iconic Studio se instala igual, ' +
           'pero Git y Claude Code tendrás que instalarlos aparte (desde la Microsoft Store busca «App Installer»).',
           mbInformation, MB_OK);
end;
