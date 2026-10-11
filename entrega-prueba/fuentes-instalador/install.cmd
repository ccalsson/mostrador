@echo off
setlocal
set SRC=%~dp0Mostrador
set DEST=%LOCALAPPDATA%\Mostrador
if not exist "%SRC%\puesto_flutter.exe" (
  echo No se encontro la carpeta "Mostrador" junto a este instalador.
  echo Descomprimi todo el zip antes de ejecutar Instalar.cmd.
  pause
  exit /b 1
)
if not exist "%DEST%" mkdir "%DEST%"
xcopy /E /I /Y "%SRC%\*" "%DEST%\" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; $d=[Environment]::GetFolderPath('Desktop'); $s=$ws.CreateShortcut((Join-Path $d 'Mostrador.lnk')); $s.TargetPath=(Join-Path $env:LOCALAPPDATA 'Mostrador\puesto_flutter.exe'); $s.WorkingDirectory=(Join-Path $env:LOCALAPPDATA 'Mostrador'); $s.IconLocation=(Join-Path $env:LOCALAPPDATA 'Mostrador\puesto_flutter.exe'); $s.Save()"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; $m=[Environment]::GetFolderPath('StartMenu'); $p=Join-Path $m 'Programs'; if(-not(Test-Path $p)){mkdir $p|Out-Null}; $s=$ws.CreateShortcut((Join-Path $p 'Mostrador.lnk')); $s.TargetPath=(Join-Path $env:LOCALAPPDATA 'Mostrador\puesto_flutter.exe'); $s.WorkingDirectory=(Join-Path $env:LOCALAPPDATA 'Mostrador'); $s.Save()"
(
echo @echo off
echo rmdir /S /Q "%DEST%"
echo del /Q "%USERPROFILE%\Desktop\Mostrador.lnk" 2^>nul
echo del /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Mostrador.lnk" 2^>nul
echo echo Mostrador desinstalado.
echo pause
) > "%DEST%\Desinstalar.cmd"
echo.
echo Mostrador instalado en %DEST%
echo Acceso directo creado en el Escritorio y en el menu Inicio.
echo.
pause
