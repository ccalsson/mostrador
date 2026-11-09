@echo off
setlocal
if "%TORRE_SERVIDOR%"=="" set "TORRE_SERVIDOR=http://192.168.0.103:8080"
start "" "%~dp0build\windows\x64\runner\Debug\torre_flutter.exe"
