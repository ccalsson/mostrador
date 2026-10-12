@echo off
setlocal
rem Si se ejecuta desde la carpeta instalada, delegar en una copia en %TEMP%
rem para poder borrar la carpeta sin que cmd pierda el script en ejecucion.
if /I not "%~dp0"=="%LOCALAPPDATA%\Mostrador\" goto work
copy /Y "%~f0" "%TEMP%\Mostrador-desinstalar.cmd" >nul
start "" cmd /c "%TEMP%\Mostrador-desinstalar.cmd"
exit /b

:work
set DEST=%LOCALAPPDATA%\Mostrador
rmdir /S /Q "%DEST%" 2>nul
del /Q "%USERPROFILE%\Desktop\Mostrador.lnk" 2>nul
del /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Mostrador.lnk" 2>nul
echo Mostrador desinstalado.
pause
