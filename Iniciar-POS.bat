@echo off
title Punto de Venta - Tienda Alina
cd /d "%~dp0"

:: Iniciar servidor local
start /b "" node server.cjs >nul 2>&1
ping 127.0.0.1 -n 2 >nul

:: Abrir en modo aplicacion con impresion directa/silenciosa (--kiosk-printing)
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --app="http://localhost:4500/login?pos=1&fresh=1"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --kiosk-printing --app="http://localhost:4500/login?pos=1&fresh=1"
) else (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --app="http://localhost:4500/login?pos=1&fresh=1"
)
exit
