@echo off
title Punto de Venta - Tienda Alina
cd /d "%~dp0"

:: Iniciar servidor local
start /b "" node server.cjs >nul 2>&1
ping 127.0.0.1 -n 2 >nul

:: Abrir en modo aplicacion
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="http://localhost:4500/pos"
) else (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app="http://localhost:4500/pos"
)
exit
