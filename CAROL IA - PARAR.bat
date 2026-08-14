@echo off
chcp 65001 >nul
title Parar Carol IA
echo Parando a conexao local da Carol IA...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ps=Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'ollama-bridge\\.js' -and $_.Name -match 'node' }; foreach($p in $ps){ Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }"
echo Conexao parada. O Ollama nao sera fechado para nao interferir em outros programas.
timeout /t 2 /nobreak >nul
