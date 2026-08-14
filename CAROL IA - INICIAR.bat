@echo off
setlocal
chcp 65001 >nul
title Carol IA
cd /d "%~dp0"

REM ============================================================
REM CAROL IA - UM CLIQUE
REM - inicia o Ollama se estiver fechado
REM - instala a ponte automaticamente na primeira vez
REM - conecta ao Render sem pedir URL nem .env
REM ============================================================

echo [Carol IA] Iniciando...

where ollama >nul 2>nul
if errorlevel 1 (
  echo.
  echo O Ollama nao foi encontrado neste PC.
  echo Instale o Ollama uma unica vez e depois use somente este arquivo.
  echo.
  pause
  exit /b 1
)

REM Testa se o Ollama ja esta respondendo. Se nao, abre minimizado.
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo [Carol IA] Abrindo Ollama...
  start "Carol IA - Ollama" /min cmd /c "set OLLAMA_MAX_LOADED_MODELS=1&& set OLLAMA_NUM_PARALLEL=1&& ollama serve"
)

REM Aguarda o Ollama ficar pronto.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; 1..30 | %% { if(-not $ok){ try { Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 | Out-Null; $ok=$true } catch { Start-Sleep -Milliseconds 500 } } }; if($ok){exit 0}else{exit 1}" >nul 2>nul
if errorlevel 1 (
  echo.
  echo [Carol IA] Nao consegui iniciar o Ollama.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo O Node.js nao foi encontrado neste PC.
  echo Ele e necessario apenas para a conexao da Carol com o Render.
  echo Instale o Node.js LTS uma unica vez e depois use somente este arquivo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\socket.io-client\package.json" (
  echo [Carol IA] Preparando a conexao pela primeira vez...
  call npm install --no-audit --no-fund >nul
  if errorlevel 1 (
    echo.
    echo [Carol IA] Falha ao preparar a conexao.
    pause
    exit /b 1
  )
)

REM Evita abrir duas pontes ao clicar duas vezes.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'ollama-bridge\\.js' -and $_.Name -match 'node' }; if($p){exit 0}else{exit 1}" >nul 2>nul
if errorlevel 1 (
  echo [Carol IA] Conectando ao Render...
  set "OLLAMA_KEEP_ALIVE=30m"
  start "Carol IA - Ponte" /min cmd /c node ollama-bridge.js ^>^> carol-ponte.log 2^>^&1
) else (
  echo [Carol IA] A conexao ja esta ativa.
)

echo.
echo ==============================================
echo  CAROL IA ESTA PRONTA
echo  Ela vai ler o chat e responder automaticamente.
echo  Pode fechar esta janela.
echo ==============================================
timeout /t 3 /nobreak >nul
exit /b 0
