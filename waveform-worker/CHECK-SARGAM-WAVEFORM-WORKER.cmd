@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8091/health' -TimeoutSec 5; $r | ConvertTo-Json; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
pause
