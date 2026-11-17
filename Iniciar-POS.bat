@echo off
title Punto de Venta - Tienda Alina
cd /d "%~dp0"

:: Iniciar servidor local si no esta corriendo
netstat -ano | findstr ":4500" >nul
if errorlevel 1 (
    start /b "" node server.cjs --no-launch >nul 2>&1
    ping 127.0.0.1 -n 2 >nul
)

:: Perfil dedicado para el Punto de Venta (permite elegir impresora termica para tickets o de tinta para etiquetas)
set "POS_PROFILE=%LOCALAPPDATA%\PuntoDeVentaAlina"

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%POS_PROFILE%" --app="http://localhost:4500/login?pos=1&fresh=1"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --user-data-dir="%POS_PROFILE%" --app="http://localhost:4500/login?pos=1&fresh=1"
) else (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --user-data-dir="%POS_PROFILE%" --app="http://localhost:4500/login?pos=1&fresh=1"
)
exit
