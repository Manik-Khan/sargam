@echo off
setlocal
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js on this host, then run this file again.
  pause
  exit /b 1
)

if not exist "%~dp0ffmpeg.exe" (
  echo Missing %~dp0ffmpeg.exe
  echo Copy ffmpeg.exe into this folder.
  pause
  exit /b 1
)

if not exist "%~dp0ffprobe.exe" (
  echo Missing %~dp0ffprobe.exe
  echo Copy ffprobe.exe into this folder.
  pause
  exit /b 1
)

echo Starting Sargam Waveform Worker...
node.exe "%~dp0sargam-waveform-worker.mjs"
echo.
echo The waveform worker stopped.
pause
